# ISO 9001 Kalite Hedefleri & KPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/iso9001/hedefler` route'unda kalite hedefi tanımlama ve periyodik ölçüm girişi modülü oluşturmak.

**Architecture:** Mevcut pattern'i takip eder: Drizzle schema → storage methods → Express routes → React page. `kaliteHedefleri` ve `kaliteOlcumler` iki ayrı tablo; her hedefin son ölçümü renk kodlamasıyla gösterilir. `getIso9001Stats`'a `hedefCount` ve `hedefYesilCount` eklenir.

**Tech Stack:** PostgreSQL + Drizzle ORM (`decimal` zaten import edilmiş), Express (JSON body, multer yok), React + TypeScript + shadcn/ui Tabs + tanstack-query, wouter

---

## File Structure

- **Modify:** `shared/schema.ts` — `kaliteHedefleri` + `kaliteOlcumler` tabloları
- **Modify:** `server/storage.ts` — 7 yeni storage metodu + getIso9001Stats güncellemesi
- **Modify:** `server/routes.ts` — 7 yeni JSON endpoint
- **Modify:** `client/src/App.tsx` — `/iso9001/hedefler` route + pageTitle
- **Modify:** `client/src/pages/ISO9001.tsx` — "Kalite Hedefleri" kartını ActiveCard'a çevir
- **Create:** `client/src/pages/ISO9001KaliteHedefleri.tsx` — İki sekmeli hedef ve ölçüm sayfası

---

### Task 1: Schema — kaliteHedefleri + kaliteOlcumler tabloları

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: `kaliteHedefleri` ve `kaliteOlcumler` tablolarını dosyanın sonuna ekle**

`shared/schema.ts` dosyasının sonuna (mevcut `belgeVersiyonlar` bloğundan sonra) ekle:

```typescript
// Kalite Hedefleri tablosu
export const kaliteHedefleri = pgTable("kalite_hedefleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  baslik: text("baslik").notNull(),
  hedefDeger: decimal("hedef_deger", { precision: 10, scale: 2 }).notNull(),
  olcumBirimi: text("olcum_birimi").notNull(),
  yon: text("yon").notNull().default("yuksek_iyi"), // yuksek_iyi | dusuk_iyi
  sorumluKisi: text("sorumlu_kisi").notNull(),
  terminTarihi: text("termin_tarihi").notNull(),
  isoMaddesi: text("iso_maddesi"),
  periyot: text("periyot").notNull(), // Aylık | Çeyreklik | Yıllık
  durum: text("durum").notNull().default("Aktif"), // Aktif | Pasif
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertKaliteHedefSchema = createInsertSchema(kaliteHedefleri).omit({ id: true, olusturmaTarihi: true });
export type InsertKaliteHedef = z.infer<typeof insertKaliteHedefSchema>;
export type KaliteHedef = typeof kaliteHedefleri.$inferSelect;

// Kalite Ölçümleri tablosu
export const kaliteOlcumler = pgTable("kalite_olcumler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hedefId: varchar("hedef_id").references(() => kaliteHedefleri.id, { onDelete: "cascade" }).notNull(),
  olcumTarihi: text("olcum_tarihi").notNull(),
  gerceklesenDeger: decimal("gerceklesen_deger", { precision: 10, scale: 2 }).notNull(),
  notlar: text("notlar"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertKaliteOlcumSchema = createInsertSchema(kaliteOlcumler).omit({ id: true, olusturmaTarihi: true });
export type InsertKaliteOlcum = z.infer<typeof insertKaliteOlcumSchema>;
export type KaliteOlcum = typeof kaliteOlcumler.$inferSelect;
```

- [ ] **Step 2: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(hedefler): add kaliteHedefleri and kaliteOlcumler schema"
```

---

### Task 2: Storage — CRUD metotları + stats güncellemesi

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Import'lara yeni tipleri ekle**

`server/storage.ts` dosyasında `@shared/schema`'dan import eden satırı bul ve şunları ekle:

```typescript
kaliteHedefleri,
kaliteOlcumler,
KaliteHedef,
KaliteOlcum,
InsertKaliteHedef,
InsertKaliteOlcum,
```

- [ ] **Step 2: IStorage interface'e metot imzaları ve stats güncellemesi ekle**

`IStorage` interface'inde `getIso9001Stats` dönüş tipine `hedefCount: number; hedefYesilCount: number;` ekle (mevcut `belgeCount` satırından sonra):

```typescript
hedefCount: number;
hedefYesilCount: number;
```

Aynı interface'e yeni metot imzalarını ekle:

```typescript
getKaliteHedefleri(): Promise<(KaliteHedef & { sonOlcum: KaliteOlcum | null })[]>;
createKaliteHedef(data: InsertKaliteHedef): Promise<KaliteHedef>;
updateKaliteHedef(id: string, data: Partial<InsertKaliteHedef>): Promise<KaliteHedef>;
deleteKaliteHedef(id: string): Promise<void>;
getKaliteOlcumler(): Promise<(KaliteOlcum & { hedef: KaliteHedef })[]>;
createKaliteOlcum(data: InsertKaliteOlcum): Promise<KaliteOlcum>;
deleteKaliteOlcum(id: string): Promise<void>;
```

- [ ] **Step 3: getIso9001Stats metodunu güncelle**

Mevcut `getIso9001Stats` metoduna (diğer sorgulardan sonra, return'den önce) ekle:

```typescript
const aktifHedefler = await db.select().from(kaliteHedefleri).where(eq(kaliteHedefleri.durum, "Aktif"));
const tumOlcumler = await db.select().from(kaliteOlcumler).orderBy(desc(kaliteOlcumler.olcumTarihi));

let hedefYesilCount = 0;
for (const hedef of aktifHedefler) {
  const sonOlcum = tumOlcumler.find(o => o.hedefId === hedef.id);
  if (!sonOlcum) continue;
  const g = Number(sonOlcum.gerceklesenDeger);
  const h = Number(hedef.hedefDeger);
  const yesil = hedef.yon === "yuksek_iyi" ? g >= h : g <= h;
  if (yesil) hedefYesilCount++;
}
```

Ve return objesine (mevcut `belgeCount` satırından sonra) ekle:

```typescript
hedefCount: aktifHedefler.length,
hedefYesilCount,
```

- [ ] **Step 4: getKaliteHedefleri metodunu ekle**

`DatabaseStorage` class'ının sonuna (`deleteBelge` metodundan sonra, `export const storage` satırından önce) ekle:

```typescript
async getKaliteHedefleri(): Promise<(KaliteHedef & { sonOlcum: KaliteOlcum | null })[]> {
  const hedefler = await db.select().from(kaliteHedefleri).orderBy(desc(kaliteHedefleri.olusturmaTarihi));
  const olcumler = await db.select().from(kaliteOlcumler).orderBy(desc(kaliteOlcumler.olcumTarihi));
  return hedefler.map(h => ({
    ...h,
    sonOlcum: olcumler.find(o => o.hedefId === h.id) ?? null,
  }));
}
```

- [ ] **Step 5: CRUD metotlarını ekle**

```typescript
async createKaliteHedef(data: InsertKaliteHedef): Promise<KaliteHedef> {
  const [row] = await db.insert(kaliteHedefleri).values(data).returning();
  return row;
}

async updateKaliteHedef(id: string, data: Partial<InsertKaliteHedef>): Promise<KaliteHedef> {
  const [row] = await db.update(kaliteHedefleri).set(data).where(eq(kaliteHedefleri.id, id)).returning();
  return row;
}

async deleteKaliteHedef(id: string): Promise<void> {
  await db.delete(kaliteHedefleri).where(eq(kaliteHedefleri.id, id));
}

async getKaliteOlcumler(): Promise<(KaliteOlcum & { hedef: KaliteHedef })[]> {
  const rows = await db.select({
    olcum: kaliteOlcumler,
    hedef: kaliteHedefleri,
  }).from(kaliteOlcumler)
    .innerJoin(kaliteHedefleri, eq(kaliteOlcumler.hedefId, kaliteHedefleri.id))
    .orderBy(desc(kaliteOlcumler.olcumTarihi));
  return rows.map(r => ({ ...r.olcum, hedef: r.hedef }));
}

async createKaliteOlcum(data: InsertKaliteOlcum): Promise<KaliteOlcum> {
  const [row] = await db.insert(kaliteOlcumler).values(data).returning();
  return row;
}

async deleteKaliteOlcum(id: string): Promise<void> {
  await db.delete(kaliteOlcumler).where(eq(kaliteOlcumler.id, id));
}
```

- [ ] **Step 6: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

- [ ] **Step 7: Commit**

```bash
git add server/storage.ts
git commit -m "feat(hedefler): add storage methods for kalite hedefleri and olcumler"
```

---

### Task 3: Routes — API endpoints

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Kalite Hedefleri endpoint'lerini ekle**

`server/routes.ts` dosyasında `// Belge Arşivi` bloğunun hemen önüne ekle:

```typescript
// Kalite Hedefleri
app.get("/api/kalite-hedefleri", async (_req, res) => {
  try {
    res.json(await storage.getKaliteHedefleri());
  } catch (e) {
    res.status(500).json({ error: "Kalite hedefleri alınamadı" });
  }
});

app.post("/api/kalite-hedefleri", async (req, res) => {
  try {
    const row = await storage.createKaliteHedef(req.body);
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: "Hedef oluşturulamadı" });
  }
});

app.put("/api/kalite-hedefleri/:id", async (req, res) => {
  try {
    const row = await storage.updateKaliteHedef(req.params.id, req.body);
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: "Hedef güncellenemedi" });
  }
});

app.delete("/api/kalite-hedefleri/:id", async (req, res) => {
  try {
    await storage.deleteKaliteHedef(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Hedef silinemedi" });
  }
});

app.get("/api/kalite-olcumler", async (_req, res) => {
  try {
    res.json(await storage.getKaliteOlcumler());
  } catch (e) {
    res.status(500).json({ error: "Ölçümler alınamadı" });
  }
});

app.post("/api/kalite-olcumler", async (req, res) => {
  try {
    const row = await storage.createKaliteOlcum(req.body);
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: "Ölçüm eklenemedi" });
  }
});

app.delete("/api/kalite-olcumler/:id", async (req, res) => {
  try {
    await storage.deleteKaliteOlcum(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Ölçüm silinemedi" });
  }
});
```

- [ ] **Step 2: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "feat(hedefler): add API endpoints for kalite hedefleri and olcumler"
```

---

### Task 4: App.tsx + ISO9001.tsx güncellemeleri

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/ISO9001.tsx`

- [ ] **Step 1: App.tsx güncellemesi**

`client/src/App.tsx` dosyasında:

Import ekle (diğer ISO9001 import'larının yanına):
```typescript
import ISO9001KaliteHedefleri from "@/pages/ISO9001KaliteHedefleri";
```

`pageTitles` objesine ekle:
```typescript
"/iso9001/hedefler": "ISO9001-2015 — Kalite Hedefleri",
```

Router'a route ekle (`/iso9001/belgeler` satırından sonra):
```typescript
<Route path="/iso9001/hedefler" component={ISO9001KaliteHedefleri} />
```

- [ ] **Step 2: ISO9001.tsx güncellemesi**

`client/src/pages/ISO9001.tsx` dosyasında:

`Iso9001Stats` tipine ekle (mevcut `belgeCount` satırından sonra):
```typescript
hedefCount: number;
hedefYesilCount: number;
```

`ComingSoonCard` olan "Kalite Hedefleri" satırını değiştir:
```typescript
<ActiveCard href="/iso9001/hedefler" icon={Target} title="Kalite Hedefleri">
  <p>Hedef: <span className="font-medium text-foreground">{stats?.hedefCount ?? "—"}</span></p>
  <p>Yeşil: <span className="font-medium text-green-600">{stats?.hedefYesilCount ?? "—"}</span></p>
</ActiveCard>
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: Sadece `ISO9001KaliteHedefleri` modülü eksik hatası — normal, sonraki task'ta çözülür.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx client/src/pages/ISO9001.tsx
git commit -m "feat(hedefler): wire up /iso9001/hedefler route and activate dashboard card"
```

---

### Task 5: ISO9001KaliteHedefleri.tsx — Hedef ve ölçüm sayfası

**Files:**
- Create: `client/src/pages/ISO9001KaliteHedefleri.tsx`

- [ ] **Step 1: Dosyayı oluştur**

`client/src/pages/ISO9001KaliteHedefleri.tsx` dosyasını şu içerikle oluştur:

```typescript
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type KaliteOlcum = {
  id: string;
  hedefId: string;
  olcumTarihi: string;
  gerceklesenDeger: string;
  notlar: string | null;
  olusturmaTarihi: string;
};

type KaliteHedef = {
  id: string;
  baslik: string;
  hedefDeger: string;
  olcumBirimi: string;
  yon: string;
  sorumluKisi: string;
  terminTarihi: string;
  isoMaddesi: string | null;
  periyot: string;
  durum: string;
  olusturmaTarihi: string;
  sonOlcum: KaliteOlcum | null;
};

type KaliteOlcumWithHedef = KaliteOlcum & { hedef: KaliteHedef };

type Durum = "yok" | "yesil" | "sari" | "kirmizi";

function getDurum(hedef: KaliteHedef, sonOlcum: KaliteOlcum | null): Durum {
  if (!sonOlcum) return "yok";
  const g = Number(sonOlcum.gerceklesenDeger);
  const h = Number(hedef.hedefDeger);
  if (hedef.yon === "yuksek_iyi") {
    if (g >= h) return "yesil";
    if (g >= h * 0.8) return "sari";
    return "kirmizi";
  } else {
    if (g <= h) return "yesil";
    if (g <= h * 1.2) return "sari";
    return "kirmizi";
  }
}

function DurumBadge({ durum }: { durum: Durum }) {
  if (durum === "yok") return <Badge variant="secondary">Ölçüm Yok</Badge>;
  if (durum === "yesil") return <Badge className="bg-green-100 text-green-800 border-green-300">Hedefte</Badge>;
  if (durum === "sari") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Yakın</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-300">Geride</Badge>;
}

const emptyHedefForm = { baslik: "", hedefDeger: "", olcumBirimi: "", yon: "yuksek_iyi", sorumluKisi: "", terminTarihi: "", isoMaddesi: "", periyot: "Aylık", durum: "Aktif" };

export default function ISO9001KaliteHedefleri() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [hedefModal, setHedefModal] = useState<{ open: boolean; editing: KaliteHedef | null }>({ open: false, editing: null });
  const [hedefForm, setHedefForm] = useState(emptyHedefForm);

  const [olcumModal, setOlcumModal] = useState<{ open: boolean; hedef: KaliteHedef | null }>({ open: false, hedef: null });
  const [olcumForm, setOlcumForm] = useState({ olcumTarihi: new Date().toISOString().split("T")[0], gerceklesenDeger: "", notlar: "" });

  const { data: hedefler = [] } = useQuery<KaliteHedef[]>({
    queryKey: ["/api/kalite-hedefleri"],
    queryFn: () => fetch("/api/kalite-hedefleri").then(r => r.json()),
  });

  const { data: olcumler = [] } = useQuery<KaliteOlcumWithHedef[]>({
    queryKey: ["/api/kalite-olcumler"],
    queryFn: () => fetch("/api/kalite-olcumler").then(r => r.json()),
  });

  const createHedefMutation = useMutation({
    mutationFn: (data: typeof emptyHedefForm) => fetch("/api/kalite-hedefleri", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kalite-hedefleri"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setHedefModal({ open: false, editing: null });
      setHedefForm(emptyHedefForm);
      toast({ title: "Hedef oluşturuldu" });
    },
    onError: () => toast({ title: "Hata", description: "Hedef oluşturulamadı", variant: "destructive" }),
  });

  const updateHedefMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof emptyHedefForm }) => fetch(`/api/kalite-hedefleri/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kalite-hedefleri"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setHedefModal({ open: false, editing: null });
      setHedefForm(emptyHedefForm);
      toast({ title: "Hedef güncellendi" });
    },
    onError: () => toast({ title: "Hata", description: "Hedef güncellenemedi", variant: "destructive" }),
  });

  const deleteHedefMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/kalite-hedefleri/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kalite-hedefleri"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      toast({ title: "Hedef silindi" });
    },
    onError: () => toast({ title: "Hata", description: "Hedef silinemedi", variant: "destructive" }),
  });

  const createOlcumMutation = useMutation({
    mutationFn: (data: { hedefId: string; olcumTarihi: string; gerceklesenDeger: string; notlar: string }) =>
      fetch("/api/kalite-olcumler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kalite-hedefleri"] });
      qc.invalidateQueries({ queryKey: ["/api/kalite-olcumler"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setOlcumModal({ open: false, hedef: null });
      setOlcumForm({ olcumTarihi: new Date().toISOString().split("T")[0], gerceklesenDeger: "", notlar: "" });
      toast({ title: "Ölçüm eklendi" });
    },
    onError: () => toast({ title: "Hata", description: "Ölçüm eklenemedi", variant: "destructive" }),
  });

  const deleteOlcumMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/kalite-olcumler/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kalite-hedefleri"] });
      qc.invalidateQueries({ queryKey: ["/api/kalite-olcumler"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      toast({ title: "Ölçüm silindi" });
    },
    onError: () => toast({ title: "Hata", description: "Ölçüm silinemedi", variant: "destructive" }),
  });

  function openYeniHedef() {
    setHedefForm(emptyHedefForm);
    setHedefModal({ open: true, editing: null });
  }

  function openDuzenle(hedef: KaliteHedef) {
    setHedefForm({
      baslik: hedef.baslik,
      hedefDeger: hedef.hedefDeger,
      olcumBirimi: hedef.olcumBirimi,
      yon: hedef.yon,
      sorumluKisi: hedef.sorumluKisi,
      terminTarihi: hedef.terminTarihi,
      isoMaddesi: hedef.isoMaddesi ?? "",
      periyot: hedef.periyot,
      durum: hedef.durum,
    });
    setHedefModal({ open: true, editing: hedef });
  }

  function submitHedef() {
    const payload = { ...hedefForm, isoMaddesi: hedefForm.isoMaddesi || null };
    if (hedefModal.editing) {
      updateHedefMutation.mutate({ id: hedefModal.editing.id, data: payload as typeof emptyHedefForm });
    } else {
      createHedefMutation.mutate(payload as typeof emptyHedefForm);
    }
  }

  const hedefFormValid = hedefForm.baslik && hedefForm.hedefDeger && hedefForm.olcumBirimi && hedefForm.sorumluKisi && hedefForm.terminTarihi && hedefForm.periyot;
  const isPendingHedef = createHedefMutation.isPending || updateHedefMutation.isPending;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Target className="w-7 h-7 text-primary" />
          <h2 className="text-2xl font-semibold">Kalite Hedefleri & KPI</h2>
        </div>
        <Button onClick={openYeniHedef}>
          <Plus className="w-4 h-4 mr-2" /> Yeni Hedef
        </Button>
      </div>

      <Tabs defaultValue="hedefler">
        <TabsList className="mb-4">
          <TabsTrigger value="hedefler">Hedefler</TabsTrigger>
          <TabsTrigger value="olcumler">Ölçümler</TabsTrigger>
        </TabsList>

        <TabsContent value="hedefler">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Başlık</th>
                  <th className="text-left p-3 font-medium">ISO Maddesi</th>
                  <th className="text-left p-3 font-medium">Periyot</th>
                  <th className="text-left p-3 font-medium">Hedef</th>
                  <th className="text-left p-3 font-medium">Son Ölçüm</th>
                  <th className="text-left p-3 font-medium">Durum</th>
                  <th className="text-left p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {hedefler.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Henüz hedef yok</td></tr>
                )}
                {hedefler.map(hedef => {
                  const durum = getDurum(hedef, hedef.sonOlcum);
                  return (
                    <tr key={hedef.id} className="border-t hover:bg-muted/20">
                      <td className="p-3 font-medium">{hedef.baslik}</td>
                      <td className="p-3 text-muted-foreground">{hedef.isoMaddesi ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{hedef.periyot}</td>
                      <td className="p-3">{hedef.hedefDeger} {hedef.olcumBirimi}</td>
                      <td className="p-3 text-muted-foreground">
                        {hedef.sonOlcum ? `${hedef.sonOlcum.gerceklesenDeger} ${hedef.olcumBirimi}` : "—"}
                      </td>
                      <td className="p-3"><DurumBadge durum={durum} /></td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setOlcumModal({ open: true, hedef });
                            setOlcumForm({ olcumTarihi: new Date().toISOString().split("T")[0], gerceklesenDeger: "", notlar: "" });
                          }}>
                            <Plus className="w-4 h-4 mr-1" /> Ölçüm Gir
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openDuzenle(hedef)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                            onClick={() => { if (confirm("Bu hedef ve tüm ölçümleri silinecek. Emin misiniz?")) deleteHedefMutation.mutate(hedef.id); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="olcumler">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Tarih</th>
                  <th className="text-left p-3 font-medium">Hedef</th>
                  <th className="text-left p-3 font-medium">Hedef Değer</th>
                  <th className="text-left p-3 font-medium">Gerçekleşen</th>
                  <th className="text-left p-3 font-medium">Durum</th>
                  <th className="text-left p-3 font-medium">Notlar</th>
                  <th className="text-left p-3 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {olcumler.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Henüz ölçüm yok</td></tr>
                )}
                {olcumler.map(olcum => {
                  const durum = getDurum(olcum.hedef, olcum);
                  return (
                    <tr key={olcum.id} className="border-t hover:bg-muted/20">
                      <td className="p-3">{olcum.olcumTarihi}</td>
                      <td className="p-3 font-medium">{olcum.hedef.baslik}</td>
                      <td className="p-3 text-muted-foreground">{olcum.hedef.hedefDeger} {olcum.hedef.olcumBirimi}</td>
                      <td className="p-3">{olcum.gerceklesenDeger} {olcum.hedef.olcumBirimi}</td>
                      <td className="p-3"><DurumBadge durum={durum} /></td>
                      <td className="p-3 text-muted-foreground">{olcum.notlar ?? "—"}</td>
                      <td className="p-3">
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                          onClick={() => { if (confirm("Bu ölçüm silinecek. Emin misiniz?")) deleteOlcumMutation.mutate(olcum.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Hedef Modal */}
      <Dialog open={hedefModal.open} onOpenChange={open => { if (!open) setHedefModal({ open: false, editing: null }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{hedefModal.editing ? "Hedefi Düzenle" : "Yeni Hedef"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Başlık *</Label>
              <Input value={hedefForm.baslik} onChange={e => setHedefForm(f => ({ ...f, baslik: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Hedef Değer *</Label>
                <Input type="number" value={hedefForm.hedefDeger} onChange={e => setHedefForm(f => ({ ...f, hedefDeger: e.target.value }))} />
              </div>
              <div>
                <Label>Birim *</Label>
                <Input placeholder="%, adet, gün..." value={hedefForm.olcumBirimi} onChange={e => setHedefForm(f => ({ ...f, olcumBirimi: e.target.value }))} />
              </div>
              <div>
                <Label>Yön *</Label>
                <Select value={hedefForm.yon} onValueChange={v => setHedefForm(f => ({ ...f, yon: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yuksek_iyi">↑ Yüksek iyi</SelectItem>
                    <SelectItem value="dusuk_iyi">↓ Düşük iyi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sorumlu Kişi *</Label>
                <Input value={hedefForm.sorumluKisi} onChange={e => setHedefForm(f => ({ ...f, sorumluKisi: e.target.value }))} />
              </div>
              <div>
                <Label>Termin Tarihi *</Label>
                <Input type="date" value={hedefForm.terminTarihi} onChange={e => setHedefForm(f => ({ ...f, terminTarihi: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>ISO Maddesi</Label>
                <Input placeholder="8.2.1" value={hedefForm.isoMaddesi} onChange={e => setHedefForm(f => ({ ...f, isoMaddesi: e.target.value }))} />
              </div>
              <div>
                <Label>Periyot *</Label>
                <Select value={hedefForm.periyot} onValueChange={v => setHedefForm(f => ({ ...f, periyot: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aylık">Aylık</SelectItem>
                    <SelectItem value="Çeyreklik">Çeyreklik</SelectItem>
                    <SelectItem value="Yıllık">Yıllık</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Durum *</Label>
                <Select value={hedefForm.durum} onValueChange={v => setHedefForm(f => ({ ...f, durum: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aktif">Aktif</SelectItem>
                    <SelectItem value="Pasif">Pasif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHedefModal({ open: false, editing: null })}>İptal</Button>
            <Button onClick={submitHedef} disabled={!hedefFormValid || isPendingHedef}>
              {isPendingHedef ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ölçüm Modal */}
      <Dialog open={olcumModal.open} onOpenChange={open => { if (!open) setOlcumModal({ open: false, hedef: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Ölçüm Gir — {olcumModal.hedef?.baslik}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Ölçüm Tarihi *</Label>
              <Input type="date" value={olcumForm.olcumTarihi} onChange={e => setOlcumForm(f => ({ ...f, olcumTarihi: e.target.value }))} />
            </div>
            <div>
              <Label>Gerçekleşen Değer * ({olcumModal.hedef?.olcumBirimi})</Label>
              <Input type="number" value={olcumForm.gerceklesenDeger} onChange={e => setOlcumForm(f => ({ ...f, gerceklesenDeger: e.target.value }))} />
            </div>
            <div>
              <Label>Notlar</Label>
              <Textarea value={olcumForm.notlar} onChange={e => setOlcumForm(f => ({ ...f, notlar: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOlcumModal({ open: false, hedef: null })}>İptal</Button>
            <Button
              onClick={() => createOlcumMutation.mutate({ hedefId: olcumModal.hedef!.id, olcumTarihi: olcumForm.olcumTarihi, gerceklesenDeger: olcumForm.gerceklesenDeger, notlar: olcumForm.notlar })}
              disabled={!olcumForm.olcumTarihi || !olcumForm.gerceklesenDeger || createOlcumMutation.isPending}
            >
              {createOlcumMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/ISO9001KaliteHedefleri.tsx
git commit -m "feat(hedefler): add kalite hedefleri page with two tabs and measurements"
```

---

### Task 6: Son doğrulama ve push

- [ ] **Step 1: Son TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

- [ ] **Step 2: Push**

```bash
git push origin main
```
