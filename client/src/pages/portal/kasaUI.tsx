import type { ReactNode } from "react";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Calendar, RotateCcw, Download } from "lucide-react";
import { formatPara } from "./portalUtils";
import { useSanalTarih, tarihParcala } from "./sanalTarih";

// rejim kodu (IM/EX/TR/AN) + dosyaYok → görsel anahtar. AN (antrepo) İthalat kanalı.
export function rejimAnahtar(rejim: string | null | undefined, dosyaYok?: boolean): "im" | "ex" | "tr" | "of" {
  if (dosyaYok) return "of";
  const r = (rejim ?? "").toUpperCase();
  if (r === "EX") return "ex";
  if (r === "TR") return "tr";
  return "im"; // IM, AN, boş → İthalat kanalı
}

export function formatRejim(rejim: string | null | undefined, dosyaYok?: boolean): string {
  return { im: "İthalat", ex: "İhracat", tr: "Transit", of: "Ofis" }[rejimAnahtar(rejim, dosyaYok)];
}

// Tek accent + rejim renk kodu. GÖKKUŞAĞI YOK — bu tablo dışına renk çıkma.
export const REJIM_STIL: Record<"im" | "ex" | "tr" | "of", { rozet: string; avatar: string; serit: string }> = {
  im: { rozet: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300", avatar: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300", serit: "bg-indigo-600" },
  ex: { rozet: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300", avatar: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300", serit: "bg-teal-600" },
  tr: { rozet: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300", avatar: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300", serit: "bg-violet-600" },
  of: { rozet: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300", avatar: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300", serit: "bg-orange-500" },
};

export function RejimRozeti({ rejim, dosyaYok }: { rejim: string | null | undefined; dosyaYok?: boolean }) {
  const k = rejimAnahtar(rejim, dosyaYok);
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${REJIM_STIL[k].rozet}`}>{formatRejim(rejim, dosyaYok)}</span>;
}

export function KpiKart({ ikon, label, deger, renk = "text-foreground", alt }: { ikon: ReactNode; label: string; deger: ReactNode; renk?: string; alt?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">{ikon}</span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className={`text-2xl font-bold tracking-tight tabular-nums ${renk}`}>{deger}</div>
      {alt && <div className="mt-2 text-xs text-muted-foreground">{alt}</div>}
    </div>
  );
}

// Artık sadece tarih göstermez, SEÇTİRİR: seçilen gün sistem günü gibi davranır
// (masraf tarihi varsayılanı, gün kapanışı, depo gün sayaçları). Geriye dönük gün
// canlandırıp sistemi denemek için — bkz. sanalTarih.tsx.
export function GunKutusu() {
  const { bugun, gercekBugun, sanal, ayarla, sifirla } = useSanalTarih();
  const { gun, haftaGun } = tarihParcala(bugun);
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 shadow-sm ${
        sanal
          ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
          : "bg-card"
      }`}
      data-testid="kutu-gun"
    >
      <Calendar className={`h-4 w-4 ${sanal ? "text-amber-600 dark:text-amber-400" : "text-indigo-600"}`} />
      <div className="leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold">{gun}</span>
          {/* Görünmez ama tıklanabilir: kutunun kendisi takvimi açar. */}
          <input
            type="date"
            value={bugun}
            max={gercekBugun}
            onChange={(e) => e.target.value && ayarla(e.target.value)}
            className="w-[18px] cursor-pointer border-0 bg-transparent p-0 text-transparent focus:outline-none"
            title="Sistem gününü değiştir (test)"
            data-testid="input-sanal-tarih"
          />
        </div>
        <div className={`text-[10.5px] ${sanal ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
          {sanal ? (
            <>
              {haftaGun} · TEST GÜNÜ
              <button
                type="button"
                onClick={sifirla}
                className="ml-1.5 underline hover:no-underline"
                data-testid="button-sanal-tarih-sifirla"
              >
                bugüne dön
              </button>
            </>
          ) : (
            `${haftaGun} · bugün açık`
          )}
        </div>
      </div>
    </div>
  );
}

export function SonDevirKart({ gunTarihi, kapanisBakiye }: { gunTarihi: string | null; kapanisBakiye: string | null }) {
  const kisa = (t: string | null) => (t && t.length >= 10 ? `${t.slice(8, 10)}/${t.slice(5, 7)}` : "—");
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"><RotateCcw className="h-[18px] w-[18px]" /></span>
        <span className="text-sm font-medium text-muted-foreground">Son Devir</span>
      </div>
      {gunTarihi ? (
        <>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <span className="rounded-md border bg-muted/40 px-2 py-0.5 tabular-nums">{kisa(gunTarihi)}</span>
            <span className="text-muted-foreground">→</span>
            <span className="rounded-md border bg-muted/40 px-2 py-0.5">bugün</span>
          </div>
          <div className="text-xl font-bold tracking-tight tabular-nums">{formatPara(kapanisBakiye, "₺")}</div>
          <div className="mt-1.5 text-xs text-muted-foreground">önceki gün açılışı</div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Henüz kapanış yok</div>
      )}
    </div>
  );
}

// Tüm portal ekranlarının ortak başlık şeridi: sol başlık + alt açıklama, sağda slot (gün kutusu / aksiyon).
// sag verilmezse VARSAYILAN olarak gün kutusu gelir: operasyon Kasam'daki başlık dili
// (solda başlık, sağda tarih) temsilci ve muhasebe ekranlarının tamamına böyle yayılır.
// Kasam kendi başlığını elle kurduğu için orada çift GunKutusu oluşmaz.
export function SayfaBasligi({ baslik, alt, sag }: { baslik: string; alt?: string; sag?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{baslik}</h1>
        {alt && <p className="text-sm text-muted-foreground">{alt}</p>}
      </div>
      {sag ?? <GunKutusu />}
    </div>
  );
}

// Ekranlarda KpiKart ikonu için kısayol.
export const IK = { Wallet, ArrowDownToLine, ArrowUpFromLine, Download };
