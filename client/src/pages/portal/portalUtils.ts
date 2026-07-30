import type { OdemeTalep, Beyanname, OdemeBelge, OdemeSirketi, FirmaIban, OdemeSirketiDetay } from "@shared/schema";

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

// "YYYY-MM-DD" → "dd/mm" (kısa; yıl gizli, dar sütunlar için) — new Date() KULLANILMAZ
export function formatTarihKisa(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}`;
}

export function formatPara(tutar: string | number | null | undefined, doviz?: string | null): string {
  if (tutar == null) return "—";
  const n = typeof tutar === "string" ? parseFloat(tutar) : tutar;
  if (!isFinite(n)) return "—";
  return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${doviz ?? ""}`.trim();
}

// Bugün "YYYY-MM-DD" — YEREL takvim gününden kurulur.
// toISOString() KULLANILMAZ: UTC'ye çevirir, TR'de (UTC+3) gece yarısından önce
// bir önceki günü döndürerek masrafı yanlış güne yazar.
export function bugunYmd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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

// Depo teminatı akışı: beklemede → islem_tamam → iade_edildi.
// "beklemede" ARTIK "İade Bekleniyor" DEĞİL: teminat, gümrük işlemi bitmeden zaten
// geri istenemez; bu aşamada beklenen şey iade değil, İŞLEMİN BİTMESİDİR.
export const IADE_ETIKET: Record<string, string> = {
  beklemede: "İşlem Devam Ediyor",
  islem_tamam: "İade Talep Edilebilir",
  iade_edildi: "İade Alındı",
};

// Depo teminatı süzgeçleri — TEK doğruluk kaynağı (temsilci kartı, hatırlatma
// penceresi, muhasebe kartı ve sidebar rozeti aynı tanımı kullanır).
export function devamEdenTeminatlar<T extends { odemeTipi: string; durum: string; iadeDurumu: string | null }>(t: T[]): T[] {
  return t.filter((x) => x.odemeTipi === "depo_teminat" && x.durum === "odendi" && x.iadeDurumu === "beklemede");
}
export function iadeEdilebilirTeminatlar<T extends { odemeTipi: string; durum: string; iadeDurumu: string | null }>(t: T[]): T[] {
  return t.filter((x) => x.odemeTipi === "depo_teminat" && x.durum === "odendi" && x.iadeDurumu === "islem_tamam");
}

// Açık kalma süresine göre aciliyet rengi: <15 nötr · 15–30 amber · >30 rose.
export function gunAciliyetSinifi(gun: number | null): string {
  if (gun == null) return "text-muted-foreground";
  if (gun > 30) return "font-semibold text-rose-600 dark:text-rose-400";
  if (gun >= 15) return "font-semibold text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

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
// Türkçe "I" tuzağı: tr-locale küçültme "I"→"ı" yapar, "i" değişmez; aynı firmanın
// büyük/küçük harf varyantları farklı normalize olmasın diye ı→i katlanır.
// Hukuki ekler (A.Ş./LTD/ŞTİ) YALNIZ string sonunda temizlenir — "AS GIDA" gibi
// baştaki iki-harfli kelimeler korunur (Türkçe'de hukuki form hep sonda gelir).
const FIRMA_EKLERI = /(?:\s*(?:a\.?\s*ş\.?|a\.?\s*s\.?|ltd\.?|şti\.?|sti\.?|ş\.?t\.?i\.?)\s*)+$/giu;

export function firmaNormalize(s: string): string {
  return (s ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")      // noktasız ı → i (tr-lower "I" tuzağını kapatır)
    .replace(/̇/g, "")  // birleşik nokta (İ küçültme artığı) temizlenir
    .replace(FIRMA_EKLERI, "")        // sondaki hukuki ekler
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // kalan noktalama → boşluk (Türkçe harfleri korur)
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(firmaNormalize(s).split(" ").filter((t) => t.length >= 2));
}

// Türk firma adlarında ayırt edici olmayan yaygın kelimeler — tek başlarına
// paylaşıldıklarında overlap bonusu tetiklemezler (yanlış firma önerisini önler).
// firmaNormalize ile aynı katlamadan (ı→i) geçirilerek tutulur.
const JENERIK = new Set(
  ["lojistik", "ticaret", "nakliyat", "sanayi", "gümrük", "dış", "grup",
   "taşımacılık", "denizcilik", "uluslararası", "şirketi", "ithalat", "ihracat"]
    .flatMap((w) => [...tokenSet(w)]),
);

export function firmaBenzerlik(a: string, b: string): number {
  const A = tokenSet(a), B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let kesisim = 0, ayirtEdiciOrtak = false;
  A.forEach((t) => { if (B.has(t)) { kesisim++; if (!JENERIK.has(t)) ayirtEdiciOrtak = true; } });
  if (kesisim === 0) return 0;
  // Yalnız jenerik kelime paylaşımı (ayırt edici ortak token yok) → eşleşme sinyali yok, 0 dön.
  // (Saf Jaccard'a düşülseydi kısa jenerik sorgularda [ör. tek kelime "Lojistik"] eşiğin
  // üstünde kalıp yine alakasız firmaları yüzeye çıkarabiliyordu.)
  if (!ayirtEdiciOrtak) return 0;
  const jaccard = kesisim / (A.size + B.size - kesisim);
  // İçerme (overlap): girilen ad kayıtlı adın alt kümesiyse (ör. "ASAV" ⊂
  // "ASAV LOJİSTİK HİZMETLERİ") Jaccard uzunluk farkını cezalandırır; overlap telafi eder.
  const overlap = kesisim / Math.min(A.size, B.size);
  return Math.max(jaccard, 0.6 * overlap);
}

export function tamEslesme<T extends OdemeSirketi>(girilen: string, firmalar: T[]): T | null {
  const n = firmaNormalize(girilen);
  if (!n) return null;
  return firmalar.find((f) => firmaNormalize(f.ad) === n) ?? null;
}

export function benzerFirmalar<T extends OdemeSirketi>(
  girilen: string,
  firmalar: T[],
  opts?: { esik?: number; adet?: number },
): T[] {
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

// Döviz-bazlı firma IBAN'ı — talebin para birimine uyan hesabı verir.
// TRY: yeni ibanTry, yoksa F1.9'un eski tekil iban'ı (geriye uyum). EUR: firma
// EUR hesabı tutmuyor → null.
export function firmaIban(
  f: Pick<OdemeSirketi, "ibanTry" | "ibanUsd" | "iban">,
  paraBirimi: string,
): string | null {
  if (paraBirimi === "USD") return f.ibanUsd || null;
  if (paraBirimi === "EUR") return null;
  return f.ibanTry || f.iban || null;
}

// Firmanın IBAN'ı olan döviz kodları (rozet/çip etiketi için).
export function firmaParaBirimleri(
  f: Pick<OdemeSirketi, "ibanTry" | "ibanUsd" | "iban">,
): string[] {
  const r: string[] = [];
  if (f.ibanTry || f.iban) r.push("TRY");
  if (f.ibanUsd) r.push("USD");
  return r;
}

// Firmanın seçili dövizdeki IBAN'ları (etiketli seçim / otomatik dolum için)
export function firmaIbanlariByPB(f: OdemeSirketiDetay, paraBirimi: string): FirmaIban[] {
  return (f.ibanlar ?? []).filter((i) => i.paraBirimi === paraBirimi);
}

// Firmanın döviz özeti: [{paraBirimi, adet}] (tablo/çip rozetleri) — TRY, USD, EUR sırası
export function firmaIbanOzet(f: OdemeSirketiDetay): { paraBirimi: string; adet: number }[] {
  const sayac: Record<string, number> = {};
  for (const i of f.ibanlar ?? []) sayac[i.paraBirimi] = (sayac[i.paraBirimi] ?? 0) + 1;
  return ["TRY", "USD", "EUR"].filter((pb) => sayac[pb] > 0).map((pb) => ({ paraBirimi: pb, adet: sayac[pb] }));
}
