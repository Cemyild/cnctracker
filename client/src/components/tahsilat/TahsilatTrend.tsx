import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, BellRing } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { MusteriDrillDown } from "./MusteriDrillDown";

export function TahsilatTrend() {
  const [drillId, setDrillId] = useState<string | null>(null);
  const { data: analiz } = useQuery<any>({ queryKey: ["/api/tahsilat/analiz"] });
  const { data: mizanList, isLoading: l1 } = useQuery<any[]>({ queryKey: ["/api/tahsilat/mizan"] });

  const { data: dashboardListesi, isLoading: l2 } = useQuery<any[]>({
    queryKey: ["/api/tahsilat/trend-genel", mizanList?.length],
    queryFn: async () => {
      if (!mizanList?.length) return [];
      // Connection flood'u önlemek için en yeni 12 mizan ile sınırla.
      // Daha uzun trend için ileride server-side aggregate endpoint eklenebilir.
      const sinirli = mizanList.slice(0, 12);
      const results = await Promise.all(sinirli.map(async (m) => {
        const r = await fetch(`/api/tahsilat/dashboard?mizanId=${m.id}`);
        const j = await r.json();
        return { mizanTarihi: m.mizanTarihi, ozet: j.ozet };
      }));
      return results.filter((r) => r.ozet);
    },
    enabled: !!mizanList?.length,
  });

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);
  const fmtUsd = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmtPara = (v: number, doviz: string) => (doviz === "USD" ? fmtUsd(v) : fmtTry(v));

  if (l1 || l2) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>;
  if (!mizanList?.length) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş.</div>;
  if (!dashboardListesi?.length) return <div className="text-center text-muted-foreground py-12">Trend için en az 1 mizan gerekli.</div>;

  // Kronolojik sıraya çevir
  const trend = [...dashboardListesi].sort((a, b) => a.mizanTarihi.localeCompare(b.mizanTarihi)).map((d) => ({
    tarih: d.mizanTarihi,
    toplam: d.ozet.toplamNetAlacak,
    yavas: d.ozet.yavasOdeyiciCiro,
    donuk: d.ozet.donukCiro,
  }));

  return (
    <div className="space-y-4">
      {/* Ritmi bozulanlar — ödeme alışkanlığı öğrenilen ve sapan firmalar */}
      <div className="rounded-[14px] border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-rose-500" />
            <h3 className="text-[15px] font-bold">🔔 Ritmi Bozulanlar</h3>
          </div>
          <span className="text-[11.5px] text-muted-foreground">
            ritim ≥3 ödeme görülen firmadan öğrenilir · {analiz?.mizanSayisiYil ?? 0} mizan/yıl
          </span>
        </div>
        {!analiz?.alarmlar?.length ? (
          <div className="py-8 text-center text-[12.5px] text-muted-foreground">
            Alarm yok. Haftalık mizan biriktikçe firma ödeme ritmi öğrenilir; ritmini 2 kat aşan borçlular burada listelenir.
          </div>
        ) : (
          <div className="divide-y">
            {analiz.alarmlar.map((a: any) => (
              <div key={a.musteriId} className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50" onClick={() => setDrillId(a.musteriId)}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{a.ad}{a.doviz === "USD" ? " · USD" : ""}</div>
                  <div className="text-[11px] text-muted-foreground">
                    ort. <b>{a.ortalamaAralik} günde bir</b> öderdi · <b className="text-rose-600">{a.sonOdemeGun} gündür sessiz</b> · {a.odemeSayisi} ödeme görüldü
                  </div>
                </div>
                <div className="shrink-0 text-sm font-bold tabular-nums text-orange-700">{fmtPara(a.netBakiye, a.doviz)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-[14px] border bg-card p-5">
        <h3 className="text-[15px] font-bold">📈 Toplam Net Alacak Trendi</h3>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="tarih" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtTry(v)} contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }} />
              <Legend />
              <Line type="monotone" dataKey="toplam" stroke="#0ea5e9" strokeWidth={2} name="Toplam Net Alacak" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-[14px] border bg-card p-5">
        <h3 className="text-[15px] font-bold">⚠ Risk Altındaki Ciro</h3>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="tarih" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtTry(v)} contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }} />
              <Legend />
              <Line type="monotone" dataKey="yavas" stroke="#f59e0b" strokeWidth={2} name="Yavaş Ödeyici Ciro" />
              <Line type="monotone" dataKey="donuk" stroke="#dc2626" strokeWidth={2} name="Donuk Ciro" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <MusteriDrillDown musteriId={drillId} onClose={() => setDrillId(null)} />
    </div>
  );
}
