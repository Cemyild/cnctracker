// shared/tahsilatHesaplari.ts
// TR mizan tahsilat risk hesap mantığı.
// Tarih hesapları YYYY-MM-DD string parse'ı ile yapılır.

function parseDate(s: string): { yil: number; ay: number; gun: number } {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const tr = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (tr) return { yil: +tr[3], ay: +tr[2], gun: +tr[1] };
    throw new Error(`Geçersiz tarih: ${s}`);
  }
  return { yil: +m[1], ay: +m[2], gun: +m[3] };
}

function daysBetween(bas: string, bit: string): number {
  const b = parseDate(bas);
  const e = parseDate(bit);
  const ms = Date.UTC(e.yil, e.ay - 1, e.gun) - Date.UTC(b.yil, b.ay - 1, b.gun);
  return Math.round(ms / 86400000);
}

// Net bakiye (signed): K=A ise negatif (alacaklı), K=B ise pozitif (borçlu)
export function netBakiye(p: { sonBakiye: number; sonBakiyeBA: string }): number {
  return p.sonBakiyeBA === "A" ? -p.sonBakiye : p.sonBakiye;
}

// Son ödeme gecikmesi (gün); ödeme yoksa 9999
export function gecikme(sonAlacakTarihi: string | null, refTarih: string): number {
  if (!sonAlacakTarihi) return 9999;
  return daysBetween(sonAlacakTarihi, refTarih);
}

// İş aktivitesi açığı: pozitifse "iş yapıyor para vermiyor", negatifse "iş kesilmiş"
export function isAktivitesiAcigi(sonBorcTarihi: string | null, sonAlacakTarihi: string | null): number {
  if (!sonBorcTarihi || !sonAlacakTarihi) return 0;
  // sonBorc - sonAlacak: pozitifse borç son alacaktan yeni → kötü
  return daysBetween(sonAlacakTarihi, sonBorcTarihi);
}

// Bakiye-Fatura açığı: pozitifse devreden gecikmiş borç var
export function bakiyeFaturaAcigi(netBakiyeTutar: number, faturaToplami: number): {
  acik: number;
  acikYuzde: number;
} {
  const acik = netBakiyeTutar - faturaToplami;
  const acikYuzde = faturaToplami > 0 ? (acik / faturaToplami) * 100 : (acik > 0 ? 999 : 0);
  return { acik, acikYuzde };
}

export type RiskPattern = "SAGLIKLI" | "VIP_AKTIF_RISK" | "TAKIP_GEREKEN" | "YAVAS_ODEYICI" | "DONUK_KAYIP";

export interface RiskEsikleri {
  vipEsik: number;
  yuksekBakiyeEsik: number;
  eskiOdemeEsik: number;
  cokEskiOdemeEsik: number;
  eksiPozisyonYuzde: number;
}

export interface RiskSonuc {
  pattern: RiskPattern;
  vipRozeti: boolean;
  yuksekBakiyeRozeti: boolean;
  eksiPozisyonRozeti: boolean;
}

export function riskProfili(p: {
  netBakiye: number;
  gecikme: number;
  borcGecikme: number; // mizan tarihi − son borç (fatura) tarihi, gün; fatura yoksa 9999
  bakiyeFaturaAcikYuzde: number;
  yillikFaturaToplami: number;
  esikler: RiskEsikleri;
}): RiskSonuc {
  const vipRozeti = p.yillikFaturaToplami > p.esikler.vipEsik;
  const yuksekBakiyeRozeti = p.netBakiye > p.esikler.yuksekBakiyeEsik;
  const eksiPozisyonRozeti = p.bakiyeFaturaAcikYuzde > p.esikler.eksiPozisyonYuzde;

  let pattern: RiskPattern;
  if (p.netBakiye <= 0) {
    pattern = "SAGLIKLI";
  } else if (p.gecikme >= p.esikler.cokEskiOdemeEsik && p.borcGecikme >= p.esikler.cokEskiOdemeEsik) {
    // Hem son ödeme hem son fatura çok eski → ilişki donmuş, borç içeride kalmış
    pattern = "DONUK_KAYIP";
  } else if (p.gecikme >= p.esikler.eskiOdemeEsik && p.borcGecikme <= p.esikler.eskiOdemeEsik) {
    // Fatura yakın ama ödeme eski → iş dönüyor, para gelmiyor
    pattern = "YAVAS_ODEYICI";
  } else if (vipRozeti && p.gecikme < p.esikler.eskiOdemeEsik) {
    pattern = "VIP_AKTIF_RISK";
  } else if (p.gecikme >= 11) {
    // Ara durumlar dahil (örn. ödeme eski ama fatura 30-60 gün arası) — sessizce
    // "Sağlıklı"ya düşmesin
    pattern = "TAKIP_GEREKEN";
  } else {
    pattern = "SAGLIKLI";
  }

  return { pattern, vipRozeti, yuksekBakiyeRozeti, eksiPozisyonRozeti };
}

export const PATTERN_LABEL: Record<RiskPattern, string> = {
  SAGLIKLI: "Sağlıklı Müşteri",
  VIP_AKTIF_RISK: "VIP — Büyük Aktif",
  TAKIP_GEREKEN: "Takip Gereken",
  YAVAS_ODEYICI: "Yavaş Ödeyici",
  DONUK_KAYIP: "Donuk Alacak",
};

export const PATTERN_COLOR: Record<RiskPattern, string> = {
  SAGLIKLI: "bg-green-500",
  VIP_AKTIF_RISK: "bg-blue-600",
  TAKIP_GEREKEN: "bg-yellow-500",
  YAVAS_ODEYICI: "bg-orange-500",
  DONUK_KAYIP: "bg-red-600",
};

// ── Aksiyon Merkezi: ödeme oranı + segment + neden ──────────────────────────

// Yıl içi ödeme oranı (0-1). Fatura yoksa null → oran yorumlanamaz.
export function odemeOrani(borc: number, alacak: number): number | null {
  if (borc <= 0) return null;
  return alacak / borc;
}

export type TahsilatSegment = "SAGLIKLI" | "BUYUK_RISK" | "KUCUK_NOTR" | "NAKIT_TUZAGI";

export interface SegmentEsikleri {
  odemeOraniEsik: number; // yüzde (örn. 60)
  eskiOdemeEsik: number;  // gün (örn. 30)
}

// İki eksen: kazandırıyor mu (ciro eşiği — çağıran hesaplar) × ödüyor mu (oran + gecikme).
// Bakiye ≤ 0 olan firma tahsilat konusu değildir.
export function firmaSegmenti(p: {
  netBakiye: number;
  odemeOrani: number | null;
  gecikme: number;
  kazandiriyor: boolean;
  esikler: SegmentEsikleri;
}): TahsilatSegment {
  if (p.netBakiye <= 0) return "SAGLIKLI";
  const oranIyi = p.odemeOrani === null ? true : p.odemeOrani * 100 >= p.esikler.odemeOraniEsik;
  const oduyor = oranIyi && p.gecikme <= p.esikler.eskiOdemeEsik;
  if (p.kazandiriyor) return oduyor ? "SAGLIKLI" : "BUYUK_RISK";
  return oduyor ? "KUCUK_NOTR" : "NAKIT_TUZAGI";
}

export function kisaTutar(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
}

// Düz Türkçe gerekçe; parçalar " · " ile birleşir.
export function nedenCumlesi(p: {
  gecikme: number;
  odemeOrani: number | null;
  hicOdemeYok: boolean;
  ytdIslemSayisi: number | null;
  islemAyOrt: number | null;
  deltaNetBakiye: number | null;
  eslesmemis: boolean;
  esikler: SegmentEsikleri;
}): string {
  const parca: string[] = [];
  if (p.hicOdemeYok) parca.push("hiç ödeme yapmamış");
  else if (p.gecikme >= 9999) parca.push("ödeme kaydı yok");
  else if (p.gecikme >= 60) parca.push(`${Math.floor(p.gecikme / 30)} aydır ödeme yok`);
  else if (p.gecikme > p.esikler.eskiOdemeEsik) parca.push(`${p.gecikme} gündür ödeme yok`);
  if (!p.hicOdemeYok && p.odemeOrani !== null && p.odemeOrani * 100 < p.esikler.odemeOraniEsik) {
    parca.push(`ödeme oranı %${Math.round(p.odemeOrani * 100)}`);
  }
  if (p.ytdIslemSayisi !== null && p.islemAyOrt !== null && p.islemAyOrt < 2) {
    parca.push(`yılda ${p.ytdIslemSayisi} iş`);
  }
  if (p.deltaNetBakiye !== null && p.deltaNetBakiye > 0) {
    parca.push(`borç büyüyor ▲ ${kisaTutar(p.deltaNetBakiye)}`);
  }
  if (p.eslesmemis) parca.push("gümrük eşleşmesi yok");
  return parca.length ? parca.join(" · ") : "sorun görünmüyor";
}

// YYYY-MM-DD → dd/mm/yy görüntüleme (new Date kullanmadan — TZ kayması yok)
export function tarihGoster(s: string | null | undefined): string {
  if (!s) return "-";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : s;
}

export const SEGMENT_LABEL: Record<TahsilatSegment, string> = {
  SAGLIKLI: "Sağlıklı",
  BUYUK_RISK: "Büyük Risk",
  KUCUK_NOTR: "Küçük / Nötr",
  NAKIT_TUZAGI: "Nakit Tuzağı",
};

export const SEGMENT_PILL: Record<TahsilatSegment, string> = {
  SAGLIKLI: "bg-emerald-50 text-emerald-700",
  BUYUK_RISK: "bg-amber-50 text-amber-700",
  KUCUK_NOTR: "bg-slate-100 text-slate-600",
  NAKIT_TUZAGI: "bg-rose-50 text-rose-700",
};
