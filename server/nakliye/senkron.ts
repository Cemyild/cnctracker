import { storage } from "../storage";
import { parasutAktifMi } from "../parasut/client";
import { parasuttanCek } from "./parasutOkuma";
import { parasutaYaz, parasuttaVarMi } from "./parasutYazma";
import { eslestirmeCalistir } from "./eslestirme";
import { tamamlananDosyalariFaturala } from "./satisFaturasi";

export type SenkronSonuc = {
  cekilen: { yeni: number; atlanan: number };
  /** elleBekleyen: e-Fatura, Paraşüt'te "İçeri Al" ile aktarılması bekleniyor. */
  parasutaYazilan: { basarili: number; mevcuttu: number; hatali: number; elleBekleyen: number };
  eslestirme: { taranan: number; eslesen: number; kuyruk: number };
  faturalama: { olusturulan: number; kuyruk: number; hatalar: string[] };
};

let calisiyorMu = false;

/**
 * Nakliye boru hattının tamamını sırayla çalıştırır.
 *
 * 1) Paraşüt'teki alış faturalarını çek (e-Fatura kanalı) + e-belge PDF'leri
 * 2) Doğrulamayı geçmiş e-Arşiv faturalarını Paraşüt'e alış faturası olarak yaz
 * 3) Beyanname/transit eşleştirmesini çalıştır
 * 4) Tamamlanan dosyalar için müşteriye satış faturası TASLAĞI oluştur
 *
 * RESMİLEŞTİRME YAPILMAZ. e_invoices / e_archives çağrılmaz, GİB'e hiçbir şey
 * gönderilmez — bu adım kasıtlı olarak kullanıcıda kalır. Sistemin
 * yapabileceği en ileri şey Paraşüt'te "taslak" durumunda kayıt bırakmaktır;
 * hepsi geri alınabilir (DELETE / cancel).
 *
 * Her adım idempotenttir: kesinti olursa bir sonraki tur kaldığı yerden
 * devam eder. Eşzamanlı çalışma engellenir (LLM ve Paraşüt çağrılarının
 * iki kez yapılmaması için).
 */
export async function senkronCalistir(): Promise<SenkronSonuc> {
  if (calisiyorMu) throw new Error("Senkron zaten çalışıyor");
  calisiyorMu = true;

  try {
    // 1) Paraşüt'ten çek
    const cekilen = await parasuttanCek(60);

    // 2) Alış tarafını Paraşüt ile hizala.
    //
    // BELGE TİPİ YAZIP YAZMAYACAĞIMIZI BELİRLER — kanal değil:
    //   e-Arşiv     → Paraşüt'e HİÇ düşmez, sistem yazar
    //   e-Fatura    → Paraşüt'ün gelen kutusuna düşer ve kullanıcı "İçeri Al"
    //                 ile carilere kaydeder. SİSTEM YAZMAZ; yalnızca ARAR ve
    //                 kullanıcı aktardıysa kaydı bağlar (rozet yeşile döner).
    //   bilinmiyor  → dokunulmaz (fail-closed)
    //
    // Gerekçe: eski kural kanala bakıyordu ("mailden geldiyse e-Arşiv'dir").
    // Tedarikçiler e-Fatura'larını da mail ile gönderdiği için sistem onları
    // da yazdı ve Paraşüt'te 9 mükerrer kayıt oluştu (2026-07-31, kullanıcı
    // sildi). Mükerrer fatura muhasebede gerçek bir hata; bekleyen rozet
    // değil.
    //
    // Ölçüt PARAŞÜT KAYDI YOKLUĞU'dur, durum değil: durum eşleştirme/faturalama
    // adımlarında da değişiyor ('eslesti', 'faturalandi').
    // Doğrulaması düşmüş faturalar KASITLI olarak atlanır.
    const hizalanacaklar = (await storage.getNakliyeFaturalari()).filter(
      (f) => f.kaynak === "earsiv"
        && !f.parasutPurchaseBillId
        && f.durum !== "dogrulama_hatasi"
        && f.durum !== "revizyon_gerekli",
    );

    let basarili = 0;
    let mevcuttu = 0;
    let hatali = 0;
    let elleBekleyen = 0;

    for (const f of hizalanacaklar) {
      // e-Arşiv DIŞINDAKİ hiçbir belge Paraşüt'e YAZILMAZ.
      if (f.belgeTipi !== "earsiv") {
        // Tarihsiz kayıtta arama penceresi kurulamaz; elle aktarım beklenir.
        if (!f.faturaTarihi) { elleBekleyen++; continue; }
        try {
          const mevcutId = await parasuttaVarMi(f.faturaNo, f.faturaTarihi);
          if (mevcutId) {
            await storage.updateNakliyeFaturasi(f.id, {
              parasutPurchaseBillId: mevcutId,
              durum: "parasutta",
              hataMesaji: null,
            });
            mevcuttu++;
          } else {
            elleBekleyen++;
          }
        } catch (e) {
          console.error(
            `Paraşüt araması başarısız (${f.faturaNo}):`,
            e instanceof Error ? e.message : e,
          );
          elleBekleyen++;
        }
        continue;
      }

      try {
        const r = await parasutaYaz(f);
        await storage.updateNakliyeFaturasi(f.id, {
          parasutPurchaseBillId: r.purchaseBillId,
          durum: "parasutta",
          hataMesaji: r.mevcuttu ? "Paraşüt'te elle girilmiş kayda bağlandı" : null,
        });
        if (r.mevcuttu) mevcuttu++; else basarili++;
      } catch (e) {
        const mesaj = e instanceof Error ? e.message : "Bilinmeyen hata";
        await storage.updateNakliyeFaturasi(f.id, {
          durum: "hata",
          hataMesaji: mesaj.slice(0, 500),
        });
        hatali++;
      }
    }

    // 3) Eşleştir
    const eslestirme = await eslestirmeCalistir();

    // 4) Satış faturası taslakları
    const faturalama = await tamamlananDosyalariFaturala();

    return {
      cekilen,
      parasutaYazilan: { basarili, mevcuttu, hatali, elleBekleyen },
      eslestirme,
      faturalama,
    };
  } finally {
    calisiyorMu = false;
  }
}

/** Kimlik bilgileri tam mı? Cron/uç bunu kontrol edip fail-closed davranır. */
export function senkronHazirMi(): boolean {
  return parasutAktifMi();
}
