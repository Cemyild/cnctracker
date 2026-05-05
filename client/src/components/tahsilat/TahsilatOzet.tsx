import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, AlertTriangle, Star, Banknote, Zap, AlertCircle } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

const SEKTOR_RENKLER = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#ec4899"];

export function TahsilatOzet({ mizanId }: { mizanId?: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/tahsilat/dashboard", mizanId],
    queryFn: async () => {
      const r = await fetch(`/api/tahsilat/dashboard${mizanId ? `?mizanId=${mizanId}` : ""}`);
      return r.json();
    },
  });

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Banknote className="w-3.5 h-3.5" /> Toplam Net Alacak</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums">{fmtTry(o.toplamNetAlacak)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-600">
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Star className="w-3.5 h-3.5 text-blue-600" /> VIP ({o.vipSayisi})</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums text-blue-600">{fmtTry(o.vipBakiyeToplam)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 text-orange-500" /> Yavaş Ödeyici ({o.yavasOdeyiciSayisi})</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums text-orange-600">{fmtTry(o.yavasOdeyiciCiro)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-600">
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Donuk/Kayıp ({o.donukSayisi})</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums text-red-600">{fmtTry(o.donukCiro)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-600">
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-purple-600" /> Eksi Pozisyon ({o.eksiPozisyonSayisi})</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums text-purple-600">{fmtTry(o.eksiPozisyonToplam)}</div></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> En Kritik 10 Müşteri</CardTitle></CardHeader>
          <CardContent className="p-0">
            {enKritikler.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">Risk altında müşteri yok 🎉</div>
            ) : (
              <div className="divide-y">
                {enKritikler.map((m, i) => (
                  <div key={m.musteriId} className="p-3 flex items-center justify-between gap-2 hover:bg-accent/40">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{i + 1}. {m.ad}</div>
                      <div className="text-[10px] text-muted-foreground">{m.sektor || "Sektörsüz"} · Gecikme: {m.gecikme >= 9999 ? "—" : `${m.gecikme}g`}</div>
                    </div>
                    <div className="text-right tabular-nums shrink-0">
                      <div className="font-bold text-sm text-orange-700">{fmtTry(m.netBakiye)}</div>
                      <div className="text-[10px]">{m.pattern}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Sektör Dağılımı (Net Alacak)</CardTitle></CardHeader>
          <CardContent>
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
                  <Tooltip formatter={(v: any) => fmtTry(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
