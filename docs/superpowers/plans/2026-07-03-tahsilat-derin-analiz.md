# Tahsilat Derin Analiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Haftalık mizan serisinin üstüne üç analiz katmanı: Haftalık Değişim Raporu (yeni sekme), Ödeme Ritmi bozulma alarmları (Trend sekmesi) ve Dönmeyen Nakit Yaşlandırması (Özet'e stacked bar).

**Architecture:** Rapor ve yaşlandırma mevcut dashboard endpoint'inde zaten hesaplanan delta/gecikme verisinden türetilir (additive alanlar). Ritim için yılın tüm mizan bakiye satırları tek join sorgusuyla çekilir; ödeme tarihleri `sonAlacakTarihi` serisindeki farklı değerlerden çıkar; saf ritim fonksiyonu `shared`'a konur.

**Tech Stack:** Express + Drizzle, React 18 + TanStack Query + recharts, `@shared/*` alias.

**Spec:** `docs/superpowers/specs/2026-07-03-tahsilat-derin-analiz-design.md`

## Global Constraints

- UI metinleri/alan adları Türkçe; test runner yok — tek kapı `npm run check`; Türkçe dosyalara PowerShell Set-Content YASAK (Edit/Write kullan).
- Tarih işlemleri string tabanlı (`new Date()` üzerinden route etme); görüntüleme `tarihGoster` (gg/aa/yy).
- Dashboard API değişiklikleri **additive** — mevcut alan adı/anlamı değişmez.
- Döviz kuralı: hesap kodu `120-02-*` = USD; **USD tutarlar TL toplamlarına karışmaz**, ayrı alan/`$` formatı.
- Her task sonunda commit; `git push` YOK (push = deploy, kullanıcı kararı).
- Ritim eşikleri: alarm = `sonOdemeGun > 2 × ortalamaAralik && sonOdemeGun > 14`; ritim için ≥3 farklı ödeme tarihi.
- Yaş kovaları: 0-30 / 31-60 / 61-90 / 90+ gün (gecikme 9999 → 90+).

---

### Task 1: Haftalık Değişim Raporu — backend (`rapor` alanı)

**Files:**
- Modify: `server/routes.ts` (dashboard handler; `ozet` tanımından sonra, `res.json`'dan önce)

**Interfaces:**
- Consumes: mevcut `detaylar` (alanları: `musteriId, ad, doviz, netBakiye, gecikme, donemOdeme, donemFatura, deltaNetBakiye, segment, kazandiriyor`), `oncekiMizan`, `oncekiBakiyeMap`, `segmentEsikleri`, `ozet.toplamNetAlacakDelta`, shared `netBakiye/odemeOrani/gecikme/firmaSegmenti`.
- Produces: yanıtta `rapor: null | { oncekiMizanTarihi, gunSayisi, toplamTahsilatTL, toplamTahsilatUsd, toplamYeniFaturaTL, toplamYeniFaturaUsd, netDegisimTL, enCokOdeyen[], borcuBuyuyen[], hicOdemeyen: {sayi, toplamTL, ilk10[]}, bozulanlar[], duzelenler[] }`. Liste elemanları `{musteriId, ad, doviz, netBakiye, tutar?}`; geçişler `{musteriId, ad, doviz, netBakiye, eski, yeni, yon}`.

- [ ] **Step 1: `ozet` tanımından sonra rapor hesabını ekle**

`const ozet = { ... };` bloğunun kapanışından hemen sonra:

```ts
      // Haftalık Değişim Raporu — önceki aynı-yıl mizana göre dönem özeti
      let rapor: any = null;
      if (oncekiMizan) {
        const kotuluk: Record<string, number> = { SAGLIKLI: 0, KUCUK_NOTR: 1, BUYUK_RISK: 2, NAKIT_TUZAGI: 3 };
        const gecisler = detaylar
          .map((d) => {
            const onceki = oncekiBakiyeMap.get(d.musteriId);
            if (!onceki) return null;
            const oncekiNet = netBakiye({ sonBakiye: Number(onceki.sonBakiye || 0), sonBakiyeBA: onceki.sonBakiyeBA || "B" });
            const oncekiOran = odemeOrani(Number(onceki.borc || 0), Number(onceki.alacak || 0));
            const oncekiGec = gecikme(onceki.sonAlacakTarihi, oncekiMizan.mizanTarihi);
            // Değer ekseni haftalık pencerede sabit kabul edilir (şimdiki kazandiriyor)
            const eski = firmaSegmenti({ netBakiye: oncekiNet, odemeOrani: oncekiOran, gecikme: oncekiGec, kazandiriyor: d.kazandiriyor, esikler: segmentEsikleri });
            if (eski === d.segment) return null;
            return {
              musteriId: d.musteriId, ad: d.ad, doviz: d.doviz, netBakiye: d.netBakiye,
              eski, yeni: d.segment,
              yon: kotuluk[d.segment] > kotuluk[eski] ? "bozuldu" : "duzeldi",
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        const donemli = detaylar.filter((d) => d.donemOdeme !== null);
        const topla = (dv: "TL" | "USD", alan: "donemOdeme" | "donemFatura") =>
          donemli.filter((d) => d.doviz === dv).reduce((a, d) => a + Math.max(0, (d as any)[alan] || 0), 0);
        const hicOdemeyenList = donemli
          .filter((d) => d.netBakiye > 0 && (d.donemOdeme || 0) <= 0)
          .sort((a, b) => b.netBakiye - a.netBakiye);
        const kisi = (d: any) => ({ musteriId: d.musteriId, ad: d.ad, doviz: d.doviz, netBakiye: d.netBakiye });
        rapor = {
          oncekiMizanTarihi: oncekiMizan.mizanTarihi,
          gunSayisi: gecikme(oncekiMizan.mizanTarihi, refTarih),
          toplamTahsilatTL: topla("TL", "donemOdeme"),
          toplamTahsilatUsd: topla("USD", "donemOdeme"),
          toplamYeniFaturaTL: topla("TL", "donemFatura"),
          toplamYeniFaturaUsd: topla("USD", "donemFatura"),
          netDegisimTL: ozet.toplamNetAlacakDelta,
          enCokOdeyen: donemli.filter((d) => (d.donemOdeme || 0) > 0)
            .sort((a, b) => (b.donemOdeme || 0) - (a.donemOdeme || 0)).slice(0, 5)
            .map((d) => ({ ...kisi(d), tutar: d.donemOdeme })),
          borcuBuyuyen: donemli.filter((d) => (d.deltaNetBakiye || 0) > 0)
            .sort((a, b) => (b.deltaNetBakiye || 0) - (a.deltaNetBakiye || 0)).slice(0, 5)
            .map((d) => ({ ...kisi(d), tutar: d.deltaNetBakiye })),
          hicOdemeyen: {
            sayi: hicOdemeyenList.length,
            toplamTL: hicOdemeyenList.filter((d) => d.doviz === "TL").reduce((a, d) => a + d.netBakiye, 0),
            ilk10: hicOdemeyenList.slice(0, 10).map((d) => ({ ...kisi(d), gecikme: d.gecikme })),
          },
          bozulanlar: gecisler.filter((g) => g.yon === "bozuldu"),
          duzelenler: gecisler.filter((g) => g.yon === "duzeldi"),
        };
      }
```

- [ ] **Step 2: Yanıta ekle**

`res.json({ mizan, ozet, musteriler: detaylar });` → `res.json({ mizan, ozet, rapor, musteriler: detaylar });`

- [ ] **Step 3: Doğrula + commit**

Run: `npm run check` → 0 hata.

```bash
git add server/routes.ts
git commit -m "feat(tahsilat): dashboard'a haftalik degisim raporu (rapor alani)"
```

---

### Task 2: Haftalık Değişim Raporu — UI (Rapor sekmesi)

**Files:**
- Create: `client/src/components/tahsilat/HaftalikRapor.tsx`
- Modify: `client/src/pages/Tahsilat.tsx` (TABS + TabsContent + import)

**Interfaces:**
- Consumes: Task 1 `rapor` şekli; `@shared/tahsilatHesaplari`'dan `SEGMENT_LABEL, SEGMENT_PILL, kisaTutar, tarihGoster, TahsilatSegment`; mevcut `MusteriDrillDown`.
- Produces: `export function HaftalikRapor({ mizanId }: { mizanId?: string })`.

- [ ] **Step 1: Bileşeni oluştur**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, TrendingDown, Ban, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEGMENT_LABEL, SEGMENT_PILL, kisaTutar, tarihGoster, type TahsilatSegment } from "@shared/tahsilatHesaplari";
import { MusteriDrillDown } from "./MusteriDrillDown";

export function HaftalikRapor({ mizanId }: { mizanId?: string }) {
  const [drillId, setDrillId] = useState<string | null>(null);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/tahsilat/dashboard", mizanId],
    queryFn: async () => {
      const r = await fetch(`/api/tahsilat/dashboard${mizanId ? `?mizanId=${mizanId}` : ""}`);
      return r.json();
    },
  });

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);
  const fmtUsd = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmtPara = (v: number, doviz: string) => (doviz === "USD" ? fmtUsd(v) : fmtTry(v));

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>;
  if (!data?.mizan) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş.</div>;
  const r = data.rapor;
  if (!r) return <div className="text-center text-muted-foreground py-12">Rapor için aynı yıl içinde en az 2 mizan gerekli. Haftalık mizanları yükledikçe bu sekme dönem karşılaştırması gösterir.</div>;

  const usdEk = (v: number) => (v > 0 ? ` +${fmtUsd(v)}` : "");
  const tahsilatOrani = r.toplamYeniFaturaTL > 0 ? (r.toplamTahsilatTL / r.toplamYeniFaturaTL) * 100 : null;
  const kpis = [
    { label: "Dönem Tahsilatı", value: fmtTry(r.toplamTahsilatTL), sub: `bu dönemde gelen para${usdEk(r.toplamTahsilatUsd)}`, color: "#10b981" },
    { label: "Yeni Fatura", value: fmtTry(r.toplamYeniFaturaTL), sub: `bu dönemde kesilen${usdEk(r.toplamYeniFaturaUsd)}`, color: "#0ea5e9" },
    {
      label: "Net Değişim",
      value: r.netDegisimTL === null ? "—" : `${r.netDegisimTL > 0 ? "▲" : r.netDegisimTL < 0 ? "▼" : ""} ${fmtTry(Math.abs(r.netDegisimTL))}`,
      sub: r.netDegisimTL > 0 ? "dışarıdaki nakit büyüdü" : "dışarıdaki nakit azaldı",
      color: r.netDegisimTL > 0 ? "#e11d48" : "#10b981",
    },
    { label: "Tahsilat / Fatura", value: tahsilatOrani === null ? "—" : `%${Math.round(tahsilatOrani)}`, sub: "%100+ = borç eriyor", color: tahsilatOrani !== null && tahsilatOrani >= 100 ? "#10b981" : "#f59e0b" },
  ];

  const ListeKart = ({ baslik, Icon, renk, satirlar, tutarRenk }: any) => (
    <div className="rounded-[14px] border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b px-5 py-3.5">
        <Icon className={cn("h-4 w-4", renk)} />
        <h3 className="text-[14px] font-bold">{baslik}</h3>
      </div>
      {satirlar.length === 0 ? (
        <div className="py-6 text-center text-[12.5px] text-muted-foreground">Bu dönemde yok</div>
      ) : (
        <div className="divide-y">
          {satirlar.map((s: any) => (
            <div key={s.musteriId} className="flex cursor-pointer items-center justify-between gap-2 px-5 py-2.5 hover:bg-slate-50" onClick={() => setDrillId(s.musteriId)}>
              <span className="truncate text-[13px] font-medium">{s.ad}{s.doviz === "USD" ? " · USD" : ""}</span>
              <span className={cn("shrink-0 text-[13px] font-bold tabular-nums", tutarRenk)}>{fmtPara(s.tutar, s.doviz)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const GecisListe = ({ baslik, satirlar, ok }: any) => (
    <div className="rounded-[14px] border bg-card overflow-hidden">
      <div className="border-b px-5 py-3.5"><h3 className="text-[14px] font-bold">{baslik}</h3></div>
      {satirlar.length === 0 ? (
        <div className="py-6 text-center text-[12.5px] text-muted-foreground">Bu dönemde yok</div>
      ) : (
        <div className="divide-y">
          {satirlar.map((g: any) => (
            <div key={g.musteriId} className="flex cursor-pointer items-center justify-between gap-2 px-5 py-2.5 hover:bg-slate-50" onClick={() => setDrillId(g.musteriId)}>
              <span className="truncate text-[13px] font-medium">{g.ad}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] font-bold">
                <span className={cn("rounded-full px-2 py-0.5", SEGMENT_PILL[g.eski as TahsilatSegment])}>{SEGMENT_LABEL[g.eski as TahsilatSegment]}</span>
                <ArrowRight className={cn("h-3 w-3", ok)} />
                <span className={cn("rounded-full px-2 py-0.5", SEGMENT_PILL[g.yeni as TahsilatSegment])}>{SEGMENT_LABEL[g.yeni as TahsilatSegment]}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-[18px]">
      <div className="text-[13px] text-muted-foreground">
        Dönem: <b className="text-foreground">{tarihGoster(r.oncekiMizanTarihi)} → {tarihGoster(data.mizan.mizanTarihi)}</b> · {r.gunSayisi} gün
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
            <span className="absolute bottom-0 left-0 top-0 w-1" style={{ background: k.color }} />
            <div className="pl-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className="mt-2 pl-2 text-[20px] font-extrabold tabular-nums tracking-tight" style={{ color: k.color }}>{k.value}</div>
            <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListeKart baslik="En Çok Ödeyen 5" Icon={TrendingUp} renk="text-emerald-500" satirlar={r.enCokOdeyen} tutarRenk="text-emerald-600" />
        <ListeKart baslik="Borcu En Çok Büyüyen 5" Icon={TrendingDown} renk="text-rose-500" satirlar={r.borcuBuyuyen} tutarRenk="text-rose-600" />
      </div>

      <div className="rounded-[14px] border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-rose-500" />
            <h3 className="text-[14px] font-bold">Bu Dönem Hiç Ödemeyenler (borçlu)</h3>
          </div>
          <span className="text-[12px] tabular-nums text-muted-foreground">{r.hicOdemeyen.sayi} firma · {fmtTry(r.hicOdemeyen.toplamTL)}</span>
        </div>
        {r.hicOdemeyen.ilk10.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-muted-foreground">Herkes ödeme yapmış 🎉</div>
        ) : (
          <div className="divide-y">
            {r.hicOdemeyen.ilk10.map((s: any) => (
              <div key={s.musteriId} className="flex cursor-pointer items-center justify-between gap-2 px-5 py-2.5 hover:bg-slate-50" onClick={() => setDrillId(s.musteriId)}>
                <span className="truncate text-[13px] font-medium">{s.ad}{s.doviz === "USD" ? " · USD" : ""}</span>
                <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">son ödeme {s.gecikme >= 9999 ? "hiç" : `${s.gecikme}g önce`}</span>
                <span className="shrink-0 text-[13px] font-bold tabular-nums text-orange-700">{fmtPara(s.netBakiye, s.doviz)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GecisListe baslik="📉 Bozulanlar (segment kötüleşti)" satirlar={r.bozulanlar} ok="text-rose-500" />
        <GecisListe baslik="📈 Düzelenler" satirlar={r.duzelenler} ok="text-emerald-500" />
      </div>

      <MusteriDrillDown musteriId={drillId} onClose={() => setDrillId(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Tahsilat.tsx'e sekmeyi bağla**

- Import'lara: `import { HaftalikRapor } from "@/components/tahsilat/HaftalikRapor";` ve lucide'dan `ClipboardList` ekle.
- `TABS` dizisinde `ozet`'ten sonra: `{ id: "rapor", label: "Rapor", Icon: ClipboardList },`
- TabsContent'lere (ozet'ten sonra): `<TabsContent value="rapor" className="mt-5"><HaftalikRapor mizanId={aktifMizanId} /></TabsContent>`

- [ ] **Step 3: Doğrula + commit**

Run: `npm run check` → 0 hata.

```bash
git add client/src/components/tahsilat/HaftalikRapor.tsx client/src/pages/Tahsilat.tsx
git commit -m "feat(tahsilat): Haftalik Rapor sekmesi — donem tahsilati, odemeyenler, segment gecisleri"
```

---

### Task 3: Ödeme ritmi — saf fonksiyon + seri sorgusu + /api/tahsilat/analiz

**Files:**
- Modify: `shared/tahsilatHesaplari.ts` (dosya sonu)
- Modify: `server/storage.ts` (IStorage interface, `getEnSonBakiyelerByMizan` imzasının yanına + impl)
- Modify: `server/routes.ts` (import + dashboard'dan sonra yeni endpoint)

**Interfaces:**
- Produces:
  - `odemeRitmi(odemeTarihleri: string[], refTarih: string): { ortalamaAralik: number | null; sonOdemeGun: number; alarm: boolean }`
  - `getMizanBakiyeSerisiByYil(yil: string): Promise<(MizanBakiye & { mizanTarihi: string })[]>`
  - `GET /api/tahsilat/analiz?mizanId=` → `{ mizanTarihi, mizanSayisiYil, alarmlar: [{ musteriId, ad, hesapKodu, doviz, netBakiye, ortalamaAralik, sonOdemeGun, odemeSayisi }] }`

- [ ] **Step 1: shared'a odemeRitmi ekle** (`tarihGoster` fonksiyonundan önce)

```ts
// Haftalık mizan serisinden öğrenilen ödeme ritmi.
// odemeTarihleri: firmanın mizanlar boyunca görülen FARKLI son-ödeme tarihleri.
// Alarm: ritim öğrenildiyse (≥3 ödeme) ve sessizlik ortalamanın 2 katını + 14 gün tabanını aştıysa.
export function odemeRitmi(odemeTarihleri: string[], refTarih: string): {
  ortalamaAralik: number | null;
  sonOdemeGun: number;
  alarm: boolean;
} {
  const tarihler = Array.from(new Set(odemeTarihleri)).sort((a, b) => daysBetween(b, a));
  if (tarihler.length === 0) return { ortalamaAralik: null, sonOdemeGun: 9999, alarm: false };
  const sonOdemeGun = daysBetween(tarihler[tarihler.length - 1], refTarih);
  if (tarihler.length < 3) return { ortalamaAralik: null, sonOdemeGun, alarm: false };
  let toplam = 0;
  for (let i = 1; i < tarihler.length; i++) toplam += daysBetween(tarihler[i - 1], tarihler[i]);
  const ortalamaAralik = toplam / (tarihler.length - 1);
  const alarm = sonOdemeGun > 2 * ortalamaAralik && sonOdemeGun > 14;
  return { ortalamaAralik, sonOdemeGun, alarm };
}
```
(`daysBetween` dosyada mevcut, format-bağımsız sıralama için comparator olarak kullanılıyor.)

- [ ] **Step 2: storage'a seri sorgusu ekle**

IStorage'a (`getEnSonBakiyelerByMizan` satırının altına):
```ts
  getMizanBakiyeSerisiByYil(yil: string): Promise<(MizanBakiye & { mizanTarihi: string })[]>;
```

Implementasyon (`getEnSonBakiyelerByMizan` metodunun altına):
```ts
  // Ritim/seri analizi: yılın tüm mizanlarının bakiye satırları tek join sorgusuyla.
  async getMizanBakiyeSerisiByYil(yil: string): Promise<(MizanBakiye & { mizanTarihi: string })[]> {
    return await db
      .select({
        id: mizanBakiye.id,
        mizanId: mizanBakiye.mizanId,
        musteriId: mizanBakiye.musteriId,
        borc: mizanBakiye.borc,
        alacak: mizanBakiye.alacak,
        bakiyeBorc: mizanBakiye.bakiyeBorc,
        bakiyeAlacak: mizanBakiye.bakiyeAlacak,
        sonBakiye: mizanBakiye.sonBakiye,
        sonBakiyeBA: mizanBakiye.sonBakiyeBA,
        sonBorcTarihi: mizanBakiye.sonBorcTarihi,
        sonAlacakTarihi: mizanBakiye.sonAlacakTarihi,
        mizanTarihi: mizanYuklemeleri.mizanTarihi,
      })
      .from(mizanBakiye)
      .innerJoin(mizanYuklemeleri, eq(mizanBakiye.mizanId, mizanYuklemeleri.id))
      .where(sql`${mizanYuklemeleri.mizanTarihi} LIKE ${yil + "-%"}`)
      .orderBy(mizanYuklemeleri.mizanTarihi);
  }
```
(`mizanBakiye`, `mizanYuklemeleri`, `eq`, `sql` storage.ts'te zaten import'lu — değilse şema import satırına ekle.)

- [ ] **Step 3: routes'a analiz endpoint'i ekle**

Import satırına `odemeRitmi` ekle (`@shared/tahsilatHesaplari` listesine). Dashboard endpoint'inin kapanışından sonra:

```ts
  // 10b. Derin analiz — ödeme ritmi bozulma alarmları (haftalık mizan serisi)
  app.get("/api/tahsilat/analiz", async (req, res) => {
    try {
      const mizanIdParam = req.query.mizanId as string | undefined;
      const tumMizanlar = await storage.getMizanYuklemeleri();
      const mizan = mizanIdParam ? await storage.getMizanYukleme(mizanIdParam) : tumMizanlar[0];
      if (!mizan) return res.json({ mizanTarihi: null, mizanSayisiYil: 0, alarmlar: [] });
      const yil = mizan.mizanTarihi.slice(0, 4);
      const seri = await storage.getMizanBakiyeSerisiByYil(yil);

      // Firma başına farklı ödeme tarihleri (seçili mizan tarihine kadar)
      const odemeTarihleri = new Map<string, Set<string>>();
      for (const r of seri) {
        if (r.mizanTarihi > mizan.mizanTarihi || !r.sonAlacakTarihi) continue;
        if (!odemeTarihleri.has(r.musteriId)) odemeTarihleri.set(r.musteriId, new Set());
        odemeTarihleri.get(r.musteriId)!.add(r.sonAlacakTarihi);
      }

      const guncel = seri.filter((r) => r.mizanId === mizan.id);
      const musteriIdler = guncel.map((r) => r.musteriId);
      const musteriList = musteriIdler.length > 0
        ? await db.select().from(musteriler).where(inArray(musteriler.id, musteriIdler))
        : [];
      const musteriMap = new Map(musteriList.map((m) => [m.id, m]));

      const alarmlar = guncel.map((r) => {
        const m = musteriMap.get(r.musteriId);
        if (!m) return null;
        const nb = netBakiye({ sonBakiye: Number(r.sonBakiye || 0), sonBakiyeBA: r.sonBakiyeBA || "B" });
        if (nb <= 0) return null;
        const tarihler = Array.from(odemeTarihleri.get(r.musteriId) || []);
        const ritim = odemeRitmi(tarihler, mizan.mizanTarihi);
        if (!ritim.alarm) return null;
        return {
          musteriId: m.id,
          ad: m.ad,
          hesapKodu: m.hesapKodu,
          doviz: (m.hesapKodu || "").startsWith("120-02") ? "USD" : "TL",
          netBakiye: nb,
          ortalamaAralik: Math.round(ritim.ortalamaAralik!),
          sonOdemeGun: ritim.sonOdemeGun,
          odemeSayisi: tarihler.length,
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.netBakiye - a.netBakiye);

      res.json({
        mizanTarihi: mizan.mizanTarihi,
        mizanSayisiYil: new Set(seri.map((r) => r.mizanId)).size,
        alarmlar,
      });
    } catch (e: any) {
      console.error("Analiz hatası:", e);
      res.status(500).json({ error: e.message });
    }
  });
```

- [ ] **Step 4: Doğrula + commit**

Run: `npm run check` → 0 hata.

```bash
git add shared/tahsilatHesaplari.ts server/storage.ts server/routes.ts
git commit -m "feat(tahsilat): odeme ritmi analizi — seri sorgusu + /api/tahsilat/analiz"
```

---

### Task 4: Trend sekmesine "Ritmi Bozulanlar" listesi

**Files:**
- Modify: `client/src/components/tahsilat/TahsilatTrend.tsx`

**Interfaces:**
- Consumes: Task 3 `/api/tahsilat/analiz` yanıtı; `MusteriDrillDown`.

- [ ] **Step 1: İmport ve state ekle**

Dosya başına:
```tsx
import { useState } from "react";
import { Loader2, BellRing } from "lucide-react";
import { MusteriDrillDown } from "./MusteriDrillDown";
```
(`Loader2` import'u mevcutla birleştir.) Fonksiyon başına:
```tsx
  const [drillId, setDrillId] = useState<string | null>(null);
  const { data: analiz } = useQuery<any>({ queryKey: ["/api/tahsilat/analiz"] });
```
`fmtTry` altına:
```tsx
  const fmtUsd = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmtPara = (v: number, doviz: string) => (doviz === "USD" ? fmtUsd(v) : fmtTry(v));
```

- [ ] **Step 2: Alarm bölümünü grafiklerin ÜSTÜNE ekle** (return içindeki `space-y-4` div'inin ilk çocuğu)

```tsx
      {/* Ritmi bozulanlar — ödeme alışkanlığı öğrenilen ve sapan firmalar */}
      <div className="rounded-[14px] border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-rose-500" />
            <h3 className="text-[15px] font-bold">🔔 Ritmi Bozulanlar</h3>
          </div>
          <span className="text-[11.5px] text-muted-foreground">
            ritim ≥3 ödeme görülen firmadan öğrenilir · {analiz?.mizanSayisiYil ?? 0} mizan/yıl
          </span>
        </div>
        {!analiz?.alarmlar?.length ? (
          <div className="py-8 text-center text-[12.5px] text-muted-foreground">
            Alarm yok. Haftalık mizan biriktikçe firma ödeme ritmi öğrenilir; ritmini 2 kat aşan borçlular burada listelenir.
          </div>
        ) : (
          <div className="divide-y">
            {analiz.alarmlar.map((a: any) => (
              <div key={a.musteriId} className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50" onClick={() => setDrillId(a.musteriId)}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{a.ad}{a.doviz === "USD" ? " · USD" : ""}</div>
                  <div className="text-[11px] text-muted-foreground">
                    ort. <b>{a.ortalamaAralik} günde bir</b> öderdi · <b className="text-rose-600">{a.sonOdemeGun} gündür sessiz</b> · {a.odemeSayisi} ödeme görüldü
                  </div>
                </div>
                <div className="shrink-0 text-sm font-bold tabular-nums text-orange-700">{fmtPara(a.netBakiye, a.doviz)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
```

Return kapanışından önce (son div'den önce): `<MusteriDrillDown musteriId={drillId} onClose={() => setDrillId(null)} />`

- [ ] **Step 3: Doğrula + commit**

Run: `npm run check` → 0 hata.

```bash
git add client/src/components/tahsilat/TahsilatTrend.tsx
git commit -m "feat(tahsilat): Trend sekmesine ritmi bozulanlar alarm listesi"
```

---

### Task 5: Dönmeyen Nakit Yaşlandırması (özet alanı + Özet bar)

**Files:**
- Modify: `server/routes.ts` (ozet objesine `yasDagilimi`)
- Modify: `client/src/components/tahsilat/TahsilatOzet.tsx` (KPI şeridi ile matris arasına bar)

**Interfaces:**
- Produces: `ozet.yasDagilimi: [{ aralik: "0-30"|"31-60"|"61-90"|"90+", tl: number, usd: number, sayi: number }]`.

- [ ] **Step 1: routes ozet'e yasDagilimi ekle** (`segmentDagilim` alanından sonra)

```ts
        yasDagilimi: [
          { aralik: "0-30", min: 0, max: 30 },
          { aralik: "31-60", min: 31, max: 60 },
          { aralik: "61-90", min: 61, max: 90 },
          { aralik: "90+", min: 91, max: 999999 },
        ].map((k) => {
          const grup = detaylar.filter((d) => d.netBakiye > 0 && d.gecikme >= k.min && d.gecikme <= k.max);
          return {
            aralik: k.aralik,
            tl: grup.filter((d) => d.doviz === "TL").reduce((a, d) => a + d.netBakiye, 0),
            usd: grup.filter((d) => d.doviz === "USD").reduce((a, d) => a + d.netBakiye, 0),
            sayi: grup.length,
          };
        }),
```

- [ ] **Step 2: TahsilatOzet'e stacked bar ekle**

Bileşen içinde `liste` tanımından önce:
```tsx
  const YAS_RENK = ["#10b981", "#f59e0b", "#f97316", "#e11d48"];
  const yas = (o.yasDagilimi || []) as { aralik: string; tl: number; usd: number; sayi: number }[];
  const yasToplam = yas.reduce((a, k) => a + k.tl, 0);
```
JSX'te KPI grid'inin kapanışı ile segment matrisi arasına:
```tsx
      {/* Nakit yaşlandırma — para kaç gündür dönmüyor? (son ödeme tarihine göre) */}
      {yasToplam > 0 && (
        <div className="rounded-[14px] border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-bold">Dışarıdaki nakit ne kadar süredir dönmüyor?</h3>
            <span className="text-[11px] text-muted-foreground">son ödeme tarihine göre · TL hesaplar</span>
          </div>
          <div className="mt-3 flex h-7 w-full overflow-hidden rounded-lg">
            {yas.map((k, i) => k.tl > 0 && (
              <div
                key={k.aralik}
                title={`${k.aralik} gün · ${k.sayi} firma · ${fmtTry(k.tl)}`}
                style={{ width: `${(k.tl / yasToplam) * 100}%`, background: YAS_RENK[i] }}
                className="flex items-center justify-center overflow-hidden whitespace-nowrap text-[10.5px] font-bold text-white"
              >
                {k.tl / yasToplam > 0.08 ? kisaTutar(k.tl) : ""}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {yas.map((k, i) => (
              <span key={k.aralik} className="text-[11px] text-muted-foreground">
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: YAS_RENK[i] }} />
                {k.aralik}g · {k.sayi} firma · {kisaTutar(k.tl)}{k.usd > 0 ? ` +$${kisaTutar(k.usd)}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 3: Doğrula + commit**

Run: `npm run check` → 0 hata.

```bash
git add server/routes.ts client/src/components/tahsilat/TahsilatOzet.tsx
git commit -m "feat(tahsilat): donmeyen nakit yaslandirmasi — ozet yas dagilimi + stacked bar"
```

---

### Task 6: Uçtan uca doğrulama

- [ ] **Step 1:** `npm run dev` (arka plan) → `GET /api/tahsilat/dashboard`:
  - `rapor` dolu (önceki mizan 11/05 varken), `toplamTahsilatTL > 0`, SUMİRİKO `enCokOdeyen` içinde;
  - `ozet.yasDagilimi` 4 kova; `Σ tl` = `ozet.toplamNetAlacak` (birebir eşit olmalı);
  - En eski mizan seçilince `rapor: null`.
- [ ] **Step 2:** `GET /api/tahsilat/analiz` → `mizanSayisiYil` ≥ 3; alarmlar listesi geliyor (4 mizanla az sayıda firma ritim öğrenmiş olabilir — ≥3 ödeme koşulu nedeniyle boş olabilir, boşsa `odemeSayisi>=3` olan firma sayısını logla ve boş durumun nedenli olduğunu doğrula).
- [ ] **Step 3:** Vite transform: `GET /src/components/tahsilat/HaftalikRapor.tsx` → HTTP 200.
- [ ] **Step 4:** Sondaj: `?mizanId=<subat-id>` ile analiz → yalnız o tarihe kadarki ödemeler kullanılıyor; geçersiz mizanId → boş yanıt.
- [ ] **Step 5:** Sorun varsa düzelt + commit; server'ı kapat, portu temizle. Push YOK — kullanıcı "deploy" derse.
