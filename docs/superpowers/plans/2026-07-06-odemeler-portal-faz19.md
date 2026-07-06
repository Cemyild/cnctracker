# Ödemeler Portalı Faz 1.9 — Firma Yönetimi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Muhasebeye ödeme yapılacak firmaları (IBAN vb.) elle/Excel ile yönetebileceği bir sayfa; temsilci talep açarken firmadan seçince IBAN otomatik dolar, benzer kayıtlar öneri olarak çıkar.

**Architecture:** Mevcut `odeme_sirketleri` tablosu genişletilir (yeni tablo/göç yok). Muhasebe-only yönetim sayfası + `requireMuhasebe` uçları + Excel upsert. Talep formlarında (YeniTalep + DogrudanOdeme) tam eşleşmede IBAN otomasyonu, tam olmayan eşleşmede istemci-taraflı Türkçe-normalize benzerlik çipleri. Spec: `docs/superpowers/specs/2026-07-06-odemeler-portal-faz19-firma-yonetimi-design.md`.

**Tech Stack:** Drizzle + Express (mevcut), React 18 + TanStack Query + shadcn/ui, `xlsx` (mevcut import), Playwright (scratchpad).

## Global Constraints

- Türkçe kaynak dosyaları PowerShell Set-Content/Out-File ile ASLA yazılmaz — yalnız Edit/Write; iş sonunda `node -e` ile U+FFFD taraması.
- `git push` YASAK (push = canlı deploy). `git add` daima açık dosya yollarıyla; `KONŞİMENTO ÖRNEKLERİ/`, `uploads/`, `.env`, xlsx dosyaları asla eklenmez.
- Repoda test runner YOK; kalite kapıları `npm run check` (tsc) + saf-fonksiyon node scriptleri + Playwright (scratchpad) + `npm run build`.
- Scratchpad: `C:\Users\cem\AppData\Local\Temp\claude\e--CEM-APPS-cnctracker\f8e48f44-2295-45d2-af94-f819937c735a\scratchpad` (Playwright + chromium kurulu; gerçek PDF: `e:/CEM APPS/cnctracker/KONŞİMENTO ÖRNEKLERİ/ADP.pdf`).
- Dev sunucu: port 5000. Sunucu KODU değişince (schema/storage/routes) tsx hot-reload YAPMAZ — restart gerekir: `netstat -ano | findstr :5000` → `taskkill //PID <pid> //F` → arka planda `npm run dev` → 5-8 sn bekle. Frontend değişikliği Vite middleware ile otomatik tazelenir.
- DB kolon adları snake_case, TS alan adları Türkçe-karaktersiz (CLAUDE.md kuralı). Tarihler `text` YYYY-MM-DD; `odeme_sirketleri.sonKullanim` DB-tarafı `now()` timestamp'tir (kullanıcıya gösterilmez).
- PUT/PATCH storage dönüşü null-check → `res.status(404).json({ error: "Bulunamadı" })`.
- Portal test kullanıcıları (lokal dev DB): temsilci `suleyman` / muhasebe `muhasebe`, şifre `1234`.
- `requirePortal` + `requireMuhasebe` `./portalAuth`'tan import edilir (routes.ts:172'de zaten var).
- `ad` case-sensitive unique KALIR; normalize yalnız eşleştirmede kullanılır, saklama değişmez.

---

### Task 1: Şema genişletme + storage metotları

**Files:**
- Modify: `shared/schema.ts:1069-1083` (odemeSirketleri tablosu + insert şeması)
- Modify: `server/storage.ts:400-401` (IStorage arayüzü), `server/storage.ts:3515-3537` (upsert/get impl)

**Interfaces:**
- Consumes: yok (mevcut `odemeSirketleri` tablosu, `db`, `sql`, `eq`, `desc`, `asc` drizzle-orm importları — `asc` yoksa import satırına eklenecek).
- Produces:
  - Tip `OdemeSirketi` (genişlemiş: `iban/banka/vergiNo/notlar/kaynak` string|null alanları).
  - `upsertOdemeSirketi(ad: string, opts?: { iban?: string | null; kaynak?: string }): Promise<void>`
  - `getOdemeSirketleri(): Promise<OdemeSirketi[]>` (aktif, kullanım desc, limit 100 — imza değişmez)
  - `getOdemeSirketleriTumu(): Promise<OdemeSirketi[]>` (tümü, ad asc)
  - `createOdemeSirketi(data: { ad: string; iban?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null }): Promise<OdemeSirketi | null>` (ad çakışırsa null)
  - `updateOdemeSirketi(id: string, data: Partial<{ ad: string; iban: string | null; banka: string | null; vergiNo: string | null; notlar: string | null; aktif: boolean }>): Promise<OdemeSirketi | null>` (yoksa null)
  - `bulkUpsertOdemeSirketleri(rows: { ad: string; iban?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null }[]): Promise<{ eklendi: number; guncellendi: number; atlandi: number }>`

- [ ] **Step 1: Şema — yeni kolonları ekle**

`shared/schema.ts`'te `odemeSirketleri` tanımını (satır 1069-1076) tam olarak şununla değiştir:

```ts
// Ödeme yapılacak firmalar — muhasebe elle/Excel girer; temsilci talepte seçer.
// Depo onaylarından ve F1.8 çoklu-kalem gönderiminden de otomatik birikir.
export const odemeSirketleri = pgTable("odeme_sirketleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ad: text("ad").notNull().unique(),
  iban: text("iban"),
  banka: text("banka"),
  vergiNo: text("vergi_no"),
  notlar: text("notlar"), // "not" SQL rezerve kelimesi — "notlar" kullanılır
  kaynak: text("kaynak").notNull().default("muhasebe"), // muhasebe | temsilci | depo
  kullanimSayisi: integer("kullanim_sayisi").notNull().default(1),
  sonKullanim: timestamp("son_kullanim").defaultNow(),
  aktif: boolean("aktif").notNull().default(true),
});
```

`insertOdemeSirketiSchema` (satır 1078-1081) aynen kalır (`createInsertSchema` yeni alanları otomatik alır; `id` + `sonKullanim` omit).

- [ ] **Step 2: Tip kontrolü (şema)**

Run: `npm run check`
Expected: hata yok (yeni alanlar `OdemeSirketi` tipine otomatik yansır; henüz kullanılmıyor).

- [ ] **Step 3: storage — import + arayüz**

`server/storage.ts:36` drizzle-orm import satırında `asc` ve `eq`/`desc`/`sql` ZATEN mevcut (`import { eq, and, sql, inArray, desc, isNotNull, or, asc, ne, count, notInArray } from "drizzle-orm";`) — bu satıra DOKUNMA, yeni import gerekmiyor.

`IStorage` arayüzünde (satır 400-401) mevcut iki satırı şu blokla değiştir:

```ts
  upsertOdemeSirketi(ad: string, opts?: { iban?: string | null; kaynak?: string }): Promise<void>;
  getOdemeSirketleri(): Promise<OdemeSirketi[]>;
  getOdemeSirketleriTumu(): Promise<OdemeSirketi[]>;
  createOdemeSirketi(data: { ad: string; iban?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null }): Promise<OdemeSirketi | null>;
  updateOdemeSirketi(id: string, data: Partial<{ ad: string; iban: string | null; banka: string | null; vergiNo: string | null; notlar: string | null; aktif: boolean }>): Promise<OdemeSirketi | null>;
  bulkUpsertOdemeSirketleri(rows: { ad: string; iban?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null }[]): Promise<{ eklendi: number; guncellendi: number; atlandi: number }>;
```

- [ ] **Step 4: storage — implementasyon**

`server/storage.ts`'te mevcut `upsertOdemeSirketi` + `getOdemeSirketleri` (satır 3515-3537) bloğunu şununla değiştir:

```ts
  async upsertOdemeSirketi(
    ad: string,
    opts?: { iban?: string | null; kaynak?: string },
  ): Promise<void> {
    const temiz = ad.trim();
    if (!temiz) return;
    const ibanTemiz = opts?.iban ? String(opts.iban).trim() : null;
    // Insert'te iban+kaynak yazılır; ÇAKIŞMADA yalnız sayaç+sonKullanim artar
    // (muhasebenin girdiği iban/banka/vergiNo/kaynak ASLA ezilmez).
    await db
      .insert(odemeSirketleri)
      .values({ ad: temiz, iban: ibanTemiz, kaynak: opts?.kaynak ?? "temsilci" })
      .onConflictDoUpdate({
        target: odemeSirketleri.ad,
        set: {
          kullanimSayisi: sql`${odemeSirketleri.kullanimSayisi} + 1`,
          sonKullanim: sql`now()`,
        },
      });
  }

  async getOdemeSirketleri(): Promise<OdemeSirketi[]> {
    return db
      .select()
      .from(odemeSirketleri)
      .where(eq(odemeSirketleri.aktif, true))
      .orderBy(desc(odemeSirketleri.kullanimSayisi), desc(odemeSirketleri.sonKullanim))
      .limit(100);
  }

  async getOdemeSirketleriTumu(): Promise<OdemeSirketi[]> {
    return db.select().from(odemeSirketleri).orderBy(asc(odemeSirketleri.ad));
  }

  async createOdemeSirketi(data: {
    ad: string; iban?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null;
  }): Promise<OdemeSirketi | null> {
    const temiz = data.ad.trim();
    if (!temiz) return null;
    const mevcut = await db.select().from(odemeSirketleri).where(eq(odemeSirketleri.ad, temiz)).limit(1);
    if (mevcut.length > 0) return null; // ad çakışması → route 409
    const [yeni] = await db
      .insert(odemeSirketleri)
      .values({
        ad: temiz,
        iban: data.iban?.trim() || null,
        banka: data.banka?.trim() || null,
        vergiNo: data.vergiNo?.trim() || null,
        notlar: data.notlar?.trim() || null,
        kaynak: "muhasebe",
      })
      .returning();
    return yeni;
  }

  async updateOdemeSirketi(
    id: string,
    data: Partial<{ ad: string; iban: string | null; banka: string | null; vergiNo: string | null; notlar: string | null; aktif: boolean }>,
  ): Promise<OdemeSirketi | null> {
    const set: Record<string, unknown> = {};
    if (data.ad !== undefined) set.ad = data.ad.trim();
    if (data.iban !== undefined) set.iban = data.iban?.trim() || null;
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

  async bulkUpsertOdemeSirketleri(
    rows: { ad: string; iban?: string | null; banka?: string | null; vergiNo?: string | null; notlar?: string | null }[],
  ): Promise<{ eklendi: number; guncellendi: number; atlandi: number }> {
    let eklendi = 0, guncellendi = 0, atlandi = 0;
    for (const row of rows) {
      const temiz = row.ad?.trim();
      if (!temiz) { atlandi++; continue; }
      const mevcut = await db.select().from(odemeSirketleri).where(eq(odemeSirketleri.ad, temiz)).limit(1);
      // Muhasebe Excel'i YETKİLİ: çakışmada dolu gelen alanları GÜNCELLER.
      const alanlar = {
        iban: row.iban?.trim() || null,
        banka: row.banka?.trim() || null,
        vergiNo: row.vergiNo?.trim() || null,
        notlar: row.notlar?.trim() || null,
      };
      if (mevcut.length > 0) {
        const set: Record<string, unknown> = {};
        if (alanlar.iban) set.iban = alanlar.iban;
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

- [ ] **Step 5: Şemayı DB'ye it**

Run: `npm run db:push`
Expected: yeni kolonlar (`iban, banka, vergi_no, notlar, kaynak`) eklenir; `[✓] Changes applied`. **Soru sorarsa** (truncate/delete onayı) `--force` KULLANMA — ne sorduğunu rapora yaz ve DUR (BLOCKED). (Yalnız kolon EKLENDİĞİ için soru beklenmiyor.)

- [ ] **Step 6: Tip kontrolü**

Run: `npm run check`
Expected: hata yok.

- [ ] **Step 7: storage duman testi (tsx, gerçek DB)**

Scratchpad'e `f19t1-storage.js` yaz — DATABASE_URL'i .env'den yükleyip storage'ı doğrudan çağırır. `npx tsx` ile repo kökünden çalıştır. Sıra:
```
import 'dotenv/config';
import { storage } from './server/storage';
(async () => {
  const c1 = await storage.createOdemeSirketi({ ad: 'T1 TEST FIRMA A.Ş.', iban: 'TR000000000000000000000001', banka: 'X Bank' });
  console.log('create:', c1?.ad, c1?.kaynak, c1?.iban);              // muhasebe, iban dolu
  const c2 = await storage.createOdemeSirketi({ ad: 'T1 TEST FIRMA A.Ş.' });
  console.log('dupe:', c2);                                          // null
  await storage.upsertOdemeSirketi('T1 TEST FIRMA A.Ş.', { iban: 'TRZZZ', kaynak: 'temsilci' });
  const t = (await storage.getOdemeSirketleriTumu()).find(s => s.ad === 'T1 TEST FIRMA A.Ş.');
  console.log('upsert korudu mu:', t?.iban, t?.kaynak, t?.kullanimSayisi); // TR0000..01 (ezilmedi), muhasebe, 2
  const u = await storage.updateOdemeSirketi(c1!.id, { iban: 'TR111', aktif: false });
  console.log('update:', u?.iban, u?.aktif);                         // TR111, false
  const b = await storage.bulkUpsertOdemeSirketleri([
    { ad: 'T1 TEST FIRMA A.Ş.', banka: 'Y Bank' },                   // guncellendi (banka eklenir)
    { ad: 'T1 YENI EXCEL LTD', iban: 'TR222' },                      // eklendi
    { ad: '' },                                                      // atlandi
  ]);
  console.log('bulk:', b);                                           // {eklendi:1, guncellendi:1, atlandi:1}
  // temizlik
  const { db } = await import('./server/db');
  const { odemeSirketleri } = await import('./shared/schema');
  const { like } = await import('drizzle-orm');
  const d = await db.delete(odemeSirketleri).where(like(odemeSirketleri.ad, 'T1 %'));
  console.log('silindi'); process.exit(0);
})();
```
Expected: create=muhasebe+iban; dupe=null; upsert IBAN'ı EZMEDİ (TR0000..01) ve sayaç 2; update TR111+false; bulk {1,1,1}. (db import yolu `./server/db` değilse storage.ts'teki gerçek db export yolunu kullan.)

- [ ] **Step 8: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(odemeler): odeme_sirketleri sema genisleme + firma storage metotlari (F1.9 T1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: API uçları + upsert çağrılarını genişlet

**Files:**
- Modify: `server/routes.ts` (yeni multer `uploadOdemeSirketExcel`; yeni uçlar mevcut `GET /api/portal/odeme-sirketleri` yanına; iki upsert çağrı yeri: satır ~4808-4813 ve ~5099-5104)

**Interfaces:**
- Consumes: Task 1 storage metotları; `requirePortal`, `requireMuhasebe` (routes.ts:172 import); `XLSX` (routes.ts:7 import); `portalKullanici(req)`/`ben.id` kalıbı (mevcut).
- Produces: uçlar — `GET /api/portal/odeme-sirketleri/tumu`, `POST /api/portal/odeme-sirketleri`, `PUT /api/portal/odeme-sirketleri/:id`, `POST /api/portal/odeme-sirketleri/excel`.

- [ ] **Step 1: Excel için memory-multer tanımı**

`server/routes.ts`'te mevcut `uploadBeyannameMemory` (satır ~108) yakınına ekle:

```ts
// Ödeme firmaları Excel içe aktarımı (bellekte; ay/yıl yok)
const uploadOdemeSirketExcel = multer({ storage: multer.memoryStorage() });
```

- [ ] **Step 2: Yeni uçlar — mevcut GET'in hemen ardına**

`server/routes.ts`'te mevcut `app.get("/api/portal/odeme-sirketleri", requirePortal, ...)` bloğunun HEMEN ardına şu dört ucu ekle:

```ts
  // Yönetim tablosu — tüm firmalar (aktif+pasif), ad sıralı
  app.get("/api/portal/odeme-sirketleri/tumu", requireMuhasebe, async (_req, res) => {
    try {
      res.json(await storage.getOdemeSirketleriTumu());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Elle firma ekleme
  app.post("/api/portal/odeme-sirketleri", requireMuhasebe, async (req, res) => {
    try {
      const { ad, iban, banka, vergiNo, notlar } = req.body || {};
      if (!String(ad ?? "").trim()) return res.status(400).json({ error: "Firma adı zorunlu" });
      const yeni = await storage.createOdemeSirketi({
        ad: String(ad), iban, banka, vergiNo, notlar,
      });
      if (!yeni) return res.status(409).json({ error: "Bu firma zaten kayıtlı" });
      res.json(yeni);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Firma güncelleme (IBAN tamamlama + aktif/pasif)
  app.put("/api/portal/odeme-sirketleri/:id", requireMuhasebe, async (req, res) => {
    try {
      const { ad, iban, banka, vergiNo, notlar, aktif } = req.body || {};
      const data: any = {};
      if (ad !== undefined) data.ad = String(ad);
      if (iban !== undefined) data.iban = iban;
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

  // Excel içe aktarım — başlıklar: Firma Adı | IBAN | Banka | Vergi/TC No | Not
  app.post("/api/portal/odeme-sirketleri/excel", requireMuhasebe, uploadOdemeSirketExcel.single("excel"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Dosya yüklenmedi" });
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[];
      // İlk satır başlık — atla. A:Ad B:IBAN C:Banka D:VergiNo E:Not
      const rows = rawData.slice(1).map((r) => ({
        ad: String(r[0] ?? "").trim(),
        iban: r[1] != null ? String(r[1]).trim() : null,
        banka: r[2] != null ? String(r[2]).trim() : null,
        vergiNo: r[3] != null ? String(r[3]).trim() : null,
        notlar: r[4] != null ? String(r[4]).trim() : null,
      })).filter((r) => r.ad);
      const sonuc = await storage.bulkUpsertOdemeSirketleri(rows);
      res.json(sonuc);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
```

- [ ] **Step 3: Talepler upsert'ini genişlet (tüm tipler + iban + kaynak)**

`server/routes.ts` satır ~4808-4813'teki bloğu şununla değiştir:

```ts
      // Girilen alacaklıyı firma listesine kaydet (best-effort — talebi bozmaz)
      storage.upsertOdemeSirketi(alacakliStr, {
        iban: iban ? String(iban).trim() : null,
        kaynak: odemeTipi === "depo_teminat" ? "depo" : "temsilci",
      }).catch((e) => console.warn(`[odeme-sirketleri] upsert hatası: ${e.message}`));
```

- [ ] **Step 4: Doğrudan ödeme upsert'ini genişlet**

`server/routes.ts` satır ~5099-5104'teki bloğu şununla değiştir:

```ts
        // Girilen alacaklıyı firma listesine kaydet (best-effort — kaydı bozmaz)
        storage.upsertOdemeSirketi(alacakliStr, {
          iban: iban ? String(iban).trim() : null,
          kaynak: "muhasebe",
        }).catch((e) => console.warn(`[odeme-sirketleri] upsert hatası: ${e.message}`));
```

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: hata yok.

- [ ] **Step 6: Dev sunucuyu yeniden başlat (sunucu kodu değişti)**

`netstat -ano | findstr :5000` → `taskkill //PID <pid> //F` → arka planda `npm run dev` → 5-8 sn bekle → `curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/portal` → 200.

- [ ] **Step 7: Uç duman testi (curl, muhasebe oturumu)**

Login (muhasebe/1234) cookie jar'a al (`/tmp/mj.txt`), sonra:
```
# oluştur
curl -s -b /tmp/mj.txt -X POST http://localhost:5000/api/portal/odeme-sirketleri \
  -H "Content-Type: application/json" --data-binary @/tmp/firma.json   # {"ad":"T2 API FIRMA A.S.","iban":"TR333","banka":"Z"}
# tümü listesinde görünmeli
curl -s -b /tmp/mj.txt http://localhost:5000/api/portal/odeme-sirketleri/tumu | grep "T2 API FIRMA"
# dupe → 409
curl -s -b /tmp/mj.txt -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/api/portal/odeme-sirketleri -H "Content-Type: application/json" --data-binary @/tmp/firma.json
# temsilci /tumu erişemez → 403 (temsilci cookie ile)
```
Türkçe içerikli gövde curl inline `-d` ile GÖNDERİLMEZ; dosyadan `--data-binary`. Beklenen: oluştur 200; /tumu'da görünür; dupe 409; temsilci 403.

- [ ] **Step 8: Test firmasını temizle**

```bash
node -e "
require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
(async () => { const r = await p.query(\"DELETE FROM odeme_sirketleri WHERE ad LIKE 'T2 %'\"); console.log('silindi:', r.rowCount); p.end(); })();
"
```
Expected: `silindi: 1`.

- [ ] **Step 9: Commit**

```bash
git add server/routes.ts
git commit -m "feat(odemeler): firma yonetim uclari + iban/kaynak upsert genislemesi (F1.9 T2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Benzerlik yardımcıları (`portalUtils.ts`)

**Files:**
- Modify: `client/src/pages/portal/portalUtils.ts` (dosya sonuna ekleme)
- Test: scratchpad `f19t3-fuzzy.mjs` (saf fonksiyon senaryoları)

**Interfaces:**
- Consumes: `OdemeSirketi` tipi (`@shared/schema`).
- Produces (Task 4 & 5 kullanır):
  - `firmaNormalize(s: string): string`
  - `firmaBenzerlik(a: string, b: string): number` (0–1)
  - `tamEslesme(girilen: string, firmalar: OdemeSirketi[]): OdemeSirketi | null`
  - `benzerFirmalar(girilen: string, firmalar: OdemeSirketi[], opts?: { esik?: number; adet?: number }): OdemeSirketi[]`

- [ ] **Step 1: Yardımcıları ekle**

`portalUtils.ts`'in en üstündeki import satırını `OdemeSirketi` içerecek şekilde güncelle:

```ts
import type { OdemeTalep, Beyanname, OdemeBelge, OdemeSirketi } from "@shared/schema";
```

Dosyanın SONUNA ekle:

```ts
// Firma adı eşleştirme — konşimento/AI'ın çıkardığı ad kayıtlı firmayla birebir
// tutmayabilir; normalize + benzerlik ile öneri sunulur. Saklama DEĞİŞMEZ.
const FIRMA_EKLERI = /\b(a\.?\s*ş\.?|a\.?\s*s\.?|ltd\.?|şti\.?|sti\.?|ş\.?t\.?i\.?)\b/g;

export function firmaNormalize(s: string): string {
  return (s ?? "")
    .toLocaleLowerCase("tr")
    .replace(FIRMA_EKLERI, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // noktalama → boşluk
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(firmaNormalize(s).split(" ").filter((t) => t.length >= 2));
}

export function firmaBenzerlik(a: string, b: string): number {
  const A = tokenSet(a), B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let kesisim = 0;
  A.forEach((t) => { if (B.has(t)) kesisim++; });
  const birlesim = A.size + B.size - kesisim;
  return birlesim === 0 ? 0 : kesisim / birlesim; // Jaccard
}

export function tamEslesme(girilen: string, firmalar: OdemeSirketi[]): OdemeSirketi | null {
  const n = firmaNormalize(girilen);
  if (!n) return null;
  return firmalar.find((f) => firmaNormalize(f.ad) === n) ?? null;
}

export function benzerFirmalar(
  girilen: string,
  firmalar: OdemeSirketi[],
  opts?: { esik?: number; adet?: number },
): OdemeSirketi[] {
  const esik = opts?.esik ?? 0.34;
  const adet = opts?.adet ?? 3;
  const n = firmaNormalize(girilen);
  if (!n) return [];
  return firmalar
    .map((f) => ({ f, skor: firmaBenzerlik(girilen, f.ad) }))
    .filter((x) => x.skor >= esik && firmaNormalize(x.f.ad) !== n) // tam eşleşenler hariç
    .sort((a, b) => b.skor - a.skor)
    .slice(0, adet)
    .map((x) => x.f);
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: hata yok.

- [ ] **Step 3: Saf fonksiyon testi**

Scratchpad'e `f19t3-fuzzy.mjs` yaz — yardımcıları esbuild-siz test etmek için MANTIK kopyasını değil, gerçek çıktı doğrulamasını yapar. En basit yol: küçük bir tsx runner. Repo kökünden `npx tsx` ile çalıştırılacak `f19t3-fuzzy.ts` yaz:
```ts
import { firmaNormalize, firmaBenzerlik, tamEslesme, benzerFirmalar } from "./client/src/pages/portal/portalUtils";
const firmalar: any[] = [
  { id: "1", ad: "ASAV LOJİSTİK HİZMETLERİ A.Ş.", iban: "TR1", aktif: true },
  { id: "2", ad: "DE-KA GÜMRÜK MÜŞAVİRLİĞİ LTD. ŞTİ.", iban: null, aktif: true },
  { id: "3", ad: "SAVINO DEL BENE NAKLİYAT A.Ş.", iban: "TR3", aktif: true },
];
console.log("norm:", firmaNormalize("ASAV LOJİSTİK A.Ş.") === "asav lojistik"); // true
console.log("tam:", tamEslesme("asav lojistik hizmetleri aş", firmalar)?.id === "1"); // true (normalize eşit)
console.log("tam-yok:", tamEslesme("ASAV LOJİSTİK", firmalar)); // null (hizmetleri yok → normalize farklı)
const benzer = benzerFirmalar("ASAV LOJİSTİK", firmalar);
console.log("benzer ASAV:", benzer.length >= 1 && benzer[0].id === "1"); // true
console.log("alakasiz:", benzerFirmalar("XYZ KARGO", firmalar).length === 0); // true
process.exit(0);
```
Run: `npx tsx f19t3-fuzzy.ts` (scratchpad'den kopyalayıp repo köküne koy veya tam yol ver).
Expected: `norm:true, tam:true, tam-yok:null, benzer ASAV:true, alakasiz:true`. Test dosyasını sonra sil (repo köküne yazıldıysa).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/portal/portalUtils.ts
git commit -m "feat(odemeler): firma adi normalize + benzerlik yardimcilari (F1.9 T3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Muhasebe yönetim sayfası + sidebar + rota

**Files:**
- Create: `client/src/pages/portal/FirmalarSayfasi.tsx`
- Modify: `client/src/pages/portal/PortalSidebar.tsx` (ikon import + MUHASEBE_MENU), `client/src/pages/portal/PortalApp.tsx` (import + SAYFA_BASLIKLARI + Route)
- Test: scratchpad `f19t4-firmalar.js` (Playwright)

**Interfaces:**
- Consumes: Task 2 uçları (`GET /tumu`, `POST`, `PUT`, `POST /excel`); `OdemeSirketi` tipi; `apiRequest`/`queryClient` (`@/lib/queryClient`); shadcn `Dialog`, `Table`, `Input`, `Button`, `Badge`, `Label`, `useToast`.
- Produces: muhasebe sidebar sekmesi `/portal/firmalar`.

- [ ] **Step 1: FirmalarSayfasi.tsx oluştur**

`client/src/pages/portal/FirmalarSayfasi.tsx` — tam içerik:

```tsx
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { OdemeSirketi } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type FirmaFormu = { id?: string; ad: string; iban: string; banka: string; vergiNo: string; notlar: string };
const BOS_FORM: FirmaFormu = { ad: "", iban: "", banka: "", vergiNo: "", notlar: "" };

const KAYNAK_ETIKET: Record<string, string> = { muhasebe: "Muhasebe", temsilci: "Temsilci", depo: "Depo" };

export default function FirmalarSayfasi() {
  const { toast } = useToast();
  const { data: firmalar = [] } = useQuery<OdemeSirketi[]>({
    queryKey: ["/api/portal/odeme-sirketleri/tumu"],
  });
  const [arama, setArama] = useState("");
  const [dialogAcik, setDialogAcik] = useState(false);
  const [form, setForm] = useState<FirmaFormu>({ ...BOS_FORM });
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const excelRef = useRef<HTMLInputElement>(null);

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return firmalar;
    return firmalar.filter(
      (f) =>
        f.ad.toLocaleLowerCase("tr").includes(q) ||
        (f.iban ?? "").toLocaleLowerCase("tr").includes(q) ||
        (f.vergiNo ?? "").toLocaleLowerCase("tr").includes(q),
    );
  }, [firmalar, arama]);

  const yeniAc = () => { setForm({ ...BOS_FORM }); setDialogAcik(true); };
  const duzenleAc = (f: OdemeSirketi) => {
    setForm({ id: f.id, ad: f.ad, iban: f.iban ?? "", banka: f.banka ?? "", vergiNo: f.vergiNo ?? "", notlar: f.notlar ?? "" });
    setDialogAcik(true);
  };

  const tazele = () => queryClient.invalidateQueries({ queryKey: ["/api/portal/odeme-sirketleri/tumu"] });

  // Portal kalıbı: ham fetch + { error } gövdesinden temiz Türkçe mesaj
  // (apiRequest non-ok'ta kendi mesajıyla throw edip 409/404 gövdesini yutardı).
  const kaydet = async () => {
    if (!form.ad.trim()) { toast({ title: "Firma adı zorunlu", variant: "destructive" }); return; }
    setKaydediliyor(true);
    try {
      const govde = { ad: form.ad, iban: form.iban, banka: form.banka, vergiNo: form.vergiNo, notlar: form.notlar };
      const url = form.id ? `/api/portal/odeme-sirketleri/${form.id}` : "/api/portal/odeme-sirketleri";
      const res = await fetch(url, {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(govde),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");
      toast({ title: form.id ? "Firma güncellendi" : "Firma eklendi" });
      setDialogAcik(false);
      tazele();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setKaydediliyor(false);
    }
  };

  const aktifToggle = async (f: OdemeSirketi) => {
    try {
      const res = await fetch(`/api/portal/odeme-sirketleri/${f.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktif: !f.aktif }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Güncellenemedi");
      tazele();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    }
  };

  const excelSec = () => excelRef.current?.click();
  const excelYukle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dosya = e.target.files?.[0];
    if (!dosya) return;
    try {
      const fd = new FormData();
      fd.set("excel", dosya);
      const res = await fetch("/api/portal/odeme-sirketleri/excel", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Excel yüklenemedi");
      const s = await res.json();
      toast({ title: "Excel işlendi", description: `${s.eklendi} eklendi, ${s.guncellendi} güncellendi, ${s.atlandi} atlandı` });
      tazele();
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      if (excelRef.current) excelRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle>Ödeme Yapılacak Firmalar ({firmalar.length})</CardTitle>
          <div className="flex gap-2">
            <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={excelYukle} data-testid="input-firma-excel-file" />
            <Button variant="outline" onClick={excelSec} data-testid="button-firma-excel">Excel Yükle</Button>
            <Button onClick={yeniAc} data-testid="button-firma-ekle">Elle Ekle</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Firma adı, IBAN veya vergi no ara…"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            data-testid="input-firma-arama"
          />
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="p-2">Ad</th>
                  <th className="p-2">IBAN</th>
                  <th className="p-2">Banka</th>
                  <th className="p-2">Vergi No</th>
                  <th className="p-2">Kaynak</th>
                  <th className="p-2">Kullanım</th>
                  <th className="p-2">Durum</th>
                  <th className="p-2 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtreli.map((f) => (
                  <tr key={f.id} className={`border-b ${f.aktif ? "" : "opacity-50"}`} data-testid={`row-firma-${f.id}`}>
                    <td className="p-2 font-medium">{f.ad}</td>
                    <td className="p-2">
                      {f.iban ? f.iban : <Badge variant="destructive" data-testid={`rozet-iban-yok-${f.id}`}>IBAN yok</Badge>}
                    </td>
                    <td className="p-2 text-muted-foreground">{f.banka ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{f.vergiNo ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{KAYNAK_ETIKET[f.kaynak] ?? f.kaynak}</td>
                    <td className="p-2 text-muted-foreground">{f.kullanimSayisi}</td>
                    <td className="p-2">{f.aktif ? "Aktif" : "Pasif"}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => duzenleAc(f)} data-testid={`button-firma-duzenle-${f.id}`}>Düzenle</Button>
                      <Button variant="ghost" size="sm" onClick={() => aktifToggle(f)} data-testid={`button-firma-aktif-${f.id}`}>
                        {f.aktif ? "Pasifleştir" : "Aktifleştir"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtreli.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Kayıt yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogAcik} onOpenChange={setDialogAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Firma Düzenle" : "Yeni Firma"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Firma Adı</Label>
              <Input value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} data-testid="input-firma-ad" />
            </div>
            <div className="space-y-1">
              <Label>IBAN</Label>
              <Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="TR.." data-testid="input-firma-iban" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Banka</Label>
                <Input value={form.banka} onChange={(e) => setForm({ ...form, banka: e.target.value })} data-testid="input-firma-banka" />
              </div>
              <div className="space-y-1">
                <Label>Vergi/TC No</Label>
                <Input value={form.vergiNo} onChange={(e) => setForm({ ...form, vergiNo: e.target.value })} data-testid="input-firma-vergino" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Not</Label>
              <Textarea value={form.notlar} onChange={(e) => setForm({ ...form, notlar: e.target.value })} data-testid="input-firma-notlar" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAcik(false)}>Vazgeç</Button>
            <Button onClick={kaydet} disabled={kaydediliyor} data-testid="button-firma-kaydet">
              {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Sidebar'a menü öğesi ekle**

`PortalSidebar.tsx` satır 8'deki lucide import'una `Building2` ekle:

```ts
import { FilePlus2, ListChecks, Inbox, Warehouse, Banknote, Building2, LogOut } from "lucide-react";
```

`MUHASEBE_MENU` (satır 24-28) dizisine son öğe olarak ekle:

```ts
  { title: "Ödeme Firmaları", href: "/portal/firmalar", icon: Building2 },
```

- [ ] **Step 3: PortalApp'e rota + başlık**

`PortalApp.tsx` satır 12'den sonra import ekle:

```ts
import FirmalarSayfasi from "./FirmalarSayfasi";
```

`SAYFA_BASLIKLARI` (satır 25-31) nesnesine ekle:

```ts
  "/portal/firmalar": "Ödeme Firmaları",
```

`<Switch>` içinde diğer muhasebe route'larının yanına ekle (satır ~91 civarı, dogrudan-odeme Route'undan sonra):

```tsx
              {me.rol === "muhasebe" && (
                <Route path="/portal/firmalar" component={FirmalarSayfasi} />
              )}
```

- [ ] **Step 4: Tip kontrolü**

Run: `npm run check`
Expected: hata yok.

- [ ] **Step 5: Türkçe karakter bütünlüğü**

Run: `node -e "['client/src/pages/portal/FirmalarSayfasi.tsx','client/src/pages/portal/PortalSidebar.tsx','client/src/pages/portal/PortalApp.tsx'].forEach(f=>{const s=require('fs').readFileSync(f,'utf8');console.log(f, 'fffd:', s.includes('�'))})"`
Expected: her dosya için `fffd: false`.

- [ ] **Step 6: Playwright — yönetim sayfası akışı**

Scratchpad'e `f19t4-firmalar.js` yaz (muhasebe/1234). Akış:
1. `/portal` login → sidebar'da "Ödeme Firmaları" (`link-portal-firmalar`) görünür, tıkla.
2. `button-firma-ekle` → dialog → `input-firma-ad`="T4 ELLE FIRMA A.Ş.", `input-firma-iban`="TR4444", `input-firma-banka`="Deneme Bank" → `button-firma-kaydet` → toast "Firma eklendi".
3. Tabloda `T4 ELLE FIRMA` satırı; IBAN kolonu "TR4444" (rozet YOK).
4. IBAN'sız bir kayıt için `rozet-iban-yok-*` görünür (2. bir firma ekle: ad="T4 IBANSIZ LTD", IBAN boş → tabloda rozet).
5. `button-firma-duzenle-*` (IBANSIZ) → IBAN="TR5555" → kaydet → rozet kaybolur.
6. `button-firma-aktif-*` → satır "Pasif" olur.
Expected: 6/6 assert PASS, ekran görüntüleri scratchpad'e.

- [ ] **Step 7: Test firmalarını temizle**

```bash
node -e "
require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
(async () => { const r = await p.query(\"DELETE FROM odeme_sirketleri WHERE ad LIKE 'T4 %'\"); console.log('silindi:', r.rowCount); p.end(); })();
"
```
Expected: `silindi: 2`.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/portal/FirmalarSayfasi.tsx client/src/pages/portal/PortalSidebar.tsx client/src/pages/portal/PortalApp.tsx
git commit -m "feat(odemeler): muhasebe firma yonetim sayfasi + sidebar sekmesi (F1.9 T4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Talep formu entegrasyonu (IBAN otomasyonu + benzerlik çipleri)

**Files:**
- Modify: `client/src/pages/portal/YeniTalepSayfasi.tsx`, `client/src/pages/portal/DogrudanOdemeSayfasi.tsx`

**Interfaces:**
- Consumes: Task 3 `tamEslesme`, `benzerFirmalar` + `firmaNormalize` (portalUtils); mevcut `odemeSirketleri` query, `alacakli`/`setAlacakli`/`iban`/`setIban`/`sonAlacakliOnerisi` state.
- Produces: alacaklı altında benzer-firma çipleri; tam eşleşmede IBAN otomasyonu.

Her iki dosyada AYNI değişiklik kalıbı uygulanır. Aşağıdaki adımlar önce YeniTalepSayfasi, sonra DogrudanOdemeSayfasi için tekrarlanır.

- [ ] **Step 1: YeniTalep — import + ref + türetilmiş öneriler**

`YeniTalepSayfasi.tsx` import satırına yardımcıları ekle (mevcut `formatTarih, formatPara` importının olduğu satır):

```ts
import { formatTarih, formatPara, tamEslesme, benzerFirmalar } from "./portalUtils";
```

`sonAlacakliOnerisi` ref'inin (satır ~62) hemen ardına IBAN öneri ref'i ekle:

```ts
  const sonIbanOnerisi = useRef<string | null>(null);
```

`secili` tanımının yakınına (component gövdesi, return'den önce) türetilmiş öneriler + IBAN otomasyonu ekle:

```ts
  // Alacaklı bir firmayla TAM eşleşiyorsa IBAN'ı otomatik doldur (elle yazılan ezilmez);
  // tam değilse benzer kayıtları öneri olarak çıkar (IBAN insan tıklamasıyla dolar).
  const tamFirma = useMemo(() => tamEslesme(alacakli, odemeSirketleri), [alacakli, odemeSirketleri]);
  const benzerOneriler = useMemo(
    () => (tamFirma ? [] : benzerFirmalar(alacakli, odemeSirketleri)),
    [tamFirma, alacakli, odemeSirketleri],
  );
  useEffect(() => {
    if (tamFirma?.iban) {
      if (!iban.trim() || iban === sonIbanOnerisi.current) {
        setIban(tamFirma.iban);
        sonIbanOnerisi.current = tamFirma.iban;
      }
    }
  }, [tamFirma]); // yalnız tam eşleşme değişince

  const firmaSec = (f: typeof odemeSirketleri[number]) => {
    setAlacakli(f.ad);
    sonAlacakliOnerisi.current = f.ad;
    if (f.iban) { setIban(f.iban); sonIbanOnerisi.current = f.iban; }
  };
```

`useEffect` importu yoksa React import satırına ekle: `import { useMemo, useState, useRef, useEffect } from "react";`

- [ ] **Step 2: YeniTalep — benzer çip UI'ı**

Alacaklı `Input` + `datalist` bloğunun (satır ~280-291, `<datalist id="alacakli-onerileri-talep">…</datalist>` kapanışından sonra) hemen ardına, aynı `div.space-y-2` içine ekle:

```tsx
                {benzerOneriler.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1" data-testid="benzer-firmalar-talep">
                    <span className="text-xs text-muted-foreground w-full">Benzer kayıtlı firmalar:</span>
                    {benzerOneriler.map((f, i) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => firmaSec(f)}
                        className="text-xs rounded-full border px-2 py-0.5 hover:bg-accent"
                        data-testid={`cip-firma-${i}`}
                      >
                        {f.ad}{f.iban ? ` · …${f.iban.slice(-4)}` : " · IBAN yok"}
                      </button>
                    ))}
                  </div>
                )}
```

- [ ] **Step 3: DogrudanOdeme — aynı entegrasyon**

`DogrudanOdemeSayfasi.tsx`'te Step 1 ve Step 2'nin AYNISINI uygula, tek fark testid'ler:
- import: `import { formatTarih, formatPara, tamEslesme, benzerFirmalar } from "./portalUtils";`
- React import: `import { useMemo, useState, useRef, useEffect } from "react";`
- `sonIbanOnerisi` ref'i `sonAlacakliOnerisi`'nin ardına.
- `tamFirma`/`benzerOneriler`/IBAN useEffect/`firmaSec` bloğu `secili` yakınına (Step 1 ile birebir aynı kod).
- Çip UI'ı alacaklı `<datalist id="alacakli-onerileri-dogrudan">…</datalist>` (satır ~278-282) kapanışının ardına; konteyner testid `benzer-firmalar-dogrudan`, çipler yine `cip-firma-${i}`.

- [ ] **Step 4: Tip kontrolü**

Run: `npm run check`
Expected: hata yok.

- [ ] **Step 5: Türkçe karakter bütünlüğü**

Run: `node -e "['client/src/pages/portal/YeniTalepSayfasi.tsx','client/src/pages/portal/DogrudanOdemeSayfasi.tsx'].forEach(f=>{const s=require('fs').readFileSync(f,'utf8');console.log(f,'fffd:',s.includes('�'))})"`
Expected: her ikisi `fffd: false`.

- [ ] **Step 6: Playwright — IBAN otomasyonu + çip**

Scratchpad'e `f19t5-form.js` yaz. Önkoşul: muhasebe oturumuyla iki firma ekle (API): "ASAV LOJİSTİK HİZMETLERİ A.Ş." IBAN="TR12340000000000000000ASAV", "ASAV DIŞ TİCARET LTD." IBAN="TR99990000000000000000DIS". Sonra temsilci (suleyman) YeniTalep:
1. Masraf tipi, alacaklı `input-alacakli`'ye "ASAV LOJİSTİK HİZMETLERİ A.Ş." yaz (tam) → IBAN alanı otomatik "TR1234…ASAV" dolar.
2. Alacaklıyı temizle, "ASAV" yaz (tam değil) → `benzer-firmalar-talep` görünür, en az 1 `cip-firma-*` var.
3. `cip-firma-0`'a tıkla → alacaklı o firmanın adıyla, IBAN o firmanın IBAN'ıyla dolar.
Expected: 3/3 assert PASS. Firma temizliği Step 7'de.

- [ ] **Step 7: Test firmalarını temizle**

```bash
node -e "
require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
(async () => { const r = await p.query(\"DELETE FROM odeme_sirketleri WHERE ad LIKE 'ASAV %'\"); console.log('silindi:', r.rowCount); p.end(); })();
"
```
Expected: `silindi: 2`.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/portal/YeniTalepSayfasi.tsx client/src/pages/portal/DogrudanOdemeSayfasi.tsx
git commit -m "feat(odemeler): talep formunda IBAN otomasyonu + benzer firma onerileri (F1.9 T5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Uçtan uca E2E + temizlik + build

**Files:**
- Create (scratchpad): `e2e-faz19.js`
- Modify: yok (gerçek uygulama hatası → kod değiştirme, DONE_WITH_CONCERNS raporla)

**Interfaces:**
- Consumes: Task 1-5 testid'leri + `KONŞİMENTO ÖRNEKLERİ/ADP.pdf` (gerçek analiz: acente "ASAV LOJISTIK…").

- [ ] **Step 1: Karma E2E — muhasebe kaydı → temsilci konşimento benzerlik akışı**

Scratchpad'e `e2e-faz19.js` yaz:
1. **Muhasebe (muhasebe/1234):** Ödeme Firmaları → "ASAV LOJİSTİK HİZMETLERİ A.Ş." IBAN="TR12340000000000000000ASAV" ekle → tabloda görünür.
2. **Temsilci (suleyman/1234):** YeniTalep → beyanname seç → ödeme tipi Depo Teminatı → ADP.pdf yükle → gerçek analiz (60 sn'ye kadar) → konşimento no `DGSSE260400154` çıkar, alacaklı AI önerisiyle "ASAV…" varyantı dolar.
3. Alacaklı AI'ın verdiği ad kayıtlı firmayla TAM eşleşmiyorsa `benzer-firmalar-talep` çipi görünür; TAM eşleşiyorsa IBAN otomatik dolar. İki durumdan hangisi oluşursa RAPORLA (AI çıktısı "ASAV LOJISTIK HIZMETLERI A.S." kayıtla normalize-eşit olabilir → tam eşleşme + IBAN otomatik; değilse çip). Çip varsa `cip-firma-0`'a tıkla → IBAN dolar.
4. Assert: sonuçta alacaklı ASAV firması + IBAN "TR1234…ASAV" dolu.
Expected: akış PASS; AI çıktısı + hangi dalın (tam/çip) tetiklendiği raporlanır. Başarısızlıkta kod DEĞİŞTİRME.

- [ ] **Step 2: Temizlik**

Test taleplerini (varsa) bağlı belge + diskteki dosyalarla, ASAV firmalarını ve depo upsert'inden oluşan kayıtları sil:
```bash
node -e "
require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
(async () => {
  const ids = await p.query(\"SELECT id FROM odeme_talepleri WHERE alacakli LIKE 'ASAV%' OR tutar = '1.00'\");
  for (const r of ids.rows) await p.query('DELETE FROM odeme_belgeleri WHERE talep_id = \$1', [r.id]);
  const t = await p.query(\"DELETE FROM odeme_talepleri WHERE alacakli LIKE 'ASAV%' OR tutar = '1.00'\");
  const s = await p.query(\"DELETE FROM odeme_sirketleri WHERE ad LIKE 'ASAV %'\");
  console.log('talep:', t.rowCount, 'sirket:', s.rowCount); p.end();
})();
"
```
`uploads/odemeler/` altındaki bu taleplere ait dosyaları da sil (odeme_belgeleri.filepath'lerden). Sayıları raporla.

- [ ] **Step 3: Kalite kapıları**

Run: `npm run check` → hatasız; `npm run build` → `dist/` üretilir, hatasız. Dev sunucu açık bırakılır.

- [ ] **Step 4: Rapor**

Commit YOK (test-only görev). Rapora: E2E adım sonuçları + AI çıktısı + tetiklenen dal (tam eşleşme mi çip mi) + ekran görüntüleri, temizlik sayıları, check/build özeti.

---

## Self-Review Notu

- Spec §3 (şema) → T1 Step 1; §4 (storage: get/getTumu/create/update/bulkUpsert + upsert opts) → T1 Step 3-4; §5 (uçlar + upsert genişletme) → T2; §7 saf yardımcılar → T3, form entegrasyonu → T5; §6 yönetim sayfası → T4; §9 doğrulama → T3 Step 3 (saf), T4/T5/T6 (Playwright), build → T6.
- `upsertOdemeSirketi` yeni imza (`ad, opts?`) T1'de tanımlandı, T2'de çağrıldı — tutarlı. `firmaSec`/`tamFirma`/`benzerOneriler` T5 iki dosyada aynı. Testid'ler T4↔T6 ve T5↔T6 arasında aynı (`row-firma-{id}`, `rozet-iban-yok-{id}`, `benzer-firmalar-talep`, `cip-firma-{i}`).
- Kapsam dışı (Excel şablon indirme, hard delete, merge, eşik UI) planda YOK (YAGNI).
- Kritik davranış: `upsertOdemeSirketi` çakışmada iban/kaynak EZMEZ (T1 Step 4 yorumu + T1 Step 7 assert'i); Excel çakışmada GÜNCELLER (T1 Step 4 bulkUpsert). İki farklı politika bilinçli.
