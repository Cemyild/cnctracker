// server/eslestirme.ts
// Müşteri adı ↔ gümrük firmaUnvan eşleştirme algoritması.

const SIRKET_EKLERI = ["ltd", "sti", "as", "tic", "san", "paz", "ve"];
const TR_REPLACE: Record<string, string> = { "ı": "i", "ş": "s", "ü": "u", "ö": "o", "ç": "c", "ğ": "g" };

export function normalize(s: string): string {
  if (!s) return "";
  let r = s.toLocaleLowerCase("tr");
  // Türkçe karakter normalizasyonu
  r = r.replace(/[ışüöçğ]/g, (c) => TR_REPLACE[c] ?? c);
  // Şirket eklerini sil (kelime sınırı ile)
  for (const ek of SIRKET_EKLERI) {
    r = r.replace(new RegExp(`\\b${ek}\\b`, "g"), " ");
  }
  // Noktalama → boşluk, çoklu boşluk tek boşluk
  r = r.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return r;
}

// Levenshtein uzaklık (DP)
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

export function benzerlikSkoru(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.95;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

export const ESLESME_AUTO_ESIK = 0.95;
export const ESLESME_ONERI_ESIK = 0.75;

// Bir müşteri adı için gümrük unvan listesinde en iyi eşleşmeyi bul
export function enIyiEslesme(
  musteriAd: string,
  gumrukUnvanlar: string[],
): { unvan: string; skor: number } | null {
  let best: { unvan: string; skor: number } | null = null;
  for (const u of gumrukUnvanlar) {
    const s = benzerlikSkoru(musteriAd, u);
    if (!best || s > best.skor) best = { unvan: u, skor: s };
  }
  return best;
}
