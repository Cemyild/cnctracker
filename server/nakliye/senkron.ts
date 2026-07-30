import { storage } from "../storage";
import { parasutAktifMi } from "../parasut/client";
import { parasuttanCek } from "./parasutOkuma";
import { parasutaYaz } from "./parasutYazma";
import { eslestirmeCalistir } from "./eslestirme";
import { tamamlananDosyalariFaturala } from "./satisFaturasi";

export type SenkronSonuc = {
  cekilen: { yeni: number; atlanan: number };
  parasutaYazilan: { basarili: number; mevcuttu: number; hatali: number };
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

    // 2) e-Arşiv faturalarını Paraşüt'e yaz.
    // Yalnızca doğrulamayı geçmiş (durum='ayristirildi') ve henüz Paraşüt'e
    // yazılmamış olanlar. Doğrulama hatası olanlar kasıtlı olarak atlanır —
    // yanlış tutarlı fatura muhasebeye girmemeli.
    const yazilacaklar = (await storage.getNakliyeFaturalari("ayristirildi"))
      .filter((f) => f.kaynak === "earsiv" && !f.parasutPurchaseBillId);

    let basarili = 0;
    let mevcuttu = 0;
    let hatali = 0;

    for (const f of yazilacaklar) {
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
      parasutaYazilan: { basarili, mevcuttu, hatali },
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
