// server/eslestirme.ts
// Müşteri adı ↔ gümrük firmaUnvan eşleştirme algoritması.
//
// V2 yaklaşımı: token (kelime) bazlı + first-word weighted + Jaccard.
// Eski Levenshtein-on-full-string yaklaşımı sektör kelimeleri (TEKSTİL,
// SANAYİ, TİCARET) yüzünden farklı firmaları %90+ skorla eşleştiriyordu.

const TR_REPLACE: Record<string, string> = { "ı": "i", "ş": "s", "ü": "u", "ö": "o", "ç": "c", "ğ": "g" };

// Şirket tipi + sektör + iş türü kelimeleri.
// Bunlar farklı firmalarda ortak — eşleştirme sinyali olarak kullanılmamalı.
const STOP_WORDS = new Set([
  // Şirket tipi
  "ltd", "sti", "as", "anonim", "limited", "kollektif", "sirket", "sirketi",
  "company", "co", "corp", "inc",
  // Bağlaç + edat
  "ve", "ile", "icin", "veya",
  // İş türü
  "tic", "ticaret", "san", "sanayi", "imalat", "uretim", "hizmet",
  "hizmetleri", "danismanlik", "musavirlik", "musavirligi",
  "yatirim", "holding", "grup", "group",
  "import", "export", "ithalat", "ihracat", "ic", "dis",
  "paz", "pazarlama", "satis", "tedarik", "lojistik", "nakliye",
  // Sektör (sıradan)
  "tekstil", "makina", "makine", "boya", "kimya", "gida", "metal",
  "plastik", "elektrik", "elektronik", "otomotiv", "endustri",
  "tarim", "insaat", "yapi", "gumruk", "muhasebe", "finans",
  "muhendislik", "muhendis", "teknik",
  // Tek harf/sayısal kalıntılar
  "a", "s", "n", "t",
]);

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

// String → token dizisi (lowercase, tr normalize, stop word'leri çıkarılmış)
function tokenize(s: string): string[] {
  if (!s) return [];
  let r = s.toLocaleLowerCase("tr");
  r = r.replace(/[ışüöçğ]/g, (c) => TR_REPLACE[c] ?? c);
  r = r.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!r) return [];
  return r.split(" ").filter((t) => t && !STOP_WORDS.has(t));
}

// Eski normalize fonksiyonu (geriye uyumluluk için, debug ve test'te kullanılır)
export function normalize(s: string): string {
  return tokenize(s).join(" ");
}

// İki string arası benzerlik [0..1]:
//   - first token (firma adının özgün kısmı) Levenshtein
//   - tüm token'lar Jaccard
//   - Birleşik skor: %60 first + %40 jaccard
//   - Eğer first token hiç tutmuyorsa skor %50 cap'lenir (sektör eşleşmesi gürültüsü)
export function benzerlikSkoru(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  // First token similarity
  const firstA = ta[0];
  const firstB = tb[0];
  let firstSim = 0;
  if (firstA === firstB) {
    firstSim = 1;
  } else {
    const dist = levenshtein(firstA, firstB);
    const maxLen = Math.max(firstA.length, firstB.length);
    firstSim = Math.max(0, 1 - dist / maxLen);
  }

  // Jaccard (token set overlap)
  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  setA.forEach((t) => { if (setB.has(t)) inter++; });
  const union = setA.size + setB.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;

  const combined = firstSim * 0.6 + jaccard * 0.4;

  // First token zayıfsa skor cap (sektör kelimeleri tek başına yeterli değil)
  if (firstSim < 0.5) return Math.min(combined, 0.5);

  return combined;
}

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

// Yeni eşikler: gerçek dünya verisinde test edildi
// 0.95: güvenli auto-match (sadece çok güçlü eşleşmeler)
// 0.78: makul öneri eşiği — gerçek eşleşmeleri yakalar, sahteler 0.40 altında elenir
// (TAFEKS vs TAFKO 0.40, BDR vs SDC 0.20, AKIN ile AKIN 1.0, YEŞİM 0.80)
export const ESLESME_AUTO_ESIK = 0.95;
export const ESLESME_ONERI_ESIK = 0.78;
