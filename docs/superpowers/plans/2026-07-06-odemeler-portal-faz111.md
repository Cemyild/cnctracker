# Ödemeler Portalı Faz 1.11 — Firma Çoklu IBAN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firma başına IBAN listesi (alt-tablo `firma_ibanlari`; her IBAN döviz+etiket); ödeme anında etiketli seçim (tek ise otomatik); çok-satır Excel + indirilebilir şablon.

**Architecture:** F1.10 `ibanTry`/`ibanUsd` kolonlarını alt-tabloyla değiştirir. Eski kolonlar SİLİNMEZ (drizzle push drop tuzağı), çocuk satır yoksa okuma-yedeği olarak sentezlenir (göç scripti yok). create/update/upsert eski alanları da kabul edip çocuk satıra köprüler → her ara-durum tsc-yeşil + deploy-güvenli. Spec: `docs/superpowers/specs/2026-07-06-odemeler-portal-faz111-firma-coklu-iban-design.md`.

**Tech Stack:** Drizzle + Express, React 18 + TanStack Query + shadcn/ui, xlsx (mevcut), Playwright (scratchpad).

## Global Constraints

- Türkçe kaynak dosyaları PowerShell Set-Content/Out-File ile ASLA yazılmaz — yalnız Edit/Write; iş sonunda `node -e` ile U+FFFD taraması.
- `git push` YASAK (push = canlı deploy). **AÇIK-YOL `git add <dosya>` — asla `git add -A`/`.`** (paylaşılan çalışma ağacında paralel oturum riski). Commit öncesi `git status` ile yalnız kendi dosyalarının stage'lendiğini doğrula. `KONŞİMENTO ÖRNEKLERİ/`, `uploads/`, `.env`, xlsx dosyaları asla eklenmez.
- Test runner YOK; kalite kapıları `npm run check` (tsc) + saf-fonksiyon node scriptleri + Playwright (scratchpad) + `npm run build`.
- Scratchpad: `C:\Users\cem\AppData\Local\Temp\claude\e--CEM-APPS-cnctracker\f8e48f44-2295-45d2-af94-f819937c735a\scratchpad` (Playwright projeye kurulu değil; mevcut e2e scriptlerinin chromium'u nasıl bulduğuna bak — NODE_PATH global gsd-pi — aynı yöntem).
- Dev sunucu: port 5000. Sunucu KODU değişince restart: `netstat -ano | findstr :5000` → `taskkill //PID <pid> //F` → arka planda `npm run dev` → 5-8 sn. Frontend Vite ile otomatik tazelenir.
- DB kolon adları snake_case (`firma_id`, `para_birimi`); FK kolon adı açık string (CLAUDE.md). N+1 önleme: `inArray` + Map join.
- PUT/PATCH storage dönüşü null-check → 404.
- Portal test kullanıcıları (lokal dev DB): temsilci `suleyman`, muhasebe `muhasebe`, şifre `1234`. Türkçe curl gövdesi DOSYADAN `--data-binary`.
- Para birimi ∈ {TRY, USD, EUR}. Eski `iban`/`ibanTry`/`ibanUsd`/`banka` kolonları ŞEMADA KALIR (drop tuzağı); çocuk satır yoksa okuma-yedeği.

---

### Task 1: Şema (firma_ibanlari) + storage

**Files:**
- Modify: `shared/schema.ts` (firmaIbanlari tablosu + tipler, portalSessions'tan ÖNCE), `server/storage.ts` (IStorage + metotlar)

**Interfaces:**
- Produces (Task 2-5):
  - Tipler: `FirmaIban` = {id, firmaId, paraBirimi, iban, etiket:string|null}; `OdemeSirketiDetay` = `OdemeSirketi & { ibanlar: FirmaIban[] }`.
  - `getOdemeSirketleri()` / `getOdemeSirketleriTumu()` → `Promise<OdemeSirketiDetay[]>`
  - `createOdemeSirketi(data: { ad; iban?; ibanTry?; ibanUsd?; banka?; vergiNo?; notlar?; ibanlar?: {paraBirimi;iban;etiket?}[] }): Promise<OdemeSirketi | null>`
  - `updateOdemeSirketi(id, data: Partial<{ ad; iban; ibanTry; ibanUsd; banka; vergiNo; notlar; aktif; ibanlar }>): Promise<OdemeSirketi | null>`
  - `upsertOdemeSirketi(ad, { iban?; paraBirimi?; kaynak? }): Promise<void>` (yeni firmada çocuk IBAN)
  - `bulkUpsertFirmaIbanRows(rows: { ad; paraBirimi; iban; etiket?; vergiNo?; notlar? }[]): Promise<{ eklendi; guncellendi; atlandi }>`
  - `firmaIbanlariExcelSablonu(): Promise<Buffer>`

- [ ] **Step 1: Şema — firma_ibanlari tablosu**

`shared/schema.ts`'te `portalSessions` tanımının HEMEN ÖNÜNE ekle:

```ts
// Firma başına IBAN listesi (çoklu döviz/hesap). odeme_sirketleri'nin eski tekil
// iban/ibanTry/ibanUsd kolonları drop edilmez; çocuk satır yoksa okuma-yedeği olur.
export const firmaIbanlari = pgTable("firma_ibanlari", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firmaId: varchar("firma_id").notNull(), // FK odeme_sirketleri.id (açık snake string)
  paraBirimi: text("para_birimi").notNull(), // TRY | USD | EUR
  iban: text("iban").notNull(),
  etiket: text("etiket"), // banka adı / ayırt edici not
}, (t) => [
  index("IDX_firma_ibanlari_firma").on(t.firmaId),
]);
export const insertFirmaIbanSchema = createInsertSchema(firmaIbanlari).omit({ id: true });
export type InsertFirmaIban = z.infer<typeof insertFirmaIbanSchema>;
export type FirmaIban = typeof firmaIbanlari.$inferSelect;
export type OdemeSirketiDetay = OdemeSirketi & { ibanlar: FirmaIban[] };
```

(`OdemeSirketi` tipi bu satırdan önce zaten tanımlı — `OdemeSirketiDetay` onu genişletir.)

- [ ] **Step 2: storage — import + IStorage imzaları**

`server/storage.ts`'te schema import satırına `firmaIbanlari, type FirmaIban, type OdemeSirketiDetay` ekle (mevcut `odemeSirketleri, type OdemeSirketi, type InsertOdemeSirketi` yanına).

IStorage arayüzünde ilgili 6 satırı şunlarla değiştir:

```ts
  upsertOdemeSirketi(ad: string, opts?: { iban?: string | null; paraBirimi?: string; kaynak?: string }): Promise<void>;
  getOdemeSirketleri(): Promise<OdemeSirketiDetay[]>;
  getOdemeSirketleriTumu(): Promise<OdemeSirketiDetay[]>;
  createOdemeSirketi(data: { ad: string; iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null; ibanlar?: { paraBirimi: string; iban: string; etiket?: string | null }[] }): Promise<OdemeSirketi | null>;
  updateOdemeSirketi(id: string, data: Partial<{ ad: string; iban: string | null; ibanTry: string | null; ibanUsd: string | null; banka: string | null; vergiNo: string | null; notlar: string | null; aktif: boolean; ibanlar: { paraBirimi: string; iban: string; etiket?: string | null }[] }>): Promise<OdemeSirketi | null>;
  bulkUpsertFirmaIbanRows(rows: { ad: string; paraBirimi: string; iban: string; etiket?: string | null; vergiNo?: string | null; notlar?: string | null }[]): Promise<{ eklendi: number; guncellendi: number; atlandi: number }>;
  firmaIbanlariExcelSablonu(): Promise<Buffer>;
```

Mevcut `bulkUpsertOdemeSirketleri` imzası **korunur** (F1.10 excel rotası Task 2'ye kadar onu çağırır; sonra kullanılmaz).

- [ ] **Step 3: storage — yardımcılar + get/getTumu (ibanlar join + sentez)**

`DatabaseStorage` sınıfında mevcut `getOdemeSirketleri` + `getOdemeSirketleriTumu` metotlarını şunlarla değiştir:

```ts
  // Çocuk satırı olmayan firma için eski tekil kolonlardan sanal IBAN üretir (göç yok)
  private eskiKolonlardanIban(f: OdemeSirketi): FirmaIban[] {
    const r: FirmaIban[] = [];
    const tryVal = (f.ibanTry || f.iban || "").trim();
    if (tryVal) r.push({ id: `legacy-${f.id}-try`, firmaId: f.id, paraBirimi: "TRY", iban: tryVal, etiket: null });
    const usdVal = (f.ibanUsd || "").trim();
    if (usdVal) r.push({ id: `legacy-${f.id}-usd`, firmaId: f.id, paraBirimi: "USD", iban: usdVal, etiket: null });
    return r;
  }

  private async firmalaraIbanEkle(firmalar: OdemeSirketi[]): Promise<OdemeSirketiDetay[]> {
    if (firmalar.length === 0) return [];
    const satirlar = await db.select().from(firmaIbanlari).where(inArray(firmaIbanlari.firmaId, firmalar.map((f) => f.id)));
    const map = new Map<string, FirmaIban[]>();
    for (const s of satirlar) {
      const arr = map.get(s.firmaId) ?? [];
      arr.push(s);
      map.set(s.firmaId, arr);
    }
    return firmalar.map((f) => {
      const cocuk = map.get(f.id) ?? [];
      return { ...f, ibanlar: cocuk.length > 0 ? cocuk : this.eskiKolonlardanIban(f) };
    });
  }

  private async ibanlariYaz(firmaId: string, ibanlar?: { paraBirimi: string; iban: string; etiket?: string | null }[]): Promise<void> {
    const temizler = (ibanlar ?? [])
      .map((x) => ({ firmaId, paraBirimi: String(x.paraBirimi), iban: String(x.iban ?? "").trim(), etiket: x.etiket?.trim() || null }))
      .filter((x) => x.iban && ["TRY", "USD", "EUR"].includes(x.paraBirimi));
    if (temizler.length === 0) return;
    await db.insert(firmaIbanlari).values(temizler);
  }

  // Eski tekil iban alanlarını (F1.10 çağrıları) çocuk-satır listesine köprüler
  private legacyIbanlar(data: { iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null }): { paraBirimi: string; iban: string; etiket?: string | null }[] {
    const r: { paraBirimi: string; iban: string; etiket?: string | null }[] = [];
    const tryVal = (data.ibanTry ?? data.iban ?? "").trim();
    if (tryVal) r.push({ paraBirimi: "TRY", iban: tryVal });
    const usdVal = (data.ibanUsd ?? "").trim();
    if (usdVal) r.push({ paraBirimi: "USD", iban: usdVal });
    return r;
  }

  async getOdemeSirketleri(): Promise<OdemeSirketiDetay[]> {
    const firmalar = await db
      .select()
      .from(odemeSirketleri)
      .where(eq(odemeSirketleri.aktif, true))
      .orderBy(desc(odemeSirketleri.kullanimSayisi), desc(odemeSirketleri.sonKullanim))
      .limit(100);
    return this.firmalaraIbanEkle(firmalar);
  }

  async getOdemeSirketleriTumu(): Promise<OdemeSirketiDetay[]> {
    const firmalar = await db.select().from(odemeSirketleri).orderBy(asc(odemeSirketleri.ad));
    return this.firmalaraIbanEkle(firmalar);
  }
```

- [ ] **Step 4: storage — create/update (ibanlar + legacy köprü)**

Mevcut `createOdemeSirketi` gövdesini şununla değiştir:

```ts
  async createOdemeSirketi(data: {
    ad: string; iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null;
    ibanlar?: { paraBirimi: string; iban: string; etiket?: string | null }[];
  }): Promise<OdemeSirketi | null> {
    const temiz = data.ad.trim();
    if (!temiz) return null;
    const mevcut = await db.select().from(odemeSirketleri).where(eq(odemeSirketleri.ad, temiz)).limit(1);
    if (mevcut.length > 0) return null; // ad çakışması → route 409
    const [yeni] = await db
      .insert(odemeSirketleri)
      .values({ ad: temiz, banka: data.banka?.trim() || null, vergiNo: data.vergiNo?.trim() || null, notlar: data.notlar?.trim() || null, kaynak: "muhasebe" })
      .returning();
    // ibanlar verildiyse onu, verilmediyse eski tekil alanları köprüle (F1.10 çağrıları)
    await this.ibanlariYaz(yeni.id, data.ibanlar ?? this.legacyIbanlar(data));
    return yeni;
  }
```

Mevcut `updateOdemeSirketi` gövdesini şununla değiştir:

```ts
  async updateOdemeSirketi(
    id: string,
    data: Partial<{ ad: string; iban: string | null; ibanTry: string | null; ibanUsd: string | null; banka: string | null; vergiNo: string | null; notlar: string | null; aktif: boolean; ibanlar: { paraBirimi: string; iban: string; etiket?: string | null }[] }>,
  ): Promise<OdemeSirketi | null> {
    const set: Record<string, unknown> = {};
    if (data.ad !== undefined) set.ad = data.ad.trim();
    if (data.banka !== undefined) set.banka = data.banka?.trim() || null;
    if (data.vergiNo !== undefined) set.vergiNo = data.vergiNo?.trim() || null;
    if (data.notlar !== undefined) set.notlar = data.notlar?.trim() || null;
    if (data.aktif !== undefined) set.aktif = data.aktif;
    let firma: OdemeSirketi | undefined;
    if (Object.keys(set).length > 0) {
      [firma] = await db.update(odemeSirketleri).set(set).where(eq(odemeSirketleri.id, id)).returning();
    } else {
      [firma] = await db.select().from(odemeSirketleri).where(eq(odemeSirketleri.id, id)).limit(1);
    }
    if (!firma) return null;
    // ibanlar verildiyse çocuk satırları DEĞİŞTİR; yoksa eski tekil alan geldiyse onu köprüle;
    // ikisi de yoksa (ör. yalnız aktif toggle) çocuk satırlara DOKUNMA.
    const yeniIbanlar = data.ibanlar !== undefined
      ? data.ibanlar
      : (data.iban !== undefined || data.ibanTry !== undefined || data.ibanUsd !== undefined ? this.legacyIbanlar(data) : undefined);
    if (yeniIbanlar !== undefined) {
      await db.delete(firmaIbanlari).where(eq(firmaIbanlari.firmaId, id));
      await this.ibanlariYaz(id, yeniIbanlar);
    }
    return firma;
  }
```

- [ ] **Step 5: storage — upsert (yeni firmada çocuk IBAN) + yeni bulk + şablon**

Mevcut `upsertOdemeSirketi` gövdesini şununla değiştir:

```ts
  async upsertOdemeSirketi(ad: string, opts?: { iban?: string | null; paraBirimi?: string; kaynak?: string }): Promise<void> {
    const temiz = ad.trim();
    if (!temiz) return;
    const ibanTemiz = opts?.iban ? String(opts.iban).trim() : null;
    const pb = ["TRY", "USD", "EUR"].includes(String(opts?.paraBirimi)) ? String(opts?.paraBirimi) : "TRY";
    const mevcut = await db.select({ id: odemeSirketleri.id }).from(odemeSirketleri).where(eq(odemeSirketleri.ad, temiz)).limit(1);
    if (mevcut.length > 0) {
      // Mevcut firma: yalnız sayaç — çocuk IBAN EKLENMEZ (muhasebe yönetir, F1.9 kuralı)
      await db.update(odemeSirketleri)
        .set({ kullanimSayisi: sql`${odemeSirketleri.kullanimSayisi} + 1`, sonKullanim: sql`now()` })
        .where(eq(odemeSirketleri.id, mevcut[0].id));
    } else {
      const [yeni] = await db.insert(odemeSirketleri).values({ ad: temiz, kaynak: opts?.kaynak ?? "temsilci" }).returning();
      if (ibanTemiz) await db.insert(firmaIbanlari).values({ firmaId: yeni.id, paraBirimi: pb, iban: ibanTemiz, etiket: null });
    }
  }
```

`bulkUpsertOdemeSirketleri` metodunun HEMEN ARDINA yeni iki metot ekle:

```ts
  async bulkUpsertFirmaIbanRows(
    rows: { ad: string; paraBirimi: string; iban: string; etiket?: string | null; vergiNo?: string | null; notlar?: string | null }[],
  ): Promise<{ eklendi: number; guncellendi: number; atlandi: number }> {
    // Satırları firma adına göre grupla (bir firmanın birden çok IBAN satırı olabilir)
    const gruplar = new Map<string, { vergiNo: string | null; notlar: string | null; ibanlar: { paraBirimi: string; iban: string; etiket: string | null }[] }>();
    let atlandi = 0;
    for (const row of rows) {
      const ad = String(row.ad ?? "").trim();
      const iban = String(row.iban ?? "").trim();
      const pb = String(row.paraBirimi ?? "").trim().toUpperCase();
      if (!ad) { atlandi++; continue; }
      const g = gruplar.get(ad) ?? { vergiNo: null, notlar: null, ibanlar: [] };
      if (!g.vergiNo && row.vergiNo?.trim()) g.vergiNo = row.vergiNo.trim();
      if (!g.notlar && row.notlar?.trim()) g.notlar = row.notlar.trim();
      if (iban && ["TRY", "USD", "EUR"].includes(pb)) g.ibanlar.push({ paraBirimi: pb, iban, etiket: row.etiket?.trim() || null });
      else if (iban) atlandi++; // geçersiz para birimi
      gruplar.set(ad, g);
    }
    let eklendi = 0, guncellendi = 0;
    for (const [ad, g] of gruplar) {
      const mevcut = await db.select({ id: odemeSirketleri.id }).from(odemeSirketleri).where(eq(odemeSirketleri.ad, ad)).limit(1);
      let firmaId: string;
      if (mevcut.length > 0) {
        firmaId = mevcut[0].id;
        const set: Record<string, unknown> = {};
        if (g.vergiNo) set.vergiNo = g.vergiNo;
        if (g.notlar) set.notlar = g.notlar;
        if (Object.keys(set).length > 0) await db.update(odemeSirketleri).set(set).where(eq(odemeSirketleri.id, firmaId));
        // Muhasebe Excel'i YETKİLİ: firmanın çocuk IBAN'larını DEĞİŞTİR
        await db.delete(firmaIbanlari).where(eq(firmaIbanlari.firmaId, firmaId));
        guncellendi++;
      } else {
        const [yeni] = await db.insert(odemeSirketleri).values({ ad, vergiNo: g.vergiNo, notlar: g.notlar, kaynak: "muhasebe" }).returning();
        firmaId = yeni.id;
        eklendi++;
      }
      if (g.ibanlar.length > 0) await db.insert(firmaIbanlari).values(g.ibanlar.map((x) => ({ firmaId, ...x })));
    }
    return { eklendi, guncellendi, atlandi };
  }

  async firmaIbanlariExcelSablonu(): Promise<Buffer> {
    const aoa = [
      ["Firma Adı", "Para Birimi", "IBAN", "Etiket", "Vergi/TC No", "Not"],
      ["ÖRNEK LOJİSTİK A.Ş.", "USD", "TR000000000000000000000000", "USD - Garanti", "1234567890", "örnek satır — silebilirsiniz"],
      ["ÖRNEK LOJİSTİK A.Ş.", "TRY", "TR111111111111111111111111", "TRY - İş Bankası", "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Firmalar");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }
```

- [ ] **Step 6: Tip kontrolü + db:push**

Run: `npm run check`
Expected: **0 hata** (create/update eski `iban`/`ibanTry`/`ibanUsd` alanlarını hâlâ kabul ettiğinden routes.ts/FirmalarSayfasi.tsx kırılmaz; get/getTumu artık `OdemeSirketiDetay[]` döndürüyor — bu, `OdemeSirketi` üstküme olduğundan mevcut tüketicileri kırmaz).

Run: `npm run db:push`
Expected: `firma_ibanlari` tablosu + index eklenir; `[✓] Changes applied`. SORU SORARSA `--force` KULLANMA; ne sorduğunu yaz, DUR (BLOCKED).

- [ ] **Step 7: Storage duman testi (tsx, gerçek DB)**

Scratchpad'e `f111t1.ts` yaz, `npx tsx` (repo kökü, `import 'dotenv/config'`):
```ts
import 'dotenv/config';
import { storage } from './server/storage';
(async () => {
  const c = await storage.createOdemeSirketi({ ad: 'T111 FIRMA A.Ş.', vergiNo: '123', ibanlar: [
    { paraBirimi: 'USD', iban: 'TR_USD_1', etiket: 'Garanti' },
    { paraBirimi: 'USD', iban: 'TR_USD_2', etiket: 'İş Bankası' },
    { paraBirimi: 'TRY', iban: 'TR_TRY_1', etiket: null },
  ]});
  let d = (await storage.getOdemeSirketleriTumu()).find(x => x.ad === 'T111 FIRMA A.Ş.');
  console.log('create ibanlar:', d?.ibanlar.length, d?.ibanlar.filter(i=>i.paraBirimi==='USD').length); // 3 2
  await storage.updateOdemeSirketi(c!.id, { ibanlar: [{ paraBirimi: 'EUR', iban: 'TR_EUR_1', etiket: 'X' }] });
  d = (await storage.getOdemeSirketleriTumu()).find(x => x.ad === 'T111 FIRMA A.Ş.');
  console.log('update replace:', d?.ibanlar.length, d?.ibanlar[0]?.paraBirimi); // 1 EUR
  // legacy köprü: eski ibanTry ile create -> cocuk TRY olur
  const c2 = await storage.createOdemeSirketi({ ad: 'T111 LEGACY LTD', ibanTry: 'TR_ESKI' });
  d = (await storage.getOdemeSirketleriTumu()).find(x => x.ad === 'T111 LEGACY LTD');
  console.log('legacy kopru:', d?.ibanlar.length, d?.ibanlar[0]?.paraBirimi, d?.ibanlar[0]?.iban); // 1 TRY TR_ESKI
  // upsert yeni firma -> cocuk iban
  await storage.upsertOdemeSirketi('T111 UPSERT AS', { iban: 'TR_UP', paraBirimi: 'USD', kaynak: 'temsilci' });
  d = (await storage.getOdemeSirketleriTumu()).find(x => x.ad === 'T111 UPSERT AS');
  console.log('upsert cocuk:', d?.ibanlar.length, d?.ibanlar[0]?.paraBirimi); // 1 USD
  // bulk gruplama: ayni firma 2 satir
  const b = await storage.bulkUpsertFirmaIbanRows([
    { ad: 'T111 BULK A.Ş.', paraBirimi: 'USD', iban: 'TR_B1', etiket: 'a', vergiNo: '999' },
    { ad: 'T111 BULK A.Ş.', paraBirimi: 'USD', iban: 'TR_B2', etiket: 'b' },
    { ad: '', paraBirimi: 'TRY', iban: 'TR_X' },
  ]);
  d = (await storage.getOdemeSirketleriTumu()).find(x => x.ad === 'T111 BULK A.Ş.');
  console.log('bulk:', JSON.stringify(b), d?.ibanlar.length); // {eklendi:1,guncellendi:0,atlandi:1} 2
  const sablon = await storage.firmaIbanlariExcelSablonu();
  console.log('sablon buffer:', sablon.length > 0);
  // temizlik
  const { db } = await import('./server/db');
  const { odemeSirketleri, firmaIbanlari } = await import('./shared/schema');
  const { like, inArray } = await import('drizzle-orm');
  const ids = (await db.select({id: odemeSirketleri.id}).from(odemeSirketleri).where(like(odemeSirketleri.ad, 'T111 %'))).map(r=>r.id);
  if (ids.length) await db.delete(firmaIbanlari).where(inArray(firmaIbanlari.firmaId, ids));
  await db.delete(odemeSirketleri).where(like(odemeSirketleri.ad, 'T111 %'));
  console.log('silindi'); process.exit(0);
})();
```
Expected: create 3/2; update replace 1/EUR; legacy köprü 1/TRY/TR_ESKI; upsert 1/USD; bulk {1,0,1}/2; şablon buffer true. Betiği sil. (db import yolunu storage.ts'ten teyit et.)

- [ ] **Step 8: Commit**

```bash
git add shared/schema.ts server/storage.ts
git status   # yalnız bu iki dosya stage'li olmalı
git commit -m "feat(odemeler): firma_ibanlari alt-tablosu + storage (coklu IBAN, sentez-yedegi, sablon) (F1.11 T1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: API (ibanlar gövdesi + çok-satır Excel + şablon ucu)

**Files:**
- Modify: `server/routes.ts`

**Interfaces:**
- Consumes: Task 1 storage (get→Detay ibanlar, create/update ibanlar, bulkUpsertFirmaIbanRows, firmaIbanlariExcelSablonu).

- [ ] **Step 1: POST/PUT gövdelerine ibanlar ekle**

`POST /api/portal/odeme-sirketleri` handler'ını şununla değiştir:

```ts
  app.post("/api/portal/odeme-sirketleri", requireMuhasebe, async (req, res) => {
    try {
      const { ad, vergiNo, notlar, ibanlar } = req.body || {};
      if (!String(ad ?? "").trim()) return res.status(400).json({ error: "Firma adı zorunlu" });
      const yeni = await storage.createOdemeSirketi({ ad: String(ad), vergiNo, notlar, ibanlar: Array.isArray(ibanlar) ? ibanlar : [] });
      if (!yeni) return res.status(409).json({ error: "Bu firma zaten kayıtlı" });
      res.json(yeni);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
```

`PUT /api/portal/odeme-sirketleri/:id` handler'ını şununla değiştir:

```ts
  app.put("/api/portal/odeme-sirketleri/:id", requireMuhasebe, async (req, res) => {
    try {
      const { ad, vergiNo, notlar, aktif, ibanlar } = req.body || {};
      const data: any = {};
      if (ad !== undefined) data.ad = String(ad);
      if (vergiNo !== undefined) data.vergiNo = vergiNo;
      if (notlar !== undefined) data.notlar = notlar;
      if (aktif !== undefined) data.aktif = aktif === true || aktif === "true";
      if (Array.isArray(ibanlar)) data.ibanlar = ibanlar;
      const guncel = await storage.updateOdemeSirketi(req.params.id, data);
      if (!guncel) return res.status(404).json({ error: "Bulunamadı" });
      res.json(guncel);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
```

(GET /odeme-sirketleri ve /tumu handler'ları DEĞİŞMEZ — storage artık ibanlar'lı döndürüyor, JSON'a otomatik yansır.)

- [ ] **Step 2: Excel çok-satır + şablon ucu**

`POST /api/portal/odeme-sirketleri/excel` handler'ındaki `rawData.slice(1).map(...)` + `bulkUpsertOdemeSirketleri` çağrısını şununla değiştir (A:ad B:paraBirimi C:iban D:etiket E:vergiNo F:not):

```ts
      const rows = rawData.slice(1).map((r) => ({
        ad: String(r[0] ?? "").trim(),
        paraBirimi: String(r[1] ?? "").trim(),
        iban: String(r[2] ?? "").trim(),
        etiket: r[3] != null ? String(r[3]).trim() : null,
        vergiNo: r[4] != null ? String(r[4]).trim() : null,
        notlar: r[5] != null ? String(r[5]).trim() : null,
      })).filter((r) => r.ad);
      const sonuc = await storage.bulkUpsertFirmaIbanRows(rows);
      res.json(sonuc);
```

Bu handler'ın üstündeki başlık yorumunu güncelle: `// Excel içe aktarım — her IBAN bir satır: Firma Adı | Para Birimi | IBAN | Etiket | Vergi/TC No | Not`

Aynı excel ucunun HEMEN ARDINA şablon ucunu ekle:

```ts
  // Excel şablonu indir (doğru başlıklar + örnek satırlar)
  app.get("/api/portal/odeme-sirketleri/sablon", requireMuhasebe, async (_req, res) => {
    try {
      const buf = await storage.firmaIbanlariExcelSablonu();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="odeme-firmalari-sablon.xlsx"');
      res.end(buf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: **0 hata.** (create/update artık ibanlar alıyor; eski `iban`/`ibanTry`/`ibanUsd` alanları storage imzasında hâlâ opsiyonel olduğundan başka bir kırılma yok. FirmalarSayfasi.tsx Task 4'e kadar eski gövdeyi gönderiyor — storage köprüsü yutuyor, tsc yeşil.)

- [ ] **Step 4: Dev sunucuyu yeniden başlat + curl duman testi**

Sunucu kodu değişti → yeniden başlat. muhasebe/1234 login cookie jar; sonra:
```
# olustur (2 USD + 1 TRY iban)
curl -s -b /tmp/mj.txt -X POST http://localhost:5000/api/portal/odeme-sirketleri -H "Content-Type: application/json" --data-binary @/tmp/firma.json
#   firma.json: {"ad":"T111 API AS","vergiNo":"1","ibanlar":[{"paraBirimi":"USD","iban":"TR_U1","etiket":"a"},{"paraBirimi":"USD","iban":"TR_U2","etiket":"b"},{"paraBirimi":"TRY","iban":"TR_T1","etiket":null}]}
# tumu'da ibanlar dizisi 3 elemanli mi
curl -s -b /tmp/mj.txt http://localhost:5000/api/portal/odeme-sirketleri/tumu | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const f=JSON.parse(s).find(x=>x.ad==='T111 API AS');console.log('ibanlar:',f.ibanlar.length,'usd:',f.ibanlar.filter(i=>i.paraBirimi==='USD').length)})"
# sablon 200 + xlsx
curl -s -b /tmp/mj.txt -o /tmp/sablon.xlsx -w "%{http_code} %{content_type}\n" http://localhost:5000/api/portal/odeme-sirketleri/sablon
```
Beklenen: oluştur 200; ibanlar:3 usd:2; şablon 200 + spreadsheetml. Test firmasını sil (LIKE 'T111 %', önce firma_ibanlari).

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git status   # yalnız routes.ts
git commit -m "feat(odemeler): firma uclari ibanlar[] govdesi + cok-satir Excel + sablon ucu (F1.11 T2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: portalUtils çoklu-IBAN yardımcıları

**Files:**
- Modify: `client/src/pages/portal/portalUtils.ts`

**Interfaces:**
- Produces (Task 4-5): `firmaIbanlariByPB(f, paraBirimi): FirmaIban[]`, `firmaIbanOzet(f): { paraBirimi: string; adet: number }[]`.

- [ ] **Step 1: Yardımcıları ekle**

`portalUtils.ts` en üst import satırına `FirmaIban, OdemeSirketiDetay` ekle:
```ts
import type { OdemeTalep, Beyanname, OdemeBelge, OdemeSirketi, FirmaIban, OdemeSirketiDetay } from "@shared/schema";
```

Dosyanın SONUNA ekle (mevcut `firmaIban`/`firmaParaBirimleri` KORUNUR — F1.10 tüketicileri Task 4/5'e kadar onları kullanır):

```ts
// Firmanın seçili dövizdeki IBAN'ları (etiketli seçim / otomatik dolum için)
export function firmaIbanlariByPB(f: OdemeSirketiDetay, paraBirimi: string): FirmaIban[] {
  return (f.ibanlar ?? []).filter((i) => i.paraBirimi === paraBirimi);
}

// Firmanın döviz özeti: [{paraBirimi, adet}] (tablo/çip rozetleri) — TRY, USD, EUR sırası
export function firmaIbanOzet(f: OdemeSirketiDetay): { paraBirimi: string; adet: number }[] {
  const sayac: Record<string, number> = {};
  for (const i of f.ibanlar ?? []) sayac[i.paraBirimi] = (sayac[i.paraBirimi] ?? 0) + 1;
  return ["TRY", "USD", "EUR"].filter((pb) => sayac[pb] > 0).map((pb) => ({ paraBirimi: pb, adet: sayac[pb] }));
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: **0 hata.**

- [ ] **Step 3: Saf fonksiyon testi**

Repo köküne geçici `f111t3.ts`, `npx tsx f111t3.ts`, sonra SİL:
```ts
import { firmaIbanlariByPB, firmaIbanOzet } from "./client/src/pages/portal/portalUtils";
const f: any = { ibanlar: [
  { id: "1", paraBirimi: "USD", iban: "TR_U1", etiket: "a" },
  { id: "2", paraBirimi: "USD", iban: "TR_U2", etiket: "b" },
  { id: "3", paraBirimi: "TRY", iban: "TR_T1", etiket: null },
]};
const bos: any = { ibanlar: [] };
console.log("1 USD 2 adet:", firmaIbanlariByPB(f, "USD").length === 2);
console.log("2 TRY 1 adet:", firmaIbanlariByPB(f, "TRY").length === 1);
console.log("3 EUR 0:", firmaIbanlariByPB(f, "EUR").length === 0);
console.log("4 ozet:", JSON.stringify(firmaIbanOzet(f)) === JSON.stringify([{paraBirimi:"TRY",adet:1},{paraBirimi:"USD",adet:2}]));
console.log("5 bos ozet:", firmaIbanOzet(bos).length === 0);
```
Expected: 5/5 true. Betiği sil.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/portal/portalUtils.ts
git status
git commit -m "feat(odemeler): coklu-IBAN yardimcilari firmaIbanlariByPB/firmaIbanOzet (F1.11 T3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Yönetim sayfası — tekrarlanabilir IBAN satırları + şablon indir

**Files:**
- Modify: `client/src/pages/portal/FirmalarSayfasi.tsx`

**Interfaces:**
- Consumes: Task 2 POST/PUT (ibanlar gövdesi) + /sablon; Task 3 `firmaIbanOzet`; `OdemeSirketiDetay`, `FirmaIban` tipleri.

- [ ] **Step 1: Tip + form state (ibanlar listesi)**

`FirmalarSayfasi.tsx` başında değişiklikler:
- import: `import type { OdemeSirketiDetay } from "@shared/schema";` (mevcut `OdemeSirketi` yerine) + `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";`
- `import { firmaIbanOzet } from "./portalUtils";` (mevcut `firmaParaBirimleri` importunu bununla değiştir).
- Query tipi: `useQuery<OdemeSirketiDetay[]>`.
- FirmaFormu tipi + BOS_FORM'u değiştir:

```ts
type IbanSatir = { paraBirimi: string; iban: string; etiket: string };
type FirmaFormu = { id?: string; ad: string; vergiNo: string; notlar: string; ibanlar: IbanSatir[] };
const BOS_FORM: FirmaFormu = { ad: "", vergiNo: "", notlar: "", ibanlar: [] };
```

- [ ] **Step 2: duzenleAc + kaydet + arama + excelSec/sablon**

`duzenleAc`'ı değiştir (çocuk ibanlar'ı forma yükle):
```ts
  const duzenleAc = (f: OdemeSirketiDetay) => {
    setForm({
      id: f.id, ad: f.ad, vergiNo: f.vergiNo ?? "", notlar: f.notlar ?? "",
      ibanlar: (f.ibanlar ?? []).map((i) => ({ paraBirimi: i.paraBirimi, iban: i.iban, etiket: i.etiket ?? "" })),
    });
    setDialogAcik(true);
  };
```

`kaydet` içindeki `govde`'yi değiştir (boş IBAN satırları elenir):
```ts
      const govde = {
        ad: form.ad, vergiNo: form.vergiNo, notlar: form.notlar,
        ibanlar: form.ibanlar.filter((x) => x.iban.trim()).map((x) => ({ paraBirimi: x.paraBirimi, iban: x.iban.trim(), etiket: x.etiket.trim() || null })),
      };
```

`filtreli` useMemo arama filtresini firma adı + vergiNo + ibanlar[].iban ile değiştir:
```ts
    return firmalar.filter(
      (f) =>
        f.ad.toLocaleLowerCase("tr").includes(q) ||
        (f.vergiNo ?? "").toLocaleLowerCase("tr").includes(q) ||
        (f.ibanlar ?? []).some((i) => i.iban.toLocaleLowerCase("tr").includes(q)),
    );
```

`aktifToggle`, `duzenleAc` imzalarında parametre tipini `OdemeSirketiDetay` yap. Şablon indir fonksiyonu ekle (excelSec yakınına):
```ts
  const sablonIndir = () => { window.location.href = "/api/portal/odeme-sirketleri/sablon"; };
```

- [ ] **Step 3: IBAN satır yönetimi (ekle/kaldır/değiştir)**

`kaydet`'in yakınına yardımcılar ekle:
```ts
  const ibanEkle = () => setForm((p) => ({ ...p, ibanlar: [...p.ibanlar, { paraBirimi: "USD", iban: "", etiket: "" }] }));
  const ibanKaldir = (i: number) => setForm((p) => ({ ...p, ibanlar: p.ibanlar.filter((_, idx) => idx !== i) }));
  const ibanDegistir = (i: number, alan: keyof IbanSatir, deger: string) =>
    setForm((p) => ({ ...p, ibanlar: p.ibanlar.map((x, idx) => (idx === i ? { ...x, [alan]: deger } : x)) }));
```

- [ ] **Step 4: Başlığa Şablon İndir butonu**

Kart başlığındaki buton grubuna (Excel Yükle'nin yanına) ekle:
```tsx
            <Button variant="outline" onClick={sablonIndir} data-testid="button-firma-sablon">Şablon İndir</Button>
```

- [ ] **Step 5: Tablo IBAN kolonu → döviz×adet rozetleri**

Tablo IBAN hücresini (mevcut `firmaParaBirimleri(f)...` bloğu) şununla değiştir:
```tsx
                    <td className="p-2">
                      {firmaIbanOzet(f).length > 0 ? (
                        firmaIbanOzet(f).map((o) => (
                          <Badge key={o.paraBirimi} variant="secondary" className="mr-1">{o.paraBirimi}{o.adet > 1 ? ` ×${o.adet}` : ""}</Badge>
                        ))
                      ) : (
                        <Badge variant="destructive" data-testid={`rozet-iban-yok-${f.id}`}>IBAN yok</Badge>
                      )}
                    </td>
```
(Banka kolonu `<th>Banka</th>` + `<td>{f.banka…}` KALDIRILIR — etiket IBAN-düzeyine taşındı; `colSpan={8}` → `colSpan={7}` yapılır.)

- [ ] **Step 6: Dialog — IBAN alanlarını tekrarlanabilir listeyle değiştir**

Dialog'daki iki IBAN grid'i (IBAN TRY/USD) + Banka alanını KALDIR; yerine IBAN listesi bloğu koy (Vergi/TC No ve Not KALIR):
```tsx
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>IBAN'lar</Label>
                <Button type="button" variant="outline" size="sm" onClick={ibanEkle} data-testid="button-iban-ekle">+ IBAN Ekle</Button>
              </div>
              {form.ibanlar.length === 0 && <p className="text-xs text-muted-foreground">Henüz IBAN yok — "+ IBAN Ekle" ile satır ekleyin.</p>}
              {form.ibanlar.map((satir, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2" data-testid={`iban-satir-${i}`}>
                  <div className="w-24">
                    <Select value={satir.paraBirimi} onValueChange={(v) => ibanDegistir(i, "paraBirimi", v)}>
                      <SelectTrigger data-testid={`select-iban-pb-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TRY">TRY</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input className="flex-1 min-w-[180px]" placeholder="TR.." value={satir.iban} onChange={(e) => ibanDegistir(i, "iban", e.target.value)} data-testid={`input-iban-no-${i}`} />
                  <Input className="w-40" placeholder="Etiket (banka)" value={satir.etiket} onChange={(e) => ibanDegistir(i, "etiket", e.target.value)} data-testid={`input-iban-etiket-${i}`} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => ibanKaldir(i)} data-testid={`button-iban-kaldir-${i}`}>Kaldır</Button>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Vergi/TC No</Label>
              <Input value={form.vergiNo} onChange={(e) => setForm({ ...form, vergiNo: e.target.value })} data-testid="input-firma-vergino" />
            </div>
```
(Mevcut Not/Textarea bloğu olduğu gibi kalır.)

- [ ] **Step 7: Tip kontrolü + U+FFFD**

Run: `npm run check` → 0 hata.
Run: `node -e "const s=require('fs').readFileSync('client/src/pages/portal/FirmalarSayfasi.tsx','utf8');console.log('fffd:',s.includes('�'))"` → false.

- [ ] **Step 8: Playwright**

Scratchpad'e `f111t4.js` (muhasebe/1234): Ödeme Firmaları → Elle Ekle → ad "T111 UI A.Ş." → "+ IBAN Ekle" ×3 → satır0 USD/TR_U1/Garanti, satır1 USD/TR_U2/İş Bankası, satır2 TRY/TR_T1 → Kaydet → tabloda "USD ×2" ve "TRY ×1" rozetleri. Düzenle aç → 3 satır dolu gelir → bir satır Kaldır → Kaydet → "USD ×1 TRY ×1". IBAN'sız firma → "IBAN yok" rozeti. Şablon İndir butonu (`button-firma-sablon`) tıklanınca indirme tetiklenir (response 200 kontrolü). Test firmalarını sil (LIKE 'T111 %', önce firma_ibanlari).

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/portal/FirmalarSayfasi.tsx
git status
git commit -m "feat(odemeler): firma yonetiminde tekrarlanabilir IBAN satirlari + doviz-adet rozet + sablon indir (F1.11 T4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Talep formları — etiketli IBAN seçim dropdown'u

**Files:**
- Modify: `client/src/pages/portal/YeniTalepSayfasi.tsx`, `client/src/pages/portal/DogrudanOdemeSayfasi.tsx`

**Interfaces:**
- Consumes: Task 3 `firmaIbanlariByPB`, `firmaIbanOzet`; `OdemeSirketiDetay` tipi.

Her iki dosyada AYNI değişiklik (tek fark testid). Önce YeniTalep, sonra DogrudanOdeme.

- [ ] **Step 1: import + query tipi**

Import satırındaki `firmaIban, firmaParaBirimleri`'yi `firmaIbanlariByPB, firmaIbanOzet` ile değiştir:
```ts
import { formatTarih, formatPara, tamEslesme, benzerFirmalar, firmaIbanlariByPB, firmaIbanOzet } from "./portalUtils";
```
`odemeSirketleri` query tipini `OdemeSirketiDetay[]` yap (import et: `import type { ..., OdemeSirketiDetay } from "@shared/schema";`).

- [ ] **Step 2: IBAN seçenekleri + otomasyon + dropdown state**

`tamFirma`/`benzerOneriler` yakınındaki IBAN `useEffect` + `firmaSec`'i şununla değiştir:

```ts
  // Firmanın seçili dövizdeki IBAN'ları: 1 → otomatik dolar; >1 → dropdown seçimi; 0 → elle
  const ibanSecenekleri = useMemo(
    () => (tamFirma ? firmaIbanlariByPB(tamFirma, paraBirimi) : []),
    [tamFirma, paraBirimi],
  );
  useEffect(() => {
    if (!tamFirma) return;
    const otomatikDoldurulabilir = !iban.trim() || iban === sonIbanOnerisi.current;
    if (!otomatikDoldurulabilir) return;
    if (ibanSecenekleri.length === 1) {
      setIban(ibanSecenekleri[0].iban);
      sonIbanOnerisi.current = ibanSecenekleri[0].iban;
    } else if (sonIbanOnerisi.current && iban === sonIbanOnerisi.current) {
      // 0 veya çok seçenek → önceki otomatik IBAN'ı temizle (çokta insan seçecek)
      setIban("");
      sonIbanOnerisi.current = null;
    }
  }, [tamFirma, paraBirimi, ibanSecenekleri]);

  const ibanSecimi = (secilenIban: string) => {
    setIban(secilenIban);
    sonIbanOnerisi.current = secilenIban;
  };

  const firmaSec = (f: OdemeSirketiDetay) => {
    setAlacakli(f.ad);
    sonAlacakliOnerisi.current = f.ad;
    const secenekler = firmaIbanlariByPB(f, paraBirimi);
    if (secenekler.length === 1) { setIban(secenekler[0].iban); sonIbanOnerisi.current = secenekler[0].iban; }
    // çok/0 → temsilci dropdown'dan/elle seçer
  };
```

- [ ] **Step 3: Çip etiketi + IBAN seçim dropdown UI**

Çip etiketindeki `{f.ad}{firmaParaBirimleri...}` ifadesini döviz-özetiyle değiştir:
```tsx
                        {f.ad}
                        {firmaIbanOzet(f).length > 0
                          ? ` · ${firmaIbanOzet(f).map((o) => `${o.paraBirimi}${o.adet > 1 ? `×${o.adet}` : ""}`).join(", ")}`
                          : " · IBAN yok"}
```

Alacaklı Input'unu saran `div.space-y-2`'nin İÇİNE, benzer-firma çip bloğunun ardına, çoklu-IBAN seçim dropdown'u ekle:
```tsx
                {ibanSecenekleri.length > 1 && (
                  <div className="pt-1" data-testid="alan-iban-secim">
                    <Label className="text-xs text-muted-foreground">Bu firmada {paraBirimi} için {ibanSecenekleri.length} hesap — birini seçin</Label>
                    <Select value={iban} onValueChange={ibanSecimi}>
                      <SelectTrigger data-testid="select-firma-iban"><SelectValue placeholder="IBAN seçin" /></SelectTrigger>
                      <SelectContent>
                        {ibanSecenekleri.map((s) => (
                          <SelectItem key={s.id} value={s.iban}>{s.etiket || "—"} · …{s.iban.slice(-4)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
```
(YeniTalep + DogrudanOdeme'de `Select` zaten import edili; değilse ekle. IBAN Input'u olduğu gibi kalır — dropdown seçince değeri dolar, elle de yazılabilir.)

- [ ] **Step 4: DogrudanOdeme — aynısı**

Step 1-3'ün AYNISINI `DogrudanOdemeSayfasi.tsx`'e uygula (aynı `ibanSecenekleri`/`useEffect`/`ibanSecimi`/`firmaSec` + çip + dropdown). Çip konteyneri testid `benzer-firmalar-dogrudan`; dropdown testid'leri aynı (`alan-iban-secim`, `select-firma-iban`).

- [ ] **Step 5: Tip kontrolü + U+FFFD**

Run: `npm run check` → 0 hata.
Run: `node -e "['client/src/pages/portal/YeniTalepSayfasi.tsx','client/src/pages/portal/DogrudanOdemeSayfasi.tsx'].forEach(f=>{const s=require('fs').readFileSync(f,'utf8');console.log(f,'fffd:',s.includes('�'))})"` → ikisi false.

- [ ] **Step 6: Playwright**

Scratchpad'e `f111t5.js`: muhasebe API'den firma ekle "ASAV LOJİSTİK HİZMETLERİ A.Ş." ibanlar=[USD/TR_USD_A/Garanti, USD/TR_USD_B/İş, TRY/TR_TRY_A/—]. suleyman/1234 YeniTalep: alacaklı tam ASAV, para birimi USD → `alan-iban-secim` + `select-firma-iban` görünür (2 seçenek), IBAN boş; dropdown'dan birini seç → IBAN dolar. Para birimi TRY'ye çevir → dropdown kaybolur, IBAN otomatik TR_TRY_A dolar. Elle IBAN yaz, para birimi değiştir → elle değer korunur. Ekran görüntüleri. ASAV firmasını sil.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/portal/YeniTalepSayfasi.tsx client/src/pages/portal/DogrudanOdemeSayfasi.tsx
git status
git commit -m "feat(odemeler): talep formunda coklu-IBAN etiketli secim dropdown (tek ise otomatik) (F1.11 T5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Uçtan uca E2E + temizlik + build

**Files:**
- Create (scratchpad): `e2e-faz111.js`
- Modify: yok (gerçek hata → raporla, DONE_WITH_CONCERNS)

- [ ] **Step 1: Karma E2E**

`e2e-faz111.js`: (1) muhasebe → firma ekle 2 USD + 1 TRY (etiketli) → tabloda "USD ×2 TRY ×1"; Şablon İndir 200; (2) temsilci → YeniTalep → firmayı seç, USD → dropdown (2 seçenek) → seç → IBAN dolar; TRY → otomatik dolar; (3) Doğrudan Ödeme'de aynı; (4) Excel çok-satır import (2 satırlı bir firma) → tabloda USD ×2. Sonuçları raporla. Başarısızlıkta kod DEĞİŞTİRME.

- [ ] **Step 2: Temizlik**

Test firmalarını (LIKE 'T111 %' / 'ASAV %' / 'E2E %') firma_ibanlari + talepler + belge + disk dosyalarıyla sil. `GET /api/portal/odeme-sirketleri` sonucunu raporla. Sayıları raporla.

- [ ] **Step 3: Kalite kapıları**

Run: `npm run check` → hatasız; `npm run build` → dist/, hatasız. Dev sunucu açık kalır.

- [ ] **Step 4: Rapor**

Commit YOK. Rapora: E2E adım sonuçları + ekran görüntüleri, temizlik sayıları, check/build özeti.

---

## Self-Review Notu

- Spec §3 (şema) → T1 S1; §4 (yardımcılar) → T3; §5 (storage: get/create/update/upsert/bulk/şablon + sentez) → T1 S3-5; §6 (API + şablon ucu) → T2; §7 (yönetim UI) → T4; §8 (form dropdown) → T5; §10 (doğrulama) → T1 S7/T3 S3 (saf), T4/T5/T6 (Playwright), build → T6.
- Tip tutarlılığı: `OdemeSirketiDetay`/`FirmaIban` T1'de tanımlı, T3/T4/T5'te kullanılıyor. `firmaIbanlariByPB`/`firmaIbanOzet` T3'te, T4/T5'te çağrılıyor. `bulkUpsertFirmaIbanRows` T1'de, T2'de çağrılıyor. Testid'ler: `iban-satir-{i}`/`select-iban-pb-{i}`/`input-iban-no-{i}`/`input-iban-etiket-{i}`/`button-iban-ekle`/`button-iban-kaldir-{i}`/`button-firma-sablon`/`alan-iban-secim`/`select-firma-iban`.
- HER GÖREVDE tsc YEŞİL: create/update eski `iban`/`ibanTry`/`ibanUsd` alanlarını korur (çocuk satıra köprüler); get/getTumu `OdemeSirketiDetay[]` döndürür (OdemeSirketi üstkümesi → tüketici kırılmaz); eski `firmaIban`/`firmaParaBirimleri` + `bulkUpsertOdemeSirketleri` korunur (T4/T5/T2'ye kadar). DEPLOY-GÜVENLİ: yazma yolu (create/update/upsert/excel) her ara-durumda çocuk satıra yazar; F1.10 frontend'i eski alan gönderse bile köprü çocuk satır üretir → veri kaybı yok.
- Eski `iban`/`ibanTry`/`ibanUsd`/`banka` kolonları + `firmaIban`/`firmaParaBirimleri`/`bulkUpsertOdemeSirketleri` temizliği: Faz 2 (drop tuzağı; şimdilik yedek/atıl).
