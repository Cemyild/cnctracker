# ISO 9001 Tedarikçi Değerlendirme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Tedarikçi Değerlendirme module to the ISO 9001 dashboard — an approved supplier list with configurable periodic evaluation forms.

**Architecture:** 4 new DB tables (tedarikcilar, tedarikci_degerlendirme_kriterleri, tedarikci_degerlendirmeler, tedarikci_degerlendirme_cevaplari) follow the same pattern as the egitim module. Backend adds storage methods and 12 API endpoints. A single 2-tab React page handles suppliers (with accordion showing evaluation history) and the evaluation template (criteria management).

**Tech Stack:** PostgreSQL + Drizzle ORM, Express.js, React + TypeScript + shadcn/ui, tanstack-query, wouter

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `shared/schema.ts` | Modify | Add 4 new tables + insert schemas + types |
| `server/storage.ts` | Modify | Add IStorage interface methods + DatabaseStorage implementations + update getIso9001Stats |
| `server/routes.ts` | Modify | Add 12 new API endpoints |
| `client/src/pages/ISO9001TedarikciDegerlendirme.tsx` | Create | 2-tab page (Tedarikçiler + Değerlendirme Şablonu) |
| `client/src/pages/ISO9001.tsx` | Modify | Replace ComingSoonCard with ActiveCard for Tedarikçi |
| `client/src/App.tsx` | Modify | Add import + route + pageTitles entry |

---

### Task 1: Schema — 4 new tables

**Files:**
- Modify: `shared/schema.ts` (append to end of file)

- [ ] **Step 1: Verify TypeScript compiles before touching anything**

```bash
cd "e:/CEM APPS/cnctracker"
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 2: Append 4 new tables to `shared/schema.ts`**

Append exactly this block at the very end of `shared/schema.ts`:

```typescript
// ─── Tedarikçi Değerlendirme ────────────────────────────────────────────────

export const tedarikcilar = pgTable("tedarikcilar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ad: text("ad").notNull(),
  kategori: text("kategori"),
  yetkiliAdi: text("yetkili_adi"),
  telefon: text("telefon"),
  email: text("email"),
  aciklama: text("aciklama"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertTedarikciSchema = createInsertSchema(tedarikcilar).omit({ id: true, olusturmaTarihi: true });
export type InsertTedarikci = z.infer<typeof insertTedarikciSchema>;
export type Tedarikci = typeof tedarikcilar.$inferSelect;

export const tedarikciDegerlendirmeKriterleri = pgTable("tedarikci_degerlendirme_kriterleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kriter: text("kriter").notNull(),
  tip: text("tip").notNull(), // "puan_1_5" | "acik_metin"
  sira: integer("sira").notNull(),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertTedarikciDegerlendirmeKriterSchema = createInsertSchema(tedarikciDegerlendirmeKriterleri).omit({ id: true, olusturmaTarihi: true });
export type InsertTedarikciDegerlendirmeKriter = z.infer<typeof insertTedarikciDegerlendirmeKriterSchema>;
export type TedarikciDegerlendirmeKriter = typeof tedarikciDegerlendirmeKriterleri.$inferSelect;

export const tedarikciDegerlendirmeler = pgTable("tedarikci_degerlendirmeler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tedarikciId: varchar("tedarikci_id").references(() => tedarikcilar.id, { onDelete: "cascade" }).notNull(),
  tarih: text("tarih").notNull(), // YYYY-MM-DD
  degerlendiren: text("degerlendiren"),
  notlar: text("notlar"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertTedarikciDegerlendirmeSchema = createInsertSchema(tedarikciDegerlendirmeler).omit({ id: true, olusturmaTarihi: true });
export type InsertTedarikciDegerlendirme = z.infer<typeof insertTedarikciDegerlendirmeSchema>;
export type TedarikciDegerlendirme = typeof tedarikciDegerlendirmeler.$inferSelect;

export const tedarikciDegerlendirmeCevaplari = pgTable("tedarikci_degerlendirme_cevaplari", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  degerlendirmeId: varchar("degerlendirme_id").references(() => tedarikciDegerlendirmeler.id, { onDelete: "cascade" }).notNull(),
  kriterId: varchar("kriter_id").references(() => tedarikciDegerlendirmeKriterleri.id, { onDelete: "cascade" }).notNull(),
  puan: integer("puan"),
  cevap: text("cevap"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertTedarikciDegerlendirmeCevapSchema = createInsertSchema(tedarikciDegerlendirmeCevaplari).omit({ id: true, olusturmaTarihi: true });
export type InsertTedarikciDegerlendirmeCevap = z.infer<typeof insertTedarikciDegerlendirmeCevapSchema>;
export type TedarikciDegerlendirmeCevap = typeof tedarikciDegerlendirmeCevaplari.$inferSelect;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Push schema to database**

```bash
npx drizzle-kit push
```

Expected: shows 4 new tables created, no errors.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts
git commit -m "feat: add tedarikci degerlendirme schema tables"
```

---

### Task 2: Storage — methods + stats update

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Add imports at top of storage.ts**

In the long import from `@shared/schema` at the top of `server/storage.ts`, add after the egitimDegerlendirmeCevaplari imports:

```typescript
  tedarikcilar, type Tedarikci, type InsertTedarikci,
  tedarikciDegerlendirmeKriterleri, type TedarikciDegerlendirmeKriter, type InsertTedarikciDegerlendirmeKriter,
  tedarikciDegerlendirmeler, type TedarikciDegerlendirme, type InsertTedarikciDegerlendirme,
  tedarikciDegerlendirmeCevaplari, type TedarikciDegerlendirmeCevap,
```

- [ ] **Step 2: Add interface methods to IStorage**

Find the `getIso9001Stats()` method signature in the `IStorage` interface (around line 130) and add these methods after the closing `}>;` of getIso9001Stats:

```typescript
  // Tedarikçiler
  getTedarikcilar(): Promise<(Tedarikci & { degerlendirmeSayisi: number })[]>;
  createTedarikci(data: InsertTedarikci): Promise<Tedarikci>;
  updateTedarikci(id: string, data: Partial<InsertTedarikci>): Promise<Tedarikci>;
  deleteTedarikci(id: string): Promise<void>;

  // Tedarikçi Değerlendirme Kriterleri
  getTedarikciKriterleri(): Promise<TedarikciDegerlendirmeKriter[]>;
  createTedarikciKriter(data: InsertTedarikciDegerlendirmeKriter): Promise<TedarikciDegerlendirmeKriter>;
  updateTedarikciKriter(id: string, data: Partial<InsertTedarikciDegerlendirmeKriter>): Promise<TedarikciDegerlendirmeKriter>;
  deleteTedarikciKriter(id: string): Promise<void>;

  // Tedarikçi Değerlendirmeler
  getTedarikciDegerlendirmeleri(tedarikciId: string): Promise<(TedarikciDegerlendirme & { ortPuan: number | null })[]>;
  getTedarikciDegerlendirme(tedarikciId: string, degerlendirmeId: string): Promise<(TedarikciDegerlendirme & { cevaplar: TedarikciDegerlendirmeCevap[] }) | null>;
  createTedarikciDegerlendirme(data: { tedarikciId: string; tarih: string; degerlendiren?: string; notlar?: string; cevaplar: { kriterId: string; puan?: number; cevap?: string }[] }): Promise<void>;
  deleteTedarikciDegerlendirme(tedarikciId: string, degerlendirmeId: string): Promise<void>;
```

- [ ] **Step 3: Update IStorage getIso9001Stats return type**

Find the `getIso9001Stats(): Promise<{` signature in IStorage and add these two fields before the closing `}>;`:

```typescript
    tedarikciCount: number;
    buYilDegerlendirmeCount: number;
```

- [ ] **Step 4: Add DatabaseStorage implementations**

Find the `async getIso9001Stats()` method in DatabaseStorage and add the following methods just before it (i.e., insert them before the `async getIso9001Stats()` line):

```typescript
  async getTedarikcilar(): Promise<(Tedarikci & { degerlendirmeSayisi: number })[]> {
    const tumTedarikcilar = await db.select().from(tedarikcilar).orderBy(asc(tedarikcilar.ad));
    const counts = await db.select({
      tedarikciId: tedarikciDegerlendirmeler.tedarikciId,
      count: sql<number>`count(*)::int`,
    }).from(tedarikciDegerlendirmeler).groupBy(tedarikciDegerlendirmeler.tedarikciId);
    const countMap = new Map(counts.map(c => [c.tedarikciId, c.count]));
    return tumTedarikcilar.map(t => ({ ...t, degerlendirmeSayisi: countMap.get(t.id) ?? 0 }));
  }

  async createTedarikci(data: InsertTedarikci): Promise<Tedarikci> {
    const [row] = await db.insert(tedarikcilar).values(data).returning();
    return row;
  }

  async updateTedarikci(id: string, data: Partial<InsertTedarikci>): Promise<Tedarikci> {
    const [row] = await db.update(tedarikcilar).set(data).where(eq(tedarikcilar.id, id)).returning();
    return row;
  }

  async deleteTedarikci(id: string): Promise<void> {
    await db.delete(tedarikcilar).where(eq(tedarikcilar.id, id));
  }

  async getTedarikciKriterleri(): Promise<TedarikciDegerlendirmeKriter[]> {
    return await db.select().from(tedarikciDegerlendirmeKriterleri).orderBy(asc(tedarikciDegerlendirmeKriterleri.sira));
  }

  async createTedarikciKriter(data: InsertTedarikciDegerlendirmeKriter): Promise<TedarikciDegerlendirmeKriter> {
    const [row] = await db.insert(tedarikciDegerlendirmeKriterleri).values(data).returning();
    return row;
  }

  async updateTedarikciKriter(id: string, data: Partial<InsertTedarikciDegerlendirmeKriter>): Promise<TedarikciDegerlendirmeKriter> {
    const [row] = await db.update(tedarikciDegerlendirmeKriterleri).set(data).where(eq(tedarikciDegerlendirmeKriterleri.id, id)).returning();
    return row;
  }

  async deleteTedarikciKriter(id: string): Promise<void> {
    await db.delete(tedarikciDegerlendirmeKriterleri).where(eq(tedarikciDegerlendirmeKriterleri.id, id));
  }

  async getTedarikciDegerlendirmeleri(tedarikciId: string): Promise<(TedarikciDegerlendirme & { ortPuan: number | null })[]> {
    const list = await db.select().from(tedarikciDegerlendirmeler)
      .where(eq(tedarikciDegerlendirmeler.tedarikciId, tedarikciId))
      .orderBy(desc(tedarikciDegerlendirmeler.tarih));
    if (list.length === 0) return [];
    const cevaplar = await db.select().from(tedarikciDegerlendirmeCevaplari)
      .where(inArray(tedarikciDegerlendirmeCevaplari.degerlendirmeId, list.map(d => d.id)));
    return list.map(d => {
      const puanlar = cevaplar.filter(c => c.degerlendirmeId === d.id && c.puan !== null).map(c => c.puan as number);
      const ortPuan = puanlar.length > 0 ? Math.round((puanlar.reduce((a, b) => a + b, 0) / puanlar.length) * 10) / 10 : null;
      return { ...d, ortPuan };
    });
  }

  async getTedarikciDegerlendirme(tedarikciId: string, degerlendirmeId: string): Promise<(TedarikciDegerlendirme & { cevaplar: TedarikciDegerlendirmeCevap[] }) | null> {
    const [row] = await db.select().from(tedarikciDegerlendirmeler)
      .where(and(eq(tedarikciDegerlendirmeler.id, degerlendirmeId), eq(tedarikciDegerlendirmeler.tedarikciId, tedarikciId)));
    if (!row) return null;
    const cevaplar = await db.select().from(tedarikciDegerlendirmeCevaplari)
      .where(eq(tedarikciDegerlendirmeCevaplari.degerlendirmeId, degerlendirmeId));
    return { ...row, cevaplar };
  }

  async createTedarikciDegerlendirme(data: { tedarikciId: string; tarih: string; degerlendiren?: string; notlar?: string; cevaplar: { kriterId: string; puan?: number; cevap?: string }[] }): Promise<void> {
    const [degerlendirme] = await db.insert(tedarikciDegerlendirmeler).values({
      tedarikciId: data.tedarikciId,
      tarih: data.tarih,
      degerlendiren: data.degerlendiren,
      notlar: data.notlar,
    }).returning();
    if (data.cevaplar.length > 0) {
      await db.insert(tedarikciDegerlendirmeCevaplari).values(
        data.cevaplar.map(c => ({ degerlendirmeId: degerlendirme.id, kriterId: c.kriterId, puan: c.puan ?? null, cevap: c.cevap ?? null }))
      );
    }
  }

  async deleteTedarikciDegerlendirme(tedarikciId: string, degerlendirmeId: string): Promise<void> {
    await db.delete(tedarikciDegerlendirmeler).where(
      and(eq(tedarikciDegerlendirmeler.id, degerlendirmeId), eq(tedarikciDegerlendirmeler.tedarikciId, tedarikciId))
    );
  }
```

- [ ] **Step 5: Update getIso9001Stats implementation**

In `DatabaseStorage.getIso9001Stats()`, find the line:
```typescript
    const [egitimCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(egitimler);
```

Add these lines immediately after `const [katilimciCountRow] ...` and before the `return {` statement:

```typescript
    const [tedarikciCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(tedarikcilar);
    const currentYear = new Date().getFullYear().toString();
    const [buYilDegerlendirmeRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(tedarikciDegerlendirmeler)
      .where(sql`${tedarikciDegerlendirmeler.tarih} like ${currentYear + '%'}`);
```

Then add these two fields inside the `return { ... }` object (after `toplamKatilimciCount: katilimciCountRow.count,`):

```typescript
      tedarikciCount: tedarikciCountRow.count,
      buYilDegerlendirmeCount: buYilDegerlendirmeRow.count,
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add server/storage.ts
git commit -m "feat: add tedarikci degerlendirme storage methods"
```

---

### Task 3: API Routes — 12 new endpoints

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Find insertion point**

The egitim routes end around `app.post("/api/egitim-degerlendirme", ...)`. Add the new tedarikçi routes immediately after the last egitim route block.

- [ ] **Step 2: Add all 12 endpoints**

Add this block in `server/routes.ts` after the last egitim route:

```typescript
  // ─── Tedarikçi Değerlendirme ────────────────────────────────────────────

  app.get("/api/tedarikcilar", async (_req, res) => {
    const list = await storage.getTedarikcilar();
    res.json(list);
  });

  app.post("/api/tedarikcilar", async (req, res) => {
    const tedarikci = await storage.createTedarikci(req.body);
    res.json(tedarikci);
  });

  app.put("/api/tedarikcilar/:id", async (req, res) => {
    const tedarikci = await storage.updateTedarikci(req.params.id, req.body);
    res.json(tedarikci);
  });

  app.delete("/api/tedarikcilar/:id", async (req, res) => {
    await storage.deleteTedarikci(req.params.id);
    res.json({ ok: true });
  });

  app.get("/api/tedarikcilar/:id/degerlendirmeler", async (req, res) => {
    const list = await storage.getTedarikciDegerlendirmeleri(req.params.id);
    res.json(list);
  });

  app.post("/api/tedarikcilar/:id/degerlendirmeler", async (req, res) => {
    await storage.createTedarikciDegerlendirme({ tedarikciId: req.params.id, ...req.body });
    res.json({ ok: true });
  });

  app.get("/api/tedarikcilar/:id/degerlendirmeler/:degerlendirmeId", async (req, res) => {
    const result = await storage.getTedarikciDegerlendirme(req.params.id, req.params.degerlendirmeId);
    if (!result) return res.status(404).json({ error: "Bulunamadı" });
    res.json(result);
  });

  app.delete("/api/tedarikcilar/:id/degerlendirmeler/:degerlendirmeId", async (req, res) => {
    await storage.deleteTedarikciDegerlendirme(req.params.id, req.params.degerlendirmeId);
    res.json({ ok: true });
  });

  app.get("/api/tedarikci-degerlendirme-kriterleri", async (_req, res) => {
    const list = await storage.getTedarikciKriterleri();
    res.json(list);
  });

  app.post("/api/tedarikci-degerlendirme-kriterleri", async (req, res) => {
    const kriter = await storage.createTedarikciKriter(req.body);
    res.json(kriter);
  });

  app.put("/api/tedarikci-degerlendirme-kriterleri/:id", async (req, res) => {
    const kriter = await storage.updateTedarikciKriter(req.params.id, req.body);
    res.json(kriter);
  });

  app.delete("/api/tedarikci-degerlendirme-kriterleri/:id", async (req, res) => {
    await storage.deleteTedarikciKriter(req.params.id);
    res.json({ ok: true });
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat: add tedarikci degerlendirme API routes"
```

---

### Task 4: Frontend Page — ISO9001TedarikciDegerlendirme.tsx

**Files:**
- Create: `client/src/pages/ISO9001TedarikciDegerlendirme.tsx`

- [ ] **Step 1: Create the page file**

Create `client/src/pages/ISO9001TedarikciDegerlendirme.tsx` with the full content below:

```typescript
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Eye, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type Tedarikci = {
  id: string;
  ad: string;
  kategori: string | null;
  yetkiliAdi: string | null;
  telefon: string | null;
  email: string | null;
  aciklama: string | null;
  degerlendirmeSayisi: number;
};

type Kriter = {
  id: string;
  kriter: string;
  tip: string;
  sira: number;
};

type Degerlendirme = {
  id: string;
  tedarikciId: string;
  tarih: string;
  degerlendiren: string | null;
  notlar: string | null;
  ortPuan: number | null;
};

type DegerlendirmeDetay = Degerlendirme & {
  cevaplar: { id: string; kriterId: string; puan: number | null; cevap: string | null }[];
};

const emptyTedarikciForm = { ad: "", kategori: "", yetkiliAdi: "", telefon: "", email: "", aciklama: "" };
const emptyKriterForm = { kriter: "", tip: "puan_1_5" };
const emptyDegerlendirmeForm = { tarih: "", degerlendiren: "", notlar: "" };

export default function ISO9001TedarikciDegerlendirme() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [expandedTedarikciId, setExpandedTedarikciId] = useState<string | null>(null);
  const [tedarikciModal, setTedarikciModal] = useState<{ open: boolean; editing: Tedarikci | null }>({ open: false, editing: null });
  const [tedarikciForm, setTedarikciForm] = useState(emptyTedarikciForm);

  const [kriterModal, setKriterModal] = useState<{ open: boolean; editing: Kriter | null }>({ open: false, editing: null });
  const [kriterForm, setKriterForm] = useState(emptyKriterForm);

  const [degerlendirmeModal, setDegerlendirmeModal] = useState<{ open: boolean; tedarikciId: string | null }>({ open: false, tedarikciId: null });
  const [degerlendirmeForm, setDegerlendirmeForm] = useState(emptyDegerlendirmeForm);
  const [cevaplar, setCevaplar] = useState<Record<string, { puan?: number; cevap?: string }>>({});

  const [goruntuleModal, setGoruntuleModal] = useState<{ open: boolean; tedarikciId: string | null; degerlendirmeId: string | null }>({ open: false, tedarikciId: null, degerlendirmeId: null });

  const { data: tedarikcilar = [] } = useQuery<Tedarikci[]>({
    queryKey: ["/api/tedarikcilar"],
    queryFn: () => fetch("/api/tedarikcilar").then(r => r.json()),
  });

  const { data: kriterler = [] } = useQuery<Kriter[]>({
    queryKey: ["/api/tedarikci-degerlendirme-kriterleri"],
    queryFn: () => fetch("/api/tedarikci-degerlendirme-kriterleri").then(r => r.json()),
  });

  const { data: expandedDegerlendirmeler = [] } = useQuery<Degerlendirme[]>({
    queryKey: ["/api/tedarikcilar", expandedTedarikciId, "degerlendirmeler"],
    queryFn: () => fetch(`/api/tedarikcilar/${expandedTedarikciId}/degerlendirmeler`).then(r => r.json()),
    enabled: !!expandedTedarikciId,
  });

  const { data: goruntuleDetay } = useQuery<DegerlendirmeDetay>({
    queryKey: ["/api/tedarikcilar", goruntuleModal.tedarikciId, "degerlendirmeler", goruntuleModal.degerlendirmeId],
    queryFn: () => fetch(`/api/tedarikcilar/${goruntuleModal.tedarikciId}/degerlendirmeler/${goruntuleModal.degerlendirmeId}`).then(r => r.json()),
    enabled: !!goruntuleModal.tedarikciId && !!goruntuleModal.degerlendirmeId,
  });

  const createTedarikci = useMutation({
    mutationFn: (data: typeof emptyTedarikciForm) => fetch("/api/tedarikcilar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikcilar"] }); setTedarikciModal({ open: false, editing: null }); toast({ title: "Tedarikçi eklendi" }); },
  });

  const updateTedarikci = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof emptyTedarikciForm }) => fetch(`/api/tedarikcilar/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikcilar"] }); setTedarikciModal({ open: false, editing: null }); toast({ title: "Tedarikçi güncellendi" }); },
  });

  const deleteTedarikci = useMutation({
    mutationFn: (id: string) => fetch(`/api/tedarikcilar/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikcilar"] }); toast({ title: "Tedarikçi silindi" }); },
  });

  const createDegerlendirme = useMutation({
    mutationFn: ({ tedarikciId, body }: { tedarikciId: string; body: object }) =>
      fetch(`/api/tedarikcilar/${tedarikciId}/degerlendirmeler`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/tedarikcilar", vars.tedarikciId, "degerlendirmeler"] });
      qc.invalidateQueries({ queryKey: ["/api/tedarikcilar"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setDegerlendirmeModal({ open: false, tedarikciId: null });
      toast({ title: "Değerlendirme kaydedildi" });
    },
  });

  const deleteDegerlendirme = useMutation({
    mutationFn: ({ tedarikciId, degerlendirmeId }: { tedarikciId: string; degerlendirmeId: string }) =>
      fetch(`/api/tedarikcilar/${tedarikciId}/degerlendirmeler/${degerlendirmeId}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/tedarikcilar", vars.tedarikciId, "degerlendirmeler"] });
      qc.invalidateQueries({ queryKey: ["/api/tedarikcilar"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      toast({ title: "Değerlendirme silindi" });
    },
  });

  const createKriter = useMutation({
    mutationFn: (data: typeof emptyKriterForm) => fetch("/api/tedarikci-degerlendirme-kriterleri", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikci-degerlendirme-kriterleri"] }); setKriterModal({ open: false, editing: null }); toast({ title: "Kriter eklendi" }); },
  });

  const updateKriter = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof emptyKriterForm }) => fetch(`/api/tedarikci-degerlendirme-kriterleri/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikci-degerlendirme-kriterleri"] }); setKriterModal({ open: false, editing: null }); toast({ title: "Kriter güncellendi" }); },
  });

  const deleteKriter = useMutation({
    mutationFn: (id: string) => fetch(`/api/tedarikci-degerlendirme-kriterleri/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tedarikci-degerlendirme-kriterleri"] }); toast({ title: "Kriter silindi" }); },
  });

  const moveKriter = async (kriter: Kriter, direction: "up" | "down") => {
    const sorted = [...kriterler].sort((a, b) => a.sira - b.sira);
    const idx = sorted.findIndex(k => k.id === kriter.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      fetch(`/api/tedarikci-degerlendirme-kriterleri/${kriter.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kriter: kriter.kriter, tip: kriter.tip, sira: other.sira }) }),
      fetch(`/api/tedarikci-degerlendirme-kriterleri/${other.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kriter: other.kriter, tip: other.tip, sira: kriter.sira }) }),
    ]);
    qc.invalidateQueries({ queryKey: ["/api/tedarikci-degerlendirme-kriterleri"] });
  };

  const openTedarikciModal = (editing: Tedarikci | null) => {
    setTedarikciForm(editing ? { ad: editing.ad, kategori: editing.kategori ?? "", yetkiliAdi: editing.yetkiliAdi ?? "", telefon: editing.telefon ?? "", email: editing.email ?? "", aciklama: editing.aciklama ?? "" } : emptyTedarikciForm);
    setTedarikciModal({ open: true, editing });
  };

  const openKriterModal = (editing: Kriter | null) => {
    setKriterForm(editing ? { kriter: editing.kriter, tip: editing.tip } : emptyKriterForm);
    setKriterModal({ open: true, editing });
  };

  const openDegerlendirmeModal = (tedarikciId: string) => {
    setDegerlendirmeForm(emptyDegerlendirmeForm);
    setCevaplar({});
    setDegerlendirmeModal({ open: true, tedarikciId });
  };

  const handleDegerlendirmeSubmit = () => {
    if (!degerlendirmeModal.tedarikciId || !degerlendirmeForm.tarih) return;
    const cevaplarArr = kriterler.map(k => ({ kriterId: k.id, puan: cevaplar[k.id]?.puan, cevap: cevaplar[k.id]?.cevap }));
    createDegerlendirme.mutate({
      tedarikciId: degerlendirmeModal.tedarikciId,
      body: { tarih: degerlendirmeForm.tarih, degerlendiren: degerlendirmeForm.degerlendiren || undefined, notlar: degerlendirmeForm.notlar || undefined, cevaplar: cevaplarArr },
    });
  };

  const degerlendirmeSaveDisabled = !degerlendirmeForm.tarih || kriterler.filter(k => k.tip === "puan_1_5").some(k => !cevaplar[k.id]?.puan);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Truck className="w-7 h-7 text-primary" />
        <h2 className="text-2xl font-semibold">Tedarikçi Değerlendirme</h2>
      </div>

      <Tabs defaultValue="tedarikcilar">
        <TabsList className="mb-4">
          <TabsTrigger value="tedarikcilar">Tedarikçiler</TabsTrigger>
          <TabsTrigger value="sablon">Değerlendirme Şablonu</TabsTrigger>
        </TabsList>

        {/* ── Sekme 1: Tedarikçiler ── */}
        <TabsContent value="tedarikcilar">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => openTedarikciModal(null)}>
              <Plus className="w-4 h-4 mr-1" /> Yeni Tedarikçi
            </Button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Ad</th>
                  <th className="text-left p-3 font-medium">Kategori</th>
                  <th className="text-left p-3 font-medium">Yetkili</th>
                  <th className="text-left p-3 font-medium">Telefon</th>
                  <th className="text-left p-3 font-medium">Değerlendirme</th>
                  <th className="text-right p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {tedarikcilar.map(t => (
                  <>
                    <tr
                      key={t.id}
                      className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedTedarikciId(expandedTedarikciId === t.id ? null : t.id)}
                    >
                      <td className="p-3 font-medium flex items-center gap-2">
                        {expandedTedarikciId === t.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        {t.ad}
                      </td>
                      <td className="p-3 text-muted-foreground">{t.kategori ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{t.yetkiliAdi ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{t.telefon ?? "—"}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{t.degerlendirmeSayisi} değerlendirme</Badge>
                      </td>
                      <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => openTedarikciModal(t)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteTedarikci.mutate(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </td>
                    </tr>
                    {expandedTedarikciId === t.id && (
                      <tr key={`${t.id}-expand`} className="border-t bg-muted/20">
                        <td colSpan={6} className="p-4">
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-sm font-medium text-muted-foreground">Geçmiş Değerlendirmeler</span>
                            <Button size="sm" variant="outline" onClick={() => openDegerlendirmeModal(t.id)}>
                              <Plus className="w-4 h-4 mr-1" /> Yeni Değerlendirme
                            </Button>
                          </div>
                          {expandedDegerlendirmeler.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">Henüz değerlendirme yok.</p>
                          ) : (
                            <table className="w-full text-sm border rounded-lg overflow-hidden">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="text-left p-2 font-medium">Tarih</th>
                                  <th className="text-left p-2 font-medium">Değerlendiren</th>
                                  <th className="text-left p-2 font-medium">Ort. Puan</th>
                                  <th className="text-right p-2 font-medium">İşlemler</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedDegerlendirmeler.map(d => (
                                  <tr key={d.id} className="border-t">
                                    <td className="p-2">{d.tarih}</td>
                                    <td className="p-2 text-muted-foreground">{d.degerlendiren ?? "—"}</td>
                                    <td className="p-2">
                                      {d.ortPuan !== null ? (
                                        <Badge variant={d.ortPuan >= 4 ? "default" : d.ortPuan >= 3 ? "secondary" : "destructive"}>
                                          {d.ortPuan.toFixed(1)} / 5
                                        </Badge>
                                      ) : "—"}
                                    </td>
                                    <td className="p-2 text-right">
                                      <Button variant="ghost" size="icon" onClick={() => setGoruntuleModal({ open: true, tedarikciId: t.id, degerlendirmeId: d.id })}>
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={() => deleteDegerlendirme.mutate({ tedarikciId: t.id, degerlendirmeId: d.id })}>
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {tedarikcilar.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Henüz tedarikçi yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Sekme 2: Değerlendirme Şablonu ── */}
        <TabsContent value="sablon">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => openKriterModal(null)}>
              <Plus className="w-4 h-4 mr-1" /> Kriter Ekle
            </Button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium w-12">Sıra</th>
                  <th className="text-left p-3 font-medium">Kriter</th>
                  <th className="text-left p-3 font-medium">Tip</th>
                  <th className="text-right p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {kriterler.map((k, idx) => (
                  <tr key={k.id} className="border-t">
                    <td className="p-3 text-muted-foreground">{k.sira}</td>
                    <td className="p-3">{k.kriter}</td>
                    <td className="p-3">
                      <Badge variant="outline">{k.tip === "puan_1_5" ? "1-5 Puan" : "Açık Metin"}</Badge>
                    </td>
                    <td className="p-3 text-right flex justify-end gap-1">
                      <Button variant="ghost" size="icon" disabled={idx === 0} onClick={() => moveKriter(k, "up")}><ArrowUp className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" disabled={idx === kriterler.length - 1} onClick={() => moveKriter(k, "down")}><ArrowDown className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openKriterModal(k)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteKriter.mutate(k.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </td>
                  </tr>
                ))}
                {kriterler.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Henüz kriter yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Tedarikçi Modal ── */}
      <Dialog open={tedarikciModal.open} onOpenChange={o => !o && setTedarikciModal({ open: false, editing: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tedarikciModal.editing ? "Tedarikçi Düzenle" : "Yeni Tedarikçi"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Ad *</Label><Input value={tedarikciForm.ad} onChange={e => setTedarikciForm(f => ({ ...f, ad: e.target.value }))} /></div>
            <div><Label>Kategori</Label><Input placeholder="ör. Hammadde, Hizmet" value={tedarikciForm.kategori} onChange={e => setTedarikciForm(f => ({ ...f, kategori: e.target.value }))} /></div>
            <div><Label>Yetkili Adı</Label><Input value={tedarikciForm.yetkiliAdi} onChange={e => setTedarikciForm(f => ({ ...f, yetkiliAdi: e.target.value }))} /></div>
            <div><Label>Telefon</Label><Input value={tedarikciForm.telefon} onChange={e => setTedarikciForm(f => ({ ...f, telefon: e.target.value }))} /></div>
            <div><Label>E-posta</Label><Input type="email" value={tedarikciForm.email} onChange={e => setTedarikciForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Açıklama</Label><Textarea value={tedarikciForm.aciklama} onChange={e => setTedarikciForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTedarikciModal({ open: false, editing: null })}>İptal</Button>
            <Button
              disabled={!tedarikciForm.ad}
              onClick={() => tedarikciModal.editing
                ? updateTedarikci.mutate({ id: tedarikciModal.editing.id, data: tedarikciForm })
                : createTedarikci.mutate(tedarikciForm)
              }
            >Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Kriter Modal ── */}
      <Dialog open={kriterModal.open} onOpenChange={o => !o && setKriterModal({ open: false, editing: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{kriterModal.editing ? "Kriter Düzenle" : "Kriter Ekle"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Kriter Metni *</Label><Input value={kriterForm.kriter} onChange={e => setKriterForm(f => ({ ...f, kriter: e.target.value }))} /></div>
            <div>
              <Label>Tip *</Label>
              <Select value={kriterForm.tip} onValueChange={v => setKriterForm(f => ({ ...f, tip: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="puan_1_5">1-5 Puan</SelectItem>
                  <SelectItem value="acik_metin">Açık Metin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKriterModal({ open: false, editing: null })}>İptal</Button>
            <Button
              disabled={!kriterForm.kriter}
              onClick={() => {
                if (kriterModal.editing) {
                  updateKriter.mutate({ id: kriterModal.editing.id, data: { ...kriterForm, sira: kriterModal.editing.sira } as any });
                } else {
                  const maxSira = kriterler.length > 0 ? Math.max(...kriterler.map(k => k.sira)) : 0;
                  createKriter.mutate({ ...kriterForm, sira: maxSira + 1 } as any);
                }
              }}
            >Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Yeni Değerlendirme Modal ── */}
      <Dialog open={degerlendirmeModal.open} onOpenChange={o => !o && setDegerlendirmeModal({ open: false, tedarikciId: null })}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Yeni Değerlendirme</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Tarih *</Label><Input type="date" value={degerlendirmeForm.tarih} onChange={e => setDegerlendirmeForm(f => ({ ...f, tarih: e.target.value }))} /></div>
            <div><Label>Değerlendiren</Label><Input value={degerlendirmeForm.degerlendiren} onChange={e => setDegerlendirmeForm(f => ({ ...f, degerlendiren: e.target.value }))} /></div>
            <div><Label>Notlar</Label><Textarea value={degerlendirmeForm.notlar} onChange={e => setDegerlendirmeForm(f => ({ ...f, notlar: e.target.value }))} /></div>
            {kriterler.length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <p className="text-sm font-medium">Kriterler</p>
                {kriterler.map(k => (
                  <div key={k.id} className="space-y-1">
                    <Label>{k.kriter}{k.tip === "puan_1_5" ? " *" : ""}</Label>
                    {k.tip === "puan_1_5" ? (
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setCevaplar(c => ({ ...c, [k.id]: { ...c[k.id], puan: p } }))}
                            className={`w-9 h-9 rounded-full border text-sm font-medium transition-colors ${cevaplar[k.id]?.puan === p ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                          >{p}</button>
                        ))}
                      </div>
                    ) : (
                      <Textarea
                        value={cevaplar[k.id]?.cevap ?? ""}
                        onChange={e => setCevaplar(c => ({ ...c, [k.id]: { ...c[k.id], cevap: e.target.value } }))}
                        rows={2}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDegerlendirmeModal({ open: false, tedarikciId: null })}>İptal</Button>
            <Button disabled={degerlendirmeSaveDisabled} onClick={handleDegerlendirmeSubmit}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Değerlendirme Görüntüle Modal ── */}
      <Dialog open={goruntuleModal.open} onOpenChange={o => !o && setGoruntuleModal({ open: false, tedarikciId: null, degerlendirmeId: null })}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Değerlendirme Detayı</DialogTitle></DialogHeader>
          {goruntuleDetay && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Tarih:</span> <span className="font-medium">{goruntuleDetay.tarih}</span></div>
                <div><span className="text-muted-foreground">Değerlendiren:</span> <span className="font-medium">{goruntuleDetay.degerlendiren ?? "—"}</span></div>
              </div>
              {goruntuleDetay.notlar && <div className="text-sm"><span className="text-muted-foreground">Notlar:</span> <p className="mt-1">{goruntuleDetay.notlar}</p></div>}
              {goruntuleDetay.ortPuan !== null && (
                <div className="text-sm flex items-center gap-2">
                  <span className="text-muted-foreground">Ortalama Puan:</span>
                  <Badge variant={goruntuleDetay.ortPuan >= 4 ? "default" : goruntuleDetay.ortPuan >= 3 ? "secondary" : "destructive"}>
                    {goruntuleDetay.ortPuan.toFixed(1)} / 5
                  </Badge>
                </div>
              )}
              <div className="border-t pt-4 space-y-3">
                {kriterler.map(k => {
                  const c = goruntuleDetay.cevaplar.find(cv => cv.kriterId === k.id);
                  return (
                    <div key={k.id} className="text-sm">
                      <p className="font-medium mb-1">{k.kriter}</p>
                      {k.tip === "puan_1_5" ? (
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map(p => (
                            <div key={p} className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm font-medium ${c?.puan === p ? "bg-primary text-primary-foreground border-primary" : "border-muted text-muted-foreground"}`}>{p}</div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">{c?.cevap ?? "—"}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoruntuleModal({ open: false, tedarikciId: null, degerlendirmeId: null })}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/ISO9001TedarikciDegerlendirme.tsx
git commit -m "feat: add ISO9001TedarikciDegerlendirme page"
```

---

### Task 5: Wiring — App.tsx + ISO9001.tsx dashboard card

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/ISO9001.tsx`

- [ ] **Step 1: Update App.tsx — add import**

After the line `import ISO9001Egitimler from "@/pages/ISO9001Egitimler";`, add:

```typescript
import ISO9001TedarikciDegerlendirme from "@/pages/ISO9001TedarikciDegerlendirme";
```

- [ ] **Step 2: Update App.tsx — add pageTitles entry**

After the line `"/iso9001/egitimler": "ISO9001-2015 — Eğitim Kayıtları",`, add:

```typescript
  "/iso9001/tedarikci": "ISO9001-2015 — Tedarikçi Değerlendirme",
```

- [ ] **Step 3: Update App.tsx — add route**

After the line `<Route path="/iso9001/egitimler" component={ISO9001Egitimler} />`, add:

```typescript
      <Route path="/iso9001/tedarikci" component={ISO9001TedarikciDegerlendirme} />
```

- [ ] **Step 4: Update ISO9001.tsx — add stats fields to type**

Find the `type Iso9001Stats = {` block. After the line `toplamKatilimciCount: number;`, add:

```typescript
  tedarikciCount: number;
  buYilDegerlendirmeCount: number;
```

- [ ] **Step 5: Update ISO9001.tsx — replace ComingSoonCard**

Find and replace:

```tsx
        <ComingSoonCard icon={Truck} title="Tedarikçi Değerlendirme" />
```

With:

```tsx
        <ActiveCard href="/iso9001/tedarikci" icon={Truck} title="Tedarikçi Değerlendirme">
          <p>Tedarikçi: <span className="font-medium text-foreground">{stats?.tedarikciCount ?? "—"}</span></p>
          <p>Bu Yıl: <span className="font-medium text-foreground">{stats?.buYilDegerlendirmeCount ?? "—"}</span> değerlendirme</p>
        </ActiveCard>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add client/src/App.tsx client/src/pages/ISO9001.tsx
git commit -m "feat: wire tedarikci degerlendirme route and activate dashboard card"
```

---

## Self-Review

**Spec coverage:**
- ✅ tedarikcilar table (ad, kategori, yetkiliAdi, telefon, email, aciklama)
- ✅ tedarikci_degerlendirme_kriterleri table (kriter, tip, sira)
- ✅ tedarikci_degerlendirmeler table (tedarikciId FK, tarih, degerlendiren, notlar)
- ✅ tedarikci_degerlendirme_cevaplari table (degerlendirmeId FK, kriterId FK, puan, cevap)
- ✅ GET/POST/PUT/DELETE /api/tedarikcilar
- ✅ GET/POST/DELETE /api/tedarikcilar/:id/degerlendirmeler
- ✅ GET /api/tedarikcilar/:id/degerlendirmeler/:degerlendirmeId
- ✅ GET/POST/PUT/DELETE /api/tedarikci-degerlendirme-kriterleri
- ✅ Sekme 1: Tedarikçiler tablo + accordion + geçmiş değerlendirmeler + yeni değerlendirme
- ✅ Sekme 2: Şablon tablo + yukarı/aşağı okları + kriter ekle/düzenle/sil
- ✅ Ort. puan hesabı backend'de, görüntüle modalında da gösterilir
- ✅ Dashboard kartı: tedarikciCount + buYilDegerlendirmeCount
- ✅ ComingSoonCard → ActiveCard dönüşümü
- ✅ /iso9001/tedarikci route (korumalı, no public bypass needed)

**Placeholder scan:** Yok.

**Type consistency:** Kriter FK adı schema'da `kriterId`, storage'da `kriterId`, frontend'de `kriterId` — tutarlı.
