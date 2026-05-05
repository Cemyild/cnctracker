import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Building2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useToast } from "@/hooks/use-toast";

export function MusteriDrillDown({ musteriId, onClose }: { musteriId: string | null; onClose: () => void }) {
  const open = !!musteriId;
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/tahsilat/musteriler/${musteriId}`],
    queryFn: async () => {
      const r = await fetch(`/api/tahsilat/musteriler/${musteriId}`);
      return r.json();
    },
    enabled: open,
  });
  const { toast } = useToast();
  const qc = useQueryClient();

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  const handleRemoveUnvan = async (unvan: string) => {
    if (!data?.musteri) return;
    if (!confirm(`"${unvan}" eşleşmesi silinsin mi?`)) return;
    const r = await fetch(`/api/tahsilat/eslestirme/${data.musteri.id}/${encodeURIComponent(unvan)}`, { method: "DELETE" });
    if (!r.ok) { toast({ variant: "destructive", title: "Silinemedi" }); return; }
    toast({ title: "Silindi" });
    qc.invalidateQueries({ queryKey: [`/api/tahsilat/musteriler/${musteriId}`] });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/dashboard"] });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
        {isLoading || !data ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                {data.musteri.ad}
              </DialogTitle>
              <div className="text-xs text-muted-foreground">
                {data.musteri.hesapKodu} · {data.musteri.sektor || "Sektörsüz"} · {data.musteri.firmaGrubu || ""}
                {data.musteri.limitTutar && ` · Limit: ${fmtTry(Number(data.musteri.limitTutar))}`}
              </div>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Trend grafiği */}
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm font-semibold mb-2">📈 Bakiye Geçmişi</div>
                  {data.timeline.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">Henüz bakiye kaydı yok</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={data.timeline.map((t: any) => ({
                        tarih: t.mizanTarihi,
                        bakiye: (t.sonBakiyeBA === "A" ? -1 : 1) * Number(t.sonBakiye),
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="tarih" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any) => fmtTry(v)} />
                        <Line type="monotone" dataKey="bakiye" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Eşleşen gümrük unvanları */}
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm font-semibold mb-2">🔗 Eşleşen Gümrük Unvanları</div>
                  {(data.musteri.gumrukFirmaUnvanlari || []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">Eşleşme yok. Eşleştirme sekmesinden ekleyebilirsin.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {data.musteri.gumrukFirmaUnvanlari.map((u: string) => (
                        <Badge key={u} variant="outline" className="gap-1.5">
                          {u}
                          <button onClick={() => handleRemoveUnvan(u)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tüm bakiye kayıtları */}
              <Card>
                <CardContent className="p-0">
                  <div className="text-sm font-semibold p-4 pb-2">📋 Tüm Mizan Kayıtları ({data.timeline.length})</div>
                  <div className="max-h-[300px] overflow-y-auto">
                    <Table className="text-xs">
                      <TableHeader className="sticky top-0 bg-muted">
                        <TableRow>
                          <TableHead>Tarih</TableHead>
                          <TableHead className="text-right">Borç</TableHead>
                          <TableHead className="text-right">Alacak</TableHead>
                          <TableHead className="text-right">Net Bakiye</TableHead>
                          <TableHead>Son Borç</TableHead>
                          <TableHead>Son Ödeme</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...data.timeline].reverse().map((t: any) => {
                          const nb = (t.sonBakiyeBA === "A" ? -1 : 1) * Number(t.sonBakiye);
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="font-medium tabular-nums">{t.mizanTarihi}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtTry(Number(t.borc))}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtTry(Number(t.alacak))}</TableCell>
                              <TableCell className={`text-right tabular-nums font-semibold ${nb < 0 ? "text-blue-600" : ""}`}>{fmtTry(nb)}</TableCell>
                              <TableCell className="tabular-nums">{t.sonBorcTarihi || "-"}</TableCell>
                              <TableCell className="tabular-nums">{t.sonAlacakTarihi || "-"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
