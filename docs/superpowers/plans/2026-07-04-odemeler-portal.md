# Ödemeler Portalı (Faz 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çalışanların gerçek kullanıcı girişiyle kullandığı `/portal` alanı: temsilci beyanname seçip ödeme talebi açar (fatura ekiyle), muhasebe talepleri görüp dekont yükleyerek "Ödendi" yapar; depo teminatları ayrı listede iade takibine düşer; yönetim paneli Excel besleme + izleme + kullanıcı/masraf türü yönetimi alır.

**Architecture:** Mevcut monorepo içinde kalınır. Backend'e `express-session` + `connect-pg-simple` (ikisi de kurulu) ile oturum katmanı eklenir; yalnız `/api/portal/*` rotaları korunur. Beyanname Excel'i DOSYA NO üzerinden upsert edilir. Frontend'de `/portal` rotası yönetim şifre kapısını atlar (mevcut `/survey/:id` deseni) ve role göre Temsilci/Muhasebe panelini gösterir. Yönetim paneline `/odemeler` sayfası eklenir.

**Tech Stack:** Express + Drizzle (pg Pool), express-session + connect-pg-simple, crypto.scrypt (şifre hash), multer (dosya yükleme), xlsx (Excel parse), React 18 + wouter + TanStack Query + shadcn/ui.

**Spec:** [docs/superpowers/specs/2026-07-03-odemeler-portal-design.md](../specs/2026-07-03-odemeler-portal-design.md)

## Global Constraints

- UI metinleri, tablo/kolon adları, rota segmentleri **Türkçe** (mevcut konvansiyon).
- FK kolon adları TS alan adından türetilmez; açık snake_case string verilir: `varchar("talep_eden_id")`.
- Tarih alanları `text` olarak `YYYY-MM-DD` saklanır; ekranda `dd/mm/yyyy` gösterilir ve **`new Date(...)` üzerinden parse edilmez** (timezone off-by-one tuzağı, commit `c897dff`).
- Insert Zod şemaları `insert<Entity>Schema` önekiyle adlandırılır.
- PUT/PATCH miss → `return res.status(404).json({ error: "Bulunamadı" })`.
- N+1 yok: `inArray(...)` veya iki-sorgu + Map join.
- **Test altyapısı yok** — `npm run check` (tsc) tek otomatik kapı; test komutu icat etme. Doğrulama: tsc + dev sunucuya curl + elle UI senaryosu.
- Şema değişimi `npm run db:push` ile uygulanır; migration dosyası oluşturma.
- `uploads/` içeriği ve cookie/geçici dosyalar **commit edilmez** — `git add` daima açık dosya yollarıyla yapılır, asla `git add -A` değil.
- **`git push` = deploy.** Bu planda yalnız commit atılır; push kararı kullanıcınındır.
- Dev sunucu: `npm run dev` → port 5000, `DATABASE_URL` zorunlu (repo kökünde `.env` mevcut).
- Commit mesajları repo stilinde (küçük harf, `feat(odemeler): ...`) ve şu satırla biter: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Veritabanı şeması — 5 yeni tablo

**Files:**
- Modify: `shared/schema.ts` (dosyanın en sonuna ekle — şu an `tahsilatAyarlari` ile bitiyor)

**Interfaces:**
- Consumes: mevcut import satırı (`pgTable, text, varchar, decimal, integer, uniqueIndex, index, timestamp, boolean`, `createInsertSchema`, `z`, `sql`) — hepsi dosyanın başında zaten import edilmiş.
- Produces (sonraki görevler bunlara güvenir):
  - Tablolar: `portalKullanicilar`, `beyannameler`, `masrafTurleri`, `odemeTalepleri`, `odemeBelgeleri`
  - Tipler: `PortalKullanici`, `InsertPortalKullanici`, `Beyanname`, `InsertBeyanname`, `MasrafTuru`, `InsertMasrafTuru`, `OdemeTalep`, `InsertOdemeTalep`, `OdemeBelge`, `InsertOdemeBelge`
  - Zod: `insertPortalKullaniciSchema`, `insertBeyannameSchema`, `insertMasrafTuruSchema`, `insertOdemeTalepSchema`, `insertOdemeBelgeSchema`

- [ ] **Step 1: Şemayı ekle**

`shared/schema.ts` dosyasının en sonuna (son satır `export type TahsilatAyarlari = ...`'dan sonra) ekle:

```ts
// ==================== ÖDEMELER PORTALI ====================

// Portal kullanıcıları — çalışan girişi (yönetim panelinden bağımsız)
export const portalKullanicilar = pgTable("portal_kullanicilar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kullaniciAdi: text("kullanici_adi").notNull().unique(),
  sifreHash: text("sifre_hash").notNull(), // "salt:hash" (crypto.scrypt)
  adSoyad: text("ad_soyad").notNull(),
  rol: text("rol").notNull(), // 'temsilci' | 'muhasebe'
  avAdi: text("av_adi"), // Beyanname Excel AV sütunu eşleşmesi (örn. "SÜLEYMAN")
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertPortalKullaniciSchema = createInsertSchema(portalKullanicilar).omit({
  id: true,
  olusturmaTarihi: true,
});
export type InsertPortalKullanici = z.infer<typeof insertPortalKullaniciSchema>;
export type PortalKullanici = typeof portalKullanicilar.$inferSelect;

// Beyanname referans listesi — Excel'den beslenir, DOSYA NO ile upsert
export const beyannameler = pgTable("beyannameler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dosyaNo: text("dosya_no").notNull(),
  alici: text("alici"),
  gonderen: text("gonderen"),
  koli: integer("koli"),
  gumrukIdaresi: text("gumruk_idaresi"),
  beyanTarihi: text("beyan_tarihi"), // YYYY-MM-DD; Excel'de "." veya boş → null
  beyanNo: text("beyan_no"),
  fatBedeli: decimal("fat_bedeli", { precision: 18, scale: 2 }),
  doviz: text("doviz"),
  kullanici: text("kullanici"), // AV sütunu — temsilci filtre alanı
  sonGuncelleme: timestamp("son_guncelleme").defaultNow(),
}, (table) => [
  uniqueIndex("beyannameler_dosya_no_idx").on(table.dosyaNo),
  index("beyannameler_kullanici_idx").on(table.kullanici),
]);

export const insertBeyannameSchema = createInsertSchema(beyannameler).omit({
  id: true,
  sonGuncelleme: true,
});
export type InsertBeyanname = z.infer<typeof insertBeyannameSchema>;
export type Beyanname = typeof beyannameler.$inferSelect;

// Masraf türleri — yönetim panelinden düzenlenir
export const masrafTurleri = pgTable("masraf_turleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ad: text("ad").notNull().unique(),
  aktif: boolean("aktif").notNull().default(true),
  sira: integer("sira").notNull().default(0),
});

export const insertMasrafTuruSchema = createInsertSchema(masrafTurleri).omit({ id: true });
export type InsertMasrafTuru = z.infer<typeof insertMasrafTuruSchema>;
export type MasrafTuru = typeof masrafTurleri.$inferSelect;

// Ödeme talepleri — modülün kalbi
export const odemeTalepleri = pgTable("odeme_talepleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  beyannameId: varchar("beyanname_id").notNull().references(() => beyannameler.id),
  talepEdenId: varchar("talep_eden_id").notNull().references(() => portalKullanicilar.id),
  odemeTipi: text("odeme_tipi").notNull(), // 'masraf' | 'depo_teminat'
  masrafTuru: text("masraf_turu").notNull(), // masraf_turleri.ad kopyası; depo_teminat'ta sabit "Depo Teminatı"
  tutar: decimal("tutar", { precision: 18, scale: 2 }).notNull(),
  paraBirimi: text("para_birimi").notNull().default("TRY"), // TRY | USD | EUR
  alacakli: text("alacakli").notNull(), // kime ödenecek (firma adı)
  iban: text("iban"),
  aciklama: text("aciklama"),
  durum: text("durum").notNull().default("bekliyor"), // 'bekliyor' | 'odendi'
  talepTarihi: text("talep_tarihi").notNull(), // YYYY-MM-DD
  odemeTarihi: text("odeme_tarihi"), // ödendi anında damgalanır
  odeyenId: varchar("odeyen_id").references(() => portalKullanicilar.id),
  // Depo teminatı iade takibi (Faz 2'de genişleyecek)
  iadeDurumu: text("iade_durumu"), // depo: 'beklemede' | 'iade_edildi'; masrafta null
  iadeTutari: decimal("iade_tutari", { precision: 18, scale: 2 }), // kısmi iade / demuraj kesintisi
  iadeTarihi: text("iade_tarihi"),
  iadeNotu: text("iade_notu"),
}, (table) => [
  index("odeme_talepleri_durum_idx").on(table.durum),
  index("odeme_talepleri_talep_eden_idx").on(table.talepEdenId),
  index("odeme_talepleri_tip_idx").on(table.odemeTipi),
]);

export const insertOdemeTalepSchema = createInsertSchema(odemeTalepleri).omit({ id: true });
export type InsertOdemeTalep = z.infer<typeof insertOdemeTalepSchema>;
export type OdemeTalep = typeof odemeTalepleri.$inferSelect;

// Ödeme belgeleri — talep başına çoklu dosya
export const odemeBelgeleri = pgTable("odeme_belgeleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  talepId: varchar("talep_id").notNull().references(() => odemeTalepleri.id, { onDelete: "cascade" }),
  belgeTipi: text("belge_tipi").notNull(), // 'fatura' (temsilci) | 'dekont' | 'konsimento' (muhasebe)
  filename: text("filename").notNull(),
  filepath: text("filepath").notNull(), // uploads/odemeler/... (ileri eğik çizgili)
  yukleyenId: varchar("yukleyen_id").notNull().references(() => portalKullanicilar.id),
  yuklemeTarihi: timestamp("yukleme_tarihi").defaultNow(),
}, (table) => [
  index("odeme_belgeleri_talep_idx").on(table.talepId),
]);

export const insertOdemeBelgeSchema = createInsertSchema(odemeBelgeleri).omit({
  id: true,
  yuklemeTarihi: true,
});
export type InsertOdemeBelge = z.infer<typeof insertOdemeBelgeSchema>;
export type OdemeBelge = typeof odemeBelgeleri.$inferSelect;
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: hatasız çıkış (exit 0)

- [ ] **Step 3: Şemayı veritabanına uygula**

Run: `npm run db:push`
Expected: `portal_kullanicilar`, `beyannameler`, `masraf_turleri`, `odeme_talepleri`, `odeme_belgeleri` tablolarının oluştuğunu bildiren çıktı; hata yok. (İnteraktif onay sorarsa `--force` ile tekrarla: `npx drizzle-kit push --force`.)

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(odemeler): portal semasi - kullanici, beyanname, talep, belge, masraf turu tablolari

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Oturum altyapısı — scrypt hash + express-session

**Files:**
- Modify: `server/db.ts` (pool'u export et)
- Create: `server/portalAuth.ts`
- Modify: `server/index.ts` (session middleware + import)
- Modify: `.env` (SESSION_SECRET ekle — commit edilmez, zaten git dışında)

**Interfaces:**
- Consumes: `server/db.ts` içindeki `pg.Pool` örneği.
- Produces (Task 5-6 bunları kullanır):
  - `hashSifre(sifre: string): Promise<string>` — `"salt:hash"` string döner
  - `dogrulaSifre(sifre: string, kayitliHash: string): Promise<boolean>`
  - `setupPortalSession(app: Express): void` — session middleware'i app'e takar
  - `requirePortal(req, res, next)` — oturum yoksa `401 {error:"Giriş gerekli"}`
  - `requireMuhasebe(req, res, next)` — oturum yoksa 401, rol `muhasebe` değilse `403 {error:"Yetkisiz"}`
  - `req.session.portalUserId?: string` ve `req.session.portalRol?: string` (module augmentation)

- [ ] **Step 1: db.ts'te pool'u export et**

`server/db.ts` içinde `const pool = new pg.Pool({` satırını şu hale getir:

```ts
export const pool = new pg.Pool({
```

- [ ] **Step 2: server/portalAuth.ts dosyasını oluştur**

```ts
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { Request, Response, NextFunction, Express } from "express";
import { pool } from "./db";

const scryptAsync = promisify(scrypt);

// Şifre hash'i "salt:hash" formatında tek string olarak saklanır.
// bcrypt yerine Node yerleşik scrypt — yeni bağımlılık yok.
export async function hashSifre(sifre: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(sifre, salt, 64)) as Buffer;
  return `${salt}:${buf.toString("hex")}`;
}

export async function dogrulaSifre(sifre: string, kayitliHash: string): Promise<boolean> {
  const [salt, hashHex] = kayitliHash.split(":");
  if (!salt || !hashHex) return false;
  const kayitli = Buffer.from(hashHex, "hex");
  const aday = (await scryptAsync(sifre, salt, 64)) as Buffer;
  return kayitli.length === aday.length && timingSafeEqual(kayitli, aday);
}

declare module "express-session" {
  interface SessionData {
    portalUserId?: string;
    portalRol?: string; // 'temsilci' | 'muhasebe'
  }
}

export function setupPortalSession(app: Express) {
  const PgStore = connectPgSimple(session);
  if (!process.env.SESSION_SECRET) {
    console.warn("[portal] SESSION_SECRET tanımlı değil — geçici geliştirme anahtarı kullanılıyor.");
  }
  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: "portal_sessions",
        createTableIfMissing: true, // oturum tablosu ilk açılışta otomatik oluşur
      }),
      secret: process.env.SESSION_SECRET || "dev-portal-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 12, // 12 saat
      },
    }),
  );
}

export function requirePortal(req: Request, res: Response, next: NextFunction) {
  if (!req.session.portalUserId) {
    return res.status(401).json({ error: "Giriş gerekli" });
  }
  next();
}

export function requireMuhasebe(req: Request, res: Response, next: NextFunction) {
  if (!req.session.portalUserId) {
    return res.status(401).json({ error: "Giriş gerekli" });
  }
  if (req.session.portalRol !== "muhasebe") {
    return res.status(403).json({ error: "Yetkisiz" });
  }
  next();
}
```

- [ ] **Step 3: server/index.ts'e session middleware'i tak**

`import { storage } from "./storage";` satırının altına import ekle:

```ts
import { setupPortalSession } from "./portalAuth";
```

`app.use(express.urlencoded({ extended: false, limit: "50mb" }));` satırının hemen altına ekle:

```ts
// Ödemeler Portalı oturumları (yalnız /api/portal/* rotaları kontrol eder)
setupPortalSession(app);
```

- [ ] **Step 4: .env dosyasına SESSION_SECRET ekle**

Repo kökündeki `.env` dosyasının sonuna bir satır ekle (dosya git'e girmez; değeri rastgele üret):

```bash
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
```

- [ ] **Step 5: Tip kontrolü + sunucu açılış testi**

Run: `npm run check`
Expected: hatasız.

Run (arka planda): `npm run dev` — çıktıda `serving on port 5000` görünmeli, session hatası olmamalı.
Run: `curl -s http://localhost:5000/api/portal/me`
Expected: bu rota henüz yok → Vite HTML'i veya 404 döner (hata YOK); sunucu ayakta. (Rota Task 5'te gelecek.)

- [ ] **Step 6: Commit**

```bash
git add server/db.ts server/portalAuth.ts server/index.ts
git commit -m "feat(odemeler): oturum altyapisi - scrypt hash, express-session + pg store

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Storage katmanı — IStorage + DatabaseStorage metodları

**Files:**
- Modify: `server/storage.ts` (import bloğu, `IStorage` arayüzü sonu, `DatabaseStorage` sınıfı sonu)
- Modify: `server/index.ts` (masraf türü seed çağrısı)

**Interfaces:**
- Consumes: Task 1 tabloları/tipleri; drizzle `eq, and, inArray, desc, asc, sql, isNotNull, notInArray, count`.
- Produces (Task 4-6 rotaları bunları çağırır — imzalar birebir):

```ts
export type OdemeTalepDetay = OdemeTalep & {
  beyanname: Beyanname | null;
  talepEdenAd: string;
  belgeler: OdemeBelge[];
};

// IStorage'a eklenecek imzalar:
getPortalKullanicilar(): Promise<PortalKullanici[]>;
getPortalKullanici(id: string): Promise<PortalKullanici | undefined>;
getPortalKullaniciByKullaniciAdi(kullaniciAdi: string): Promise<PortalKullanici | undefined>;
createPortalKullanici(k: InsertPortalKullanici): Promise<PortalKullanici>;
updatePortalKullanici(id: string, k: Partial<InsertPortalKullanici>): Promise<PortalKullanici | undefined>;
upsertBeyannameler(rows: InsertBeyanname[]): Promise<{ eklenen: number; guncellenen: number }>;
getBeyannameler(kullanici?: string): Promise<Beyanname[]>;
getBeyanname(id: string): Promise<Beyanname | undefined>;
getEslesmeyenBeyannameKullanicilari(): Promise<{ kullanici: string; adet: number }[]>;
getMasrafTurleri(sadeceAktif?: boolean): Promise<MasrafTuru[]>;
createMasrafTuru(t: InsertMasrafTuru): Promise<MasrafTuru>;
updateMasrafTuru(id: string, t: Partial<InsertMasrafTuru>): Promise<MasrafTuru | undefined>;
seedMasrafTurleri(): Promise<void>;
createOdemeTalep(t: InsertOdemeTalep): Promise<OdemeTalep>;
getOdemeTalepleri(filtre?: { talepEdenId?: string; odemeTipi?: string }): Promise<OdemeTalepDetay[]>;
getOdemeTalep(id: string): Promise<OdemeTalep | undefined>;
updateOdemeTalep(id: string, t: Partial<InsertOdemeTalep>): Promise<OdemeTalep | undefined>;
createOdemeBelge(b: InsertOdemeBelge): Promise<OdemeBelge>;
```

- [ ] **Step 1: Import'ları genişlet**

`server/storage.ts` başındaki `@shared/schema` import listesine (son satırı `tahsilatAyarlari, type TahsilatAyarlari, type InsertTahsilatAyarlari } from "@shared/schema";`) şu satırları ekle (kapanış `}`'den önce):

```ts
  portalKullanicilar, type PortalKullanici, type InsertPortalKullanici,
  beyannameler, type Beyanname, type InsertBeyanname,
  masrafTurleri, type MasrafTuru, type InsertMasrafTuru,
  odemeTalepleri, type OdemeTalep, type InsertOdemeTalep,
  odemeBelgeleri, type OdemeBelge, type InsertOdemeBelge,
```

Drizzle import satırında (`import { eq, and, sql, inArray, desc, isNotNull, or, asc, ne, count } from "drizzle-orm";`) `notInArray` ekle:

```ts
import { eq, and, sql, inArray, desc, isNotNull, or, asc, ne, count, notInArray } from "drizzle-orm";
```

- [ ] **Step 2: Detay tipini ve IStorage imzalarını ekle**

`export interface IStorage {` satırının hemen ÜSTÜNE ekle:

```ts
// Ödemeler Portalı: talep + ilişkili beyanname/kullanıcı/belgeler tek yanıtta
export type OdemeTalepDetay = OdemeTalep & {
  beyanname: Beyanname | null;
  talepEdenAd: string;
  belgeler: OdemeBelge[];
};
```

`IStorage` arayüzünün kapanış `}`'inden hemen önce, Interfaces bölümündeki imza bloğunu (`getPortalKullanicilar()`'dan `createOdemeBelge(...)`'ye kadar, başına `// Ödemeler Portalı` yorumu koyarak) ekle.

- [ ] **Step 3: DatabaseStorage implementasyonlarını ekle**

`DatabaseStorage` sınıfının kapanış `}`'inden hemen önce ekle:

```ts
  // ==================== ÖDEMELER PORTALI ====================

  async getPortalKullanicilar(): Promise<PortalKullanici[]> {
    return db.select().from(portalKullanicilar).orderBy(asc(portalKullanicilar.adSoyad));
  }

  async getPortalKullanici(id: string): Promise<PortalKullanici | undefined> {
    const [k] = await db.select().from(portalKullanicilar).where(eq(portalKullanicilar.id, id));
    return k;
  }

  async getPortalKullaniciByKullaniciAdi(kullaniciAdi: string): Promise<PortalKullanici | undefined> {
    const [k] = await db.select().from(portalKullanicilar)
      .where(eq(portalKullanicilar.kullaniciAdi, kullaniciAdi));
    return k;
  }

  async createPortalKullanici(k: InsertPortalKullanici): Promise<PortalKullanici> {
    const [yeni] = await db.insert(portalKullanicilar).values(k).returning();
    return yeni;
  }

  async updatePortalKullanici(id: string, k: Partial<InsertPortalKullanici>): Promise<PortalKullanici | undefined> {
    const [guncel] = await db.update(portalKullanicilar).set(k)
      .where(eq(portalKullanicilar.id, id)).returning();
    return guncel;
  }

  async upsertBeyannameler(rows: InsertBeyanname[]): Promise<{ eklenen: number; guncellenen: number }> {
    if (!rows.length) return { eklenen: 0, guncellenen: 0 };
    // Aynı batch içinde tekrarlı dosyaNo "ON CONFLICT ... cannot affect row a second time"
    // hatası verir — son satır kazanacak şekilde tekilleştir.
    const tekil = new Map<string, InsertBeyanname>();
    for (const r of rows) tekil.set(r.dosyaNo, r);
    const kayitlar = Array.from(tekil.values());

    const mevcutlar = await db.select({ dosyaNo: beyannameler.dosyaNo }).from(beyannameler)
      .where(inArray(beyannameler.dosyaNo, kayitlar.map((r) => r.dosyaNo)));
    const mevcutSet = new Set(mevcutlar.map((m) => m.dosyaNo));

    for (let i = 0; i < kayitlar.length; i += 500) {
      const parca = kayitlar.slice(i, i + 500);
      await db.insert(beyannameler).values(parca).onConflictDoUpdate({
        target: beyannameler.dosyaNo,
        set: {
          alici: sql`excluded.alici`,
          gonderen: sql`excluded.gonderen`,
          koli: sql`excluded.koli`,
          gumrukIdaresi: sql`excluded.gumruk_idaresi`,
          beyanTarihi: sql`excluded.beyan_tarihi`,
          beyanNo: sql`excluded.beyan_no`,
          fatBedeli: sql`excluded.fat_bedeli`,
          doviz: sql`excluded.doviz`,
          kullanici: sql`excluded.kullanici`,
          sonGuncelleme: sql`now()`,
        },
      });
    }
    const eklenen = kayitlar.filter((r) => !mevcutSet.has(r.dosyaNo)).length;
    return { eklenen, guncellenen: kayitlar.length - eklenen };
  }

  async getBeyannameler(kullanici?: string): Promise<Beyanname[]> {
    if (kullanici !== undefined) {
      return db.select().from(beyannameler)
        .where(eq(beyannameler.kullanici, kullanici))
        .orderBy(desc(beyannameler.dosyaNo));
    }
    return db.select().from(beyannameler).orderBy(desc(beyannameler.dosyaNo));
  }

  async getBeyanname(id: string): Promise<Beyanname | undefined> {
    const [b] = await db.select().from(beyannameler).where(eq(beyannameler.id, id));
    return b;
  }

  async getEslesmeyenBeyannameKullanicilari(): Promise<{ kullanici: string; adet: number }[]> {
    const tanimliSatirlar = await db.select({ avAdi: portalKullanicilar.avAdi })
      .from(portalKullanicilar).where(isNotNull(portalKullanicilar.avAdi));
    const tanimli = tanimliSatirlar.map((k) => k.avAdi!).filter((a) => a.length > 0);
    const kosul = tanimli.length
      ? and(isNotNull(beyannameler.kullanici), notInArray(beyannameler.kullanici, tanimli))
      : isNotNull(beyannameler.kullanici);
    const satirlar = await db.select({ kullanici: beyannameler.kullanici, adet: count() })
      .from(beyannameler).where(kosul).groupBy(beyannameler.kullanici);
    return satirlar.map((r) => ({ kullanici: r.kullanici!, adet: Number(r.adet) }));
  }

  async getMasrafTurleri(sadeceAktif?: boolean): Promise<MasrafTuru[]> {
    if (sadeceAktif) {
      return db.select().from(masrafTurleri).where(eq(masrafTurleri.aktif, true))
        .orderBy(asc(masrafTurleri.sira), asc(masrafTurleri.ad));
    }
    return db.select().from(masrafTurleri).orderBy(asc(masrafTurleri.sira), asc(masrafTurleri.ad));
  }

  async createMasrafTuru(t: InsertMasrafTuru): Promise<MasrafTuru> {
    const [yeni] = await db.insert(masrafTurleri).values(t).returning();
    return yeni;
  }

  async updateMasrafTuru(id: string, t: Partial<InsertMasrafTuru>): Promise<MasrafTuru | undefined> {
    const [guncel] = await db.update(masrafTurleri).set(t)
      .where(eq(masrafTurleri.id, id)).returning();
    return guncel;
  }

  async seedMasrafTurleri(): Promise<void> {
    const varsayilan = ["Ardiye", "Liman Masrafı", "Demuraj", "Tahmil-Tahliye", "Ordino", "Diğer"];
    await db.insert(masrafTurleri)
      .values(varsayilan.map((ad, i) => ({ ad, sira: i })))
      .onConflictDoNothing({ target: masrafTurleri.ad });
  }

  async createOdemeTalep(t: InsertOdemeTalep): Promise<OdemeTalep> {
    const [yeni] = await db.insert(odemeTalepleri).values(t).returning();
    return yeni;
  }

  async getOdemeTalepleri(filtre?: { talepEdenId?: string; odemeTipi?: string }): Promise<OdemeTalepDetay[]> {
    const kosullar = [];
    if (filtre?.talepEdenId) kosullar.push(eq(odemeTalepleri.talepEdenId, filtre.talepEdenId));
    if (filtre?.odemeTipi) kosullar.push(eq(odemeTalepleri.odemeTipi, filtre.odemeTipi));
    const talepler = await db.select().from(odemeTalepleri)
      .where(kosullar.length ? and(...kosullar) : undefined)
      .orderBy(desc(odemeTalepleri.talepTarihi), desc(odemeTalepleri.id));
    if (!talepler.length) return [];

    // N+1 yok: üç toplu sorgu + Map join
    const beyanIds = Array.from(new Set(talepler.map((t) => t.beyannameId)));
    const kullaniciIds = Array.from(new Set(talepler.map((t) => t.talepEdenId)));
    const talepIds = talepler.map((t) => t.id);
    const [beyanSatirlari, kullaniciSatirlari, belgeSatirlari] = await Promise.all([
      db.select().from(beyannameler).where(inArray(beyannameler.id, beyanIds)),
      db.select().from(portalKullanicilar).where(inArray(portalKullanicilar.id, kullaniciIds)),
      db.select().from(odemeBelgeleri).where(inArray(odemeBelgeleri.talepId, talepIds)),
    ]);
    const beyanMap = new Map(beyanSatirlari.map((b) => [b.id, b]));
    const adMap = new Map(kullaniciSatirlari.map((k) => [k.id, k.adSoyad]));
    const belgeMap = new Map<string, OdemeBelge[]>();
    for (const b of belgeSatirlari) {
      const arr = belgeMap.get(b.talepId) ?? [];
      arr.push(b);
      belgeMap.set(b.talepId, arr);
    }
    return talepler.map((t) => ({
      ...t,
      beyanname: beyanMap.get(t.beyannameId) ?? null,
      talepEdenAd: adMap.get(t.talepEdenId) ?? "?",
      belgeler: belgeMap.get(t.id) ?? [],
    }));
  }

  async getOdemeTalep(id: string): Promise<OdemeTalep | undefined> {
    const [t] = await db.select().from(odemeTalepleri).where(eq(odemeTalepleri.id, id));
    return t;
  }

  async updateOdemeTalep(id: string, t: Partial<InsertOdemeTalep>): Promise<OdemeTalep | undefined> {
    const [guncel] = await db.update(odemeTalepleri).set(t)
      .where(eq(odemeTalepleri.id, id)).returning();
    return guncel;
  }

  async createOdemeBelge(b: InsertOdemeBelge): Promise<OdemeBelge> {
    const [yeni] = await db.insert(odemeBelgeleri).values(b).returning();
    return yeni;
  }
```

- [ ] **Step 4: Seed çağrısını index.ts'e ekle**

`server/index.ts` içinde `storage.seedResmiTatiller()` bloğunun altına ekle:

```ts
  // Ödemeler Portalı: masraf türlerini seed et (idempotent)
  storage.seedMasrafTurleri()
    .catch((e) => log(`Masraf türü seed hatası: ${e.message}`, "odemeler-seed"));
```

- [ ] **Step 5: Tip kontrolü**

Run: `npm run check`
Expected: hatasız.

- [ ] **Step 6: Commit**

```bash
git add server/storage.ts server/index.ts
git commit -m "feat(odemeler): storage katmani - kullanici, beyanname upsert, talep, belge metodlari

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Beyanname Excel parser + yükleme rotası

**Files:**
- Create: `server/beyannameParser.ts`
- Modify: `server/routes.ts` (multer tanımı + rota + import)

**Interfaces:**
- Consumes: `InsertBeyanname` (Task 1), `storage.upsertBeyannameler` / `storage.getEslesmeyenBeyannameKullanicilari` (Task 3).
- Produces:
  - `parseBeyannameWorkbook(buffer: Buffer): { rows: InsertBeyanname[] }` — başlık uyuşmazlığında `throw new Error("Excel başlıkları uyuşmuyor: ...")`
  - `parseBeyanTarihi(deger: unknown): string | null` — `"DD.MM.YYYY"` → `"YYYY-MM-DD"`, aksi null
  - Rota: `POST /api/odemeler/beyanname-excel` (multipart alan adı `dosya`) → `{ toplam, eklenen, guncellenen, eslesmeyen: {kullanici, adet}[] }`

- [ ] **Step 1: server/beyannameParser.ts dosyasını oluştur**

```ts
import * as XLSX from "xlsx";
import { type InsertBeyanname } from "@shared/schema";

// Beklenen başlıklar → sütun harfleri ("İthalat Raporu" sayfası, 1. satır)
const BEKLENEN_BASLIKLAR: Record<string, string> = {
  A: "DOSYA NO",
  B: "ALICI",
  D: "GONDEREN",
  F: "KOLİ",
  I: "GUM.",
  K: "BEYAN TARİHİ",
  L: "BEYAN NO",
  M: "FAT.BEDELİ",
  N: "DÖVİZ",
  AV: "KULLANICI",
};

// "DD.MM.YYYY" → "YYYY-MM-DD"; "." veya boş → null.
// new Date() KULLANILMAZ — timezone off-by-one tuzağı (commit c897dff).
export function parseBeyanTarihi(deger: unknown): string | null {
  if (typeof deger !== "string") return null;
  const m = deger.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseBeyannameWorkbook(buffer: Buffer): { rows: InsertBeyanname[] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.includes("İthalat Raporu")
    ? "İthalat Raporu"
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (!grid.length) throw new Error(`"${sheetName}" sayfası boş`);

  // Başlık doğrulaması — uyuşmazlıkta yükleme REDDEDİLİR.
  // Sessiz sıfır-satır ithalatı yasak (gümrük fatura_tarihi dersinden).
  const baslikSatiri = grid[0];
  const sorunlar: string[] = [];
  for (const [harf, beklenen] of Object.entries(BEKLENEN_BASLIKLAR)) {
    const idx = XLSX.utils.decode_col(harf);
    const bulunan = String(baslikSatiri[idx] ?? "").trim();
    if (bulunan !== beklenen) {
      sorunlar.push(`${harf} sütunu "${beklenen}" olmalı, "${bulunan}" bulundu`);
    }
  }
  if (sorunlar.length) {
    throw new Error(`Excel başlıkları uyuşmuyor: ${sorunlar.join("; ")}`);
  }

  const col = (harf: string) => XLSX.utils.decode_col(harf);
  const metin = (v: unknown) => (v == null ? null : String(v).trim() || null);
  const rows: InsertBeyanname[] = [];
  for (let r = 1; r < grid.length; r++) {
    const satir = grid[r];
    if (!satir) continue;
    const dosyaNo = String(satir[col("A")] ?? "").trim();
    if (!dosyaNo) continue; // boş satır — atla
    rows.push({
      dosyaNo,
      alici: metin(satir[col("B")]),
      gonderen: metin(satir[col("D")]),
      koli: typeof satir[col("F")] === "number" ? (satir[col("F")] as number) : null,
      gumrukIdaresi: metin(satir[col("I")]),
      beyanTarihi: parseBeyanTarihi(satir[col("K")]),
      beyanNo: metin(satir[col("L")]),
      fatBedeli: typeof satir[col("M")] === "number" ? String(satir[col("M")]) : null,
      doviz: metin(satir[col("N")]),
      kullanici: metin(satir[col("AV")]),
    });
  }
  return { rows };
}
```

- [ ] **Step 2: Rotayı ekle**

`server/routes.ts` — `uploadMizanMemory` tanımının altına multer tanımı ekle:

```ts
// Beyanname Excel — memory storage; upsert route handler'ında yapılır
const uploadBeyannameMemory = multer({ storage: multer.memoryStorage() });
```

Import bloğuna (mevcut `import { parseMizanXlsx } from "./mizanParser";` satırının yanına) ekle:

```ts
import { parseBeyannameWorkbook } from "./beyannameParser";
```

`registerRoutes` fonksiyonunun içine, mevcut rotaların sonuna (fonksiyonun kapanışından önce) ekle:

```ts
  // ==================== ÖDEMELER PORTALI: YÖNETİM ====================

  // Beyanname Excel yükleme — DOSYA NO ile upsert (yönetim paneli)
  app.post("/api/odemeler/beyanname-excel", uploadBeyannameMemory.single("dosya"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Dosya gerekli" });
      const { rows } = parseBeyannameWorkbook(req.file.buffer);
      if (!rows.length) return res.status(400).json({ error: "Excel'de veri satırı bulunamadı" });
      const sonuc = await storage.upsertBeyannameler(rows);
      const eslesmeyen = await storage.getEslesmeyenBeyannameKullanicilari();
      res.json({ toplam: rows.length, ...sonuc, eslesmeyen });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: hatasız.

- [ ] **Step 4: Gerçek Excel ile doğrula**

Dev sunucu çalışıyor olmalı (`npm run dev`, port 5000).

Run: `curl -s -F "dosya=@BEYANNAME LİSTESİ.xlsx" http://localhost:5000/api/odemeler/beyanname-excel`
Expected: `{"toplam":277,"eklenen":277,"guncellenen":0,"eslesmeyen":[...]}` — henüz kullanıcı olmadığından tüm AV adları (SÜLEYMAN, EMİRHAN, …) `eslesmeyen` listesinde.

Run (idempotens): aynı curl'ü tekrar çalıştır.
Expected: `{"toplam":277,"eklenen":0,"guncellenen":277,...}` — upsert çalışıyor.

- [ ] **Step 5: Commit**

```bash
git add server/beyannameParser.ts server/routes.ts
git commit -m "feat(odemeler): beyanname excel parser + dosya no ile upsert rotasi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Portal oturum rotaları + yönetim kullanıcı rotaları

**Files:**
- Modify: `server/routes.ts`

**Interfaces:**
- Consumes: `hashSifre`, `dogrulaSifre`, `requirePortal` (Task 2); `storage.getPortalKullanici*`, `create/updatePortalKullanici` (Task 3); `insertPortalKullaniciSchema`, `PortalKullanici` (Task 1).
- Produces:
  - `POST /api/portal/login` → `{ id, adSoyad, rol, avAdi }`; hatalıda `401 {error}`
  - `POST /api/portal/logout` → `{ ok: true }`
  - `GET /api/portal/me` → `{ id, adSoyad, rol, avAdi }` veya 401
  - `GET/POST/PUT /api/odemeler/kullanicilar[/:id]` — yanıtlarda `sifreHash` ASLA yok
  - Yardımcılar (Task 6 kullanır): `portalKullanici(req): Promise<PortalKullanici | null>` (aktif kullanıcıyı oturumdan yükler), `bugunYmd(): string`

- [ ] **Step 1: Import'ları ekle**

`server/routes.ts` import bölümüne ekle:

```ts
import { hashSifre, dogrulaSifre, requirePortal, requireMuhasebe } from "./portalAuth";
import { insertPortalKullaniciSchema, type PortalKullanici, type InsertPortalKullanici } from "@shared/schema";
import type { Request } from "express";
```

(`Request` zaten import ediliyorsa bu satırı atla.)

- [ ] **Step 2: Yardımcıları ve rotaları ekle**

`registerRoutes` içine, Task 4'te eklenen beyanname-excel rotasının altına ekle:

```ts
  // ==================== ÖDEMELER PORTALI: OTURUM ====================

  // Oturumdaki AKTİF kullanıcıyı yükler; yoksa null.
  // Rol/kimlik daima sunucudan okunur — istemci parametresine güvenilmez.
  async function portalKullanici(req: Request): Promise<PortalKullanici | null> {
    if (!req.session.portalUserId) return null;
    const k = await storage.getPortalKullanici(req.session.portalUserId);
    return k && k.aktif ? k : null;
  }

  // Yerel tarih YYYY-MM-DD (saklama formatı)
  function bugunYmd(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function sanitizePortalKullanici(k: PortalKullanici) {
    const { sifreHash, ...rest } = k;
    return rest;
  }

  app.post("/api/portal/login", async (req, res) => {
    try {
      const { kullaniciAdi, sifre } = req.body || {};
      if (!kullaniciAdi || !sifre) {
        return res.status(400).json({ error: "Kullanıcı adı ve şifre gerekli" });
      }
      const k = await storage.getPortalKullaniciByKullaniciAdi(String(kullaniciAdi).trim());
      if (!k || !(await dogrulaSifre(String(sifre), k.sifreHash))) {
        return res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı" });
      }
      if (!k.aktif) return res.status(401).json({ error: "Hesap kapalı" });
      req.session.portalUserId = k.id;
      req.session.portalRol = k.rol;
      res.json({ id: k.id, adSoyad: k.adSoyad, rol: k.rol, avAdi: k.avAdi });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/portal/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/portal/me", requirePortal, async (req, res) => {
    const k = await portalKullanici(req);
    if (!k) return res.status(401).json({ error: "Giriş gerekli" });
    res.json({ id: k.id, adSoyad: k.adSoyad, rol: k.rol, avAdi: k.avAdi });
  });

  // ==================== ÖDEMELER PORTALI: KULLANICI YÖNETİMİ (yönetim paneli) ====================

  app.get("/api/odemeler/kullanicilar", async (_req, res) => {
    const liste = await storage.getPortalKullanicilar();
    res.json(liste.map(sanitizePortalKullanici));
  });

  app.post("/api/odemeler/kullanicilar", async (req, res) => {
    try {
      const { sifre, ...alanlar } = req.body || {};
      if (!sifre || String(sifre).length < 4) {
        return res.status(400).json({ error: "Şifre en az 4 karakter olmalı" });
      }
      const parsed = insertPortalKullaniciSchema.omit({ sifreHash: true }).parse(alanlar);
      if (!["temsilci", "muhasebe"].includes(parsed.rol)) {
        return res.status(400).json({ error: "Geçersiz rol" });
      }
      const mevcut = await storage.getPortalKullaniciByKullaniciAdi(parsed.kullaniciAdi);
      if (mevcut) return res.status(400).json({ error: "Bu kullanıcı adı zaten var" });
      const k = await storage.createPortalKullanici({
        ...parsed,
        avAdi: parsed.avAdi ? parsed.avAdi.trim() : null,
        sifreHash: await hashSifre(String(sifre)),
      });
      res.json(sanitizePortalKullanici(k));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/odemeler/kullanicilar/:id", async (req, res) => {
    try {
      // Alan beyaz listesi — sifreHash dışarıdan yazılamaz
      const izinli: Partial<InsertPortalKullanici> = {};
      if (typeof req.body?.adSoyad === "string" && req.body.adSoyad.trim()) {
        izinli.adSoyad = req.body.adSoyad.trim();
      }
      if (["temsilci", "muhasebe"].includes(req.body?.rol)) izinli.rol = req.body.rol;
      if (req.body?.avAdi !== undefined) {
        izinli.avAdi = req.body.avAdi ? String(req.body.avAdi).trim() : null;
      }
      if (typeof req.body?.aktif === "boolean") izinli.aktif = req.body.aktif;
      if (req.body?.sifre) {
        if (String(req.body.sifre).length < 4) {
          return res.status(400).json({ error: "Şifre en az 4 karakter olmalı" });
        }
        izinli.sifreHash = await hashSifre(String(req.body.sifre));
      }
      const k = await storage.updatePortalKullanici(req.params.id, izinli);
      if (!k) return res.status(404).json({ error: "Bulunamadı" });
      res.json(sanitizePortalKullanici(k));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: hatasız.

- [ ] **Step 4: curl ile uçtan uca doğrula**

Dev sunucu ayakta olmalı. Sırayla:

```bash
# 1) Kullanıcı oluştur (temsilci, AV eşleşmesi SÜLEYMAN)
curl -s -X POST http://localhost:5000/api/odemeler/kullanicilar \
  -H "Content-Type: application/json" \
  -d '{"kullaniciAdi":"suleyman","adSoyad":"Süleyman Test","rol":"temsilci","avAdi":"SÜLEYMAN","sifre":"1234"}'
# Beklenen: {"id":"...","kullaniciAdi":"suleyman",...} — sifreHash YOK

# 2) Girişsiz me → 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/portal/me
# Beklenen: 401

# 3) Login (çerez sakla)
curl -s -c "$TEMP/portal-cookies.txt" -X POST http://localhost:5000/api/portal/login \
  -H "Content-Type: application/json" -d '{"kullaniciAdi":"suleyman","sifre":"1234"}'
# Beklenen: {"id":"...","adSoyad":"Süleyman Test","rol":"temsilci","avAdi":"SÜLEYMAN"}

# 4) me (çerezle)
curl -s -b "$TEMP/portal-cookies.txt" http://localhost:5000/api/portal/me
# Beklenen: aynı kimlik JSON'u

# 5) Yanlış şifre → 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5000/api/portal/login \
  -H "Content-Type: application/json" -d '{"kullaniciAdi":"suleyman","sifre":"yanlis"}'
# Beklenen: 401
```

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(odemeler): portal login/logout/me + yonetim kullanici rotalari

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Portal veri rotaları — beyanname, masraf türü, talep, ödeme, iade + yönetim özet

**Files:**
- Modify: `server/routes.ts`

**Interfaces:**
- Consumes: `portalKullanici(req)`, `bugunYmd()` (Task 5); `requirePortal`, `requireMuhasebe` (Task 2); storage metodları (Task 3); `fixUploadFilename` (routes.ts'te mevcut).
- Produces:
  - `GET /api/portal/beyannameler` — temsilci: yalnız kendi `avAdi`'sininkiler (SUNUCUDA filtre); muhasebe: hepsi
  - `GET /api/portal/masraf-turleri` — yalnız aktifler
  - `POST /api/portal/talepler` — multipart, dosya alanı `belgeler` (max 10); alanlar: `beyannameId, odemeTipi, masrafTuru, tutar, paraBirimi, alacakli, iban, aciklama`
  - `GET /api/portal/talepler` → `OdemeTalepDetay[]` (temsilci: kendininkiler; muhasebe: hepsi)
  - `POST /api/portal/talepler/:id/odeme` — multipart `dekont` (zorunlu, 1) + `konsimento` (ops., 1); yalnız muhasebe
  - `PUT /api/portal/talepler/:id/iade` — JSON `{ iadeDurumu, iadeTutari?, iadeTarihi?, iadeNotu? }`; yalnız muhasebe
  - `GET/POST/PUT /api/odemeler/masraf-turleri[/:id]`, `GET /api/odemeler/ozet`

- [ ] **Step 1: Multer tanımı ekle**

`uploadBeyannameMemory` tanımının altına:

```ts
const odemeBelgeStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "uploads/odemeler";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `odeme-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});
const uploadOdemeBelge = multer({ storage: odemeBelgeStorage });
```

- [ ] **Step 2: Portal veri rotalarını ekle**

Task 5 rotalarının altına:

```ts
  // ==================== ÖDEMELER PORTALI: VERİ ====================

  app.get("/api/portal/beyannameler", requirePortal, async (req, res) => {
    const ben = await portalKullanici(req);
    if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
    // Filtre SUNUCUDA: temsilci yalnız kendi (avAdi) beyannamelerini görür.
    // avAdi atanmamış temsilci hiçbir şey görmez (boş string hiçbir kullaniciyla eşleşmez).
    const liste = ben.rol === "muhasebe"
      ? await storage.getBeyannameler()
      : await storage.getBeyannameler(ben.avAdi ?? "");
    res.json(liste);
  });

  app.get("/api/portal/masraf-turleri", requirePortal, async (_req, res) => {
    res.json(await storage.getMasrafTurleri(true));
  });

  app.post("/api/portal/talepler", requirePortal, uploadOdemeBelge.array("belgeler", 10), async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const { beyannameId, odemeTipi, masrafTuru, tutar, paraBirimi, alacakli, iban, aciklama } = req.body || {};

      const beyanname = await storage.getBeyanname(String(beyannameId || ""));
      if (!beyanname) return res.status(400).json({ error: "Beyanname bulunamadı" });
      if (ben.rol === "temsilci" && beyanname.kullanici !== ben.avAdi) {
        return res.status(403).json({ error: "Bu beyanname size ait değil" });
      }
      if (!["masraf", "depo_teminat"].includes(String(odemeTipi))) {
        return res.status(400).json({ error: "Geçersiz ödeme tipi" });
      }
      const tutarNum = parseFloat(String(tutar ?? "").replace(",", "."));
      if (!isFinite(tutarNum) || tutarNum <= 0) return res.status(400).json({ error: "Geçersiz tutar" });
      const alacakliStr = String(alacakli ?? "").trim();
      if (!alacakliStr) return res.status(400).json({ error: "Alacaklı (kime ödenecek) zorunlu" });
      // Depo teminatında masraf türü sabittir; masrafta listeden gelir.
      const masrafTuruStr = odemeTipi === "depo_teminat" ? "Depo Teminatı" : String(masrafTuru ?? "").trim();
      if (!masrafTuruStr) return res.status(400).json({ error: "Masraf türü zorunlu" });

      const talep = await storage.createOdemeTalep({
        beyannameId: beyanname.id,
        talepEdenId: ben.id,
        odemeTipi: String(odemeTipi),
        masrafTuru: masrafTuruStr,
        tutar: String(tutarNum),
        paraBirimi: ["TRY", "USD", "EUR"].includes(String(paraBirimi)) ? String(paraBirimi) : "TRY",
        alacakli: alacakliStr,
        iban: iban ? String(iban).trim() : null,
        aciklama: aciklama ? String(aciklama) : null,
        durum: "bekliyor",
        talepTarihi: bugunYmd(),
        iadeDurumu: odemeTipi === "depo_teminat" ? "beklemede" : null,
      });

      const dosyalar = (req.files as Express.Multer.File[]) || [];
      for (const f of dosyalar) {
        await storage.createOdemeBelge({
          talepId: talep.id,
          belgeTipi: "fatura",
          filename: fixUploadFilename(f.originalname),
          filepath: f.path.replace(/\\/g, "/"),
          yukleyenId: ben.id,
        });
      }
      res.json(talep);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/portal/talepler", requirePortal, async (req, res) => {
    const ben = await portalKullanici(req);
    if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
    const filtre = ben.rol === "muhasebe" ? {} : { talepEdenId: ben.id };
    res.json(await storage.getOdemeTalepleri(filtre));
  });

  app.post(
    "/api/portal/talepler/:id/odeme",
    requireMuhasebe,
    uploadOdemeBelge.fields([
      { name: "dekont", maxCount: 1 },
      { name: "konsimento", maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const ben = await portalKullanici(req);
        if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
        const talep = await storage.getOdemeTalep(req.params.id);
        if (!talep) return res.status(404).json({ error: "Bulunamadı" });
        if (talep.durum === "odendi") return res.status(400).json({ error: "Talep zaten ödendi" });

        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        const dekont = files?.dekont?.[0];
        if (!dekont) return res.status(400).json({ error: "Dekont dosyası zorunlu" });

        await storage.createOdemeBelge({
          talepId: talep.id,
          belgeTipi: "dekont",
          filename: fixUploadFilename(dekont.originalname),
          filepath: dekont.path.replace(/\\/g, "/"),
          yukleyenId: ben.id,
        });
        const konsimento = files?.konsimento?.[0];
        if (konsimento) {
          await storage.createOdemeBelge({
            talepId: talep.id,
            belgeTipi: "konsimento",
            filename: fixUploadFilename(konsimento.originalname),
            filepath: konsimento.path.replace(/\\/g, "/"),
            yukleyenId: ben.id,
          });
        }
        const guncel = await storage.updateOdemeTalep(talep.id, {
          durum: "odendi",
          odemeTarihi: bugunYmd(),
          odeyenId: ben.id,
        });
        res.json(guncel);
      } catch (e: any) {
        res.status(400).json({ error: e.message });
      }
    },
  );

  app.put("/api/portal/talepler/:id/iade", requireMuhasebe, async (req, res) => {
    try {
      const talep = await storage.getOdemeTalep(req.params.id);
      if (!talep) return res.status(404).json({ error: "Bulunamadı" });
      if (talep.odemeTipi !== "depo_teminat") {
        return res.status(400).json({ error: "Yalnız depo teminatları iade takibindedir" });
      }
      const { iadeDurumu, iadeTutari, iadeTarihi, iadeNotu } = req.body || {};
      if (!["beklemede", "iade_edildi"].includes(String(iadeDurumu))) {
        return res.status(400).json({ error: "Geçersiz iade durumu" });
      }
      const guncel = await storage.updateOdemeTalep(talep.id, {
        iadeDurumu: String(iadeDurumu),
        iadeTutari: iadeTutari != null && String(iadeTutari) !== "" ? String(iadeTutari) : null,
        iadeTarihi: iadeTarihi ? String(iadeTarihi) : null,
        iadeNotu: iadeNotu ? String(iadeNotu) : null,
      });
      if (!guncel) return res.status(404).json({ error: "Bulunamadı" });
      res.json(guncel);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ==================== ÖDEMELER: YÖNETİM PANELİ EK ROTALAR ====================

  app.get("/api/odemeler/masraf-turleri", async (_req, res) => {
    res.json(await storage.getMasrafTurleri());
  });

  app.post("/api/odemeler/masraf-turleri", async (req, res) => {
    try {
      const ad = String(req.body?.ad ?? "").trim();
      if (!ad) return res.status(400).json({ error: "Ad zorunlu" });
      const sira = Number.isFinite(Number(req.body?.sira)) ? Number(req.body.sira) : 0;
      const yeni = await storage.createMasrafTuru({ ad, sira, aktif: true });
      res.json(yeni);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/odemeler/masraf-turleri/:id", async (req, res) => {
    try {
      const izinli: { ad?: string; aktif?: boolean; sira?: number } = {};
      if (typeof req.body?.ad === "string" && req.body.ad.trim()) izinli.ad = req.body.ad.trim();
      if (typeof req.body?.aktif === "boolean") izinli.aktif = req.body.aktif;
      if (Number.isFinite(Number(req.body?.sira))) izinli.sira = Number(req.body.sira);
      const guncel = await storage.updateMasrafTuru(req.params.id, izinli);
      if (!guncel) return res.status(404).json({ error: "Bulunamadı" });
      res.json(guncel);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // İzleme sayfası: tüm talepler + eşleşmeyen beyanname kullanıcıları
  app.get("/api/odemeler/ozet", async (_req, res) => {
    const [talepler, eslesmeyen] = await Promise.all([
      storage.getOdemeTalepleri({}),
      storage.getEslesmeyenBeyannameKullanicilari(),
    ]);
    res.json({ talepler, eslesmeyen });
  });
```

- [ ] **Step 3: Tip kontrolü**

Run: `npm run check`
Expected: hatasız.

- [ ] **Step 4: curl ile tam akışı doğrula**

Dev sunucu ayakta; Task 4'te Excel yüklendi, Task 5'te `suleyman` kullanıcısı ve çerezi var.

```bash
# 0) Muhasebe kullanıcısı oluştur + ayrı çerezle login
curl -s -X POST http://localhost:5000/api/odemeler/kullanicilar \
  -H "Content-Type: application/json" \
  -d '{"kullaniciAdi":"muhasebe","adSoyad":"Muhasebe Test","rol":"muhasebe","sifre":"1234"}'
curl -s -c "$TEMP/muhasebe-cookies.txt" -X POST http://localhost:5000/api/portal/login \
  -H "Content-Type: application/json" -d '{"kullaniciAdi":"muhasebe","sifre":"1234"}'

# 1) Temsilci beyanname listesi — yalnız SÜLEYMAN'ınkiler gelmeli
curl -s -b "$TEMP/portal-cookies.txt" http://localhost:5000/api/portal/beyannameler | head -c 600
# Beklenen: JSON dizi; her kayıtta "kullanici":"SÜLEYMAN". İlk kaydın "id"sini not al → BEYAN_ID

# 2) Masraf türleri
curl -s -b "$TEMP/portal-cookies.txt" http://localhost:5000/api/portal/masraf-turleri
# Beklenen: Ardiye, Liman Masrafı, Demuraj, Tahmil-Tahliye, Ordino, Diğer

# 3) Talep oluştur (test faturası ekiyle)
echo "test fatura" > "$TEMP/fatura-test.pdf"
curl -s -b "$TEMP/portal-cookies.txt" -X POST http://localhost:5000/api/portal/talepler \
  -F "beyannameId=BEYAN_ID" -F "odemeTipi=masraf" -F "masrafTuru=Ardiye" \
  -F "tutar=1500,50" -F "paraBirimi=TRY" -F "alacakli=Test Liman A.Ş." \
  -F "aciklama=curl testi" -F "belgeler=@$TEMP/fatura-test.pdf"
# Beklenen: {"id":"...","durum":"bekliyor","talepTarihi":"2026-07-04",...} → TALEP_ID not al

# 4) Depo teminatı talebi de oluştur (aynı komut, odemeTipi=depo_teminat, masrafTuru boş)
curl -s -b "$TEMP/portal-cookies.txt" -X POST http://localhost:5000/api/portal/talepler \
  -F "beyannameId=BEYAN_ID" -F "odemeTipi=depo_teminat" \
  -F "tutar=5000" -F "paraBirimi=TRY" -F "alacakli=Depo A.Ş."
# Beklenen: "masrafTuru":"Depo Teminatı","iadeDurumu":"beklemede" → DEPO_ID not al

# 5) Temsilci kendi taleplerini görür
curl -s -b "$TEMP/portal-cookies.txt" http://localhost:5000/api/portal/talepler | head -c 800
# Beklenen: 2 talep, belgeler dizisinde fatura kaydı, beyanname nesnesi dolu

# 6) Temsilci ödeme yapamaz → 403
echo "test dekont" > "$TEMP/dekont-test.pdf"
curl -s -o /dev/null -w "%{http_code}" -b "$TEMP/portal-cookies.txt" -X POST \
  http://localhost:5000/api/portal/talepler/TALEP_ID/odeme -F "dekont=@$TEMP/dekont-test.pdf"
# Beklenen: 403

# 7) Muhasebe dekontsuz ödeme yapamaz → 400
curl -s -b "$TEMP/muhasebe-cookies.txt" -X POST \
  http://localhost:5000/api/portal/talepler/TALEP_ID/odeme -F "bos=1"
# Beklenen: {"error":"Dekont dosyası zorunlu"}

# 8) Muhasebe dekontla öder
curl -s -b "$TEMP/muhasebe-cookies.txt" -X POST \
  http://localhost:5000/api/portal/talepler/TALEP_ID/odeme -F "dekont=@$TEMP/dekont-test.pdf"
# Beklenen: "durum":"odendi","odemeTarihi":"2026-07-04","odeyenId":"..."

# 9) İade işaretle (depo talebini önce öde, sonra iade et)
curl -s -b "$TEMP/muhasebe-cookies.txt" -X POST \
  http://localhost:5000/api/portal/talepler/DEPO_ID/odeme \
  -F "dekont=@$TEMP/dekont-test.pdf" -F "konsimento=@$TEMP/fatura-test.pdf"
curl -s -b "$TEMP/muhasebe-cookies.txt" -X PUT \
  http://localhost:5000/api/portal/talepler/DEPO_ID/iade \
  -H "Content-Type: application/json" \
  -d '{"iadeDurumu":"iade_edildi","iadeTutari":"4500","iadeTarihi":"2026-07-04","iadeNotu":"500 TL demuraj kesintisi"}'
# Beklenen: "iadeDurumu":"iade_edildi","iadeTutari":"4500.00"

# 10) Masraf talebine iade denenirse → 400
curl -s -b "$TEMP/muhasebe-cookies.txt" -X PUT \
  http://localhost:5000/api/portal/talepler/TALEP_ID/iade \
  -H "Content-Type: application/json" -d '{"iadeDurumu":"iade_edildi"}'
# Beklenen: {"error":"Yalnız depo teminatları iade takibindedir"}

# 11) Özet (yönetim)
curl -s http://localhost:5000/api/odemeler/ozet | head -c 400
# Beklenen: {"talepler":[...2 kayıt...],"eslesmeyen":[...]}
```

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(odemeler): talep/odeme/iade rotalari + masraf turu ve ozet API

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Portal frontend kabuğu — giriş ekranı + App.tsx kablolama

**Files:**
- Create: `client/src/pages/portal/portalUtils.ts`
- Create: `client/src/pages/portal/PortalLogin.tsx`
- Create: `client/src/pages/portal/PortalApp.tsx`
- Create: `client/src/pages/portal/TemsilciPanel.tsx` (bu görevde geçici iskelet — Task 8 doldurur)
- Create: `client/src/pages/portal/MuhasebePanel.tsx` (geçici iskelet — Task 9 doldurur)
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/portal/me`, `POST /api/portal/login`, `POST /api/portal/logout` (Task 5); `apiRequest`, `getQueryFn`, `queryClient` (`@/lib/queryClient` — `credentials: "include"` zaten var).
- Produces (Task 8-9 bunları kullanır):
  - `PortalApp` (default export) — `/portal` rotasının bileşeni
  - `export type PortalMe = { id: string; adSoyad: string; rol: "temsilci" | "muhasebe"; avAdi: string | null }`
  - `portalUtils.ts`: `TalepDetay` tipi, `formatTarih(ymd)`, `formatPara(tutar, doviz?)`, `gunFarki(ymd)`, `TIP_ETIKET`, `DURUM_ETIKET`, `IADE_ETIKET`, `belgeUrl(b)`
  - `TemsilciPanel({ me }: { me: PortalMe })` ve `MuhasebePanel()` (default exportlar)

- [ ] **Step 1: portalUtils.ts oluştur**

```ts
import type { OdemeTalep, Beyanname, OdemeBelge } from "@shared/schema";

// Sunucudaki OdemeTalepDetay'ın istemci karşılığı
export type TalepDetay = OdemeTalep & {
  beyanname: Beyanname | null;
  talepEdenAd: string;
  belgeler: OdemeBelge[];
};

// "YYYY-MM-DD" → "dd/mm/yyyy" — new Date() KULLANILMAZ (timezone tuzağı)
export function formatTarih(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatPara(tutar: string | number | null | undefined, doviz?: string | null): string {
  if (tutar == null) return "—";
  const n = typeof tutar === "string" ? parseFloat(tutar) : tutar;
  if (!isFinite(n)) return "—";
  return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${doviz ?? ""}`.trim();
}

// Bugüne uzaklık (gün) — YYYY-MM-DD, UTC aritmetiği (kayma yok)
export function gunFarki(ymd: string | null | undefined): number | null {
  if (!ymd) return null;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const o = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const simdi = new Date();
  const bugun = Date.UTC(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
  return Math.round((bugun - o) / 86400000);
}

export const TIP_ETIKET: Record<string, string> = {
  masraf: "Masraf",
  depo_teminat: "Depo Teminatı",
};

export const DURUM_ETIKET: Record<string, string> = {
  bekliyor: "Bekliyor",
  odendi: "Ödendi",
};

export const IADE_ETIKET: Record<string, string> = {
  beklemede: "İade Bekleniyor",
  iade_edildi: "İade Alındı",
};

export const BELGE_ETIKET: Record<string, string> = {
  fatura: "Fatura",
  dekont: "Dekont",
  konsimento: "Konşimento",
};

export function belgeUrl(b: OdemeBelge): string {
  return "/" + b.filepath.replace(/^\/+/, "");
}
```

- [ ] **Step 2: PortalLogin.tsx oluştur**

```tsx
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export default function PortalLogin() {
  const [kullaniciAdi, setKullaniciAdi] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const girisYap = async (e: React.FormEvent) => {
    e.preventDefault();
    setGonderiliyor(true);
    setHata("");
    try {
      await apiRequest("POST", "/api/portal/login", { kullaniciAdi: kullaniciAdi.trim(), sifre });
      await queryClient.invalidateQueries({ queryKey: ["/api/portal/me"] });
    } catch (err: any) {
      const mesaj = String(err?.message ?? "");
      setHata(mesaj.includes("Hesap kapalı") ? "Hesap kapalı" : "Kullanıcı adı veya şifre hatalı");
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <form onSubmit={girisYap} className="p-8 bg-white rounded-xl shadow-lg border max-w-sm w-full space-y-4">
        <div className="flex justify-center mb-2 text-primary">
          <Lock className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-center">Ödemeler Portalı</h2>
        <p className="text-sm text-center text-slate-500">Kullanıcı adınız ve şifrenizle giriş yapın.</p>
        <Input
          placeholder="Kullanıcı adı"
          value={kullaniciAdi}
          onChange={(e) => setKullaniciAdi(e.target.value)}
          autoFocus
          data-testid="input-portal-kullanici"
        />
        <Input
          type="password"
          placeholder="Şifre"
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          data-testid="input-portal-sifre"
        />
        {hata && <p className="text-xs text-red-500">{hata}</p>}
        <Button type="submit" className="w-full" disabled={gonderiliyor} data-testid="button-portal-giris">
          {gonderiliyor ? "Giriş yapılıyor…" : "Giriş Yap"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: PortalApp.tsx oluştur**

```tsx
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import PortalLogin from "./PortalLogin";
import TemsilciPanel from "./TemsilciPanel";
import MuhasebePanel from "./MuhasebePanel";

export type PortalMe = {
  id: string;
  adSoyad: string;
  rol: "temsilci" | "muhasebe";
  avAdi: string | null;
};

export default function PortalApp() {
  const { data: me, isLoading } = useQuery<PortalMe | null>({
    queryKey: ["/api/portal/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Yükleniyor…
      </div>
    );
  }
  if (!me) return <PortalLogin />;

  const cikisYap = async () => {
    await apiRequest("POST", "/api/portal/logout");
    queryClient.setQueryData(["/api/portal/me"], null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between h-14 px-4 border-b sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="CNC" className="h-8 w-auto object-contain" />
          <span className="font-semibold">Ödemeler Portalı</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {me.adSoyad} — {me.rol === "muhasebe" ? "Muhasebe" : "Müşteri Temsilcisi"}
          </span>
          <Button variant="ghost" size="sm" onClick={cikisYap} data-testid="button-portal-cikis">
            <LogOut className="w-4 h-4 mr-1" />
            Çıkış
          </Button>
        </div>
      </header>
      <main className="p-4 max-w-6xl mx-auto">
        {me.rol === "muhasebe" ? <MuhasebePanel /> : <TemsilciPanel me={me} />}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Geçici panel iskeletleri**

`client/src/pages/portal/TemsilciPanel.tsx`:

```tsx
import { type PortalMe } from "./PortalApp";

export default function TemsilciPanel({ me }: { me: PortalMe }) {
  return <div className="text-muted-foreground">Talep formu yükleniyor… ({me.adSoyad})</div>;
}
```

`client/src/pages/portal/MuhasebePanel.tsx`:

```tsx
export default function MuhasebePanel() {
  return <div className="text-muted-foreground">Muhasebe ekranı yükleniyor…</div>;
}
```

- [ ] **Step 5: App.tsx kablolaması**

`client/src/App.tsx` içinde dört düzenleme:

1. Import bloğuna (`import NotFound from "@/pages/not-found";` üstüne) ekle:

```tsx
import PortalApp from "@/pages/portal/PortalApp";
```

2. `Router` fonksiyonundaki `<Switch>` içine, `<Route component={NotFound} />` satırından ÖNCE ekle:

```tsx
      <Route path="/portal" component={PortalApp} />
```

3. `AppContent` içindeki bypass koşulunu güncelle — mevcut:

```tsx
  if (location.startsWith("/survey/") || location.startsWith("/egitim-degerlendirme/")) {
    return <Router />;
  }
```

şu hale getir:

```tsx
  if (
    location.startsWith("/survey/") ||
    location.startsWith("/egitim-degerlendirme/") ||
    location.startsWith("/portal")
  ) {
    return <Router />;
  }
```

(Not: spec'teki `/portal/taleplerim` ve `/portal/muhasebe` yolları tek `/portal` rotasında role göre render edilir — çalışan tek URL ezberler, rol doğru ekranı belirler.)

- [ ] **Step 6: Tip kontrolü + tarayıcı doğrulaması**

Run: `npm run check`
Expected: hatasız.

Dev sunucu ayaktayken tarayıcıda `http://localhost:5000/portal` aç:
- Giriş ekranı görünmeli (yönetim şifre kapısı DEĞİL).
- `suleyman` / `1234` ile girince "Talep formu yükleniyor… (Süleyman Test)" ve üst bar (ad + Çıkış) görünmeli.
- Çıkış'a basınca giriş ekranına dönmeli.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/portal/portalUtils.ts client/src/pages/portal/PortalLogin.tsx client/src/pages/portal/PortalApp.tsx client/src/pages/portal/TemsilciPanel.tsx client/src/pages/portal/MuhasebePanel.tsx client/src/App.tsx
git commit -m "feat(odemeler): portal kabugu - giris ekrani, oturum, rol yonlendirme

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Temsilci paneli — talep formu + taleplerim tablosu

**Files:**
- Modify: `client/src/pages/portal/TemsilciPanel.tsx` (iskeleti tam implementasyonla değiştir)

**Interfaces:**
- Consumes: `GET /api/portal/beyannameler`, `GET /api/portal/masraf-turleri`, `POST /api/portal/talepler` (multipart), `GET /api/portal/talepler`; `portalUtils` yardımcıları; `PortalMe` (Task 7); shadcn `Card, Input, Button, Textarea, Badge, Select, Table` bileşenleri; `useToast` (`@/hooks/use-toast`).
- Produces: `TemsilciPanel({ me })` default export — Task 7'deki iskeletle aynı imza, davranış tamamlanır.

- [ ] **Step 1: TemsilciPanel.tsx'i tam implementasyonla değiştir**

Dosyanın tüm içeriğini şununla değiştir:

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, MasrafTuru } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { type PortalMe } from "./PortalApp";
import {
  type TalepDetay, formatTarih, formatPara,
  TIP_ETIKET, DURUM_ETIKET, IADE_ETIKET, BELGE_ETIKET, belgeUrl,
} from "./portalUtils";

export default function TemsilciPanel({ me }: { me: PortalMe }) {
  const { toast } = useToast();
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({
    queryKey: ["/api/portal/beyannameler"],
  });
  const { data: masrafTurleri = [] } = useQuery<MasrafTuru[]>({
    queryKey: ["/api/portal/masraf-turleri"],
  });
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
    refetchInterval: 30000, // muhasebe "Ödendi" yapınca 30 sn içinde görünür
  });

  // Form durumu
  const [arama, setArama] = useState("");
  const [beyannameId, setBeyannameId] = useState("");
  const [odemeTipi, setOdemeTipi] = useState<"masraf" | "depo_teminat">("masraf");
  const [masrafTuru, setMasrafTuru] = useState("");
  const [tutar, setTutar] = useState("");
  const [paraBirimi, setParaBirimi] = useState("TRY");
  const [alacakli, setAlacakli] = useState("");
  const [iban, setIban] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [dosyalar, setDosyalar] = useState<FileList | null>(null);
  const [formSayac, setFormSayac] = useState(0); // dosya input'unu sıfırlamak için remount anahtarı
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const filtreliBeyannameler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return beyannameler;
    return beyannameler.filter(
      (b) =>
        b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
        (b.alici ?? "").toLocaleLowerCase("tr").includes(q) ||
        (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q),
    );
  }, [beyannameler, arama]);

  const secili = beyannameler.find((b) => b.id === beyannameId);

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!beyannameId) {
      toast({ title: "Beyanname seçin", variant: "destructive" });
      return;
    }
    if (!tutar.trim() || !alacakli.trim()) {
      toast({ title: "Tutar ve alacaklı zorunlu", variant: "destructive" });
      return;
    }
    if (odemeTipi === "masraf" && !masrafTuru) {
      toast({ title: "Masraf türü seçin", variant: "destructive" });
      return;
    }
    setGonderiliyor(true);
    try {
      const fd = new FormData();
      fd.set("beyannameId", beyannameId);
      fd.set("odemeTipi", odemeTipi);
      fd.set("masrafTuru", masrafTuru);
      fd.set("tutar", tutar);
      fd.set("paraBirimi", paraBirimi);
      fd.set("alacakli", alacakli);
      fd.set("iban", iban);
      fd.set("aciklama", aciklama);
      if (dosyalar) Array.from(dosyalar).forEach((f) => fd.append("belgeler", f));
      const res = await fetch("/api/portal/talepler", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Talep gönderilemedi");
      toast({ title: "Talep gönderildi", description: "Muhasebe listesine düştü." });
      setBeyannameId("");
      setMasrafTuru("");
      setTutar("");
      setAlacakli("");
      setIban("");
      setAciklama("");
      setDosyalar(null);
      setFormSayac((s) => s + 1);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Yeni Ödeme Talebi</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={gonder} className="space-y-4">
            <div className="space-y-2">
              <Label>Beyanname / Dosya</Label>
              <Input
                placeholder="Dosya no, müşteri veya beyan no ara…"
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                data-testid="input-beyanname-arama"
              />
              <Select value={beyannameId} onValueChange={setBeyannameId}>
                <SelectTrigger data-testid="select-beyanname">
                  <SelectValue placeholder="Beyanname seçin" />
                </SelectTrigger>
                <SelectContent>
                  {filtreliBeyannameler.slice(0, 100).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.dosyaNo} — {b.alici ?? "?"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {secili && (
                <div className="text-xs text-muted-foreground rounded-md border p-2 space-y-0.5">
                  <div><span className="font-medium">Müşteri:</span> {secili.alici ?? "—"}</div>
                  <div><span className="font-medium">Beyan No:</span> {secili.beyanNo ?? "—"}</div>
                  <div>
                    <span className="font-medium">Beyan Tarihi:</span>{" "}
                    {secili.beyanTarihi ? formatTarih(secili.beyanTarihi) : "beyan tarihi yok"}
                  </div>
                  <div><span className="font-medium">Gümrük:</span> {secili.gumrukIdaresi ?? "—"}</div>
                  <div>
                    <span className="font-medium">Fatura:</span>{" "}
                    {formatPara(secili.fatBedeli, secili.doviz)}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Ödeme Tipi</Label>
                <Select
                  value={odemeTipi}
                  onValueChange={(v) => setOdemeTipi(v as "masraf" | "depo_teminat")}
                >
                  <SelectTrigger data-testid="select-odeme-tipi">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="masraf">Normal Masraf</SelectItem>
                    <SelectItem value="depo_teminat">Depo Teminatı</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {odemeTipi === "masraf" && (
                <div className="space-y-2">
                  <Label>Masraf Türü</Label>
                  <Select value={masrafTuru} onValueChange={setMasrafTuru}>
                    <SelectTrigger data-testid="select-masraf-turu">
                      <SelectValue placeholder="Seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {masrafTurleri.map((t) => (
                        <SelectItem key={t.id} value={t.ad}>{t.ad}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Tutar</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="0,00"
                    value={tutar}
                    onChange={(e) => setTutar(e.target.value)}
                    data-testid="input-tutar"
                  />
                  <Select value={paraBirimi} onValueChange={setParaBirimi}>
                    <SelectTrigger className="w-24" data-testid="select-para-birimi">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRY">TRY</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kime Ödenecek (Alacaklı)</Label>
                <Input
                  placeholder="Firma adı"
                  value={alacakli}
                  onChange={(e) => setAlacakli(e.target.value)}
                  data-testid="input-alacakli"
                />
              </div>
              <div className="space-y-2">
                <Label>IBAN (varsa)</Label>
                <Input
                  placeholder="TR.."
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  data-testid="input-iban"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Textarea
                placeholder="Ödemeyle ilgili not…"
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                data-testid="input-aciklama"
              />
            </div>

            <div className="space-y-2">
              <Label>Belgeler (fatura vb. — birden fazla seçilebilir)</Label>
              <Input
                key={formSayac}
                type="file"
                multiple
                onChange={(e) => setDosyalar(e.target.files)}
                data-testid="input-belgeler"
              />
            </div>

            <Button type="submit" disabled={gonderiliyor} data-testid="button-talep-gonder">
              {gonderiliyor ? "Gönderiliyor…" : "Talebi Gönder"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Taleplerim</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Dosya No</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Tutar</TableHead>
                <TableHead>Alacaklı</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Belgeler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {talepler.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Henüz talep yok
                  </TableCell>
                </TableRow>
              )}
              {talepler.map((t) => (
                <TableRow key={t.id} data-testid={`row-talep-${t.id}`}>
                  <TableCell>{formatTarih(t.talepTarihi)}</TableCell>
                  <TableCell>{t.beyanname?.dosyaNo ?? "—"}</TableCell>
                  <TableCell className="max-w-48 truncate">{t.beyanname?.alici ?? "—"}</TableCell>
                  <TableCell>
                    {TIP_ETIKET[t.odemeTipi] ?? t.odemeTipi}
                    {t.odemeTipi === "masraf" ? ` / ${t.masrafTuru}` : ""}
                  </TableCell>
                  <TableCell>{formatPara(t.tutar, t.paraBirimi)}</TableCell>
                  <TableCell className="max-w-40 truncate">{t.alacakli}</TableCell>
                  <TableCell>
                    <Badge variant={t.durum === "odendi" ? "default" : "secondary"}>
                      {DURUM_ETIKET[t.durum] ?? t.durum}
                    </Badge>
                    {t.odemeTipi === "depo_teminat" && t.iadeDurumu && (
                      <Badge variant="outline" className="ml-1">
                        {IADE_ETIKET[t.iadeDurumu] ?? t.iadeDurumu}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {t.belgeler.map((b) => (
                        <a
                          key={b.id}
                          href={belgeUrl(b)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline"
                        >
                          {BELGE_ETIKET[b.belgeTipi] ?? b.belgeTipi}: {b.filename}
                        </a>
                      ))}
                      {t.belgeler.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: hatasız.

- [ ] **Step 3: Tarayıcı doğrulaması**

`http://localhost:5000/portal` → `suleyman` / `1234`:
- Beyanname aramasına "26-100" yaz → dropdown daralmalı; birini seç → müşteri/beyan no/gümrük kutusu dolmalı.
- "Depo Teminatı" seçince Masraf Türü alanı gizlenmeli.
- Dosya ekleyip talep gönder → toast + tabloda "Bekliyor" rozetiyle satır; fatura linki yeni sekmede açılmalı.
- Task 6'da curl ile ödenen talep tabloda "Ödendi" + Dekont linkiyle görünmeli.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/portal/TemsilciPanel.tsx
git commit -m "feat(odemeler): temsilci paneli - beyanname secimli talep formu + taleplerim

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Muhasebe paneli — gelen talepler + ödeme dialogu + depo takibi

**Files:**
- Modify: `client/src/pages/portal/MuhasebePanel.tsx` (iskeleti tam implementasyonla değiştir)

**Interfaces:**
- Consumes: `GET /api/portal/talepler` (muhasebe → hepsi), `POST /api/portal/talepler/:id/odeme` (multipart `dekont` + ops. `konsimento`), `PUT /api/portal/talepler/:id/iade`; `portalUtils`; shadcn `Tabs, Dialog, Card, Table, Badge, Button, Input, Label, Textarea, Select`; `apiRequest`, `queryClient`.
- Produces: `MuhasebePanel()` default export.

- [ ] **Step 1: MuhasebePanel.tsx'i tam implementasyonla değiştir**

Dosyanın tüm içeriğini şununla değiştir:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  type TalepDetay, formatTarih, formatPara, gunFarki,
  TIP_ETIKET, DURUM_ETIKET, IADE_ETIKET, BELGE_ETIKET, belgeUrl,
} from "./portalUtils";

function BelgeLinkleri({ talep }: { talep: TalepDetay }) {
  if (!talep.belgeler.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {talep.belgeler.map((b) => (
        <a
          key={b.id}
          href={belgeUrl(b)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary underline"
        >
          {BELGE_ETIKET[b.belgeTipi] ?? b.belgeTipi}: {b.filename}
        </a>
      ))}
    </div>
  );
}

function OdemeDialog({
  talep, kapat,
}: { talep: TalepDetay | null; kapat: () => void }) {
  const { toast } = useToast();
  const [dekont, setDekont] = useState<File | null>(null);
  const [konsimento, setKonsimento] = useState<File | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const odemeYap = async () => {
    if (!talep) return;
    if (!dekont) {
      toast({ title: "Dekont dosyası zorunlu", variant: "destructive" });
      return;
    }
    setGonderiliyor(true);
    try {
      const fd = new FormData();
      fd.set("dekont", dekont);
      if (konsimento) fd.set("konsimento", konsimento);
      const res = await fetch(`/api/portal/talepler/${talep.id}/odeme`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ödeme kaydedilemedi");
      toast({ title: "Ödendi olarak işaretlendi" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
      kapat();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Dialog open={!!talep} onOpenChange={(a) => !a && kapat()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ödemeyi Kaydet</DialogTitle>
        </DialogHeader>
        {talep && (
          <div className="space-y-4">
            <div className="text-sm rounded-md border p-3 space-y-1">
              <div><span className="font-medium">Dosya:</span> {talep.beyanname?.dosyaNo ?? "—"} — {talep.beyanname?.alici ?? "—"}</div>
              <div><span className="font-medium">Talep Eden:</span> {talep.talepEdenAd}</div>
              <div><span className="font-medium">Tür:</span> {TIP_ETIKET[talep.odemeTipi] ?? talep.odemeTipi} / {talep.masrafTuru}</div>
              <div><span className="font-medium">Tutar:</span> {formatPara(talep.tutar, talep.paraBirimi)}</div>
              <div><span className="font-medium">Alacaklı:</span> {talep.alacakli}{talep.iban ? ` — ${talep.iban}` : ""}</div>
              {talep.aciklama && <div><span className="font-medium">Açıklama:</span> {talep.aciklama}</div>}
              <div className="pt-1"><BelgeLinkleri talep={talep} /></div>
            </div>
            <div className="space-y-2">
              <Label>Dekont (zorunlu)</Label>
              <Input
                type="file"
                onChange={(e) => setDekont(e.target.files?.[0] ?? null)}
                data-testid="input-dekont"
              />
            </div>
            {talep.odemeTipi === "depo_teminat" && (
              <div className="space-y-2">
                <Label>Konşimento Örneği</Label>
                <Input
                  type="file"
                  onChange={(e) => setKonsimento(e.target.files?.[0] ?? null)}
                  data-testid="input-konsimento"
                />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={kapat}>Vazgeç</Button>
          <Button onClick={odemeYap} disabled={gonderiliyor} data-testid="button-odeme-kaydet">
            {gonderiliyor ? "Kaydediliyor…" : "Ödendi Olarak Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IadeDialog({
  talep, kapat,
}: { talep: TalepDetay | null; kapat: () => void }) {
  const { toast } = useToast();
  const [iadeDurumu, setIadeDurumu] = useState("iade_edildi");
  const [iadeTutari, setIadeTutari] = useState("");
  const [iadeTarihi, setIadeTarihi] = useState("");
  const [iadeNotu, setIadeNotu] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const kaydet = async () => {
    if (!talep) return;
    setGonderiliyor(true);
    try {
      await apiRequest("PUT", `/api/portal/talepler/${talep.id}/iade`, {
        iadeDurumu,
        iadeTutari: iadeTutari.trim() ? iadeTutari.replace(",", ".") : null,
        iadeTarihi: iadeTarihi || null,
        iadeNotu: iadeNotu.trim() || null,
      });
      toast({ title: "İade kaydı güncellendi" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/talepler"] });
      kapat();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Dialog open={!!talep} onOpenChange={(a) => !a && kapat()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>İade Kaydı</DialogTitle>
        </DialogHeader>
        {talep && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {talep.beyanname?.dosyaNo ?? "—"} — {formatPara(talep.tutar, talep.paraBirimi)} — {talep.alacakli}
            </div>
            <div className="space-y-2">
              <Label>İade Durumu</Label>
              <Select value={iadeDurumu} onValueChange={setIadeDurumu}>
                <SelectTrigger data-testid="select-iade-durumu">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beklemede">İade Bekleniyor</SelectItem>
                  <SelectItem value="iade_edildi">İade Alındı</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>İade Tutarı (kesinti varsa farklı olabilir)</Label>
                <Input
                  placeholder="0,00"
                  value={iadeTutari}
                  onChange={(e) => setIadeTutari(e.target.value)}
                  data-testid="input-iade-tutari"
                />
              </div>
              <div className="space-y-2">
                <Label>İade Tarihi</Label>
                <Input
                  type="date"
                  value={iadeTarihi}
                  onChange={(e) => setIadeTarihi(e.target.value)}
                  data-testid="input-iade-tarihi"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Not (örn. demuraj kesintisi)</Label>
              <Textarea
                value={iadeNotu}
                onChange={(e) => setIadeNotu(e.target.value)}
                data-testid="input-iade-notu"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={kapat}>Vazgeç</Button>
          <Button onClick={kaydet} disabled={gonderiliyor} data-testid="button-iade-kaydet">
            {gonderiliyor ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MuhasebePanel() {
  const { data: talepler = [] } = useQuery<TalepDetay[]>({
    queryKey: ["/api/portal/talepler"],
    refetchInterval: 30000, // yeni talepler 30 sn içinde düşer
  });
  const [odemeTalebi, setOdemeTalebi] = useState<TalepDetay | null>(null);
  const [iadeTalebi, setIadeTalebi] = useState<TalepDetay | null>(null);

  const bekleyenSayisi = talepler.filter((t) => t.durum === "bekliyor").length;
  const depoTalepleri = talepler.filter((t) => t.odemeTipi === "depo_teminat");
  const acikIadeSayisi = depoTalepleri.filter(
    (t) => t.durum === "odendi" && t.iadeDurumu === "beklemede",
  ).length;

  return (
    <Tabs defaultValue="gelen">
      <TabsList>
        <TabsTrigger value="gelen" data-testid="tab-gelen-talepler">
          Gelen Talepler
          {bekleyenSayisi > 0 && <Badge className="ml-2">{bekleyenSayisi}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="depo" data-testid="tab-depo-odemeleri">
          Depo Ödemeleri
          {acikIadeSayisi > 0 && <Badge variant="secondary" className="ml-2">{acikIadeSayisi}</Badge>}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="gelen">
        <Card>
          <CardHeader>
            <CardTitle>Tüm Temsilcilerin Talepleri</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Temsilci</TableHead>
                  <TableHead>Dosya No</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Tutar</TableHead>
                  <TableHead>Alacaklı</TableHead>
                  <TableHead>Belgeler</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {talepler.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      Talep yok
                    </TableCell>
                  </TableRow>
                )}
                {talepler.map((t) => (
                  <TableRow key={t.id} data-testid={`row-muhasebe-talep-${t.id}`}>
                    <TableCell>{formatTarih(t.talepTarihi)}</TableCell>
                    <TableCell>{t.talepEdenAd}</TableCell>
                    <TableCell>{t.beyanname?.dosyaNo ?? "—"}</TableCell>
                    <TableCell className="max-w-44 truncate">{t.beyanname?.alici ?? "—"}</TableCell>
                    <TableCell>
                      {TIP_ETIKET[t.odemeTipi] ?? t.odemeTipi}
                      {t.odemeTipi === "masraf" ? ` / ${t.masrafTuru}` : ""}
                    </TableCell>
                    <TableCell>{formatPara(t.tutar, t.paraBirimi)}</TableCell>
                    <TableCell className="max-w-36 truncate">
                      {t.alacakli}
                      {t.iban && <div className="text-xs text-muted-foreground">{t.iban}</div>}
                    </TableCell>
                    <TableCell><BelgeLinkleri talep={t} /></TableCell>
                    <TableCell>
                      <Badge variant={t.durum === "odendi" ? "default" : "secondary"}>
                        {DURUM_ETIKET[t.durum] ?? t.durum}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {t.durum === "bekliyor" && (
                        <Button
                          size="sm"
                          onClick={() => setOdemeTalebi(t)}
                          data-testid={`button-ode-${t.id}`}
                        >
                          Öde
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="depo">
        <Card>
          <CardHeader>
            <CardTitle>Depo Teminatları — İade Takibi</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dosya No</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Temsilci</TableHead>
                  <TableHead>Tutar</TableHead>
                  <TableHead>Ödeme Tarihi</TableHead>
                  <TableHead>Kaç Gündür Açık</TableHead>
                  <TableHead>İade Durumu</TableHead>
                  <TableHead>İade Tutarı</TableHead>
                  <TableHead>Belgeler</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depoTalepleri.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      Depo teminatı kaydı yok
                    </TableCell>
                  </TableRow>
                )}
                {depoTalepleri.map((t) => {
                  const acikGun =
                    t.durum === "odendi" && t.iadeDurumu === "beklemede"
                      ? gunFarki(t.odemeTarihi)
                      : null;
                  return (
                    <TableRow key={t.id} data-testid={`row-depo-${t.id}`}>
                      <TableCell>{t.beyanname?.dosyaNo ?? "—"}</TableCell>
                      <TableCell className="max-w-44 truncate">{t.beyanname?.alici ?? "—"}</TableCell>
                      <TableCell>{t.talepEdenAd}</TableCell>
                      <TableCell>{formatPara(t.tutar, t.paraBirimi)}</TableCell>
                      <TableCell>{formatTarih(t.odemeTarihi)}</TableCell>
                      <TableCell>
                        {acikGun == null ? "—" : (
                          <span className={acikGun > 30 ? "text-red-600 font-medium" : ""}>
                            {acikGun} gün
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.durum !== "odendi" ? (
                          <Badge variant="secondary">Ödeme Bekliyor</Badge>
                        ) : (
                          <Badge variant={t.iadeDurumu === "iade_edildi" ? "default" : "outline"}>
                            {IADE_ETIKET[t.iadeDurumu ?? ""] ?? "—"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.iadeTutari ? formatPara(t.iadeTutari, t.paraBirimi) : "—"}
                        {t.iadeNotu && (
                          <div className="text-xs text-muted-foreground max-w-36 truncate">
                            {t.iadeNotu}
                          </div>
                        )}
                      </TableCell>
                      <TableCell><BelgeLinkleri talep={t} /></TableCell>
                      <TableCell>
                        {t.durum === "odendi" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIadeTalebi(t)}
                            data-testid={`button-iade-${t.id}`}
                          >
                            İade Kaydı
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <OdemeDialog talep={odemeTalebi} kapat={() => setOdemeTalebi(null)} />
      <IadeDialog talep={iadeTalebi} kapat={() => setIadeTalebi(null)} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run check`
Expected: hatasız.

- [ ] **Step 3: Tarayıcı doğrulaması**

Ayrı bir tarayıcı profili/gizli pencerede `http://localhost:5000/portal` → `muhasebe` / `1234`:
- "Gelen Talepler" sekmesinde tüm talepler + bekleyen sayısı rozeti görünmeli.
- Bekleyen bir talepte "Öde" → dialog; dekontsuz kaydetmeye çalışınca hata toast'ı; dekont seçince kayıt → durum "Ödendi".
- Depo teminatında dialog'da Konşimento alanı da görünmeli.
- "Depo Ödemeleri" sekmesi: yalnız depo kayıtları, "kaç gündür açık" değeri, "İade Kaydı" → iade dialogu → kaydet → rozet "İade Alındı".
- Temsilci penceresinde 30 sn içinde durumun "Ödendi"ye döndüğünü doğrula.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/portal/MuhasebePanel.tsx
git commit -m "feat(odemeler): muhasebe paneli - gelen talepler, dekontlu odeme, depo iade takibi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Yönetim paneli — Ödemeler sayfası (Excel + izleme + kullanıcı + masraf türü)

**Files:**
- Create: `client/src/pages/Odemeler.tsx`
- Modify: `client/src/App.tsx` (import + pageTitles + route)
- Modify: `client/src/components/AppSidebar.tsx` (nav öğesi)

**Interfaces:**
- Consumes: `POST /api/odemeler/beyanname-excel`, `GET /api/odemeler/ozet`, `GET/POST/PUT /api/odemeler/kullanicilar[/:id]`, `GET/POST/PUT /api/odemeler/masraf-turleri[/:id]` (Task 4-6); `portalUtils` yardımcıları; shadcn bileşenleri.
- Produces: `/odemeler` yönetim sayfası (default export `Odemeler`).

- [ ] **Step 1: client/src/pages/Odemeler.tsx oluştur**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MasrafTuru, PortalKullanici } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  type TalepDetay, formatTarih, formatPara,
  TIP_ETIKET, DURUM_ETIKET, IADE_ETIKET, BELGE_ETIKET, belgeUrl,
} from "@/pages/portal/portalUtils";

type Ozet = {
  talepler: TalepDetay[];
  eslesmeyen: { kullanici: string; adet: number }[];
};

type KullaniciGoruntu = Omit<PortalKullanici, "sifreHash">;

type ExcelSonuc = {
  toplam: number;
  eklenen: number;
  guncellenen: number;
  eslesmeyen: { kullanici: string; adet: number }[];
};

function ExcelYukleme() {
  const { toast } = useToast();
  const [dosya, setDosya] = useState<File | null>(null);
  const [sonuc, setSonuc] = useState<ExcelSonuc | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [inputSayac, setInputSayac] = useState(0);

  const yukle = async () => {
    if (!dosya) {
      toast({ title: "Dosya seçin", variant: "destructive" });
      return;
    }
    setYukleniyor(true);
    try {
      const fd = new FormData();
      fd.set("dosya", dosya);
      const res = await fetch("/api/odemeler/beyanname-excel", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const veri = await res.json();
      if (!res.ok) throw new Error(veri.error || "Yükleme başarısız");
      setSonuc(veri);
      setDosya(null);
      setInputSayac((s) => s + 1);
      toast({
        title: "Beyanname listesi güncellendi",
        description: `${veri.toplam} satır: ${veri.eklenen} yeni, ${veri.guncellenen} güncellendi`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/odemeler/ozet"] });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Beyanname Excel Yükleme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            key={inputSayac}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
            className="max-w-sm"
            data-testid="input-beyanname-excel"
          />
          <Button onClick={yukle} disabled={yukleniyor} data-testid="button-beyanname-yukle">
            {yukleniyor ? "Yükleniyor…" : "Yükle"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          "İthalat Raporu" sayfası okunur; satırlar DOSYA NO üzerinden güncellenir/eklenir.
          Başlıklar uyuşmazsa yükleme reddedilir.
        </p>
        {sonuc && (
          <div className="text-sm rounded-md border p-3 space-y-1">
            <div>Toplam: <b>{sonuc.toplam}</b> — Yeni: <b>{sonuc.eklenen}</b> — Güncellenen: <b>{sonuc.guncellenen}</b></div>
            {sonuc.eslesmeyen.length > 0 && (
              <div className="text-amber-600">
                Eşleşmeyen kullanıcılar:{" "}
                {sonuc.eslesmeyen.map((e) => `${e.kullanici} (${e.adet})`).join(", ")}
                {" "}— bu temsilciler beyannamelerini göremez; Kullanıcılar sekmesinden AV adı atayın.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KullaniciFormDialog({
  duzenlenen, kapat,
}: { duzenlenen: KullaniciGoruntu | "yeni" | null; kapat: () => void }) {
  const { toast } = useToast();
  const yeniMi = duzenlenen === "yeni";
  const k = yeniMi || !duzenlenen ? null : duzenlenen;
  const [kullaniciAdi, setKullaniciAdi] = useState(k?.kullaniciAdi ?? "");
  const [adSoyad, setAdSoyad] = useState(k?.adSoyad ?? "");
  const [rol, setRol] = useState(k?.rol ?? "temsilci");
  const [avAdi, setAvAdi] = useState(k?.avAdi ?? "");
  const [sifre, setSifre] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const kaydet = async () => {
    setGonderiliyor(true);
    try {
      if (yeniMi) {
        await apiRequest("POST", "/api/odemeler/kullanicilar", {
          kullaniciAdi: kullaniciAdi.trim(),
          adSoyad: adSoyad.trim(),
          rol,
          avAdi: avAdi.trim() || null,
          sifre,
        });
      } else if (k) {
        await apiRequest("PUT", `/api/odemeler/kullanicilar/${k.id}`, {
          adSoyad: adSoyad.trim(),
          rol,
          avAdi: avAdi.trim() || null,
          ...(sifre ? { sifre } : {}),
        });
      }
      toast({ title: yeniMi ? "Kullanıcı oluşturuldu" : "Kullanıcı güncellendi" });
      queryClient.invalidateQueries({ queryKey: ["/api/odemeler/kullanicilar"] });
      kapat();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <Dialog open={duzenlenen !== null} onOpenChange={(a) => !a && kapat()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{yeniMi ? "Yeni Kullanıcı" : "Kullanıcı Düzenle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {yeniMi && (
            <div className="space-y-2">
              <Label>Kullanıcı Adı</Label>
              <Input
                value={kullaniciAdi}
                onChange={(e) => setKullaniciAdi(e.target.value)}
                data-testid="input-yeni-kullanici-adi"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Ad Soyad</Label>
            <Input value={adSoyad} onChange={(e) => setAdSoyad(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={rol} onValueChange={setRol}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="temsilci">Müşteri Temsilcisi</SelectItem>
                  <SelectItem value="muhasebe">Muhasebe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>AV Adı (Excel eşleşmesi)</Label>
              <Input
                placeholder="örn. SÜLEYMAN"
                value={avAdi}
                onChange={(e) => setAvAdi(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{yeniMi ? "Şifre" : "Yeni Şifre (boşsa değişmez)"}</Label>
            <Input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={kapat}>Vazgeç</Button>
          <Button onClick={kaydet} disabled={gonderiliyor} data-testid="button-kullanici-kaydet">
            {gonderiliyor ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Kullanicilar() {
  const { toast } = useToast();
  const { data: kullanicilar = [] } = useQuery<KullaniciGoruntu[]>({
    queryKey: ["/api/odemeler/kullanicilar"],
  });
  const [duzenlenen, setDuzenlenen] = useState<KullaniciGoruntu | "yeni" | null>(null);

  const aktifDegistir = async (k: KullaniciGoruntu, aktif: boolean) => {
    try {
      await apiRequest("PUT", `/api/odemeler/kullanicilar/${k.id}`, { aktif });
      queryClient.invalidateQueries({ queryKey: ["/api/odemeler/kullanicilar"] });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Portal Kullanıcıları</CardTitle>
        <Button size="sm" onClick={() => setDuzenlenen("yeni")} data-testid="button-yeni-kullanici">
          Yeni Kullanıcı
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kullanıcı Adı</TableHead>
              <TableHead>Ad Soyad</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>AV Adı</TableHead>
              <TableHead>Aktif</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kullanicilar.map((k) => (
              <TableRow key={k.id} data-testid={`row-kullanici-${k.id}`}>
                <TableCell>{k.kullaniciAdi}</TableCell>
                <TableCell>{k.adSoyad}</TableCell>
                <TableCell>{k.rol === "muhasebe" ? "Muhasebe" : "Temsilci"}</TableCell>
                <TableCell>{k.avAdi ?? "—"}</TableCell>
                <TableCell>
                  <Switch
                    checked={k.aktif}
                    onCheckedChange={(a) => aktifDegistir(k, a)}
                    data-testid={`switch-aktif-${k.id}`}
                  />
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => setDuzenlenen(k)}>
                    Düzenle
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <KullaniciFormDialog duzenlenen={duzenlenen} kapat={() => setDuzenlenen(null)} />
    </Card>
  );
}

function MasrafTurleri() {
  const { toast } = useToast();
  const { data: turler = [] } = useQuery<MasrafTuru[]>({
    queryKey: ["/api/odemeler/masraf-turleri"],
  });
  const [yeniAd, setYeniAd] = useState("");

  const ekle = async () => {
    if (!yeniAd.trim()) return;
    try {
      await apiRequest("POST", "/api/odemeler/masraf-turleri", {
        ad: yeniAd.trim(),
        sira: turler.length,
      });
      setYeniAd("");
      queryClient.invalidateQueries({ queryKey: ["/api/odemeler/masraf-turleri"] });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    }
  };

  const aktifDegistir = async (t: MasrafTuru, aktif: boolean) => {
    try {
      await apiRequest("PUT", `/api/odemeler/masraf-turleri/${t.id}`, { aktif });
      queryClient.invalidateQueries({ queryKey: ["/api/odemeler/masraf-turleri"] });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Masraf Türleri</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 max-w-sm">
          <Input
            placeholder="Yeni tür adı"
            value={yeniAd}
            onChange={(e) => setYeniAd(e.target.value)}
            data-testid="input-yeni-masraf-turu"
          />
          <Button onClick={ekle} data-testid="button-masraf-turu-ekle">Ekle</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ad</TableHead>
              <TableHead>Aktif (kapalıysa formda görünmez)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {turler.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.ad}</TableCell>
                <TableCell>
                  <Switch checked={t.aktif} onCheckedChange={(a) => aktifDegistir(t, a)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function Odemeler() {
  const { data: ozet } = useQuery<Ozet>({
    queryKey: ["/api/odemeler/ozet"],
    refetchInterval: 60000,
  });
  const talepler = ozet?.talepler ?? [];

  return (
    <div className="p-4 space-y-4">
      <Tabs defaultValue="izleme">
        <TabsList>
          <TabsTrigger value="izleme" data-testid="tab-odemeler-izleme">İzleme</TabsTrigger>
          <TabsTrigger value="kullanicilar" data-testid="tab-odemeler-kullanicilar">Kullanıcılar</TabsTrigger>
          <TabsTrigger value="turler" data-testid="tab-odemeler-turler">Masraf Türleri</TabsTrigger>
        </TabsList>

        <TabsContent value="izleme" className="space-y-4">
          <ExcelYukleme />
          {ozet && ozet.eslesmeyen.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-amber-600">Eşleşmeyen Beyanname Kullanıcıları</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {ozet.eslesmeyen.map((e) => (
                  <Badge key={e.kullanici} variant="outline" className="mr-2 mb-1">
                    {e.kullanici}: {e.adet} beyanname
                  </Badge>
                ))}
                <p className="text-xs text-muted-foreground mt-2">
                  Bu AV adları hiçbir portal kullanıcısına atanmamış — ilgili temsilciler
                  beyannamelerini göremez.
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Tüm Ödeme Talepleri</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Temsilci</TableHead>
                    <TableHead>Dosya No</TableHead>
                    <TableHead>Müşteri</TableHead>
                    <TableHead>Tür</TableHead>
                    <TableHead>Tutar</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>İade</TableHead>
                    <TableHead>Belgeler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {talepler.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        Talep yok
                      </TableCell>
                    </TableRow>
                  )}
                  {talepler.map((t) => (
                    <TableRow key={t.id} data-testid={`row-izleme-${t.id}`}>
                      <TableCell>{formatTarih(t.talepTarihi)}</TableCell>
                      <TableCell>{t.talepEdenAd}</TableCell>
                      <TableCell>{t.beyanname?.dosyaNo ?? "—"}</TableCell>
                      <TableCell className="max-w-44 truncate">{t.beyanname?.alici ?? "—"}</TableCell>
                      <TableCell>
                        {TIP_ETIKET[t.odemeTipi] ?? t.odemeTipi}
                        {t.odemeTipi === "masraf" ? ` / ${t.masrafTuru}` : ""}
                      </TableCell>
                      <TableCell>{formatPara(t.tutar, t.paraBirimi)}</TableCell>
                      <TableCell>
                        <Badge variant={t.durum === "odendi" ? "default" : "secondary"}>
                          {DURUM_ETIKET[t.durum] ?? t.durum}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.odemeTipi === "depo_teminat" && t.iadeDurumu
                          ? (IADE_ETIKET[t.iadeDurumu] ?? t.iadeDurumu)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {t.belgeler.map((b) => (
                            <a
                              key={b.id}
                              href={belgeUrl(b)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary underline"
                            >
                              {BELGE_ETIKET[b.belgeTipi] ?? b.belgeTipi}
                            </a>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kullanicilar">
          <Kullanicilar />
        </TabsContent>

        <TabsContent value="turler">
          <MasrafTurleri />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: App.tsx'e sayfayı bağla**

1. Import (PortalApp import'unun yanına):

```tsx
import Odemeler from "@/pages/Odemeler";
```

2. `pageTitles`'a ekle (`"/tahsilat": "Müşteri Tahsilat",` satırının altına):

```tsx
  "/odemeler": "Ödemeler",
```

3. `<Switch>` içine (`<Route path="/tahsilat" component={Tahsilat} />` altına):

```tsx
      <Route path="/odemeler" component={Odemeler} />
```

- [ ] **Step 3: AppSidebar'a nav öğesi ekle**

`client/src/components/AppSidebar.tsx`:

1. lucide import listesine `Banknote` ekle (örn. `HandCoins,` satırının altına):

```tsx
  Banknote,
```

2. `navItems` dizisine, `{ title: "Müşteri Tahsilat", ... }` satırının altına:

```tsx
  { title: "Ödemeler", icon: Banknote, href: "/odemeler" },
```

- [ ] **Step 4: Tip kontrolü + tarayıcı doğrulaması**

Run: `npm run check`
Expected: hatasız.

Tarayıcıda `http://localhost:5000/odemeler` (yönetim şifresiyle):
- İzleme: curl'le atılan talepler tabloda; eşleşmeyen AV adları (muhasebe/suleyman dışındaki 10 ad) uyarı kartında.
- Excel'i arayüzden tekrar yükle → "277 satır: 0 yeni, 277 güncellendi" özeti.
- Kullanıcılar: `suleyman` ve `muhasebe` listede; yeni kullanıcı ekle (örn. `emirhan` / AV adı `EMİRHAN`); aktif anahtarı çalışmalı.
- Masraf Türleri: 6 seed türü listede; yeni tür ekle → portal talep formunun dropdown'ında görünmeli.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Odemeler.tsx client/src/App.tsx client/src/components/AppSidebar.tsx
git commit -m "feat(odemeler): yonetim sayfasi - excel yukleme, izleme, kullanici ve masraf turu yonetimi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Uçtan uca doğrulama + prod hazırlığı

**Files:**
- Modify: yok (yalnız doğrulama + gerekirse küçük düzeltmeler)

**Interfaces:**
- Consumes: tüm önceki görevler.
- Produces: doğrulanmış, deploy'a hazır dal.

- [ ] **Step 1: Tam elle senaryo (iki tarayıcı profili)**

Spec §10'daki senaryoyu uçtan uca yürüt:

1. Yönetim panelinden Excel yükle → satır sayısı/upsert özeti doğru.
2. Temsilci (`suleyman`, avAdi=SÜLEYMAN) girişi → yalnız SÜLEYMAN beyannameleri.
3. Fatura ekiyle masraf talebi → "Bekliyor".
4. İkinci profilde muhasebe girişi → talep listede, fatura açılıyor.
5. Dekont yükleyip "Ödendi" → temsilci tarafında 30 sn içinde güncelleniyor, dekont indirilebiliyor.
6. Depo teminatı talebi → ödeme (dekont+konşimento) → Depo Ödemeleri sekmesi → iade kaydı.
7. Yetki: temsilci çerezi olmadan `curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/portal/talepler` → 401; temsilci çereziyle başka kullanıcının ödeme rotasına POST → 403.

Herhangi bir adım başarısızsa: düzelt, `npm run check`, ilgili dosyaları commit'le
(`fix(odemeler): <sorun>` + Co-Authored-By satırı), senaryoyu tekrarla.

- [ ] **Step 2: Test verilerini temizle (opsiyonel ama önerilir)**

curl testlerinde oluşan deneme talepleri gerçek kullanıma karışmasın diye DB'den sil:

```bash
node -e "
require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
p.query(\"DELETE FROM odeme_talepleri WHERE aciklama = 'curl testi' OR alacakli IN ('Test Liman A.Ş.','Depo A.Ş.')\").then(r => { console.log('silinen:', r.rowCount); p.end(); });
"
```

(`odeme_belgeleri` cascade ile silinir.) Elle UI testinde oluşturulan gerçekçi kayıtlar kalabilir.

- [ ] **Step 3: Son tip kontrolü + prod build provası**

Run: `npm run check`
Expected: hatasız.

Run: `npm run build`
Expected: `dist/public` + `dist/index.cjs` üretilir, hata yok.

- [ ] **Step 4: Deploy öncesi manuel adımlar (kullanıcıya rapor et — otomatik yapma)**

Bu maddeler push'tan ÖNCE kullanıcıya hatırlatılır (push = deploy):

1. **VPS'e SESSION_SECRET ekle:** `ssh root@167.235.252.49` → uygulama dizinindeki `.env`
   dosyasına `SESSION_SECRET=<rastgele 64 hex>` satırı ekle. Eklenmezse uygulama uyarıyla
   çalışır ama oturum güvenliği zayıf kalır.
2. `git push` sonrası GitHub Actions `db:push` çalıştıracağından yeni tablolar otomatik oluşur;
   `portal_sessions` tablosunu connect-pg-simple ilk istekte kendisi yaratır.
3. Deploy sonrası prod'da hızlı duman testi: `/portal` girişi + `/odemeler` sayfası.
4. Gerçek kullanıcı hesaplarını (11 temsilci: SÜLEYMAN, EMİRHAN, ÖZCAN, AHMET, NESLİHAN,
   HALİL, ONUR, ÖZGÜR, ENİS, ŞEBNEM, CEM + muhasebe) yönetim panelinden aç; AV adlarını
   Excel'dekiyle birebir (büyük harf, Türkçe karakterli) gir.

- [ ] **Step 5: Push kararını kullanıcıya bırak**

Değişiklikler commit'lendi. `git push` deploy tetikler — kullanıcı onayı olmadan push ETME.
