import { createContext, useContext, useState, type ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";
import { bugunYmd } from "./portalUtils";

// TEST ARACI — "sistem günü" kavramını tarayıcıda yeniden tanımlar.
// Kullanıcı geriye dönük birkaç günü canlandırıp masraf girmek, gün kapatmak ve
// depo sayaçlarını o güne göre görmek istedi. Sunucu saatine DOKUNULMAZ: her uç
// zaten tarihi gövdeden alıyor, biz yalnızca "bugün nedir" cevabını değiştiriyoruz.
//
// Kaldırmak gerekirse: bu dosyayı sil, GunKutusu'nu sabit tarihe döndür, çağıranlarda
// useSanalTarih().bugun yerine portalUtils.bugunYmd() yaz. Sunucuda iz bırakmaz.
const ANAHTAR = "portal_sanal_tarih";

export type SanalTarihDurumu = {
  /** Sistem günü gibi davranan tarih (YYYY-MM-DD). Sanal seçim yoksa gerçek bugün. */
  bugun: string;
  /** Gerçek takvim günü — uyarı metinlerinde "asıl bugün" göstermek için. */
  gercekBugun: string;
  /** Seçili tarih gerçek bugünden farklı mı (uyarı görünürlüğü). */
  sanal: boolean;
  ayarla: (ymd: string) => void;
  sifirla: () => void;
};

const Ctx = createContext<SanalTarihDurumu | null>(null);

function okuKayitli(): string | null {
  try {
    const v = localStorage.getItem(ANAHTAR);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch { return null; }
}

// React ağacının DIŞINDAN da okunmalı: aşağıdaki fetch sarmalayıcısı bir bileşen değil.
let aktifSanalTarih: string | null = okuKayitli();

// Sunucu da aynı "bugün"ü görmeli — talep/ödeme/işlem-bitiş damgaları orada atılıyor.
// Her portal isteğine X-Sanal-Tarih eklenir; sunucu yalnız GEÇMİŞ tarihi kabul eder
// (routes.ts → istemBugunu). Tek noktada sarılır: onlarca dağınık fetch çağrısına
// tek tek başlık eklemek yerine. Kaldırmak = bu bloğu silmek.
if (typeof window !== "undefined" && !(window as any).__sanalTarihFetch) {
  (window as any).__sanalTarihFetch = true;
  const orijinalFetch = window.fetch.bind(window);
  window.fetch = (girdi: RequestInfo | URL, ayar?: RequestInit) => {
    const url =
      typeof girdi === "string" ? girdi : girdi instanceof URL ? girdi.href : girdi.url;
    if (!aktifSanalTarih || !url.includes("/api/portal/")) return orijinalFetch(girdi, ayar);
    const basliklar = new Headers(
      ayar?.headers ?? (girdi instanceof Request ? girdi.headers : undefined),
    );
    basliklar.set("X-Sanal-Tarih", aktifSanalTarih);
    return orijinalFetch(girdi, { ...ayar, headers: basliklar });
  };
}

export function SanalTarihSaglayici({ children }: { children: ReactNode }) {
  const [secili, setSecili] = useState<string | null>(okuKayitli);
  const gercekBugun = bugunYmd();

  // Tarih değişince TÜM portal sorguları tazelenir: rozetler, gün sayaçları ve
  // form varsayılanları aynı "bugün"ü görmeli.
  const yaz = (ymd: string | null) => {
    setSecili(ymd);
    aktifSanalTarih = ymd; // fetch sarmalayıcısı bunu okur
    try {
      if (ymd) localStorage.setItem(ANAHTAR, ymd);
      else localStorage.removeItem(ANAHTAR);
    } catch { /* storage kapalı — bellekte çalışmaya devam eder */ }
    queryClient.invalidateQueries();
  };

  const deger: SanalTarihDurumu = {
    bugun: secili ?? gercekBugun,
    gercekBugun,
    sanal: !!secili && secili !== gercekBugun,
    ayarla: (ymd) => { if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) yaz(ymd); },
    sifirla: () => yaz(null),
  };

  return <Ctx.Provider value={deger}>{children}</Ctx.Provider>;
}

/** Sağlayıcı dışında da güvenli: gerçek bugüne düşer. */
export function useSanalTarih(): SanalTarihDurumu {
  const c = useContext(Ctx);
  if (c) return c;
  const g = bugunYmd();
  return { bugun: g, gercekBugun: g, sanal: false, ayarla: () => {}, sifirla: () => {} };
}

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const HAFTA = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

/** "YYYY-MM-DD" → { gun: "30 Temmuz 2026", haftaGun: "Perşembe" } — UTC aritmetiği (kayma yok). */
export function tarihParcala(ymd: string): { gun: string; haftaGun: string } {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { gun: ymd, haftaGun: "" };
  const [y, ay, g] = [+m[1], +m[2], +m[3]];
  return {
    gun: `${g} ${AYLAR[ay - 1]} ${y}`,
    haftaGun: HAFTA[new Date(Date.UTC(y, ay - 1, g)).getUTCDay()],
  };
}
