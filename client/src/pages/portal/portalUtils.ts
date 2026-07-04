import type { OdemeTalep, Beyanname, OdemeBelge } from "@shared/schema";

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
