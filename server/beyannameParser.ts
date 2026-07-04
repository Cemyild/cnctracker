import * as XLSX from "xlsx";
import { type InsertBeyanname } from "@shared/schema";

// Beklenen başlıklar → sütun harfleri ("İthalat Raporu" sayfası, 1. satır)
const BEKLENEN_BASLIKLAR: Record<string, string> = {
  A: "DOSYA NO",
  B: "ALICI",
  D: "GONDEREN",
  F: "KOLİ",
  I: "GUM.",
  K: "BEYAN TARİHİ",
  L: "BEYAN NO",
  M: "FAT.BEDELİ",
  N: "DÖVİZ",
  AV: "KULLANICI",
};

// "DD.MM.YYYY" → "YYYY-MM-DD"; "." veya boş → null.
// new Date() KULLANILMAZ — timezone off-by-one tuzağı (commit c897dff).
export function parseBeyanTarihi(deger: unknown): string | null {
  if (typeof deger !== "string") return null;
  const m = deger.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseBeyannameWorkbook(buffer: Buffer): { rows: InsertBeyanname[] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.includes("İthalat Raporu")
    ? "İthalat Raporu"
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (!grid.length) throw new Error(`"${sheetName}" sayfası boş`);

  // Başlık doğrulaması — uyuşmazlıkta yükleme REDDEDİLİR.
  // Sessiz sıfır-satır ithalatı yasak (gümrük fatura_tarihi dersinden).
  const baslikSatiri = grid[0];
  const sorunlar: string[] = [];
  for (const [harf, beklenen] of Object.entries(BEKLENEN_BASLIKLAR)) {
    const idx = XLSX.utils.decode_col(harf);
    const bulunan = String(baslikSatiri[idx] ?? "").trim();
    if (bulunan !== beklenen) {
      sorunlar.push(`${harf} sütunu "${beklenen}" olmalı, "${bulunan}" bulundu`);
    }
  }
  if (sorunlar.length) {
    throw new Error(`Excel başlıkları uyuşmuyor: ${sorunlar.join("; ")}`);
  }

  const col = (harf: string) => XLSX.utils.decode_col(harf);
  const metin = (v: unknown) => (v == null ? null : String(v).trim() || null);
  const rows: InsertBeyanname[] = [];
  for (let r = 1; r < grid.length; r++) {
    const satir = grid[r];
    if (!satir) continue;
    const dosyaNo = String(satir[col("A")] ?? "").trim();
    if (!dosyaNo) continue; // boş satır — atla
    rows.push({
      dosyaNo,
      alici: metin(satir[col("B")]),
      gonderen: metin(satir[col("D")]),
      koli: typeof satir[col("F")] === "number" ? (satir[col("F")] as number) : null,
      gumrukIdaresi: metin(satir[col("I")]),
      beyanTarihi: parseBeyanTarihi(satir[col("K")]),
      beyanNo: metin(satir[col("L")]),
      fatBedeli: typeof satir[col("M")] === "number" ? String(satir[col("M")]) : null,
      doviz: metin(satir[col("N")]),
      kullanici: metin(satir[col("AV")]),
    });
  }
  return { rows };
}
