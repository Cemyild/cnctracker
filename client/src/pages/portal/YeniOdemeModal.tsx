import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, MasrafTuru, OdemeSirketi } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatPara } from "./portalUtils";
import MasrafTuruSecici from "./MasrafTuruSecici";
import BeyannameSecici from "./BeyannameSecici";

// Anlık kayıt olduğundan, eklenen masraf sunucudan dönen OperasyonMasraf'ın alt kümesidir.
type Eklenen = { id: string; masrafTuru: string | null; alacakli: string; tutar: string };

export default function YeniOdemeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({ queryKey: ["/api/portal/beyannameler"] });
  const { data: masrafTurleri = [] } = useQuery<MasrafTuru[]>({ queryKey: ["/api/portal/masraf-turleri"] });
  const { data: odemeSirketleri = [] } = useQuery<OdemeSirketi[]>({ queryKey: ["/api/portal/odeme-sirketleri"] });

  // Beyanname bloğu — sabitlenince kilitlenir
  const [beyannameId, setBeyannameId] = useState("");
  const [dosyaYok, setDosyaYok] = useState(false);
  const sabitlendi = dosyaYok || !!beyannameId;
  const seciliBeyanname = beyannameler.find((b) => b.id === beyannameId);

  // Masraf formu
  const [masrafTuru, setMasrafTuru] = useState("");
  const [tutar, setTutar] = useState("");
  const [alacakli, setAlacakli] = useState("");
  const [iban, setIban] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [belge, setBelge] = useState<File | null>(null);
  const [belgeSayac, setBelgeSayac] = useState(0);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  // Bu modal oturumunda eklenenler (kolaylık listesi; gerçek kayıt landing açık hareketlerdedir)
  const [eklenenler, setEklenenler] = useState<Eklenen[]>([]);

  // Sunucudaki getMasrafTuruByAd ile AYNI normalizasyon (asimetri olursa istemci "opsiyonel" der, sunucu 400).
  const seciliTur = useMemo(() => {
    const norm = (s: string) => s.trim().toLocaleLowerCase("tr");
    const hedef = norm(masrafTuru);
    return hedef ? masrafTurleri.find((t) => norm(t.ad) === hedef) : undefined;
  }, [masrafTurleri, masrafTuru]);
  const belgeZorunlu = seciliTur ? seciliTur.belgeZorunlu : true;

  const tazele = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/portal/operasyon/ozet"] });
    queryClient.invalidateQueries({ queryKey: ["/api/portal/odeme-sirketleri"] });
  };

  // YALNIZ masraf alanları — beyanname SABİT kalır.
  const masrafFormuSifirla = () => {
    setMasrafTuru(""); setTutar(""); setAlacakli(""); setIban(""); setAciklama("");
    setBelge(null); setBelgeSayac((s) => s + 1);
  };
  const beyannameDegistir = () => { setBeyannameId(""); setDosyaYok(false); };
  const kapat = () => {
    beyannameDegistir(); masrafFormuSifirla(); setEklenenler([]);
    onClose();
  };

  const ekle = async () => {
    if (belgeZorunlu && !belge) { toast({ title: "Belge (fiş/fatura) zorunlu", variant: "destructive" }); return; }
    if (!tutar.trim() || !alacakli.trim()) { toast({ title: "Tutar ve alacaklı zorunlu", variant: "destructive" }); return; }
    if (!dosyaYok && !beyannameId) { toast({ title: "Beyanname seçin veya 'Ofis Masrafı' işaretleyin", variant: "destructive" }); return; }
    if (dosyaYok && !aciklama.trim()) { toast({ title: "Ofis masrafında açıklama zorunlu", variant: "destructive" }); return; }
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
      if (belge) fd.set("belge", belge);
      const res = await fetch("/api/portal/operasyon/masraf", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");
      const kayit = await res.json();
      setEklenenler((prev) => [...prev, { id: kayit.id, masrafTuru: kayit.masrafTuru, alacakli: kayit.alacakli, tutar: kayit.tutar }]);
      toast({ title: "Masraf eklendi", description: "Bakiyeden düşüldü." });
      masrafFormuSifirla(); // beyanname SABİT
      tazele();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
      // Form KORUNUR — yeniden dene.
    } finally { setGonderiliyor(false); }
  };

  const eklenenKaldir = async (id: string) => {
    try {
      const res = await fetch(`/api/portal/operasyon/masraf/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Silinemedi");
      setEklenenler((prev) => prev.filter((e) => e.id !== id));
      tazele();
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
  };

  return (
    <Dialog open={open} onOpenChange={(a) => { if (!a) kapat(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Yeni Ödeme Kaydet</DialogTitle></DialogHeader>
        {/* min-w-0: DialogContent bir grid; grid ogesinin varsayilan min-width:auto'su
            icerideki truncate'in min-content genisligini emip sutunu modalin disina tasirir. */}
        <div className="min-w-0 space-y-4">
          {!sabitlendi ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="op-ofis" checked={dosyaYok} onCheckedChange={(v) => { setDosyaYok(v === true); if (v === true) setBeyannameId(""); }} data-testid="checkbox-op-ofis" />
                <Label htmlFor="op-ofis" className="font-normal text-muted-foreground">Ofis Masrafı — dosyaya bağlı değil, açıklama zorunlu</Label>
              </div>
              {!dosyaYok && (
                <BeyannameSecici
                  beyannameler={beyannameler}
                  value={beyannameId}
                  onChange={setBeyannameId}
                  testId="select-op-beyanname"
                />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-3">
              <div className="min-w-0 truncate text-sm">
                {dosyaYok ? <span className="font-medium">Ofis Masrafı</span> : (
                  <><span className="font-medium">{seciliBeyanname?.dosyaNo ?? seciliBeyanname?.beyanNo ?? "?"}</span> · {seciliBeyanname?.alici ?? "?"}{seciliBeyanname?.dosyaNo && seciliBeyanname?.beyanNo ? ` · ${seciliBeyanname.beyanNo}` : ""}</>
                )}
              </div>
              <Button variant="ghost" size="sm" className="shrink-0" onClick={beyannameDegistir} data-testid="button-op-beyanname-degistir">Değiştir</Button>
            </div>
          )}

          {sabitlendi && (
            <>
              <div className="space-y-3">
                <div className="space-y-2"><Label>Masraf Türü</Label><MasrafTuruSecici value={masrafTuru} onChange={setMasrafTuru} testId="op-masraf-turu" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Tutar (TL)</Label><Input placeholder="0,00" value={tutar} onChange={(e) => setTutar(e.target.value)} data-testid="input-op-tutar" /></div>
                  <div className="space-y-2">
                    <Label>Kime Ödendi</Label>
                    <Input placeholder="Firma adı" value={alacakli} onChange={(e) => setAlacakli(e.target.value)} list="op-alacakli-onerileri" data-testid="input-op-alacakli" />
                    <datalist id="op-alacakli-onerileri">{odemeSirketleri.map((s) => (<option key={s.id} value={s.ad} />))}</datalist>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>IBAN (varsa)</Label><Input placeholder="TR.." value={iban} onChange={(e) => setIban(e.target.value)} data-testid="input-op-iban" /></div>
                  <div className="space-y-2"><Label>{belgeZorunlu ? "Belge (fiş/fatura — ZORUNLU)" : "Belge (fiş/fatura — opsiyonel)"}</Label><Input key={belgeSayac} type="file" onChange={(e) => setBelge(e.target.files?.[0] ?? null)} data-testid="input-op-belge" /></div>
                </div>
                <div className="space-y-2"><Label>Açıklama</Label><Textarea placeholder="Not…" value={aciklama} onChange={(e) => setAciklama(e.target.value)} data-testid="input-op-aciklama" /></div>
              </div>
              <Button className="w-full" onClick={ekle} disabled={gonderiliyor} data-testid="button-op-kaydet">{gonderiliyor ? "Ekleniyor…" : "Ekle"}</Button>
            </>
          )}

          {eklenenler.length > 0 && (
            <div className="border-t pt-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Bu oturumda eklenenler ({eklenenler.length})</div>
              {eklenenler.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 text-sm" data-testid={`eklenen-${e.id}`}>
                  <span className="min-w-0 truncate">{e.masrafTuru ?? "Masraf"} · {e.alacakli}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-destructive">−{formatPara(e.tutar, "TL")}</span>
                    <Button variant="ghost" size="sm" onClick={() => eklenenKaldir(e.id)} data-testid={`button-eklenen-kaldir-${e.id}`}>Kaldır</Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={kapat} data-testid="button-op-yeni-odeme-kapat">Kapat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
