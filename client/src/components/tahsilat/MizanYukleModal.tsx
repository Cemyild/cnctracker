import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OnizlemeSonuc {
  filename: string;
  md5: string;
  mizanTarihi: string;
  toplamSatir: number;
  filtrelenenSatir: number;
  kayitSayisi: number;
  toplamBorc: number;
  toplamAlacak: number;
  uyarilar: string[];
  yeniMusteri: number;
  mevcutMusteri: number;
  duplicate: { id: string; mizanTarihi: string } | null;
}

export function MizanYukleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [mizanTarihi, setMizanTarihi] = useState<string>("");
  const [not, setNot] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [onizleme, setOnizleme] = useState<OnizlemeSonuc | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const reset = () => { setFile(null); setMizanTarihi(""); setNot(""); setOnizleme(null); };
  const handleClose = () => { reset(); onClose(); };

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  const handleOnizle = async () => {
    if (!file) return;
    setBusy(true); setOnizleme(null);
    const fd = new FormData();
    fd.append("xlsx", file);
    if (mizanTarihi) fd.append("mizanTarihi", mizanTarihi);
    try {
      const r = await fetch("/api/tahsilat/mizan/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOnizleme(j);
      if (!mizanTarihi && j.mizanTarihi) setMizanTarihi(j.mizanTarihi);
      toast({ title: "Önizleme hazır", description: `${j.kayitSayisi} müşteri okundu` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: e.message });
    } finally { setBusy(false); }
  };

  const handleSave = async () => {
    if (!file || !onizleme) return;
    if (onizleme.duplicate && !confirm(`Bu dosya ${onizleme.duplicate.mizanTarihi} tarihiyle daha önce yüklenmiş. Yine de yüklensin mi?`)) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("xlsx", file);
    fd.append("mizanTarihi", mizanTarihi || onizleme.mizanTarihi);
    if (not) fd.append("not", not);
    if (onizleme.duplicate) fd.append("overrideDuplicate", "true");
    try {
      const r = await fetch("/api/tahsilat/mizan/save", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast({ title: "Kaydedildi", description: `${j.eklenenMusteri} yeni, ${j.guncellenenMusteri} güncelleme, ${j.eklenenBakiye} bakiye kaydı` });
      qc.invalidateQueries({ queryKey: ["/api/tahsilat/mizan"] });
      qc.invalidateQueries({ queryKey: ["/api/tahsilat/dashboard"] });
      qc.invalidateQueries({ queryKey: ["/api/tahsilat/musteriler"] });
      qc.invalidateQueries({ queryKey: ["/api/tahsilat/eslestirme/onerileri"] });
      handleClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: e.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Mizan Yükle</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Mizan Tarihi (boş bırakılırsa dosya adından çıkarılır)</Label>
            <Input type="date" value={mizanTarihi} onChange={(e) => setMizanTarihi(e.target.value)} />
          </div>
          <div>
            <Label>Excel Dosyası</Label>
            <Input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setOnizleme(null); }} />
          </div>
          <div>
            <Label>Not (opsiyonel)</Label>
            <Textarea value={not} onChange={(e) => setNot(e.target.value)} rows={2} />
          </div>

          {!onizleme ? (
            <Button onClick={handleOnizle} disabled={!file || busy} className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Önizle
            </Button>
          ) : (
            <div className="space-y-3 border-t pt-3">
              <div className="text-sm font-semibold">Önizleme:</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>📅 Mizan tarihi: <strong>{onizleme.mizanTarihi}</strong></div>
                <div>📊 Müşteri sayısı: <strong>{onizleme.kayitSayisi}</strong></div>
                <div>➕ Yeni müşteri: <strong className="text-green-600">{onizleme.yeniMusteri}</strong></div>
                <div>🔄 Güncellenecek: <strong className="text-blue-600">{onizleme.mevcutMusteri}</strong></div>
                <div>💰 Toplam borç: <strong>{fmtTry(onizleme.toplamBorc)}</strong></div>
                <div>💵 Toplam alacak: <strong>{fmtTry(onizleme.toplamAlacak)}</strong></div>
              </div>
              {onizleme.uyarilar.length > 0 && (
                <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm">
                  <AlertTriangle className="w-4 h-4 inline mr-1 text-yellow-600" />
                  <strong>Uyarılar:</strong>
                  <ul className="list-disc list-inside mt-1 text-xs text-muted-foreground">
                    {onizleme.uyarilar.map((u, i) => <li key={i}>{u}</li>)}
                  </ul>
                </div>
              )}
              {onizleme.duplicate && (
                <div className="rounded border border-orange-500/30 bg-orange-500/5 p-3 text-sm">
                  <AlertTriangle className="w-4 h-4 inline mr-1 text-orange-600" />
                  Bu dosya <strong>{onizleme.duplicate.mizanTarihi}</strong> tarihiyle daha önce yüklenmiş. "Onayla ve Kaydet"e basarsan tekrar yüklenecek.
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOnizleme(null)} className="flex-1">Geri</Button>
                <Button onClick={handleSave} disabled={busy} className="flex-1">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Onayla ve Kaydet
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
