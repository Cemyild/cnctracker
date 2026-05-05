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
  isAktivitesiAcigi: number;
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
  } else if (p.gecikme >= p.esikler.cokEskiOdemeEsik && p.isAktivitesiAcigi <= -p.esikler.cokEskiOdemeEsik) {
    // Hem son alacak (gecikme) hem son borç çok eski
    pattern = "DONUK_KAYIP";
  } else if (p.gecikme >= p.esikler.eskiOdemeEsik && p.isAktivitesiAcigi > 0) {
    // Son borç son alacaktan yeni (pozitif iş aktivitesi açığı) → iş yapıyor para vermiyor
    pattern = "YAVAS_ODEYICI";
  } else if (vipRozeti && p.gecikme < p.esikler.eskiOdemeEsik) {
    pattern = "VIP_AKTIF_RISK";
  } else if (p.gecikme >= 11 && p.gecikme < p.esikler.eskiOdemeEsik) {
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
