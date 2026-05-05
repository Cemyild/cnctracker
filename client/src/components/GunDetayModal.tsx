import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface GunDetayModalProps {
  open: boolean;
  onClose: () => void;
  tarih: string | null;
  izinler: any[];
  adMap: Map<string, string>;
  onEkle: (tarih: string) => void;
  onDuzenle: (izin: any) => void;
}

export function GunDetayModal({ open, onClose, tarih, izinler, adMap, onEkle, onDuzenle }: GunDetayModalProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  if (!tarih) return null;

  const gununIzinleri = izinler.filter((i) => tarih >= i.baslangicTarihi && tarih <= i.bitisTarihi);

  const handleDelete = async (id: string) => {
    if (!confirm("Bu izin kaydı silinsin mi?")) return;
    const r = await fetch(`/api/izinler/${id}`, { method: "DELETE" });
    if (!r.ok) { toast({ variant: "destructive", title: "Silinemedi" }); return; }
    toast({ title: "Silindi" });
    qc.invalidateQueries({ queryKey: ["/api/izinler"] });
    qc.invalidateQueries({ queryKey: ["/api/izinler/takvim"] });
    qc.invalidateQueries({ queryKey: ["/api/izinler/bakiye"] });
  };

  // dd Ay yyyy, gün
  const labelTarih = (() => {
    const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const gunler = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
    const [y, m, d] = tarih.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return `${d} ${aylar[m - 1]} ${y}, ${gunler[date.getUTCDay()]}`;
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{labelTarih}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {gununIzinleri.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">Bu gün izinli kimse yok.</div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">İzinli çalışanlar ({gununIzinleri.length}):</div>
              {gununIzinleri.map((iz) => (
                <div key={iz.id} className="border rounded-lg p-3 flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge className={iz.tur === "YILLIK" ? "bg-blue-600" : "bg-orange-500"}>
                        {iz.tur === "YILLIK" ? "Yıllık" : "Mazeret"}
                      </Badge>
                      <span className="font-semibold">{adMap.get(iz.tcNo) ?? iz.tcNo}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {iz.baslangicTarihi} → {iz.bitisTarihi} ({iz.gunSayisi} gün)
                    </div>
                    {iz.aciklama && <div className="text-sm">{iz.aciklama}</div>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { onDuzenle(iz); onClose(); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => handleDelete(iz.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button className="w-full" onClick={() => { onEkle(tarih); onClose(); }}>
            <Plus className="w-4 h-4 mr-1" /> Bu güne yeni izin ekle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
