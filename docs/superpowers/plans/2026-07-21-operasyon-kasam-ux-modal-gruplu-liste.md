# Operasyon Kasam UX: Kalıcı Beyanname Modalı + Gruplu Açık Hareketler — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operasyon Kasam masraf girişini kalıcı-beyanname + anlık-kayıt bir modala taşımak ve açık hareketleri beyannameye göre gruplu, açılır satırlar hâline getirmek — hepsi yalnız istemcide.

**Architecture:** Masraf formu yeni `YeniOdemeModal.tsx` bileşenine çıkar; beyanname bir kez seçilip sabitlenir, her "Ekle" anında `POST /api/portal/operasyon/masraf` eder, yalnız masraf alanlarını sıfırlar, beyannameyi korur. `OperasyonKasaSayfasi.tsx` landing'i formu kaldırıp "Yeni Ödeme Kaydet" butonu + modal çağrısı gösterir; açık hareketler `beyannameId`'ye göre gruplanır (dosya/beyan no istemcide yüklü `beyannameler`'den Map ile). Backend/şema/uç DEĞİŞMEZ.

**Tech Stack:** React 18 + Vite + wouter + TanStack Query + shadcn/ui (Dialog, Select, Checkbox) + lucide-react ikonları

**Spec:** [docs/superpowers/specs/2026-07-21-operasyon-kasam-ux-modal-gruplu-liste-design.md](../specs/2026-07-21-operasyon-kasam-ux-modal-gruplu-liste-design.md)

## Global Constraints

Her görevin gereksinimleri bu bölümü kapsar.

- **Yalnız istemci değişir.** `server/`, `shared/`, `db:push` HİÇ dokunulmaz. `POST /api/portal/operasyon/masraf`, `DELETE .../masraf/:id`, `GET .../ozet` uçları aynen kullanılır.
- **Anlık kayıt:** her "Ekle" hemen POST eder; başarıda **yalnız masraf alanları** (masrafTuru, tutar, alacakli, iban, aciklama, belge) sıfırlanır, **beyannameId / dosyaYok SABİT kalır**.
- **Hata yolunda form KORUNUR** (yeniden deneme) — hiçbir alan sıfırlanmaz.
- **Gruplama:** açık hareketlerdeki masraflar `beyannameId`'ye göre TEK TİP açılır grup (tek/çok masraf ayrımı YOK); `dosyaYok=true` masraflar ayrı "Ofis Masrafları" grubu; avanslar düz kalır.
- **İşlevsellik korunur:** açılan masraf satırında belge linki + Kaldır butonu kaybolmaz.
- **beyan_no araması** (`b.beyanNo`) ve seçenek etiketi (`{dosyaNo} — {alici} · {beyanNo}`), `.slice(0,100)` sınırı, belge-opsiyonelliği (`belgeZorunlu`) aynen korunur.
- **tr-locale normalizasyon:** masraf türü eşleşmesi `trim().toLocaleLowerCase("tr")` — `toLowerCase()` KULLANILMAZ ("I/İ" tuzağı).
- **Mevcut testid'ler korunur:** `text-bakiye`, `select-op-beyanname`, `input-op-arama`, `input-op-tutar`, `input-op-alacakli`, `input-op-iban`, `input-op-belge`, `input-op-aciklama`, `checkbox-op-ofis`, `op-masraf-turu` (MasrafTuruSecici), `button-op-kaydet`, `button-op-gunu-kapat`, `button-op-kapat-onay`, `button-masraf-kaldir-{id}`, `row-avans-{id}`, `row-masraf-{id}`.
- **DEV DB izolasyonu:** Playwright yazma testi öncesi `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → `true` olmalı; değilse DUR ve raporla. (Paralel oturum `.env`'i canlı prod tüneline çevirebiliyor.)
- **git add YALNIZ açık dosya yollarıyla.** `git add -A` / `git add .` ASLA. `git push` YAPILMAZ (deploy tetikler).
- **Türkçe kaynak dosyalarını PowerShell `Set-Content` ile yeniden YAZMA.** Edit/Write tool; her görevde U+FFFD taraması. `.env`/`uploads/`/`*.xlsx` commit edilmez. `package.json`/lockfile değişmez.
- Playwright projede bağımlılık DEĞİL; yerel önbellekten `NODE_PATH` ile kullanılır.

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `client/src/pages/portal/YeniOdemeModal.tsx` | Kalıcı-beyanname + anlık-kayıt masraf modalı | T1 (yeni) |
| `client/src/pages/portal/OperasyonKasaSayfasi.tsx` | Landing: form → buton+modal | T1 |
| `client/src/pages/portal/OperasyonKasaSayfasi.tsx` | Açık hareketler → beyannameye göre gruplu açılır | T2 |
| — | Uçtan uca doğrulama | T3 |

---

### Task 1: YeniOdemeModal bileşeni + landing'de form → buton

**Files:**
- Create: `client/src/pages/portal/YeniOdemeModal.tsx`
- Modify: `client/src/pages/portal/OperasyonKasaSayfasi.tsx` (form kartı kaldırılır, buton + modal eklenir, ilgili state/fonksiyonlar modala taşınır)

**Interfaces:**
- Consumes: mevcut uçlar (`POST/DELETE /api/portal/operasyon/masraf`, `GET /api/portal/operasyon/ozet`), mevcut queryKey'ler (`beyannameler`, `masraf-turleri`, `odeme-sirketleri`), `MasrafTuruSecici`, `formatPara`
- Produces: `YeniOdemeModal` bileşeni — props `{ open: boolean; onClose: () => void }`. Yeni testid'ler: `button-op-yeni-odeme` (landing), `button-op-beyanname-degistir`, `button-op-yeni-odeme-kapat`, `eklenen-{id}`, `button-eklenen-kaldir-{id}`.

- [ ] **Step 1: YeniOdemeModal bileşenini oluştur**

`client/src/pages/portal/YeniOdemeModal.tsx` dosyasını OLUŞTUR:

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, MasrafTuru, OdemeSirketi } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatPara } from "./portalUtils";
import MasrafTuruSecici from "./MasrafTuruSecici";

// Anlık kayıt olduğundan, eklenen masraf sunucudan dönen OperasyonMasraf'ın alt kümesidir.
type Eklenen = { id: string; masrafTuru: string | null; alacakli: string; tutar: string };

export default function YeniOdemeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({ queryKey: ["/api/portal/beyannameler"] });
  const { data: masrafTurleri = [] } = useQuery<MasrafTuru[]>({ queryKey: ["/api/portal/masraf-turleri"] });
  const { data: odemeSirketleri = [] } = useQuery<OdemeSirketi[]>({ queryKey: ["/api/portal/odeme-sirketleri"] });

  // Beyanname bloğu — sabitlenince kilitlenir
  const [arama, setArama] = useState("");
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

  const filtreliBeyannameler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return beyannameler;
    return beyannameler.filter((b) =>
      b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
      (b.alici ?? "").toLocaleLowerCase("tr").includes(q) ||
      (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q));
  }, [beyannameler, arama]);

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
  const beyannameDegistir = () => { setBeyannameId(""); setDosyaYok(false); setArama(""); };
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
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Yeni Ödeme Kaydet</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {!sabitlendi ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="op-ofis" checked={dosyaYok} onCheckedChange={(v) => { setDosyaYok(v === true); if (v === true) setBeyannameId(""); }} data-testid="checkbox-op-ofis" />
                <Label htmlFor="op-ofis" className="font-normal text-muted-foreground">Ofis Masrafı — dosyaya bağlı değil, açıklama zorunlu</Label>
              </div>
              {!dosyaYok && (
                <>
                  <Input placeholder="Dosya no, beyan no veya müşteri ara…" value={arama} onChange={(e) => setArama(e.target.value)} data-testid="input-op-arama" />
                  <Select value={beyannameId} onValueChange={setBeyannameId}>
                    <SelectTrigger data-testid="select-op-beyanname"><SelectValue placeholder="Beyanname seçin" /></SelectTrigger>
                    <SelectContent>
                      {filtreliBeyannameler.slice(0, 100).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.dosyaNo} — {b.alici ?? "?"}{b.beyanNo ? ` · ${b.beyanNo}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
              <div className="text-sm">
                {dosyaYok ? <span className="font-medium">Ofis Masrafı</span> : (
                  <><span className="font-medium">{seciliBeyanname?.dosyaNo ?? "?"}</span> · {seciliBeyanname?.alici ?? "?"}{seciliBeyanname?.beyanNo ? ` · ${seciliBeyanname.beyanNo}` : ""}</>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={beyannameDegistir} data-testid="button-op-beyanname-degistir">Değiştir</Button>
            </div>
          )}

          {sabitlendi && (
            <>
              <div className="space-y-3">
                <div className="space-y-2"><Label>Masraf Türü</Label><MasrafTuruSecici value={masrafTuru} onChange={setMasrafTuru} testId="op-masraf-turu" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Tutar (TL)</Label><Input placeholder="0,00" value={tutar} onChange={(e) => setTutar(e.target.value)} data-testid="input-op-tutar" /></div>
                  <div className="space-y-2">
                    <Label>Kime Ödendi</Label>
                    <Input placeholder="Firma adı" value={alacakli} onChange={(e) => setAlacakli(e.target.value)} list="op-alacakli-onerileri" data-testid="input-op-alacakli" />
                    <datalist id="op-alacakli-onerileri">{odemeSirketleri.map((s) => (<option key={s.id} value={s.ad} />))}</datalist>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                <div key={e.id} className="flex items-center justify-between text-sm" data-testid={`eklenen-${e.id}`}>
                  <span>{e.masrafTuru ?? "Masraf"} · {e.alacakli}</span>
                  <span className="flex items-center gap-2">
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
```

- [ ] **Step 2: OperasyonKasaSayfasi'ndan formu kaldır, buton + modal ekle**

`client/src/pages/portal/OperasyonKasaSayfasi.tsx` şu şekilde SADELEŞTİRİLİR — form state'i ve `kaydet`/`formSifirla`/`filtreliBeyannameler`/`seciliTur`/`belgeZorunlu` modala taşındığı için KALDIRILIR; ozet/masrafKaldir/gunuKapat/bakiye/açık-hareketler KALIR. Dosyanın TAMAMINI şununla değiştir:

```tsx
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
```

**Not:** Bu adımda açık hareketler DÜZ kalır (T2 gruplayacak). `Badge` importu korunur (Ofis rozeti). `masrafKaldir` sayfada kalır (T2'nin gruplu satırları da kullanacak).

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 4: U+FFFD taraması**

Run:
```bash
node -e "['client/src/pages/portal/YeniOdemeModal.tsx','client/src/pages/portal/OperasyonKasaSayfasi.tsx'].forEach(f=>console.log(f, require('fs').readFileSync(f,'utf8').includes('�')))"
```
Expected: iki satır da `false`.

- [ ] **Step 5: Playwright doğrulaması**

DB hedefini doğrula (`DEV_NEON: true`). Dev sunucu 5000'de (`npm run dev`). Hazırlık: API ile operasyon kullanıcısı `MODALUI` (şube `Gemlik`) + `belgeZorunlu=false` bir masraf türü (`E2E DOSYA`); muhasebeden 2000 TL avans.

1. `MODALUI` ile portala gir → Kasam. Landing'de form YOK, **"Yeni Ödeme Kaydet"** butonu (`button-op-yeni-odeme`) var.
2. Butona tıkla → modal açılır; beyanname arama (`input-op-arama`) + Select (`select-op-beyanname`) + Ofis Masrafı görünür.
3. `input-op-arama`'ya gerçek bir beyannamenin dosya no'sunu yaz → seç → beyanname **sabitlenir** (`button-op-beyanname-degistir` görünür, arama gizlenir).
4. Aynı beyannameye **3 masraf** ekle: her seferinde tür `E2E DOSYA`, tutar (100/200/300), alacaklı (A/B/C), belge YOK → `button-op-kaydet` (Ekle). Her Ekle sonrası: tür/tutar/alacaklı **boşalır**, beyanname sabit kalır, "Bu oturumda eklenenler" listesi büyür (1→2→3).
5. Modal içi listede 3 satır; birinde `button-eklenen-kaldir-{id}` → Kaldır → liste 2'ye düşer, bakiye güncellenir.
6. Modalı kapat (`button-op-yeni-odeme-kapat`) → landing açık hareketlerde 2 masraf satırı (düz), bakiye 2000 − (kalan 2 masraf) doğru.
7. Tekrar aç → Ofis Masrafı işaretle → beyanname alanı gizlenir, "Ofis Masrafı" sabitlenir → tür `E2E DOSYA`, tutar 50, açıklama "ofis" (açıklama zorunlu), belge yok → Ekle → başarı.
8. **Hata yolu:** belgeZorunlu bir tür (varsayılan) seç, belge yok → Ekle → uyarı toast'ı, kayıt YOK, **form korunur** (tutar/alacaklı silinmez).

Sonuçları raporla. Başarısızlıkta kodu "geçsin diye" değiştirme.

**Temizlik:** `MODALUI` + masrafları + avansı, `E2E DOSYA` türü, `uploads/operasyon/` test dosyaları dev DB'den silinir; sorgu + dizin listesiyle kanıtla.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/portal/YeniOdemeModal.tsx client/src/pages/portal/OperasyonKasaSayfasi.tsx
git status
git commit -m "feat(operasyon): Kasam masraf girisi kalici-beyanname modaline tasindi (anlik kayit)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
`git status` YALNIZ bu 2 dosyayı göstermeli.

---

### Task 2: Açık hareketler beyannameye göre gruplu, açılır satırlar

**Files:**
- Modify: `client/src/pages/portal/OperasyonKasaSayfasi.tsx` (açık hareketler bloğu + `beyannameler` query + gruplama)

**Interfaces:**
- Consumes: T1'in bıraktığı landing yapısı; `beyannameler` queryKey; `masrafKaldir`; `formatPara`/`formatTarih`
- Produces: yeni testid'ler `group-beyanname-{beyannameId}`, `button-group-toggle-{beyannameId}`, `group-ofis`, `button-group-toggle-ofis`. Mevcut `row-masraf-{id}` + `button-masraf-kaldir-{id}` açılan satırlarda korunur.

- [ ] **Step 1: Importları ve query'yi ekle**

`OperasyonKasaSayfasi.tsx` başındaki importlara ekle:

```tsx
import { useMemo, useState } from "react";
```
(mevcut `import { useState } from "react";` satırını bununla DEĞİŞTİR)

Ve tip importuna `Beyanname` ekle; lucide ikonu ekle:

```tsx
import type { Beyanname, OperasyonAvans, OperasyonMasraf } from "@shared/schema";
import { ChevronRight, ChevronDown } from "lucide-react";
```

`ozet` query'sinin ALTINA `beyannameler` query'sini ekle:

```tsx
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({ queryKey: ["/api/portal/beyannameler"] });
```

- [ ] **Step 2: Gruplama hesabı + açık-grup state'i**

`acikAvansToplam` satırının ALTINA ekle:

```tsx
  const [acikGruplar, setAcikGruplar] = useState<Set<string>>(new Set());
  const grupAcKapa = (k: string) => setAcikGruplar((prev) => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  const beyannameMap = useMemo(() => new Map(beyannameler.map((b) => [b.id, b])), [beyannameler]);

  // Masraflar beyannameId'ye göre gruplanır; dosyaYok (ofis) ayrı grupta.
  const { gruplar, ofisMasraflar, ofisToplam } = useMemo(() => {
    const harita = new Map<string, OperasyonMasraf[]>();
    const ofis: OperasyonMasraf[] = [];
    for (const m of ozet?.masraflar ?? []) {
      if (m.dosyaYok || !m.beyannameId) { ofis.push(m); continue; }
      const g = harita.get(m.beyannameId);
      if (g) g.push(m); else harita.set(m.beyannameId, [m]);
    }
    const topla = (list: OperasyonMasraf[]) => Math.round(list.reduce((s, m) => s + parseFloat(m.tutar), 0) * 100) / 100;
    const gruplar = Array.from(harita.entries()).map(([beyannameId, masraflar]) => ({
      beyannameId, beyanname: beyannameMap.get(beyannameId), masraflar, toplam: topla(masraflar),
    }));
    return { gruplar, ofisMasraflar: ofis, ofisToplam: topla(ofis) };
  }, [ozet?.masraflar, beyannameMap]);
```

- [ ] **Step 3: Açık hareketler render'ını gruplu hâle getir**

`Açık Hareketler` kartının `<CardContent className="space-y-2">` içindeki **masraf** map bloğunu — yani

```tsx
          {(ozet?.masraflar ?? []).map((m) => (
            <div key={m.id} ... data-testid={`row-masraf-${m.id}`}>
              ...
            </div>
          ))}
```

— şununla DEĞİŞTİR (avans bloğu ve boş-durum mesajı DEĞİŞMEZ):

```tsx
          {gruplar.map((g) => {
            const acik = acikGruplar.has(g.beyannameId);
            const b = g.beyanname;
            return (
              <div key={g.beyannameId} className="rounded-md border" data-testid={`group-beyanname-${g.beyannameId}`}>
                <button type="button" onClick={() => grupAcKapa(g.beyannameId)} className="flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-muted/50" data-testid={`button-group-toggle-${g.beyannameId}`}>
                  <span className="flex items-center gap-2">
                    {acik ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className="font-semibold text-destructive">−{formatPara(g.toplam, "TL")}</span>
                    <span className="text-muted-foreground">{b?.dosyaNo ?? "?"}{b?.beyanNo ? ` · ${b.beyanNo}` : ""} · {b?.alici ?? "?"}</span>
                  </span>
                  <Badge variant="secondary">{g.masraflar.length}</Badge>
                </button>
                {acik && (
                  <div className="border-t px-2 py-1 space-y-1">
                    {g.masraflar.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-sm py-0.5" data-testid={`row-masraf-${m.id}`}>
                        <span>{m.masrafTuru ?? "Masraf"} · {m.alacakli}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                          <Button variant="ghost" size="sm" onClick={() => masrafKaldir(m.id)} data-testid={`button-masraf-kaldir-${m.id}`}>Kaldır</Button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {ofisMasraflar.length > 0 && (
            <div className="rounded-md border" data-testid="group-ofis">
              <button type="button" onClick={() => grupAcKapa("__ofis__")} className="flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-muted/50" data-testid="button-group-toggle-ofis">
                <span className="flex items-center gap-2">
                  {acikGruplar.has("__ofis__") ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="font-semibold text-destructive">−{formatPara(ofisToplam, "TL")}</span>
                  <span className="text-muted-foreground">Ofis Masrafları</span>
                </span>
                <Badge variant="secondary">{ofisMasraflar.length}</Badge>
              </button>
              {acikGruplar.has("__ofis__") && (
                <div className="border-t px-2 py-1 space-y-1">
                  {ofisMasraflar.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm py-0.5" data-testid={`row-masraf-${m.id}`}>
                      <span><Badge variant="outline" className="mr-1">Ofis</Badge>{m.masrafTuru ?? "Masraf"} · {m.aciklama ?? "—"}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                        <Button variant="ghost" size="sm" onClick={() => masrafKaldir(m.id)} data-testid={`button-masraf-kaldir-${m.id}`}>Kaldır</Button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
```

**Not:** Boş-durum mesajı (`hareketSayisi === 0`) DEĞİŞMEZ ve masraf bloğunun ALTINDA kalır.

- [ ] **Step 4: Tip kontrolü + U+FFFD**

Run: `npm run check` → 0 hata.
Run: `node -e "console.log(require('fs').readFileSync('client/src/pages/portal/OperasyonKasaSayfasi.tsx','utf8').includes('�'))"` → `false`.

- [ ] **Step 5: Playwright doğrulaması**

DB hedefini doğrula (`DEV_NEON: true`). Hazırlık: `GRPUI` operasyon kullanıcısı (şube `Gemlik`) + `belgeZorunlu=false` tür `E2E DOSYA`; muhasebeden 3000 TL avans. Modal üzerinden (T1) veya API ile: aynı beyannameye **3 masraf** + başka bir beyannameye **1 masraf** + **1 Ofis masrafı** ekle.

1. Landing açık hareketlerde **iki beyanname grubu** + **"Ofis Masrafları" grubu** görünür.
2. 3 masraflı grubun başlığı: toplam tutar + dosya no + beyan no + müşteri + adet rozeti `3`. Grup varsayılan **kapalı** (masraf satırları görünmez).
3. Gruba (satırın herhangi bir yerine) tıkla → `button-group-toggle-{id}` → 3 masraf satırı açılır (`row-masraf-{id}` × 3), her birinde tür/alacaklı/tutar + `button-masraf-kaldir-{id}`.
4. Bir masrafı **Kaldır** → grup 2 masrafa düşer, başlık toplamı + adet rozeti güncellenir.
5. "Ofis Masrafları" grubunu aç → ofis masrafı açıklamayla görünür, **Ofis** rozeti var.
6. Tekrar başlığa tıkla → grup kapanır.
7. Regresyon: avanslar hâlâ düz yeşil satır; bakiye kartları doğru; Günü Kapat butonu çalışıyor.

**Temizlik:** `GRPUI` + tüm hareketleri + `E2E DOSYA` türü + `uploads/operasyon/` test dosyaları silinir; kanıtla.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/portal/OperasyonKasaSayfasi.tsx
git status
git commit -m "feat(operasyon): acik hareketler beyannameye gore gruplu acilir satirlar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Uçtan uca doğrulama + kalite kapıları

**Files:**
- Create (scratchpad): `e2e-kasam-ux.js`
- Kod değişikliği BEKLENMİYOR. Gerçek bir hata bulunursa raporla; "geçsin diye" değiştirme.

**Interfaces:**
- Consumes: T1 + T2

- [ ] **Step 1: DB hedefini doğrula**

Run: `node -e "require('dotenv').config();console.log('DEV_NEON:', /neon/.test(process.env.DATABASE_URL||''))"`
Expected: `DEV_NEON: true`. `false` ise DUR.

- [ ] **Step 2: Karma E2E senaryosu**

Scratchpad'de `e2e-kasam-ux.js` (Playwright chromium). Kurulum: `KASAME2E` operasyon kullanıcısı (şube `İstanbul - Erenköy` — boşluklu/Türkçe ad kasıtlı), `belgeZorunlu=false` tür `E2E DOSYA` ve `belgeZorunlu=true` tür `E2E YEMEK`; muhasebeden 5000 TL avans.

**(A) Kalıcı beyanname akışı:** Yeni Ödeme → beyanname seç (sabitlenir) → aynı beyannameye 3 masraf (`E2E DOSYA`, belge yok, tutar 100/200/300, alacaklı farklı) ekle → her Ekle sonrası tür/tutar/alacaklı sıfır, **beyanname sabit**; oturum listesi 3'e çıkar.
**(B) Gruplu liste:** modalı kapat → landing'de o beyanname için **kapalı grup**, başlık toplam −600 + dosya no + beyan no + müşteri + rozet 3.
**(C) Aç/kapa:** gruba tıkla → 3 masraf açılır; birini Kaldır → grup −400/rozet 2; tekrar tıkla → kapanır.
**(D) İkinci beyanname:** Yeni Ödeme → başka beyanname → 1 masraf → landing'de ikinci grup.
**(E) Ofis:** Yeni Ödeme → Ofis Masrafı → tür `E2E DOSYA` + açıklama + tutar 50 → "Ofis Masrafları" grubunda.
**(F) Belge zorunlu engelleme:** Yeni Ödeme → beyanname → tür `E2E YEMEK` + belge yok → Ekle → uyarı, kayıt YOK, **form korunur**.
**(G) beyan_no araması:** modal aramasına gerçek bir `beyanNo`'nun son 6 hanesi → doğru dosya listede, etikette `· <beyanNo>`.
**(H) Regresyon:** Günü Kapat → onay → açık hareketler boşalır ("Açık hareket yok"), bakiye devreder.
**(I) Boşluklu/Türkçe:** kullanıcının şubesi (`İstanbul - Erenköy`) hiçbir yerde bozulmaz (Şube Raporu'nda muhasebe tarafında kontrol edilebilir; bu turda opsiyonel).

Her adımın PASS/FAIL + kanıtını (tutar, DOM assert, ekran görüntüsü) raporla.

- [ ] **Step 3: Temizlik**

`KASAME2E` + tüm hareketleri + avansı + `E2E DOSYA`/`E2E YEMEK` türleri + `uploads/operasyon/` test dosyaları silinir. Doğrula:

```bash
node -e "require('dotenv').config();const{Pool}=require('@neondatabase/serverless');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"select (select count(*)::int from portal_kullanicilar where kullanici_adi like 'KASAME2E%') k, (select count(*)::int from masraf_turleri where ad like 'E2E%') t\").then(r=>{console.log('kalan E2E kullanici:',r.rows[0].k,'| kalan E2E tur:',r.rows[0].t);process.exit(0)})"
```
Expected: `kalan E2E kullanici: 0 | kalan E2E tur: 0`. Ayrıca `ls uploads/operasyon/` → test dosyası kalmamalı.

- [ ] **Step 4: Kalite kapıları**

Run: `npm run check` → 0 hata.
Run: `npm run build` → hatasız; `dist/` üretilir.

- [ ] **Step 5: Commit (yalnız gerçek bir hata düzeltildiyse)**

Kod değişmediyse commit YOK. Değiştiyse açık yolla ekle + `fix(operasyon): …` mesajı.

---

## Self-Review Notu

**Spec kapsamı:**
- §2/§4 Kalıcı beyanname + anlık kayıt + hata-koru → T1 (`YeniOdemeModal` ekle/masrafFormuSifirla/hata yolu)
- §3 Landing (form → buton, bakiye + Günü Kapat kalır) → T1 Step 2
- §4 Modal ayrı bileşen → T1 Step 1
- §5 Gruplu açılır liste (beyanname + ofis, satır tümü tıklanabilir, işlevsellik korunur) → T2
- §7 Doğrulama (check/build, DEV DB izolasyonu, mevcut testid'ler, Playwright) → her görevin adımları + T3

**Tip tutarlılığı:** `YeniOdemeModal` props `{ open, onClose }` T1'de tanımlı, aynı adla çağrılır. `beyannameId`/`dosyaYok`/`masrafTuru` alan adları modal ile grup lookup arasında tutarlı (`OperasyonMasraf.beyannameId`, `.dosyaYok`, `.masrafTuru`). `masrafKaldir(id)` T1'de sayfada tanımlı, T2 gruplu satırlarda çağırır. `belgeZorunlu` hesabı (tr-locale) hem modalda hem T5 spec'inde birebir.

**Bilinçli tercih:** T1'de açık hareketler DÜZ kalır (T2 gruplar) — her görev bağımsız test edilebilir. Modal ve sayfa ayrı queryKey paylaşır (`beyannameler`, `ozet`) → cache paylaşımı, ekstra network yok.

**Kapsam dışı (planda görev YOK):** backend/şema/uç · temsilci/muhasebe formları · Kapanışlarım/Şube Masraf/Şube Raporu · gün kapatma mantığı · avans ekleme/görünüm · Excel toplu yükleme.
