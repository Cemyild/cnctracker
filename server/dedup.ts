// Gümrük verileri için kompozit dedup anahtarı.
// Kullanıcının iş kuralı: bir satır mükerrer sayılır ANCAK
// (faturaNo, dosyaNo, tescilNo, malBedeli, topFaturaTutar, siraNo) hepsi
// eşleşirse. Herhangi bir seviyede fark varsa satır benzersizdir.
// Bu, tüm bu alanları normalize edip birleştirerek denk biçimde elde edilir.

export type DedupRow = {
  ay?: string | null;
  yil?: number | null;
  faturaNo?: string | null;
  dosyaNo?: string | null;
  tescilNo?: string | null;
  malBedeli?: string | number | null;
  topFaturaTutar?: string | number | null;
  siraNo?: string | null;
};

const trim = (s: unknown): string => {
  if (s == null) return "";
  return String(s).trim();
};

// Tutar alanlarını kanonik forma çevirir: TR formatı ("1.375,57"), İngilizce
// ("1375.57"), fazla sıfırlı ("1375.5700") ve number tipi hepsi "1375.57" olur.
export function normalizeAmount(v: unknown): string {
  if (v == null || v === "") return "";
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else {
    const s = String(v).trim();
    if (!s) return "";
    let clean = s;
    if (s.includes(",") && s.includes(".")) {
      clean = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",")) {
      clean = s.replace(",", ".");
    }
    n = parseFloat(clean);
  }
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

// İki satırın "aynı satır" olup olmadığını belirleyen kompozit anahtar.
// ay/yıl yoksa null döner — bu durumda satır dedup edilemez (eklenir).
export function buildDedupKey(v: DedupRow): string | null {
  if (!v.ay || typeof v.yil !== "number") return null;
  return [
    `${v.yil}-${v.ay}`,
    `F:${trim(v.faturaNo)}`,
    `D:${trim(v.dosyaNo)}`,
    `T:${trim(v.tescilNo)}`,
    `M:${normalizeAmount(v.malBedeli)}`,
    `TT:${normalizeAmount(v.topFaturaTutar)}`,
    `S:${trim(v.siraNo)}`,
  ].join("|");
}
