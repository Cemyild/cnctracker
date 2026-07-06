import type { OdemeTalep, Beyanname, OdemeBelge, OdemeSirketi } from "@shared/schema";

// Sunucudaki OdemeTalepDetay'ın istemci karşılığı
export type TalepDetay = OdemeTalep & {
  beyanname: Beyanname | null;
  talepEdenAd: string;
  belgeler: OdemeBelge[];
};

// "YYYY-MM-DD" → "dd/mm/yyyy" — new Date() KULLANILMAZ (timezone tuzağı)
export function formatTarih(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatPara(tutar: string | number | null | undefined, doviz?: string | null): string {
  if (tutar == null) return "—";
  const n = typeof tutar === "string" ? parseFloat(tutar) : tutar;
  if (!isFinite(n)) return "—";
  return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${doviz ?? ""}`.trim();
}

// Bugüne uzaklık (gün) — YYYY-MM-DD, UTC aritmetiği (kayma yok)
export function gunFarki(ymd: string | null | undefined): number | null {
  if (!ymd) return null;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const o = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const simdi = new Date();
  const bugun = Date.UTC(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
  return Math.round((bugun - o) / 86400000);
}

export const TIP_ETIKET: Record<string, string> = {
  masraf: "Masraf",
  depo_teminat: "Depo Teminatı",
};

export const DURUM_ETIKET: Record<string, string> = {
  bekliyor: "Bekliyor",
  odendi: "Ödendi",
};

export const IADE_ETIKET: Record<string, string> = {
  beklemede: "İade Bekleniyor",
  iade_edildi: "İade Alındı",
};

export const BELGE_ETIKET: Record<string, string> = {
  fatura: "Fatura",
  dekont: "Dekont",
  konsimento: "Konşimento",
};

export function belgeUrl(b: OdemeBelge): string {
  return "/" + b.filepath.replace(/^\/+/, "");
}

// Firma adı eşleştirme — konşimento/AI'ın çıkardığı ad kayıtlı firmayla birebir
// tutmayabilir; normalize + benzerlik ile öneri sunulur. Saklama DEĞİŞMEZ.
// NOT: \b kelime sınırı JS'te yalnızca ASCII \w karakterlerini tanır — "ş" gibi
// Türkçe harfler \w SAYILMAZ, bu yüzden \b burada "a.ş." / "şti." gibi son ekleri
// HİÇ YAKALAMAZ. Unicode-uyumlu \p{L}\p{N} tabanlı lookaround sınırları (/u bayrağı)
// kullanılır — Türkçe harfleri korur; tsconfig target: ES2020 bu bayrağı sağlar.
const FIRMA_EKLERI = /(?<![\p{L}\p{N}])(a\.?\s*ş\.?|a\.?\s*s\.?|ltd\.?|şti\.?|sti\.?|ş\.?t\.?i\.?)(?![\p{L}\p{N}])/gu;

export function firmaNormalize(s: string): string {
  return (s ?? "")
    .toLocaleLowerCase("tr")
    .replace(FIRMA_EKLERI, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // noktalama → boşluk (\p ile Türkçe harfleri korur)
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(firmaNormalize(s).split(" ").filter((t) => t.length >= 2));
}

export function firmaBenzerlik(a: string, b: string): number {
  const A = tokenSet(a), B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let kesisim = 0;
  A.forEach((t) => { if (B.has(t)) kesisim++; });
  const birlesim = A.size + B.size - kesisim;
  return birlesim === 0 ? 0 : kesisim / birlesim; // Jaccard
}

export function tamEslesme(girilen: string, firmalar: OdemeSirketi[]): OdemeSirketi | null {
  const n = firmaNormalize(girilen);
  if (!n) return null;
  return firmalar.find((f) => firmaNormalize(f.ad) === n) ?? null;
}

export function benzerFirmalar(
  girilen: string,
  firmalar: OdemeSirketi[],
  opts?: { esik?: number; adet?: number },
): OdemeSirketi[] {
  const esik = opts?.esik ?? 0.34;
  const adet = opts?.adet ?? 3;
  const n = firmaNormalize(girilen);
  if (!n) return [];
  return firmalar
    .map((f) => ({ f, skor: firmaBenzerlik(girilen, f.ad) }))
    .filter((x) => x.skor >= esik && firmaNormalize(x.f.ad) !== n) // tam eşleşenler hariç
    .sort((a, b) => b.skor - a.skor)
    .slice(0, adet)
    .map((x) => x.f);
}
