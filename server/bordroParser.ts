import { PDFParse } from "pdf-parse";

// Mevcut subeler dizisindeki kanonik isimler (shared/schema.ts ile uyumlu)
const SUBE_BURSA = "Bursa";
const SUBE_ISTANBUL_ERENKOY = "İstanbul - Erenköy";
const SUBE_GEMLIK = "Gemlik";
const SUBE_YONETIM = "Yönetim";

export type CalisanStatuLite = "NORMAL" | "EMEKLİ" | "YÖNETİCİ";

export interface MaasSatiri {
  sira: number;
  tcNo: string;
  adSoyad: string;
  netTutar: number;
  iban?: string;
  telefon?: string;
  // Sayfa düzeyinden devralınan alanlar
  sube: string;
  statu: CalisanStatuLite;
}

export interface MaasSayfasi {
  sayfaNo: number;
  firmaUnvani: string;
  sgkIsyeriNo: string | null; // null = yönetici sayfası
  adres: string;
  sube: string;
  statu: CalisanStatuLite;
  satirlar: MaasSatiri[];
  toplam: number; // PDF'in altındaki "TOPLAM :" rakamı
}

export interface MaasListesiSonuc {
  ay: number; // 1-12
  yil: number;
  sayfalar: MaasSayfasi[];
  tumSatirlar: MaasSatiri[];
  // Sanity check için PDF'teki toplamların kümülatifi
  toplamKisi: number;
  toplamNet: number;
}

// Türkçe locale rakamı parse: "1.234,56" -> 1234.56
function parseTryNumber(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Sayfa başlığı + adres metninden şube tahmini.
// Mantık:
//   - SGK İşyeri No yoksa → her zaman Yönetim (statu = YÖNETİCİ)
//   - "GEMLİK" → Gemlik
//   - "İSTANBUL" / "ATAŞEHİR" / "İSTANBUL ŞUBESİ" → İstanbul - Erenköy
//   - "AKPINAR" / "OSMANGAZİ" (default Bursa merkez) → Bursa
function tahminSubeStatu(
  firmaUnvani: string,
  adres: string,
  sgkIsyeriNo: string | null,
): { sube: string; statu: CalisanStatuLite } {
  if (!sgkIsyeriNo) {
    return { sube: SUBE_YONETIM, statu: "YÖNETİCİ" };
  }
  const hay = (firmaUnvani + " " + adres).toLocaleUpperCase("tr");
  if (hay.includes("GEMLİK") || hay.includes("GEMLIK")) {
    return { sube: SUBE_GEMLIK, statu: "NORMAL" };
  }
  if (
    hay.includes("İSTANBUL") ||
    hay.includes("ISTANBUL") ||
    hay.includes("ATAŞEHİR") ||
    hay.includes("ATASEHIR")
  ) {
    return { sube: SUBE_ISTANBUL_ERENKOY, statu: "NORMAL" };
  }
  // Default: Bursa merkez (Akpınar/Osmangazi)
  return { sube: SUBE_BURSA, statu: "NORMAL" };
}

// Türkçe ay adından ay numarasına çevir (büyük/küçük harf, aksanlı/aksansız tolere eder)
function ayAdiToNumara(ad: string): number | null {
  const aylar: Record<string, number> = {
    OCAK: 1, SUBAT: 2, ŞUBAT: 2, MART: 3, NISAN: 4, NİSAN: 4,
    MAYIS: 5, HAZIRAN: 6, HAZİRAN: 6, TEMMUZ: 7, AGUSTOS: 8, AĞUSTOS: 8,
    EYLUL: 9, EYLÜL: 9, EKIM: 10, EKİM: 10, KASIM: 11, ARALIK: 12,
  };
  return aylar[ad.toLocaleUpperCase("tr")] ?? null;
}

// PDF'in başlığından ay/yıl çıkar.
// Maaş Listesi formatı: "Bordro Ay/Yıl : 1 / 2026"
// Yedek format: "OCAK / 2026 ..." veya "OCAK 2026"
function parseAyYil(text: string): { ay: number; yil: number } {
  // 1. Standart maaş listesi başlığı
  const m1 = text.match(/Bordro\s*Ay\s*\/\s*Y[ıi]l\s*:\s*(\d{1,2})\s*\/\s*(\d{4})/i);
  if (m1) {
    const ay = parseInt(m1[1], 10);
    const yil = parseInt(m1[2], 10);
    if (ay >= 1 && ay <= 12 && yil >= 2020 && yil <= 2100) {
      return { ay, yil };
    }
  }

  // 2. Eğer içerik bir BORDRO PDF'i gibi görünüyorsa (yanlış dosya), yardımcı hata at
  if (/ÜCRET\s+BORDROSU/i.test(text) || /Brüt\s+Ücret/i.test(text)) {
    throw new Error(
      "Bu PDF bir 'Ücret Bordrosu' (vergi dahil detay) gibi görünüyor — Maaş Listesi PDF'i değil. " +
      "Lütfen 'Personel Maaş Listesi' başlıklı PDF'i (sadece net ödeme listesi) yükleyin. " +
      "Detaylı bordroyu 'Bordro Arşivi' bölümünden yükleyebilirsiniz.",
    );
  }

  // 3. Yedek: "NİSAN / 2026" veya "NİSAN 2026" gibi ay adı + yıl
  const m2 = text.match(/(OCAK|ŞUBAT|SUBAT|MART|NİSAN|NISAN|MAYIS|HAZİRAN|HAZIRAN|TEMMUZ|AĞUSTOS|AGUSTOS|EYLÜL|EYLUL|EKİM|EKIM|KASIM|ARALIK)\s*[\/\s]\s*(\d{4})/i);
  if (m2) {
    const ay = ayAdiToNumara(m2[1]);
    const yil = parseInt(m2[2], 10);
    if (ay && yil >= 2020 && yil <= 2100) {
      return { ay, yil };
    }
  }

  throw new Error(
    "PDF'in başlığında ay/yıl bilgisi bulunamadı. Beklenen: 'Bordro Ay/Yıl : <ay> / <yıl>'. " +
    "Bu PDF doğru bir Maaş Listesi olmayabilir.",
  );
}

// Bir sayfa metnindeki personel satırlarını parse eder.
// Beklenen format (tab-separated, pdf-parse v2 çıktısı):
//   "AD SOYAD\tTC11\t SIRA TUTAR\tIBAN"
//   bazı varyantlarda telefon TC ile aynı hücrede, IBAN olmayabilir.
//
// Örnek:
//   "ONUR KARADAĞ\t34168169064\t1 100.000,00\tTR2200062001..."
//   "HARUN SUNDUK\t25624468456 5387909987\t1 75.400,00\tTR58..."
function parseSayfaSatirlari(
  sayfaText: string,
  sube: string,
  statu: CalisanStatuLite,
): MaasSatiri[] {
  const lines = sayfaText.split("\n");
  const satirlar: MaasSatiri[] = [];

  // Personel satırı regex'i — TC 11 hane, opsiyonel telefon, sıra + tutar, opsiyonel IBAN
  // Esnek: tab veya çoklu boşluk
  const SATIR = /^(.+?)[\s\t]+(\d{11})(?:\s+(\d{10,11}))?[\s\t]+(\d+)\s+([\d.,]+)(?:[\s\t]+(TR[\d\s]+))?\s*$/;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // "TOPLAM :" satırı sayfa sonu
    if (/^TOPLAM\s*:/i.test(line)) break;

    // Başlık satırlarını atla
    if (
      line.startsWith("S.No") ||
      line.startsWith("Firma") ||
      line.startsWith("Vergi") ||
      line.startsWith("SGK") ||
      line.startsWith("Adres") ||
      line.startsWith("Personel") ||
      line.startsWith("Bordro") ||
      line === "basla"
    ) {
      continue;
    }

    const m = line.match(SATIR);
    if (!m) continue;

    const adSoyad = m[1].trim();
    const tcNo = m[2];
    const telefon = m[3] || undefined;
    const sira = parseInt(m[4], 10);
    const netTutar = parseTryNumber(m[5]);
    const iban = m[6] ? m[6].replace(/\s+/g, "") : undefined;

    if (!adSoyad || !tcNo || !Number.isFinite(netTutar)) continue;

    satirlar.push({ sira, tcNo, adSoyad, netTutar, iban, telefon, sube, statu });
  }

  return satirlar;
}

// Bir sayfanın metninden meta bilgileri (firma, sgk, adres) çıkarır.
function parseSayfaMeta(sayfaText: string): {
  firmaUnvani: string;
  sgkIsyeriNo: string | null;
  adres: string;
} {
  const lines = sayfaText.split("\n").map((l) => l.trim());
  let firmaUnvani = "";
  let sgkIsyeriNo: string | null = null;
  let adres = "";

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    // "CNC GÜMRÜK MÜŞAVİRLİĞİ ..." — firma adı (vergi dairesi satırından önce)
    if (!firmaUnvani && /^CNC GÜMRÜK/i.test(l)) {
      firmaUnvani = l;
    }

    // "SGK İşyeri No : 25226010..."  veya  "SGK İşyeri No :"  (boş)
    if (l.startsWith("SGK İşyeri No") || l.startsWith("SGK Işyeri No")) {
      const m = l.match(/SGK\s+İ?[şs]yeri\s+No\s*:\s*(\S+)?/i);
      sgkIsyeriNo = m && m[1] ? m[1] : null;
    }

    // Adres: pdf-parse çıktısında "...adres metni...\tAdres :" formatında geliyor
    if (l.endsWith("Adres :") || l.includes("\tAdres :")) {
      adres = l.replace(/\t?Adres\s*:\s*$/, "").trim();
    } else if (l.startsWith("Adres :")) {
      adres = l.replace(/^Adres\s*:\s*/, "").trim();
    }
  }

  return { firmaUnvani, sgkIsyeriNo, adres };
}

// PDF'i sayfalara böler. pdf-parse v2 sayfaları "-- N of M --" ile ayırır.
function bolSayfalar(text: string): string[] {
  const parts = text.split(/--\s*\d+\s+of\s+\d+\s*--/);
  // Son boş elemanı temizle
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Maaş Listesi PDF'ini parse eder.
 * pdf-parse v2 PDFParse class'ını kullanır.
 *
 * Şube tespiti tamamen sayfa başlıklarından otomatik yapılır:
 *   - "MUDANYA" / SGK No yok → Yönetim (statu = YÖNETİCİ)
 *   - "GEMLİK" → Gemlik
 *   - "İSTANBUL" / "ATAŞEHİR" → İstanbul - Erenköy
 *   - Diğer (default Akpınar/Osmangazi) → Bursa
 *
 * Eğer kullanıcı UI'de manuel düzeltme yapmak isterse, dönen sonuç
 * üzerinde sube/statu alanlarını override edebilir.
 */
export async function parseMaasListesiPdf(
  buffer: Buffer,
): Promise<MaasListesiSonuc> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const fullText = result.text || "";

  if (!fullText.trim()) {
    throw new Error("PDF metni boş — taranmış (görsel) PDF olabilir, OCR gerekir.");
  }

  // Ay/Yıl PDF'in herhangi bir sayfasından çekilebilir
  const { ay, yil } = parseAyYil(fullText);

  const sayfaTextleri = bolSayfalar(fullText);
  if (sayfaTextleri.length === 0) {
    throw new Error("PDF'de sayfa bulunamadı.");
  }

  const sayfalar: MaasSayfasi[] = [];
  const tumSatirlar: MaasSatiri[] = [];

  for (let i = 0; i < sayfaTextleri.length; i++) {
    const sayfaText = sayfaTextleri[i];
    const meta = parseSayfaMeta(sayfaText);
    const { sube, statu } = tahminSubeStatu(
      meta.firmaUnvani,
      meta.adres,
      meta.sgkIsyeriNo,
    );

    const satirlar = parseSayfaSatirlari(sayfaText, sube, statu);

    // Sayfa altındaki "TOPLAM :" rakamı
    const toplamMatch = sayfaText.match(/TOPLAM\s*:\s*([\d.,]+)/i);
    const toplam = toplamMatch ? parseTryNumber(toplamMatch[1]) : 0;

    sayfalar.push({
      sayfaNo: i + 1,
      firmaUnvani: meta.firmaUnvani,
      sgkIsyeriNo: meta.sgkIsyeriNo,
      adres: meta.adres,
      sube,
      statu,
      satirlar,
      toplam,
    });

    tumSatirlar.push(...satirlar);
  }

  const toplamNet = tumSatirlar.reduce((acc, s) => acc + s.netTutar, 0);

  return {
    ay,
    yil,
    sayfalar,
    tumSatirlar,
    toplamKisi: tumSatirlar.length,
    toplamNet,
  };
}

// Ay numarasını mevcut sistemin Türkçe key'ine çevir
// (calisanlar.ay alanı bu format'ta saklanıyor)
export function ayNumaraToKey(ay: number): string {
  const ayKeyleri = [
    "ocak",
    "subat",
    "mart",
    "nisan",
    "mayis",
    "haziran",
    "temmuz",
    "agustos",
    "eylul",
    "ekim",
    "kasim",
    "aralik",
  ];
  const idx = ay - 1;
  if (idx < 0 || idx >= ayKeyleri.length) {
    throw new Error(`Geçersiz ay: ${ay}`);
  }
  return ayKeyleri[idx];
}
