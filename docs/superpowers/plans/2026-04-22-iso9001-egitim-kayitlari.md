# ISO 9001 Eğitim Kayıtları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ISO 9001 Eğitim Kayıtları module with personnel management, training records, optional certificate upload, configurable evaluation form template, and per-training public evaluation links.

**Architecture:** Six new DB tables (iso_personeller, egitimler, egitim_katilimcilar, egitim_degerlendirme_sorulari, egitim_degerlendirmeler, egitim_degerlendirme_cevaplari). Protected API routes handle CRUD; two public routes serve/accept the evaluation form. Frontend has a 3-tab protected page at `/iso9001/egitimler` and a public page at `/egitim-degerlendirme/:id`.

**Tech Stack:** PostgreSQL + Drizzle ORM, Express.js + multer, React + TypeScript + shadcn/ui, tanstack-query, wouter

---

## File Map

| File | Action | What changes |
|---|---|---|
| `shared/schema.ts` | Modify | Add 6 new tables + types |
| `server/storage.ts` | Modify | IStorage interface + DatabaseStorage implementations + update getIso9001Stats |
| `server/routes.ts` | Modify | Add ISO Personeller, Egitimler, Degerlendirme Sorulari, public Degerlendirme endpoints |
| `client/src/pages/ISO9001Egitimler.tsx` | Create | 3-tab page: Eğitimler, Personeller, Değerlendirme Şablonu |
| `client/src/pages/PublicEgitimDegerlendirme.tsx` | Create | Public evaluation form at /egitim-degerlendirme/:id |
| `client/src/App.tsx` | Modify | Add /iso9001/egitimler route, /egitim-degerlendirme/:id public route, pageTitles entry |
| `client/src/pages/ISO9001.tsx` | Modify | Activate Eğitim Kayıtları card, add egitimCount/toplamKatilimciCount to stats type |

---

## Task 1: Schema — 6 new tables

**Files:**
- Modify: `shared/schema.ts` (end of file, after line 531)

- [ ] **Step 1: Add the 6 tables at the end of shared/schema.ts**

Append after the last line (`export type KaliteOlcum = typeof kaliteOlcumler.$inferSelect;`):

```typescript
// ISO Personeller (ISO modülüne özel)
export const isoPersoneller = pgTable("iso_personeller", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ad: text("ad").notNull(),
  pozisyon: text("pozisyon"),
  departman: text("departman"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertIsoPersonelSchema = createInsertSchema(isoPersoneller).omit({ id: true, olusturmaTarihi: true });
export type InsertIsoPersonel = z.infer<typeof insertIsoPersonelSchema>;
export type IsoPersonel = typeof isoPersoneller.$inferSelect;

// Eğitimler
export const egitimler = pgTable("egitimler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  baslik: text("baslik").notNull(),
  egitimTarihi: text("egitim_tarihi").notNull(), // YYYY-MM-DD
  sure: text("sure"),
  egitimci: text("egitimci"),
  aciklama: text("aciklama"),
  sertifikaDosyaYolu: text("sertifika_dosya_yolu"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertEgitimSchema = createInsertSchema(egitimler).omit({ id: true, olusturmaTarihi: true });
export type InsertEgitim = z.infer<typeof insertEgitimSchema>;
export type Egitim = typeof egitimler.$inferSelect;

// Eğitim Katılımcıları
export const egitimKatilimcilar = pgTable("egitim_katilimcilar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  egitimId: varchar("egitim_id").references(() => egitimler.id, { onDelete: "cascade" }).notNull(),
  personelId: varchar("personel_id").references(() => isoPersoneller.id, { onDelete: "cascade" }).notNull(),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertEgitimKatilimciSchema = createInsertSchema(egitimKatilimcilar).omit({ id: true, olusturmaTarihi: true });
export type InsertEgitimKatilimci = z.infer<typeof insertEgitimKatilimciSchema>;
export type EgitimKatilimci = typeof egitimKatilimcilar.$inferSelect;

// Değerlendirme Şablonu Soruları
export const egitimDegerlendirmeSorulari = pgTable("egitim_degerlendirme_sorulari", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  soru: text("soru").notNull(),
  tip: text("tip").notNull(), // "puan_1_5" | "acik_metin"
  sira: integer("sira").notNull(),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertEgitimDegerlendirmeSoruSchema = createInsertSchema(egitimDegerlendirmeSorulari).omit({ id: true, olusturmaTarihi: true });
export type InsertEgitimDegerlendirmeSoru = z.infer<typeof insertEgitimDegerlendirmeSoruSchema>;
export type EgitimDegerlendirmeSoru = typeof egitimDegerlendirmeSorulari.$inferSelect;

// Değerlendirmeler (her form dolduruluşu)
export const egitimDegerlendirmeler = pgTable("egitim_degerlendirmeler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  egitimId: varchar("egitim_id").references(() => egitimler.id, { onDelete: "cascade" }).notNull(),
  katilimciAdi: text("katilimci_adi").notNull(),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertEgitimDegerlendirmeSchema = createInsertSchema(egitimDegerlendirmeler).omit({ id: true, olusturmaTarihi: true });
export type InsertEgitimDegerlendirme = z.infer<typeof insertEgitimDegerlendirmeSchema>;
export type EgitimDegerlendirme = typeof egitimDegerlendirmeler.$inferSelect;

// Değerlendirme Cevapları
export const egitimDegerlendirmeCevaplari = pgTable("egitim_degerlendirme_cevaplari", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  degerlendirmeId: varchar("degerlendirme_id").references(() => egitimDegerlendirmeler.id, { onDelete: "cascade" }).notNull(),
  soruId: varchar("soru_id").references(() => egitimDegerlendirmeSorulari.id, { onDelete: "cascade" }).notNull(),
  puan: integer("puan"),
  cevap: text("cevap"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertEgitimDegerlendirmeCevapSchema = createInsertSchema(egitimDegerlendirmeCevaplari).omit({ id: true, olusturmaTarihi: true });
export type InsertEgitimDegerlendirmeCevap = z.infer<typeof insertEgitimDegerlendirmeCevapSchema>;
export type EgitimDegerlendirmeCevap = typeof egitimDegerlendirmeCevaplari.$inferSelect;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors (or only pre-existing errors unrelated to schema)

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat: add egitim kayitlari schema tables"
```

---

## Task 2: Storage — Interface + Implementations

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Add new imports to the import line at top of storage.ts**

The existing import line (line 1) imports from `@shared/schema`. Add the new types to it. The line currently ends with `...type InsertKaliteOlcum` — add after it:

```typescript
, isoPersoneller, type IsoPersonel, type InsertIsoPersonel,
  egitimler, type Egitim, type InsertEgitim,
  egitimKatilimcilar, type EgitimKatilimci, type InsertEgitimKatilimci,
  egitimDegerlendirmeSorulari, type EgitimDegerlendirmeSoru, type InsertEgitimDegerlendirmeSoru,
  egitimDegerlendirmeler, type EgitimDegerlendirme, type InsertEgitimDegerlendirme,
  egitimDegerlendirmeCevaplari, type EgitimDegerlendirmeCevap, type InsertEgitimDegerlendirmeCevap
```

- [ ] **Step 2: Add IStorage interface methods for Eğitim Kayıtları**

Find the `deleteBelge` line in the IStorage interface (around line 174) and add after the closing `}` of that method signature:

```typescript
  // ISO Personeller
  getIsoPersoneller(): Promise<(IsoPersonel & { egitimSayisi: number })[]>;
  getIsoPersonelKart(id: string): Promise<{ personel: IsoPersonel; egitimler: { egitimId: string; baslik: string; egitimTarihi: string; degerlendirmeDoldu: boolean }[] }>;
  createIsoPersonel(data: InsertIsoPersonel): Promise<IsoPersonel>;
  updateIsoPersonel(id: string, data: Partial<InsertIsoPersonel>): Promise<IsoPersonel>;
  deleteIsoPersonel(id: string): Promise<void>;

  // Eğitimler
  getEgitimler(): Promise<(Egitim & { katilimciSayisi: number; degerlendirmeSayisi: number })[]>;
  getEgitimKatilimcilar(egitimId: string): Promise<(EgitimKatilimci & { personel: IsoPersonel })[]>;
  createEgitim(data: InsertEgitim): Promise<Egitim>;
  updateEgitim(id: string, data: Partial<InsertEgitim>): Promise<Egitim>;
  deleteEgitim(id: string): Promise<void>;
  addEgitimKatilimcilar(egitimId: string, personelIds: string[]): Promise<void>;
  removeEgitimKatilimci(egitimId: string, personelId: string): Promise<void>;

  // Değerlendirme Şablonu
  getDegerlendirmeSorulari(): Promise<EgitimDegerlendirmeSoru[]>;
  createDegerlendirmeSoru(data: InsertEgitimDegerlendirmeSoru): Promise<EgitimDegerlendirmeSoru>;
  updateDegerlendirmeSoru(id: string, data: Partial<InsertEgitimDegerlendirmeSoru>): Promise<EgitimDegerlendirmeSoru>;
  deleteDegerlendirmeSoru(id: string): Promise<void>;

  // Public: Değerlendirme
  getEgitimForDegerlendirme(egitimId: string): Promise<{ egitim: Egitim; sorular: EgitimDegerlendirmeSoru[] } | null>;
  createEgitimDegerlendirme(data: { egitimId: string; katilimciAdi: string; cevaplar: { soruId: string; puan?: number; cevap?: string }[] }): Promise<void>;
  getEgitimDegerlendirmeleri(egitimId: string): Promise<(EgitimDegerlendirme & { cevaplar: EgitimDegerlendirmeCevap[] })[]>;
```

- [ ] **Step 3: Update IStorage.getIso9001Stats return type**

Find the `getIso9001Stats(): Promise<{` in the IStorage interface and add two fields to the return type object:

```typescript
    egitimCount: number;
    toplamKatilimciCount: number;
```

Add them after `hedefYesilCount: number;`.

- [ ] **Step 4: Add DatabaseStorage implementations — ISO Personeller**

Add after the `deleteBelge` implementation (at the very end of the DatabaseStorage class, before the closing `}`):

```typescript
  async getIsoPersoneller(): Promise<(IsoPersonel & { egitimSayisi: number })[]> {
    const personeller = await db.select().from(isoPersoneller).orderBy(asc(isoPersoneller.ad));
    const counts = await db.select({
      personelId: egitimKatilimcilar.personelId,
      count: sql<number>`count(*)::int`,
    }).from(egitimKatilimcilar).groupBy(egitimKatilimcilar.personelId);
    const countMap = new Map(counts.map(c => [c.personelId, c.count]));
    return personeller.map(p => ({ ...p, egitimSayisi: countMap.get(p.id) ?? 0 }));
  }

  async getIsoPersonelKart(id: string): Promise<{ personel: IsoPersonel; egitimler: { egitimId: string; baslik: string; egitimTarihi: string; degerlendirmeDoldu: boolean }[] }> {
    const [personel] = await db.select().from(isoPersoneller).where(eq(isoPersoneller.id, id));
    if (!personel) throw new Error("Personel bulunamadı");

    const katilimlar = await db
      .select({ egitimId: egitimKatilimcilar.egitimId, baslik: egitimler.baslik, egitimTarihi: egitimler.egitimTarihi })
      .from(egitimKatilimcilar)
      .innerJoin(egitimler, eq(egitimKatilimcilar.egitimId, egitimler.id))
      .where(eq(egitimKatilimcilar.personelId, id))
      .orderBy(desc(egitimler.egitimTarihi));

    const degerlendirmeler = await db.select({ egitimId: egitimDegerlendirmeler.egitimId, katilimciAdi: egitimDegerlendirmeler.katilimciAdi })
      .from(egitimDegerlendirmeler);

    const egitimlerWithDurum = katilimlar.map(k => ({
      egitimId: k.egitimId,
      baslik: k.baslik,
      egitimTarihi: k.egitimTarihi,
      degerlendirmeDoldu: degerlendirmeler.some(d => d.egitimId === k.egitimId && d.katilimciAdi.toLowerCase() === personel.ad.toLowerCase()),
    }));

    return { personel, egitimler: egitimlerWithDurum };
  }

  async createIsoPersonel(data: InsertIsoPersonel): Promise<IsoPersonel> {
    const [row] = await db.insert(isoPersoneller).values(data).returning();
    return row;
  }

  async updateIsoPersonel(id: string, data: Partial<InsertIsoPersonel>): Promise<IsoPersonel> {
    const [row] = await db.update(isoPersoneller).set(data).where(eq(isoPersoneller.id, id)).returning();
    if (!row) throw new Error("Personel bulunamadı");
    return row;
  }

  async deleteIsoPersonel(id: string): Promise<void> {
    await db.delete(isoPersoneller).where(eq(isoPersoneller.id, id));
  }
```

- [ ] **Step 5: Add DatabaseStorage implementations — Eğitimler**

```typescript
  async getEgitimler(): Promise<(Egitim & { katilimciSayisi: number; degerlendirmeSayisi: number })[]> {
    const tumEgitimler = await db.select().from(egitimler).orderBy(desc(egitimler.egitimTarihi));
    const katilimCounts = await db.select({
      egitimId: egitimKatilimcilar.egitimId,
      count: sql<number>`count(*)::int`,
    }).from(egitimKatilimcilar).groupBy(egitimKatilimcilar.egitimId);
    const degerlendirmeCounts = await db.select({
      egitimId: egitimDegerlendirmeler.egitimId,
      count: sql<number>`count(*)::int`,
    }).from(egitimDegerlendirmeler).groupBy(egitimDegerlendirmeler.egitimId);

    const katMap = new Map(katilimCounts.map(c => [c.egitimId, c.count]));
    const degMap = new Map(degerlendirmeCounts.map(c => [c.egitimId, c.count]));

    return tumEgitimler.map(e => ({
      ...e,
      katilimciSayisi: katMap.get(e.id) ?? 0,
      degerlendirmeSayisi: degMap.get(e.id) ?? 0,
    }));
  }

  async getEgitimKatilimcilar(egitimId: string): Promise<(EgitimKatilimci & { personel: IsoPersonel })[]> {
    return await db
      .select({
        id: egitimKatilimcilar.id,
        egitimId: egitimKatilimcilar.egitimId,
        personelId: egitimKatilimcilar.personelId,
        olusturmaTarihi: egitimKatilimcilar.olusturmaTarihi,
        personel: isoPersoneller,
      })
      .from(egitimKatilimcilar)
      .innerJoin(isoPersoneller, eq(egitimKatilimcilar.personelId, isoPersoneller.id))
      .where(eq(egitimKatilimcilar.egitimId, egitimId))
      .orderBy(asc(isoPersoneller.ad));
  }

  async createEgitim(data: InsertEgitim): Promise<Egitim> {
    const [row] = await db.insert(egitimler).values(data).returning();
    return row;
  }

  async updateEgitim(id: string, data: Partial<InsertEgitim>): Promise<Egitim> {
    const [row] = await db.update(egitimler).set(data).where(eq(egitimler.id, id)).returning();
    if (!row) throw new Error("Eğitim bulunamadı");
    return row;
  }

  async deleteEgitim(id: string): Promise<void> {
    await db.delete(egitimler).where(eq(egitimler.id, id));
  }

  async addEgitimKatilimcilar(egitimId: string, personelIds: string[]): Promise<void> {
    if (personelIds.length === 0) return;
    const values = personelIds.map(personelId => ({ egitimId, personelId }));
    await db.insert(egitimKatilimcilar).values(values).onConflictDoNothing();
  }

  async removeEgitimKatilimci(egitimId: string, personelId: string): Promise<void> {
    await db.delete(egitimKatilimcilar).where(
      and(eq(egitimKatilimcilar.egitimId, egitimId), eq(egitimKatilimcilar.personelId, personelId))
    );
  }
```

- [ ] **Step 6: Add DatabaseStorage implementations — Değerlendirme Şablonu**

```typescript
  async getDegerlendirmeSorulari(): Promise<EgitimDegerlendirmeSoru[]> {
    return await db.select().from(egitimDegerlendirmeSorulari).orderBy(asc(egitimDegerlendirmeSorulari.sira));
  }

  async createDegerlendirmeSoru(data: InsertEgitimDegerlendirmeSoru): Promise<EgitimDegerlendirmeSoru> {
    const [row] = await db.insert(egitimDegerlendirmeSorulari).values(data).returning();
    return row;
  }

  async updateDegerlendirmeSoru(id: string, data: Partial<InsertEgitimDegerlendirmeSoru>): Promise<EgitimDegerlendirmeSoru> {
    const [row] = await db.update(egitimDegerlendirmeSorulari).set(data).where(eq(egitimDegerlendirmeSorulari.id, id)).returning();
    if (!row) throw new Error("Soru bulunamadı");
    return row;
  }

  async deleteDegerlendirmeSoru(id: string): Promise<void> {
    await db.delete(egitimDegerlendirmeSorulari).where(eq(egitimDegerlendirmeSorulari.id, id));
  }

  async getEgitimForDegerlendirme(egitimId: string): Promise<{ egitim: Egitim; sorular: EgitimDegerlendirmeSoru[] } | null> {
    const [egitim] = await db.select().from(egitimler).where(eq(egitimler.id, egitimId));
    if (!egitim) return null;
    const sorular = await db.select().from(egitimDegerlendirmeSorulari).orderBy(asc(egitimDegerlendirmeSorulari.sira));
    return { egitim, sorular };
  }

  async createEgitimDegerlendirme(data: { egitimId: string; katilimciAdi: string; cevaplar: { soruId: string; puan?: number; cevap?: string }[] }): Promise<void> {
    const [degerlendirme] = await db.insert(egitimDegerlendirmeler).values({
      egitimId: data.egitimId,
      katilimciAdi: data.katilimciAdi,
    }).returning();

    if (data.cevaplar.length > 0) {
      await db.insert(egitimDegerlendirmeCevaplari).values(
        data.cevaplar.map(c => ({
          degerlendirmeId: degerlendirme.id,
          soruId: c.soruId,
          puan: c.puan ?? null,
          cevap: c.cevap ?? null,
        }))
      );
    }
  }

  async getEgitimDegerlendirmeleri(egitimId: string): Promise<(EgitimDegerlendirme & { cevaplar: EgitimDegerlendirmeCevap[] })[]> {
    const degerlendirmelerList = await db.select().from(egitimDegerlendirmeler)
      .where(eq(egitimDegerlendirmeler.egitimId, egitimId))
      .orderBy(desc(egitimDegerlendirmeler.olusturmaTarihi));

    if (degerlendirmelerList.length === 0) return [];

    const cevaplar = await db.select().from(egitimDegerlendirmeCevaplari)
      .where(inArray(egitimDegerlendirmeCevaplari.degerlendirmeId, degerlendirmelerList.map(d => d.id)));

    return degerlendirmelerList.map(d => ({
      ...d,
      cevaplar: cevaplar.filter(c => c.degerlendirmeId === d.id),
    }));
  }
```

- [ ] **Step 7: Update getIso9001Stats to include egitimCount and toplamKatilimciCount**

Find the `return {` block inside the `getIso9001Stats` implementation (around line 1596) and add two new fields:

```typescript
      egitimCount: (await db.select({ count: sql<number>`count(*)::int` }).from(egitimler))[0].count,
      toplamKatilimciCount: (await db.select({ count: sql<number>`count(*)::int` }).from(egitimKatilimcilar))[0].count,
```

Add them inside the return object, after `hedefYesilCount,`.

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 9: Commit**

```bash
git add server/storage.ts
git commit -m "feat: add egitim kayitlari storage methods"
```

---

## Task 3: API Routes

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Add egitimler multer storage config**

After the `uploadBelge` multer config (around line 60), add:

```typescript
const egitimStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "uploads/egitimler";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const uploadEgitim = multer({ storage: egitimStorage });
```

- [ ] **Step 2: Add ISO Personeller routes**

Add at the end of the `registerRoutes` function, after the last existing route block (before `return httpServer`):

```typescript
  // ISO Personeller
  app.get("/api/iso-personeller", async (_req, res) => {
    try {
      res.json(await storage.getIsoPersoneller());
    } catch {
      res.status(500).json({ error: "Personel listesi alınamadı" });
    }
  });

  app.get("/api/iso-personeller/:id/kart", async (req, res) => {
    try {
      res.json(await storage.getIsoPersonelKart(req.params.id));
    } catch {
      res.status(404).json({ error: "Personel bulunamadı" });
    }
  });

  app.post("/api/iso-personeller", async (req, res) => {
    try {
      res.status(201).json(await storage.createIsoPersonel(req.body));
    } catch {
      res.status(400).json({ error: "Personel oluşturulamadı" });
    }
  });

  app.put("/api/iso-personeller/:id", async (req, res) => {
    try {
      res.json(await storage.updateIsoPersonel(req.params.id, req.body));
    } catch {
      res.status(400).json({ error: "Personel güncellenemedi" });
    }
  });

  app.delete("/api/iso-personeller/:id", async (req, res) => {
    try {
      await storage.deleteIsoPersonel(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Personel silinemedi" });
    }
  });
```

- [ ] **Step 3: Add Eğitimler routes**

```typescript
  // Eğitimler
  app.get("/api/egitimler", async (_req, res) => {
    try {
      res.json(await storage.getEgitimler());
    } catch {
      res.status(500).json({ error: "Eğitimler alınamadı" });
    }
  });

  app.post("/api/egitimler", uploadEgitim.single("sertifika"), async (req, res) => {
    try {
      const data = JSON.parse(req.body.data ?? "{}");
      if (req.file) data.sertifikaDosyaYolu = `/uploads/egitimler/${req.file.filename}`;
      res.status(201).json(await storage.createEgitim(data));
    } catch {
      res.status(400).json({ error: "Eğitim oluşturulamadı" });
    }
  });

  app.put("/api/egitimler/:id", uploadEgitim.single("sertifika"), async (req, res) => {
    try {
      const data = JSON.parse(req.body.data ?? "{}");
      if (req.file) data.sertifikaDosyaYolu = `/uploads/egitimler/${req.file.filename}`;
      res.json(await storage.updateEgitim(req.params.id, data));
    } catch {
      res.status(400).json({ error: "Eğitim güncellenemedi" });
    }
  });

  app.delete("/api/egitimler/:id", async (req, res) => {
    try {
      await storage.deleteEgitim(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Eğitim silinemedi" });
    }
  });

  app.get("/api/egitimler/:id/katilimcilar", async (req, res) => {
    try {
      res.json(await storage.getEgitimKatilimcilar(req.params.id));
    } catch {
      res.status(500).json({ error: "Katılımcılar alınamadı" });
    }
  });

  app.post("/api/egitimler/:id/katilimcilar", async (req, res) => {
    try {
      const { personelIds } = req.body as { personelIds: string[] };
      await storage.addEgitimKatilimcilar(req.params.id, personelIds);
      res.status(201).json({ ok: true });
    } catch {
      res.status(400).json({ error: "Katılımcı eklenemedi" });
    }
  });

  app.delete("/api/egitimler/:id/katilimcilar/:personelId", async (req, res) => {
    try {
      await storage.removeEgitimKatilimci(req.params.id, req.params.personelId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Katılımcı çıkarılamadı" });
    }
  });

  app.get("/api/egitimler/:id/degerlendirmeler", async (req, res) => {
    try {
      res.json(await storage.getEgitimDegerlendirmeleri(req.params.id));
    } catch {
      res.status(500).json({ error: "Değerlendirmeler alınamadı" });
    }
  });
```

- [ ] **Step 4: Add Değerlendirme Şablonu routes**

```typescript
  // Değerlendirme Şablonu
  app.get("/api/degerlendirme-sorulari", async (_req, res) => {
    try {
      res.json(await storage.getDegerlendirmeSorulari());
    } catch {
      res.status(500).json({ error: "Sorular alınamadı" });
    }
  });

  app.post("/api/degerlendirme-sorulari", async (req, res) => {
    try {
      res.status(201).json(await storage.createDegerlendirmeSoru(req.body));
    } catch {
      res.status(400).json({ error: "Soru oluşturulamadı" });
    }
  });

  app.put("/api/degerlendirme-sorulari/:id", async (req, res) => {
    try {
      res.json(await storage.updateDegerlendirmeSoru(req.params.id, req.body));
    } catch {
      res.status(400).json({ error: "Soru güncellenemedi" });
    }
  });

  app.delete("/api/degerlendirme-sorulari/:id", async (req, res) => {
    try {
      await storage.deleteDegerlendirmeSoru(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Soru silinemedi" });
    }
  });
```

- [ ] **Step 5: Add public Değerlendirme routes**

```typescript
  // Public: Eğitim Değerlendirme (no auth required)
  app.get("/api/egitim-degerlendirme/:id", async (req, res) => {
    try {
      const result = await storage.getEgitimForDegerlendirme(req.params.id);
      if (!result) return res.status(404).json({ error: "Eğitim bulunamadı" });
      res.json(result);
    } catch {
      res.status(500).json({ error: "Eğitim bilgisi alınamadı" });
    }
  });

  app.post("/api/egitim-degerlendirme", async (req, res) => {
    try {
      await storage.createEgitimDegerlendirme(req.body);
      res.status(201).json({ ok: true });
    } catch {
      res.status(400).json({ error: "Değerlendirme kaydedilemedi" });
    }
  });
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts
git commit -m "feat: add egitim kayitlari API routes"
```

---

## Task 4: Frontend — ISO9001Egitimler.tsx (3-tab protected page)

**Files:**
- Create: `client/src/pages/ISO9001Egitimler.tsx`

- [ ] **Step 1: Create the file**

```typescript
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Link as LinkIcon, User, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type IsoPersonel = {
  id: string;
  ad: string;
  pozisyon: string | null;
  departman: string | null;
  egitimSayisi: number;
};

type Egitim = {
  id: string;
  baslik: string;
  egitimTarihi: string;
  sure: string | null;
  egitimci: string | null;
  aciklama: string | null;
  sertifikaDosyaYolu: string | null;
  katilimciSayisi: number;
  degerlendirmeSayisi: number;
};

type Katilimci = {
  id: string;
  egitimId: string;
  personelId: string;
  personel: IsoPersonel;
};

type Soru = {
  id: string;
  soru: string;
  tip: string;
  sira: number;
};

type PersonelKart = {
  personel: IsoPersonel;
  egitimler: { egitimId: string; baslik: string; egitimTarihi: string; degerlendirmeDoldu: boolean }[];
};

const emptyPersonelForm = { ad: "", pozisyon: "", departman: "" };
const emptyEgitimForm = { baslik: "", egitimTarihi: "", sure: "", egitimci: "", aciklama: "" };
const emptySoruForm = { soru: "", tip: "puan_1_5", sira: 1 };

export default function ISO9001Egitimler() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Eğitimler state
  const [expandedEgitimId, setExpandedEgitimId] = useState<string | null>(null);
  const [egitimModal, setEgitimModal] = useState<{ open: boolean; editing: Egitim | null }>({ open: false, editing: null });
  const [egitimForm, setEgitimForm] = useState(emptyEgitimForm);
  const [egitimSertifika, setEgitimSertifika] = useState<File | null>(null);
  const [katilimciModal, setKatilimciModal] = useState<{ open: boolean; egitimId: string | null }>({ open: false, egitimId: null });
  const [selectedPersonelIds, setSelectedPersonelIds] = useState<string[]>([]);

  // Personeller state
  const [personelModal, setPersonelModal] = useState<{ open: boolean; editing: IsoPersonel | null }>({ open: false, editing: null });
  const [personelForm, setPersonelForm] = useState(emptyPersonelForm);
  const [kartModal, setKartModal] = useState<{ open: boolean; personelId: string | null }>({ open: false, personelId: null });

  // Şablon state
  const [soruModal, setSoruModal] = useState<{ open: boolean; editing: Soru | null }>({ open: false, editing: null });
  const [soruForm, setSoruForm] = useState(emptySoruForm);

  // Queries
  const { data: egitimlerList = [] } = useQuery<Egitim[]>({
    queryKey: ["/api/egitimler"],
    queryFn: () => fetch("/api/egitimler").then(r => r.json()),
  });

  const { data: personellerList = [] } = useQuery<IsoPersonel[]>({
    queryKey: ["/api/iso-personeller"],
    queryFn: () => fetch("/api/iso-personeller").then(r => r.json()),
  });

  const { data: sorularList = [] } = useQuery<Soru[]>({
    queryKey: ["/api/degerlendirme-sorulari"],
    queryFn: () => fetch("/api/degerlendirme-sorulari").then(r => r.json()),
  });

  const { data: katilimcilar = [] } = useQuery<Katilimci[]>({
    queryKey: ["/api/egitimler", expandedEgitimId, "katilimcilar"],
    queryFn: () => fetch(`/api/egitimler/${expandedEgitimId}/katilimcilar`).then(r => r.json()),
    enabled: !!expandedEgitimId,
  });

  const { data: kartData } = useQuery<PersonelKart>({
    queryKey: ["/api/iso-personeller", kartModal.personelId, "kart"],
    queryFn: () => fetch(`/api/iso-personeller/${kartModal.personelId}/kart`).then(r => r.json()),
    enabled: !!kartModal.personelId && kartModal.open,
  });

  // Eğitim mutations
  const createEgitimMutation = useMutation({
    mutationFn: (formData: FormData) => fetch("/api/egitimler", { method: "POST", body: formData }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/egitimler"] }); qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] }); setEgitimModal({ open: false, editing: null }); setEgitimForm(emptyEgitimForm); setEgitimSertifika(null); toast({ title: "Eğitim oluşturuldu" }); },
    onError: () => toast({ title: "Hata", description: "Eğitim oluşturulamadı", variant: "destructive" }),
  });

  const updateEgitimMutation = useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) => fetch(`/api/egitimler/${id}`, { method: "PUT", body: formData }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/egitimler"] }); setEgitimModal({ open: false, editing: null }); setEgitimForm(emptyEgitimForm); setEgitimSertifika(null); toast({ title: "Eğitim güncellendi" }); },
    onError: () => toast({ title: "Hata", description: "Eğitim güncellenemedi", variant: "destructive" }),
  });

  const deleteEgitimMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/egitimler/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/egitimler"] }); qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] }); toast({ title: "Eğitim silindi" }); },
    onError: () => toast({ title: "Hata", description: "Eğitim silinemedi", variant: "destructive" }),
  });

  const addKatilimciMutation = useMutation({
    mutationFn: ({ egitimId, personelIds }: { egitimId: string; personelIds: string[] }) =>
      fetch(`/api/egitimler/${egitimId}/katilimcilar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personelIds }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/egitimler", expandedEgitimId, "katilimcilar"] }); qc.invalidateQueries({ queryKey: ["/api/egitimler"] }); qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] }); setKatilimciModal({ open: false, egitimId: null }); setSelectedPersonelIds([]); toast({ title: "Katılımcılar eklendi" }); },
    onError: () => toast({ title: "Hata", description: "Katılımcı eklenemedi", variant: "destructive" }),
  });

  const removeKatilimciMutation = useMutation({
    mutationFn: ({ egitimId, personelId }: { egitimId: string; personelId: string }) =>
      fetch(`/api/egitimler/${egitimId}/katilimcilar/${personelId}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/egitimler", expandedEgitimId, "katilimcilar"] }); qc.invalidateQueries({ queryKey: ["/api/egitimler"] }); qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] }); toast({ title: "Katılımcı çıkarıldı" }); },
    onError: () => toast({ title: "Hata", description: "Katılımcı çıkarılamadı", variant: "destructive" }),
  });

  // Personel mutations
  const createPersonelMutation = useMutation({
    mutationFn: (data: typeof emptyPersonelForm) => fetch("/api/iso-personeller", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/iso-personeller"] }); setPersonelModal({ open: false, editing: null }); setPersonelForm(emptyPersonelForm); toast({ title: "Personel oluşturuldu" }); },
    onError: () => toast({ title: "Hata", description: "Personel oluşturulamadı", variant: "destructive" }),
  });

  const updatePersonelMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof emptyPersonelForm }) => fetch(`/api/iso-personeller/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/iso-personeller"] }); setPersonelModal({ open: false, editing: null }); setPersonelForm(emptyPersonelForm); toast({ title: "Personel güncellendi" }); },
    onError: () => toast({ title: "Hata", description: "Personel güncellenemedi", variant: "destructive" }),
  });

  const deletePersonelMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/iso-personeller/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/iso-personeller"] }); toast({ title: "Personel silindi" }); },
    onError: () => toast({ title: "Hata", description: "Personel silinemedi", variant: "destructive" }),
  });

  // Soru mutations
  const createSoruMutation = useMutation({
    mutationFn: (data: typeof emptySoruForm) => fetch("/api/degerlendirme-sorulari", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/degerlendirme-sorulari"] }); setSoruModal({ open: false, editing: null }); setSoruForm(emptySoruForm); toast({ title: "Soru eklendi" }); },
    onError: () => toast({ title: "Hata", description: "Soru eklenemedi", variant: "destructive" }),
  });

  const updateSoruMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof emptySoruForm }) => fetch(`/api/degerlendirme-sorulari/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/degerlendirme-sorulari"] }); setSoruModal({ open: false, editing: null }); setSoruForm(emptySoruForm); toast({ title: "Soru güncellendi" }); },
    onError: () => toast({ title: "Hata", description: "Soru güncellenemedi", variant: "destructive" }),
  });

  const deleteSoruMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/degerlendirme-sorulari/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/degerlendirme-sorulari"] }); toast({ title: "Soru silindi" }); },
    onError: () => toast({ title: "Hata", description: "Soru silinemedi", variant: "destructive" }),
  });

  const moveSoruMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { sira: number } }) => fetch(`/api/degerlendirme-sorulari/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/degerlendirme-sorulari"] }); },
  });

  // Handlers
  function submitEgitim() {
    const fd = new FormData();
    const data: Record<string, string | null> = {
      baslik: egitimForm.baslik,
      egitimTarihi: egitimForm.egitimTarihi,
      sure: egitimForm.sure || null,
      egitimci: egitimForm.egitimci || null,
      aciklama: egitimForm.aciklama || null,
    };
    fd.append("data", JSON.stringify(data));
    if (egitimSertifika) fd.append("sertifika", egitimSertifika);
    if (egitimModal.editing) {
      updateEgitimMutation.mutate({ id: egitimModal.editing.id, formData: fd });
    } else {
      createEgitimMutation.mutate(fd);
    }
  }

  function openDuzenleEgitim(e: Egitim) {
    setEgitimForm({ baslik: e.baslik, egitimTarihi: e.egitimTarihi, sure: e.sure ?? "", egitimci: e.egitimci ?? "", aciklama: e.aciklama ?? "" });
    setEgitimSertifika(null);
    setEgitimModal({ open: true, editing: e });
  }

  function submitPersonel() {
    const payload = { ad: personelForm.ad, pozisyon: personelForm.pozisyon || null, departman: personelForm.departman || null };
    if (personelModal.editing) {
      updatePersonelMutation.mutate({ id: personelModal.editing.id, data: payload as typeof emptyPersonelForm });
    } else {
      createPersonelMutation.mutate(payload as typeof emptyPersonelForm);
    }
  }

  function submitSoru() {
    const nextSira = sorularList.length > 0 ? Math.max(...sorularList.map(s => s.sira)) + 1 : 1;
    const payload = { soru: soruForm.soru, tip: soruForm.tip, sira: soruModal.editing ? soruForm.sira : nextSira };
    if (soruModal.editing) {
      updateSoruMutation.mutate({ id: soruModal.editing.id, data: payload });
    } else {
      createSoruMutation.mutate(payload);
    }
  }

  function moveSoru(soru: Soru, direction: "up" | "down") {
    const sorted = [...sorularList].sort((a, b) => a.sira - b.sira);
    const idx = sorted.findIndex(s => s.id === soru.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swapSoru = sorted[swapIdx];
    moveSoruMutation.mutate({ id: soru.id, data: { sira: swapSoru.sira } });
    moveSoruMutation.mutate({ id: swapSoru.id, data: { sira: soru.sira } });
  }

  function copyLink(egitimId: string) {
    const url = `${window.location.origin}/egitim-degerlendirme/${egitimId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link kopyalandı" });
  }

  const alreadyAddedIds = new Set(katilimcilar.map(k => k.personelId));

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <GraduationCap className="w-7 h-7 text-primary" />
        <h2 className="text-2xl font-semibold">Eğitim Kayıtları</h2>
      </div>

      <Tabs defaultValue="egitimler">
        <TabsList className="mb-4">
          <TabsTrigger value="egitimler">Eğitimler</TabsTrigger>
          <TabsTrigger value="personeller">Personeller</TabsTrigger>
          <TabsTrigger value="sablon">Değerlendirme Şablonu</TabsTrigger>
        </TabsList>

        {/* ---- EĞITIMLER TAB ---- */}
        <TabsContent value="egitimler">
          <div className="flex justify-end mb-3">
            <Button onClick={() => { setEgitimForm(emptyEgitimForm); setEgitimSertifika(null); setEgitimModal({ open: true, editing: null }); }}>
              <Plus className="w-4 h-4 mr-2" /> Yeni Eğitim
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="w-6 p-3"></th>
                  <th className="text-left p-3 font-medium">Başlık</th>
                  <th className="text-left p-3 font-medium">Tarih</th>
                  <th className="text-left p-3 font-medium">Süre</th>
                  <th className="text-left p-3 font-medium">Eğitimci</th>
                  <th className="text-left p-3 font-medium">Katılımcı</th>
                  <th className="text-left p-3 font-medium">Sertifika</th>
                  <th className="text-left p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {egitimlerList.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Henüz eğitim yok</td></tr>
                )}
                {egitimlerList.map(egitim => {
                  const isExpanded = expandedEgitimId === egitim.id;
                  return (
                    <>
                      <tr key={egitim.id} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => setExpandedEgitimId(isExpanded ? null : egitim.id)}>
                        <td className="p-3 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="p-3 font-medium">{egitim.baslik}</td>
                        <td className="p-3 text-muted-foreground">{egitim.egitimTarihi}</td>
                        <td className="p-3 text-muted-foreground">{egitim.sure ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{egitim.egitimci ?? "—"}</td>
                        <td className="p-3">
                          <Badge variant="secondary">{egitim.katilimciSayisi} kişi</Badge>
                        </td>
                        <td className="p-3">
                          {egitim.sertifikaDosyaYolu
                            ? <a href={egitim.sertifikaDosyaYolu} target="_blank" rel="noreferrer" className="text-primary underline text-xs" onClick={e => e.stopPropagation()}>İndir</a>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" title="Değerlendirme Linki Kopyala" onClick={() => copyLink(egitim.id)}>
                              <LinkIcon className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openDuzenleEgitim(egitim)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                              onClick={() => { if (confirm("Bu eğitim ve tüm verileri silinecek. Emin misiniz?")) deleteEgitimMutation.mutate(egitim.id); }}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${egitim.id}-expanded`} className="border-t bg-muted/10">
                          <td colSpan={8} className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-muted-foreground">
                                Katılımcılar ({egitim.katilimciSayisi}) · {egitim.degerlendirmeSayisi} değerlendirme
                              </span>
                              <Button size="sm" variant="outline" onClick={() => { setKatilimciModal({ open: true, egitimId: egitim.id }); setSelectedPersonelIds([]); }}>
                                <Plus className="w-3 h-3 mr-1" /> Katılımcı Ekle
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {katilimcilar.map(k => (
                                <div key={k.id} className="flex items-center gap-1 bg-background border rounded-full px-3 py-1 text-xs">
                                  <User className="w-3 h-3" />
                                  {k.personel.ad}
                                  <button className="ml-1 text-muted-foreground hover:text-red-500"
                                    onClick={() => removeKatilimciMutation.mutate({ egitimId: egitim.id, personelId: k.personelId })}>×</button>
                                </div>
                              ))}
                              {katilimcilar.length === 0 && <span className="text-xs text-muted-foreground">Henüz katılımcı yok</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ---- PERSONELLER TAB ---- */}
        <TabsContent value="personeller">
          <div className="flex justify-end mb-3">
            <Button onClick={() => { setPersonelForm(emptyPersonelForm); setPersonelModal({ open: true, editing: null }); }}>
              <Plus className="w-4 h-4 mr-2" /> Yeni Personel
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Ad</th>
                  <th className="text-left p-3 font-medium">Pozisyon</th>
                  <th className="text-left p-3 font-medium">Departman</th>
                  <th className="text-left p-3 font-medium">Eğitim Sayısı</th>
                  <th className="text-left p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {personellerList.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Henüz personel yok</td></tr>
                )}
                {personellerList.map(p => (
                  <tr key={p.id} className="border-t hover:bg-muted/20">
                    <td className="p-3 font-medium">{p.ad}</td>
                    <td className="p-3 text-muted-foreground">{p.pozisyon ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{p.departman ?? "—"}</td>
                    <td className="p-3"><Badge variant="secondary">{p.egitimSayisi} eğitim</Badge></td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setKartModal({ open: true, personelId: p.id })}>
                          <User className="w-4 h-4 mr-1" /> Kart
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setPersonelForm({ ad: p.ad, pozisyon: p.pozisyon ?? "", departman: p.departman ?? "" }); setPersonelModal({ open: true, editing: p }); }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                          onClick={() => { if (confirm("Bu personel silinecek. Emin misiniz?")) deletePersonelMutation.mutate(p.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ---- DEĞERLENDIRME ŞABLONU TAB ---- */}
        <TabsContent value="sablon">
          <div className="flex justify-end mb-3">
            <Button onClick={() => { setSoruForm({ soru: "", tip: "puan_1_5", sira: (sorularList.length || 0) + 1 }); setSoruModal({ open: true, editing: null }); }}>
              <Plus className="w-4 h-4 mr-2" /> Soru Ekle
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium w-12">Sıra</th>
                  <th className="text-left p-3 font-medium">Soru</th>
                  <th className="text-left p-3 font-medium">Tip</th>
                  <th className="text-left p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {sorularList.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Henüz soru yok</td></tr>
                )}
                {[...sorularList].sort((a, b) => a.sira - b.sira).map((soru, idx, arr) => (
                  <tr key={soru.id} className="border-t hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground">{soru.sira}</td>
                    <td className="p-3">{soru.soru}</td>
                    <td className="p-3">
                      <Badge variant="outline">{soru.tip === "puan_1_5" ? "1-5 Puan" : "Açık Metin"}</Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => moveSoru(soru, "up")}><ArrowUp className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" disabled={idx === arr.length - 1} onClick={() => moveSoru(soru, "down")}><ArrowDown className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { setSoruForm({ soru: soru.soru, tip: soru.tip, sira: soru.sira }); setSoruModal({ open: true, editing: soru }); }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                          onClick={() => { if (confirm("Bu soru silinecek. Emin misiniz?")) deleteSoruMutation.mutate(soru.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ---- EĞİTİM MODAL ---- */}
      <Dialog open={egitimModal.open} onOpenChange={open => { if (!open) setEgitimModal({ open: false, editing: null }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{egitimModal.editing ? "Eğitimi Düzenle" : "Yeni Eğitim"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Başlık *</Label>
              <Input value={egitimForm.baslik} onChange={e => setEgitimForm(f => ({ ...f, baslik: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Eğitim Tarihi *</Label>
                <Input type="date" value={egitimForm.egitimTarihi} onChange={e => setEgitimForm(f => ({ ...f, egitimTarihi: e.target.value }))} />
              </div>
              <div>
                <Label>Süre</Label>
                <Input placeholder="8 saat" value={egitimForm.sure} onChange={e => setEgitimForm(f => ({ ...f, sure: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Eğitimci</Label>
              <Input value={egitimForm.egitimci} onChange={e => setEgitimForm(f => ({ ...f, egitimci: e.target.value }))} />
            </div>
            <div>
              <Label>Açıklama</Label>
              <Textarea value={egitimForm.aciklama} onChange={e => setEgitimForm(f => ({ ...f, aciklama: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label>Sertifika (PDF/Resim)</Label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setEgitimSertifika(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEgitimModal({ open: false, editing: null })}>İptal</Button>
            <Button onClick={submitEgitim} disabled={!egitimForm.baslik || !egitimForm.egitimTarihi || createEgitimMutation.isPending || updateEgitimMutation.isPending}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- KATILIMCI EKLE MODAL ---- */}
      <Dialog open={katilimciModal.open} onOpenChange={open => { if (!open) setKatilimciModal({ open: false, egitimId: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Katılımcı Ekle</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {personellerList.filter(p => !alreadyAddedIds.has(p.id)).map(p => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/30 rounded p-2">
                <input type="checkbox" checked={selectedPersonelIds.includes(p.id)}
                  onChange={e => setSelectedPersonelIds(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))} />
                <span className="text-sm">{p.ad}</span>
                {p.pozisyon && <span className="text-xs text-muted-foreground">— {p.pozisyon}</span>}
              </label>
            ))}
            {personellerList.filter(p => !alreadyAddedIds.has(p.id)).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Tüm personeller zaten eklendi</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKatilimciModal({ open: false, egitimId: null })}>İptal</Button>
            <Button disabled={selectedPersonelIds.length === 0 || addKatilimciMutation.isPending}
              onClick={() => addKatilimciMutation.mutate({ egitimId: katilimciModal.egitimId!, personelIds: selectedPersonelIds })}>
              Ekle ({selectedPersonelIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- PERSONEL MODAL ---- */}
      <Dialog open={personelModal.open} onOpenChange={open => { if (!open) setPersonelModal({ open: false, editing: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{personelModal.editing ? "Personeli Düzenle" : "Yeni Personel"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Ad *</Label>
              <Input value={personelForm.ad} onChange={e => setPersonelForm(f => ({ ...f, ad: e.target.value }))} />
            </div>
            <div>
              <Label>Pozisyon</Label>
              <Input value={personelForm.pozisyon} onChange={e => setPersonelForm(f => ({ ...f, pozisyon: e.target.value }))} />
            </div>
            <div>
              <Label>Departman</Label>
              <Input value={personelForm.departman} onChange={e => setPersonelForm(f => ({ ...f, departman: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPersonelModal({ open: false, editing: null })}>İptal</Button>
            <Button onClick={submitPersonel} disabled={!personelForm.ad || createPersonelMutation.isPending || updatePersonelMutation.isPending}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- PERSONEL KART MODAL ---- */}
      <Dialog open={kartModal.open} onOpenChange={open => { if (!open) setKartModal({ open: false, personelId: null }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{kartData?.personel.ad ?? "Personel Kartı"}</DialogTitle>
          </DialogHeader>
          {kartData && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground space-y-1">
                {kartData.personel.pozisyon && <p>Pozisyon: {kartData.personel.pozisyon}</p>}
                {kartData.personel.departman && <p>Departman: {kartData.personel.departman}</p>}
                <p className="font-medium text-foreground">
                  Toplam {kartData.egitimler.length} eğitim · {kartData.egitimler.filter(e => e.degerlendirmeDoldu).length} değerlendirme doldurdu
                </p>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Eğitim</th>
                      <th className="text-left p-2 font-medium">Tarih</th>
                      <th className="text-left p-2 font-medium">Değerlendirme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kartData.egitimler.length === 0 && (
                      <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Henüz eğitim yok</td></tr>
                    )}
                    {kartData.egitimler.map(e => (
                      <tr key={e.egitimId} className="border-t">
                        <td className="p-2">{e.baslik}</td>
                        <td className="p-2 text-muted-foreground">{e.egitimTarihi}</td>
                        <td className="p-2">
                          {e.degerlendirmeDoldu
                            ? <Badge className="bg-green-100 text-green-800 border-green-300">Dolduruldu</Badge>
                            : <Badge variant="secondary">Doldurulmadı</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setKartModal({ open: false, personelId: null })}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- SORU MODAL ---- */}
      <Dialog open={soruModal.open} onOpenChange={open => { if (!open) setSoruModal({ open: false, editing: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{soruModal.editing ? "Soruyu Düzenle" : "Soru Ekle"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Soru Metni *</Label>
              <Textarea value={soruForm.soru} onChange={e => setSoruForm(f => ({ ...f, soru: e.target.value }))} rows={3} />
            </div>
            <div>
              <Label>Tip *</Label>
              <Select value={soruForm.tip} onValueChange={v => setSoruForm(f => ({ ...f, tip: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="puan_1_5">1-5 Puan</SelectItem>
                  <SelectItem value="acik_metin">Açık Metin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSoruModal({ open: false, editing: null })}>İptal</Button>
            <Button onClick={submitSoru} disabled={!soruForm.soru || createSoruMutation.isPending || updateSoruMutation.isPending}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/ISO9001Egitimler.tsx
git commit -m "feat: add ISO9001Egitimler page (3-tab training management)"
```

---

## Task 5: Frontend — PublicEgitimDegerlendirme.tsx

**Files:**
- Create: `client/src/pages/PublicEgitimDegerlendirme.tsx`

- [ ] **Step 1: Create the file**

```typescript
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, CheckCircle2 } from "lucide-react";

type Soru = { id: string; soru: string; tip: string; sira: number };
type EgitimInfo = { egitim: { id: string; baslik: string; egitimTarihi: string; egitimci: string | null }; sorular: Soru[] };

export default function PublicEgitimDegerlendirme() {
  const [, params] = useRoute("/egitim-degerlendirme/:id");
  const egitimId = params?.id;
  const { toast } = useToast();

  const [katilimciAdi, setKatilimciAdi] = useState("");
  const [puanlar, setPuanlar] = useState<Record<string, number>>({});
  const [metinler, setMetinler] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, error } = useQuery<EgitimInfo>({
    queryKey: [`/api/egitim-degerlendirme/${egitimId}`],
    enabled: !!egitimId,
    queryFn: () => fetch(`/api/egitim-degerlendirme/${egitimId}`).then(r => {
      if (!r.ok) throw new Error("Eğitim bulunamadı");
      return r.json();
    }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!data) return;
      const cevaplar = data.sorular.map(s => ({
        soruId: s.id,
        puan: s.tip === "puan_1_5" ? puanlar[s.id] : undefined,
        cevap: s.tip === "acik_metin" ? metinler[s.id] : undefined,
      }));
      const res = await fetch("/api/egitim-degerlendirme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ egitimId, katilimciAdi, cevaplar }),
      });
      if (!res.ok) throw new Error("Gönderme hatası");
    },
    onSuccess: () => setSubmitted(true),
    onError: () => toast({ title: "Hata", description: "Değerlendirme kaydedilemedi. Lütfen tekrar deneyin.", variant: "destructive" }),
  });

  const allPuanFilled = data?.sorular.filter(s => s.tip === "puan_1_5").every(s => puanlar[s.id]) ?? true;
  const canSubmit = katilimciAdi.trim() && allPuanFilled;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Yükleniyor...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">Eğitim bulunamadı veya değerlendirme formu mevcut değil.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-6">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <h2 className="text-2xl font-semibold">Teşekkürler!</h2>
        <p className="text-muted-foreground max-w-sm">Değerlendirmeniz başarıyla kaydedildi. Geri bildiriminiz için teşekkür ederiz.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-xl shadow-sm border p-8 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <GraduationCap className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Eğitim Değerlendirme Formu</h1>
            <p className="text-sm text-muted-foreground">{data.egitim.baslik} · {data.egitim.egitimTarihi}</p>
          </div>
        </div>

        <div>
          <Label>Adınız Soyadınız *</Label>
          <Input
            value={katilimciAdi}
            onChange={e => setKatilimciAdi(e.target.value)}
            placeholder="Ad Soyad"
            className="mt-1"
          />
        </div>

        {data.sorular.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-4">Değerlendirme şablonu henüz tanımlanmamış.</p>
        )}

        {[...data.sorular].sort((a, b) => a.sira - b.sira).map((soru, idx) => (
          <div key={soru.id} className="space-y-2">
            <Label>{idx + 1}. {soru.soru}</Label>
            {soru.tip === "puan_1_5" ? (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPuanlar(prev => ({ ...prev, [soru.id]: n }))}
                    className={`w-10 h-10 rounded-full border text-sm font-medium transition-colors ${
                      puanlar[soru.id] === n
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input hover:bg-muted"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                {puanlar[soru.id] && (
                  <span className="self-center text-xs text-muted-foreground ml-2">
                    {["", "Çok Kötü", "Kötü", "Orta", "İyi", "Çok İyi"][puanlar[soru.id]]}
                  </span>
                )}
              </div>
            ) : (
              <Textarea
                value={metinler[soru.id] ?? ""}
                onChange={e => setMetinler(prev => ({ ...prev, [soru.id]: e.target.value }))}
                rows={3}
                placeholder="Görüşlerinizi yazınız..."
              />
            )}
          </div>
        ))}

        <Button
          className="w-full"
          disabled={!canSubmit || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
        >
          {submitMutation.isPending ? "Gönderiliyor..." : "Değerlendirmeyi Gönder"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/PublicEgitimDegerlendirme.tsx
git commit -m "feat: add public egitim degerlendirme form page"
```

---

## Task 6: Wiring — App.tsx + ISO9001.tsx

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/ISO9001.tsx`

- [ ] **Step 1: Update App.tsx — add imports**

After the `import ISO9001KaliteHedefleri from "@/pages/ISO9001KaliteHedefleri";` line, add:

```typescript
import ISO9001Egitimler from "@/pages/ISO9001Egitimler";
import PublicEgitimDegerlendirme from "@/pages/PublicEgitimDegerlendirme";
```

- [ ] **Step 2: Update App.tsx — add pageTitles entry**

In the `pageTitles` object, add after `"/iso9001/hedefler": "ISO9001-2015 — Kalite Hedefleri",`:

```typescript
  "/iso9001/egitimler": "ISO9001-2015 — Eğitim Kayıtları",
```

- [ ] **Step 3: Update App.tsx — add routes**

In the `Router` function's `<Switch>`, add after `<Route path="/iso9001/tetkik" component={ISO9001Tetkik} />`:

```typescript
      <Route path="/iso9001/egitimler" component={ISO9001Egitimler} />
```

Also add the public route BEFORE the auth check. Find the block in `AppContent`:

```typescript
  if (location.startsWith("/survey/")) {
    return <Router />;
  }
```

Change it to:

```typescript
  if (location.startsWith("/survey/") || location.startsWith("/egitim-degerlendirme/")) {
    return <Router />;
  }
```

And add the public route in the Router's Switch (place it alongside the `/survey/:id` route):

```typescript
      <Route path="/egitim-degerlendirme/:id" component={PublicEgitimDegerlendirme} />
```

- [ ] **Step 4: Update ISO9001.tsx — add egitimCount/toplamKatilimciCount to Iso9001Stats type**

Find the `type Iso9001Stats = {` block and add two fields after `hedefYesilCount: number;`:

```typescript
  egitimCount: number;
  toplamKatilimciCount: number;
```

- [ ] **Step 5: Update ISO9001.tsx — activate Eğitim Kayıtları card**

Find this line:
```typescript
        <ComingSoonCard icon={GraduationCap} title="Eğitim Kayıtları" />
```

Replace with:
```typescript
        <ActiveCard href="/iso9001/egitimler" icon={GraduationCap} title="Eğitim Kayıtları">
          <p>Eğitim: <span className="font-medium text-foreground">{stats?.egitimCount ?? "—"}</span></p>
          <p>Katılımcı: <span className="font-medium text-foreground">{stats?.toplamKatilimciCount ?? "—"}</span></p>
        </ActiveCard>
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add client/src/App.tsx client/src/pages/ISO9001.tsx
git commit -m "feat: wire egitim kayitlari routes and activate dashboard card"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `iso_personeller` table — Task 1
- ✅ `egitimler` table — Task 1
- ✅ `egitim_katilimcilar` table — Task 1
- ✅ `egitim_degerlendirme_sorulari` table — Task 1
- ✅ `egitim_degerlendirmeler` table — Task 1
- ✅ `egitim_degerlendirme_cevaplari` table — Task 1
- ✅ 3-tab page (Eğitimler, Personeller, Değerlendirme Şablonu) — Task 4
- ✅ Accordion participant list — Task 4
- ✅ Optional certificate upload — Tasks 3 & 4
- ✅ Multi-select participant add modal — Task 4
- ✅ Personnel card modal with training history — Task 4
- ✅ Configurable evaluation template with question ordering — Task 4
- ✅ Public evaluation form at `/egitim-degerlendirme/:id` — Task 5
- ✅ Public route bypasses auth — Task 6
- ✅ Dashboard card activated with egitimCount + toplamKatilimciCount — Task 6
- ✅ getIso9001Stats updated — Task 2

**Placeholder scan:** No TBDs or placeholders found.

**Type consistency:** All types defined in Task 1 schema are used consistently in Tasks 2-6. IsoPersonel, Egitim, EgitimKatilimci, etc. match between interface and implementation.
