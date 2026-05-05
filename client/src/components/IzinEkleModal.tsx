import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Info, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IzinEkleModalProps {
  open: boolean;
  onClose: () => void;
  defaultTcNo?: string | null;
  defaultDate?: string | null;
  editIzin?: any | null;
}

export function IzinEkleModal({ open, onClose, defaultTcNo, defaultDate, editIzin }: IzinEkleModalProps) {
  const isEdit = !!editIzin;
  const [tcNo, setTcNo] = useState<string>("");
  const [tur, setTur] = useState<"YILLIK" | "MAZERET">("YILLIK");
  const [bas, setBas] = useState<string>("");
  const [bit, setBit] = useState<string>("");
  const [aciklama, setAciklama] = useState<string>("");
  const [parayaCevrildi, setParayaCevrildi] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: calisanlar } = useQuery<any[]>({ queryKey: ["/api/calisanlar"], enabled: open });
  const { data: bakiyeler } = useQuery<any[]>({ queryKey: ["/api/izinler/bakiye"], enabled: open });
  const { data: tatiller } = useQuery<any[]>({ queryKey: ["/api/resmi-tatiller"], enabled: open });

  // Aktif çalışanlar (en yeni bordrodakiler)
  const aktifler = useMemo(() => {
    if (!calisanlar?.length) return [];
    let maxYil = 0; let maxAy = "";
    calisanlar.forEach((c: any) => {
      if (c.yil > maxYil) { maxYil = c.yil; maxAy = c.ay; }
      else if (c.yil === maxYil && c.ay > maxAy) { maxAy = c.ay; }
    });
    return calisanlar.filter((c: any) => c.yil === maxYil && c.ay === maxAy);
  }, [calisanlar]);

  // Form'u açılışta resetle
  useEffect(() => {
    if (open) {
      if (isEdit && editIzin) {
        setTcNo(editIzin.tcNo);
        setTur(editIzin.tur);
        setBas(editIzin.baslangicTarihi);
        setBit(editIzin.bitisTarihi);
        setAciklama(editIzin.aciklama ?? "");
        setParayaCevrildi(!!editIzin.parayaCevrildi);
      } else {
        setTcNo(defaultTcNo ?? "");
        setTur("YILLIK");
        setBas(defaultDate ?? "");
        setBit(defaultDate ?? "");
        setAciklama("");
        setParayaCevrildi(false);
      }
    }
  }, [open, isEdit, editIzin, defaultTcNo, defaultDate]);

  // İş günü hesabı (canlı önizleme)
  const tatilSet = useMemo(() => new Set((tatiller ?? []).map((t: any) => t.tarih)), [tatiller]);
  const isGunHesabi = useMemo(() => {
    if (!bas || !bit || bas > bit) return null;
    let count = 0; let total = 0; let weekend = 0; let rt = 0;
    const startMs = Date.UTC(+bas.slice(0, 4), +bas.slice(5, 7) - 1, +bas.slice(8, 10));
    const endMs = Date.UTC(+bit.slice(0, 4), +bit.slice(5, 7) - 1, +bit.slice(8, 10));
    for (let ms = startMs; ms <= endMs; ms += 86400000) {
      const d = new Date(ms);
      const dow = d.getUTCDay();
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const iso = `${yyyy}-${mm}-${dd}`;
      total++;
      if (dow === 0 || dow === 6) weekend++;
      else if (tatilSet.has(iso)) rt++;
      else count++;
    }
    return { count, total, weekend, rt };
  }, [bas, bit, tatilSet]);

  // Paraya çevirme tutarı
  const seciliBakiye = bakiyeler?.find((b) => b.tcNo === tcNo);
  const parayaCevirmeTutar = useMemo(() => {
    if (!parayaCevrildi || !seciliBakiye?.netUcret || !isGunHesabi?.count) return 0;
    return Math.round((Number(seciliBakiye.netUcret) / 30) * isGunHesabi.count * 100) / 100;
  }, [parayaCevrildi, seciliBakiye, isGunHesabi]);

  const handleSave = async () => {
    if (!tcNo || !bas || !bit || !tur) { toast({ variant: "destructive", title: "Zorunlu alanlar eksik" }); return; }
    if (bas > bit) { toast({ variant: "destructive", title: "Başlangıç bitişten sonra olamaz" }); return; }
    if (isGunHesabi?.count === 0) {
      if (!confirm("Tüm tarihler hafta sonu/resmi tatil — iş günü 0. Yine de kaydedilsin mi?")) return;
    }
    setBusy(true);
    const body = {
      tcNo, baslangicTarihi: bas, bitisTarihi: bit, tur, aciklama: aciklama || null,
      parayaCevrildi, parayaCevrilenTutar: parayaCevrildi ? parayaCevirmeTutar : null,
    };
    const url = isEdit ? `/api/izinler/${editIzin.id}` : "/api/izinler";
    const method = isEdit ? "PUT" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      toast({ variant: "destructive", title: "Hata", description: e.error || "Kaydetme başarısız" });
      return;
    }
    toast({ title: isEdit ? "Güncellendi" : "Kaydedildi" });
    qc.invalidateQueries({ queryKey: ["/api/izinler"] });
    qc.invalidateQueries({ queryKey: ["/api/izinler/bakiye"] });
    qc.invalidateQueries({ queryKey: ["/api/izinler/takvim"] });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "İzin Düzenle" : "Yeni İzin Ekle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Çalışan</Label>
            <Select value={tcNo} onValueChange={setTcNo}>
              <SelectTrigger><SelectValue placeholder="Çalışan seçin" /></SelectTrigger>
              <SelectContent>
                {aktifler
                  .filter((c: any) => c.tcNo && String(c.tcNo).trim().length > 0)
                  .map((c: any) => <SelectItem key={c.tcNo} value={c.tcNo}>{c.adSoyad}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tür</Label>
            <div className="flex gap-2 mt-1">
              <Button variant={tur === "YILLIK" ? "default" : "outline"} onClick={() => setTur("YILLIK")} type="button" className={tur === "YILLIK" ? "bg-blue-600 hover:bg-blue-700" : ""}>Yıllık</Button>
              <Button variant={tur === "MAZERET" ? "default" : "outline"} onClick={() => setTur("MAZERET")} type="button" className={tur === "MAZERET" ? "bg-orange-500 hover:bg-orange-600" : ""}>Mazeret</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Başlangıç</Label>
              <Input type="date" value={bas} onChange={(e) => setBas(e.target.value)} />
            </div>
            <div>
              <Label>Bitiş</Label>
              <Input type="date" value={bit} onChange={(e) => setBit(e.target.value)} />
            </div>
          </div>
          {isGunHesabi && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
              <div>
                Hesaplanan iş günü: <strong className="text-primary">{isGunHesabi.count} gün</strong>
                <span className="text-muted-foreground"> ({isGunHesabi.total} takvim - {isGunHesabi.weekend} hafta sonu - {isGunHesabi.rt} resmi tatil)</span>
                {isGunHesabi.count === 0 && (
                  <div className="text-amber-600 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" /> Tüm tarihler tatil günü
                  </div>
                )}
              </div>
            </div>
          )}
          <div>
            <Label>Açıklama (opsiyonel)</Label>
            <Textarea value={aciklama} onChange={(e) => setAciklama(e.target.value)} rows={2} placeholder="Doktor randevusu, vefat, evlilik vs." />
          </div>
          {tur === "YILLIK" && (
            <div className="flex items-start gap-3 rounded-lg border bg-green-500/5 border-green-500/20 p-3">
              <Switch checked={parayaCevrildi} onCheckedChange={setParayaCevrildi} />
              <div className="flex-1">
                <Label className="cursor-pointer">Bu izni paraya çevir</Label>
                {parayaCevrildi && parayaCevirmeTutar > 0 && (
                  <div className="text-sm text-green-700 mt-1">
                    Hesap: <strong>{new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(parayaCevirmeTutar)}</strong>
                    <span className="text-muted-foreground"> (günlük net × {isGunHesabi?.count} gün)</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {isEdit ? "Güncelle" : "Kaydet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
