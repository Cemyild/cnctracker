import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export function TahsilatTrend() {
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

  if (l1 || l2) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
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
      <Card>
        <CardHeader><CardTitle>📈 Toplam Net Alacak Trendi</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tarih" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtTry(v)} />
              <Legend />
              <Line type="monotone" dataKey="toplam" stroke="#3b82f6" strokeWidth={2} name="Toplam Net Alacak" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>⚠ Risk Altındaki Ciro</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tarih" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtTry(v)} />
              <Legend />
              <Line type="monotone" dataKey="yavas" stroke="#f97316" strokeWidth={2} name="Yavaş Ödeyici Ciro" />
              <Line type="monotone" dataKey="donuk" stroke="#dc2626" strokeWidth={2} name="Donuk Ciro" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
