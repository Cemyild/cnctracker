# ISO 9001 Yönetim Gözden Geçirme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Yönetim Gözden Geçirme module — meeting records with auto ISO summary, free-text input sections, and central action item tracking.

**Architecture:** 2 new DB tables (yonetim_gozden_gecirmeler, yonetim_aksiyonlar). Backend adds 9 endpoints and updates getIso9001Stats. A 2-tab React page (Toplantılar accordion + Aksiyonlar with filter) handles all CRUD. ISO özeti (DÜF/hedef/eğitim/tedarikçi sayıları) is fetched live from /api/iso9001/stats, never stored.

**Tech Stack:** PostgreSQL + Drizzle ORM, Express.js, React + TypeScript + shadcn/ui, tanstack-query, wouter

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `shared/schema.ts` | Modify | Append 2 new tables + schemas + types |
| `server/storage.ts` | Modify | Add 9 interface methods + implementations + update getIso9001Stats |
| `server/routes.ts` | Modify | Add 9 new API endpoints |
| `client/src/pages/ISO9001YonetimGozdenGecirme.tsx` | Create | 2-tab page (Toplantılar + Aksiyonlar) |
| `client/src/pages/ISO9001.tsx` | Modify | Replace ComingSoonCard with ActiveCard |
| `client/src/App.tsx` | Modify | Import + route + pageTitles |

---

### Task 1: Schema — 2 new tables

**Files:**
- Modify: `shared/schema.ts` (append to end)

- [ ] **Step 1: Verify clean compile**

```bash
cd "e:/CEM APPS/cnctracker" && npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 2: Append to end of `shared/schema.ts`**

```typescript
// ─── Yönetim Gözden Geçirme ─────────────────────────────────────────────────

export const yonetimGozdenGecirmeler = pgTable("yonetim_gozden_gecirmeler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tarih: text("tarih").notNull(),
  katilimcilar: text("katilimcilar"),
  gundem: text("gundem"),
  musteriSikayetleri: text("musteri_sikayetleri"),
  tedarikciPerformansi: text("tedarikci_performansi"),
  urunUygunsuzluk: text("urun_uygunsuzluk"),
  oncekiKararDurum: text("onceki_karar_durum"),
  sonuclar: text("sonuclar"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertYonetimGozdenGecirmeSchema = createInsertSchema(yonetimGozdenGecirmeler).omit({ id: true, olusturmaTarihi: true });
export type InsertYonetimGozdenGecirme = z.infer<typeof insertYonetimGozdenGecirmeSchema>;
export type YonetimGozdenGecirme = typeof yonetimGozdenGecirmeler.$inferSelect;

export const yonetimAksiyonlar = pgTable("yonetim_aksiyonlar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  toplantId: varchar("toplanti_id").references(() => yonetimGozdenGecirmeler.id, { onDelete: "cascade" }).notNull(),
  aksiyon: text("aksiyon").notNull(),
  sorumlu: text("sorumlu").notNull(),
  hedefTarih: text("hedef_tarih"),
  durum: text("durum").notNull().default("acik"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertYonetimAksiyon = createInsertSchema(yonetimAksiyonlar).omit({ id: true, olusturmaTarihi: true });
export type InsertYonetimAksiyon = z.infer<typeof insertYonetimAksiyon>;
export type YonetimAksiyon = typeof yonetimAksiyonlar.$inferSelect;
```

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Push to DB**

```bash
npx drizzle-kit push
```
Expected: 2 new tables created.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts
git commit -m "feat: add yonetim gozden gecirme schema tables"
```

---

### Task 2: Storage — methods + stats update

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Add imports to the schema import at top of storage.ts**

After `tedarikciDegerlendirmeCevaplari, type TedarikciDegerlendirmeCevap` add:

```typescript
  yonetimGozdenGecirmeler, type YonetimGozdenGecirme, type InsertYonetimGozdenGecirme,
  yonetimAksiyonlar, type YonetimAksiyon, type InsertYonetimAksiyon,
```

- [ ] **Step 2: Update IStorage getIso9001Stats return type**

Find `buYilDegerlendirmeCount: number;` in the IStorage interface and add after it:

```typescript
    sonToplantıTarihi: string | null;
    acikAksiyon: number;
```

- [ ] **Step 3: Add IStorage method signatures**

After the `deleteTedarikciDegerlendirme` method signature in IStorage, add:

```typescript
  // Yönetim Gözden Geçirme
  getToplantılar(): Promise<(YonetimGozdenGecirme & { aksiyon_sayisi: number })[]>;
  getToplantı(id: string): Promise<(YonetimGozdenGecirme & { aksiyonlar: YonetimAksiyon[] }) | null>;
  createToplantı(data: InsertYonetimGozdenGecirme): Promise<YonetimGozdenGecirme>;
  updateToplantı(id: string, data: Partial<InsertYonetimGozdenGecirme>): Promise<YonetimGozdenGecirme>;
  deleteToplantı(id: string): Promise<void>;
  getAksiyonlar(): Promise<(YonetimAksiyon & { toplantıTarihi: string })[]>;
  createAksiyon(data: InsertYonetimAksiyon): Promise<YonetimAksiyon>;
  updateAksiyon(id: string, data: Partial<InsertYonetimAksiyon>): Promise<YonetimAksiyon>;
  deleteAksiyon(id: string): Promise<void>;
```

- [ ] **Step 4: Add DatabaseStorage implementations**

Insert these methods just before `async getIso9001Stats()`:

```typescript
  async getToplantılar(): Promise<(YonetimGozdenGecirme & { aksiyon_sayisi: number })[]> {
    const list = await db.select().from(yonetimGozdenGecirmeler).orderBy(desc(yonetimGozdenGecirmeler.tarih));
    const counts = await db.select({
      toplantId: yonetimAksiyonlar.toplantId,
      count: sql<number>`count(*)::int`,
    }).from(yonetimAksiyonlar).groupBy(yonetimAksiyonlar.toplantId);
    const countMap = new Map(counts.map(c => [c.toplantId, c.count]));
    return list.map(t => ({ ...t, aksiyon_sayisi: countMap.get(t.id) ?? 0 }));
  }

  async getToplantı(id: string): Promise<(YonetimGozdenGecirme & { aksiyonlar: YonetimAksiyon[] }) | null> {
    const [row] = await db.select().from(yonetimGozdenGecirmeler).where(eq(yonetimGozdenGecirmeler.id, id));
    if (!row) return null;
    const aksiyonlar = await db.select().from(yonetimAksiyonlar)
      .where(eq(yonetimAksiyonlar.toplantId, id))
      .orderBy(asc(yonetimAksiyonlar.olusturmaTarihi));
    return { ...row, aksiyonlar };
  }

  async createToplantı(data: InsertYonetimGozdenGecirme): Promise<YonetimGozdenGecirme> {
    const [row] = await db.insert(yonetimGozdenGecirmeler).values(data).returning();
    return row;
  }

  async updateToplantı(id: string, data: Partial<InsertYonetimGozdenGecirme>): Promise<YonetimGozdenGecirme> {
    const [row] = await db.update(yonetimGozdenGecirmeler).set(data).where(eq(yonetimGozdenGecirmeler.id, id)).returning();
    return row;
  }

  async deleteToplantı(id: string): Promise<void> {
    await db.delete(yonetimGozdenGecirmeler).where(eq(yonetimGozdenGecirmeler.id, id));
  }

  async getAksiyonlar(): Promise<(YonetimAksiyon & { toplantıTarihi: string })[]> {
    const rows = await db
      .select({
        id: yonetimAksiyonlar.id,
        toplantId: yonetimAksiyonlar.toplantId,
        aksiyon: yonetimAksiyonlar.aksiyon,
        sorumlu: yonetimAksiyonlar.sorumlu,
        hedefTarih: yonetimAksiyonlar.hedefTarih,
        durum: yonetimAksiyonlar.durum,
        olusturmaTarihi: yonetimAksiyonlar.olusturmaTarihi,
        toplantıTarihi: yonetimGozdenGecirmeler.tarih,
      })
      .from(yonetimAksiyonlar)
      .innerJoin(yonetimGozdenGecirmeler, eq(yonetimAksiyonlar.toplantId, yonetimGozdenGecirmeler.id))
      .orderBy(desc(yonetimGozdenGecirmeler.tarih));
    return rows as (YonetimAksiyon & { toplantıTarihi: string })[];
  }

  async createAksiyon(data: InsertYonetimAksiyon): Promise<YonetimAksiyon> {
    const [row] = await db.insert(yonetimAksiyonlar).values(data).returning();
    return row;
  }

  async updateAksiyon(id: string, data: Partial<InsertYonetimAksiyon>): Promise<YonetimAksiyon> {
    const [row] = await db.update(yonetimAksiyonlar).set(data).where(eq(yonetimAksiyonlar.id, id)).returning();
    return row;
  }

  async deleteAksiyon(id: string): Promise<void> {
    await db.delete(yonetimAksiyonlar).where(eq(yonetimAksiyonlar.id, id));
  }
```

- [ ] **Step 5: Update getIso9001Stats implementation**

Find the line `buYilDegerlendirmeCount: buYilDegerlendirmeRow.count,` inside `getIso9001Stats()` return object. Add these two queries BEFORE the `return {` statement:

```typescript
    const sonToplantıRows = await db.select({ tarih: yonetimGozdenGecirmeler.tarih })
      .from(yonetimGozdenGecirmeler)
      .orderBy(desc(yonetimGozdenGecirmeler.tarih))
      .limit(1);
    const [acikAksiyon] = await db.select({ count: sql<number>`count(*)::int` })
      .from(yonetimAksiyonlar)
      .where(eq(yonetimAksiyonlar.durum, "acik"));
```

Then add inside the `return { ... }` block after `buYilDegerlendirmeCount`:

```typescript
      sonToplantıTarihi: sonToplantıRows[0]?.tarih ?? null,
      acikAksiyon: acikAksiyon.count,
```

- [ ] **Step 6: Verify compile**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add server/storage.ts
git commit -m "feat: add yonetim gozden gecirme storage methods"
```

---

### Task 3: API Routes — 9 new endpoints

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Add routes after the last tedarikçi route block**

Find the last tedarikçi route (`app.delete("/api/tedarikci-degerlendirme-kriterleri/:id"`) and add after it:

```typescript
  // ─── Yönetim Gözden Geçirme ─────────────────────────────────────────────

  app.get("/api/yonetim-toplantilari", async (_req, res) => {
    const list = await storage.getToplantılar();
    res.json(list);
  });

  app.get("/api/yonetim-toplantilari/:id", async (req, res) => {
    const toplantı = await storage.getToplantı(req.params.id);
    if (!toplantı) return res.status(404).json({ error: "Bulunamadı" });
    res.json(toplantı);
  });

  app.post("/api/yonetim-toplantilari", async (req, res) => {
    const toplantı = await storage.createToplantı(req.body);
    res.json(toplantı);
  });

  app.put("/api/yonetim-toplantilari/:id", async (req, res) => {
    const toplantı = await storage.updateToplantı(req.params.id, req.body);
    if (!toplantı) return res.status(404).json({ error: "Bulunamadı" });
    res.json(toplantı);
  });

  app.delete("/api/yonetim-toplantilari/:id", async (req, res) => {
    await storage.deleteToplantı(req.params.id);
    res.json({ ok: true });
  });

  app.get("/api/yonetim-aksiyonlar", async (_req, res) => {
    const list = await storage.getAksiyonlar();
    res.json(list);
  });

  app.post("/api/yonetim-aksiyonlar", async (req, res) => {
    const aksiyon = await storage.createAksiyon(req.body);
    res.json(aksiyon);
  });

  app.put("/api/yonetim-aksiyonlar/:id", async (req, res) => {
    const aksiyon = await storage.updateAksiyon(req.params.id, req.body);
    if (!aksiyon) return res.status(404).json({ error: "Bulunamadı" });
    res.json(aksiyon);
  });

  app.delete("/api/yonetim-aksiyonlar/:id", async (req, res) => {
    await storage.deleteAksiyon(req.params.id);
    res.json({ ok: true });
  });
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "feat: add yonetim gozden gecirme API routes"
```

---

### Task 4: Frontend Page

**Files:**
- Create: `client/src/pages/ISO9001YonetimGozdenGecirme.tsx`

- [ ] **Step 1: Create the page file**

Create `client/src/pages/ISO9001YonetimGozdenGecirme.tsx`:

```typescript
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Plus, Pencil, Trash2, ChevronDown, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Toplantı = {
  id: string;
  tarih: string;
  katilimcilar: string | null;
  gundem: string | null;
  musteriSikayetleri: string | null;
  tedarikciPerformansi: string | null;
  urunUygunsuzluk: string | null;
  oncekiKararDurum: string | null;
  sonuclar: string | null;
  aksiyon_sayisi: number;
};

type ToplantıDetail = Toplantı & { aksiyonlar: Aksiyon[] };

type Aksiyon = {
  id: string;
  toplantId: string;
  aksiyon: string;
  sorumlu: string;
  hedefTarih: string | null;
  durum: string;
  toplantıTarihi?: string;
};

type IsoStats = {
  dufAcik: number;
  dufKapali: number;
  hedefCount: number;
  hedefYesilCount: number;
  egitimCount: number;
  toplamKatilimciCount: number;
  tedarikciCount: number;
  buYilDegerlendirmeCount: number;
};

const emptyForm = {
  tarih: "",
  katilimcilar: "",
  gundem: "",
  musteriSikayetleri: "",
  tedarikciPerformansi: "",
  urunUygunsuzluk: "",
  oncekiKararDurum: "",
  sonuclar: "",
};

const emptyAksiyonForm = { aksiyon: "", sorumlu: "", hedefTarih: "" };

export default function ISO9001YonetimGozdenGecirme() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; editing: Toplantı | null }>({ open: false, editing: null });
  const [form, setForm] = useState(emptyForm);
  const [aksiyonForm, setAksiyonForm] = useState(emptyAksiyonForm);
  const [pendingAksiyonlar, setPendingAksiyonlar] = useState<typeof emptyAksiyonForm[]>([]);
  const [aksiyonFilter, setAksiyonFilter] = useState("tumu");

  const { data: toplantılar = [] } = useQuery<Toplantı[]>({
    queryKey: ["/api/yonetim-toplantilari"],
    queryFn: () => fetch("/api/yonetim-toplantilari").then(r => r.json()),
  });

  const { data: expandedDetail } = useQuery<ToplantıDetail>({
    queryKey: ["/api/yonetim-toplantilari", expandedId],
    queryFn: () => fetch(`/api/yonetim-toplantilari/${expandedId}`).then(r => r.json()),
    enabled: !!expandedId,
  });

  const { data: tumAksiyonlar = [] } = useQuery<(Aksiyon & { toplantıTarihi: string })[]>({
    queryKey: ["/api/yonetim-aksiyonlar"],
    queryFn: () => fetch("/api/yonetim-aksiyonlar").then(r => r.json()),
  });

  const { data: isoStats } = useQuery<IsoStats>({
    queryKey: ["/api/iso9001/stats"],
    queryFn: () => fetch("/api/iso9001/stats").then(r => r.json()),
  });

  const createToplantı = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const toplantı = await fetch("/api/yonetim-toplantilari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json());
      for (const pa of pendingAksiyonlar) {
        await fetch("/api/yonetim-aksiyonlar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...pa, toplantId: toplantı.id }),
        });
      }
      return toplantı;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari"] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-aksiyonlar"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setModal({ open: false, editing: null });
      setPendingAksiyonlar([]);
      toast({ title: "Toplantı oluşturuldu" });
    },
  });

  const updateToplantı = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof emptyForm }) =>
      fetch(`/api/yonetim-toplantilari/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari"] });
      setModal({ open: false, editing: null });
      toast({ title: "Toplantı güncellendi" });
    },
  });

  const deleteToplantı = useMutation({
    mutationFn: (id: string) => fetch(`/api/yonetim-toplantilari/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari"] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-aksiyonlar"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      if (expandedId) setExpandedId(null);
      toast({ title: "Toplantı silindi" });
    },
  });

  const addAksiyon = useMutation({
    mutationFn: (data: { toplantId: string; aksiyon: string; sorumlu: string; hedefTarih?: string }) =>
      fetch("/api/yonetim-aksiyonlar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari", expandedId] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari"] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-aksiyonlar"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setAksiyonForm(emptyAksiyonForm);
      toast({ title: "Aksiyon eklendi" });
    },
  });

  const toggleAksiyon = useMutation({
    mutationFn: ({ id, durum }: { id: string; durum: string }) =>
      fetch(`/api/yonetim-aksiyonlar/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durum: durum === "acik" ? "kapali" : "acik" }) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-aksiyonlar"] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari", expandedId] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
    },
  });

  const deleteAksiyon = useMutation({
    mutationFn: (id: string) => fetch(`/api/yonetim-aksiyonlar/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/yonetim-aksiyonlar"] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari", expandedId] });
      qc.invalidateQueries({ queryKey: ["/api/yonetim-toplantilari"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      toast({ title: "Aksiyon silindi" });
    },
  });

  const isGecikmiş = (a: Aksiyon) => !!a.hedefTarih && a.hedefTarih < today && a.durum === "acik";

  const getDurumBadge = (a: Aksiyon) => {
    if (isGecikmiş(a)) return <Badge variant="destructive">Gecikmiş</Badge>;
    if (a.durum === "kapali") return <Badge className="bg-green-600 text-white">Kapalı</Badge>;
    return <Badge variant="secondary">Açık</Badge>;
  };

  const filteredAksiyonlar = tumAksiyonlar.filter(a => {
    if (aksiyonFilter === "acik") return a.durum === "acik" && !isGecikmiş(a);
    if (aksiyonFilter === "kapali") return a.durum === "kapali";
    if (aksiyonFilter === "gecikmiş") return isGecikmiş(a);
    return true;
  });

  const openModal = (editing: Toplantı | null) => {
    setForm(editing ? {
      tarih: editing.tarih,
      katilimcilar: editing.katilimcilar ?? "",
      gundem: editing.gundem ?? "",
      musteriSikayetleri: editing.musteriSikayetleri ?? "",
      tedarikciPerformansi: editing.tedarikciPerformansi ?? "",
      urunUygunsuzluk: editing.urunUygunsuzluk ?? "",
      oncekiKararDurum: editing.oncekiKararDurum ?? "",
      sonuclar: editing.sonuclar ?? "",
    } : emptyForm);
    setPendingAksiyonlar([]);
    setAksiyonForm(emptyAksiyonForm);
    setModal({ open: true, editing });
  };

  const addPending = () => {
    if (!aksiyonForm.aksiyon || !aksiyonForm.sorumlu) return;
    setPendingAksiyonlar(p => [...p, aksiyonForm]);
    setAksiyonForm(emptyAksiyonForm);
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-7 h-7 text-primary" />
        <h2 className="text-2xl font-semibold">Yönetim Gözden Geçirme</h2>
      </div>

      <Tabs defaultValue="toplantılar">
        <TabsList className="mb-4">
          <TabsTrigger value="toplantılar">Toplantılar</TabsTrigger>
          <TabsTrigger value="aksiyonlar">Aksiyonlar</TabsTrigger>
        </TabsList>

        {/* ── Sekme 1: Toplantılar ── */}
        <TabsContent value="toplantılar">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => openModal(null)}>
              <Plus className="w-4 h-4 mr-1" /> Yeni Toplantı
            </Button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Tarih</th>
                  <th className="text-left p-3 font-medium">Katılımcılar</th>
                  <th className="text-left p-3 font-medium">Aksiyon</th>
                  <th className="text-right p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {toplantılar.map(t => (
                  <>
                    <tr
                      key={t.id}
                      className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    >
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-2">
                          {expandedId === t.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          {t.tarih}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground truncate max-w-[200px]">{t.katilimcilar ?? "—"}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{t.aksiyon_sayisi} aksiyon</Badge>
                      </td>
                      <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => openModal(t)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteToplantı.mutate(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </td>
                    </tr>
                    {expandedId === t.id && expandedDetail && (
                      <tr key={`${t.id}-expand`} className="border-t bg-muted/10">
                        <td colSpan={4} className="p-4 space-y-4">
                          {/* ISO Özeti */}
                          {isoStats && (
                            <div className="rounded-lg border p-3 bg-background">
                              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">ISO 9001 Anlık Özet</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div><span className="text-muted-foreground">DÜF:</span> <span className="font-medium">{isoStats.dufAcik} açık, {isoStats.dufKapali} kapalı</span></div>
                                <div><span className="text-muted-foreground">Hedef:</span> <span className="font-medium">{isoStats.hedefYesilCount}/{isoStats.hedefCount} yeşil</span></div>
                                <div><span className="text-muted-foreground">Eğitim:</span> <span className="font-medium">{isoStats.egitimCount} eğitim</span></div>
                                <div><span className="text-muted-foreground">Tedarikçi:</span> <span className="font-medium">{isoStats.buYilDegerlendirmeCount} değerlendirme</span></div>
                              </div>
                            </div>
                          )}
                          {/* Serbest metin alanları */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {[
                              { label: "Gündem", val: expandedDetail.gundem },
                              { label: "Müşteri Şikayetleri", val: expandedDetail.musteriSikayetleri },
                              { label: "Tedarikçi Performansı", val: expandedDetail.tedarikciPerformansi },
                              { label: "Ürün Uygunsuzluk", val: expandedDetail.urunUygunsuzluk },
                              { label: "Önceki Karar Durumu", val: expandedDetail.oncekiKararDurum },
                              { label: "Sonuçlar", val: expandedDetail.sonuclar },
                            ].filter(f => f.val).map(f => (
                              <div key={f.label}>
                                <p className="text-xs text-muted-foreground font-medium mb-1">{f.label}</p>
                                <p className="whitespace-pre-wrap">{f.val}</p>
                              </div>
                            ))}
                          </div>
                          {/* Aksiyonlar */}
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">Aksiyonlar</p>
                            {expandedDetail.aksiyonlar.length > 0 && (
                              <table className="w-full text-sm border rounded-lg overflow-hidden mb-3">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="text-left p-2 font-medium">Aksiyon</th>
                                    <th className="text-left p-2 font-medium">Sorumlu</th>
                                    <th className="text-left p-2 font-medium">Hedef Tarih</th>
                                    <th className="text-left p-2 font-medium">Durum</th>
                                    <th className="text-right p-2 font-medium">İşlemler</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedDetail.aksiyonlar.map(a => (
                                    <tr key={a.id} className="border-t">
                                      <td className="p-2">{a.aksiyon}</td>
                                      <td className="p-2 text-muted-foreground">{a.sorumlu}</td>
                                      <td className="p-2 text-muted-foreground">{a.hedefTarih ?? "—"}</td>
                                      <td className="p-2">{getDurumBadge(a)}</td>
                                      <td className="p-2 text-right">
                                        <Button variant="ghost" size="icon" onClick={() => toggleAksiyon.mutate({ id: a.id, durum: a.durum })}>
                                          {a.durum === "acik" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Circle className="w-4 h-4" />}
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => deleteAksiyon.mutate(a.id)}>
                                          <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {/* Aksiyon Ekle satırı */}
                            <div className="flex gap-2 items-end">
                              <div className="flex-1"><Label className="text-xs">Aksiyon *</Label><Input placeholder="Aksiyon açıklaması" value={aksiyonForm.aksiyon} onChange={e => setAksiyonForm(f => ({ ...f, aksiyon: e.target.value }))} /></div>
                              <div className="w-32"><Label className="text-xs">Sorumlu *</Label><Input placeholder="Ad Soyad" value={aksiyonForm.sorumlu} onChange={e => setAksiyonForm(f => ({ ...f, sorumlu: e.target.value }))} /></div>
                              <div className="w-36"><Label className="text-xs">Hedef Tarih</Label><Input type="date" value={aksiyonForm.hedefTarih} onChange={e => setAksiyonForm(f => ({ ...f, hedefTarih: e.target.value }))} /></div>
                              <Button size="sm" disabled={!aksiyonForm.aksiyon || !aksiyonForm.sorumlu} onClick={() => addAksiyon.mutate({ toplantId: t.id, aksiyon: aksiyonForm.aksiyon, sorumlu: aksiyonForm.sorumlu, hedefTarih: aksiyonForm.hedefTarih || undefined })}>
                                <Plus className="w-4 h-4 mr-1" /> Ekle
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {toplantılar.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Henüz toplantı kaydı yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Sekme 2: Aksiyonlar ── */}
        <TabsContent value="aksiyonlar">
          <div className="flex gap-2 mb-3">
            <Select value={aksiyonFilter} onValueChange={setAksiyonFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tumu">Tümü</SelectItem>
                <SelectItem value="acik">Açık</SelectItem>
                <SelectItem value="kapali">Kapalı</SelectItem>
                <SelectItem value="gecikmiş">Gecikmiş</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground self-center">{filteredAksiyonlar.length} aksiyon</span>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Aksiyon</th>
                  <th className="text-left p-3 font-medium">Sorumlu</th>
                  <th className="text-left p-3 font-medium">Hedef Tarih</th>
                  <th className="text-left p-3 font-medium">Toplantı</th>
                  <th className="text-left p-3 font-medium">Durum</th>
                  <th className="text-right p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredAksiyonlar.map(a => (
                  <tr key={a.id} className="border-t">
                    <td className="p-3">{a.aksiyon}</td>
                    <td className="p-3 text-muted-foreground">{a.sorumlu}</td>
                    <td className="p-3 text-muted-foreground">{a.hedefTarih ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{a.toplantıTarihi}</td>
                    <td className="p-3">{getDurumBadge(a)}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => toggleAksiyon.mutate({ id: a.id, durum: a.durum })}>
                        {a.durum === "acik" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Circle className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteAksiyon.mutate(a.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredAksiyonlar.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Aksiyon bulunamadı.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Toplantı Modalı ── */}
      <Dialog open={modal.open} onOpenChange={o => !o && setModal({ open: false, editing: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{modal.editing ? "Toplantı Düzenle" : "Yeni Toplantı"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Bölüm 1 */}
            <div className="grid grid-cols-1 gap-3">
              <div><Label>Tarih *</Label><Input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} /></div>
              <div><Label>Katılımcılar</Label><Textarea rows={2} value={form.katilimcilar} onChange={e => setForm(f => ({ ...f, katilimcilar: e.target.value }))} /></div>
              <div><Label>Gündem</Label><Textarea rows={3} value={form.gundem} onChange={e => setForm(f => ({ ...f, gundem: e.target.value }))} /></div>
            </div>
            {/* Bölüm 2: ISO Özeti */}
            {isoStats && (
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">ISO 9001 Anlık Özet</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>DÜF: <span className="font-medium">{isoStats.dufAcik} açık, {isoStats.dufKapali} kapalı</span></div>
                  <div>Hedef: <span className="font-medium">{isoStats.hedefYesilCount}/{isoStats.hedefCount} yeşil</span></div>
                  <div>Eğitim: <span className="font-medium">{isoStats.egitimCount} eğitim, {isoStats.toplamKatilimciCount} katılım</span></div>
                  <div>Tedarikçi: <span className="font-medium">{isoStats.tedarikciCount} tedarikçi, {isoStats.buYilDegerlendirmeCount} bu yıl</span></div>
                </div>
              </div>
            )}
            {/* Bölüm 3: Giriş Verileri */}
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-medium">Giriş Verileri</p>
              <div><Label>Müşteri Şikayetleri</Label><Textarea rows={2} value={form.musteriSikayetleri} onChange={e => setForm(f => ({ ...f, musteriSikayetleri: e.target.value }))} /></div>
              <div><Label>Tedarikçi Performansı</Label><Textarea rows={2} value={form.tedarikciPerformansi} onChange={e => setForm(f => ({ ...f, tedarikciPerformansi: e.target.value }))} /></div>
              <div><Label>Ürün Uygunsuzluk</Label><Textarea rows={2} value={form.urunUygunsuzluk} onChange={e => setForm(f => ({ ...f, urunUygunsuzluk: e.target.value }))} /></div>
              <div><Label>Önceki Karar Durumu</Label><Textarea rows={2} value={form.oncekiKararDurum} onChange={e => setForm(f => ({ ...f, oncekiKararDurum: e.target.value }))} /></div>
            </div>
            {/* Bölüm 4: Sonuçlar */}
            <div className="border-t pt-3">
              <Label>Sonuçlar / Notlar</Label><Textarea rows={3} value={form.sonuclar} onChange={e => setForm(f => ({ ...f, sonuclar: e.target.value }))} />
            </div>
            {/* Bölüm 5: Aksiyonlar (sadece create modunda pending liste) */}
            {!modal.editing && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-medium">Aksiyonlar</p>
                {pendingAksiyonlar.length > 0 && (
                  <div className="space-y-1">
                    {pendingAksiyonlar.map((pa, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm bg-muted/30 rounded p-2">
                        <span className="flex-1">{pa.aksiyon} — {pa.sorumlu}</span>
                        {pa.hedefTarih && <span className="text-muted-foreground">{pa.hedefTarih}</span>}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingAksiyonlar(p => p.filter((_, i) => i !== idx))}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1"><Label className="text-xs">Aksiyon</Label><Input placeholder="Aksiyon" value={aksiyonForm.aksiyon} onChange={e => setAksiyonForm(f => ({ ...f, aksiyon: e.target.value }))} /></div>
                  <div className="w-32"><Label className="text-xs">Sorumlu</Label><Input placeholder="Sorumlu" value={aksiyonForm.sorumlu} onChange={e => setAksiyonForm(f => ({ ...f, sorumlu: e.target.value }))} /></div>
                  <div className="w-36"><Label className="text-xs">Hedef Tarih</Label><Input type="date" value={aksiyonForm.hedefTarih} onChange={e => setAksiyonForm(f => ({ ...f, hedefTarih: e.target.value }))} /></div>
                  <Button size="sm" variant="outline" disabled={!aksiyonForm.aksiyon || !aksiyonForm.sorumlu} onClick={addPending}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ open: false, editing: null })}>İptal</Button>
            <Button
              disabled={!form.tarih}
              onClick={() => modal.editing
                ? updateToplantı.mutate({ id: modal.editing.id, data: form })
                : createToplantı.mutate(form)
              }
            >Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
cd "e:/CEM APPS/cnctracker" && npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/ISO9001YonetimGozdenGecirme.tsx
git commit -m "feat: add ISO9001YonetimGozdenGecirme page"
```

---

### Task 5: Wiring — App.tsx + ISO9001.tsx

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/ISO9001.tsx`

- [ ] **Step 1: Update App.tsx — add import**

After `import ISO9001TedarikciDegerlendirme from "@/pages/ISO9001TedarikciDegerlendirme";`, add:

```typescript
import ISO9001YonetimGozdenGecirme from "@/pages/ISO9001YonetimGozdenGecirme";
```

- [ ] **Step 2: Update App.tsx — add pageTitles entry**

After `"/iso9001/tedarikci": "ISO9001-2015 — Tedarikçi Değerlendirme",`, add:

```typescript
  "/iso9001/yonetim": "ISO9001-2015 — Yönetim Gözden Geçirme",
```

- [ ] **Step 3: Update App.tsx — add route**

After `<Route path="/iso9001/tedarikci" component={ISO9001TedarikciDegerlendirme} />`, add:

```typescript
      <Route path="/iso9001/yonetim" component={ISO9001YonetimGozdenGecirme} />
```

- [ ] **Step 4: Update ISO9001.tsx — add stats fields to type**

Find `buYilDegerlendirmeCount: number;` in the `Iso9001Stats` type and add after it:

```typescript
  sonToplantıTarihi: string | null;
  acikAksiyon: number;
```

- [ ] **Step 5: Update ISO9001.tsx — replace ComingSoonCard**

Find and replace:

```tsx
        <ComingSoonCard icon={BarChart3} title="Yönetim Gözden Geçirme" />
```

With:

```tsx
        <ActiveCard href="/iso9001/yonetim" icon={BarChart3} title="Yönetim Gözden Geçirme">
          <p>Son Toplantı: <span className="font-medium text-foreground">{stats?.sonToplantıTarihi ?? "—"}</span></p>
          <p>Açık Aksiyon: <span className="font-medium text-foreground">{stats?.acikAksiyon ?? "—"}</span></p>
        </ActiveCard>
```

- [ ] **Step 6: Verify compile**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add client/src/App.tsx client/src/pages/ISO9001.tsx
git commit -m "feat: wire yonetim gozden gecirme route and activate dashboard card"
```

---

## Self-Review

**Spec coverage:**
- ✅ yonetim_gozden_gecirmeler table (tarih, katilimcilar, gundem, 5 serbest metin alanı)
- ✅ yonetim_aksiyonlar table (toplantId FK cascade, aksiyon, sorumlu, hedefTarih, durum)
- ✅ GET/POST/PUT/DELETE /api/yonetim-toplantilari + GET /:id
- ✅ GET/POST/PUT/DELETE /api/yonetim-aksiyonlar
- ✅ Sekme 1: Toplantılar tablo + accordion (ISO özeti + serbest metin + aksiyonlar + aksiyon ekle)
- ✅ Sekme 2: Aksiyonlar merkezi liste + filtre (Tümü/Açık/Kapalı/Gecikmiş)
- ✅ Gecikmiş tespiti frontend'de (hedefTarih < today && durum === "acik")
- ✅ ISO özeti anlık çekilir, DB'ye kaydedilmez
- ✅ Durum toggle (Açık↔Kapalı)
- ✅ Dashboard kartı: sonToplantıTarihi + acikAksiyon
- ✅ getIso9001Stats güncellendi (sonToplantıTarihi + acikAksiyon)
- ✅ ComingSoonCard → ActiveCard dönüşümü

**Placeholder scan:** Yok.

**Type consistency:** `toplantId` kullanılan her yerde tutarlı. `YonetimGozdenGecirme` ve `YonetimAksiyon` tipleri schema'da tanımlı ve storage/routes'ta kullanılıyor.
