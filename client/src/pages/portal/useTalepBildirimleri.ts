import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { type TalepDetay, formatPara } from "./portalUtils";
import { type PortalMe } from "./PortalApp";

export type SayfaAnahtari = "taleplerim" | "gelenTalepler" | "depo";
export type Rozetler = Record<SayfaAnahtari, number>;

// talep başına durum imzası — bunlardan biri değişirse "değişiklik" sayılır
function talepImzasi(t: TalepDetay): string {
  return `${t.durum}|${t.iadeDurumu ?? ""}|${t.belgeler.length}|${t.beyannameId ?? ""}`;
}

type Imza = Record<string, string>; // talepId -> imza
type ImzaDeposu = Partial<Record<SayfaAnahtari, Imza>>;

function depoAnahtari(me: PortalMe) {
  return `portal_gorulen_${me.id}`;
}

function imzalariOku(me: PortalMe): ImzaDeposu {
  try {
    return JSON.parse(localStorage.getItem(depoAnahtari(me)) ?? "{}") as ImzaDeposu;
  } catch {
    return {}; // bozuk kayıt: yeniden baz alınır
  }
}

function imzalariYaz(me: PortalMe, d: ImzaDeposu) {
  try {
    localStorage.setItem(depoAnahtari(me), JSON.stringify(d));
  } catch {
    /* dolu storage vb. — rozetler bir sonraki turda yeniden hesaplanır */
  }
}

// Sayfanın izlediği talepler
function sayfaTalepleri(sayfa: SayfaAnahtari, talepler: TalepDetay[]): TalepDetay[] {
  if (sayfa === "depo") return talepler.filter((t) => t.odemeTipi === "depo_teminat");
  return talepler;
}

function guncelImza(liste: TalepDetay[]): Imza {
  const imza: Imza = {};
  for (const t of liste) imza[t.id] = talepImzasi(t);
  return imza;
}

// imzaya göre değişen/yeni talepler
function degisenler(imza: Imza | undefined, liste: TalepDetay[]): TalepDetay[] {
  if (!imza) return [];
  return liste.filter((t) => imza[t.id] === undefined || imza[t.id] !== talepImzasi(t));
}

function rolSayfalari(rol: PortalMe["rol"]): SayfaAnahtari[] {
  return rol === "muhasebe" ? ["gelenTalepler", "depo"] : ["taleplerim"];
}

const SAYFA_ROTASI: Record<SayfaAnahtari, string> = {
  taleplerim: "/portal/taleplerim",
  gelenTalepler: "/portal/gelen-talepler",
  depo: "/portal/depo",
};

function bildirimMetni(sayfa: SayfaAnahtari, degisen: TalepDetay[]): string {
  if (sayfa === "gelenTalepler") {
    if (degisen.length === 1) {
      const t = degisen[0];
      return `Yeni ödeme talebi: ${t.talepEdenAd} — ${formatPara(t.tutar, t.paraBirimi)}`;
    }
    return `${degisen.length} yeni ödeme talebi var`;
  }
  if (sayfa === "depo") {
    return degisen.length === 1
      ? `İade takibinde değişiklik: ${degisen[0].beyanname?.dosyaNo ?? degisen[0].alacakli}`
      : `İade takibinde ${degisen.length} değişiklik var`;
  }
  // taleplerim
  if (degisen.length === 1) {
    const t = degisen[0];
    const ref = t.beyanname?.dosyaNo ?? t.alacakli;
    return t.durum === "odendi"
      ? `Talebiniz ödendi: ${ref} — ${formatPara(t.tutar, t.paraBirimi)}`
      : `Talebinizde değişiklik: ${ref}`;
  }
  return `${degisen.length} talebinizde değişiklik var`;
}

const TEMEL_BASLIK = "Ödemeler Portalı";

/**
 * Rozet + sekme başlığı + tarayıcı bildirimi motoru.
 * - aktifSayfa: o an açık portal sayfası (rota eşleşmesi); sekme öndeyse imzası senkronlanır.
 * - Dönüş: sayfa başına "son görülenden beri değişiklik" sayıları.
 */
export function useTalepBildirimleri(
  me: PortalMe,
  talepler: TalepDetay[],
  aktifSayfa: SayfaAnahtari | null,
): Rozetler {
  const [, navigate] = useLocation();
  const bildirilenler = useRef<Set<string>>(new Set()); // "sayfa:talepId:imza" — aynı değişiklik bir kez bildirilir
  const [, yenidenHesapla] = useState(0); // imza senkronu sonrası rozetleri anında tazelemek için
  const sayfalar = rolSayfalari(me.rol);

  const imzalar = imzalariOku(me);

  // İlk kullanım bazlaması: imzası hiç olmayan sayfalar mevcut durumla başlar (rozet 0)
  useEffect(() => {
    if (!talepler.length && !sayfalar.some((s) => imzalariOku(me)[s])) return;
    const d = imzalariOku(me);
    let degisti = false;
    for (const s of sayfalar) {
      if (!d[s]) {
        d[s] = guncelImza(sayfaTalepleri(s, talepler));
        degisti = true;
      }
    }
    if (degisti) {
      imzalariYaz(me, d);
      yenidenHesapla((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, talepler]);

  // Aktif sayfa + görünür sekme: imzayı senkronla (rozet sıfırlanır)
  useEffect(() => {
    const senkronla = () => {
      if (!aktifSayfa || document.visibilityState !== "visible") return;
      const d = imzalariOku(me);
      d[aktifSayfa] = guncelImza(sayfaTalepleri(aktifSayfa, talepler));
      imzalariYaz(me, d);
      yenidenHesapla((n) => n + 1); // localStorage değişti — rozet/başlık yeniden hesaplansın
    };
    senkronla();
    document.addEventListener("visibilitychange", senkronla);
    return () => document.removeEventListener("visibilitychange", senkronla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, aktifSayfa, talepler]);

  // Rozetleri hesapla
  const rozetler: Rozetler = { taleplerim: 0, gelenTalepler: 0, depo: 0 };
  for (const s of sayfalar) {
    // aktif + görünür sayfanın rozeti her zaman 0 (senkron effect'i imzayı güncelliyor)
    if (s === aktifSayfa && typeof document !== "undefined" && document.visibilityState === "visible") continue;
    rozetler[s] = degisenler(imzalar[s], sayfaTalepleri(s, talepler)).length;
  }

  const toplam = sayfalar.reduce((a, s) => a + rozetler[s], 0);

  // Sekme başlığı sayacı
  useEffect(() => {
    document.title = toplam > 0 ? `(${toplam}) ${TEMEL_BASLIK}` : TEMEL_BASLIK;
    return () => {
      document.title = TEMEL_BASLIK;
    };
  }, [toplam]);

  // Tarayıcı bildirimi — yalnız sekme arka plandayken, değişiklik başına bir kez
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (!document.hidden) return;
    for (const s of sayfalar) {
      const yeni = degisenler(imzalar[s], sayfaTalepleri(s, talepler)).filter(
        (t) => !bildirilenler.current.has(`${s}:${t.id}:${talepImzasi(t)}`),
      );
      if (!yeni.length) continue;
      yeni.forEach((t) => bildirilenler.current.add(`${s}:${t.id}:${talepImzasi(t)}`));
      const n = new Notification(TEMEL_BASLIK, { body: bildirimMetni(s, yeni), tag: `portal-${s}` });
      n.onclick = () => {
        window.focus();
        navigate(SAYFA_ROTASI[s]);
        n.close();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talepler]);

  return rozetler;
}

/** Girişten sonra bir kez çağrılır — izin istenmemişse sorar. */
export function bildirimIzniIste() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
