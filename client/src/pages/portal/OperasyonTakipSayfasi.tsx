import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { OperasyonAvans, OperasyonGunKapanis, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTarih, formatPara } from "./portalUtils";

type Satir = { id: string; adSoyad: string; kullaniciAdi: string; bakiye: number; bugunHarcanan: number };
type Kapanis = OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };
type Detay = { bakiye: number; acik: { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }; kapanislar: Kapanis[] };

export default function OperasyonTakipSayfasi() {
  const { toast } = useToast();
  const { data: liste = [] } = useQuery<Satir[]>({
    queryKey: ["/api/portal/operasyon-takip"], refetchInterval: 10000, refetchIntervalInBackground: true,
  });
  const [secili, setSecili] = useState<Satir | null>(null);
  const [avansDialog, setAvansDialog] = useState(false);
  const [avansTutar, setAvansTutar] = useState("");
  const [avansAciklama, setAvansAciklama] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const { data: detay } = useQuery<Detay>({
    queryKey: [`/api/portal/operasyon-takip/${secili?.id}`],
    enabled: !!secili,
    refetchInterval: secili ? 10000 : false,
    refetchIntervalInBackground: true,
  });

  const tazele = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/portal/operasyon-takip"] });
    if (secili) queryClient.invalidateQueries({ queryKey: [`/api/portal/operasyon-takip/${secili.id}`] });
  };

  const avansGonder = async () => {
    if (!secili) return;
    if (!avansTutar.trim()) { toast({ title: "Tutar girin", variant: "destructive" }); return; }
    setGonderiliyor(true);
    try {
      const res = await fetch(`/api/portal/operasyon-takip/${secili.id}/avans`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutar: avansTutar, aciklama: avansAciklama }), credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Gönderilemedi");
      toast({ title: "Avans yüklendi", description: `${secili.adSoyad} bakiyesine geçti.` });
      setAvansDialog(false); setAvansTutar(""); setAvansAciklama(""); tazele();
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
    finally { setGonderiliyor(false); }
  };

  const geriAc = async (kapanisId: string) => {
    try {
      const res = await fetch(`/api/portal/operasyon-takip/kapanis/${kapanisId}/geri-ac`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Geri açılamadı");
      toast({ title: "Gün geri açıldı", description: "Operasyon düzeltebilir." });
      tazele();
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Şube Bakiyeleri</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {liste.length === 0 && <p className="text-sm text-muted-foreground">Operasyon kullanıcısı yok.</p>}
          {liste.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid={`sube-${s.id}`}>
              <div>
                <div className="font-medium">{s.adSoyad}</div>
                <div className="text-xs text-muted-foreground">Bugün harcanan: {formatPara(s.bugunHarcanan, "TL")}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-lg font-bold ${s.bakiye < 0 ? "text-destructive" : ""}`} data-testid={`sube-bakiye-${s.id}`}>{formatPara(s.bakiye, "TL")}</div>
                <Button size="sm" onClick={() => { setSecili(s); setAvansDialog(true); }} data-testid={`button-avans-${s.id}`}>Avans Yükle</Button>
                <Button size="sm" variant="outline" onClick={() => setSecili(s)} data-testid={`button-detay-${s.id}`}>Detay</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {secili && detay && (
        <Card>
          <CardHeader><CardTitle>{secili.adSoyad} — Detay (Bakiye {formatPara(detay.bakiye, "TL")})</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-1">Açık Hareketler</div>
              {[...detay.acik.avanslar.map((a) => ({ t: "avans" as const, x: a })), ...detay.acik.masraflar.map((m) => ({ t: "masraf" as const, x: m }))].length === 0 && (
                <p className="text-xs text-muted-foreground">Açık hareket yok.</p>
              )}
              {detay.acik.avanslar.map((a) => (
                <div key={a.id} className="flex justify-between text-sm py-0.5"><span className="text-green-600">Avans · {formatTarih(a.tarih)} · {a.aciklama ?? "—"}</span><span className="text-green-600">+{formatPara(a.tutar, "TL")}</span></div>
              ))}
              {detay.acik.masraflar.map((m) => (
                <div key={m.id} className="flex justify-between text-sm py-0.5"><span>{m.masrafTuru ?? "Masraf"} · {m.alacakli}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span><span className="text-destructive">−{formatPara(m.tutar, "TL")}</span></div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-medium">Kapanmış Günler</div>
              {detay.kapanislar.length === 0 && <p className="text-xs text-muted-foreground">Kapanış yok.</p>}
              {detay.kapanislar.map((k) => (
                <div key={k.id} className="rounded-md border p-3 space-y-1" data-testid={`takip-kapanis-${k.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{formatTarih(k.gunTarihi)} · Kapanış {formatPara(k.kapanisBakiye, "TL")}</div>
                    <div className="flex items-center gap-2">
                      {k.durum === "geri_acildi" && <Badge variant="destructive">Geri Açıldı</Badge>}
                      {k.durum === "kapali" && <Button size="sm" variant="outline" onClick={() => geriAc(k.id)} data-testid={`button-geri-ac-${k.id}`}>Geri Aç</Button>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">Açılış {formatPara(k.acilisBakiye, "TL")} · Avans +{formatPara(k.avansToplam, "TL")} · Masraf −{formatPara(k.masrafToplam, "TL")}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={avansDialog} onOpenChange={setAvansDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Avans Yükle — {secili?.adSoyad}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Tutar (TL)</Label><Input placeholder="0,00" value={avansTutar} onChange={(e) => setAvansTutar(e.target.value)} data-testid="input-avans-tutar" /></div>
            <div className="space-y-1"><Label>Açıklama</Label><Input value={avansAciklama} onChange={(e) => setAvansAciklama(e.target.value)} data-testid="input-avans-aciklama" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvansDialog(false)}>Vazgeç</Button>
            <Button onClick={avansGonder} disabled={gonderiliyor} data-testid="button-avans-gonder">{gonderiliyor ? "Gönderiliyor…" : "Yükle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
