import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function EslestirmeUI() {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/tahsilat/eslestirme/onerileri"] });
  const [resetting, setResetting] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const handleOnayla = async (id: string) => {
    const r = await fetch(`/api/tahsilat/eslestirme/onayla/${id}`, { method: "POST" });
    if (!r.ok) { toast({ variant: "destructive", title: "Hata" }); return; }
    toast({ title: "Onaylandı" });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/eslestirme/onerileri"] });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/musteriler"] });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/dashboard"] });
  };

  const handleReddet = async (id: string) => {
    const r = await fetch(`/api/tahsilat/eslestirme/reddet/${id}`, { method: "POST" });
    if (!r.ok) { toast({ variant: "destructive", title: "Hata" }); return; }
    toast({ title: "Reddedildi" });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/eslestirme/onerileri"] });
  };

  const handleReset = async () => {
    if (!confirm(
      "Tüm bekleyen önerileri sileceğim ve eşleşmesi olmayan müşteriler için yeniden hesaplayacağım.\n\n" +
      "(Algoritma değişikliği sonrası mevcut önerileri tazelemek için kullanılır.)\n\nDevam edilsin mi?"
    )) return;
    setResetting(true);
    try {
      const r = await fetch("/api/tahsilat/eslestirme/reset", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast({
        title: "Eşleştirme Sıfırlandı",
        description: `${j.silinenEskiOneri} eski öneri silindi · ${j.kontroliMusteri} müşteri kontrol edildi · ${j.yeniOtomatikEslesen} otomatik eşleşti · ${j.yeniOneri} yeni öneri`,
      });
      qc.invalidateQueries({ queryKey: ["/api/tahsilat/eslestirme/onerileri"] });
      qc.invalidateQueries({ queryKey: ["/api/tahsilat/musteriler"] });
      qc.invalidateQueries({ queryKey: ["/api/tahsilat/dashboard"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: e.message });
    } finally {
      setResetting(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Bekleyen Eşleştirme Önerileri ({data?.length || 0})</CardTitle>
              <div className="text-xs text-muted-foreground mt-1">
                Sistem mizan'daki müşteri adları ile gümrük modülündeki firma unvanları arasında benzerlik tespit etti.
                Her bir öneriyi onayla veya reddet.
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset} disabled={resetting} className="shrink-0">
              {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Sıfırla & Yeniden Hesapla
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!data?.length ? (
            <div className="text-center text-muted-foreground py-12">Bekleyen eşleştirme önerisi yok 🎉</div>
          ) : (
          <div className="space-y-2">
            {data.map((o: any) => {
              const skor = Number(o.benzerlikSkoru);
              const skorColor = skor >= 0.9 ? "bg-green-600" : skor >= 0.85 ? "bg-blue-600" : "bg-yellow-600";
              return (
                <div key={o.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-accent/40">
                  <div className="flex-1 min-w-0 grid grid-cols-2 gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground uppercase">Mizan'daki müşteri</div>
                      <div className="font-medium truncate" title={o.musteriAd}>{o.musteriAd}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground uppercase">Gümrük'teki unvan</div>
                      <div className="font-medium truncate" title={o.gumrukUnvan}>{o.gumrukUnvan}</div>
                    </div>
                  </div>
                  <Badge className={`${skorColor} shrink-0`}>%{(skor * 100).toFixed(0)}</Badge>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-8 text-green-600" onClick={() => handleOnayla(o.id)}>
                      <Check className="w-4 h-4 mr-1" /> Onayla
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-red-600" onClick={() => handleReddet(o.id)}>
                      <X className="w-4 h-4 mr-1" /> Reddet
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
