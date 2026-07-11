import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, MasrafTuru, OdemeSirketi, OperasyonAvans, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTarih, formatPara } from "./portalUtils";
import MasrafTuruSecici from "./MasrafTuruSecici";

type Ozet = { bakiye: number; avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };

export default function OperasyonKasaSayfasi() {
  const { toast } = useToast();
  const { data: ozet } = useQuery<Ozet>({
    queryKey: ["/api/portal/operasyon/ozet"],
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({ queryKey: ["/api/portal/beyannameler"] });
  const { data: masrafTurleri = [] } = useQuery<MasrafTuru[]>({ queryKey: ["/api/portal/masraf-turleri"] });
  const { data: odemeSirketleri = [] } = useQuery<OdemeSirketi[]>({ queryKey: ["/api/portal/odeme-sirketleri"] });

  const [arama, setArama] = useState("");
  const [beyannameId, setBeyannameId] = useState("");
  const [dosyaYok, setDosyaYok] = useState(false);
  const [masrafTuru, setMasrafTuru] = useState("");
  const [tutar, setTutar] = useState("");
  const [alacakli, setAlacakli] = useState("");
  const [iban, setIban] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [belge, setBelge] = useState<File | null>(null);
  const [formSayac, setFormSayac] = useState(0);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [kapatDialog, setKapatDialog] = useState(false);
  const [kapatiliyor, setKapatiliyor] = useState(false);

  const filtreliBeyannameler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return beyannameler;
    return beyannameler.filter((b) =>
      b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
      (b.alici ?? "").toLocaleLowerCase("tr").includes(q));
  }, [beyannameler, arama]);

  const acikMasrafToplam = (ozet?.masraflar ?? []).reduce((s, m) => s + parseFloat(m.tutar), 0);
  const acikAvansToplam = (ozet?.avanslar ?? []).reduce((s, a) => s + parseFloat(a.tutar), 0);

  const tazele = () => queryClient.invalidateQueries({ queryKey: ["/api/portal/operasyon/ozet"] });

  const formSifirla = () => {
    setBeyannameId(""); setDosyaYok(false); setMasrafTuru(""); setTutar("");
    setAlacakli(""); setIban(""); setAciklama(""); setBelge(null); setFormSayac((s) => s + 1);
  };

  const kaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!belge) { toast({ title: "Belge (fiş/fatura) zorunlu", variant: "destructive" }); return; }
    if (!tutar.trim() || !alacakli.trim()) { toast({ title: "Tutar ve alacaklı zorunlu", variant: "destructive" }); return; }
    if (!dosyaYok && !beyannameId) { toast({ title: "Beyanname seçin veya 'Dosya yok' işaretleyin", variant: "destructive" }); return; }
    if (dosyaYok && !aciklama.trim()) { toast({ title: "Dosyasız kayıtta açıklama zorunlu", variant: "destructive" }); return; }
    setGonderiliyor(true);
    try {
      const fd = new FormData();
      if (!dosyaYok) fd.set("beyannameId", beyannameId);
      fd.set("dosyaYok", String(dosyaYok));
      fd.set("masrafTuru", masrafTuru);
      fd.set("tutar", tutar);
      fd.set("alacakli", alacakli);
      fd.set("iban", iban);
      fd.set("aciklama", aciklama);
      fd.set("belge", belge);
      const res = await fetch("/api/portal/operasyon/masraf", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");
      toast({ title: "Masraf kaydedildi", description: "Bakiyeden düşüldü." });
      formSifirla();
      tazele();
      queryClient.invalidateQueries({ queryKey: ["/api/portal/odeme-sirketleri"] });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally { setGonderiliyor(false); }
  };

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

      <Card>
        <CardHeader><CardTitle>Ödeme Kaydet</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={kaydet} className="space-y-4">
            <div className="space-y-2">
              <Label>Beyanname / Dosya</Label>
              <div className="flex items-center gap-2">
                <Checkbox id="op-dosya-yok" checked={dosyaYok} onCheckedChange={(v) => { setDosyaYok(v === true); if (v === true) setBeyannameId(""); }} data-testid="checkbox-op-dosya-yok" />
                <Label htmlFor="op-dosya-yok" className="font-normal text-muted-foreground">Dosya yok — açıklama zorunlu</Label>
              </div>
              {!dosyaYok && (
                <>
                  <Input placeholder="Dosya no veya müşteri ara…" value={arama} onChange={(e) => setArama(e.target.value)} data-testid="input-op-arama" />
                  <Select value={beyannameId} onValueChange={setBeyannameId}>
                    <SelectTrigger data-testid="select-op-beyanname"><SelectValue placeholder="Beyanname seçin" /></SelectTrigger>
                    <SelectContent>
                      {filtreliBeyannameler.slice(0, 100).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.dosyaNo} — {b.alici ?? "?"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Masraf Türü</Label>
                <MasrafTuruSecici value={masrafTuru} onChange={setMasrafTuru} testId="op-masraf-turu" />
              </div>
              <div className="space-y-2">
                <Label>Tutar (TL)</Label>
                <Input placeholder="0,00" value={tutar} onChange={(e) => setTutar(e.target.value)} data-testid="input-op-tutar" />
              </div>
              <div className="space-y-2">
                <Label>Kime Ödendi</Label>
                <Input placeholder="Firma adı" value={alacakli} onChange={(e) => setAlacakli(e.target.value)} list="op-alacakli-onerileri" data-testid="input-op-alacakli" />
                <datalist id="op-alacakli-onerileri">{odemeSirketleri.map((s) => (<option key={s.id} value={s.ad} />))}</datalist>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>IBAN (varsa)</Label>
                <Input placeholder="TR.." value={iban} onChange={(e) => setIban(e.target.value)} data-testid="input-op-iban" />
              </div>
              <div className="space-y-2">
                <Label>Belge (fiş/fatura — ZORUNLU)</Label>
                <Input key={formSayac} type="file" onChange={(e) => setBelge(e.target.files?.[0] ?? null)} data-testid="input-op-belge" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Textarea placeholder="Not…" value={aciklama} onChange={(e) => setAciklama(e.target.value)} data-testid="input-op-aciklama" />
            </div>
            <Button type="submit" disabled={gonderiliyor} data-testid="button-op-kaydet">{gonderiliyor ? "Kaydediliyor…" : "Masrafı Kaydet"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Açık Hareketler</CardTitle>
          <Button variant="outline" onClick={() => setKapatDialog(true)} disabled={(ozet?.avanslar.length ?? 0) + (ozet?.masraflar.length ?? 0) === 0} data-testid="button-op-gunu-kapat">Günü Kapat</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(ozet?.avanslar ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border p-2 text-sm" data-testid={`row-avans-${a.id}`}>
              <div><span className="font-medium text-green-600">Avans</span> · {formatTarih(a.tarih)} · {a.aciklama ?? "—"}</div>
              <div className="font-semibold text-green-600">+{formatPara(a.tutar, "TL")}</div>
            </div>
          ))}
          {(ozet?.masraflar ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm" data-testid={`row-masraf-${m.id}`}>
              <div>
                <span className="font-medium">{m.masrafTuru ?? "Masraf"}</span> · {m.alacakli} · {formatTarih(m.tarih)}
                {m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                <Button variant="ghost" size="sm" onClick={() => masrafKaldir(m.id)} data-testid={`button-masraf-kaldir-${m.id}`}>Kaldır</Button>
              </div>
            </div>
          ))}
          {((ozet?.avanslar.length ?? 0) + (ozet?.masraflar.length ?? 0)) === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Açık hareket yok.</p>
          )}
        </CardContent>
      </Card>

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
