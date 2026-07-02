# Tahsilat Aksiyon Merkezi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tahsilat Özet sekmesini "nakitim kimde, önce kimi arayayım" sorusuna cevap veren Aksiyon Merkezi'ne dönüştürmek: ödeme oranı + segment matrisi (Nakit Tuzağı / Büyük Risk / Küçük-Nötr / Sağlıklı) + önceki mizan deltaları + düz Türkçe "neden" cümlesi.

**Architecture:** Saf hesap fonksiyonları `shared/tahsilatHesaplari.ts`'e eklenir (iki tarafta da kullanılır). Dashboard endpoint'i (`/api/tahsilat/dashboard`) mevcut alanları koruyarak **additive** genişletilir. `TahsilatOzet.tsx` yeniden yazılır; `MusteriListesi.tsx` ve `RiskEsikleriModal.tsx` kolonlar/alanlar eklenerek güncellenir.

**Tech Stack:** Express + Drizzle (Neon PG), React 18 + TanStack Query + shadcn/ui, TS monorepo (`@shared/*` alias).

**Spec:** `docs/superpowers/specs/2026-07-02-tahsilat-aksiyon-merkezi-design.md`

## Global Constraints

- UI metinleri, alan adları, yorumlar **Türkçe** (mevcut konvansiyon).
- **Test runner yok.** Tek kalite kapısı: `npm run check` (tsc). Test komutu icat etme.
- Türkçe karakterli dosyaları **asla PowerShell Set-Content ile yazma** — Edit/Write araçlarını kullan (encoding tuzağı).
- Tarihler `text` alanlarda; karşılaştırmalar string/parse ile, `new Date(...)` üzerinden **route etme**.
- Dashboard API değişiklikleri **additive**: mevcut alan adı/anlamı değişmez, kaldırılmaz.
- Dokunulmaz: MizanYukleModal, upload/save endpoint'leri, Trend/Eşleştirme/Arşiv sekmeleri, `riskProfili` mantığı, para birimi işleme.
- Her task sonunda commit; **asla `git push` yapma** (push = deploy).
- FK/kolon adları explicit snake_case string (`decimal("ciro_esik", ...)`).

---

### Task 1: Şema — yeni eşik kolonları + db:push

**Files:**
- Modify: `shared/schema.ts:936-945` (tahsilatAyarlari tablosu)
- Modify: `server/storage.ts:3185-3199` (getTahsilatAyarlari default kaydı)

**Interfaces:**
- Produces: `TahsilatAyarlari` tipinde `ciroEsik: string` (decimal), `odemeOraniEsik: number` alanları. Task 4 `Number(ayarlar.ciroEsik)` ve `ayarlar.odemeOraniEsik` okur; Task 7 formda kullanır.

- [ ] **Step 1: `shared/schema.ts`'te tahsilatAyarlari'na 2 kolon ekle**

`faturaPenceresi` satırından hemen sonra, `guncellenme`'den önce:

```ts
  faturaPenceresi: integer("fatura_penceresi").notNull().default(90),
  ciroEsik: decimal("ciro_esik", { precision: 18, scale: 2 }).notNull().default("500000"),
  odemeOraniEsik: integer("odeme_orani_esik").notNull().default(60),
  guncellenme: timestamp("guncellenme").defaultNow(),
```

- [ ] **Step 2: `server/storage.ts` getTahsilatAyarlari default insert'ine alanları ekle**

3189-3197 aralığındaki `.values({...})` bloğu şöyle olur:

```ts
    const [created] = await db.insert(tahsilatAyarlari).values({
      id: DatabaseStorage.TAHSILAT_AYARLARI_ID,
      vipEsik: "5000000",
      yuksekBakiyeEsik: "500000",
      eskiOdemeEsik: 30,
      cokEskiOdemeEsik: 60,
      eksiPozisyonYuzde: 20,
      faturaPenceresi: 90,
      ciroEsik: "500000",
      odemeOraniEsik: 60,
    }).returning();
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 4: Şemayı DB'ye it**

Run: `npm run db:push`
Expected: `ciro_esik` ve `odeme_orani_esik` kolonları eklenir (mevcut kayıt default değerleri alır). İnteraktif onay isterse "add column" seçeneği.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(tahsilat): ciro_esik + odeme_orani_esik ayar kolonlari"
```

---

### Task 2: Saf hesap fonksiyonları — segment, ödeme oranı, neden cümlesi

**Files:**
- Modify: `shared/tahsilatHesaplari.ts` (dosya sonuna ekle; mevcut fonksiyonlara dokunma)

**Interfaces:**
- Produces (Task 4/5/6 kullanır — imzalar birebir):
  - `odemeOrani(borc: number, alacak: number): number | null` (0-1 arası; borc ≤ 0 → null)
  - `type TahsilatSegment = "SAGLIKLI" | "BUYUK_RISK" | "KUCUK_NOTR" | "NAKIT_TUZAGI"`
  - `interface SegmentEsikleri { odemeOraniEsik: number; eskiOdemeEsik: number }`
  - `firmaSegmenti(p: { netBakiye: number; odemeOrani: number | null; gecikme: number; kazandiriyor: boolean; esikler: SegmentEsikleri }): TahsilatSegment`
  - `nedenCumlesi(p: { gecikme: number; odemeOrani: number | null; hicOdemeYok: boolean; ytdIslemSayisi: number | null; islemAyOrt: number | null; deltaNetBakiye: number | null; eslesmemis: boolean; esikler: SegmentEsikleri }): string`
  - `kisaTutar(v: number): string` (1.2M / 340K biçimi)
  - `SEGMENT_LABEL`, `SEGMENT_PILL: Record<TahsilatSegment, string>`

- [ ] **Step 1: Fonksiyonları dosya sonuna ekle**

```ts
// ── Aksiyon Merkezi: ödeme oranı + segment + neden ──────────────────────────

// Yıl içi ödeme oranı (0-1). Fatura yoksa null → oran yorumlanamaz.
export function odemeOrani(borc: number, alacak: number): number | null {
  if (borc <= 0) return null;
  return alacak / borc;
}

export type TahsilatSegment = "SAGLIKLI" | "BUYUK_RISK" | "KUCUK_NOTR" | "NAKIT_TUZAGI";

export interface SegmentEsikleri {
  odemeOraniEsik: number; // yüzde (örn. 60)
  eskiOdemeEsik: number;  // gün (örn. 30)
}

// İki eksen: kazandırıyor mu (ciro eşiği — çağıran hesaplar) × ödüyor mu (oran + gecikme).
// Bakiye ≤ 0 olan firma tahsilat konusu değildir.
export function firmaSegmenti(p: {
  netBakiye: number;
  odemeOrani: number | null;
  gecikme: number;
  kazandiriyor: boolean;
  esikler: SegmentEsikleri;
}): TahsilatSegment {
  if (p.netBakiye <= 0) return "SAGLIKLI";
  const oranIyi = p.odemeOrani === null ? true : p.odemeOrani * 100 >= p.esikler.odemeOraniEsik;
  const oduyor = oranIyi && p.gecikme <= p.esikler.eskiOdemeEsik;
  if (p.kazandiriyor) return oduyor ? "SAGLIKLI" : "BUYUK_RISK";
  return oduyor ? "KUCUK_NOTR" : "NAKIT_TUZAGI";
}

export function kisaTutar(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
}

// Düz Türkçe gerekçe; parçalar " · " ile birleşir.
export function nedenCumlesi(p: {
  gecikme: number;
  odemeOrani: number | null;
  hicOdemeYok: boolean;
  ytdIslemSayisi: number | null;
  islemAyOrt: number | null;
  deltaNetBakiye: number | null;
  eslesmemis: boolean;
  esikler: SegmentEsikleri;
}): string {
  const parca: string[] = [];
  if (p.hicOdemeYok) parca.push("hiç ödeme yapmamış");
  else if (p.gecikme >= 9999) parca.push("ödeme kaydı yok");
  else if (p.gecikme >= 60) parca.push(`${Math.floor(p.gecikme / 30)} aydır ödeme yok`);
  else if (p.gecikme > p.esikler.eskiOdemeEsik) parca.push(`${p.gecikme} gündür ödeme yok`);
  if (!p.hicOdemeYok && p.odemeOrani !== null && p.odemeOrani * 100 < p.esikler.odemeOraniEsik) {
    parca.push(`ödeme oranı %${Math.round(p.odemeOrani * 100)}`);
  }
  if (p.ytdIslemSayisi !== null && p.islemAyOrt !== null && p.islemAyOrt < 2) {
    parca.push(`yılda ${p.ytdIslemSayisi} iş`);
  }
  if (p.deltaNetBakiye !== null && p.deltaNetBakiye > 0) {
    parca.push(`borç büyüyor ▲ ${kisaTutar(p.deltaNetBakiye)}`);
  }
  if (p.eslesmemis) parca.push("gümrük eşleşmesi yok");
  return parca.length ? parca.join(" · ") : "sorun görünmüyor";
}

export const SEGMENT_LABEL: Record<TahsilatSegment, string> = {
  SAGLIKLI: "Sağlıklı",
  BUYUK_RISK: "Büyük Risk",
  KUCUK_NOTR: "Küçük / Nötr",
  NAKIT_TUZAGI: "Nakit Tuzağı",
};

export const SEGMENT_PILL: Record<TahsilatSegment, string> = {
  SAGLIKLI: "bg-emerald-50 text-emerald-700",
  BUYUK_RISK: "bg-amber-50 text-amber-700",
  KUCUK_NOTR: "bg-slate-100 text-slate-600",
  NAKIT_TUZAGI: "bg-rose-50 text-rose-700",
};
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add shared/tahsilatHesaplari.ts
git commit -m "feat(tahsilat): odemeOrani + firmaSegmenti + nedenCumlesi saf fonksiyonlari"
```

---

### Task 3: Storage — gümrük aggregate'ine YTD ciro + işlem adedi

**Files:**
- Modify: `server/storage.ts:44` (IStorage imzası)
- Modify: `server/storage.ts:405-438` (getGumrukFirmaFaturaAggregate impl)

**Interfaces:**
- Consumes: mevcut sorgu deseni (`to_date` + regex filtre) — değiştirme, kolon ekle.
- Produces: `Map<string, { son90: number; yillik: number; ytdCiro: number; ytdIslemSayisi: number }>`. `son90`/`yillik` anlamı **aynen korunur** (top_fatura_tutar, KDV dahil, kayan pencere — VIP rozeti bunlara kalibre). `ytdCiro` = KDV hariç `mal_bedeli`, yıl başı → refTarih; `ytdIslemSayisi` = aynı penceredeki satır sayısı.

- [ ] **Step 1: IStorage imzasını güncelle (satır 44)**

```ts
  getGumrukFirmaFaturaAggregate(refDateStr: string, faturaPenceresiDays: number): Promise<Map<string, { son90: number; yillik: number; ytdCiro: number; ytdIslemSayisi: number }>>;
```

- [ ] **Step 2: Implementasyonu genişlet**

405-438 aralığındaki metodun tamamı şöyle olur (son90/yillik CASE'leri birebir aynı, iki yeni kolon eklendi):

```ts
  async getGumrukFirmaFaturaAggregate(
    refDateStr: string,
    faturaPenceresiDays: number,
  ): Promise<Map<string, { son90: number; yillik: number; ytdCiro: number; ytdIslemSayisi: number }>> {
    const result: any = await db.execute(sql`
      SELECT
        firma_unvan AS firma,
        COALESCE(SUM(CASE
          WHEN to_date(fatura_tarihi, 'DD.MM.YYYY')
               BETWEEN (${refDateStr}::date - (${faturaPenceresiDays} || ' days')::interval)
                   AND ${refDateStr}::date
          THEN COALESCE(top_fatura_tutar, 0)
          ELSE 0 END), 0) AS son90,
        COALESCE(SUM(CASE
          WHEN to_date(fatura_tarihi, 'DD.MM.YYYY')
               BETWEEN (${refDateStr}::date - INTERVAL '365 days')
                   AND ${refDateStr}::date
          THEN COALESCE(top_fatura_tutar, 0)
          ELSE 0 END), 0) AS yillik,
        COALESCE(SUM(CASE
          WHEN to_date(fatura_tarihi, 'DD.MM.YYYY')
               BETWEEN date_trunc('year', ${refDateStr}::date)::date
                   AND ${refDateStr}::date
          THEN COALESCE(mal_bedeli, 0)
          ELSE 0 END), 0) AS ytd_ciro,
        COALESCE(SUM(CASE
          WHEN to_date(fatura_tarihi, 'DD.MM.YYYY')
               BETWEEN date_trunc('year', ${refDateStr}::date)::date
                   AND ${refDateStr}::date
          THEN 1 ELSE 0 END), 0) AS ytd_islem
      FROM gumruk_verileri
      WHERE firma_unvan IS NOT NULL
        AND fatura_tarihi ~ '^[0-9]{2}\\.[0-9]{2}\\.[0-9]{4}$'
      GROUP BY firma_unvan
    `);
    const map = new Map<string, { son90: number; yillik: number; ytdCiro: number; ytdIslemSayisi: number }>();
    const rows = (result.rows ?? result) as Array<{ firma: string; son90: any; yillik: any; ytd_ciro: any; ytd_islem: any }>;
    for (const r of rows) {
      map.set(r.firma, {
        son90: Number(r.son90 ?? 0),
        yillik: Number(r.yillik ?? 0),
        ytdCiro: Number(r.ytd_ciro ?? 0),
        ytdIslemSayisi: Number(r.ytd_islem ?? 0),
      });
    }
    return map;
  }
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata (dashboard route sadece `f.son90`/`f.yillik` okuyor — additive değişiklik kırmaz).

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(tahsilat): gumruk aggregate'ine ytd ciro (KDV haric) + islem adedi"
```

---

### Task 4: Dashboard endpoint — segment, delta, yeni özet alanları

**Files:**
- Modify: `server/routes.ts:135` civarı (import listesi)
- Modify: `server/routes.ts:1947-2052` (`/api/tahsilat/dashboard`)

**Interfaces:**
- Consumes: Task 2 fonksiyonları (`odemeOrani`, `firmaSegmenti`, `nedenCumlesi`), Task 3 map alanları (`ytdCiro`, `ytdIslemSayisi`), Task 1 ayarları (`ayarlar.ciroEsik`, `ayarlar.odemeOraniEsik`), mevcut `storage.getMizanYuklemeleri()` (mizanTarihi desc sıralı) ve `storage.getEnSonBakiyelerByMizan(id)`.
- Produces — müşteri objesine **eklenen** alanlar (mevcutlar aynen kalır):
  `odemeOrani: number | null`, `ytdCiro: number`, `ytdIslemSayisi: number | null`, `islemAyOrt: number | null`, `eslesmemis: boolean`, `kazandiriyor: boolean`, `segment: TahsilatSegment`, `neden: string`, `deltaNetBakiye: number | null`, `donemOdeme: number | null`, `donemFatura: number | null`.
  `ozet`'e eklenen alanlar: `nakitTuzagiSayisi`, `nakitTuzagiToplam`, `buyukRiskSayisi`, `buyukRiskToplam`, `oncekiMizanTarihi: string | null`, `toplamNetAlacakDelta: number | null`, `segmentDagilim: { segment: TahsilatSegment; sayi: number; toplam: number }[]`.

- [ ] **Step 1: Import'ları genişlet**

`from "@shared/tahsilatHesaplari"` import listesine ekle: `odemeOrani, firmaSegmenti, nedenCumlesi`.

- [ ] **Step 2: Önceki mizanı çek (faturaMap satırından sonra, detaylar map'inden önce)**

```ts
      // Önceki mizan (yalnız AYNI YIL — mizan yıl başında sıfırlanır, DEVİR=0)
      const tumMizanlar = await storage.getMizanYuklemeleri(); // mizanTarihi desc
      const oncekiMizan = tumMizanlar.find((x) =>
        x.mizanTarihi < mizan.mizanTarihi &&
        x.mizanTarihi.slice(0, 4) === mizan.mizanTarihi.slice(0, 4)
      ) ?? null;
      const oncekiBakiyeMap = new Map<string, (typeof bakiyeler)[number]>();
      if (oncekiMizan) {
        for (const ob of await storage.getEnSonBakiyelerByMizan(oncekiMizan.id)) {
          oncekiBakiyeMap.set(ob.musteriId, ob);
        }
      }
      const mizanAyNo = Math.max(1, parseInt(refTarih.slice(5, 7), 10) || 1);
      const segmentEsikleri = {
        odemeOraniEsik: ayarlar.odemeOraniEsik,
        eskiOdemeEsik: ayarlar.eskiOdemeEsik,
      };
```

- [ ] **Step 3: detaylar map'inde yeni sinyalleri hesapla**

Mevcut `const risk = riskProfili({...});` satırından sonra, `return {` bloğundan önce ekle (mevcut `son90`/`yillik` döngüsüne ytd toplamayı da ekle — döngü tek kalsın):

Önce mevcut döngüyü şu hale getir:

```ts
        // Müşterinin tüm gümrük unvanlarının toplamı
        let son90 = 0, yillik = 0, ytdCiro = 0, ytdIslemSayisi = 0;
        for (const u of (m.gumrukFirmaUnvanlari || [])) {
          const f = faturaMap.get(u);
          if (f) { son90 += f.son90; yillik += f.yillik; ytdCiro += f.ytdCiro; ytdIslemSayisi += f.ytdIslemSayisi; }
        }
```

`const risk = riskProfili({...});` sonrasına ekle:

```ts
        // Aksiyon Merkezi sinyalleri
        const borcNum = Number(b.borc || 0);
        const alacakNum = Number(b.alacak || 0);
        const oran = odemeOrani(borcNum, alacakNum);
        const eslesmemis = (m.gumrukFirmaUnvanlari || []).length === 0;
        const islemAyOrt = eslesmemis ? null : ytdIslemSayisi / mizanAyNo;
        // Eşleşmemiş firmada hacim göstergesi mizan BORÇ toplamıdır (spec §3)
        const kazandiriyor = (eslesmemis ? borcNum : ytdCiro) >= Number(ayarlar.ciroEsik);
        const onceki = oncekiBakiyeMap.get(b.musteriId);
        const deltaNetBakiye = onceki
          ? nb - netBakiye({ sonBakiye: Number(onceki.sonBakiye || 0), sonBakiyeBA: onceki.sonBakiyeBA || "B" })
          : null;
        const donemOdeme = onceki ? alacakNum - Number(onceki.alacak || 0) : null;
        const donemFatura = onceki ? borcNum - Number(onceki.borc || 0) : null;
        const segment = firmaSegmenti({ netBakiye: nb, odemeOrani: oran, gecikme: gec, kazandiriyor, esikler: segmentEsikleri });
        const hicOdemeYok = borcNum > 0 && alacakNum === 0;
        const neden = nedenCumlesi({
          gecikme: gec,
          odemeOrani: oran,
          hicOdemeYok,
          ytdIslemSayisi: eslesmemis ? null : ytdIslemSayisi,
          islemAyOrt,
          deltaNetBakiye,
          eslesmemis,
          esikler: segmentEsikleri,
        });
```

`return {` objesine (mevcut alanların sonuna, `...risk`'ten önce) ekle:

```ts
          odemeOrani: oran,
          ytdCiro,
          ytdIslemSayisi: eslesmemis ? null : ytdIslemSayisi,
          islemAyOrt,
          eslesmemis,
          kazandiriyor,
          segment,
          neden,
          deltaNetBakiye,
          donemOdeme,
          donemFatura,
```

- [ ] **Step 4: Özeti genişlet**

`const ozet = {` bloğundan **önce** ekle:

```ts
      const oncekiToplamNetAlacak = oncekiMizan
        ? Array.from(oncekiBakiyeMap.values())
            .map((ob) => netBakiye({ sonBakiye: Number(ob.sonBakiye || 0), sonBakiyeBA: ob.sonBakiyeBA || "B" }))
            .filter((v) => v > 0)
            .reduce((a, v) => a + v, 0)
        : null;
      const toplamNetAlacakSimdi = detaylar.filter((d) => d.netBakiye > 0).reduce((a, d) => a + d.netBakiye, 0);
      const SEGMENTLER = ["SAGLIKLI", "BUYUK_RISK", "KUCUK_NOTR", "NAKIT_TUZAGI"] as const;
```

`ozet` objesinde `toplamNetAlacak` satırını `toplamNetAlacak: toplamNetAlacakSimdi,` yap ve objeye şu alanları ekle (sektorDagilim'den önce):

```ts
        nakitTuzagiSayisi: detaylar.filter((d) => d.segment === "NAKIT_TUZAGI").length,
        nakitTuzagiToplam: detaylar.filter((d) => d.segment === "NAKIT_TUZAGI").reduce((a, d) => a + d.netBakiye, 0),
        buyukRiskSayisi: detaylar.filter((d) => d.segment === "BUYUK_RISK").length,
        buyukRiskToplam: detaylar.filter((d) => d.segment === "BUYUK_RISK").reduce((a, d) => a + d.netBakiye, 0),
        oncekiMizanTarihi: oncekiMizan?.mizanTarihi ?? null,
        toplamNetAlacakDelta: oncekiToplamNetAlacak === null ? null : toplamNetAlacakSimdi - oncekiToplamNetAlacak,
        segmentDagilim: SEGMENTLER.map((s) => ({
          segment: s,
          sayi: detaylar.filter((d) => d.segment === s).length,
          toplam: detaylar.filter((d) => d.segment === s).reduce((a, d) => a + Math.max(0, d.netBakiye), 0),
        })),
```

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 6: Commit**

```bash
git add server/routes.ts
git commit -m "feat(tahsilat): dashboard'a segment, odeme orani, onceki mizan deltalari"
```

---

### Task 5: TahsilatOzet.tsx — Aksiyon Merkezi yeniden yazımı

**Files:**
- Rewrite: `client/src/components/tahsilat/TahsilatOzet.tsx` (dosyanın tamamı aşağıdaki içerikle değişir)

**Interfaces:**
- Consumes: Task 4 dashboard alanları; `@shared/tahsilatHesaplari`'dan `SEGMENT_LABEL`, `SEGMENT_PILL`, `kisaTutar`, `TahsilatSegment`; mevcut `MusteriDrillDown` (`musteriId: string | null`, `onClose: () => void`).
- Produces: dış arayüz aynı — `export function TahsilatOzet({ mizanId }: { mizanId?: string })` (Tahsilat.tsx değişmez).

- [ ] **Step 1: Dosyayı aşağıdaki içerikle tamamen değiştir**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PhoneCall, Wallet, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEGMENT_LABEL, SEGMENT_PILL, kisaTutar, type TahsilatSegment } from "@shared/tahsilatHesaplari";
import { MusteriDrillDown } from "./MusteriDrillDown";

type SegmentFiltre = TahsilatSegment | "AKSIYON";

const MATRIS: { segment: TahsilatSegment; emoji: string; alt: string; aktifKutu: string }[] = [
  { segment: "SAGLIKLI", emoji: "🟢", alt: "Kazandırıyor + ödüyor — dokunma", aktifKutu: "ring-emerald-400" },
  { segment: "BUYUK_RISK", emoji: "🟠", alt: "Kazandırıyor ama ödemiyor — diplomatik takip", aktifKutu: "ring-amber-400" },
  { segment: "KUCUK_NOTR", emoji: "⚪", alt: "Kazandırmıyor ama ödüyor", aktifKutu: "ring-slate-400" },
  { segment: "NAKIT_TUZAGI", emoji: "🔴", alt: "Kazandırmıyor + ödemiyor — hedef liste", aktifKutu: "ring-rose-400" },
];

export function TahsilatOzet({ mizanId }: { mizanId?: string }) {
  const [filtre, setFiltre] = useState<SegmentFiltre>("AKSIYON");
  const [drillId, setDrillId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/tahsilat/dashboard", mizanId],
    queryFn: async () => {
      const r = await fetch(`/api/tahsilat/dashboard${mizanId ? `?mizanId=${mizanId}` : ""}`);
      return r.json();
    },
  });

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>;
  if (!data?.mizan) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş.</div>;

  const o = data.ozet;
  const musteriler = data.musteriler as any[];
  const segmentOzet = new Map<string, { sayi: number; toplam: number }>(
    (o.segmentDagilim as any[]).map((s) => [s.segment, { sayi: s.sayi, toplam: s.toplam }])
  );

  const delta = o.toplamNetAlacakDelta as number | null;
  const kpis = [
    { label: "Dışarıdaki Nakit", value: fmtTry(o.toplamNetAlacak), sub: `${musteriler.length} müşteri`, color: "#0ea5e9", Icon: Wallet },
    { label: "Nakit Tuzağında", value: fmtTry(o.nakitTuzagiToplam), sub: `${o.nakitTuzagiSayisi} firma — hedef liste`, color: "#e11d48", Icon: PhoneCall },
    { label: "Büyük Riskte", value: fmtTry(o.buyukRiskToplam), sub: `${o.buyukRiskSayisi} firma — diplomatik takip`, color: "#f59e0b", Icon: AlertTriangle },
    {
      label: "Önceki Mizana Göre",
      value: delta === null ? "—" : `${delta > 0 ? "▲" : delta < 0 ? "▼" : ""} ${fmtTry(Math.abs(delta))}`,
      sub: o.oncekiMizanTarihi ? `ref: ${o.oncekiMizanTarihi}` : "önceki mizan yok",
      color: delta === null ? "#64748b" : delta > 0 ? "#e11d48" : "#10b981",
      Icon: delta !== null && delta > 0 ? ArrowUpRight : ArrowDownRight,
    },
  ];

  const liste = musteriler
    .filter((m) => (filtre === "AKSIYON" ? m.segment === "NAKIT_TUZAGI" || m.segment === "BUYUK_RISK" : m.segment === filtre))
    .sort((a, b) => b.netBakiye - a.netBakiye);

  return (
    <div className="space-y-[18px]">
      {/* 4 nakit KPI — accent-bar */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
            <div className="pl-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">{k.label}</div>
            <div className="mt-2 pl-2 text-[20px] font-extrabold tracking-tight tabular-nums" style={{ color: k.color }}>{k.value}</div>
            <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Segment matrisi — kutuya tıkla → alt liste filtrelenir */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {MATRIS.map((s) => {
          const seg = segmentOzet.get(s.segment) || { sayi: 0, toplam: 0 };
          const aktif = filtre === s.segment;
          return (
            <button
              key={s.segment}
              onClick={() => setFiltre(aktif ? "AKSIYON" : s.segment)}
              className={cn(
                "rounded-[14px] border bg-card p-4 text-left transition-shadow hover:shadow-md",
                aktif && `ring-2 ${s.aktifKutu}`
              )}
            >
              <div className="text-[13px] font-bold">{s.emoji} {SEGMENT_LABEL[s.segment]}</div>
              <div className="mt-1.5 text-[18px] font-extrabold tabular-nums">{fmtTry(seg.toplam)}</div>
              <div className="text-[11.5px] tabular-nums text-muted-foreground">{seg.sayi} firma</div>
              <div className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">{s.alt}</div>
            </button>
          );
        })}
      </div>

      {/* Aranacaklar listesi */}
      <div className="rounded-[14px] border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-rose-500" />
            <h3 className="text-[15px] font-bold">
              {filtre === "AKSIYON" ? "Aranacaklar — Nakit Tuzağı + Büyük Risk" : `${SEGMENT_LABEL[filtre]} Firmalar`}
            </h3>
          </div>
          <span className="text-[12.5px] tabular-nums text-muted-foreground">{liste.length} firma</span>
        </div>
        {liste.length === 0 ? (
          <div className="text-center text-muted-foreground py-10">Bu segmentte firma yok 🎉</div>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 text-left">Firma</th>
                  <th className="px-3 py-2.5 text-right">Borç</th>
                  <th className="px-3 py-2.5 text-right">Ödeme %</th>
                  <th className="px-3 py-2.5 text-right">Son Ödeme</th>
                  <th className="px-3 py-2.5 text-right">Yılda İş</th>
                  <th className="px-3 py-2.5 text-right">Değişim</th>
                  <th className="px-5 py-2.5 text-left">Neden</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {liste.map((m) => (
                  <tr key={m.musteriId} className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setDrillId(m.musteriId)}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold truncate max-w-[260px]">{m.ad}</span>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", SEGMENT_PILL[m.segment as TahsilatSegment])}>
                          {SEGMENT_LABEL[m.segment as TahsilatSegment]}
                        </span>
                        {m.eslesmemis && <span title="Gümrük eşleşmesi yok" className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">eşleşmemiş</span>}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">{m.hesapKodu}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-orange-700 whitespace-nowrap">{fmtTry(m.netBakiye)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{m.odemeOrani === null ? "—" : `%${Math.round(m.odemeOrani * 100)}`}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{m.gecikme >= 9999 ? "hiç" : `${m.gecikme}g önce`}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{m.ytdIslemSayisi === null ? "—" : m.ytdIslemSayisi}</td>
                    <td className={cn("px-3 py-3 text-right tabular-nums whitespace-nowrap", m.deltaNetBakiye > 0 ? "text-rose-600 font-semibold" : m.deltaNetBakiye < 0 ? "text-emerald-600" : "")}>
                      {m.deltaNetBakiye === null ? "—" : `${m.deltaNetBakiye > 0 ? "▲" : m.deltaNetBakiye < 0 ? "▼" : ""} ${kisaTutar(Math.abs(m.deltaNetBakiye))}`}
                    </td>
                    <td className="px-5 py-3 text-[12px] leading-snug text-muted-foreground">{m.neden}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MusteriDrillDown musteriId={drillId} onClose={() => setDrillId(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata. (Kaldırılan recharts Pie importları artık kullanılmıyor — dosya tamamen değiştiği için sorun yok.)

- [ ] **Step 3: Commit**

```bash
git add client/src/components/tahsilat/TahsilatOzet.tsx
git commit -m "feat(tahsilat): Ozet sekmesi Aksiyon Merkezi'ne donusturuldu"
```

---

### Task 6: MusteriListesi — ödeme %, işlem/ay, segment, değişim kolonları

**Files:**
- Modify: `client/src/components/tahsilat/MusteriListesi.tsx`

**Interfaces:**
- Consumes: Task 4 müşteri alanları (`odemeOrani`, `islemAyOrt`, `segment`, `deltaNetBakiye`), `@shared/tahsilatHesaplari`'dan `SEGMENT_LABEL`, `SEGMENT_PILL`, `kisaTutar`, `TahsilatSegment`.
- Produces: dış arayüz değişmez.

- [ ] **Step 1: Import ekle (satır 10 civarı, MusteriDrillDown import'undan sonra)**

```ts
import { SEGMENT_LABEL, SEGMENT_PILL, kisaTutar, type TahsilatSegment } from "@shared/tahsilatHesaplari";
```

- [ ] **Step 2: CSV export'u genişlet**

`exportCsv` içindeki `rows` ve başlık satırı şöyle olur:

```ts
    const rows = filtered.map((m) => [
      m.hesapKodu, m.ad, m.sektor || "", m.netBakiye.toFixed(2), m.gecikme, m.isAktivitesiAcigi,
      m.bakiyeFaturaAcikYuzde.toFixed(1), PATTERN_LABEL[m.pattern],
      m.odemeOrani === null ? "" : (m.odemeOrani * 100).toFixed(0),
      m.islemAyOrt === null ? "" : m.islemAyOrt.toFixed(1),
      SEGMENT_LABEL[m.segment as TahsilatSegment] || "",
      m.deltaNetBakiye === null ? "" : m.deltaNetBakiye.toFixed(2),
    ]);
    const csv = "﻿" + [["Hesap Kodu", "Ad", "Sektör", "Net Bakiye", "Gecikme", "İş Akt. Açığı", "Bakiye-Fatura %", "Risk", "Ödeme %", "İşlem/Ay", "Segment", "Değişim"], ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
```

- [ ] **Step 3: Tablo başlıklarına 4 kolon ekle**

`Bakiye-Fatura %` TableHead'inden sonra, `Risk` TableHead'inden önce:

```tsx
                <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500 cursor-pointer" onClick={() => handleSort("odemeOrani")}>Ödeme % <SortIcon f="odemeOrani" /></TableHead>
                <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500 cursor-pointer" onClick={() => handleSort("islemAyOrt")}>İşlem/Ay <SortIcon f="islemAyOrt" /></TableHead>
                <TableHead className="text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500 cursor-pointer" onClick={() => handleSort("deltaNetBakiye")}>Değişim <SortIcon f="deltaNetBakiye" /></TableHead>
                <TableHead className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Segment</TableHead>
```

- [ ] **Step 4: Boş-satır colSpan'ını 9 → 13 yap**

```tsx
                <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">Filtreye uyan müşteri yok</TableCell></TableRow>
```

- [ ] **Step 5: Satır hücrelerini ekle**

`Bakiye-Fatura %` TableCell'inden sonra, `Risk` TableCell'inden önce:

```tsx
                  <TableCell className="text-right tabular-nums">{m.odemeOrani === null ? "—" : `%${Math.round(m.odemeOrani * 100)}`}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.islemAyOrt === null ? "—" : m.islemAyOrt.toFixed(1)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums whitespace-nowrap", m.deltaNetBakiye > 0 ? "text-rose-600 font-semibold" : m.deltaNetBakiye < 0 ? "text-emerald-600" : "")}>
                    {m.deltaNetBakiye === null ? "—" : `${m.deltaNetBakiye > 0 ? "▲" : m.deltaNetBakiye < 0 ? "▼" : ""} ${kisaTutar(Math.abs(m.deltaNetBakiye))}`}
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap", SEGMENT_PILL[m.segment as TahsilatSegment])}>{SEGMENT_LABEL[m.segment as TahsilatSegment]}</span>
                  </TableCell>
```

- [ ] **Step 6: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata. (Sıralama `a[sortField] ?? 0` deseniyle null'ları 0 sayar — kabul edilen davranış.)

- [ ] **Step 7: Commit**

```bash
git add client/src/components/tahsilat/MusteriListesi.tsx
git commit -m "feat(tahsilat): musteri listesine odeme orani, islem sikligi, segment, degisim kolonlari"
```

---

### Task 7: RiskEsikleriModal — 2 yeni eşik alanı

**Files:**
- Modify: `client/src/components/tahsilat/RiskEsikleriModal.tsx`

**Interfaces:**
- Consumes: Task 1 ayar alanları (`ciroEsik` string-decimal, `odemeOraniEsik` int). PUT `/api/tahsilat/ayarlar` body'yi `updateTahsilatAyarlari`'ya geçirir — ek alan sunucu değişikliği gerektirmez.

- [ ] **Step 1: Form init'ine alanları ekle (useEffect içi)**

```ts
      eksiPozisyonYuzde: ayarlar.eksiPozisyonYuzde,
      faturaPenceresi: ayarlar.faturaPenceresi,
      ciroEsik: ayarlar.ciroEsik,
      odemeOraniEsik: ayarlar.odemeOraniEsik,
```

- [ ] **Step 2: İki input ekle (Fatura Penceresi div'inden sonra)**

```tsx
          <div><Label>Ciro Eşiği — "kazandırıyor" sınırı (yıllık, TL)</Label><Input type="number" value={form.ciroEsik || ""} onChange={(e) => setForm({ ...form, ciroEsik: e.target.value })} /></div>
          <div><Label>Ödeme Oranı Eşiği — "ödüyor" sınırı (%)</Label><Input type="number" value={form.odemeOraniEsik || ""} onChange={(e) => setForm({ ...form, odemeOraniEsik: parseInt(e.target.value) })} /></div>
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/tahsilat/RiskEsikleriModal.tsx
git commit -m "feat(tahsilat): ciro ve odeme orani esikleri ayarlar penceresinde"
```

---

### Task 8: Uçtan uca manuel doğrulama

**Files:**
- Kod değişikliği yok — doğrulama görevi. Repo kökündeki iki gerçek mizan dosyası kullanılır: `mizan 08022026.xlsx` (08.02.2026) ve `MİZAN 02072026.xlsx` (02.07.2026).

- [ ] **Step 1: Dev server'ı başlat**

Run: `npm run dev` (arka planda; `DATABASE_URL` .env'de mevcut)
Expected: 5000 portunda ayakta.

- [ ] **Step 2: İki mizanı da yükle**

Tarayıcıda `/tahsilat` → "Mizan Yükle" ile önce `mizan 08022026.xlsx`, sonra `MİZAN 02072026.xlsx`. (Daha önce yüklüyse Arşiv'den kontrol et, mükerrer yükleme MD5 ile reddedilir — sorun değil.)

- [ ] **Step 3: Doğrulama kontrol listesi**

02.07.2026 mizanı seçiliyken:

1. **Ödeme oranı örneği:** SUMİRİKO → Ödeme % ≈ %85 (borç 14.601.744, alacak 12.388.923).
2. **Delta dolu:** Şubat→Temmuz aynı yıl → Değişim kolonu sayı gösteriyor (— değil). Şubat mizanı seçilince (önceki yok) Değişim "—".
3. **Hiç ödemeyenler:** Temmuz mizanında ALACAK=0 ve BORÇ>0 olan bir firma seç (Müşteriler sekmesinde Ödeme % kolonunu artan sırala, %0 olanlara bak) → nedeninde "hiç ödeme yapmamış" yazmalı ve bakiyesi pozitifse Nakit Tuzağı/Büyük Risk segmentinde olmalı.
4. **Matris tıklama:** 4 kutu tıklanınca alt liste o segmente filtreleniyor; tekrar tıklayınca "Aranacaklar" varsayılanına dönüyor.
5. **KPI tutarlılığı:** "Nakit Tuzağında" tutarı = matristeki 🔴 kutu tutarı.
6. **Eşik tepkisi:** Risk Eşikleri'nden Ciro Eşiği'ni 10.000.000 yap → kaydet → çoğu firma "kazandırmıyor" tarafına kayar (Nakit Tuzağı büyür). Geri 500.000 yap.
7. **Regresyon:** Müşteriler sekmesi eski kolonlarıyla + 4 yeni kolonla çalışıyor; CSV indiriliyor; Trend/Eşleştirme/Arşiv açılıyor; MusteriDrillDown satır tıklamasıyla açılıyor.
8. **Eşleşmemiş rozeti:** Eşleştirme sekmesinde eşleşmesi olmayan bir firma Özet listesinde "eşleşmemiş" rozetiyle görünüyor.

- [ ] **Step 4: Son tip kontrolü**

Run: `npm run check`
Expected: 0 hata.

- [ ] **Step 5: Sorun bulunursa düzelt + commit; temizse bitir**

Bulgular ayrı küçük commit'lerle düzeltilir (`fix(tahsilat): ...`). Push YAPILMAZ — deploy kararı kullanıcıya bırakılır.
