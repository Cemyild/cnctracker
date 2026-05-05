import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Calendar, Banknote, Edit2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BakiyeRow {
  tcNo: string;
  adSoyad: string;
  iseGirisTarihi: string | null;
  kidemYili: number;
  yillikHakkiPerYil: number;
  acilisBakiyesi: number;
  toplamHakEdilen: number;
  kullanilan: number;
  guncelBakiye: number;
  netUcret: number;
  gunlukNet: number;
  sube: string | null;
}

export function IzinBakiye({ onYeniIzin }: { onYeniIzin: (tcNo: string) => void }) {
  const { data: bakiyeler, isLoading } = useQuery<BakiyeRow[]>({
    queryKey: ["/api/izinler/bakiye"],
  });
  const [editingTcNo, setEditingTcNo] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<string>("");
  const [parayaTcNo, setParayaTcNo] = useState<string | null>(null);
  const [parayaGun, setParayaGun] = useState<string>("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  const handleAcilisSave = async (tcNo: string) => {
    const num = parseInt(editVal);
    if (isNaN(num)) { toast({ variant: "destructive", title: "Geçersiz sayı" }); return; }
    const r = await fetch(`/api/izinler/acilis-bakiye/${tcNo}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acilisBakiyesi: num, acilisTarihi: "2026-01-01" }),
    });
    if (!r.ok) { toast({ variant: "destructive", title: "Hata" }); return; }
    toast({ title: "Açılış bakiyesi güncellendi" });
    setEditingTcNo(null);
    qc.invalidateQueries({ queryKey: ["/api/izinler/bakiye"] });
  };

  const handleParayaCevir = async (b: BakiyeRow) => {
    const gun = parseInt(parayaGun);
    if (isNaN(gun) || gun <= 0) { toast({ variant: "destructive", title: "Geçerli gün sayısı girin" }); return; }
    if (gun > b.guncelBakiye) {
      if (!confirm(`Bakiyeniz ${b.guncelBakiye} gün, ${gun} gün izin paraya çevriliyor. Devam edilsin mi?`)) return;
    }
    const tutar = (b.netUcret / 30) * gun;
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch(`/api/izinler`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tcNo: b.tcNo,
        baslangicTarihi: today,
        bitisTarihi: today,
        tur: "YILLIK",
        aciklama: `${gun} gün izin paraya çevrildi (otomatik kayıt)`,
        parayaCevrildi: true,
        parayaCevrilenTutar: tutar,
      }),
    });
    if (!r.ok) { toast({ variant: "destructive", title: "Hata" }); return; }
    toast({ title: `${fmtTry(tutar)} ödeme kaydı oluşturuldu`, description: `Liste sekmesinden gun sayısını düzenlemeyi unutmayın.` });
    setParayaTcNo(null);
    setParayaGun("");
    qc.invalidateQueries({ queryKey: ["/api/izinler/bakiye"] });
    qc.invalidateQueries({ queryKey: ["/api/izinler"] });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!bakiyeler?.length) return <div className="text-center text-muted-foreground py-12">Aktif çalışan bulunamadı (bordro yüklenmemiş olabilir).</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {bakiyeler.map((b) => (
        <Card key={b.tcNo} className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-base">{b.adSoyad}</div>
                {b.sube && <div className="text-xs text-muted-foreground">{b.sube}</div>}
              </div>
              {b.iseGirisTarihi && (
                <div className="text-xs text-muted-foreground text-right">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  {b.iseGirisTarihi}<br />
                  <span className="font-semibold">{b.kidemYili} yıl kıdem</span>
                </div>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              Yıllık hak: <strong className="text-foreground">{b.yillikHakkiPerYil} gün/yıl</strong>
            </div>

            <div className="border-t pt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span>Açılış bakiyesi:</span>
                {editingTcNo === b.tcNo ? (
                  <div className="flex items-center gap-1">
                    <Input value={editVal} onChange={(e) => setEditVal(e.target.value)} className="h-7 w-16" type="number" />
                    <Button size="sm" className="h-7" onClick={() => handleAcilisSave(b.tcNo)}>OK</Button>
                  </div>
                ) : (
                  <button className="font-semibold tabular-nums hover:text-primary inline-flex items-center gap-1" onClick={() => { setEditingTcNo(b.tcNo); setEditVal(String(b.acilisBakiyesi)); }}>
                    {b.acilisBakiyesi} <Edit2 className="w-3 h-3 opacity-50" />
                  </button>
                )}
              </div>
              <div className="flex justify-between"><span>Toplam hak edilen:</span><strong className="tabular-nums">{b.toplamHakEdilen}</strong></div>
              <div className="flex justify-between"><span>Kullanılan:</span><strong className="tabular-nums text-orange-600">{b.kullanilan}</strong></div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="font-bold">Kalan bakiye:</span>
                <strong className={`tabular-nums text-lg ${b.guncelBakiye < 0 ? "text-red-600" : "text-green-600"}`}>{b.guncelBakiye}</strong>
              </div>
            </div>

            <div className="border-t pt-2 space-y-1 text-sm bg-muted/20 -mx-4 -mb-4 px-4 py-3">
              <div className="font-semibold flex items-center gap-1"><Banknote className="w-4 h-4" /> Paraya çevirme</div>
              <div className="text-xs text-muted-foreground">Aylık net: {fmtTry(b.netUcret)} · Günlük: {fmtTry(b.gunlukNet)}</div>
              {parayaTcNo === b.tcNo ? (
                <div className="space-y-2">
                  <Input value={parayaGun} onChange={(e) => setParayaGun(e.target.value)} placeholder="Gün sayısı" type="number" className="h-8" />
                  {parayaGun && !isNaN(parseInt(parayaGun)) && (
                    <div className="text-sm">Hesap: <strong className="text-green-700">{fmtTry((b.netUcret / 30) * parseInt(parayaGun))}</strong></div>
                  )}
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 flex-1" onClick={() => handleParayaCevir(b)}>İzin Olarak İşaretle</Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => { setParayaTcNo(null); setParayaGun(""); }}>İptal</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="w-full h-7 mt-2" onClick={() => setParayaTcNo(b.tcNo)} disabled={!b.netUcret}>
                  Hesapla & Kaydet
                </Button>
              )}
            </div>

            <Button size="sm" className="w-full" onClick={() => onYeniIzin(b.tcNo)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Yeni İzin Ekle
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
