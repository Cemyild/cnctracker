import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { MusteriDrillDown } from "./MusteriDrillDown";

// Borç/Ciro oranı: yıl içinde kestiğim faturaya kıyasla firma bana ne kadar borçlu?
// Oran = netBakiye ÷ YTD ciro. Ciro 0 (hiç fatura görünmüyor) → ∞, en üstte.
// USD hesaplar hariç (dolar borcu TL ciroya oranlanmaz); toplamı başlıkta gösterilir.
export function BorcCiroOrani({ mizanId }: { mizanId?: string }) {
  const [drillId, setDrillId] = useState<string | null>(null);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/tahsilat/dashboard", mizanId],
    queryFn: async () => {
      const r = await fetch(`/api/tahsilat/dashboard${mizanId ? `?mizanId=${mizanId}` : ""}`);
      return r.json();
    },
  });

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);
  const fmtUsd = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>;
  if (!data?.mizan) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş.</div>;

  const liste = (data.musteriler as any[])
    .filter((m) => m.doviz === "TL" && m.netBakiye > 0)
    .map((m) => ({
      ...m,
      oran: m.ytdCiro > 0 ? m.netBakiye / m.ytdCiro : Infinity,
    }))
    .sort((a, b) => (b.oran === a.oran ? b.netBakiye - a.netBakiye : b.oran - a.oran));

  const usdToplam = data.ozet?.toplamNetAlacakUsd || 0;

  const oranGoster = (m: any) => {
    if (m.oran === Infinity) return <span title="Yıl içinde bu firmaya kesilmiş fatura görünmüyor" className="font-extrabold text-rose-600">∞</span>;
    const yuzde = Math.round(m.oran * 100);
    return (
      <span className={cn("font-bold", yuzde >= 100 ? "text-rose-600" : yuzde >= 50 ? "text-amber-600" : "text-emerald-600")}>
        %{yuzde.toLocaleString("tr-TR")}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-sky-500" />
            <h3 className="text-[15px] font-bold">Borç / Ciro Oranı</h3>
            <span className="text-[11.5px] text-muted-foreground">— kazandırdığından çok borçlu olanlar üstte</span>
          </div>
          <span className="text-[11.5px] tabular-nums text-muted-foreground">
            {liste.length} borçlu TL hesabı{usdToplam > 0 ? ` · USD hesaplar hariç (${fmtUsd(usdToplam)} dışarıda)` : ""}
          </span>
        </div>
        {liste.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">Borçlu firma yok 🎉</div>
        ) : (
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 text-left">#</th>
                  <th className="px-3 py-2.5 text-left">Firma</th>
                  <th className="px-3 py-2.5 text-right">Borç</th>
                  <th className="px-3 py-2.5 text-right">Yıl İçi Kesilen Fatura</th>
                  <th className="px-5 py-2.5 text-right">Borç / Ciro</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {liste.map((m, i) => (
                  <tr key={m.musteriId} className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setDrillId(m.musteriId)}>
                    <td className="px-5 py-3 text-[12px] tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="max-w-[320px] truncate font-semibold">{m.ad}</span>
                        {m.eslesmemis && <span title="Gümrük eşleşmesi yok — ciro bilinmiyor" className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">eşleşmemiş</span>}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">{m.hesapKodu}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-orange-700 whitespace-nowrap">{fmtTry(m.netBakiye)}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{m.ytdCiro > 0 ? fmtTry(m.ytdCiro) : "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{oranGoster(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MusteriDrillDown musteriId={drillId} onClose={() => setDrillId(null)} />
    </div>
  );
}
