import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, RefreshCw, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>;

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border bg-card overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[9px] bg-sky-50 text-sky-600">
              <Link2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold">Bekleyen Eşleştirme Önerileri ({data?.length || 0})</h3>
              <div className="mt-1 text-xs text-muted-foreground">
                Sistem mizan'daki müşteri adları ile gümrük modülündeki firma unvanları arasında benzerlik tespit etti.
                Her bir öneriyi onayla veya reddet.
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={resetting} className="h-[38px] shrink-0 rounded-[9px]">
            {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Sıfırla & Yeniden Hesapla
          </Button>
        </div>
        <div className="p-5">
          {!data?.length ? (
            <div className="text-center text-muted-foreground py-12">Bekleyen eşleştirme önerisi yok 🎉</div>
          ) : (
            <div className="space-y-2">
              {data.map((o: any) => {
                const skor = Number(o.benzerlikSkoru);
                const skorColor = skor >= 0.9 ? "bg-emerald-50 text-emerald-700" : skor >= 0.85 ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700";
                return (
                  <div key={o.id} className="flex items-center justify-between gap-3 rounded-[11px] border p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0 grid grid-cols-2 gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mizan'daki müşteri</div>
                        <div className="font-medium truncate" title={o.musteriAd}>{o.musteriAd}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gümrük'teki unvan</div>
                        <div className="font-medium truncate" title={o.gumrukUnvan}>{o.gumrukUnvan}</div>
                      </div>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums", skorColor)}>%{(skor * 100).toFixed(0)}</span>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-8 text-emerald-600" onClick={() => handleOnayla(o.id)}>
                        <Check className="w-4 h-4 mr-1" /> Onayla
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-rose-600" onClick={() => handleReddet(o.id)}>
                        <X className="w-4 h-4 mr-1" /> Reddet
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
