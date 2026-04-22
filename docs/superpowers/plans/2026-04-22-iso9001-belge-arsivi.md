# ISO 9001 Belge Arşivi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/iso9001/belgeler` route'unda iki seviyeli kategorili, versiyonlanmış belge arşivi modülü oluşturmak.

**Architecture:** Mevcut DÜF/Tetkik pattern'ini takip eder: Drizzle schema → storage methods → Express routes → React page. `belgeler` ve `belge_versiyonlar` iki ayrı tablo; yeni versiyon eklendiğinde önceki aktif versiyon otomatik pasife alınır. `getIso9001Stats` fonksiyonu belge sayısını da döner.

**Tech Stack:** PostgreSQL + Drizzle ORM, Express + multer, React + TypeScript + shadcn/ui + tanstack-query, wouter

---

## File Structure

- **Modify:** `shared/schema.ts` — `belgeler` + `belgeVersiyonlar` tabloları ve tipleri
- **Modify:** `server/storage.ts` — 5 yeni storage metodu + getIso9001Stats güncellemesi
- **Modify:** `server/routes.ts` — multer config + 5 yeni endpoint
- **Modify:** `client/src/App.tsx` — `/iso9001/belgeler` route + pageTitle
- **Modify:** `client/src/pages/ISO9001.tsx` — "Belge Arşivi" kartını ActiveCard'a çevir, belgeCount stats'a ekle
- **Create:** `client/src/pages/ISO9001Belgeler.tsx` — Belge arşivi sayfası

---

### Task 1: Schema — belgeler + belgeVersiyonlar tabloları

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: `boolean` import'unu ekle**

`shared/schema.ts` satır 2'yi güncelle:

```typescript
import { pgTable, text, varchar, decimal, date, integer, uniqueIndex, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
```

- [ ] **Step 2: `belgeler` ve `belgeVersiyonlar` tablolarını dosyanın sonuna ekle**

```typescript
// Belge Arşivi tablosu
export const belgeler = pgTable("belgeler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  baslik: text("baslik").notNull(),
  anaKategori: text("ana_kategori").notNull(), // Prosedür | Talimat | Form | Diğer
  altKategori: text("alt_kategori").notNull(),
  aciklama: text("aciklama"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertBelgeSchema = createInsertSchema(belgeler).omit({ id: true, olusturmaTarihi: true });
export type InsertBelge = z.infer<typeof insertBelgeSchema>;
export type Belge = typeof belgeler.$inferSelect;

// Belge Versiyonları tablosu
export const belgeVersiyonlar = pgTable("belge_versiyonlar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  belgeId: varchar("belge_id").references(() => belgeler.id, { onDelete: "cascade" }).notNull(),
  versiyonNo: text("versiyon_no").notNull(),
  degisiklikNotu: text("degisiklik_notu"),
  dosyaYolu: text("dosya_yolu").notNull(),
  isAktif: boolean("is_aktif").default(false).notNull(),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertBelgeVersiyonSchema = createInsertSchema(belgeVersiyonlar).omit({ id: true, olusturmaTarihi: true });
export type InsertBelgeVersiyon = z.infer<typeof insertBelgeVersiyonSchema>;
export type BelgeVersiyon = typeof belgeVersiyonlar.$inferSelect;
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(belgeler): add belgeler and belgeVersiyonlar schema"
```

---

### Task 2: Storage — CRUD metotları

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Import'lara `belgeler` ve `belgeVersiyonlar` ekle**

`server/storage.ts` dosyasının başındaki import satırını bul (shared/schema'dan import eden satır) ve `belgeler, belgeVersiyonlar, Belge, BelgeVersiyon, InsertBelge` tiplerini ekle:

```typescript
import {
  // ... mevcut importlar ...
  belgeler,
  belgeVersiyonlar,
  Belge,
  BelgeVersiyon,
  InsertBelge,
} from "@shared/schema";
```

- [ ] **Step 2: Interface'e metot imzalarını ekle**

`IStorage` interface'inde (dosyanın üst kısmında) şu metotları ekle:

```typescript
getBelgeler(filters: { anaKategori?: string; altKategori?: string; durum?: string; baslangic?: string; bitis?: string; arama?: string }): Promise<(Belge & { aktifVersiyon: BelgeVersiyon | null })[]>;
getBelgeVersiyonlar(belgeId: string): Promise<BelgeVersiyon[]>;
createBelge(data: InsertBelge & { versiyonNo: string; degisiklikNotu?: string; dosyaYolu: string }): Promise<Belge>;
addBelgeVersiyon(belgeId: string, data: { versiyonNo: string; degisiklikNotu?: string; dosyaYolu: string }): Promise<BelgeVersiyon>;
deleteBelge(id: string): Promise<void>;
```

- [ ] **Step 3: `getIso9001Stats` metodunu güncelle**

Mevcut `getIso9001Stats` fonksiyonunda (satır ~1538) return objesinin başına `belgeCount` ekle:

```typescript
const [belgeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(belgeler);
```

Ve return'de:

```typescript
return {
  belgeCount: belgeCount.count,
  surveyCountMusteri: musteriCount.count,
  // ... geri kalanlar aynı kalır
};
```

- [ ] **Step 4: `getBelgeler` metodunu implement et**

`DatabaseStorage` class'ının sonuna (diğer ISO metotlarının yanına) ekle:

```typescript
async getBelgeler(filters: { anaKategori?: string; altKategori?: string; durum?: string; baslangic?: string; bitis?: string; arama?: string }) {
  const tumBelgeler = await db.select().from(belgeler).orderBy(desc(belgeler.olusturmaTarihi));
  const tumVersiyonlar = await db.select().from(belgeVersiyonlar);

  let result = tumBelgeler.map(b => {
    const versiyonlar = tumVersiyonlar.filter(v => v.belgeId === b.id);
    const aktifVersiyon = versiyonlar.find(v => v.isAktif) ?? null;
    return { ...b, aktifVersiyon };
  });

  if (filters.anaKategori) result = result.filter(b => b.anaKategori === filters.anaKategori);
  if (filters.altKategori) result = result.filter(b => b.altKategori.toLowerCase().includes(filters.altKategori!.toLowerCase()));
  if (filters.arama) result = result.filter(b => b.baslik.toLowerCase().includes(filters.arama!.toLowerCase()));
  if (filters.durum === "aktif") result = result.filter(b => b.aktifVersiyon !== null);
  if (filters.durum === "arsiv") result = result.filter(b => b.aktifVersiyon === null);
  if (filters.baslangic) result = result.filter(b => b.olusturmaTarihi && b.olusturmaTarihi >= new Date(filters.baslangic!));
  if (filters.bitis) result = result.filter(b => b.olusturmaTarihi && b.olusturmaTarihi <= new Date(filters.bitis!));

  return result;
}
```

- [ ] **Step 5: `getBelgeVersiyonlar` metodunu implement et**

```typescript
async getBelgeVersiyonlar(belgeId: string): Promise<BelgeVersiyon[]> {
  return await db.select().from(belgeVersiyonlar)
    .where(eq(belgeVersiyonlar.belgeId, belgeId))
    .orderBy(desc(belgeVersiyonlar.olusturmaTarihi));
}
```

- [ ] **Step 6: `createBelge` metodunu implement et**

```typescript
async createBelge(data: InsertBelge & { versiyonNo: string; degisiklikNotu?: string; dosyaYolu: string }): Promise<Belge> {
  const { versiyonNo, degisiklikNotu, dosyaYolu, ...belgeData } = data;
  const [belge] = await db.insert(belgeler).values(belgeData).returning();
  await db.insert(belgeVersiyonlar).values({
    belgeId: belge.id,
    versiyonNo,
    degisiklikNotu: degisiklikNotu ?? null,
    dosyaYolu,
    isAktif: true,
  });
  return belge;
}
```

- [ ] **Step 7: `addBelgeVersiyon` metodunu implement et**

```typescript
async addBelgeVersiyon(belgeId: string, data: { versiyonNo: string; degisiklikNotu?: string; dosyaYolu: string }): Promise<BelgeVersiyon> {
  // Önceki aktif versiyonu pasife al
  await db.update(belgeVersiyonlar)
    .set({ isAktif: false })
    .where(and(eq(belgeVersiyonlar.belgeId, belgeId), eq(belgeVersiyonlar.isAktif, true)));

  const [versiyon] = await db.insert(belgeVersiyonlar).values({
    belgeId,
    versiyonNo: data.versiyonNo,
    degisiklikNotu: data.degisiklikNotu ?? null,
    dosyaYolu: data.dosyaYolu,
    isAktif: true,
  }).returning();
  return versiyon;
}
```

- [ ] **Step 8: `deleteBelge` metodunu implement et**

```typescript
async deleteBelge(id: string): Promise<void> {
  await db.delete(belgeler).where(eq(belgeler.id, id));
}
```

- [ ] **Step 9: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

- [ ] **Step 10: Commit**

```bash
git add server/storage.ts
git commit -m "feat(belgeler): add storage methods for belge CRUD and versioning"
```

---

### Task 3: Routes — API endpoints

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: multer config ekle**

Mevcut `uploadTetkik` bloğunun hemen altına (satır ~50 civarı) ekle:

```typescript
const belgeStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "uploads/belgeler";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const uploadBelge = multer({ storage: belgeStorage });
```

- [ ] **Step 2: `getIso9001Stats` tip tanımını güncelle**

`server/storage.ts` interface'indeki `getIso9001Stats` dönüş tipine `belgeCount: number` ekle (Task 2'de yapıldıysa zaten tamamdır).

- [ ] **Step 3: Belge endpoint'lerini ekle**

`server/routes.ts` dosyasında DÜF endpoint'lerinin hemen önüne (satır ~2407 civarı) şu endpoint'leri ekle:

```typescript
// Belge Arşivi
app.get("/api/belgeler", async (req, res) => {
  try {
    const { anaKategori, altKategori, durum, baslangic, bitis, arama } = req.query as Record<string, string>;
    const belgelerList = await storage.getBelgeler({ anaKategori, altKategori, durum, baslangic, bitis, arama });
    res.json(belgelerList);
  } catch (e) {
    res.status(500).json({ error: "Belge listesi alınamadı" });
  }
});

app.post("/api/belgeler", uploadBelge.single("dosya"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Dosya zorunludur" });
    const data = JSON.parse(req.body.data ?? "{}");
    data.dosyaYolu = `/uploads/belgeler/${req.file.filename}`;
    const belge = await storage.createBelge(data);
    res.status(201).json(belge);
  } catch (e) {
    res.status(400).json({ error: "Belge oluşturulamadı" });
  }
});

app.delete("/api/belgeler/:id", async (req, res) => {
  try {
    await storage.deleteBelge(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Belge silinemedi" });
  }
});

app.get("/api/belgeler/:id/versiyonlar", async (req, res) => {
  try {
    const versiyonlar = await storage.getBelgeVersiyonlar(req.params.id);
    res.json(versiyonlar);
  } catch (e) {
    res.status(500).json({ error: "Versiyonlar alınamadı" });
  }
});

app.post("/api/belgeler/:id/versiyonlar", uploadBelge.single("dosya"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Dosya zorunludur" });
    const data = JSON.parse(req.body.data ?? "{}");
    data.dosyaYolu = `/uploads/belgeler/${req.file.filename}`;
    const versiyon = await storage.addBelgeVersiyon(req.params.id, data);
    res.status(201).json(versiyon);
  } catch (e) {
    res.status(400).json({ error: "Versiyon eklenemedi" });
  }
});
```

- [ ] **Step 4: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(belgeler): add API endpoints for belge CRUD and versioning"
```

---

### Task 4: App.tsx + ISO9001.tsx güncellemeleri

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/ISO9001.tsx`

- [ ] **Step 1: App.tsx'e import ve route ekle**

`client/src/App.tsx` dosyasında:

Import ekle (diğer ISO9001 import'larının yanına):
```typescript
import ISO9001Belgeler from "@/pages/ISO9001Belgeler";
```

`pageTitles` objesine ekle:
```typescript
"/iso9001/belgeler": "ISO9001-2015 — Belge Arşivi",
```

Router'a route ekle (`/iso9001/tetkik` satırının hemen altına):
```typescript
<Route path="/iso9001/belgeler" component={ISO9001Belgeler} />
```

- [ ] **Step 2: ISO9001.tsx'te Belge Arşivi kartını aktifleştir**

`client/src/pages/ISO9001.tsx` dosyasında:

`Iso9001Stats` tipine `belgeCount` ekle:
```typescript
type Iso9001Stats = {
  belgeCount: number;
  surveyCountMusteri: number;
  surveyCountCalisanlar: number;
  dufAcik: number;
  dufGecikmiş: number;
  dufKapali: number;
  tetkikSonTarih: string | null;
  tetkikPlanlanan: number;
};
```

`ComingSoonCard` olan "Belge Arşivi" satırını şununla değiştir:
```typescript
<ActiveCard href="/iso9001/belgeler" icon={FileText} title="Belge Arşivi">
  <p>Toplam belge: <span className="font-medium text-foreground">{stats?.belgeCount ?? "—"}</span></p>
</ActiveCard>
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: `ISO9001Belgeler` modülü henüz yok, bu yüzden hata verir. Sonraki task'ta çözülecek.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx client/src/pages/ISO9001.tsx
git commit -m "feat(belgeler): wire up /iso9001/belgeler route and activate dashboard card"
```

---

### Task 5: ISO9001Belgeler.tsx — Belge arşivi sayfası

**Files:**
- Create: `client/src/pages/ISO9001Belgeler.tsx`

- [ ] **Step 1: Dosyayı oluştur**

`client/src/pages/ISO9001Belgeler.tsx` dosyasını şu içerikle oluştur:

```typescript
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Upload, ChevronDown, ChevronUp, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type BelgeVersiyon = {
  id: string;
  belgeId: string;
  versiyonNo: string;
  degisiklikNotu: string | null;
  dosyaYolu: string;
  isAktif: boolean;
  olusturmaTarihi: string;
};

type Belge = {
  id: string;
  baslik: string;
  anaKategori: string;
  altKategori: string;
  aciklama: string | null;
  olusturmaTarihi: string;
  aktifVersiyon: BelgeVersiyon | null;
};

const ANA_KATEGORILER = ["Prosedür", "Talimat", "Form", "Diğer"];

export default function ISO9001Belgeler() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Filtreler
  const [filterAnaKategori, setFilterAnaKategori] = useState("tumu");
  const [filterAltKategori, setFilterAltKategori] = useState("");
  const [filterDurum, setFilterDurum] = useState("tumu");
  const [filterBaslangic, setFilterBaslangic] = useState("");
  const [filterBitis, setFilterBitis] = useState("");
  const [filterArama, setFilterArama] = useState("");

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modallar
  const [yeniBelgeAcik, setYeniBelgeAcik] = useState(false);
  const [yeniVersiyonBelge, setYeniVersiyonBelge] = useState<Belge | null>(null);

  // Yeni belge form state
  const [form, setForm] = useState({ baslik: "", anaKategori: "", altKategori: "", aciklama: "", versiyonNo: "v1.0", degisiklikNotu: "" });
  const [formDosya, setFormDosya] = useState<File | null>(null);

  // Yeni versiyon form state
  const [versiyonForm, setVersiyonForm] = useState({ versiyonNo: "", degisiklikNotu: "" });
  const [versiyonDosya, setVersiyonDosya] = useState<File | null>(null);

  // Query params
  const queryParams = new URLSearchParams();
  if (filterAnaKategori && filterAnaKategori !== "tumu") queryParams.set("anaKategori", filterAnaKategori);
  if (filterAltKategori) queryParams.set("altKategori", filterAltKategori);
  if (filterDurum && filterDurum !== "tumu") queryParams.set("durum", filterDurum);
  if (filterBaslangic) queryParams.set("baslangic", filterBaslangic);
  if (filterBitis) queryParams.set("bitis", filterBitis);
  if (filterArama) queryParams.set("arama", filterArama);

  const { data: belgeler = [] } = useQuery<Belge[]>({
    queryKey: ["/api/belgeler", filterAnaKategori, filterAltKategori, filterDurum, filterBaslangic, filterBitis, filterArama],
    queryFn: () => fetch(`/api/belgeler?${queryParams}`).then(r => r.json()),
  });

  const { data: versiyonlar = [] } = useQuery<BelgeVersiyon[]>({
    queryKey: ["/api/belgeler", expandedId, "versiyonlar"],
    queryFn: () => fetch(`/api/belgeler/${expandedId}/versiyonlar`).then(r => r.json()),
    enabled: !!expandedId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!formDosya) throw new Error("Dosya seçilmedi");
      const fd = new FormData();
      fd.append("dosya", formDosya);
      fd.append("data", JSON.stringify({
        baslik: form.baslik,
        anaKategori: form.anaKategori,
        altKategori: form.altKategori,
        aciklama: form.aciklama || null,
        versiyonNo: form.versiyonNo,
        degisiklikNotu: form.degisiklikNotu || null,
      }));
      const res = await fetch("/api/belgeler", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Hata");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/belgeler"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      setYeniBelgeAcik(false);
      setForm({ baslik: "", anaKategori: "", altKategori: "", aciklama: "", versiyonNo: "v1.0", degisiklikNotu: "" });
      setFormDosya(null);
      toast({ title: "Belge oluşturuldu" });
    },
    onError: () => toast({ title: "Hata", description: "Belge oluşturulamadı", variant: "destructive" }),
  });

  const addVersiyonMutation = useMutation({
    mutationFn: async () => {
      if (!versiyonDosya || !yeniVersiyonBelge) throw new Error("Eksik");
      const fd = new FormData();
      fd.append("dosya", versiyonDosya);
      fd.append("data", JSON.stringify({ versiyonNo: versiyonForm.versiyonNo, degisiklikNotu: versiyonForm.degisiklikNotu || null }));
      const res = await fetch(`/api/belgeler/${yeniVersiyonBelge.id}/versiyonlar`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Hata");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/belgeler"] });
      setYeniVersiyonBelge(null);
      setVersiyonForm({ versiyonNo: "", degisiklikNotu: "" });
      setVersiyonDosya(null);
      toast({ title: "Yeni versiyon eklendi" });
    },
    onError: () => toast({ title: "Hata", description: "Versiyon eklenemedi", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/belgeler/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/belgeler"] });
      qc.invalidateQueries({ queryKey: ["/api/iso9001/stats"] });
      toast({ title: "Belge silindi" });
    },
    onError: () => toast({ title: "Hata", description: "Belge silinemedi", variant: "destructive" }),
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-7 h-7 text-primary" />
          <h2 className="text-2xl font-semibold">Belge Arşivi</h2>
        </div>
        <Button onClick={() => setYeniBelgeAcik(true)}>
          <Plus className="w-4 h-4 mr-2" /> Yeni Belge
        </Button>
      </div>

      {/* Filtre Çubuğu */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6 p-4 border rounded-lg bg-muted/30">
        <Select value={filterAnaKategori} onValueChange={setFilterAnaKategori}>
          <SelectTrigger><SelectValue placeholder="Ana Kategori" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tumu">Tümü</SelectItem>
            {ANA_KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Alt kategori..." value={filterAltKategori} onChange={e => setFilterAltKategori(e.target.value)} />
        <Select value={filterDurum} onValueChange={setFilterDurum}>
          <SelectTrigger><SelectValue placeholder="Durum" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tumu">Tümü</SelectItem>
            <SelectItem value="aktif">Aktif</SelectItem>
            <SelectItem value="arsiv">Arşiv</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={filterBaslangic} onChange={e => setFilterBaslangic(e.target.value)} />
        <Input type="date" value={filterBitis} onChange={e => setFilterBitis(e.target.value)} />
        <Input placeholder="Belge ara..." value={filterArama} onChange={e => setFilterArama(e.target.value)} />
      </div>

      {/* Tablo */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Belge Adı</th>
              <th className="text-left p-3 font-medium">Kategori</th>
              <th className="text-left p-3 font-medium">Aktif Versiyon</th>
              <th className="text-left p-3 font-medium">Son Güncelleme</th>
              <th className="text-left p-3 font-medium">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {belgeler.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Henüz belge yok</td></tr>
            )}
            {belgeler.map(belge => (
              <>
                <tr key={belge.id} className="border-t hover:bg-muted/20">
                  <td className="p-3 font-medium">{belge.baslik}</td>
                  <td className="p-3 text-muted-foreground">{belge.anaKategori} &rsaquo; {belge.altKategori}</td>
                  <td className="p-3">
                    {belge.aktifVersiyon
                      ? <Badge variant="outline" className="text-green-700 border-green-300">{belge.aktifVersiyon.versiyonNo}</Badge>
                      : <Badge variant="secondary">Arşiv</Badge>}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {belge.aktifVersiyon ? new Date(belge.aktifVersiyon.olusturmaTarihi).toLocaleDateString("tr-TR") : "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === belge.id ? null : belge.id)}>
                        {expandedId === belge.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        Versiyonlar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setYeniVersiyonBelge(belge); setVersiyonForm({ versiyonNo: "", degisiklikNotu: "" }); }}>
                        <Upload className="w-4 h-4 mr-1" /> Yeni Versiyon
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                        onClick={() => { if (confirm("Bu belge ve tüm versiyonları silinecek. Emin misiniz?")) deleteMutation.mutate(belge.id); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
                {expandedId === belge.id && (
                  <tr key={`${belge.id}-versiyonlar`} className="bg-muted/10">
                    <td colSpan={5} className="p-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">VERSİYON GEÇMİŞİ</p>
                      <div className="space-y-2">
                        {versiyonlar.map(v => (
                          <div key={v.id} className="flex items-center gap-3 text-sm">
                            {v.isAktif
                              ? <Badge className="bg-green-100 text-green-800 border-green-300">Aktif — {v.versiyonNo}</Badge>
                              : <Badge variant="secondary">Arşiv — {v.versiyonNo}</Badge>}
                            <span className="text-muted-foreground">{v.degisiklikNotu ?? "—"}</span>
                            <span className="text-muted-foreground text-xs">{new Date(v.olusturmaTarihi).toLocaleDateString("tr-TR")}</span>
                            <a href={v.dosyaYolu} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="ghost"><Download className="w-3 h-3 mr-1" /> İndir</Button>
                            </a>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Yeni Belge Modal */}
      <Dialog open={yeniBelgeAcik} onOpenChange={setYeniBelgeAcik}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Yeni Belge</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Başlık *</Label>
              <Input value={form.baslik} onChange={e => setForm(f => ({ ...f, baslik: e.target.value }))} />
            </div>
            <div>
              <Label>Ana Kategori *</Label>
              <Select value={form.anaKategori} onValueChange={v => setForm(f => ({ ...f, anaKategori: v }))}>
                <SelectTrigger><SelectValue placeholder="Seç..." /></SelectTrigger>
                <SelectContent>{ANA_KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Alt Kategori *</Label>
              <Input placeholder="ör. Satın Alma" value={form.altKategori} onChange={e => setForm(f => ({ ...f, altKategori: e.target.value }))} />
            </div>
            <div>
              <Label>Açıklama</Label>
              <Textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>İlk Versiyon No *</Label>
                <Input value={form.versiyonNo} onChange={e => setForm(f => ({ ...f, versiyonNo: e.target.value }))} />
              </div>
              <div>
                <Label>Değişiklik Notu</Label>
                <Input value={form.degisiklikNotu} onChange={e => setForm(f => ({ ...f, degisiklikNotu: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Dosya * (PDF veya Word)</Label>
              <Input type="file" accept=".pdf,.doc,.docx" onChange={e => setFormDosya(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYeniBelgeAcik(false)}>İptal</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.baslik || !form.anaKategori || !form.altKategori || !form.versiyonNo || !formDosya || createMutation.isPending}>
              {createMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Yeni Versiyon Modal */}
      <Dialog open={!!yeniVersiyonBelge} onOpenChange={open => { if (!open) setYeniVersiyonBelge(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Yeni Versiyon — {yeniVersiyonBelge?.baslik}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Versiyon No *</Label>
              <Input placeholder="ör. v2.0" value={versiyonForm.versiyonNo} onChange={e => setVersiyonForm(f => ({ ...f, versiyonNo: e.target.value }))} />
            </div>
            <div>
              <Label>Değişiklik Notu</Label>
              <Textarea value={versiyonForm.degisiklikNotu} onChange={e => setVersiyonForm(f => ({ ...f, degisiklikNotu: e.target.value }))} rows={3} />
            </div>
            <div>
              <Label>Dosya * (PDF veya Word)</Label>
              <Input type="file" accept=".pdf,.doc,.docx" onChange={e => setVersiyonDosya(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYeniVersiyonBelge(null)}>İptal</Button>
            <Button onClick={() => addVersiyonMutation.mutate()} disabled={!versiyonForm.versiyonNo || !versiyonDosya || addVersiyonMutation.isPending}>
              {addVersiyonMutation.isPending ? "Yükleniyor..." : "Yükle"}
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
git add client/src/pages/ISO9001Belgeler.tsx
git commit -m "feat(belgeler): add belge arsivi page with filters, versioning, and file upload"
```

---

### Task 6: Son doğrulama ve push

**Files:** Tüm değiştirilen dosyalar

- [ ] **Step 1: Son TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

- [ ] **Step 2: Push**

```bash
git push origin main
```

GitHub Actions otomatik olarak `db:push` → `build` → `pm2 restart` yapacak.
