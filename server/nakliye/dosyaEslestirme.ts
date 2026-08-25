import { storage } from "../storage";
import { firmaAdiBenzerligi } from "@shared/turkceNormalize";
import { konteynerAnahtarlari } from "@shared/konteyner";
import { ihracatRejimiMi } from "@shared/rejim";
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

  // TEK ADAY DA DOĞRULANIR — müşteri seçilmişse.
  //
  // Eskiden tek satır koşulsuz kabul ediliyordu ve canlıda yanlış firmayı
  // faturaya yazdı (2026-08-25, dosya 26-12702): gümrük listesinde yalnız
  // PLASTİTEK'in İHRACAT satırı vardı; kullanıcı müşteri olarak ALBA seçmiş
  // olmasına rağmen tek aday diye PLASTİTEK alındı ve onun beyanname bilgileri
  // faturaya yazıldı. Tek aday olması doğru olduğu anlamına gelmez — veri
  // eksik de olabilir. Müşteri tutmuyorsa SEÇİM YAPMAYIZ.
  if (unvanlar.length <= 1) {
    const tekUnvan = unvanlar[0] || "";
    if (musteri?.trim() && tekUnvan && firmaAdiBenzerligi(musteri, tekUnvan) < FIRMA_ESIK) {
      return { kayit: null, adaylar: unvanlar };
    }
    return { kayit: satirlar[0], adaylar: unvanlar };
  }

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
  // NAKLİYE İTHALAT İŞİDİR — ihracat satırları aday DEĞİLDİR.
  //
  // Bir dosya numarası ithalat ve ihracat beyannamesini birlikte taşır. İhracat
  // satırı seçilirse hem yanlış firma hem yanlış beyanname bilgisi faturaya
  // yazılır. Canlıda oldu (26-12702): gümrük listesinde yalnız PLASTİTEK'in
  // ihracat satırı vardı, ithalat kaydı (ALBA) yalnız beyanname listesindeydi.
  // Filtre olmadan gümrük listesi "dolu" göründüğü için beyanname listesine
  // hiç bakılmıyordu.
  const gumrukHam = await storage.getGumrukVerileriByDosyaNo(dosyaNo);
  const gumrukSatirlari = gumrukHam.filter((g) => !ihracatRejimiMi(g.rejim));

  // 1) Gümrük ▸ Satışlar listesi. Tercih edilen kaynak: VKN ve konteyner
  //    sayısı yalnız burada var, ikisi de faturalamada kullanılıyor.
  if (gumrukSatirlari.length > 0) {
    const { kayit, adaylar } = firmaKir(gumrukSatirlari, (g) => g.firmaUnvan, musteri);
    if (!kayit) {
      return {
        alanlar: null,
        adaylar,
        mesaj: adaylar.length === 1
          ? `${dosyaNo} altındaki firma "${adaylar[0]}" seçtiğiniz müşteriyle uyuşmuyor. ` +
            `Dosya numarası doğru mu?`
          : `${dosyaNo} altında ${adaylar.length} farklı firma var. ` +
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
  const beyannameHam = await storage.getBeyannamelerByDosyaNo(dosyaNo);
  const beyannameSatirlari = beyannameHam.filter((b) => !ihracatRejimiMi(b.rejim));
  if (beyannameSatirlari.length > 0) {
    const { kayit, adaylar } = firmaKir(beyannameSatirlari, (b) => b.alici, musteri);
    if (!kayit) {
      return {
        alanlar: null,
        adaylar,
        mesaj: adaylar.length === 1
          ? `${dosyaNo} altındaki firma "${adaylar[0]}" seçtiğiniz müşteriyle uyuşmuyor. ` +
            `Dosya numarası doğru mu?`
          : `${dosyaNo} altında ${adaylar.length} farklı firma var. ` +
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

  // Kayıt vardı ama hepsi ihracattı: kullanıcı "listede görüyorum ama sistem
  // bulmuyor" durumuna düşmesin diye sebebi açıkça söylenir.
  const yalnizIhracat = gumrukHam.length > 0 || beyannameHam.length > 0;
  return {
    alanlar: null,
    mesaj: yalnizIhracat
      ? `${dosyaNo} altında yalnız İHRACAT beyannamesi var ` +
        `(${[...gumrukHam.map((g) => g.firmaUnvan), ...beyannameHam.map((b) => b.alici)]
          .filter(Boolean).slice(0, 2).join(", ")}). ` +
        `Nakliye faturası ithalat işidir; bu dosyaya bağlanamaz.`
      : `${dosyaNo} ne gümrük satışlar listesinde ne beyanname listesinde bulunamadı`,
  };
}
