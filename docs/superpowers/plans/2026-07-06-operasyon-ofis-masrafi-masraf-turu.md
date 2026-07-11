# Operasyon Ofis Masrafı + Yeni Masraf Türü Ekleme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operasyon masraf formunda "Dosya yok" → "Ofis Masrafı" (dosyasız, açıklama zorunlu, raporlarda etiketli); üç portal formunda masraf türü listede yoksa yeni tür ekleme.

**Architecture:** Yeni `POST /api/portal/masraf-turleri` (requirePortal, çift-kayıt önlemli); paylaşılan `MasrafTuruSecici` bileşeni ("+ Yeni tür" dialog'u) üç forma entegre; Ofis Masrafı yalnız UI etiketi + rapor rozeti (mevcut `dosyaYok` alanı, ŞEMA DEĞİŞMEZ). Spec: `docs/superpowers/specs/2026-07-06-operasyon-ofis-masrafi-ve-masraf-turu-ekleme-design.md`.

**Tech Stack:** Express, React 18 + TanStack Query + shadcn/ui, Playwright (scratchpad).

## Global Constraints

- Türkçe kaynak dosyaları PowerShell Set-Content/Out-File ile ASLA yazılmaz — yalnız Edit/Write; iş sonunda `node -e` ile U+FFFD taraması.
- `git push` YASAK (push = canlı deploy). **AÇIK-YOL `git add <dosya>` — asla `git add -A`/`.`** (paylaşılan çalışma ağacı + aktif paralel oturum; commit öncesi `git status` ile yalnız kendi dosyalarını doğrula). `uploads/`, `.env`, xlsx dosyaları asla eklenmez.
- **DEV DB İZOLASYONU:** `.env` prod-tünel'e (localhost:5433) işaret ediyor OLABİLİR. Her DB-yazan/sunucu-testli görevin BAŞINDA `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` → **true (DEV Neon) olmalı**; değilse DUR (BLOCKED). .env'e DOKUNMA (kontrolcü ayarladı).
- Test runner YOK; kalite kapıları `npm run check` (tsc) + curl + Playwright (scratchpad) + `npm run build`. **ŞEMA DEĞİŞMEZ — db:push YOK.**
- Scratchpad: `C:\Users\cem\AppData\Local\Temp\claude\e--CEM-APPS-cnctracker\f8e48f44-2295-45d2-af94-f819937c735a\scratchpad` (Playwright chromium — mevcut e2e scriptlerinin yöntemi).
- Dev sunucu: port 5000. Sunucu KODU değişince restart: `netstat -ano | findstr :5000` → `taskkill //PID <pid> //F` → arka planda `npm run dev` → 5-8 sn. Frontend Vite ile otomatik tazelenir.
- Portal test kullanıcıları (dev DB): temsilci `suleyman`, muhasebe `muhasebe`, şifre `1234`. `requirePortal`/`requireMuhasebe`/`requireOperasyon` `./portalAuth`'tan.
- Mevcut masraf-türü testid'leri KORUNUR: `select-masraf-turu` (YeniTalep), `select-dogrudan-masraf-turu` (DogrudanOdeme), `select-op-masraf-turu` (OperasyonKasa).

---

### Task 1: `POST /api/portal/masraf-turleri` ucu (portal kullanıcıları için)

**Files:**
- Modify: `server/routes.ts` (mevcut `GET /api/portal/masraf-turleri` ~satır 4712 yanına)

**Interfaces:**
- Consumes: `storage.getMasrafTurleri()` (tümü), `storage.createMasrafTuru({ ad, sira, aktif })`, `requirePortal`.
- Produces: `POST /api/portal/masraf-turleri` → `MasrafTuru` (yeni veya mevcut).

- [ ] **Step 1: Ucu ekle**

`server/routes.ts`'te `app.get("/api/portal/masraf-turleri", requirePortal, ...)` bloğunun HEMEN ARDINA ekle:

```ts
  // Portal kullanıcısı yeni masraf türü ekleyebilir (paylaşılan liste); çift kayıt açmaz.
  app.post("/api/portal/masraf-turleri", requirePortal, async (req, res) => {
    try {
      const ad = String(req.body?.ad ?? "").trim();
      if (!ad) return res.status(400).json({ error: "Tür adı zorunlu" });
      const norm = (s: string) => s.trim().toLocaleLowerCase("tr");
      const mevcutlar = await storage.getMasrafTurleri();
      const mevcut = mevcutlar.find((t) => norm(t.ad) === norm(ad));
      if (mevcut) return res.json(mevcut); // aynı ad → yeni kayıt AÇMA, mevcudu döndür
      const yeni = await storage.createMasrafTuru({ ad, sira: 0, aktif: true });
      res.json(yeni);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
```

- [ ] **Step 2: Tip kontrolü + restart + curl duman testi**

Run: `npm run check` → 0 hata. DB hedefi doğrula (neon:true). Dev sunucuyu yeniden başlat.
Curl (suleyman/1234 login cookie jar; Türkçe gövde DOSYADAN `--data-binary`):
```
# yeni tür
curl -s -b /tmp/cj.txt -X POST http://localhost:5000/api/portal/masraf-turleri -H "Content-Type: application/json" --data-binary @/tmp/tur.json   # {"ad":"ZZTest Tür"}
# tekrar aynı ad → aynı id döner (yeni kayıt açılmaz)
curl -s -b /tmp/cj.txt -X POST http://localhost:5000/api/portal/masraf-turleri -H "Content-Type: application/json" --data-binary @/tmp/tur.json
# boş ad → 400
curl -s -b /tmp/cj.txt -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/api/portal/masraf-turleri -H "Content-Type: application/json" -d '{"ad":""}'
```
Beklenen: 1. çağrı 200 + yeni id; 2. çağrı 200 + AYNI id (dedup); boş ad 400. Test türünü dev DB'den sil (masraf_turleri, ad LIKE 'ZZTest %').

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git status   # yalnız routes.ts
git commit -m "feat(operasyon): POST /api/portal/masraf-turleri - portal kullanicisi yeni tur ekler (cift-kayit onlemli)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `MasrafTuruSecici` bileşeni + üç forma entegrasyon

**Files:**
- Create: `client/src/pages/portal/MasrafTuruSecici.tsx`
- Modify: `client/src/pages/portal/YeniTalepSayfasi.tsx`, `DogrudanOdemeSayfasi.tsx`, `OperasyonKasaSayfasi.tsx` (masraf türü Select bloğu)

**Interfaces:**
- Consumes: Task 1 `POST /api/portal/masraf-turleri`; `GET /api/portal/masraf-turleri`.
- Produces: `<MasrafTuruSecici value={string} onChange={(ad:string)=>void} testId={string} />` — trigger testid `select-${testId}`.

- [ ] **Step 1: Bileşeni oluştur**

`client/src/pages/portal/MasrafTuruSecici.tsx` — tam içerik:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { MasrafTuru } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const YENI = "__yeni__";

export default function MasrafTuruSecici({
  value, onChange, testId = "masraf-turu",
}: { value: string; onChange: (ad: string) => void; testId?: string }) {
  const { toast } = useToast();
  const { data: turler = [] } = useQuery<MasrafTuru[]>({ queryKey: ["/api/portal/masraf-turleri"] });
  const [dialogAcik, setDialogAcik] = useState(false);
  const [yeniAd, setYeniAd] = useState("");
  const [ekleniyor, setEkleniyor] = useState(false);

  const secildi = (v: string) => {
    if (v === YENI) { setYeniAd(""); setDialogAcik(true); return; }
    onChange(v);
  };

  const ekle = async () => {
    const ad = yeniAd.trim();
    if (!ad) { toast({ title: "Tür adı girin", variant: "destructive" }); return; }
    setEkleniyor(true);
    try {
      const res = await fetch("/api/portal/masraf-turleri", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad }), credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Eklenemedi");
      const yeni = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/portal/masraf-turleri"] });
      onChange(yeni.ad);
      setDialogAcik(false);
      toast({ title: "Masraf türü eklendi" });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setEkleniyor(false);
    }
  };

  return (
    <>
      <Select value={value} onValueChange={secildi}>
        <SelectTrigger data-testid={`select-${testId}`}><SelectValue placeholder="Seçin" /></SelectTrigger>
        <SelectContent>
          {turler.map((t) => (<SelectItem key={t.id} value={t.ad}>{t.ad}</SelectItem>))}
          <SelectItem value={YENI} data-testid="select-item-yeni-tur">+ Yeni tür ekle…</SelectItem>
        </SelectContent>
      </Select>
      <Dialog open={dialogAcik} onOpenChange={setDialogAcik}>
        <DialogContent>
          <DialogHeader><DialogTitle>Yeni Masraf Türü</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>Tür Adı</Label>
            <Input
              value={yeniAd}
              onChange={(e) => setYeniAd(e.target.value)}
              placeholder="Örn. Kırtasiye"
              data-testid="input-yeni-tur-ad"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ekle(); } }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAcik(false)}>Vazgeç</Button>
            <Button onClick={ekle} disabled={ekleniyor} data-testid="button-yeni-tur-ekle">{ekleniyor ? "Ekleniyor…" : "Ekle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: YeniTalepSayfasi entegrasyonu**

`YeniTalepSayfasi.tsx` import ekle (mevcut portal importlarının yanına): `import MasrafTuruSecici from "./MasrafTuruSecici";`.
Masraf türü bloğunu (satır ~401-410, `<Label>Masraf Türü</Label>` + `<Select value={masrafTuru}...>...</Select>`) şununla değiştir:

```tsx
                  <Label>Masraf Türü</Label>
                  <MasrafTuruSecici value={masrafTuru} onChange={setMasrafTuru} testId="masraf-turu" />
```
(Mevcut `Select`/`SelectContent`/`SelectItem` importları formda başka yerde kullanılıyorsa KALIR; `masrafTurleri` query'si kalır — zararsız.)

- [ ] **Step 3: DogrudanOdemeSayfasi entegrasyonu**

`DogrudanOdemeSayfasi.tsx` import `import MasrafTuruSecici from "./MasrafTuruSecici";`.
Masraf türü bloğunu (satır ~272-281) şununla değiştir:

```tsx
                <Label>Masraf Türü</Label>
                <MasrafTuruSecici value={masrafTuru} onChange={setMasrafTuru} testId="dogrudan-masraf-turu" />
```

- [ ] **Step 4: OperasyonKasaSayfasi entegrasyonu**

`OperasyonKasaSayfasi.tsx` import `import MasrafTuruSecici from "./MasrafTuruSecici";`.
Masraf türü bloğunu (satır ~155-159) şununla değiştir:

```tsx
                <Label>Masraf Türü</Label>
                <MasrafTuruSecici value={masrafTuru} onChange={setMasrafTuru} testId="op-masraf-turu" />
```

- [ ] **Step 5: Tip kontrolü + U+FFFD**

Run: `npm run check` → 0 hata. `node -e` U+FFFD taraması (MasrafTuruSecici.tsx + 3 form).

- [ ] **Step 6: Playwright — yeni tür ekleme**

Scratchpad `mt-t2.js`: suleyman/1234 login → Yeni Talep → ödeme tipi Normal Masraf → `select-masraf-turu` trigger'a tıkla → `select-item-yeni-tur` seç → dialog → `input-yeni-tur-ad`="ZZTest MT2" → `button-yeni-tur-ekle` → dialog kapanır, Select'te "ZZTest MT2" seçili. Sayfa yenile → tür listede kalıcı. Test türünü dev DB'den sil (LIKE 'ZZTest %').

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/portal/MasrafTuruSecici.tsx client/src/pages/portal/YeniTalepSayfasi.tsx client/src/pages/portal/DogrudanOdemeSayfasi.tsx client/src/pages/portal/OperasyonKasaSayfasi.tsx
git status
git commit -m "feat(operasyon): MasrafTuruSecici bileseni (+ yeni tur ekle) 3 forma entegre

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Ofis Masrafı etiketi + rapor rozetleri + E2E + build

**Files:**
- Modify: `client/src/pages/portal/OperasyonKasaSayfasi.tsx` (checkbox etiketi + toast + açık masraf rozeti), `OperasyonKapanislarSayfasi.tsx` (rozet), `OperasyonTakipSayfasi.tsx` (rozet)
- Create (scratchpad): `e2e-ofis-masrafi.js`

**Interfaces:**
- Consumes: `OperasyonMasraf.dosyaYok` (mevcut). Görsel: `dosyaYok=true` → "Ofis" rozeti.

- [ ] **Step 1: OperasyonKasa checkbox etiketi + toast**

`OperasyonKasaSayfasi.tsx` satır ~136-137 checkbox bloğunu şununla değiştir (state `dosyaYok` KALIR, testid + etiket değişir):

```tsx
                <Checkbox id="op-ofis" checked={dosyaYok} onCheckedChange={(v) => { setDosyaYok(v === true); if (v === true) setBeyannameId(""); }} data-testid="checkbox-op-ofis" />
                <Label htmlFor="op-ofis" className="font-normal text-muted-foreground">Ofis Masrafı — dosyaya bağlı değil, açıklama zorunlu</Label>
```
İki toast metnini güncelle (mantık AYNI kalır, yalnız kullanıcıya görünen metin):
```tsx
    if (!dosyaYok && !beyannameId) { toast({ title: "Beyanname seçin veya 'Ofis Masrafı' işaretleyin", variant: "destructive" }); return; }
```
ve dosyasız-açıklama doğrulamasındaki `"Dosyasız kayıtta açıklama zorunlu"` metnini `"Ofis masrafında açıklama zorunlu"` yap.

- [ ] **Step 2: OperasyonKasa açık masraf satırı — Ofis rozeti**

`OperasyonKasaSayfasi.tsx` açık masraf satırında (satır ~205) `<span className="font-medium">{m.masrafTuru ?? "Masraf"}</span>` ifadesini şununla değiştir:

```tsx
                <span className="font-medium">{m.dosyaYok && <Badge variant="outline" className="mr-1">Ofis</Badge>}{m.masrafTuru ?? "Masraf"}</span>
```
`Badge` import edilmemişse ekle: `import { Badge } from "@/components/ui/badge";`.

- [ ] **Step 3: Kapanislar + Takip — Ofis rozeti**

`OperasyonKapanislarSayfasi.tsx` masraf satırında `{m.masrafTuru ?? "Masraf"}` ifadesini `{m.dosyaYok && <Badge variant="outline" className="mr-1">Ofis</Badge>}{m.masrafTuru ?? "Masraf"}` ile değiştir; `Badge` zaten import edili (durum rozeti kullanıyor).

`OperasyonTakipSayfasi.tsx`'te İKİ yerde (açık masraf akışı + kapanmış gün masraf dökümü) `{m.masrafTuru ?? "Masraf"}` ifadelerini aynı şekilde `{m.dosyaYok && <Badge variant="outline" className="mr-1">Ofis</Badge>}{m.masrafTuru ?? "Masraf"}` ile değiştir; `Badge` zaten import edili.

- [ ] **Step 4: Tip kontrolü + U+FFFD**

Run: `npm run check` → 0 hata. `node -e` U+FFFD (3 dosya).

- [ ] **Step 5: E2E (Playwright) — iki özellik uçtan uca**

Scratchpad `e2e-ofis-masrafi.js` (dev DB; DB hedefi neon:true doğrula): operasyon kullanıcısı OFISE2E (1234) oluştur + muhasebe API'den 1000 avans.
(A) OFISE2E → Kasam: **"Ofis Masrafı"** (`checkbox-op-ofis`) işaretle → beyanname alanı gizlenir; masraf türü seçici → **"+ Yeni tür ekle"** → "Kira" ekle → seçili gelir; tutar 250, alacaklı "Ofis", açıklama "Temmuz kira", belge (dummy dosya) → Kaydet → bakiye 750; açık hareketlerde satırda **"Ofis" rozeti** + "Kira".
(B) muhasebe → Şube Masraf → OFISE2E Detay → açık masrafta "Ofis" rozeti görünür.
(C) Temsilci suleyman → Yeni Talep → masraf türü seçicide (A)'da eklenen "Kira" görünür (paylaşılan liste).
Sonuçları raporla. Başarısızlıkta kod DEĞİŞTİRME. Temizlik: OFISE2E + hareketleri + belge dosyası + eklenen test türleri (Kira/ZZTest) dev DB'den sil.

- [ ] **Step 6: Kalite kapıları**

Run: `npm run check` → hatasız; `npm run build` → dist/, hatasız. Dev sunucu açık kalır.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/portal/OperasyonKasaSayfasi.tsx client/src/pages/portal/OperasyonKapanislarSayfasi.tsx client/src/pages/portal/OperasyonTakipSayfasi.tsx
git status
git commit -m "feat(operasyon): Ofis Masrafi etiketi + raporlarda Ofis rozeti

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notu

- Spec §3 (Ofis Masrafı: etiket + rapor rozeti, dosyaYok yeniden etiketlenir, şema değişmez) → T3; §4 (POST ucu) → T1, (MasrafTuruSecici + 3 form) → T2; §6 (doğrulama: curl dedup, Playwright yeni-tür + Ofis, build) → T1 S2 / T2 S6 / T3 S5-6.
- Tip tutarlılığı: `MasrafTuruSecici` props (value/onChange/testId) T2'de tanımlı, 3 formda aynı çağrı; testId→`select-${testId}` mevcut testid'leri korur (masraf-turu / dogrudan-masraf-turu / op-masraf-turu). Endpoint dönüşü `MasrafTuru` (ad alanı) → `onChange(yeni.ad)`.
- ŞEMA DEĞİŞMEZ, db:push YOK (Ofis Masrafı mevcut `dosyaYok` alanını kullanır). Her görev tsc-yeşil (T1 backend; T2 bileşen+formlar birlikte; T3 salt UI).
- DEV DB izolasyonu her sunucu/DB testinde doğrulanır. Açık-yol git add + git status her commit'te.
- Kapsam dışı (tür silme/düzenleme portal UI, ofis ayrı kolon, tür arama) planda yok.
