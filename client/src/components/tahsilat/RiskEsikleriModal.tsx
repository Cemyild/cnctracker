import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Settings } from "lucide-react";

export function RiskEsikleriModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: ayarlar } = useQuery<any>({ queryKey: ["/api/tahsilat/ayarlar"], enabled: open });
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (ayarlar) setForm({
      vipEsik: ayarlar.vipEsik,
      yuksekBakiyeEsik: ayarlar.yuksekBakiyeEsik,
      eskiOdemeEsik: ayarlar.eskiOdemeEsik,
      cokEskiOdemeEsik: ayarlar.cokEskiOdemeEsik,
      eksiPozisyonYuzde: ayarlar.eksiPozisyonYuzde,
      faturaPenceresi: ayarlar.faturaPenceresi,
      ciroEsik: ayarlar.ciroEsik,
      odemeOraniEsik: ayarlar.odemeOraniEsik,
    });
  }, [ayarlar]);

  const handleSave = async () => {
    setBusy(true);
    const r = await fetch("/api/tahsilat/ayarlar", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setBusy(false);
    if (!r.ok) { toast({ variant: "destructive", title: "Hata" }); return; }
    toast({ title: "Ayarlar güncellendi" });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat"] });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sky-50 text-sky-600"><Settings className="h-[18px] w-[18px]" /></span>
            Risk Eşikleri
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>VIP Müşteri Eşiği (yıllık fatura, TL)</Label><Input type="number" value={form.vipEsik || ""} onChange={(e) => setForm({ ...form, vipEsik: e.target.value })} /></div>
          <div><Label>Yüksek Bakiye Eşiği (TL)</Label><Input type="number" value={form.yuksekBakiyeEsik || ""} onChange={(e) => setForm({ ...form, yuksekBakiyeEsik: e.target.value })} /></div>
          <div><Label>Eski Ödeme Eşiği (gün)</Label><Input type="number" value={form.eskiOdemeEsik || ""} onChange={(e) => setForm({ ...form, eskiOdemeEsik: parseInt(e.target.value) })} /></div>
          <div><Label>Çok Eski Ödeme Eşiği (gün)</Label><Input type="number" value={form.cokEskiOdemeEsik || ""} onChange={(e) => setForm({ ...form, cokEskiOdemeEsik: parseInt(e.target.value) })} /></div>
          <div><Label>Eksi Pozisyon Yüzdesi (%)</Label><Input type="number" value={form.eksiPozisyonYuzde || ""} onChange={(e) => setForm({ ...form, eksiPozisyonYuzde: parseInt(e.target.value) })} /></div>
          <div><Label>Fatura Penceresi (gün)</Label><Input type="number" value={form.faturaPenceresi || ""} onChange={(e) => setForm({ ...form, faturaPenceresi: parseInt(e.target.value) })} /></div>
          <div><Label>Ciro Eşiği — "kazandırıyor" sınırı (yıllık, TL)</Label><Input type="number" value={form.ciroEsik || ""} onChange={(e) => setForm({ ...form, ciroEsik: e.target.value })} /></div>
          <div><Label>Ödeme Oranı Eşiği — "ödüyor" sınırı (%)</Label><Input type="number" value={form.odemeOraniEsik || ""} onChange={(e) => setForm({ ...form, odemeOraniEsik: parseInt(e.target.value) })} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Kaydet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
