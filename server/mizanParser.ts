// server/mizanParser.ts
import * as XLSX from "xlsx";

export interface MizanRow {
  hesapKodu: string;
  doviz: string | null;
  hesapAdi: string;
  borc: number;
  alacak: number;
  bakiyeBorc: number;
  bakiyeAlacak: number;
  sonBakiye: number;
  sonBakiyeBA: "B" | "A";
  sonBorcTarihi: string | null;     // YYYY-MM-DD
  sonAlacakTarihi: string | null;
  grupKodu: string | null;
  problemli: boolean;
  limitTutar: number | null;
  firmaGrubu: string | null;
  sektor: string | null;
}

export interface MizanParseSonuc {
  mizanTarihi: string | null;
  satirlar: MizanRow[];
  toplamSatir: number;
  filtrelenenSatir: number;          // 120- ile başlamayan
  uyarilar: string[];
  toplamBorc: number;
  toplamAlacak: number;
}

// Çok formatlı sayı parser:
//   1234.56 (number) | "1.234,56" (TR) | "1,234.56" (US) | "₺1.234,56" | "1234,56 TL" → 1234.56
function parseNum(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (!s) return 0;
  // Para birimi simgeleri ve metin etiketlerini temizle (₺, $, €, TL, USD, EUR, vb)
  s = s.replace(/[₺$€£¥]/g, "").replace(/\b(TL|USD|EUR|GBP|TRY)\b/gi, "").trim();
  // Negatif: parantez "(1.234,56)" → "-1.234,56"
  if (/^\(.*\)$/.test(s)) s = "-" + s.slice(1, -1).trim();
  if (!s) return 0;
  // TR: nokta binlik, virgül ondalık → "1.234,56" → "1234.56"
  if (s.includes(",") && s.includes(".")) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  // Beyaz boşlukları temizle (1 234,56 stiline karşı)
  s = s.replace(/\s+/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Çok formatlı tarih parser:
//   Date obj | Excel serial number (45693) | "dd.mm.yyyy" | "dd/mm/yyyy" | "dd-mm-yyyy"
//   "yyyy-mm-dd" | "yyyy/mm/dd" | "dd.mm.yy" | "6 Şubat 2026" → "YYYY-MM-DD"
function parseTarih(v: any): string | null {
  if (v == null || v === "") return null;

  // Date object (cellDates: true ile gelen)
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Excel serial number — number olarak gelirse (cellDates: false durumunda)
  // Excel epoch: 1900-01-01 = 1, ama 1900-02-29 hatası nedeniyle offset 25569 kullanılır
  if (typeof v === "number" && v > 0 && v < 100000) {
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
  }

  const s = String(v).trim();
  if (!s) return null;

  // dd[./-]mm[./-]yyyy (4-haneli yıl)
  const m1 = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (m1) {
    const dd = m1[1].padStart(2, "0");
    const mm = m1[2].padStart(2, "0");
    return `${m1[3]}-${mm}-${dd}`;
  }
  // yyyy[./-]mm[./-]dd (4-haneli yıl başta)
  const m2 = s.match(/^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})/);
  if (m2) {
    const mm = m2[2].padStart(2, "0");
    const dd = m2[3].padStart(2, "0");
    return `${m2[1]}-${mm}-${dd}`;
  }
  // dd[./-]mm[./-]yy (2-haneli yıl) — 50+ → 19xx, 50- → 20xx
  const m3 = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2})$/);
  if (m3) {
    const dd = m3[1].padStart(2, "0");
    const mm = m3[2].padStart(2, "0");
    const yy = parseInt(m3[3], 10);
    const fullYear = yy >= 50 ? 1900 + yy : 2000 + yy;
    return `${fullYear}-${mm}-${dd}`;
  }
  // "6 Şubat 2026" / "6 Subat 2026" / "06 Şub 2026"
  const aylar: Record<string, string> = {
    ocak: "01", oca: "01", subat: "02", şubat: "02", sub: "02", şub: "02",
    mart: "03", mar: "03", nisan: "04", nis: "04", mayis: "05", mayıs: "05", may: "05",
    haziran: "06", haz: "06", temmuz: "07", tem: "07", agustos: "08", ağustos: "08", agu: "08", ağu: "08",
    eylul: "09", eylül: "09", eyl: "09", ekim: "10", eki: "10",
    kasim: "11", kasım: "11", kas: "11", aralik: "12", aralık: "12", ara: "12",
  };
  const m4 = s.toLocaleLowerCase("tr").match(/^(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})$/);
  if (m4 && aylar[m4[2]]) {
    const dd = m4[1].padStart(2, "0");
    return `${m4[3]}-${aylar[m4[2]]}-${dd}`;
  }
  // "Sun Feb 06 2026 ..." gibi JS Date.toString çıktısı (fallback)
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime()) && fallback.getFullYear() > 1900 && fallback.getFullYear() < 2100) {
    const y = fallback.getFullYear();
    const m = String(fallback.getMonth() + 1).padStart(2, "0");
    const d = String(fallback.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

function tahminMizanTarihi(filename: string): string | null {
  // "mizan 08022026.xlsx" → "2026-02-08"
  const m = filename.match(/(\d{2})(\d{2})(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseMizanXlsx(buffer: Buffer, filename = ""): MizanParseSonuc {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  // "Hesap Mizanı" sheet'i tercih et, yoksa ilki
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("mizan")) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return { mizanTarihi: null, satirlar: [], toplamSatir: 0, filtrelenenSatir: 0, uyarilar: ["Sheet bulunamadı"], toplamBorc: 0, toplamAlacak: 0 };
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: "A", raw: false });
  const uyarilar: string[] = [];
  const satirlar: MizanRow[] = [];
  let toplamSatir = 0;
  let filtrelenenSatir = 0;
  let toplamBorc = 0;
  let toplamAlacak = 0;

  // İlk satır header — atla
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as any;
    const hesapKodu = String(r.A ?? "").trim();
    if (!hesapKodu) continue; // boş satır
    toplamSatir++;
    if (!hesapKodu.startsWith("120")) {
      filtrelenenSatir++;
      continue;
    }
    const hesapAdi = String(r.C ?? "").trim();
    if (!hesapAdi) {
      uyarilar.push(`Satır ${i + 1}: hesap adı boş (${hesapKodu})`);
      continue;
    }

    const borc = parseNum(r.F);
    const alacak = parseNum(r.G);
    const bakiyeBorc = parseNum(r.H);
    const bakiyeAlacak = parseNum(r.I);
    let sonBakiye = parseNum(r.J);
    let sonBakiyeBA = (String(r.K ?? "").trim().toUpperCase() || "B") as "B" | "A";

    // K boşsa H/I'dan türet
    if (!r.K) {
      if (bakiyeBorc > 0) { sonBakiyeBA = "B"; if (!sonBakiye) sonBakiye = bakiyeBorc; }
      else if (bakiyeAlacak > 0) { sonBakiyeBA = "A"; if (!sonBakiye) sonBakiye = bakiyeAlacak; }
    }

    toplamBorc += borc;
    toplamAlacak += alacak;

    satirlar.push({
      hesapKodu,
      doviz: r.B ? String(r.B).trim() : null,
      hesapAdi,
      borc,
      alacak,
      bakiyeBorc,
      bakiyeAlacak,
      sonBakiye,
      sonBakiyeBA,
      sonBorcTarihi: parseTarih(r.L),
      sonAlacakTarihi: parseTarih(r.M),
      grupKodu: r.N ? String(r.N).trim() : null,
      problemli: r.O ? String(r.O).toUpperCase().startsWith("E") || String(r.O) === "1" : false,
      limitTutar: r.P ? parseNum(r.P) : null,
      firmaGrubu: r.R ? String(r.R).trim() : null,
      sektor: r.S ? String(r.S).trim() : null,
    });
  }

  if (filtrelenenSatir > 0) {
    uyarilar.push(`${filtrelenenSatir} satır filtrelendi (120- ile başlamıyordu)`);
  }

  return {
    mizanTarihi: tahminMizanTarihi(filename),
    satirlar,
    toplamSatir,
    filtrelenenSatir,
    uyarilar,
    toplamBorc,
    toplamAlacak,
  };
}
