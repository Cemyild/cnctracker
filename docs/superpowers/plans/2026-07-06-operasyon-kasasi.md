# Operasyon Kasası (Şube Masraf) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yeni `operasyon` rolü + imprest kasa sistemi: muhasebe avans yükler, operasyon kendi ödemelerini belge zorunlu kaydeder, bakiye sürekli akar/devreder, gün kapanışı snapshot rapor üretir + muhasebe geri açabilir.

**Architecture:** Üç yeni tablo (avanslar/masraflar/gün-kapanış), bakiye = ΣavansΣ−Σmasraf (türetilmiş, SQL SUM), gün = kapanış olayıyla tanımlı (`kapanisId` null=açık/dolu=kilitli). Yeni portal rolü + sayfaları; muhasebe tarafında "Şube Masraf" sekmesi. Spec: `docs/superpowers/specs/2026-07-06-operasyon-kasasi-sube-masraf-design.md`.

**Tech Stack:** Drizzle + Express, React 18 + TanStack Query + shadcn/ui + wouter, multer (disk), Playwright (scratchpad).

## Global Constraints

- Türkçe kaynak dosyaları PowerShell Set-Content/Out-File ile ASLA yazılmaz — yalnız Edit/Write; iş sonunda `node -e` ile U+FFFD taraması.
- `git push` YASAK (push = canlı deploy). **AÇIK-YOL `git add <dosya>` — asla `git add -A`/`.`** (paylaşılan çalışma ağacı; commit öncesi `git status` ile yalnız kendi dosyalarını doğrula). `uploads/`, `.env`, xlsx dosyaları asla eklenmez.
- **DEV DB İZOLASYONU:** `.env` şu an prod-tünel'e (localhost:5433) işaret ediyor OLABİLİR (paralel oturum). Her DB-yazan görevin BAŞINDA `node -e "require('dotenv').config();console.log(/neon/.test(process.env.DATABASE_URL))"` ile hedefi doğrula; DEV Neon (`neon.tech`) değilse DUR ve raporla (BLOCKED) — testler canlıya yazmasın.
- Test runner YOK; kalite kapıları `npm run check` (tsc) + saf/storage node scriptleri + Playwright (scratchpad) + `npm run build`.
- Scratchpad: `C:\Users\cem\AppData\Local\Temp\claude\e--CEM-APPS-cnctracker\f8e48f44-2295-45d2-af94-f819937c735a\scratchpad` (Playwright chromium — mevcut e2e scriptlerinin NODE_PATH/global gsd-pi yöntemi).
- Dev sunucu: port 5000. Sunucu KODU değişince restart: `netstat -ano | findstr :5000` → `taskkill //PID <pid> //F` → arka planda `npm run dev` → 5-8 sn. Frontend Vite ile otomatik tazelenir.
- DB kolon adları snake_case; FK açık string (`operasyon_id`); tarihler `text` YYYY-MM-DD (`new Date(str)` YASAK — `bugunYmd()` var); tutarlar `decimal(14,2)` (drizzle `decimal` schema.ts'te ZATEN import); N+1 önleme inArray+Map; PUT/DELETE 404 null-check.
- Portal test kullanıcıları (dev DB): temsilci `suleyman`, muhasebe `muhasebe`, şifre `1234`. Operasyon kullanıcısı testte oluşturulacak.
- `requirePortal`/`requireMuhasebe` `./portalAuth`'tan; `parseTutar`/`bugunYmd()`/`portalKullanici(req)` registerRoutes içinde yerel (routes.ts:4549-4577).

---

### Task 1: Şema (3 tablo) + storage

**Files:**
- Modify: `shared/schema.ts` (3 tablo + tipler, `portalSessions`'tan ÖNCE; rol yorumu), `server/storage.ts` (IStorage + metotlar)

**Interfaces:**
- Produces:
  - Tipler: `OperasyonAvans`, `OperasyonMasraf`, `OperasyonGunKapanis` ($inferSelect); insert şemaları.
  - `getOperasyonBakiye(operasyonId: string): Promise<number>`
  - `getOperasyonKullanicilar(): Promise<PortalKullanici[]>` (rol=operasyon, aktif)
  - `avansYukle(d: { operasyonId; tutar: number; aciklama: string | null; tarih: string; gonderenId: string }): Promise<OperasyonAvans>`
  - `masrafKaydet(d: { operasyonId; beyannameId: string | null; dosyaYok: boolean; masrafTuru: string | null; tutar: number; alacakli: string; iban: string | null; aciklama: string | null; tarih: string; belgeDosya: string; belgeAdi: string }): Promise<OperasyonMasraf>`
  - `getOperasyonMasraf(id: string): Promise<OperasyonMasraf | undefined>`
  - `masrafSil(id: string): Promise<void>`
  - `getAcikHareketler(operasyonId: string): Promise<{ avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }>`
  - `gunuKapat(operasyonId: string, gunTarihi: string): Promise<OperasyonGunKapanis | null>` (açık hareket yoksa null)
  - `getKapanislar(operasyonId: string): Promise<Array<OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }>>`
  - `getKapanis(id: string): Promise<OperasyonGunKapanis | undefined>`
  - `geriAc(kapanisId: string, geriAcanId: string): Promise<OperasyonGunKapanis | null>`

- [ ] **Step 1: Şema — 3 tablo + rol yorumu**

`shared/schema.ts`'te `portalKullanicilar` içindeki rol yorumunu güncelle: `rol: text("rol").notNull(), // 'temsilci' | 'muhasebe' | 'operasyon'`.

`portalSessions` tanımının HEMEN ÖNÜNE ekle:

```ts
// ==================== OPERASYON KASASI (ŞUBE MASRAF) ====================
// Muhasebe → operasyon avans yüklemeleri
export const operasyonAvanslar = pgTable("operasyon_avanslar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  operasyonId: varchar("operasyon_id").notNull(),
  tutar: decimal("tutar", { precision: 14, scale: 2 }).notNull(),
  aciklama: text("aciklama"),
  tarih: text("tarih").notNull(),
  gonderenId: varchar("gonderen_id").notNull(),
  kapanisId: varchar("kapanis_id"),
  olusturma: timestamp("olusturma").defaultNow(),
}, (t) => [index("IDX_op_avans_operasyon").on(t.operasyonId)]);

// Operasyonun yaptığı ödemelerin kaydı (belge zorunlu)
export const operasyonMasraflar = pgTable("operasyon_masraflar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  operasyonId: varchar("operasyon_id").notNull(),
  beyannameId: varchar("beyanname_id"),
  dosyaYok: boolean("dosya_yok").notNull().default(false),
  masrafTuru: text("masraf_turu"),
  tutar: decimal("tutar", { precision: 14, scale: 2 }).notNull(),
  alacakli: text("alacakli").notNull(),
  iban: text("iban"),
  aciklama: text("aciklama"),
  tarih: text("tarih").notNull(),
  belgeDosya: text("belge_dosya").notNull(),
  belgeAdi: text("belge_adi").notNull(),
  kapanisId: varchar("kapanis_id"),
  olusturma: timestamp("olusturma").defaultNow(),
}, (t) => [index("IDX_op_masraf_operasyon").on(t.operasyonId)]);

// Gün kapanış snapshot'ı (değişmez rapor)
export const operasyonGunKapanis = pgTable("operasyon_gun_kapanis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  operasyonId: varchar("operasyon_id").notNull(),
  gunTarihi: text("gun_tarihi").notNull(),
  kapanisZamani: timestamp("kapanis_zamani").defaultNow(),
  acilisBakiye: decimal("acilis_bakiye", { precision: 14, scale: 2 }).notNull(),
  avansToplam: decimal("avans_toplam", { precision: 14, scale: 2 }).notNull(),
  masrafToplam: decimal("masraf_toplam", { precision: 14, scale: 2 }).notNull(),
  kapanisBakiye: decimal("kapanis_bakiye", { precision: 14, scale: 2 }).notNull(),
  durum: text("durum").notNull().default("kapali"),
  geriAcanId: varchar("geri_acan_id"),
}, (t) => [index("IDX_op_kapanis_operasyon").on(t.operasyonId)]);

export const insertOperasyonAvansSchema = createInsertSchema(operasyonAvanslar).omit({ id: true, olusturma: true });
export const insertOperasyonMasrafSchema = createInsertSchema(operasyonMasraflar).omit({ id: true, olusturma: true });
export const insertOperasyonGunKapanisSchema = createInsertSchema(operasyonGunKapanis).omit({ id: true, kapanisZamani: true });
export type OperasyonAvans = typeof operasyonAvanslar.$inferSelect;
export type OperasyonMasraf = typeof operasyonMasraflar.$inferSelect;
export type OperasyonGunKapanis = typeof operasyonGunKapanis.$inferSelect;
```

- [ ] **Step 2: storage — import + IStorage imzaları**

`server/storage.ts` schema import'una ekle: `operasyonAvanslar, operasyonMasraflar, operasyonGunKapanis, type OperasyonAvans, type OperasyonMasraf, type OperasyonGunKapanis`. Ayrıca drizzle-orm import'unda `sql` var (kullanılacak).

IStorage arayüzüne ekle (mevcut portal metotlarının yanına):

```ts
  getOperasyonKullanicilar(): Promise<PortalKullanici[]>;
  getOperasyonBakiye(operasyonId: string): Promise<number>;
  avansYukle(d: { operasyonId: string; tutar: number; aciklama: string | null; tarih: string; gonderenId: string }): Promise<OperasyonAvans>;
  masrafKaydet(d: { operasyonId: string; beyannameId: string | null; dosyaYok: boolean; masrafTuru: string | null; tutar: number; alacakli: string; iban: string | null; aciklama: string | null; tarih: string; belgeDosya: string; belgeAdi: string }): Promise<OperasyonMasraf>;
  getOperasyonMasraf(id: string): Promise<OperasyonMasraf | undefined>;
  masrafSil(id: string): Promise<void>;
  getAcikHareketler(operasyonId: string): Promise<{ avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }>;
  gunuKapat(operasyonId: string, gunTarihi: string): Promise<OperasyonGunKapanis | null>;
  getKapanislar(operasyonId: string): Promise<Array<OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }>>;
  getKapanis(id: string): Promise<OperasyonGunKapanis | undefined>;
  geriAc(kapanisId: string, geriAcanId: string): Promise<OperasyonGunKapanis | null>;
```

- [ ] **Step 3: storage — implementasyon**

`DatabaseStorage` sınıfına ekle (mevcut portal metotlarının yakınına):

```ts
  async getOperasyonKullanicilar(): Promise<PortalKullanici[]> {
    return db.select().from(portalKullanicilar)
      .where(and(eq(portalKullanicilar.rol, "operasyon"), eq(portalKullanicilar.aktif, true)))
      .orderBy(asc(portalKullanicilar.adSoyad));
  }

  async getOperasyonBakiye(operasyonId: string): Promise<number> {
    const [av] = await db.select({ t: sql<string>`COALESCE(SUM(${operasyonAvanslar.tutar}),0)` })
      .from(operasyonAvanslar).where(eq(operasyonAvanslar.operasyonId, operasyonId));
    const [ma] = await db.select({ t: sql<string>`COALESCE(SUM(${operasyonMasraflar.tutar}),0)` })
      .from(operasyonMasraflar).where(eq(operasyonMasraflar.operasyonId, operasyonId));
    return Math.round((parseFloat(av.t) - parseFloat(ma.t)) * 100) / 100;
  }

  async avansYukle(d: { operasyonId: string; tutar: number; aciklama: string | null; tarih: string; gonderenId: string }): Promise<OperasyonAvans> {
    const [yeni] = await db.insert(operasyonAvanslar).values({
      operasyonId: d.operasyonId, tutar: d.tutar.toFixed(2), aciklama: d.aciklama,
      tarih: d.tarih, gonderenId: d.gonderenId,
    }).returning();
    return yeni;
  }

  async masrafKaydet(d: { operasyonId: string; beyannameId: string | null; dosyaYok: boolean; masrafTuru: string | null; tutar: number; alacakli: string; iban: string | null; aciklama: string | null; tarih: string; belgeDosya: string; belgeAdi: string }): Promise<OperasyonMasraf> {
    const [yeni] = await db.insert(operasyonMasraflar).values({
      operasyonId: d.operasyonId, beyannameId: d.beyannameId, dosyaYok: d.dosyaYok,
      masrafTuru: d.masrafTuru, tutar: d.tutar.toFixed(2), alacakli: d.alacakli, iban: d.iban,
      aciklama: d.aciklama, tarih: d.tarih, belgeDosya: d.belgeDosya, belgeAdi: d.belgeAdi,
    }).returning();
    return yeni;
  }

  async getOperasyonMasraf(id: string): Promise<OperasyonMasraf | undefined> {
    const [m] = await db.select().from(operasyonMasraflar).where(eq(operasyonMasraflar.id, id)).limit(1);
    return m;
  }

  async masrafSil(id: string): Promise<void> {
    await db.delete(operasyonMasraflar).where(eq(operasyonMasraflar.id, id));
  }

  async getAcikHareketler(operasyonId: string): Promise<{ avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }> {
    const avanslar = await db.select().from(operasyonAvanslar)
      .where(and(eq(operasyonAvanslar.operasyonId, operasyonId), sql`${operasyonAvanslar.kapanisId} IS NULL`))
      .orderBy(desc(operasyonAvanslar.olusturma));
    const masraflar = await db.select().from(operasyonMasraflar)
      .where(and(eq(operasyonMasraflar.operasyonId, operasyonId), sql`${operasyonMasraflar.kapanisId} IS NULL`))
      .orderBy(desc(operasyonMasraflar.olusturma));
    return { avanslar, masraflar };
  }

  async gunuKapat(operasyonId: string, gunTarihi: string): Promise<OperasyonGunKapanis | null> {
    const { avanslar, masraflar } = await this.getAcikHareketler(operasyonId);
    if (avanslar.length === 0 && masraflar.length === 0) return null;
    const avansToplam = avanslar.reduce((s, a) => s + parseFloat(a.tutar), 0);
    const masrafToplam = masraflar.reduce((s, m) => s + parseFloat(m.tutar), 0);
    const kapanisBakiye = await this.getOperasyonBakiye(operasyonId);
    const acilisBakiye = Math.round((kapanisBakiye - (avansToplam - masrafToplam)) * 100) / 100;
    const [kapanis] = await db.insert(operasyonGunKapanis).values({
      operasyonId, gunTarihi,
      acilisBakiye: acilisBakiye.toFixed(2), avansToplam: avansToplam.toFixed(2),
      masrafToplam: masrafToplam.toFixed(2), kapanisBakiye: kapanisBakiye.toFixed(2), durum: "kapali",
    }).returning();
    await db.update(operasyonAvanslar).set({ kapanisId: kapanis.id })
      .where(and(eq(operasyonAvanslar.operasyonId, operasyonId), sql`${operasyonAvanslar.kapanisId} IS NULL`));
    await db.update(operasyonMasraflar).set({ kapanisId: kapanis.id })
      .where(and(eq(operasyonMasraflar.operasyonId, operasyonId), sql`${operasyonMasraflar.kapanisId} IS NULL`));
    return kapanis;
  }

  async getKapanislar(operasyonId: string): Promise<Array<OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }>> {
    const kapanislar = await db.select().from(operasyonGunKapanis)
      .where(eq(operasyonGunKapanis.operasyonId, operasyonId))
      .orderBy(desc(operasyonGunKapanis.kapanisZamani));
    if (kapanislar.length === 0) return [];
    const ids = kapanislar.map((k) => k.id);
    const avanslar = await db.select().from(operasyonAvanslar).where(inArray(operasyonAvanslar.kapanisId, ids));
    const masraflar = await db.select().from(operasyonMasraflar).where(inArray(operasyonMasraflar.kapanisId, ids));
    const avMap = new Map<string, OperasyonAvans[]>();
    for (const a of avanslar) { if (!a.kapanisId) continue; const arr = avMap.get(a.kapanisId) ?? []; arr.push(a); avMap.set(a.kapanisId, arr); }
    const maMap = new Map<string, OperasyonMasraf[]>();
    for (const m of masraflar) { if (!m.kapanisId) continue; const arr = maMap.get(m.kapanisId) ?? []; arr.push(m); maMap.set(m.kapanisId, arr); }
    return kapanislar.map((k) => ({ ...k, avanslar: avMap.get(k.id) ?? [], masraflar: maMap.get(k.id) ?? [] }));
  }

  async getKapanis(id: string): Promise<OperasyonGunKapanis | undefined> {
    const [k] = await db.select().from(operasyonGunKapanis).where(eq(operasyonGunKapanis.id, id)).limit(1);
    return k;
  }

  async geriAc(kapanisId: string, geriAcanId: string): Promise<OperasyonGunKapanis | null> {
    const [k] = await db.update(operasyonGunKapanis)
      .set({ durum: "geri_acildi", geriAcanId })
      .where(eq(operasyonGunKapanis.id, kapanisId)).returning();
    if (!k) return null;
    await db.update(operasyonAvanslar).set({ kapanisId: null }).where(eq(operasyonAvanslar.kapanisId, kapanisId));
    await db.update(operasyonMasraflar).set({ kapanisId: null }).where(eq(operasyonMasraflar.kapanisId, kapanisId));
    return k;
  }
```

(Not: `and`/`asc`/`desc`/`inArray`/`sql`/`eq` storage.ts'te zaten import; eksik varsa ekle.)

- [ ] **Step 4: Tip kontrolü + db:push**

Run: `npm run check` → 0 hata.
DB hedefi doğrula: `node -e "require('dotenv').config();console.log('neon:', /neon/.test(process.env.DATABASE_URL))"` → **true olmalı**; false ise DUR (BLOCKED — prod'a push riski).
Run: `npm run db:push` → 3 tablo eklenir; `[✓] Changes applied`. Soru sorarsa `--force`suz DUR.

- [ ] **Step 5: Storage duman testi (tsx, dev Neon)**

Scratchpad'e `optest.ts`, `npx tsx` repo kökü (`import 'dotenv/config'`). Önce bir operasyon kullanıcısı oluştur (storage.createPortalKullanici veya doğrudan insert; kullanıcı adı 'OPTEST'), sonra:
```
avansYukle 1000 → bakiye 1000; masrafKaydet 300 (belge alanları dummy) → bakiye 700;
getAcikHareketler → 1 avans + 1 masraf; gunuKapat → snapshot {acilis 0, avans 1000, masraf 300, kapanis 700}, satırlar kilitli (kapanisId dolu);
ikinci avans 200 → bakiye 900 (yeni açık batch, açık hareket 1 avans);
geriAc(kapanisId) → snapshot geri_acildi, ilk batch satırları açık (kapanisId null), bakiye HÂLÂ 900 (değişmez);
kilitli-olmayan masraf sil → bakiye artar.
```
Tüm satırları + OPTEST kullanıcıyı sil (operasyon_avanslar/masraflar/gun_kapanis + portal_kullanicilar). Beklenen değerleri console.log ile doğrula. db import yolunu storage.ts'ten teyit et.

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts server/storage.ts
git status   # yalnız bu iki dosya
git commit -m "feat(operasyon): sema (3 tablo) + kasa storage (avans/masraf/bakiye/gun-kapanis/geri-ac)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Auth (requireOperasyon) + API uçları + belge multer

**Files:**
- Modify: `server/portalAuth.ts` (requireOperasyon), `server/routes.ts` (multer + operasyon uçları + muhasebe takip uçları)

**Interfaces:**
- Consumes: Task 1 storage metotları; `requirePortal`/`requireMuhasebe`/`portalKullanici`/`parseTutar`/`bugunYmd`.
- Produces: uçlar (§6 spec).

- [ ] **Step 1: requireOperasyon**

`server/portalAuth.ts`'te `requireMuhasebe`'nin ardına ekle:

```ts
export function requireOperasyon(req: Request, res: Response, next: NextFunction) {
  if (!req.session.portalUserId) {
    return res.status(401).json({ error: "Giriş gerekli" });
  }
  if (req.session.portalRol !== "operasyon") {
    return res.status(403).json({ error: "Yetkisiz" });
  }
  next();
}
```

- [ ] **Step 2: routes.ts — import + belge multer**

`server/routes.ts` import satırında `requireMuhasebe` yanına `requireOperasyon` ekle (`from "./portalAuth"`).

`uploadOdemeBelge` tanımının (satır ~133) ardına ekle:

```ts
const operasyonBelgeStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "uploads/operasyon";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `op-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});
const uploadOperasyonBelge = multer({ storage: operasyonBelgeStorage });
```

- [ ] **Step 3: Operasyon uçları**

`registerRoutes` içinde, mevcut `/api/portal/*` uçlarının yanına ekle:

```ts
  // ---- OPERASYON (kasa sahibi) ----
  app.get("/api/portal/operasyon/ozet", requireOperasyon, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const bakiye = await storage.getOperasyonBakiye(ben.id);
      const { avanslar, masraflar } = await storage.getAcikHareketler(ben.id);
      res.json({ bakiye, avanslar, masraflar });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/portal/operasyon/masraf", requireOperasyon, uploadOperasyonBelge.single("belge"), async (req, res) => {
    const belge = req.file;
    const sil = () => { if (belge) fs.promises.unlink(belge.path).catch(() => {}); };
    try {
      const ben = await portalKullanici(req);
      if (!ben) { sil(); return res.status(401).json({ error: "Giriş gerekli" }); }
      const { beyannameId, dosyaYok, masrafTuru, tutar, alacakli, iban, aciklama } = req.body || {};
      const dosyaYokB = dosyaYok === "true" || dosyaYok === true;
      const tutarNum = parseTutar(tutar);
      if (!belge) return res.status(400).json({ error: "Belge (fiş/fatura) zorunlu" });
      if (tutarNum === null || tutarNum <= 0) { sil(); return res.status(400).json({ error: "Geçerli tutar girin" }); }
      if (!String(alacakli ?? "").trim()) { sil(); return res.status(400).json({ error: "Alacaklı zorunlu" }); }
      if (dosyaYokB && !String(aciklama ?? "").trim()) { sil(); return res.status(400).json({ error: "Dosyasız kayıtta açıklama zorunlu" }); }
      if (!dosyaYokB && !String(beyannameId ?? "").trim()) { sil(); return res.status(400).json({ error: "Beyanname seçin veya 'Dosya yok' işaretleyin" }); }
      const masraf = await storage.masrafKaydet({
        operasyonId: ben.id,
        beyannameId: dosyaYokB ? null : String(beyannameId),
        dosyaYok: dosyaYokB,
        masrafTuru: masrafTuru ? String(masrafTuru) : null,
        tutar: tutarNum,
        alacakli: String(alacakli).trim(),
        iban: iban ? String(iban).trim() : null,
        aciklama: aciklama ? String(aciklama) : null,
        tarih: bugunYmd(),
        belgeDosya: belge.path.replace(/\\/g, "/"),
        belgeAdi: fixUploadFilename(belge.originalname),
      });
      // Alacaklıyı firma listesine kaydet (best-effort — F1.x kalıbı)
      storage.upsertOdemeSirketi(String(alacakli).trim(), { iban: iban ? String(iban).trim() : null, kaynak: "operasyon" }).catch(() => {});
      res.json(masraf);
    } catch (e: any) { sil(); res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/portal/operasyon/masraf/:id", requireOperasyon, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const m = await storage.getOperasyonMasraf(req.params.id);
      if (!m || m.operasyonId !== ben.id) return res.status(404).json({ error: "Bulunamadı" });
      if (m.kapanisId) return res.status(409).json({ error: "Kapanmış gün — silinemez" });
      await storage.masrafSil(m.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/portal/operasyon/gunu-kapat", requireOperasyon, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const kapanis = await storage.gunuKapat(ben.id, bugunYmd());
      if (!kapanis) return res.status(400).json({ error: "Kapatılacak açık hareket yok" });
      res.json(kapanis);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/portal/operasyon/kapanislar", requireOperasyon, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      res.json(await storage.getKapanislar(ben.id));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
```

(Not: `fixUploadFilename` routes.ts'te mevcut — odeme belge yüklemede kullanılıyor. Yoksa `belge.originalname` kullan.)

- [ ] **Step 4: Muhasebe takip uçları**

```ts
  // ---- MUHASEBE: ŞUBE MASRAF (operasyon takip) ----
  app.get("/api/portal/operasyon-takip", requireMuhasebe, async (_req, res) => {
    try {
      const kullanicilar = await storage.getOperasyonKullanicilar();
      const bugun = bugunYmd();
      const sonuc = await Promise.all(kullanicilar.map(async (k) => {
        const bakiye = await storage.getOperasyonBakiye(k.id);
        const { masraflar } = await storage.getAcikHareketler(k.id);
        const bugunHarcanan = masraflar.filter((m) => m.tarih === bugun).reduce((s, m) => s + parseFloat(m.tutar), 0);
        return { id: k.id, adSoyad: k.adSoyad, kullaniciAdi: k.kullaniciAdi, bakiye, bugunHarcanan: Math.round(bugunHarcanan * 100) / 100 };
      }));
      res.json(sonuc);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/portal/operasyon-takip/:operasyonId", requireMuhasebe, async (req, res) => {
    try {
      const bakiye = await storage.getOperasyonBakiye(req.params.operasyonId);
      const acik = await storage.getAcikHareketler(req.params.operasyonId);
      const kapanislar = await storage.getKapanislar(req.params.operasyonId);
      res.json({ bakiye, acik, kapanislar });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/portal/operasyon-takip/:operasyonId/avans", requireMuhasebe, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const { tutar, aciklama } = req.body || {};
      const tutarNum = parseTutar(tutar);
      if (tutarNum === null || tutarNum <= 0) return res.status(400).json({ error: "Geçerli tutar girin" });
      const avans = await storage.avansYukle({
        operasyonId: req.params.operasyonId, tutar: tutarNum,
        aciklama: aciklama ? String(aciklama) : null, tarih: bugunYmd(), gonderenId: ben.id,
      });
      res.json(avans);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/portal/operasyon-takip/kapanis/:kapanisId/geri-ac", requireMuhasebe, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const k = await storage.geriAc(req.params.kapanisId, ben.id);
      if (!k) return res.status(404).json({ error: "Bulunamadı" });
      res.json(k);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
```

- [ ] **Step 5: Tip kontrolü + restart + curl duman testi**

Run: `npm run check` → 0 hata. DB hedefi doğrula (neon:true). Dev sunucuyu yeniden başlat.
Duman testi: dev DB'de bir operasyon kullanıcısı (OPTESTAPI, şifre 1234) oluştur (Odemeler yönetim ucundan `/api/portal-kullanicilari` POST veya doğrudan storage script). Muhasebe login → `POST /operasyon-takip/:id/avans {tutar:1000}` → 200; `GET /operasyon-takip` → o kullanıcı bakiye 1000. Operasyon (OPTESTAPI) login → `GET /operasyon/ozet` → bakiye 1000. Sonra OPTESTAPI + hareketleri sil.

- [ ] **Step 6: Commit**

```bash
git add server/portalAuth.ts server/routes.ts
git status
git commit -m "feat(operasyon): requireOperasyon + kasa/takip API uclari + belge multer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Rol tesisatı (rol seçeneği + PortalMe + sidebar/başlık linkleri)

**Files:**
- Modify: `client/src/pages/Odemeler.tsx` (rol Select + gösterim), `client/src/pages/portal/PortalApp.tsx` (PortalMe rol + başlıklar + varsayılan rota), `client/src/pages/portal/PortalSidebar.tsx` (OPERASYON_MENU + muhasebe "Şube Masraf" linki)

**Interfaces:**
- Produces: `PortalMe.rol` tipi `"temsilci" | "muhasebe" | "operasyon"`; sidebar linkleri `/portal/kasam`, `/portal/kapanislarim`, `/portal/sube-masraf` (sayfalar Task 4-6'da gelir — linkler string, import YOK → tsc yeşil).

- [ ] **Step 1: Odemeler.tsx rol seçeneği**

`client/src/pages/Odemeler.tsx` satır 200-201'deki `<SelectItem>` grubuna ekle:
```tsx
                  <SelectItem value="operasyon">Operasyon</SelectItem>
```
Satır 277 rol gösterimini güncelle:
```tsx
                <TableCell>{k.rol === "muhasebe" ? "Muhasebe" : k.rol === "operasyon" ? "Operasyon" : "Temsilci"}</TableCell>
```

- [ ] **Step 2: PortalApp.tsx — PortalMe rol + başlık + varsayılan rota**

`PortalMe` tipini güncelle: `rol: "temsilci" | "muhasebe" | "operasyon";`.
`SAYFA_BASLIKLARI`'na ekle:
```ts
  "/portal/kasam": "Kasam",
  "/portal/kapanislarim": "Kapanışlarım",
  "/portal/sube-masraf": "Şube Masraf",
```
`varsayilanRota` hesabını güncelle:
```ts
  const varsayilanRota = me.rol === "muhasebe" ? "/portal/gelen-talepler" : me.rol === "operasyon" ? "/portal/kasam" : "/portal/yeni-talep";
```

- [ ] **Step 3: PortalSidebar.tsx — operasyon menüsü + muhasebe linki**

lucide import'una `Wallet, CalendarCheck, Building` ekle. `MUHASEBE_MENU`'ye son eleman:
```ts
  { title: "Şube Masraf", href: "/portal/sube-masraf", icon: Building },
```
`MUHASEBE_MENU`'nün ardına yeni menü + seçim mantığı:
```ts
const OPERASYON_MENU: MenuOgesi[] = [
  { title: "Kasam", href: "/portal/kasam", icon: Wallet },
  { title: "Kapanışlarım", href: "/portal/kapanislarim", icon: CalendarCheck },
];
```
`menu` seçimini güncelle:
```ts
  const menu = me.rol === "muhasebe" ? MUHASEBE_MENU : me.rol === "operasyon" ? OPERASYON_MENU : TEMSILCI_MENU;
```
Alt bilgi rol etiketini güncelle (`me.rol === "muhasebe" ? "Muhasebe" : ...`):
```tsx
            {me.rol === "muhasebe" ? "Muhasebe" : me.rol === "operasyon" ? "Operasyon" : "Müşteri Temsilcisi"}
```

- [ ] **Step 4: Tip kontrolü + U+FFFD**

Run: `npm run check` → 0 hata (linkler string, sayfa import yok). U+FFFD taraması (3 dosya).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Odemeler.tsx client/src/pages/portal/PortalApp.tsx client/src/pages/portal/PortalSidebar.tsx
git status
git commit -m "feat(operasyon): rol tesisati - operasyon rol secenegi + sidebar/baslik linkleri

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Operasyon "Kasam" sayfası (bakiye + masraf kaydı + açık hareketler + günü kapat)

**Files:**
- Create: `client/src/pages/portal/OperasyonKasaSayfasi.tsx`
- Modify: `client/src/pages/portal/PortalApp.tsx` (Route)

**Interfaces:**
- Consumes: Task 2 uçları (`/operasyon/ozet`, `/operasyon/masraf`, `/operasyon/masraf/:id`, `/operasyon/gunu-kapat`); `/api/portal/{beyannameler,masraf-turleri,odeme-sirketleri}` (mevcut); `firmaIbanlariByPB`/`tamEslesme`/`benzerFirmalar` (portalUtils, opsiyonel öneri) — YAGNI: yalnız native datalist yeterli.

- [ ] **Step 1: OperasyonKasaSayfasi.tsx oluştur**

`client/src/pages/portal/OperasyonKasaSayfasi.tsx` — tam içerik:

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Beyanname, MasrafTuru, OdemeSirketi, OperasyonAvans, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTarih, formatPara } from "./portalUtils";

type Ozet = { bakiye: number; avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };

export default function OperasyonKasaSayfasi() {
  const { toast } = useToast();
  const { data: ozet } = useQuery<Ozet>({
    queryKey: ["/api/portal/operasyon/ozet"],
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });
  const { data: beyannameler = [] } = useQuery<Beyanname[]>({ queryKey: ["/api/portal/beyannameler"] });
  const { data: masrafTurleri = [] } = useQuery<MasrafTuru[]>({ queryKey: ["/api/portal/masraf-turleri"] });
  const { data: odemeSirketleri = [] } = useQuery<OdemeSirketi[]>({ queryKey: ["/api/portal/odeme-sirketleri"] });

  const [arama, setArama] = useState("");
  const [beyannameId, setBeyannameId] = useState("");
  const [dosyaYok, setDosyaYok] = useState(false);
  const [masrafTuru, setMasrafTuru] = useState("");
  const [tutar, setTutar] = useState("");
  const [alacakli, setAlacakli] = useState("");
  const [iban, setIban] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [belge, setBelge] = useState<File | null>(null);
  const [formSayac, setFormSayac] = useState(0);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [kapatDialog, setKapatDialog] = useState(false);
  const [kapatiliyor, setKapatiliyor] = useState(false);

  const filtreliBeyannameler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return beyannameler;
    return beyannameler.filter((b) =>
      b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
      (b.alici ?? "").toLocaleLowerCase("tr").includes(q));
  }, [beyannameler, arama]);

  const acikMasrafToplam = (ozet?.masraflar ?? []).reduce((s, m) => s + parseFloat(m.tutar), 0);
  const acikAvansToplam = (ozet?.avanslar ?? []).reduce((s, a) => s + parseFloat(a.tutar), 0);

  const tazele = () => queryClient.invalidateQueries({ queryKey: ["/api/portal/operasyon/ozet"] });

  const formSifirla = () => {
    setBeyannameId(""); setDosyaYok(false); setMasrafTuru(""); setTutar("");
    setAlacakli(""); setIban(""); setAciklama(""); setBelge(null); setFormSayac((s) => s + 1);
  };

  const kaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!belge) { toast({ title: "Belge (fiş/fatura) zorunlu", variant: "destructive" }); return; }
    if (!tutar.trim() || !alacakli.trim()) { toast({ title: "Tutar ve alacaklı zorunlu", variant: "destructive" }); return; }
    if (!dosyaYok && !beyannameId) { toast({ title: "Beyanname seçin veya 'Dosya yok' işaretleyin", variant: "destructive" }); return; }
    if (dosyaYok && !aciklama.trim()) { toast({ title: "Dosyasız kayıtta açıklama zorunlu", variant: "destructive" }); return; }
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
      fd.set("belge", belge);
      const res = await fetch("/api/portal/operasyon/masraf", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydedilemedi");
      toast({ title: "Masraf kaydedildi", description: "Bakiyeden düşüldü." });
      formSifirla();
      tazele();
      queryClient.invalidateQueries({ queryKey: ["/api/portal/odeme-sirketleri"] });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally { setGonderiliyor(false); }
  };

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

      <Card>
        <CardHeader><CardTitle>Ödeme Kaydet</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={kaydet} className="space-y-4">
            <div className="space-y-2">
              <Label>Beyanname / Dosya</Label>
              <div className="flex items-center gap-2">
                <Checkbox id="op-dosya-yok" checked={dosyaYok} onCheckedChange={(v) => { setDosyaYok(v === true); if (v === true) setBeyannameId(""); }} data-testid="checkbox-op-dosya-yok" />
                <Label htmlFor="op-dosya-yok" className="font-normal text-muted-foreground">Dosya yok — açıklama zorunlu</Label>
              </div>
              {!dosyaYok && (
                <>
                  <Input placeholder="Dosya no veya müşteri ara…" value={arama} onChange={(e) => setArama(e.target.value)} data-testid="input-op-arama" />
                  <Select value={beyannameId} onValueChange={setBeyannameId}>
                    <SelectTrigger data-testid="select-op-beyanname"><SelectValue placeholder="Beyanname seçin" /></SelectTrigger>
                    <SelectContent>
                      {filtreliBeyannameler.slice(0, 100).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.dosyaNo} — {b.alici ?? "?"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Masraf Türü</Label>
                <Select value={masrafTuru} onValueChange={setMasrafTuru}>
                  <SelectTrigger data-testid="select-op-masraf-turu"><SelectValue placeholder="Seçin" /></SelectTrigger>
                  <SelectContent>{masrafTurleri.map((t) => (<SelectItem key={t.id} value={t.ad}>{t.ad}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tutar (TL)</Label>
                <Input placeholder="0,00" value={tutar} onChange={(e) => setTutar(e.target.value)} data-testid="input-op-tutar" />
              </div>
              <div className="space-y-2">
                <Label>Kime Ödendi</Label>
                <Input placeholder="Firma adı" value={alacakli} onChange={(e) => setAlacakli(e.target.value)} list="op-alacakli-onerileri" data-testid="input-op-alacakli" />
                <datalist id="op-alacakli-onerileri">{odemeSirketleri.map((s) => (<option key={s.id} value={s.ad} />))}</datalist>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>IBAN (varsa)</Label>
                <Input placeholder="TR.." value={iban} onChange={(e) => setIban(e.target.value)} data-testid="input-op-iban" />
              </div>
              <div className="space-y-2">
                <Label>Belge (fiş/fatura — ZORUNLU)</Label>
                <Input key={formSayac} type="file" onChange={(e) => setBelge(e.target.files?.[0] ?? null)} data-testid="input-op-belge" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Textarea placeholder="Not…" value={aciklama} onChange={(e) => setAciklama(e.target.value)} data-testid="input-op-aciklama" />
            </div>
            <Button type="submit" disabled={gonderiliyor} data-testid="button-op-kaydet">{gonderiliyor ? "Kaydediliyor…" : "Masrafı Kaydet"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Açık Hareketler</CardTitle>
          <Button variant="outline" onClick={() => setKapatDialog(true)} disabled={(ozet?.avanslar.length ?? 0) + (ozet?.masraflar.length ?? 0) === 0} data-testid="button-op-gunu-kapat">Günü Kapat</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(ozet?.avanslar ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border p-2 text-sm" data-testid={`row-avans-${a.id}`}>
              <div><span className="font-medium text-green-600">Avans</span> · {formatTarih(a.tarih)} · {a.aciklama ?? "—"}</div>
              <div className="font-semibold text-green-600">+{formatPara(a.tutar, "TL")}</div>
            </div>
          ))}
          {(ozet?.masraflar ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm" data-testid={`row-masraf-${m.id}`}>
              <div>
                <span className="font-medium">{m.masrafTuru ?? "Masraf"}</span> · {m.alacakli} · {formatTarih(m.tarih)}
                {m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-destructive">−{formatPara(m.tutar, "TL")}</span>
                <Button variant="ghost" size="sm" onClick={() => masrafKaldir(m.id)} data-testid={`button-masraf-kaldir-${m.id}`}>Kaldır</Button>
              </div>
            </div>
          ))}
          {((ozet?.avanslar.length ?? 0) + (ozet?.masraflar.length ?? 0)) === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Açık hareket yok.</p>
          )}
        </CardContent>
      </Card>

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

- [ ] **Step 2: PortalApp.tsx Route**

`PortalApp.tsx` import ekle: `import OperasyonKasaSayfasi from "./OperasyonKasaSayfasi";`. `<Switch>` içine (muhasebe route'larından sonra) ekle:
```tsx
              {me.rol === "operasyon" && (
                <Route path="/portal/kasam" component={OperasyonKasaSayfasi} />
              )}
```

- [ ] **Step 3: Tip kontrolü + U+FFFD**

Run: `npm run check` → 0 hata. U+FFFD (yeni dosya + PortalApp).

- [ ] **Step 4: Playwright**

Scratchpad'e `op-t4.js`. Önkoşul: dev DB'de operasyon kullanıcısı (OPT4, 1234) oluştur + muhasebe API'den 1000 avans yükle. OPT4 login → /portal/kasam: bakiye "1.000,00 TL"; masraf formu (masraf türü, tutar 300, alacaklı "TEST", belge dosyası [scratchpad'e küçük dummy pdf yaz], dosya-yok işaretle + açıklama) → Kaydet → bakiye "700,00 TL", açık hareketlerde masraf satırı; Kaldır → bakiye 1000; tekrar kaydet → Günü Kapat → onay → açık hareketler boşalır. Ekran görüntüleri. OPT4 + hareketleri sil.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/portal/OperasyonKasaSayfasi.tsx client/src/pages/portal/PortalApp.tsx
git status
git commit -m "feat(operasyon): Kasam sayfasi - bakiye + masraf kaydi (belge zorunlu) + gunu kapat

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Operasyon "Kapanışlarım" sayfası

**Files:**
- Create: `client/src/pages/portal/OperasyonKapanislarSayfasi.tsx`
- Modify: `client/src/pages/portal/PortalApp.tsx` (Route)

**Interfaces:**
- Consumes: `GET /api/portal/operasyon/kapanislar` → `Array<OperasyonGunKapanis & { avanslar, masraflar }>`.

- [ ] **Step 1: OperasyonKapanislarSayfasi.tsx oluştur**

```tsx
import { useQuery } from "@tanstack/react-query";
import type { OperasyonAvans, OperasyonGunKapanis, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTarih, formatPara } from "./portalUtils";

type Kapanis = OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };

export default function OperasyonKapanislarSayfasi() {
  const { data: kapanislar = [] } = useQuery<Kapanis[]>({ queryKey: ["/api/portal/operasyon/kapanislar"] });
  return (
    <div className="space-y-4">
      {kapanislar.length === 0 && <p className="text-sm text-muted-foreground">Henüz kapanış yok.</p>}
      {kapanislar.map((k) => (
        <Card key={k.id} data-testid={`kapanis-${k.id}`}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{formatTarih(k.gunTarihi)} Kapanışı</CardTitle>
            {k.durum === "geri_acildi" && <Badge variant="destructive">Geri Açıldı</Badge>}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><div className="text-muted-foreground text-xs">Açılış</div><div className="font-semibold">{formatPara(k.acilisBakiye, "TL")}</div></div>
              <div><div className="text-muted-foreground text-xs">Avans</div><div className="font-semibold text-green-600">+{formatPara(k.avansToplam, "TL")}</div></div>
              <div><div className="text-muted-foreground text-xs">Masraf</div><div className="font-semibold text-destructive">−{formatPara(k.masrafToplam, "TL")}</div></div>
              <div><div className="text-muted-foreground text-xs">Kapanış</div><div className="font-semibold">{formatPara(k.kapanisBakiye, "TL")}</div></div>
            </div>
            <div className="border-t pt-2 space-y-1">
              {k.masraflar.map((m) => (
                <div key={m.id} className="flex justify-between">
                  <span>{m.masrafTuru ?? "Masraf"} · {m.alacakli}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span>
                  <span className="text-destructive">−{formatPara(m.tutar, "TL")}</span>
                </div>
              ))}
              {k.masraflar.length === 0 && <div className="text-muted-foreground text-xs">Masraf yok.</div>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: PortalApp.tsx Route**

import `import OperasyonKapanislarSayfasi from "./OperasyonKapanislarSayfasi";`; `<Switch>` içine:
```tsx
              {me.rol === "operasyon" && (
                <Route path="/portal/kapanislarim" component={OperasyonKapanislarSayfasi} />
              )}
```

- [ ] **Step 3: Tip kontrolü + U+FFFD + kısa Playwright**

`npm run check` → 0 hata. U+FFFD. Playwright: OPT5 (dev, avans+masraf+kapanış hazırla) login → /portal/kapanislarim → kapanış kartı görünür (açılış/avans/masraf/kapanış + masraf satırı). Temizle.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/portal/OperasyonKapanislarSayfasi.tsx client/src/pages/portal/PortalApp.tsx
git status
git commit -m "feat(operasyon): Kapanislarim sayfasi - gecmis gun raporlari

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Muhasebe "Şube Masraf" (takip + avans + geri aç)

**Files:**
- Create: `client/src/pages/portal/OperasyonTakipSayfasi.tsx`
- Modify: `client/src/pages/portal/PortalApp.tsx` (Route)

**Interfaces:**
- Consumes: `GET /operasyon-takip`, `GET /operasyon-takip/:id`, `POST /operasyon-takip/:id/avans`, `POST /operasyon-takip/kapanis/:kapanisId/geri-ac`.

- [ ] **Step 1: OperasyonTakipSayfasi.tsx oluştur**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { OperasyonAvans, OperasyonGunKapanis, OperasyonMasraf } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatTarih, formatPara } from "./portalUtils";

type Satir = { id: string; adSoyad: string; kullaniciAdi: string; bakiye: number; bugunHarcanan: number };
type Kapanis = OperasyonGunKapanis & { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] };
type Detay = { bakiye: number; acik: { avanslar: OperasyonAvans[]; masraflar: OperasyonMasraf[] }; kapanislar: Kapanis[] };

export default function OperasyonTakipSayfasi() {
  const { toast } = useToast();
  const { data: liste = [] } = useQuery<Satir[]>({
    queryKey: ["/api/portal/operasyon-takip"], refetchInterval: 10000, refetchIntervalInBackground: true,
  });
  const [secili, setSecili] = useState<Satir | null>(null);
  const [avansDialog, setAvansDialog] = useState(false);
  const [avansTutar, setAvansTutar] = useState("");
  const [avansAciklama, setAvansAciklama] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const { data: detay } = useQuery<Detay>({
    queryKey: [`/api/portal/operasyon-takip/${secili?.id}`],
    enabled: !!secili,
    refetchInterval: secili ? 10000 : false,
    refetchIntervalInBackground: true,
  });

  const tazele = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/portal/operasyon-takip"] });
    if (secili) queryClient.invalidateQueries({ queryKey: [`/api/portal/operasyon-takip/${secili.id}`] });
  };

  const avansGonder = async () => {
    if (!secili) return;
    if (!avansTutar.trim()) { toast({ title: "Tutar girin", variant: "destructive" }); return; }
    setGonderiliyor(true);
    try {
      const res = await fetch(`/api/portal/operasyon-takip/${secili.id}/avans`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutar: avansTutar, aciklama: avansAciklama }), credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Gönderilemedi");
      toast({ title: "Avans yüklendi", description: `${secili.adSoyad} bakiyesine geçti.` });
      setAvansDialog(false); setAvansTutar(""); setAvansAciklama(""); tazele();
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
    finally { setGonderiliyor(false); }
  };

  const geriAc = async (kapanisId: string) => {
    try {
      const res = await fetch(`/api/portal/operasyon-takip/kapanis/${kapanisId}/geri-ac`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Geri açılamadı");
      toast({ title: "Gün geri açıldı", description: "Operasyon düzeltebilir." });
      tazele();
    } catch (err: any) { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Şube Bakiyeleri</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {liste.length === 0 && <p className="text-sm text-muted-foreground">Operasyon kullanıcısı yok.</p>}
          {liste.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid={`sube-${s.id}`}>
              <div>
                <div className="font-medium">{s.adSoyad}</div>
                <div className="text-xs text-muted-foreground">Bugün harcanan: {formatPara(s.bugunHarcanan, "TL")}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-lg font-bold ${s.bakiye < 0 ? "text-destructive" : ""}`} data-testid={`sube-bakiye-${s.id}`}>{formatPara(s.bakiye, "TL")}</div>
                <Button size="sm" onClick={() => { setSecili(s); setAvansDialog(true); }} data-testid={`button-avans-${s.id}`}>Avans Yükle</Button>
                <Button size="sm" variant="outline" onClick={() => setSecili(s)} data-testid={`button-detay-${s.id}`}>Detay</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {secili && detay && (
        <Card>
          <CardHeader><CardTitle>{secili.adSoyad} — Detay (Bakiye {formatPara(detay.bakiye, "TL")})</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-1">Açık Hareketler</div>
              {[...detay.acik.avanslar.map((a) => ({ t: "avans" as const, x: a })), ...detay.acik.masraflar.map((m) => ({ t: "masraf" as const, x: m }))].length === 0 && (
                <p className="text-xs text-muted-foreground">Açık hareket yok.</p>
              )}
              {detay.acik.avanslar.map((a) => (
                <div key={a.id} className="flex justify-between text-sm py-0.5"><span className="text-green-600">Avans · {formatTarih(a.tarih)} · {a.aciklama ?? "—"}</span><span className="text-green-600">+{formatPara(a.tutar, "TL")}</span></div>
              ))}
              {detay.acik.masraflar.map((m) => (
                <div key={m.id} className="flex justify-between text-sm py-0.5"><span>{m.masrafTuru ?? "Masraf"} · {m.alacakli}{m.belgeDosya && <> · <a className="underline" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer">belge</a></>}</span><span className="text-destructive">−{formatPara(m.tutar, "TL")}</span></div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-medium">Kapanmış Günler</div>
              {detay.kapanislar.length === 0 && <p className="text-xs text-muted-foreground">Kapanış yok.</p>}
              {detay.kapanislar.map((k) => (
                <div key={k.id} className="rounded-md border p-3 space-y-1" data-testid={`takip-kapanis-${k.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{formatTarih(k.gunTarihi)} · Kapanış {formatPara(k.kapanisBakiye, "TL")}</div>
                    <div className="flex items-center gap-2">
                      {k.durum === "geri_acildi" && <Badge variant="destructive">Geri Açıldı</Badge>}
                      {k.durum === "kapali" && <Button size="sm" variant="outline" onClick={() => geriAc(k.id)} data-testid={`button-geri-ac-${k.id}`}>Geri Aç</Button>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">Açılış {formatPara(k.acilisBakiye, "TL")} · Avans +{formatPara(k.avansToplam, "TL")} · Masraf −{formatPara(k.masrafToplam, "TL")}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={avansDialog} onOpenChange={setAvansDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Avans Yükle — {secili?.adSoyad}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Tutar (TL)</Label><Input placeholder="0,00" value={avansTutar} onChange={(e) => setAvansTutar(e.target.value)} data-testid="input-avans-tutar" /></div>
            <div className="space-y-1"><Label>Açıklama</Label><Input value={avansAciklama} onChange={(e) => setAvansAciklama(e.target.value)} data-testid="input-avans-aciklama" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvansDialog(false)}>Vazgeç</Button>
            <Button onClick={avansGonder} disabled={gonderiliyor} data-testid="button-avans-gonder">{gonderiliyor ? "Gönderiliyor…" : "Yükle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: PortalApp.tsx Route**

import `import OperasyonTakipSayfasi from "./OperasyonTakipSayfasi";`; `<Switch>` içine:
```tsx
              {me.rol === "muhasebe" && (
                <Route path="/portal/sube-masraf" component={OperasyonTakipSayfasi} />
              )}
```

- [ ] **Step 3: Tip kontrolü + U+FFFD**

`npm run check` → 0 hata. U+FFFD (yeni dosya + PortalApp).

- [ ] **Step 4: Playwright**

Scratchpad `op-t6.js`: dev DB'de operasyon kullanıcısı OPT6. muhasebe login → /portal/sube-masraf → OPT6 satırı bakiye 0; Avans Yükle 1000 → bakiye "1.000,00 TL"; Detay → açık avans görünür. (Operasyon OPT6 login edip masraf+kapanış yapıp muhasebede rapor + Geri Aç akışını da doğrula, ya da T7 E2E'ye bırak.) Temizle.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/portal/OperasyonTakipSayfasi.tsx client/src/pages/portal/PortalApp.tsx
git status
git commit -m "feat(operasyon): muhasebe Sube Masraf - canli bakiye + avans yukle + gun raporu + geri ac

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Uçtan uca E2E + build

**Files:**
- Create (scratchpad): `e2e-operasyon.js`
- Modify: yok (gerçek hata → raporla)

- [ ] **Step 1: Tam akış E2E**

`e2e-operasyon.js` (dev DB): (0) operasyon kullanıcısı OPE2E (1234) oluştur. (1) muhasebe → Şube Masraf → OPE2E'ye 1000 avans. (2) OPE2E login → Kasam: bakiye 1000; masraf kaydet 300 (belge zorunlu — dummy dosya, dosya-yok+açıklama) → bakiye 700; ikinci masraf 200 → bakiye 500. (3) Günü Kapat → onay → açık hareketler boşalır; Kapanışlarım'da kapanış kartı (açılış 0/avans 1000/masraf 500/kapanış 500). (4) muhasebe → Şube Masraf → OPE2E bakiye 500; Detay → kapanış raporu; **Geri Aç** → durum geri_acildi; OPE2E Kasam'da hareketler tekrar açık, bakiye HÂLÂ 500. (5) muhasebe ikinci gün 500 avans → bakiye 1000 (devir + yeni avans). Sonuçları raporla. Başarısızlıkta kod DEĞİŞTİRME.

- [ ] **Step 2: Temizlik**

OPE2E/OPT4/OPT5/OPT6/OPTEST kullanıcıları + operasyon_avanslar/masraflar/gun_kapanis satırları + uploads/operasyon test dosyaları sil (dev DB). Kalan operasyon kullanıcısı=0 doğrula.

- [ ] **Step 3: Kalite kapıları**

`npm run check` → hatasız; `npm run build` → dist/, hatasız. Dev sunucu açık kalır.

- [ ] **Step 4: Rapor**

Commit YOK. Rapora: E2E adım sonuçları + ekran görüntüleri, temizlik sayıları, check/build özeti.

---

## Self-Review Notu

- Spec §3 (rol/auth) → T2 S1 + T3; §4 (şema) → T1 S1; §5 (bakiye/kapanış storage) → T1 S3; §6 (API) → T2 S3-4; §7 (operasyon UI) → T4+T5; §8 (muhasebe UI) → T6; §10 (doğrulama) → T1 S5 (storage), T4/T5/T6 (Playwright), T7 (E2E+build).
- Tip tutarlılığı: storage metot imzaları (T1) ↔ route çağrıları (T2) ↔ query tipleri (T4-T6). `OperasyonAvans/Masraf/GunKapanis` T1'de; `Ozet`/`Detay`/`Satir`/`Kapanis` tipleri sayfalarda tutarlı. Testid'ler her sayfada.
- HER GÖREVDE tsc YEŞİL: T3 sidebar linkleri string (sayfa import yok); her sayfa kendi Route+import'unu getiriyor (T4-T6). Bakiye türetilmiş (SQL SUM) — ayrı yürüyen-bakiye kolonu yok. Tutarlar decimal(14,2), giriş parseTutar.
- DEV DB İZOLASYONU her DB-yazan görevin başında doğrulanıyor (Global Constraints).
- Kapsam dışı (çoklu döviz, avans onayı, PDF): planda yok.
