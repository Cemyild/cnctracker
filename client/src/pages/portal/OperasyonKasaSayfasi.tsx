import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { OperasyonAvans, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTarih, formatPara } from "./portalUtils";
import YeniOdemeModal from "./YeniOdemeModal";

type Ozet = { bakiye: number; avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };

export default function OperasyonKasaSayfasi() {
  const { toast } = useToast();
  const { data: ozet } = useQuery<Ozet>({
    queryKey: ["/api/portal/operasyon/ozet"],
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });

  const [yeniOdeme, setYeniOdeme] = useState(false);
  const [kapatDialog, setKapatDialog] = useState(false);
  const [kapatiliyor, setKapatiliyor] = useState(false);

  const acikMasrafToplam = (ozet?.masraflar ?? []).reduce((s, m) => s + parseFloat(m.tutar), 0);
  const acikAvansToplam = (ozet?.avanslar ?? []).reduce((s, a) => s + parseFloat(a.tutar), 0);

  const tazele = () => queryClient.invalidateQueries({ queryKey: ["/api/portal/operasyon/ozet"] });

  const masrafKaldir = async (id: string) => {
    try {
      const res = await fetch(`/api/portal/operasyon/masraf/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Silinemedi");
      tazele();
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
  };

  const gunuKapat = async () => {
    setKapatiliyor(true);
    try {
      const res = await fetch("/api/portal/operasyon/gunu-kapat", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Kapatılamadı");
      toast({ title: "Gün kapatıldı", description: "Rapor muhasebeye iletildi." });
      setKapatDialog(false);
      tazele();
      queryClient.invalidateQueries({ queryKey: ["/api/portal/operasyon/kapanislar"] });
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
    finally { setKapatiliyor(false); }
  };

  const hareketSayisi = (ozet?.avanslar.length ?? 0) + (ozet?.masraflar.length ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Güncel Bakiye</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold" data-testid="text-bakiye">{formatPara(ozet?.bakiye ?? 0, "TL")}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Açık Avans</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold text-green-600">{formatPara(acikAvansToplam, "TL")}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Açık Masraf</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold text-destructive">{formatPara(acikMasrafToplam, "TL")}</div></CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Button size="lg" onClick={() => setYeniOdeme(true)} data-testid="button-op-yeni-odeme">+ Yeni Ödeme Kaydet</Button>
        <Button variant="outline" onClick={() => setKapatDialog(true)} disabled={hareketSayisi === 0} data-testid="button-op-gunu-kapat">Günü Kapat</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Açık Hareketler</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(ozet?.avanslar ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border p-2 text-sm" data-testid={`row-avans-${a.id}`}>
              <div><span className="font-medium text-green-600">Avans</span> · {formatTarih(a.tarih)} · {a.aciklama ?? "—"}{a.belgeDosya && <> · <a className="underline" href={"/" + a.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">dekont</a></>}</div>
              <div className="font-semibold text-green-600">+{formatPara(a.tutar, "TL")}</div>
            </div>
          ))}
          {(ozet?.masraflar ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm" data-testid={`row-masraf-${m.id}`}>
              <div>
                <span className="font-medium">{m.dosyaYok && <Badge variant="outline" className="mr-1">Ofis</Badge>}{m.masrafTuru ?? "Masraf"}</span> · {m.alacakli} · {formatTarih(m.tarih)}
                {m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                <Button variant="ghost" size="sm" onClick={() => masrafKaldir(m.id)} data-testid={`button-masraf-kaldir-${m.id}`}>Kaldır</Button>
              </div>
            </div>
          ))}
          {hareketSayisi === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Açık hareket yok.</p>
          )}
        </CardContent>
      </Card>

      <YeniOdemeModal open={yeniOdeme} onClose={() => setYeniOdeme(false)} />

      <Dialog open={kapatDialog} onOpenChange={setKapatDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Günü Kapat</DialogTitle></DialogHeader>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Açık avans:</span><span className="text-green-600">+{formatPara(acikAvansToplam, "TL")}</span></div>
            <div className="flex justify-between"><span>Açık masraf:</span><span className="text-destructive">−{formatPara(acikMasrafToplam, "TL")}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1"><span>Kapanış bakiyesi:</span><span>{formatPara(ozet?.bakiye ?? 0, "TL")}</span></div>
            <p className="text-xs text-muted-foreground pt-2">Kapatınca bu hareketler kilitlenir ve rapor muhasebeye iletilir. Bakiye ertesi güne devreder.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKapatDialog(false)}>Vazgeç</Button>
            <Button onClick={gunuKapat} disabled={kapatiliyor} data-testid="button-op-kapat-onay">{kapatiliyor ? "Kapatılıyor…" : "Onayla ve Kapat"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
