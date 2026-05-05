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

// "1.234,56" / "1234.56" / 1234.56 → number
function parseNum(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (!s) return 0;
  // TR: nokta binlik, virgül ondalık → "1.234,56" → "1234.56"
  if (s.includes(",") && s.includes(".")) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// "06.02.2026" / Date / serial → "YYYY-MM-DD"
function parseTarih(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const tr = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (tr) return `${tr[3]}-${tr[2]}-${tr[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
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
