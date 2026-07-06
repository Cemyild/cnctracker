# Ödemeler Portalı Faz 1.10 — Firma IBAN Para Birimi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ödeme firmalarına döviz-bazlı IBAN (TRY + USD); firma seçilince talebin para birimine uyan IBAN otomatik dolar.

**Architecture:** F1.9'un tek `iban` alanını iki kolona genişletir (`ibanTry`, `ibanUsd`); eski `iban` silinmez, TRY geriye-uyum yedeği olur. Alt-tablo yok. Spec: `docs/superpowers/specs/2026-07-06-odemeler-portal-faz110-firma-iban-para-birimi-design.md`.

**Tech Stack:** Drizzle + Express, React 18 + TanStack Query + shadcn/ui, xlsx (mevcut), Playwright (scratchpad).

## Global Constraints

- Türkçe kaynak dosyaları PowerShell Set-Content/Out-File ile ASLA yazılmaz — yalnız Edit/Write; iş sonunda `node -e` ile U+FFFD taraması.
- `git push` YASAK (push = canlı deploy). `git add` daima açık dosya yollarıyla; `KONŞİMENTO ÖRNEKLERİ/`, `uploads/`, `.env`, xlsx dosyaları asla eklenmez.
- Test runner YOK; kalite kapıları `npm run check` (tsc) + saf-fonksiyon node scriptleri + Playwright (scratchpad) + `npm run build`.
- Scratchpad: `C:\Users\cem\AppData\Local\Temp\claude\e--CEM-APPS-cnctracker\f8e48f44-2295-45d2-af94-f819937c735a\scratchpad` (Playwright projeye kurulu DEĞİL; scratchpad'deki mevcut e2e scriptlerinin chromium'u nasıl bulduğuna bak — NODE_PATH ile global gsd-pi paketi — aynı yöntemi kullan). Gerçek PDF: `e:/CEM APPS/cnctracker/KONŞİMENTO ÖRNEKLERİ/ADP.pdf`.
- Dev sunucu: port 5000. Sunucu KODU değişince (schema/storage/routes) tsx hot-reload YAPMAZ — restart: `netstat -ano | findstr :5000` → `taskkill //PID <pid> //F` → arka planda `npm run dev` → 5-8 sn. Frontend Vite ile otomatik tazelenir.
- DB kolon adları snake_case (`iban_try`, `iban_usd`), TS alan adları `ibanTry`/`ibanUsd`.
- PUT/PATCH storage dönüşü null-check → 404.
- Portal test kullanıcıları (lokal dev DB): temsilci `suleyman`, muhasebe `muhasebe`, şifre `1234`. Türkçe içerikli curl gövdesi DOSYADAN `--data-binary`.
- `iban` (F1.9) kolonu ŞEMADA KALIR (drop = drizzle push CI tuzağı); yalnız TRY okuma-yedeği.
- Tutar `paraBirimi` seçicisi (TRY/USD/EUR) DEĞİŞMEZ; yalnız firma IBAN'ları TRY+USD.

---

### Task 1: Şema (iki IBAN kolonu) + storage

**Files:**
- Modify: `shared/schema.ts` (odemeSirketleri +2 kolon), `server/storage.ts` (IStorage + 4 metot)

**Interfaces:**
- Produces (Task 2-5):
  - `OdemeSirketi` tipi `ibanTry: string | null`, `ibanUsd: string | null` alır.
  - `upsertOdemeSirketi(ad: string, opts?: { iban?: string | null; paraBirimi?: string; kaynak?: string }): Promise<void>`
  - `createOdemeSirketi(data: { ad: string; ibanTry?: string | null; ibanUsd?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null }): Promise<OdemeSirketi | null>`
  - `updateOdemeSirketi(id, data: Partial<{ ad; ibanTry; ibanUsd; banka; vergiNo; notlar; aktif }>): Promise<OdemeSirketi | null>`
  - `bulkUpsertOdemeSirketleri(rows: { ad; ibanTry?; ibanUsd?; banka?; vergiNo?; notlar? }[]): Promise<{ eklendi; guncellendi; atlandi }>`

- [ ] **Step 1: Şema — iki kolon ekle**

`shared/schema.ts`'te `odemeSirketleri` içindeki `iban: text("iban"),` satırını şu üç satırla değiştir:

```ts
  iban: text("iban"),            // (F1.9) TRY için geriye-uyum yedeği; yeni yazımlar ibanTry'ye gider
  ibanTry: text("iban_try"),
  ibanUsd: text("iban_usd"),
```

- [ ] **Step 2: storage — IStorage imzalarını güncelle**

`server/storage.ts` IStorage arayüzünde `upsertOdemeSirketi`, `createOdemeSirketi`, `updateOdemeSirketi`, `bulkUpsertOdemeSirketleri` imzalarını şunlarla değiştir:

```ts
  upsertOdemeSirketi(ad: string, opts?: { iban?: string | null; paraBirimi?: string; kaynak?: string }): Promise<void>;
  getOdemeSirketleri(): Promise<OdemeSirketi[]>;
  getOdemeSirketleriTumu(): Promise<OdemeSirketi[]>;
  createOdemeSirketi(data: { ad: string; iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null }): Promise<OdemeSirketi | null>;
  updateOdemeSirketi(id: string, data: Partial<{ ad: string; iban: string | null; ibanTry: string | null; ibanUsd: string | null; banka: string | null; vergiNo: string | null; notlar: string | null; aktif: boolean }>): Promise<OdemeSirketi | null>;
  bulkUpsertOdemeSirketleri(rows: { ad: string; iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null }[]): Promise<{ eklendi: number; guncellendi: number; atlandi: number }>;
```

(`getOdemeSirketleri`/`getOdemeSirketleriTumu` satırlarını olduğu gibi bırak — yalnız 4 imza değişir. **Eski `iban?` alanı imzalarda KORUNUR** — böylece Task 2/4'e kadar routes.ts + FirmalarSayfasi.tsx'in mevcut `iban` çağrıları tsc-yeşil kalır; `iban` geldiğinde `ibanTry`'ye eşlenir, aşağıdaki gövdeler bunu yapar.)

- [ ] **Step 3: storage — upsertOdemeSirketi (paraBirimi→kolon)**

Mevcut `upsertOdemeSirketi` gövdesini şununla değiştir:

```ts
  async upsertOdemeSirketi(
    ad: string,
    opts?: { iban?: string | null; paraBirimi?: string; kaynak?: string },
  ): Promise<void> {
    const temiz = ad.trim();
    if (!temiz) return;
    const ibanTemiz = opts?.iban ? String(opts.iban).trim() : null;
    const values: typeof odemeSirketleri.$inferInsert = { ad: temiz, kaynak: opts?.kaynak ?? "temsilci" };
    if (ibanTemiz) {
      // Talebin para birimine uyan kolona yaz; EUR firma hesabı tutulmuyor → yazma
      if (opts?.paraBirimi === "USD") values.ibanUsd = ibanTemiz;
      else if (!opts?.paraBirimi || opts.paraBirimi === "TRY") values.ibanTry = ibanTemiz;
    }
    // ÇAKIŞMADA yalnız sayaç+sonKullanim artar; IBAN kolonları ASLA ezilmez (F1.9 güvencesi).
    await db
      .insert(odemeSirketleri)
      .values(values)
      .onConflictDoUpdate({
        target: odemeSirketleri.ad,
        set: {
          kullanimSayisi: sql`${odemeSirketleri.kullanimSayisi} + 1`,
          sonKullanim: sql`now()`,
        },
      });
  }
```

- [ ] **Step 4: storage — create/update/bulk (ibanTry+ibanUsd)**

`createOdemeSirketi` gövdesini şununla değiştir:

```ts
  async createOdemeSirketi(data: {
    ad: string; iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null;
  }): Promise<OdemeSirketi | null> {
    const temiz = data.ad.trim();
    if (!temiz) return null;
    const mevcut = await db.select().from(odemeSirketleri).where(eq(odemeSirketleri.ad, temiz)).limit(1);
    if (mevcut.length > 0) return null; // ad çakışması → route 409
    const [yeni] = await db
      .insert(odemeSirketleri)
      .values({
        ad: temiz,
        ibanTry: (data.ibanTry ?? data.iban)?.trim() || null, // eski iban → TRY (geriye uyum köprüsü)
        ibanUsd: data.ibanUsd?.trim() || null,
        banka: data.banka?.trim() || null,
        vergiNo: data.vergiNo?.trim() || null,
        notlar: data.notlar?.trim() || null,
        kaynak: "muhasebe",
      })
      .returning();
    return yeni;
  }
```

`updateOdemeSirketi` gövdesini şununla değiştir:

```ts
  async updateOdemeSirketi(
    id: string,
    data: Partial<{ ad: string; iban: string | null; ibanTry: string | null; ibanUsd: string | null; banka: string | null; vergiNo: string | null; notlar: string | null; aktif: boolean }>,
  ): Promise<OdemeSirketi | null> {
    const set: Record<string, unknown> = {};
    if (data.ad !== undefined) set.ad = data.ad.trim();
    if (data.ibanTry !== undefined) set.ibanTry = data.ibanTry?.trim() || null;
    else if (data.iban !== undefined) set.ibanTry = data.iban?.trim() || null; // eski iban → TRY köprüsü
    if (data.ibanUsd !== undefined) set.ibanUsd = data.ibanUsd?.trim() || null;
    if (data.banka !== undefined) set.banka = data.banka?.trim() || null;
    if (data.vergiNo !== undefined) set.vergiNo = data.vergiNo?.trim() || null;
    if (data.notlar !== undefined) set.notlar = data.notlar?.trim() || null;
    if (data.aktif !== undefined) set.aktif = data.aktif;
    if (Object.keys(set).length === 0) {
      const [mevcut] = await db.select().from(odemeSirketleri).where(eq(odemeSirketleri.id, id)).limit(1);
      return mevcut ?? null;
    }
    const [guncel] = await db.update(odemeSirketleri).set(set).where(eq(odemeSirketleri.id, id)).returning();
    return guncel ?? null;
  }
```

`bulkUpsertOdemeSirketleri` gövdesini şununla değiştir:

```ts
  async bulkUpsertOdemeSirketleri(
    rows: { ad: string; iban?: string | null; ibanTry?: string | null; ibanUsd?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null }[],
  ): Promise<{ eklendi: number; guncellendi: number; atlandi: number }> {
    let eklendi = 0, guncellendi = 0, atlandi = 0;
    for (const row of rows) {
      const temiz = row.ad?.trim();
      if (!temiz) { atlandi++; continue; }
      const mevcut = await db.select().from(odemeSirketleri).where(eq(odemeSirketleri.ad, temiz)).limit(1);
      // Muhasebe Excel'i YETKİLİ: çakışmada dolu gelen alanları GÜNCELLER.
      const alanlar = {
        ibanTry: (row.ibanTry ?? row.iban)?.trim() || null, // eski iban → TRY köprüsü
        ibanUsd: row.ibanUsd?.trim() || null,
        banka: row.banka?.trim() || null,
        vergiNo: row.vergiNo?.trim() || null,
        notlar: row.notlar?.trim() || null,
      };
      if (mevcut.length > 0) {
        const set: Record<string, unknown> = {};
        if (alanlar.ibanTry) set.ibanTry = alanlar.ibanTry;
        if (alanlar.ibanUsd) set.ibanUsd = alanlar.ibanUsd;
        if (alanlar.banka) set.banka = alanlar.banka;
        if (alanlar.vergiNo) set.vergiNo = alanlar.vergiNo;
        if (alanlar.notlar) set.notlar = alanlar.notlar;
        if (Object.keys(set).length > 0) {
          await db.update(odemeSirketleri).set(set).where(eq(odemeSirketleri.ad, temiz));
        }
        guncellendi++;
      } else {
        await db.insert(odemeSirketleri).values({ ad: temiz, ...alanlar, kaynak: "muhasebe" });
        eklendi++;
      }
    }
    return { eklendi, guncellendi, atlandi };
  }
```

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: **0 hata.** Eski `iban?` alanı create/update/bulk imzalarında korunduğundan routes.ts + FirmalarSayfasi.tsx'in mevcut `iban` çağrıları kırılmaz (Task 2/4'e kadar tsc yeşil kalır). Hata çıkarsa storage.ts/schema.ts'i incele — beklenmeyen bir kırılmadır.

- [ ] **Step 6: db:push**

Run: `npm run db:push`
Expected: iki kolon (`iban_try`, `iban_usd`) eklenir; `[✓] Changes applied`. SORU SORARSA (truncate/delete) `--force` KULLANMA; ne sorduğunu rapora yaz, DUR (BLOCKED). Yalnız kolon eklendiği için soru beklenmiyor.

- [ ] **Step 7: storage duman testi (tsx, gerçek DB)**

Scratchpad'e `f110t1.ts` yaz, `npx tsx` ile repo kökünden çalıştır (`import 'dotenv/config'`):
```ts
import 'dotenv/config';
import { storage } from './server/storage';
(async () => {
  const c = await storage.createOdemeSirketi({ ad: 'T110 FIRMA A.Ş.', ibanTry: 'TR_TRY_001', ibanUsd: 'TR_USD_001' });
  console.log('create:', c?.ibanTry, c?.ibanUsd);                    // TR_TRY_001 TR_USD_001
  await storage.upsertOdemeSirketi('T110 UPSERT LTD', { iban: 'TR_USD_NEW', paraBirimi: 'USD', kaynak: 'temsilci' });
  const u = (await storage.getOdemeSirketleriTumu()).find(s => s.ad === 'T110 UPSERT LTD');
  console.log('upsert USD kolonu:', u?.ibanUsd, '| try bos:', u?.ibanTry);  // TR_USD_NEW | null
  await storage.upsertOdemeSirketi('T110 UPSERT LTD', { iban: 'TR_TRY_EZME', paraBirimi: 'TRY' });
  const u2 = (await storage.getOdemeSirketleriTumu()).find(s => s.ad === 'T110 UPSERT LTD');
  console.log('cakismada ezmez:', u2?.ibanUsd, u2?.ibanTry, u2?.kullanimSayisi);  // TR_USD_NEW null 2 (ibanTry EKLENMEZ - conflict yalniz sayac)
  const upd = await storage.updateOdemeSirketi(c!.id, { ibanUsd: 'TR_USD_UPD' });
  console.log('update:', upd?.ibanTry, upd?.ibanUsd);                // TR_TRY_001 TR_USD_UPD
  // temizlik
  const { db } = await import('./server/db');
  const { odemeSirketleri } = await import('./shared/schema');
  const { like } = await import('drizzle-orm');
  await db.delete(odemeSirketleri).where(like(odemeSirketleri.ad, 'T110 %'));
  console.log('silindi'); process.exit(0);
})();
```
Expected: create iki IBAN; upsert USD→ibanUsd (ibanTry null); çakışmada ibanUsd korunur + sayaç 2 + ibanTry hâlâ null (conflict IBAN yazmaz); update ibanUsd değişir ibanTry korunur. Betiği sil. (db import yolunu storage.ts'ten teyit et.)

- [ ] **Step 8: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(odemeler): firma IBAN doviz kolonlari (ibanTry/ibanUsd) + storage (F1.10 T1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: API gövdeleri + upsert paraBirimi + Excel sütunları

**Files:**
- Modify: `server/routes.ts` (POST/PUT/excel gövdeleri; iki upsert çağrısı)

**Interfaces:**
- Consumes: Task 1 storage imzaları (create/update ibanTry+ibanUsd, upsert paraBirimi).

- [ ] **Step 1: POST gövdesi**

`server/routes.ts`'te `POST /api/portal/odeme-sirketleri` handler'ını şununla değiştir:

```ts
  app.post("/api/portal/odeme-sirketleri", requireMuhasebe, async (req, res) => {
    try {
      const { ad, ibanTry, ibanUsd, banka, vergiNo, notlar } = req.body || {};
      if (!String(ad ?? "").trim()) return res.status(400).json({ error: "Firma adı zorunlu" });
      const yeni = await storage.createOdemeSirketi({ ad: String(ad), ibanTry, ibanUsd, banka, vergiNo, notlar });
      if (!yeni) return res.status(409).json({ error: "Bu firma zaten kayıtlı" });
      res.json(yeni);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
```

- [ ] **Step 2: PUT gövdesi**

`PUT /api/portal/odeme-sirketleri/:id` handler'ını şununla değiştir:

```ts
  app.put("/api/portal/odeme-sirketleri/:id", requireMuhasebe, async (req, res) => {
    try {
      const { ad, ibanTry, ibanUsd, banka, vergiNo, notlar, aktif } = req.body || {};
      const data: any = {};
      if (ad !== undefined) data.ad = String(ad);
      if (ibanTry !== undefined) data.ibanTry = ibanTry;
      if (ibanUsd !== undefined) data.ibanUsd = ibanUsd;
      if (banka !== undefined) data.banka = banka;
      if (vergiNo !== undefined) data.vergiNo = vergiNo;
      if (notlar !== undefined) data.notlar = notlar;
      if (aktif !== undefined) data.aktif = aktif === true || aktif === "true";
      const guncel = await storage.updateOdemeSirketi(req.params.id, data);
      if (!guncel) return res.status(404).json({ error: "Bulunamadı" });
      res.json(guncel);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
```

- [ ] **Step 3: Excel sütun düzeni**

`POST /api/portal/odeme-sirketleri/excel` handler'ındaki `rawData.slice(1).map(...)` bloğunu şununla değiştir (A:ad B:ibanTry C:ibanUsd D:banka E:vergiNo F:not):

```ts
      const rows = rawData.slice(1).map((r) => ({
        ad: String(r[0] ?? "").trim(),
        ibanTry: r[1] != null ? String(r[1]).trim() : null,
        ibanUsd: r[2] != null ? String(r[2]).trim() : null,
        banka: r[3] != null ? String(r[3]).trim() : null,
        vergiNo: r[4] != null ? String(r[4]).trim() : null,
        notlar: r[5] != null ? String(r[5]).trim() : null,
      })).filter((r) => r.ad);
```

Bu handler'ın üstündeki başlık yorumunu da güncelle: `// Excel içe aktarım — başlıklar: Firma Adı | IBAN TRY | IBAN USD | Banka | Vergi/TC No | Not`

- [ ] **Step 4: İki upsert çağrısına paraBirimi ekle**

`server/routes.ts`'te `storage.upsertOdemeSirketi(alacakliStr, {` ile başlayan İKİ yeri bul (biri `POST /talepler`, biri `POST /dogrudan-odeme`). Her ikisinde `iban:` satırının ardına `paraBirimi:` ekle. Talepler rotası (kaynak depo/temsilci):

```ts
      storage.upsertOdemeSirketi(alacakliStr, {
        iban: iban ? String(iban).trim() : null,
        paraBirimi: ["TRY", "USD", "EUR"].includes(String(paraBirimi)) ? String(paraBirimi) : "TRY",
        kaynak: odemeTipi === "depo_teminat" ? "depo" : "temsilci",
      }).catch((e) => console.warn(`[odeme-sirketleri] upsert hatası: ${e.message}`));
```

Doğrudan ödeme rotası (kaynak muhasebe):

```ts
        storage.upsertOdemeSirketi(alacakliStr, {
          iban: iban ? String(iban).trim() : null,
          paraBirimi: ["TRY", "USD", "EUR"].includes(String(paraBirimi)) ? String(paraBirimi) : "TRY",
          kaynak: "muhasebe",
        }).catch((e) => console.warn(`[odeme-sirketleri] upsert hatası: ${e.message}`));
```

(`paraBirimi` her iki handler'ın gövdesinde zaten destructure edilmiş — teyit et; değilse `req.body`'den al.)

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: **0 hata.** (FirmalarSayfasi.tsx `iban` govde'siyle create/update'in eski `iban?` alanını kullanmaya devam ediyor — Task 4 explicit ibanTry/ibanUsd'ye geçirecek; şimdilik tsc yeşil.)

- [ ] **Step 6: Dev sunucuyu yeniden başlat + curl duman testi**

Sunucu kodu değişti → yeniden başlat (netstat/taskkill/npm run dev). muhasebe/1234 login cookie jar; sonra:
```
# oluştur (iki IBAN)
curl -s -b /tmp/mj.txt -X POST http://localhost:5000/api/portal/odeme-sirketleri -H "Content-Type: application/json" --data-binary @/tmp/firma.json
#   firma.json: {"ad":"T110 API AS","ibanTry":"TR_T","ibanUsd":"TR_U","banka":"X"}
# tümü listesinde ibanTry+ibanUsd döner mi
curl -s -b /tmp/mj.txt http://localhost:5000/api/portal/odeme-sirketleri/tumu | grep -o "TR_T.*TR_U" | head -1
```
Beklenen: oluştur 200; /tumu yanıtında ibanTry=TR_T + ibanUsd=TR_U görünür. Test firmasını sil (LIKE 'T110 %').

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts
git commit -m "feat(odemeler): firma uclari iki IBAN govdesi + upsert paraBirimi + Excel sutunlari (F1.10 T2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: portalUtils döviz→IBAN yardımcıları

**Files:**
- Modify: `client/src/pages/portal/portalUtils.ts` (dosya sonuna 2 fonksiyon)

**Interfaces:**
- Produces (Task 4-5): `firmaIban(f, paraBirimi): string | null`, `firmaParaBirimleri(f): string[]`.

- [ ] **Step 1: Yardımcıları ekle**

`portalUtils.ts`'in SONUNA ekle:

```ts
// Döviz-bazlı firma IBAN'ı — talebin para birimine uyan hesabı verir.
// TRY: yeni ibanTry, yoksa F1.9'un eski tekil iban'ı (geriye uyum). EUR: firma
// EUR hesabı tutmuyor → null.
export function firmaIban(
  f: Pick<OdemeSirketi, "ibanTry" | "ibanUsd" | "iban">,
  paraBirimi: string,
): string | null {
  if (paraBirimi === "USD") return f.ibanUsd || null;
  if (paraBirimi === "EUR") return null;
  return f.ibanTry || f.iban || null;
}

// Firmanın IBAN'ı olan döviz kodları (rozet/çip etiketi için).
export function firmaParaBirimleri(
  f: Pick<OdemeSirketi, "ibanTry" | "ibanUsd" | "iban">,
): string[] {
  const r: string[] = [];
  if (f.ibanTry || f.iban) r.push("TRY");
  if (f.ibanUsd) r.push("USD");
  return r;
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: **0 hata** (portalUtils salt ekleme; mevcut hata yok).

- [ ] **Step 3: Saf fonksiyon testi**

Repo köküne geçici `f110t3.ts`, `npx tsx f110t3.ts`, sonra SİL:
```ts
import { firmaIban, firmaParaBirimleri } from "./client/src/pages/portal/portalUtils";
const a: any = { ibanTry: "TR_T", ibanUsd: "TR_U", iban: null };
const b: any = { ibanTry: null, ibanUsd: null, iban: "TR_ESKI" };  // F1.9 eski kayıt
const c: any = { ibanTry: null, ibanUsd: "TR_U", iban: null };
console.log("1 USD:", firmaIban(a, "USD") === "TR_U");
console.log("2 TRY:", firmaIban(a, "TRY") === "TR_T");
console.log("3 TRY-yedek:", firmaIban(b, "TRY") === "TR_ESKI");    // eski iban yedeği
console.log("4 EUR-null:", firmaIban(a, "EUR") === null);
console.log("5 USD-yok:", firmaIban(b, "USD") === null);
console.log("6 pb-listesi:", JSON.stringify(firmaParaBirimleri(a)) === JSON.stringify(["TRY","USD"]));
console.log("7 pb-yedek:", JSON.stringify(firmaParaBirimleri(b)) === JSON.stringify(["TRY"]));
console.log("8 pb-sadeceUSD:", JSON.stringify(firmaParaBirimleri(c)) === JSON.stringify(["USD"]));
```
Expected: 8/8 true. Betiği sil.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/portal/portalUtils.ts
git commit -m "feat(odemeler): doviz-bazli firma IBAN yardimcilari - firmaIban/firmaParaBirimleri (F1.10 T3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Yönetim sayfası — iki IBAN alanı + döviz rozetleri

**Files:**
- Modify: `client/src/pages/portal/FirmalarSayfasi.tsx`

**Interfaces:**
- Consumes: Task 2 POST/PUT (ibanTry/ibanUsd gövdesi), Task 3 `firmaParaBirimleri`.

- [ ] **Step 1: FirmaFormu tipini ve BOS_FORM'u güncelle**

`FirmaFormu` (satır ~16) ve `BOS_FORM`'u değiştir:

```ts
type FirmaFormu = { id?: string; ad: string; ibanTry: string; ibanUsd: string; banka: string; vergiNo: string; notlar: string };
const BOS_FORM: FirmaFormu = { ad: "", ibanTry: "", ibanUsd: "", banka: "", vergiNo: "", notlar: "" };
```

- [ ] **Step 2: import + duzenleAc + kaydet + arama**

`firmaParaBirimleri`'ni import et (mevcut import satırı yoksa `@shared/schema`/queryClient importlarının yanına):
Not: `firmaParaBirimleri` `./portalUtils`'ten gelir — dosya başına ekle:
```ts
import { firmaParaBirimleri } from "./portalUtils";
```

`duzenleAc` (satır ~44) içindeki `setForm({...})` çağrısını şununla değiştir (TRY alanı eski `iban` yedeğiyle önden dolar):
```ts
    setForm({ id: f.id, ad: f.ad, ibanTry: f.ibanTry ?? f.iban ?? "", ibanUsd: f.ibanUsd ?? "", banka: f.banka ?? "", vergiNo: f.vergiNo ?? "", notlar: f.notlar ?? "" });
```

`kaydet` içindeki `govde` (satır ~57) tanımını değiştir:
```ts
      const govde = { ad: form.ad, ibanTry: form.ibanTry, ibanUsd: form.ibanUsd, banka: form.banka, vergiNo: form.vergiNo, notlar: form.notlar };
```

`filtreli` useMemo içindeki arama filtresinde `(f.iban ?? "")...` satırını iki IBAN'ı da kapsayacak şekilde değiştir:
```ts
        (f.ibanTry ?? "").toLocaleLowerCase("tr").includes(q) ||
        (f.ibanUsd ?? "").toLocaleLowerCase("tr").includes(q) ||
        (f.iban ?? "").toLocaleLowerCase("tr").includes(q) ||
```

- [ ] **Step 3: Tablo IBAN kolonu → döviz rozetleri**

Tablo satırındaki IBAN hücresini (şu an `{f.iban ? f.iban : <Badge ...>IBAN yok</Badge>}`) şununla değiştir:

```tsx
                    <td className="p-2">
                      {firmaParaBirimleri(f).length > 0 ? (
                        firmaParaBirimleri(f).map((pb) => (
                          <Badge key={pb} variant="secondary" className="mr-1">{pb}</Badge>
                        ))
                      ) : (
                        <Badge variant="destructive" data-testid={`rozet-iban-yok-${f.id}`}>IBAN yok</Badge>
                      )}
                    </td>
```

- [ ] **Step 4: Dialog — tek IBAN alanı yerine iki alan**

Dialog'daki tek IBAN `Input` bloğunu (Label "IBAN" + `input-firma-iban`) şu iki-alanlı grid ile değiştir:

```tsx
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>IBAN (TRY)</Label>
                <Input value={form.ibanTry} onChange={(e) => setForm({ ...form, ibanTry: e.target.value })} placeholder="TR.." data-testid="input-firma-iban-try" />
              </div>
              <div className="space-y-1">
                <Label>IBAN (USD)</Label>
                <Input value={form.ibanUsd} onChange={(e) => setForm({ ...form, ibanUsd: e.target.value })} placeholder="TR.." data-testid="input-firma-iban-usd" />
              </div>
            </div>
```

- [ ] **Step 5: Tip kontrolü + U+FFFD**

Run: `npm run check` → 0 hata (artık tüm `iban` referansları temizlendi).
Run: `node -e "const s=require('fs').readFileSync('client/src/pages/portal/FirmalarSayfasi.tsx','utf8');console.log('fffd:',s.includes('�'))"` → false.

- [ ] **Step 6: Playwright — yönetim akışı**

Scratchpad'e `f110t4.js` (muhasebe/1234): "Ödeme Firmaları" → Elle Ekle: ad "T110 UI FIRMA A.Ş.", `input-firma-iban-try`="TR_TRY_UI", `input-firma-iban-usd`="TR_USD_UI" → kaydet → tabloda satırda "TRY" ve "USD" rozetleri görünür (rozet-iban-yok YOK). İkinci firma yalnız TRY IBAN → satırda "TRY" var "USD" yok. IBAN'sız firma → rozet-iban-yok. Düzenle → USD ekle → "USD" rozeti belirir. Ekran görüntüleri. Test firmalarını sil (LIKE 'T110 %').

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/portal/FirmalarSayfasi.tsx
git commit -m "feat(odemeler): firma yonetiminde iki IBAN alani + doviz rozetleri (F1.10 T4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Talep formları — döviz-bazlı IBAN otomasyonu

**Files:**
- Modify: `client/src/pages/portal/YeniTalepSayfasi.tsx`, `DogrudanOdemeSayfasi.tsx`

**Interfaces:**
- Consumes: Task 3 `firmaIban`, `firmaParaBirimleri`; mevcut `paraBirimi`/`iban`/`sonIbanOnerisi`/`tamFirma`/`firmaSec`.

Her iki dosyada AYNI değişiklik (tek fark testid'ler). Aşağıdaki adımlar önce YeniTalep, sonra DogrudanOdeme.

- [ ] **Step 1: import**

Mevcut `import { ... tamEslesme, benzerFirmalar } from "./portalUtils";` satırına `firmaIban, firmaParaBirimleri` ekle:
```ts
import { formatTarih, formatPara, tamEslesme, benzerFirmalar, firmaIban, firmaParaBirimleri } from "./portalUtils";
```
(DogrudanOdeme'de mevcut import ne içeriyorsa ona `firmaIban, firmaParaBirimleri` ekle.)

- [ ] **Step 2: IBAN otomasyon useEffect'ini döviz-bazlı yap**

Mevcut IBAN `useEffect` bloğunu (şu an `if (tamFirma.iban) { setIban(tamFirma.iban); ... }` + `}, [tamFirma];`) şununla değiştir:

```ts
  useEffect(() => {
    if (!tamFirma) return;
    const otoIban = firmaIban(tamFirma, paraBirimi);
    // Yalnız otomatik doldurulmuş (veya boş) IBAN'a dokun — elle yazılanı ezme
    const otomatikDoldurulabilir = !iban.trim() || iban === sonIbanOnerisi.current;
    if (!otomatikDoldurulabilir) return;
    if (otoIban) {
      setIban(otoIban);
      sonIbanOnerisi.current = otoIban;
    } else if (sonIbanOnerisi.current && iban === sonIbanOnerisi.current) {
      // Seçili döviz için IBAN yok → önceki otomatik IBAN'ı temizle (yanlış döviz kalmasın)
      setIban("");
      sonIbanOnerisi.current = null;
    }
  }, [tamFirma, paraBirimi]); // firma VEYA para birimi değişince
```

- [ ] **Step 3: firmaSec döviz-bazlı**

Mevcut `firmaSec` içindeki `if (f.iban) { setIban(f.iban); sonIbanOnerisi.current = f.iban; }` satırını şununla değiştir:

```ts
    const secIban = firmaIban(f, paraBirimi);
    if (secIban) { setIban(secIban); sonIbanOnerisi.current = secIban; }
```

- [ ] **Step 4: Çip etiketi döviz göster**

Çip içindeki `{f.ad}{f.iban ? ` · …${f.iban.slice(-4)}` : " · IBAN yok"}` ifadesini şununla değiştir:

```tsx
                        {f.ad}
                        {firmaParaBirimleri(f).length > 0 ? ` · ${firmaParaBirimleri(f).join(", ")}` : " · IBAN yok"}
```

- [ ] **Step 5: DogrudanOdeme — aynısı**

Step 1-4'ün AYNISINI `DogrudanOdemeSayfasi.tsx`'e uygula (aynı useEffect, firmaSec, çip; testid'ler o dosyanınki: `benzer-firmalar-dogrudan` konteyner, çipler yine `cip-firma-{i}`; `paraBirimi`/`iban`/`sonIbanOnerisi` state'leri orada da var).

- [ ] **Step 6: Tip kontrolü + U+FFFD**

Run: `npm run check` → 0 hata.
Run: `node -e "['client/src/pages/portal/YeniTalepSayfasi.tsx','client/src/pages/portal/DogrudanOdemeSayfasi.tsx'].forEach(f=>{const s=require('fs').readFileSync(f,'utf8');console.log(f,'fffd:',s.includes('�'))})"` → ikisi false.

- [ ] **Step 7: Playwright — döviz-bazlı otomasyon**

Scratchpad'e `f110t5.js`: muhasebe API'den firma ekle — "ASAV LOJİSTİK HİZMETLERİ A.Ş." ibanTry="TR_TRY_ASAV" ibanUsd="TR_USD_ASAV". suleyman/1234 YeniTalep:
1. alacaklı tam "ASAV LOJİSTİK HİZMETLERİ A.Ş.", para birimi TRY → IBAN "TR_TRY_ASAV" dolar.
2. para birimini USD yap → IBAN "TR_USD_ASAV" olur.
3. para birimini EUR yap → IBAN temizlenir (firma EUR hesabı yok).
4. (opsiyonel) yalnız-TRY'li ikinci firma seçip USD'ye çevir → IBAN temizlenir.
Ekran görüntüleri. ASAV firmalarını sil.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/portal/YeniTalepSayfasi.tsx client/src/pages/portal/DogrudanOdemeSayfasi.tsx
git commit -m "feat(odemeler): talep formunda doviz-bazli IBAN otomasyonu + cip doviz etiketi (F1.10 T5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Uçtan uca E2E + temizlik + build

**Files:**
- Create (scratchpad): `e2e-faz110.js`
- Modify: yok (gerçek hata → raporla, DONE_WITH_CONCERNS)

- [ ] **Step 1: Karma E2E**

`e2e-faz110.js`: (1) muhasebe → "Ödeme Firmaları" → firma ekle ibanTry+ibanUsd → tabloda "TRY USD" rozetleri; (2) temsilci suleyman → YeniTalep → o firmayı alacaklıya yaz → TRY iken TRY IBAN, USD'ye çevir → USD IBAN, EUR'ya çevir → temizlenir; (3) Doğrudan Ödeme'de (muhasebe) aynı döviz-bazlı otomasyonun çalıştığını doğrula. Sonuçları raporla. Başarısızlıkta kod DEĞİŞTİRME.

- [ ] **Step 2: Temizlik**

Test firmalarını (LIKE 'ASAV %' / 'T110 %' / 'E2E %') + oluşan talepleri bağlı belge+diskteki dosyalarla sil (F1.9 T6 node kalıbı). `GET /api/portal/odeme-sirketleri` → [] (prod kaydı yoksa). Sayıları raporla.

- [ ] **Step 3: Kalite kapıları**

Run: `npm run check` → hatasız; `npm run build` → dist/, hatasız. Dev sunucu açık kalır.

- [ ] **Step 4: Rapor**

Commit YOK. Rapora: E2E adım sonuçları + ekran görüntüleri, temizlik sayıları, check/build özeti.

---

## Self-Review Notu

- Spec §3 (şema) → T1 S1; §4 (yardımcılar) → T3; §5 (storage) → T1 S3-4; §6 (API) → T2; §7 (yönetim UI) → T4; §8 (form otomasyonu) → T5; §10 (doğrulama) → T1 S7/T3 S3 (saf), T4/T5/T6 (Playwright), build → T6.
- Tip tutarlılığı: `upsertOdemeSirketi(ad, {iban, paraBirimi, kaynak})`, `createOdemeSirketi({ibanTry,ibanUsd,...})`, `firmaIban(f, pb)`, `firmaParaBirimleri(f)` T1/T3'te tanımlı, T2/T4/T5'te aynen çağrılıyor. Testid'ler: `input-firma-iban-try/usd`, `rozet-iban-yok-{id}` (korunur), `cip-firma-{i}` (korunur).
- KRİTİK: eski `iban` kolonu şemada kalır (drop-prompt tuzağı yok); TRY okuma-yedeği (T3 firmaIban). upsert çakışmada IBAN ezmez (T1 S3 + S7 assert). db:push yalnız 2 kolon ekler.
- Görevler arası tsc HER GÖREVDE YEŞİL: create/update/bulk imzaları eski `iban?`'ı korur (ibanTry'ye köprüler), böylece routes.ts/FirmalarSayfasi.tsx'in mevcut `iban` çağrıları T2/T4'e kadar kırılmaz. (Eski `iban` param'ının tümüyle kaldırılması Faz 2 temizliği.)
