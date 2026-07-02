import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

const SEKTOR_RENKLER = ["#0ea5e9", "#10b981", "#f59e0b", "#dc2626", "#7c3aed", "#06b6d4", "#84cc16", "#ec4899"];

const PATTERN_LABEL: Record<string, string> = {
  SAGLIKLI: "Sağlıklı", VIP_AKTIF_RISK: "VIP Aktif", TAKIP_GEREKEN: "Takip", YAVAS_ODEYICI: "Yavaş", DONUK_KAYIP: "Donuk",
};
const PATTERN_PILL: Record<string, string> = {
  SAGLIKLI: "bg-emerald-50 text-emerald-700",
  VIP_AKTIF_RISK: "bg-sky-50 text-sky-700",
  TAKIP_GEREKEN: "bg-yellow-50 text-yellow-700",
  YAVAS_ODEYICI: "bg-amber-50 text-amber-700",
  DONUK_KAYIP: "bg-rose-50 text-rose-700",
};

export function TahsilatOzet({ mizanId }: { mizanId?: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/tahsilat/dashboard", mizanId],
    queryFn: async () => {
      const r = await fetch(`/api/tahsilat/dashboard${mizanId ? `?mizanId=${mizanId}` : ""}`);
      return r.json();
    },
  });

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>;
  if (!data?.mizan) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş.</div>;

  const o = data.ozet;
  const enKritikler = (data.musteriler as any[])
    .filter((m) => m.netBakiye > 0)
    .sort((a, b) => {
      // Önce risk pattern (Donuk > Yavaş > VIP > Takip > Sağlıklı), sonra bakiye
      const order: Record<string, number> = { DONUK_KAYIP: 0, YAVAS_ODEYICI: 1, VIP_AKTIF_RISK: 2, TAKIP_GEREKEN: 3, SAGLIKLI: 4 };
      if (order[a.pattern] !== order[b.pattern]) return order[a.pattern] - order[b.pattern];
      return b.netBakiye - a.netBakiye;
    })
    .slice(0, 10);

  // 5 KPI (accent-bar) — sayı + tutar birlikte korunur
  const kpis = [
    { label: "Toplam Net Alacak", value: fmtTry(o.toplamNetAlacak), sub: `${(data.musteriler as any[]).length} müşteri`, color: "#0ea5e9" },
    { label: "VIP", value: fmtTry(o.vipBakiyeToplam), sub: `${o.vipSayisi} müşteri`, color: "#0284c7" },
    { label: "Yavaş Ödeyici", value: fmtTry(o.yavasOdeyiciCiro), sub: `${o.yavasOdeyiciSayisi} müşteri`, color: "#f59e0b" },
    { label: "Donuk / Kayıp", value: fmtTry(o.donukCiro), sub: `${o.donukSayisi} müşteri`, color: "#dc2626" },
    { label: "Eksi Pozisyon", value: fmtTry(o.eksiPozisyonToplam), sub: `${o.eksiPozisyonSayisi} müşteri`, color: "#7c3aed" },
  ];

  return (
    <div className="space-y-[18px]">
      {/* 5 KPI kartı — accent-bar */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
            <div className="pl-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">{k.label}</div>
            <div className="mt-2 pl-2 text-[20px] font-extrabold tracking-tight tabular-nums" style={{ color: k.color }}>{k.value}</div>
            <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* En Kritik 10 Müşteri */}
        <div className="rounded-[14px] border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <h3 className="text-[15px] font-bold">En Kritik 10 Müşteri</h3>
          </div>
          {enKritikler.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">Risk altında müşteri yok 🎉</div>
          ) : (
            <div className="divide-y">
              {enKritikler.map((m, i) => (
                <div key={m.musteriId} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{i + 1}. {m.ad}</div>
                    <div className="text-[10.5px] text-muted-foreground">{m.sektor || "Sektörsüz"} · Gecikme: {m.gecikme >= 9999 ? "—" : `${m.gecikme}g`}</div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
                    <div className="font-bold text-sm text-orange-700">{fmtTry(m.netBakiye)}</div>
                    <span className={cn("mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", PATTERN_PILL[m.pattern])}>{PATTERN_LABEL[m.pattern] || m.pattern}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sektör Dağılımı (Net Alacak) */}
        <div className="rounded-[14px] border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b">
            <TrendingUp className="w-4 h-4 text-sky-500" />
            <h3 className="text-[15px] font-bold">Sektör Dağılımı (Net Alacak)</h3>
          </div>
          <div className="p-5">
            {o.sektorDagilim.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">Veri yok</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={o.sektorDagilim.filter((s: any) => s.toplam > 0)}
                    dataKey="toplam"
                    nameKey="sektor"
                    cx="50%" cy="50%"
                    outerRadius={100}
                    innerRadius={60}
                    label={(e) => `${e.sektor}: ${(e.percent * 100).toFixed(0)}%`}
                  >
                    {o.sektorDagilim.map((_: any, i: number) => <Cell key={i} fill={SEKTOR_RENKLER[i % SEKTOR_RENKLER.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtTry(v)} contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
