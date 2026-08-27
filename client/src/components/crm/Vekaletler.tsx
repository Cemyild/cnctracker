import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { aramaEslesir, bugun, fmtTarih } from "./tipler";

type Vekalet = {
  musteriId: string;
  musteriAd: string;
  hesapKodu: string;
  vekaletBaslangic: string | null;
  vekaletBitis: string | null;
  vekaletNoter: string | null;
  telefon: string | null;
  il: string | null;
};

type Durum = "dolmus" | "yakin" | "gecerli" | "suresiz";

const DURUM_BILGI: Record<Durum, { etiket: string; renk: string; arka: string }> = {
  dolmus:  { etiket: "Süresi dolmuş", renk: "#b91c1c", arka: "#fee2e2" },
  yakin:   { etiket: "Yaklaşıyor",    renk: "#b45309", arka: "#fef3c7" },
  gecerli: { etiket: "Geçerli",       renk: "#15803d", arka: "#dcfce7" },
  suresiz: { etiket: "Süresiz",       renk: "#4338ca", arka: "#e0e7ff" },
};

// YYYY-MM-DD metinleri doğrudan karşılaştırılır — sıralama zaten doğru olur ve
// new Date() üzerinden geçmediği için timezone kayması olmaz.
function gunEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split("-").map(Number);
  const d = new Date(Date.UTC(y, a - 1, g + gun));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function Vekaletler({ onMusteriAc }: { onMusteriAc: (musteriId: string) => void }) {
  const [arama, setArama] = useState("");
  const [filtre, setFiltre] = useState<Durum | "hepsi">("hepsi");

  const { data: satirlar = [], isLoading } = useQuery<Vekalet[]>({
    queryKey: ["/api/crm/vekaletler"],
  });

  const BUGUN = bugun();
  const ESIK = gunEkle(BUGUN, 90);

  const durumu = (v: Vekalet): Durum => {
    const b = v.vekaletBitis ?? "";
    if (b.startsWith("3000") || b.startsWith("2999")) return "suresiz";
    if (b < BUGUN) return "dolmus";
    if (b <= ESIK) return "yakin";
    return "gecerli";
  };

  const zenginlestirilmis = useMemo(
    () => satirlar.map((v) => ({ ...v, durum: durumu(v) })),
    // BUGUN/ESIK render başına sabit; satırlar değişince yeniden hesaplanır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [satirlar],
  );

  const sayilar = useMemo(() => {
    const s: Record<string, number> = { hepsi: zenginlestirilmis.length, dolmus: 0, yakin: 0, gecerli: 0, suresiz: 0 };
    for (const v of zenginlestirilmis) s[v.durum]++;
    return s;
  }, [zenginlestirilmis]);

  const suzulmus = zenginlestirilmis
    .filter((v) => filtre === "hepsi" || v.durum === filtre)
    .filter((v) => aramaEslesir(arama, v.musteriAd, v.hesapKodu, v.il, v.vekaletNoter));

  const FILTRELER: { kod: Durum | "hepsi"; etiket: string }[] = [
    { kod: "hepsi", etiket: "Hepsi" },
    { kod: "dolmus", etiket: "Süresi dolmuş" },
    { kod: "yakin", etiket: "90 gün içinde" },
    { kod: "gecerli", etiket: "Geçerli" },
    { kod: "suresiz", etiket: "Süresiz" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTRELER.map((f) => {
          const aktif = filtre === f.kod;
          const n = sayilar[f.kod] ?? 0;
          return (
            <button
              key={f.kod}
              onClick={() => setFiltre(f.kod)}
              className={cn(
                "inline-flex items-center gap-2 rounded-[9px] border px-3 py-1.5 text-[12.5px] transition-colors",
                aktif ? "border-slate-900 bg-slate-900 font-bold text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                      : "font-semibold text-muted-foreground hover:bg-muted",
              )}
            >
              {f.etiket}
              <span className={cn(
                "inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold tabular-nums",
                aktif ? "bg-white/20 dark:bg-slate-900/15" : "bg-muted-foreground/15",
              )}>{n}</span>
            </button>
          );
        })}
        <div className="relative ml-auto min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Firma, hesap kodu, il veya noter ara…"
            className="h-[36px] text-[13px]"
            style={{ paddingLeft: "2.35rem" }}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[14px] border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b bg-slate-50 dark:bg-slate-900/40">
              <tr>
                {["Firma", "Durum", "Bitiş", "Başlangıç", "Noter", ""].map((b, i) => (
                  <th key={b || `x${i}`} className="p-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="p-8 text-center text-[13px] text-muted-foreground">Yükleniyor…</td></tr>
              )}
              {!isLoading && suzulmus.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[13px] text-muted-foreground">
                    {satirlar.length === 0
                      ? "Henüz vekalet bilgisi yok. Müşteri Listesi Excel'ini içe aktarın."
                      : "Bu süzgece uyan kayıt yok."}
                  </td>
                </tr>
              )}
              {suzulmus.map((v) => {
                const d = DURUM_BILGI[v.durum];
                return (
                  <tr key={v.musteriId} className="border-b border-border/60">
                    <td className="p-3">
                      <div className="font-semibold">{v.musteriAd}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {v.hesapKodu}{v.il ? ` · ${v.il}` : ""}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className="inline-flex rounded-md px-2 py-1 text-[11.5px] font-bold"
                        style={{ background: d.arka, color: d.renk }}
                      >
                        {d.etiket}
                      </span>
                    </td>
                    <td className="p-3 text-[12.5px] font-bold tabular-nums">{fmtTarih(v.vekaletBitis)}</td>
                    <td className="p-3 text-[12.5px] tabular-nums text-muted-foreground">{fmtTarih(v.vekaletBaslangic)}</td>
                    <td className="p-3 text-[11.5px] text-muted-foreground">{v.vekaletNoter ?? "—"}</td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        className="h-[28px] gap-1.5 px-2 text-[11.5px] font-bold"
                        onClick={() => onMusteriAc(v.musteriId)}
                      >
                        Aç <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
