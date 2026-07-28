# Operasyon Kasa Ekranları Redesign — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operasyon Kasa'nın 3 ekranını (Kasam, Kapanışlarım, muhasebe Şube Masraf) onaylanmış "modern finans dashboard" tasarım diline geçirmek — işlevsellik birebir korunarak.

**Architecture:** Ortak sunum bileşenleri (`kasaUI.tsx`: KPI kart, gün kutusu, rejim rozeti, Son Devir kartı) + ortak sütunlu genişleyen masraf tablosu (`MasrafTablosu.tsx`) çıkarılır; 3 ekran bu bileşenleri tüketir. Tek backend eklentisi: `getSonKapanis` + Kasam özet endpoint'ine `sonDevir` alanı. Veri modeli, iş kuralları, mevcut callback'ler değişmez.

**Tech Stack:** React 18 + TypeScript + Tailwind + shadcn/ui (wouter, TanStack Query). Backend Express + Drizzle. `tsx` dev, tek port 5000.

## Global Constraints

- **Test runner YOK.** Bu repoda test/lint/format yok; tek kalite kapısı `npm run check` (tsc --noEmit). Her task'ın "doğrulama" adımı = `npm run check` temiz + (uygulanabilirse) canlı görsel kontrol. TDD adımları YERİNE bu geçerlidir.
- **İşlevselliği koru:** Redesign yalnız sunum. Şunlar birebir korunur — `masraflariGrupla`, gün kapanış/devir, avans yükleme (tarih seçicili), masraf silme (operasyon), açık avans silme (muhasebe), Geri Aç, belge linkleri, 10sn polling, iki-katman auth, ters aç/kapa varsayılanları.
- **Tarih:** text `YYYY-MM-DD`; gösterim `formatTarih`/`formatTarihKisa` ile — `new Date(...)` PARSE YOK (timezone tuzağı).
- **Renk disiplini (verbatim):** Tek accent ailesi + shadcn nötr token'ları. Yüzeyler: `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted/40`. Accent = indigo (`text-indigo-600`, `bg-indigo-50`, `dark:bg-indigo-950/40`). Semantik: pozitif/gelen = `text-emerald-600` / `bg-emerald-50`, negatif/masraf = `text-rose-600` / `bg-rose-50` (mevcut `text-destructive` ile uyumlu). **Rejim renkleri:** İthalat=indigo, İhracat=teal (`text-teal-700 bg-teal-50`), Transit=violet (`text-violet-700 bg-violet-50`), Ofis=orange (`text-orange-700 bg-orange-50`). GÖKKUŞAĞI YOK — bunlar dışında renk kullanma.
- **Grafik YOK** (operasyon/şube ekranları).
- **Sayılar:** büyük tutar/değerlerde `tabular-nums` sınıfı (hizalama).
- **Etiketler (üç ekranda birebir):** "Gelen Avans", "Güncel Masraflar", "Son Devir".
- **Görsel referans:** `docs/superpowers/plans/2026-07-28-operasyon-kasa-mockup.html` (onaylı mockup v6, git'te kalıcı). Şüphede oraya bak — renk/ölçü/yapı orada.
- **FK/isim kuralları:** mevcut kod desenini izle; yeni Türkçe karakterli TS alanı ekleme.
- **Deploy:** `git push` = deploy. Task'lar commit eder; push YALNIZ Task 7'de (topluca), ara task'larda push YOK.

---

## File Structure

- **Create** `client/src/pages/portal/kasaUI.tsx` — ortak sunum primitifleri (saf, veri-bağımsız): `formatRejim`, `REJIM_STIL`, `RejimRozeti`, `KpiKart`, `GunKutusu`, `SonDevirKart`. Tek sorumluluk: kasa ekranlarının görsel yapı taşları.
- **Create** `client/src/pages/portal/MasrafTablosu.tsx` — ortak sütunlu genişleyen masraf tablosu (grup başlığı + açılan alt kalemler + belge butonu). Props ile ters aç/kapa ve opsiyonel "Kaldır" davranışı yönetilir.
- **Modify** `server/storage.ts` — `getSonKapanis` interface + impl.
- **Modify** `server/routes.ts:5392-5400` — `/api/portal/operasyon/ozet` yanıtına `sonDevir`.
- **Modify** `client/src/pages/portal/OperasyonKasaSayfasi.tsx` — yeni bileşenleri kullan; header + KPI + aksiyon + tablo redesign.
- **Modify** `client/src/pages/portal/OperasyonTakipSayfasi.tsx` — Şube Masraf detayını yeni bileşenlerle redesign.
- **Modify** `client/src/pages/portal/OperasyonKapanislarSayfasi.tsx` — Kapanışlarım'ı yeni tabloyla redesign.
- **Unchanged:** `masrafGruplama.ts` (mantık aynı; `MasrafGrubu.tarih` zaten var), `portalUtils.ts` (formatTarih/Kisa zaten var), `shared/schema.ts`.

---

### Task 1: Backend — "Son Devir" özeti

**Files:**
- Modify: `server/storage.ts` (interface ~421 civarı; impl `getKapanislar` yanına ~3989 civarı)
- Modify: `server/routes.ts:5392-5400`

**Interfaces:**
- Produces: `storage.getSonKapanis(operasyonId: string): Promise<{ gunTarihi: string; kapanisBakiye: string } | null>`
- Produces: özet yanıtı artık `{ bakiye, avanslar, masraflar, sonDevir: { gunTarihi, kapanisBakiye } | null }`

- [ ] **Step 1: storage interface satırı ekle** (`getOperasyonBakiye(...)` interface satırının hemen altına):

```ts
  getSonKapanis(operasyonId: string): Promise<{ gunTarihi: string; kapanisBakiye: string } | null>;
```

- [ ] **Step 2: storage impl ekle** (`getKapanislar` metodunun hemen üstüne veya altına):

```ts
  async getSonKapanis(operasyonId: string): Promise<{ gunTarihi: string; kapanisBakiye: string } | null> {
    const [k] = await db.select({ gunTarihi: operasyonGunKapanis.gunTarihi, kapanisBakiye: operasyonGunKapanis.kapanisBakiye })
      .from(operasyonGunKapanis)
      .where(eq(operasyonGunKapanis.operasyonId, operasyonId))
      .orderBy(desc(operasyonGunKapanis.kapanisZamani))
      .limit(1);
    return k ?? null;
  }
```

- [ ] **Step 3: özet endpoint'e ekle** — `routes.ts:5392-5399` bloğunu değiştir:

```ts
  app.get("/api/portal/operasyon/ozet", requireOperasyon, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const bakiye = await storage.getOperasyonBakiye(ben.id);
      const { avanslar, masraflar } = await storage.getAcikHareketler(ben.id);
      const sonDevir = await storage.getSonKapanis(ben.id);
      res.json({ bakiye, avanslar, masraflar, sonDevir });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
```

- [ ] **Step 4: Doğrula** — `npm run check` → EXIT 0. (Muhasebe Şube Masraf detayı kapanışları zaten `getKapanislar` ile döndürüyor; orada `sonDevir` = `kapanislar[0]`'dan türetilecek, ek backend gerekmez.)

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts server/routes.ts
git commit -m "feat(operasyon): ozet endpointine sonDevir (son kapanis) ekle"
```

---

### Task 2: Ortak sunum primitifleri — `kasaUI.tsx`

**Files:**
- Create: `client/src/pages/portal/kasaUI.tsx`

**Interfaces:**
- Produces: `formatRejim(rejim: string | null | undefined): string`
- Produces: `REJIM_STIL: Record<"im"|"ex"|"tr"|"of", { rozet: string; avatar: string; serit: string }>` + `rejimAnahtar(rejim, dosyaYok): "im"|"ex"|"tr"|"of"`
- Produces: `<RejimRozeti rejim dosyaYok />`, `<KpiKart ikon label deger renk? alt? />`, `<GunKutusu />`, `<SonDevirKart gunTarihi kapanisBakiye />`
- Consumes: `formatTarih`, `formatTarihKisa`, `formatPara` from `./portalUtils`; `lucide-react` ikonları.

- [ ] **Step 1: Dosyayı oluştur.** Rejim eşleme + stiller + saf bileşenler:

```tsx
import type { ReactNode } from "react";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Calendar, RotateCcw, Download } from "lucide-react";
import { formatPara } from "./portalUtils";

// rejim kodu (IM/EX/TR/AN) + dosyaYok → görsel anahtar. AN (antrepo) İthalat kanalı.
export function rejimAnahtar(rejim: string | null | undefined, dosyaYok?: boolean): "im" | "ex" | "tr" | "of" {
  if (dosyaYok) return "of";
  const r = (rejim ?? "").toUpperCase();
  if (r === "EX") return "ex";
  if (r === "TR") return "tr";
  return "im"; // IM, AN, boş → İthalat kanalı
}

export function formatRejim(rejim: string | null | undefined, dosyaYok?: boolean): string {
  return { im: "İthalat", ex: "İhracat", tr: "Transit", of: "Ofis" }[rejimAnahtar(rejim, dosyaYok)];
}

// Tek accent + rejim renk kodu. GÖKKUŞAĞI YOK — bu tablo dışına renk çıkma.
export const REJIM_STIL: Record<"im" | "ex" | "tr" | "of", { rozet: string; avatar: string; serit: string }> = {
  im: { rozet: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300", avatar: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300", serit: "bg-indigo-600" },
  ex: { rozet: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300", avatar: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300", serit: "bg-teal-600" },
  tr: { rozet: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300", avatar: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300", serit: "bg-violet-600" },
  of: { rozet: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300", avatar: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300", serit: "bg-orange-500" },
};

export function RejimRozeti({ rejim, dosyaYok }: { rejim: string | null | undefined; dosyaYok?: boolean }) {
  const k = rejimAnahtar(rejim, dosyaYok);
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${REJIM_STIL[k].rozet}`}>{formatRejim(rejim, dosyaYok)}</span>;
}

export function KpiKart({ ikon, label, deger, renk = "text-foreground", alt }: { ikon: ReactNode; label: string; deger: ReactNode; renk?: string; alt?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">{ikon}</span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className={`text-2xl font-bold tracking-tight tabular-nums ${renk}`}>{deger}</div>
      {alt && <div className="mt-2 text-xs text-muted-foreground">{alt}</div>}
    </div>
  );
}

export function GunKutusu() {
  const d = new Date();
  const gun = `${d.getDate()} ${["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"][d.getMonth()]} ${d.getFullYear()}`;
  const haftaGun = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"][d.getDay()];
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 shadow-sm">
      <Calendar className="h-4 w-4 text-indigo-600" />
      <div className="leading-tight">
        <div className="text-[13px] font-semibold">{gun}</div>
        <div className="text-[10.5px] text-muted-foreground">{haftaGun} · bugün açık</div>
      </div>
    </div>
  );
}

export function SonDevirKart({ gunTarihi, kapanisBakiye }: { gunTarihi: string | null; kapanisBakiye: string | null }) {
  const kisa = (t: string | null) => (t && t.length >= 10 ? `${t.slice(8, 10)}/${t.slice(5, 7)}` : "—");
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"><RotateCcw className="h-[18px] w-[18px]" /></span>
        <span className="text-sm font-medium text-muted-foreground">Son Devir</span>
      </div>
      {gunTarihi ? (
        <>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <span className="rounded-md border bg-muted/40 px-2 py-0.5 tabular-nums">{kisa(gunTarihi)}</span>
            <span className="text-muted-foreground">→</span>
            <span className="rounded-md border bg-muted/40 px-2 py-0.5">bugün</span>
          </div>
          <div className="text-xl font-bold tracking-tight tabular-nums">{formatPara(kapanisBakiye, "₺")}</div>
          <div className="mt-1.5 text-xs text-muted-foreground">önceki gün açılışı</div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Henüz kapanış yok</div>
      )}
    </div>
  );
}

export const IK = { Wallet, ArrowDownToLine, ArrowUpFromLine, Download }; // ekranlarda KpiKart ikonu için
```

- [ ] **Step 2: Doğrula** — `npm run check` → EXIT 0. (Bileşenler henüz kullanılmıyor; tsc importları ve tipleri doğrular. lucide-react proje bağımlılığıdır — mevcut ekranlar `ChevronRight` vb. import ediyor.)

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/portal/kasaUI.tsx
git commit -m "feat(portal): kasa ortak sunum bilesenleri (KpiKart/GunKutusu/RejimRozeti/SonDevirKart)"
```

---

### Task 3: Ortak sütunlu genişleyen tablo — `MasrafTablosu.tsx`

**Files:**
- Create: `client/src/pages/portal/MasrafTablosu.tsx`

**Interfaces:**
- Consumes: `GruplamaSonucu` (`{ gruplar, ofisMasraflar, ofisToplam }`) from `./masrafGruplama`; `RejimRozeti`, `REJIM_STIL`, `rejimAnahtar` from `./kasaUI`; `formatPara`, `formatTarihKisa` from `./portalUtils`.
- Produces: `<MasrafTablosu gruplarSonucu acikSet onToggle varsayilanAcik? onKaldir? anahtarOnEk? />`
  - `gruplarSonucu: GruplamaSonucu`
  - `acikSet: Set<string>` + `onToggle(anahtar: string): void`
  - `varsayilanAcik?: boolean` — false (Açık Hareketler: sette-olan-açık) | true (Kapanmış gün içi: sette-olan-kapalı, negatif). Grup açık mı = `varsayilanAcik ? !acikSet.has(a) : acikSet.has(a)`.
  - `onKaldir?(masrafId: string): void` — verilirse alt kalemlerde "Kaldır" gösterir (Kasam operasyon). Yoksa gösterilmez.
  - `anahtarOnEk?: string` — kapanış içi benzersiz anahtar için (ör. `k.id`); grup anahtarı `${anahtarOnEk}-${beyannameId}`.

- [ ] **Step 1: Dosyayı oluştur.** Başlık satırı + grup satırı AYNI grid şablonu (`grid-cols-[66px_96px_104px_168px_minmax(0,1fr)_120px_28px]`), alt kalemler ana ızgaraya hizalı (tarih col 1, tür col 3, tutar col 6, belge butonu col 7). Grup toplamı `formatPara(g.toplam, "₺")`, kalem sayısı ≥2 ise rozet. Rejim rozeti + avatar `REJIM_STIL`'den. Firma `beyanname.alici` (truncate + `title`). Chevron `ChevronDown/Right`. Belge: `Download` ikon buton (`m.belgeDosya` varsa), `href="/"+belgeDosya`. Ofis grubu ayrı, `dosyaYok` → rejimAnahtar "of". **Görsel için `focus-v6.html`'i referans al; renk/ölçüler Global Constraints ve o mockuptan.** İç işlev (aç/kapa, kaldır) props ile; tablo hiçbir fetch yapmaz — saf sunum.

Kritik iskelet (subagent tamamlar):

```tsx
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import type { Beyanname, OperasyonMasraf } from "@shared/schema";
import type { GruplamaSonucu } from "./masrafGruplama";
import { formatPara, formatTarihKisa } from "./portalUtils";
import { RejimRozeti, REJIM_STIL, rejimAnahtar } from "./kasaUI";

const GRID = "grid grid-cols-[66px_96px_104px_168px_minmax(0,1fr)_120px_28px] gap-3 items-center";

function bas2(s: string | null | undefined) { return (s ?? "?").trim().slice(0, 2).toUpperCase(); }

export function MasrafTablosu({ gruplarSonucu, acikSet, onToggle, varsayilanAcik = false, onKaldir, anahtarOnEk = "" }: {
  gruplarSonucu: GruplamaSonucu; acikSet: Set<string>; onToggle: (a: string) => void;
  varsayilanAcik?: boolean; onKaldir?: (id: string) => void; anahtarOnEk?: string;
}) {
  const { gruplar, ofisMasraflar, ofisToplam } = gruplarSonucu;
  const acikMi = (a: string) => (varsayilanAcik ? !acikSet.has(a) : acikSet.has(a));
  const altKalem = (m: OperasyonMasraf) => (
    <div key={m.id} className={GRID + " px-5 py-2 text-sm border-b border-dashed last:border-b-0"}>
      <span className="text-xs text-muted-foreground tabular-nums">{formatTarihKisa(m.tarih)}</span>
      <span />
      <span className="col-start-3 font-medium">{m.masrafTuru ?? "Masraf"}</span>
      <span className="col-start-6 text-right font-semibold text-rose-600 tabular-nums">−{formatPara(m.tutar, "₺")}</span>
      <span className="col-start-7 justify-self-end flex items-center gap-1">
        {m.belgeDosya && <a className="flex h-6 w-6 items-center justify-center rounded-md border text-indigo-600 hover:bg-indigo-50" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer" title="Belgeyi indir"><Download className="h-3.5 w-3.5" /></a>}
        {onKaldir && <button className="text-xs text-muted-foreground hover:text-rose-600" onClick={() => onKaldir(m.id)}>Kaldır</button>}
      </span>
    </div>
  );
  // ... grup başlığı (RejimRozeti, avatar, firma, toplam, kalem sayısı rozeti, chevron) + açıldığında g.masraflar.map(altKalem)
  // ... ofis grubu (rejimAnahtar "of"): başlık + ofisMasraflar.map(altKalem)
  // ... başlık satırı: Tarih · Dosya No · Tür · Beyanname No · Firma · Tutar
  return (/* rounded-xl border bg-card shadow-sm ... */);
}
```

- [ ] **Step 2: Doğrula** — `npm run check` → EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/portal/MasrafTablosu.tsx
git commit -m "feat(portal): ortak sutunlu genisleyen MasrafTablosu bileseni"
```

---

### Task 4: Kasam ekranı redesign — `OperasyonKasaSayfasi.tsx`

**Files:**
- Modify: `client/src/pages/portal/OperasyonKasaSayfasi.tsx`

**Interfaces:**
- Consumes: `KpiKart`, `GunKutusu`, `SonDevirKart`, `IK` from `./kasaUI`; `MasrafTablosu` from `./MasrafTablosu`. `Ozet` tipine `sonDevir` ekle.

- [ ] **Step 1: `Ozet` tipini genişlet:**

```ts
type Ozet = { bakiye: number; avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[]; sonDevir: { gunTarihi: string; kapanisBakiye: string } | null };
```

- [ ] **Step 2: Header'ı redesign et** — mevcut basit başlık yerine: sol `Kasam` + şube alt-satırı, sağ `<GunKutusu />` + avatar (baş-harf). Şube adı `me` yoksa sabit "Şube kasası" (Kasam'da `me` prop yok; başlık sade tutulur).

- [ ] **Step 3: 4 KPI kartını `KpiKart`/`SonDevirKart` ile kur:**

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
  <KpiKart ikon={<IK.Wallet className="h-[19px] w-[19px]" />} label="Güncel Bakiye" deger={`${formatPara(ozet?.bakiye ?? 0)} ₺`} alt="şube kasası" />
  <KpiKart ikon={<IK.ArrowDownToLine className="h-[19px] w-[19px]" />} label="Gelen Avans" deger={`${formatPara(acikAvansToplam)} ₺`} renk="text-emerald-600" alt="bekleyen yok / güncel" />
  <KpiKart ikon={<IK.ArrowUpFromLine className="h-[19px] w-[19px]" />} label="Güncel Masraflar" deger={`${formatPara(acikMasrafToplam)} ₺`} renk="text-rose-600" alt={`${ozet?.masraflar.length ?? 0} kalem · kapatılmamış`} />
  <SonDevirKart gunTarihi={ozet?.sonDevir?.gunTarihi ?? null} kapanisBakiye={ozet?.sonDevir?.kapanisBakiye ?? null} />
</div>
```

- [ ] **Step 4: Aksiyon barını koru/biçimlendir** — mevcut "Yeni Ödeme"/"Günü Kapat" butonları KALIR; primary + outline stiliyle bir satırda (sol/sağ). Mevcut `setYeniOdeme(true)` ve `setKapatDialog(true)` bağlantıları AYNEN.

- [ ] **Step 5: Açık Hareketler bloğu** — gelen avans satırları (mevcut yeşil blok, "Gelen Avans · dd/mm" metni korunur) + `<MasrafTablosu>`:

```tsx
<MasrafTablosu gruplarSonucu={{ gruplar, ofisMasraflar, ofisToplam }} acikSet={acikGruplar} onToggle={grupAcKapa} varsayilanAcik={false} onKaldir={masrafKaldir} />
```

Eski inline grid tablo JSX'i (başlık + gruplar.map + ofis) TAMAMEN silinir; `MasrafTablosu` onun yerine gelir. `masrafKaldir`, `grupAcKapa`, `acikGruplar` AYNEN kullanılır.

- [ ] **Step 6: Doğrula** — `npm run check` → EXIT 0. Kod incelemesi: `ozet?.masraflar`, `acikAvansToplam`, `acikMasrafToplam`, `YeniOdemeModal`, `kapatDialog` bağlantıları bozulmadı.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/portal/OperasyonKasaSayfasi.tsx
git commit -m "feat(portal): Kasam ekrani redesign (KPI + SonDevir + ortak MasrafTablosu)"
```

---

### Task 5: Şube Masraf (muhasebe) redesign — `OperasyonTakipSayfasi.tsx`

**Files:**
- Modify: `client/src/pages/portal/OperasyonTakipSayfasi.tsx`

**Interfaces:**
- Consumes: `KpiKart`, `GunKutusu`, `SonDevirKart`, `IK` from `./kasaUI`; `MasrafTablosu` from `./MasrafTablosu`.

- [ ] **Step 1: Seçili şube Detay kartının başlığına** `<GunKutusu />` + şube adı ekle; altına **4 KPI**: Güncel Bakiye (`detay.bakiye`), Gelen Avans (`detay.acik.avanslar` toplamı, emerald), Güncel Masraflar (`detay.acik.masraflar` toplamı, rose), Son Devir (`detay.kapanislar[0]` → `{gunTarihi, kapanisBakiye}` ya da yoksa null). Backend eklentisi gerekmez — kapanışlar zaten geliyor.

- [ ] **Step 2: Açık Hareketler** — gelen avans satırları (Kaldır butonu koşullu `!a.kapanisId` KORUNUR — mevcut `avansKaldir`) + `<MasrafTablosu gruplarSonucu={masraflariGrupla(detay.acik.masraflar, beyannameMap)} acikSet={acikAcikGruplar} onToggle={acikGrupAcKapa} varsayilanAcik={false} />` (muhasebe masraf silmez → `onKaldir` verilmez).

- [ ] **Step 3: Kapanmış Günler** — katlanır gün başlıkları KORUNUR (Açılış/Avans/Masraf/Kapanış özeti + "Geri Aç" kardeş buton — iç içe button YASAK). Gün açıldığında içerik `<MasrafTablosu gruplarSonucu={masraflariGrupla(k.masraflar, beyannameMap)} acikSet={kapaliKapanisGruplar} onToggle={kapanisGrupAcKapa} varsayilanAcik={true} anahtarOnEk={k.id} />`. Kapanmış günün AVANS satırları (mevcut render) korunur.

- [ ] **Step 4: Eski inline grid tablo JSX'leri** (açık + her iki kapanış grubu) `MasrafTablosu` ile değiştirilir. `avansKaldir`, `avansGonder`, `geriAc`, tarih seçicili avans dialog AYNEN.

- [ ] **Step 5: Doğrula** — `npm run check` → EXIT 0. İnceleme: `acikAcikGruplar`/`kapaliKapanisGruplar` ters varsayılanları (`varsayilanAcik` false/true) doğru eşlendi; Geri Aç butonu gün başlığında KARDEŞ (iç içe değil).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/portal/OperasyonTakipSayfasi.tsx
git commit -m "feat(portal): Sube Masraf redesign (KPI + ortak MasrafTablosu, islev korundu)"
```

---

### Task 6: Kapanışlarım redesign — `OperasyonKapanislarSayfasi.tsx`

**Files:**
- Modify: `client/src/pages/portal/OperasyonKapanislarSayfasi.tsx`

- [ ] **Step 1: Header** — `Kapanışlarım` başlığı + `<GunKutusu />`. KPI YOK, aksiyon barı YOK (spec §4: salt kapanış geçmişi).

- [ ] **Step 2: Kapanmış Günler** — katlanır gün başlıkları KORUNUR (varsayılan KAPALI — mevcut `acikGunler`). Gün açıldığında `<MasrafTablosu gruplarSonucu={masraflariGrupla(k.masraflar, beyannameMap)} acikSet={kapaliGruplar} onToggle={grupAcKapa} varsayilanAcik={true} anahtarOnEk={k.id} />`. Kapanış avans satırları (mevcut) korunur. "Geri Aç" YOK (bu ekran operasyon).

- [ ] **Step 3: Eski inline grid tablo JSX'i** `MasrafTablosu` ile değiştirilir. `grupAcKapa`, `kapaliGruplar`, `acikGunler`, `gunAcKapa` AYNEN.

- [ ] **Step 4: Doğrula** — `npm run check` → EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/portal/OperasyonKapanislarSayfasi.tsx
git commit -m "feat(portal): Kapanislarim redesign (ortak MasrafTablosu)"
```

---

### Task 7: Uçtan uca doğrulama + deploy

**Files:** yok (doğrulama + deploy)

- [ ] **Step 1: Tam type check** — `npm run check` → EXIT 0.
- [ ] **Step 2: Kullanılmayan importları temizle** — 3 ekrandan silinen inline tablo JSX'i sonrası artık kullanılmayan importlar (ör. `ChevronRight/Down` yalnız tabloda kullanılıyorsa) `npm run check` ile yakalanır; temizle. Yeniden `npm run check` → EXIT 0.
- [ ] **Step 3: Commit (varsa temizlik)** + **push** (tek push, topluca):

```bash
git add -A client/src/pages/portal server
git commit -m "chore(portal): kasa redesign — kullanilmayan import temizligi" || echo "temizlik yok"
git push origin main
```

- [ ] **Step 4: Deploy doğrula** — VPS'te HEAD güncel + yeni bundle + pm2 online (önceki deploy doğrulama deseni: `ssh root@167.235.252.49` → `git rev-parse --short HEAD` + `ls -t dist/public/assets/index-*.js` değişti + `pm2 describe cnctracker` online).
- [ ] **Step 5: Canlı görsel kontrol** — cncgumruk.space portal: operasyon (yılmaz) Kasam + Kapanışlarım; muhasebe Şube Masraf. Kontrol listesi: 4 KPI doğru (Gelen Avans/Güncel Masraflar/Son Devir etiketleri), gün kutusu bugünü gösteriyor, masraf tablosu sütunlu + rejim rozetli, çok kalemli grup açılıyor + alt kalem hizalı + belge butonu, Yeni Ödeme/Günü Kapat çalışıyor, avans yükle (tarih seçici) + açık avans Kaldır (muhasebe) + Geri Aç çalışıyor.

---

## Self-Review Notları

- **Spec kapsamı:** §2 tasarım dili → Task 2/3 (renk/token/rozet/tablo). §3.1 header → Task 4/5/6 Step 1. §3.2 KPI → Task 4/5. §3.3 aksiyon → Task 4 Step 4. §3.4 tablo → Task 3. §4 ekran farkları → Task 4/5/6 (KPI Kasam+Şube var, Kapanışlarım yok; Kaldır yalnız Kasam onKaldir). §5 etiketler → Global Constraints + Task 4/5. §6 backend → Task 1. §7 işlevsellik → her task "AYNEN korunur" adımları.
- **Tip tutarlılığı:** `sonDevir: { gunTarihi: string; kapanisBakiye: string } | null` Task 1 (backend), Task 2 (`SonDevirKart`), Task 4 (`Ozet`) arasında birebir. `MasrafTablosu` props Task 3'te tanımlı, Task 4/5/6'da aynı isimlerle tüketiliyor. `varsayilanAcik` false=Açık Hareketler, true=Kapanmış — ters-varsayılan memory kuralıyla uyumlu.
- **Placeholder:** Task 3 iskeleti "subagent tamamlar" içeriyor ama grid şablonu, props, alt-kalem kodu ve mockup referansı tam verildi — görsel tablo için bu kabul edilebilir sınır (tüm satır-satır JSX'i plana kopyalamak DRY değil; mockup kaynak).
