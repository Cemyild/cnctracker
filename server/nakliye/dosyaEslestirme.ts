import { storage } from "../storage";
import { firmaAdiBenzerligi } from "@shared/turkceNormalize";
import { konteynerAnahtarlari } from "@shared/konteyner";
import { tarihGoster } from "./tarih";
import type { InsertNakliyeVerisi } from "@shared/schema";

/**
 * ELLE DOSYA NO EŞLEŞTİRMESİ.
 *
 * Neden gerekli: otomatik eşleştirme yalnızca konteyner numarası üzerinden
 * çalışıyor. Bazı navlun faturalarında hiç konteyner numarası yok
 * ("GEMLİK RODA LİMAN - BURSA NAKLİYE BEDELİ" gibi) ve o faturalar hiçbir
 * zaman kendiliğinden eşleşemez. Kullanıcı dosya numarasını biliyorsa
 * eşleşmeyi elle kurabilmeli.
 *
 * Bu fonksiyon dosya numarasını gümrük/beyanname listesinde arar ve mor
 * kutunun TÜM alanlarını oradan doldurur. Yalnız dosya no yazmak yetmez:
 * firma unvanı boş kalırsa faturalama "ne VKN ne firma unvanı var" diye durur
 * ve kullanıcı neden durduğunu anlamaz.
 */

/** Firma adı benzerliğinin kırıcı sayılması için gereken en düşük puan. */
const FIRMA_ESIK = 70;

export type DosyaEslesmeSonucu = {
  /** Yazılacak alanlar; null ise eşleştirme yapılamadı. */
  alanlar: Partial<InsertNakliyeVerisi> | null;
  mesaj: string;
  /** Birden çok firma adayı varsa kullanıcıya gösterilecek liste. */
  adaylar?: string[];
};

/**
 * Aynı dosya numarasında birden çok firma satırı olabilir (canlıda görüldü:
 * 26-10359 → ENYTEKS + FEKA). Tek firma varsa o seçilir; birden çoksa müşteri
 * adıyla kırılır. Kıramazsak SEÇİM YAPMAYIZ — yanlış firmaya fatura kesmek
 * geri alınması zor bir hatadır, kullanıcıya adayları gösterip müşteriyi
 * seçmesini istemek çok daha güvenli.
 */
function firmaKir<T>(
  satirlar: T[],
  unvanAl: (s: T) => string | null,
  musteri: string | null,
): { kayit: T | null; adaylar: string[] } {
  const unvanlar = Array.from(
    new Set(satirlar.map((s) => String(unvanAl(s) ?? "").trim()).filter(Boolean)),
  );

  if (satirlar.length === 1) return { kayit: satirlar[0], adaylar: unvanlar };
  if (unvanlar.length <= 1) return { kayit: satirlar[0], adaylar: unvanlar };

  if (musteri && musteri.trim()) {
    const puanli = satirlar
      .map((s) => ({ s, p: firmaAdiBenzerligi(musteri, unvanAl(s) || "") }))
      .sort((a, b) => b.p - a.p);
    const kazanan = puanli[0];
    const ikinci = puanli[1];
    if (kazanan.p >= FIRMA_ESIK && (!ikinci || kazanan.p > ikinci.p)) {
      return { kayit: kazanan.s, adaylar: unvanlar };
    }
  }

  return { kayit: null, adaylar: unvanlar };
}

export async function dosyaNoIleEslestir(
  dosyaNo: string,
  musteri: string | null,
): Promise<DosyaEslesmeSonucu> {
  // 1) Gümrük ▸ Satışlar listesi. Tercih edilen kaynak: VKN ve konteyner
  //    sayısı yalnız burada var, ikisi de faturalamada kullanılıyor.
  const gumrukSatirlari = await storage.getGumrukVerileriByDosyaNo(dosyaNo);
  if (gumrukSatirlari.length > 0) {
    const { kayit, adaylar } = firmaKir(gumrukSatirlari, (g) => g.firmaUnvan, musteri);
    if (!kayit) {
      return {
        alanlar: null,
        adaylar,
        mesaj:
          `${dosyaNo} altında ${adaylar.length} farklı firma var. ` +
          `Önce Müşteri alanından doğru firmayı seçip tekrar kaydedin.`,
      };
    }
    return {
      alanlar: {
        ilgiliDosyaNo: dosyaNo,
        gumrukFirmaUnvan: kayit.firmaUnvan,
        gumrukAdi: kayit.gumruk,
        gumrukDovizKiymeti: kayit.dovizKiymeti != null ? String(kayit.dovizKiymeti) : null,
        gumrukDovizCinsi: kayit.doviz,
        gumrukTescilNo: kayit.tescilNo,
        gumrukTescilTarihi: tarihGoster(kayit.tescilTarihi) || null,
        eslesenHouseNo: konteynerAnahtarlari(kayit.houseNo)[0] ?? null,
        // Müşteri beyannamedeki RESMÎ unvandır — faturada bu görünür.
        ...(kayit.firmaUnvan ? { musteri: kayit.firmaUnvan } : {}),
      },
      adaylar,
      mesaj: `${dosyaNo} eşleştirildi: ${kayit.firmaUnvan || "(unvan boş)"}`,
    };
  }

  // 2) Beyanname listesi (Ödemeler ▸ Beyanname yüklemesi). VKN taşımaz;
  //    müşteri cari eşleşmesi unvan üzerinden kurulur.
  const beyannameSatirlari = await storage.getBeyannamelerByDosyaNo(dosyaNo);
  if (beyannameSatirlari.length > 0) {
    const { kayit, adaylar } = firmaKir(beyannameSatirlari, (b) => b.alici, musteri);
    if (!kayit) {
      return {
        alanlar: null,
        adaylar,
        mesaj:
          `${dosyaNo} altında ${adaylar.length} farklı firma var. ` +
          `Önce Müşteri alanından doğru firmayı seçip tekrar kaydedin.`,
      };
    }
    return {
      alanlar: {
        ilgiliDosyaNo: dosyaNo,
        gumrukFirmaUnvan: kayit.alici,
        gumrukAdi: kayit.gumrukIdaresi,
        gumrukDovizKiymeti: kayit.fatBedeli != null ? String(kayit.fatBedeli) : null,
        gumrukDovizCinsi: kayit.doviz,
        gumrukTescilNo: kayit.beyanNo,
        gumrukTescilTarihi: tarihGoster(kayit.beyanTarihi) || null,
        eslesenHouseNo: konteynerAnahtarlari(kayit.konteynerler)[0] ?? null,
        ...(kayit.alici ? { musteri: kayit.alici } : {}),
      },
      adaylar,
      mesaj: `${dosyaNo} beyanname listesinden eşleştirildi: ${kayit.alici || "(alıcı boş)"}`,
    };
  }

  return {
    alanlar: null,
    mesaj: `${dosyaNo} ne gümrük satışlar listesinde ne beyanname listesinde bulunamadı`,
  };
}
