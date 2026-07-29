# Paraşüt Nakliye Entegrasyonu — Uygulama Planı

> **Ajan çalışanlar için:** ZORUNLU ALT-SKILL: Bu planı görev görev uygulamak için `superpowers:subagent-driven-development` (önerilen) veya `superpowers:executing-plans` kullanın. Adımlar takip için checkbox (`- [ ]`) sözdizimi kullanır.

**Hedef:** Nakliye masraf faturalarını (mailden gelen e-Arşiv + Paraşüt'ten gelen e-Fatura) otomatik olarak sisteme ve Paraşüt'e işlemek, beyannameyle eşleştirmek ve müşteriye %20 marjlı satış faturası taslağı oluşturmak.

**Mimari:** Sunucuda 15 dakikada bir çalışan tek zamanlayıcı + kayıt bazlı durum makinesi. Mail'den gelen PDF'ler Claude Opus 5 ile ayrıştırılır, iki katmanlı doğrulamadan (ham metin + aritmetik) geçer, Paraşüt'e alış faturası olarak yazılır. Paraşüt'teki tüm alış faturaları poll edilip konteyner numarasıyla beyannameye bağlanır; beyanname tamamlandığında satış faturası **taslağı** oluşturulur (resmileştirme yok).

**Teknoloji:** TypeScript, Express (ESM, `tsx`), Drizzle ORM + Neon Postgres, React 18 + wouter + TanStack Query + shadcn/ui, `@anthropic-ai/sdk` 0.110.0, `pdf-parse` 2.4.5, `multer`.

---

## Global Constraints

Bu bölüm **her görevin** gereksinimlerine dahildir.

- **Test altyapısı yok.** [CLAUDE.md](../../../CLAUDE.md): "There is no test runner, no linter, and no formatter wired up. `npm run check` is the only quality gate. **Do not invent test commands.**" Bu planda TDD adımları yerine her görev şu döngüyle biter: `npm run check` → somut manuel doğrulama (curl / psql / tarayıcı) → commit.
- **Şema akışı:** [shared/schema.ts](../../../shared/schema.ts) → `IStorage` arayüzü + `DatabaseStorage` ([server/storage.ts](../../../server/storage.ts)) → uçlar ([server/routes.ts](../../../server/routes.ts)) → sayfa → [client/src/App.tsx](../../../client/src/App.tsx) wiring.
- **FK kolon adları:** TS alan adında Türkçe karakter yok, `pgTable` kolon adı **açık string** olarak verilir. Örn. `faturaId: varchar("fatura_id")`.
- **Tarihler:** `text`, `YYYY-MM-DD`. Görüntülerken `dd/mm/yyyy` — **`new Date(...)` üzerinden geçirmeden** (timezone kayması hatası, commit `c897dff`).
- **PUT/PATCH:** storage dönüşü null-check edilir, `return res.status(404).json({ error: "Bulunamadı" })`.
- **N+1 önleme:** `inArray(...)` veya iki-sorgu + Map join.
- **Insert Zod şeması:** `insert<Entity>Schema` öneki.
- **Migrations:** `npm run db:push`. Migration dosyası **oluşturulmaz**.
- **`git push` = deploy.** Bu plan yalnızca commit üretir; push kullanıcının kararıdır.
- **zod sürümü:** repoda **zod 3.25.76** kurulu ve `drizzle-zod` buna bağlı. `@anthropic-ai/sdk`'nın `helpers/zod` → `zodOutputFormat` yardımcısı **zod v4 API'si bekler ve bu repoda `TypeError` ile patlar** (doğrulandı). Yapısal çıktı için **elle yazılmış JSON Schema** kullanılacak; dönen JSON zod v3 ile ayrıca doğrulanacak. **zod yükseltilmeyecek.**
- **Model:** `claude-opus-5`. Tutarlar para anlamına geldiği için doğruluk önceliklidir; hacim ayda ~11 fatura olduğu için maliyet önemsizdir.
- **Paraşüt sabitleri** (`.env`'de mevcut, doğrulandı): `PARASUT_FIRMA_NO=216831`, `PARASUT_NAKLIYE_URUN_ID=8644976`, `PARASUT_REDIRECT_URI=urn:ietf:wg:oauth:2.0:oob`, `PARASUT_CLIENT_ID`, `PARASUT_CLIENT_SECRET`, `PARASUT_BOOTSTRAP_REFRESH_TOKEN` (ilk çalıştırmada DB'ye taşınır).
- **`APP_BASE_URL`** `.env`'de **yok**; Görev 6'da Paraşüt açıklamasına yazılacak PDF bağlantısı için gerekli. Görev 6'ya başlamadan `.env`'ye ekleyin: yerelde `APP_BASE_URL=http://localhost:5000`, canlıda uygulamanın genel adresi. Tanımsızsa kod `http://localhost:5000`'e düşer ve Paraşüt'teki bağlantı ofis dışından açılmaz.
- **Paraşüt matrah türetme** (tek yardımcı fonksiyonda toplanır):
  `matrah = net_total − total_vat + total_vat_withholding`
- **Giden faturada tevkifat asla yoktur.** `withholding_rate: 0` ve `vat_withholding_rate: 0` **kodda sabittir**, gelen faturadan türetilmez.
- **Paraşüt rate limit:** 10 istek / 10 saniye.
- Paraşüt kimlik bilgisi yoksa entegrasyon **fail-closed**: zamanlayıcı çalışmaz, log'a tek satır yazar, mevcut hiçbir akış bozulmaz.

---

## Dosya Yapısı

| Dosya | Sorumluluk | Görev |
|---|---|---|
| `shared/schema.ts` | **Değişecek** — 4 yeni tablo | 1 |
| `shared/turkceNormalize.ts` | **Yeni** — Türkçe firma adı normalizasyonu | 2 |
| `server/storage.ts` | **Değişecek** — yeni tablolar için CRUD | 1 |
| `server/parasut/client.ts` | **Yeni** — OAuth2 token, throttle, JSON:API çözümleyici | 3 |
| `server/parasut/hesap.ts` | **Yeni** — matrah türetme + para birimi eşlemesi | 3 |
| `server/nakliye/faturaAnaliz.ts` | **Yeni** — PDF → Claude → yapısal alanlar | 4 |
| `server/nakliye/dogrulama.ts` | **Yeni** — ham metin + aritmetik doğrulama | 4 |
| `server/nakliye/parasutYazma.ts` | **Yeni** — `POST purchase_bills` + 3 katmanlı dedup | 6 |
| `server/nakliye/parasutOkuma.ts` | **Yeni** — `GET purchase_bills` poll | 7 |
| `server/nakliye/eslestirme.ts` | **Yeni** — konteyner + firma eşleştirme | 8 |
| `server/nakliye/satisFaturasi.ts` | **Yeni** — beyanname bazlı satış faturası taslağı | 9 |
| `server/nakliye/senkron.ts` | **Yeni** — zamanlayıcı, durum makinesi | 10 |
| `server/routes.ts` | **Değişecek** — yeni uçlar, ölü kod temizliği | 5, 11, 12 |
| `client/src/pages/NakliyeFaturalari.tsx` | **Yeni** — 3 sekmeli ekran | 11 |
| `client/src/App.tsx` | **Değişecek** — route + pageTitle | 11 |
| VPS `/root/nakliye/gmail_poller.py` | **Değişecek** — küçültme | 12 |

---

## Görev Sırası ve Bağımlılıklar

```
1 (şema+storage) ──┬─► 3 (Paraşüt istemci) ──┬─► 6 (Paraşüt'e yazma)
                   │                          ├─► 7 (Paraşüt'ten okuma)
                   │                          └─► 9 (satış faturası)
                   ├─► 4 (PDF analiz) ──► 5 (yükleme ucu) ──► 6
                   ├─► 2 (normalize) ──► 8 (eşleştirme) ──► 9
                   └─────────────────────────────────────► 10 (zamanlayıcı) ──► 11 (UI) ──► 12 (poller)
```

---

## Görev 1: Şema ve depolama katmanı

**Dosyalar:**
- Değiştir: `shared/schema.ts` (dosya sonuna ekle)
- Değiştir: `server/storage.ts` (import satırı, `IStorage` arayüzü, `DatabaseStorage` sınıfı)

**Arayüzler:**
- Üretir: `parasutToken`, `nakliyeFaturalari`, `nakliyeFaturaEslesme`, `parasutSatisFaturalari` tabloları ve tipleri; `IStorage` üzerinde 14 yeni metot.

- [ ] **Adım 1: Tabloları `shared/schema.ts` sonuna ekle**

```typescript
// ============================================================================
// PARAŞÜT NAKLİYE ENTEGRASYONU
// ============================================================================

// Paraşüt OAuth2 jetonu — TEK SATIR (id sabit 'default').
// refresh_token rotasyonlu: her yenilemede yenisi gelir, eskisi ölür.
// Bu yüzden yalnızca tek bir yazıcı olmalı (bkz. server/parasut/client.ts).
export const parasutToken = pgTable("parasut_token", {
  id: varchar("id").primaryKey(), // her zaman 'default'
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  guncellemeTarihi: timestamp("guncelleme_tarihi").defaultNow(),
});

export type ParasutToken = typeof parasutToken.$inferSelect;

// Gelen nakliye faturaları — iki kanalın ortak deposu
export const nakliyeFaturalari = pgTable("nakliye_faturalari", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kaynak: text("kaynak").notNull(), // 'earsiv' | 'efatura'
  faturaNo: text("fatura_no").notNull(),
  faturaTarihi: text("fatura_tarihi"), // YYYY-MM-DD
  tedarikciUnvan: text("tedarikci_unvan"),
  tedarikciVkn: text("tedarikci_vkn"),
  musteriFirmaAdi: text("musteri_firma_adi"), // PDF'ten çıkarılan; eşleşme sinyali
  paraBirimi: text("para_birimi").default("TRY"),
  kur: decimal("kur", { precision: 10, scale: 4 }).default("1"),
  matrah: decimal("matrah", { precision: 15, scale: 2 }), // KDV hariç
  kdvOrani: integer("kdv_orani"),
  kdvTutari: decimal("kdv_tutari", { precision: 15, scale: 2 }),
  tevkifatTutari: decimal("tevkifat_tutari", { precision: 15, scale: 2 }),
  odenecekTutar: decimal("odenecek_tutar", { precision: 15, scale: 2 }),
  konteynerler: text("konteynerler"), // virgülle ayrılmış, normalize
  aciklama: text("aciklama"),
  pdfYolu: text("pdf_yolu"),
  parasutPurchaseBillId: varchar("parasut_purchase_bill_id"),
  parasutEttn: text("parasut_ettn"),
  hamMetin: text("ham_metin"), // pdf-parse çıktısı — doğrulama + denetim
  llmJson: text("llm_json"),
  // ayristirildi | dogrulama_hatasi | parasutta | eslesti | faturalandi
  // | revizyon_gerekli | hata
  durum: text("durum").notNull().default("ayristirildi"),
  hataMesaji: text("hata_mesaji"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
}, (table) => [
  uniqueIndex("nakliye_faturalari_fatura_no_idx").on(table.faturaNo),
]);

export const insertNakliyeFaturasiSchema = createInsertSchema(nakliyeFaturalari).omit({
  id: true,
  olusturmaTarihi: true,
});
export type InsertNakliyeFaturasi = z.infer<typeof insertNakliyeFaturasiSchema>;
export type NakliyeFaturasi = typeof nakliyeFaturalari.$inferSelect;

// Fatura ↔ beyanname eşleşmesi (n:n)
export const nakliyeFaturaEslesme = pgTable("nakliye_fatura_eslesme", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  faturaId: varchar("fatura_id").references(() => nakliyeFaturalari.id),
  gumrukVerisiId: varchar("gumruk_verisi_id").references(() => gumrukVerileri.id),
  konteyner: text("konteyner"),
  skor: integer("skor").notNull().default(0),
  kaynak: text("kaynak").notNull(), // konteyner | konteyner+firma | manuel
  durum: text("durum").notNull().default("otomatik"), // otomatik | onaylandi | reddedildi
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
}, (table) => [
  uniqueIndex("nakliye_eslesme_fatura_gumruk_idx").on(table.faturaId, table.gumrukVerisiId, table.konteyner),
]);

export const insertNakliyeFaturaEslesmeSchema = createInsertSchema(nakliyeFaturaEslesme).omit({
  id: true,
  olusturmaTarihi: true,
});
export type InsertNakliyeFaturaEslesme = z.infer<typeof insertNakliyeFaturaEslesmeSchema>;
export type NakliyeFaturaEslesme = typeof nakliyeFaturaEslesme.$inferSelect;

// Paraşüt'e yazılan satış faturası taslakları — beyanname başına TEK
export const parasutSatisFaturalari = pgTable("parasut_satis_faturalari", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gumrukDosyaNo: text("gumruk_dosya_no").notNull(),
  parasutSalesInvoiceId: varchar("parasut_sales_invoice_id"),
  contactId: varchar("contact_id"),
  netToplam: decimal("net_toplam", { precision: 15, scale: 2 }),
  paraBirimi: text("para_birimi").default("TRY"),
  kalemSayisi: integer("kalem_sayisi"),
  durum: text("durum").notNull().default("taslak"), // taslak | hata
  hataMesaji: text("hata_mesaji"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
}, (table) => [
  uniqueIndex("parasut_satis_dosya_no_idx").on(table.gumrukDosyaNo),
]);

export const insertParasutSatisFaturasiSchema = createInsertSchema(parasutSatisFaturalari).omit({
  id: true,
  olusturmaTarihi: true,
});
export type InsertParasutSatisFaturasi = z.infer<typeof insertParasutSatisFaturasiSchema>;
export type ParasutSatisFaturasi = typeof parasutSatisFaturalari.$inferSelect;
```

> `pgTable`, `varchar`, `text`, `integer`, `decimal`, `timestamp`, `uniqueIndex`, `sql`, `createInsertSchema`, `z` zaten dosyanın başında import edilmiş durumda — yeni import gerekmez. `gumrukVerileri` aynı dosyada tanımlı.

- [ ] **Adım 2: `server/storage.ts` import satırına yeni tipleri ekle**

Dosyanın en üstündeki uzun `import { ... } from "@shared/schema"` bloğunun sonuna (kapanış parantezinden önce) ekle:

```typescript
  parasutToken, type ParasutToken,
  nakliyeFaturalari, type NakliyeFaturasi, type InsertNakliyeFaturasi,
  nakliyeFaturaEslesme, type NakliyeFaturaEslesme, type InsertNakliyeFaturaEslesme,
  parasutSatisFaturalari, type ParasutSatisFaturasi, type InsertParasutSatisFaturasi,
```

- [ ] **Adım 3: `IStorage` arayüzüne metotları ekle**

`export interface IStorage {` bloğunun içine, kapanış süslü parantezinden önce:

```typescript
  // --- Paraşüt nakliye entegrasyonu ---
  getParasutToken(): Promise<ParasutToken | undefined>;
  upsertParasutToken(t: { accessToken: string; refreshToken: string; expiresAt: Date }): Promise<ParasutToken>;

  getNakliyeFaturalari(durum?: string): Promise<NakliyeFaturasi[]>;
  getNakliyeFaturasiByNo(faturaNo: string): Promise<NakliyeFaturasi | undefined>;
  insertNakliyeFaturasi(f: InsertNakliyeFaturasi): Promise<NakliyeFaturasi>;
  updateNakliyeFaturasi(id: string, f: Partial<InsertNakliyeFaturasi>): Promise<NakliyeFaturasi | undefined>;

  getEslesmelerByFatura(faturaIds: string[]): Promise<NakliyeFaturaEslesme[]>;
  insertEslesme(e: InsertNakliyeFaturaEslesme): Promise<NakliyeFaturaEslesme>;
  updateEslesme(id: string, e: Partial<InsertNakliyeFaturaEslesme>): Promise<NakliyeFaturaEslesme | undefined>;
  deleteEslesmelerByFatura(faturaId: string): Promise<void>;

  getSatisFaturasiByDosyaNo(dosyaNo: string): Promise<ParasutSatisFaturasi | undefined>;
  getSatisFaturalari(): Promise<ParasutSatisFaturasi[]>;
  insertSatisFaturasi(s: InsertParasutSatisFaturasi): Promise<ParasutSatisFaturasi>;
  updateSatisFaturasi(id: string, s: Partial<InsertParasutSatisFaturasi>): Promise<ParasutSatisFaturasi | undefined>;
```

- [ ] **Adım 4: `DatabaseStorage` sınıfına implementasyonları ekle**

Sınıfın kapanış süslü parantezinden önce:

```typescript
  // --- Paraşüt nakliye entegrasyonu ---

  async getParasutToken(): Promise<ParasutToken | undefined> {
    const [row] = await db.select().from(parasutToken).where(eq(parasutToken.id, "default"));
    return row;
  }

  async upsertParasutToken(t: { accessToken: string; refreshToken: string; expiresAt: Date }): Promise<ParasutToken> {
    const [row] = await db
      .insert(parasutToken)
      .values({ id: "default", ...t, guncellemeTarihi: new Date() })
      .onConflictDoUpdate({
        target: parasutToken.id,
        set: { ...t, guncellemeTarihi: new Date() },
      })
      .returning();
    return row;
  }

  async getNakliyeFaturalari(durum?: string): Promise<NakliyeFaturasi[]> {
    if (durum) {
      return await db.select().from(nakliyeFaturalari).where(eq(nakliyeFaturalari.durum, durum));
    }
    return await db.select().from(nakliyeFaturalari);
  }

  async getNakliyeFaturasiByNo(faturaNo: string): Promise<NakliyeFaturasi | undefined> {
    const [row] = await db.select().from(nakliyeFaturalari).where(eq(nakliyeFaturalari.faturaNo, faturaNo));
    return row;
  }

  async insertNakliyeFaturasi(f: InsertNakliyeFaturasi): Promise<NakliyeFaturasi> {
    const [row] = await db.insert(nakliyeFaturalari).values(f).returning();
    return row;
  }

  async updateNakliyeFaturasi(id: string, f: Partial<InsertNakliyeFaturasi>): Promise<NakliyeFaturasi | undefined> {
    const [row] = await db.update(nakliyeFaturalari).set(f).where(eq(nakliyeFaturalari.id, id)).returning();
    return row;
  }

  async getEslesmelerByFatura(faturaIds: string[]): Promise<NakliyeFaturaEslesme[]> {
    if (faturaIds.length === 0) return [];
    return await db.select().from(nakliyeFaturaEslesme).where(inArray(nakliyeFaturaEslesme.faturaId, faturaIds));
  }

  async insertEslesme(e: InsertNakliyeFaturaEslesme): Promise<NakliyeFaturaEslesme> {
    const [row] = await db.insert(nakliyeFaturaEslesme).values(e)
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    // Çakışma olduysa mevcut kaydı döndür (idempotans)
    const [mevcut] = await db.select().from(nakliyeFaturaEslesme).where(
      and(
        eq(nakliyeFaturaEslesme.faturaId, e.faturaId!),
        eq(nakliyeFaturaEslesme.gumrukVerisiId, e.gumrukVerisiId!),
      ),
    );
    return mevcut;
  }

  async updateEslesme(id: string, e: Partial<InsertNakliyeFaturaEslesme>): Promise<NakliyeFaturaEslesme | undefined> {
    const [row] = await db.update(nakliyeFaturaEslesme).set(e).where(eq(nakliyeFaturaEslesme.id, id)).returning();
    return row;
  }

  async deleteEslesmelerByFatura(faturaId: string): Promise<void> {
    await db.delete(nakliyeFaturaEslesme).where(eq(nakliyeFaturaEslesme.faturaId, faturaId));
  }

  async getSatisFaturasiByDosyaNo(dosyaNo: string): Promise<ParasutSatisFaturasi | undefined> {
    const [row] = await db.select().from(parasutSatisFaturalari).where(eq(parasutSatisFaturalari.gumrukDosyaNo, dosyaNo));
    return row;
  }

  async getSatisFaturalari(): Promise<ParasutSatisFaturasi[]> {
    return await db.select().from(parasutSatisFaturalari);
  }

  async insertSatisFaturasi(s: InsertParasutSatisFaturasi): Promise<ParasutSatisFaturasi> {
    const [row] = await db.insert(parasutSatisFaturalari).values(s).returning();
    return row;
  }

  async updateSatisFaturasi(id: string, s: Partial<InsertParasutSatisFaturasi>): Promise<ParasutSatisFaturasi | undefined> {
    const [row] = await db.update(parasutSatisFaturalari).set(s).where(eq(parasutSatisFaturalari.id, id)).returning();
    return row;
  }
```

> `eq`, `and`, `inArray` `drizzle-orm`'den zaten import edilmiş durumda. Değilse dosyanın başındaki `import { eq, and, ... } from "drizzle-orm";` satırına ekle.

- [ ] **Adım 5: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hata yok.

- [ ] **Adım 6: Şemayı veritabanına gönder**

Çalıştır: `npm run db:push`
Beklenen: 4 yeni tablo oluşturuldu.

Doğrula:
```bash
psql "$DATABASE_URL" -t -A -c "SELECT tablename FROM pg_tables WHERE tablename IN ('parasut_token','nakliye_faturalari','nakliye_fatura_eslesme','parasut_satis_faturalari') ORDER BY 1;"
```
Beklenen: 4 satır.

- [ ] **Adım 7: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(nakliye): parasut entegrasyonu sema ve storage katmani"
```

---

## Görev 2: Türkçe firma adı normalizasyonu

**Dosyalar:**
- Oluştur: `shared/turkceNormalize.ts`

**Arayüzler:**
- Üretir: `normalizeFirmaAdi(s: string): string`, `firmaAdiBenzerligi(a: string, b: string): number`

- [ ] **Adım 1: `shared/turkceNormalize.ts` dosyasını oluştur**

```typescript
// Türkçe firma unvanlarını karşılaştırılabilir hale getirir.
// "CNC NAKLİYE HİZMETLERİ A.Ş." ve "cnc nakliye hizmetleri aş" aynı sonucu verir.

const SIRKET_EKLERI = [
  "ANONIM SIRKETI", "LIMITED SIRKETI", "KOLLEKTIF SIRKETI",
  "A S", "AS", "LTD STI", "LTD", "STI", "SAN", "TIC", "SANAYI", "TICARET", "VE",
];

/**
 * Türkçe karakterleri ASCII karşılığına çevirir, noktalama ve şirket eklerini
 * atar, çoklu boşlukları teke indirir.
 *
 * NOT: İ/ı dönüşümü JavaScript'in toUpperCase()'inde doğru çalışmaz
 * ("i".toUpperCase() === "I" ama Türkçe'de "İ" olmalı). Bu yüzden harf
 * eşlemesi elle yapılır, sonra toUpperCase() çağrılır.
 */
export function normalizeFirmaAdi(s: string): string {
  if (!s) return "";
  const harfler: Record<string, string> = {
    "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i",
    "İ": "i", "i": "i", "ö": "o", "Ö": "o", "ş": "s", "Ş": "s",
    "ü": "u", "Ü": "u",
  };
  let t = s.replace(/[çÇğĞıIİiöÖşŞüÜ]/g, (m) => harfler[m] ?? m).toUpperCase();
  t = t.replace(/[^A-Z0-9 ]/g, " ");          // noktalama → boşluk
  t = t.replace(/\s+/g, " ").trim();
  const kelimeler = t.split(" ").filter((k) => k.length > 0);
  // Şirket eklerini at — çok kelimeli ekler önce denenir
  let sonuc = kelimeler.join(" ");
  for (const ek of SIRKET_EKLERI) {
    sonuc = sonuc.replace(new RegExp(`(^| )${ek}( |$)`, "g"), " ");
  }
  return sonuc.replace(/\s+/g, " ").trim();
}

/**
 * İki firma adı arasındaki benzerliği 0-100 arası döndürür.
 * Ortak kelime oranına dayanır (Jaccard). Tam eşleşme 100.
 */
export function firmaAdiBenzerligi(a: string, b: string): number {
  const na = normalizeFirmaAdi(a);
  const nb = normalizeFirmaAdi(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  const sa = new Set(na.split(" "));
  const sb = new Set(nb.split(" "));
  let kesisim = 0;
  sa.forEach((k) => { if (sb.has(k)) kesisim++; });
  const birlesim = new Set([...Array.from(sa), ...Array.from(sb)]).size;
  return Math.round((kesisim / birlesim) * 100);
}
```

- [ ] **Adım 2: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hata yok.

- [ ] **Adım 3: Davranışı elle doğrula**

Repo kökünde geçici bir dosya oluştur, çalıştır, sil:

```bash
cat > ._nrm.ts <<'EOF'
import { normalizeFirmaAdi, firmaAdiBenzerligi } from "./shared/turkceNormalize";
console.log(normalizeFirmaAdi("BARTEZ CAM SANAYİ VE TİCARET A.Ş."));
console.log(normalizeFirmaAdi("Bartez Cam San. Tic. AŞ"));
console.log("benzerlik:", firmaAdiBenzerligi("BARTEZ CAM SANAYİ VE TİCARET A.Ş.", "Bartez Cam San. Tic. AŞ"));
console.log("alakasiz:", firmaAdiBenzerligi("BARTEZ CAM", "HANIFE EKER"));
EOF
npx tsx ._nrm.ts; rm -f ._nrm.ts
```

Beklenen: ilk iki satır **birebir aynı** (`BARTEZ CAM`), benzerlik `100`, alakasız `0`.

- [ ] **Adım 4: Commit**

```bash
git add shared/turkceNormalize.ts
git commit -m "feat(shared): turkce firma adi normalizasyonu"
```

---

## Görev 3: Paraşüt istemci katmanı

**Dosyalar:**
- Oluştur: `server/parasut/client.ts`
- Oluştur: `server/parasut/hesap.ts`

**Arayüzler:**
- Tüketir: Görev 1'den `storage.getParasutToken()`, `storage.upsertParasutToken()`
- Üretir:
  - `parasutAktifMi(): boolean`
  - `parasutIstek<T>(yol: string, opts?: { method?: string; body?: unknown; query?: Record<string, string> }): Promise<T>`
  - `parasutMatrahTuret(netTotal: number, totalVat: number, tevkifat: number): number`
  - `paraBirimiParasut(tr: string): "TRL" | "USD" | "EUR" | "GBP"`

- [ ] **Adım 1: `server/parasut/hesap.ts` dosyasını oluştur**

```typescript
/**
 * Paraşüt'ün purchase_bills.net_total alanı KDV DAHİL ve tevkifat DÜŞÜLMÜŞ
 * tutardır (yani "ödenecek"). Marj tabanı olan matrah türetilmelidir.
 *
 * Canlıda doğrulandı (2026-07-29):
 *   11.600 − 2.000 + 400 = 10.000  (GIB2026000000075)
 *   23.200 − 4.000 + 800 = 20.000  (GIB2026000000074)
 *
 * net_total'ı matrah sanmak her faturayı yanlış hesaplatır.
 */
export function parasutMatrahTuret(netTotal: number, totalVat: number, tevkifat: number): number {
  return Math.round((netTotal - totalVat + tevkifat) * 100) / 100;
}

/** CNC'de TRY, Paraşüt'te TRL. Diğerleri aynı. */
export function paraBirimiParasut(tr: string): "TRL" | "USD" | "EUR" | "GBP" {
  const u = (tr || "TRY").toUpperCase();
  if (u === "TRY" || u === "TL" || u === "TRL") return "TRL";
  if (u === "USD" || u === "EUR" || u === "GBP") return u;
  return "TRL";
}

/** Paraşüt'ten gelen TRL'yi CNC tarafında TRY olarak saklarız. */
export function paraBirimiCnc(parasut: string): string {
  return (parasut || "TRL").toUpperCase() === "TRL" ? "TRY" : parasut.toUpperCase();
}
```

- [ ] **Adım 2: `server/parasut/client.ts` dosyasını oluştur**

```typescript
import { storage } from "../storage";

const BASE = "https://api.parasut.com";
const FIRMA = process.env.PARASUT_FIRMA_NO || "";

/** Kimlik bilgileri tam mı? Değilse entegrasyon fail-closed davranır. */
export function parasutAktifMi(): boolean {
  return Boolean(
    process.env.PARASUT_CLIENT_ID &&
    process.env.PARASUT_CLIENT_SECRET &&
    FIRMA,
  );
}

// --- Throttle: 10 istek / 10 saniye ---
const PENCERE_MS = 10_000;
const LIMIT = 10;
let damgalar: number[] = [];

async function throttleBekle(): Promise<void> {
  for (;;) {
    const simdi = Date.now();
    damgalar = damgalar.filter((d) => simdi - d < PENCERE_MS);
    if (damgalar.length < LIMIT) {
      damgalar.push(simdi);
      return;
    }
    const enEski = damgalar[0];
    await new Promise((r) => setTimeout(r, PENCERE_MS - (simdi - enEski) + 50));
  }
}

// --- Token yönetimi: TEK YAZICI ---
// refresh_token rotasyonlu; eşzamanlı yenileme zinciri koparır.
// Bu yüzden yenileme tek bir promise üzerinden serileştirilir.
let yenilemePromise: Promise<string> | null = null;

async function tokenAl(): Promise<string> {
  const kayit = await storage.getParasutToken();

  // 60 saniye pay bırak
  if (kayit && kayit.expiresAt.getTime() - Date.now() > 60_000) {
    return kayit.accessToken;
  }

  if (yenilemePromise) return yenilemePromise;

  yenilemePromise = (async () => {
    try {
      const refreshToken = kayit?.refreshToken || process.env.PARASUT_BOOTSTRAP_REFRESH_TOKEN;
      if (!refreshToken) {
        throw new Error(
          "Paraşüt refresh_token yok. .env'ye PARASUT_BOOTSTRAP_REFRESH_TOKEN " +
          "koyun veya authorization_code akışını tekrarlayın.",
        );
      }

      const form = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.PARASUT_CLIENT_ID!,
        client_secret: process.env.PARASUT_CLIENT_SECRET!,
        refresh_token: refreshToken,
      });

      const r = await fetch(`${BASE}/oauth/token`, { method: "POST", body: form });
      if (!r.ok) {
        const metin = await r.text();
        throw new Error(`Paraşüt token yenileme başarısız (${r.status}): ${metin.slice(0, 200)}`);
      }
      const j = (await r.json()) as {
        access_token: string; refresh_token: string; expires_in: number;
      };

      await storage.upsertParasutToken({
        accessToken: j.access_token,
        refreshToken: j.refresh_token, // ROTASYON: yeni refresh_token mutlaka yazılır
        expiresAt: new Date(Date.now() + j.expires_in * 1000),
      });

      return j.access_token;
    } finally {
      yenilemePromise = null;
    }
  })();

  return yenilemePromise;
}

/**
 * Paraşüt v4 isteği. `yol` firma numarasından SONRAKİ kısımdır:
 *   parasutIstek("/purchase_bills", { query: { "page[size]": "25" } })
 * 401 alınırsa token bir kez yenilenip tekrar denenir.
 */
export async function parasutIstek<T = any>(
  yol: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  if (!parasutAktifMi()) {
    throw new Error("Paraşüt kimlik bilgileri eksik (.env)");
  }

  const calistir = async (token: string): Promise<Response> => {
    await throttleBekle();
    const qs = opts.query ? "?" + new URLSearchParams(opts.query).toString() : "";
    return fetch(`${BASE}/v4/${FIRMA}${yol}${qs}`, {
      method: opts.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  };

  let token = await tokenAl();
  let r = await calistir(token);

  if (r.status === 401) {
    // Token geçersiz — kaydı süresi dolmuş gibi işaretleyip yenile
    await storage.upsertParasutToken({
      accessToken: "",
      refreshToken: (await storage.getParasutToken())?.refreshToken || "",
      expiresAt: new Date(0),
    });
    token = await tokenAl();
    r = await calistir(token);
  }

  if (r.status === 429) {
    await new Promise((res) => setTimeout(res, 11_000));
    r = await calistir(await tokenAl());
  }

  if (!r.ok) {
    const metin = await r.text();
    throw new Error(`Paraşüt ${opts.method || "GET"} ${yol} → ${r.status}: ${metin.slice(0, 300)}`);
  }

  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

/**
 * JSON:API cevabını düzleştirir: `included` dizisini (tip, id) ile
 * indeksleyip `relationships` referanslarını çözer.
 */
export function jsonApiCoz(cevap: any): { veri: any[]; iliskili: Map<string, any> } {
  const iliskili = new Map<string, any>();
  for (const i of cevap?.included || []) {
    iliskili.set(`${i.type}:${i.id}`, i);
  }
  const veri = Array.isArray(cevap?.data) ? cevap.data : cevap?.data ? [cevap.data] : [];
  return { veri, iliskili };
}

/** İlişki id'sini çözer: iliskiId(kayit, "supplier") → "12345" | undefined */
export function iliskiId(kayit: any, ad: string): string | undefined {
  return kayit?.relationships?.[ad]?.data?.id;
}
```

- [ ] **Adım 3: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hata yok.

- [ ] **Adım 4: Canlı bağlantıyı doğrula**

Repo kökünde geçici dosya:

```bash
cat > ._ptest.ts <<'EOF'
import "dotenv/config";
import { parasutAktifMi, parasutIstek, jsonApiCoz } from "./server/parasut/client";
import { parasutMatrahTuret } from "./server/parasut/hesap";

(async () => {
  console.log("aktif mi:", parasutAktifMi());
  const r = await parasutIstek<any>("/purchase_bills", {
    query: { "page[size]": "3", sort: "-issue_date", include: "supplier" },
  });
  const { veri } = jsonApiCoz(r);
  for (const d of veri) {
    const a = d.attributes;
    const matrah = parasutMatrahTuret(
      Number(a.net_total), Number(a.total_vat), Number(a.total_vat_withholding),
    );
    console.log(a.issue_date, a.invoice_no, "net:", a.net_total, "→ matrah:", matrah);
  }
  process.exit(0);
})();
EOF
npx tsx ._ptest.ts; rm -f ._ptest.ts
```

Beklenen: 3 satır fatura, `matrah` değerleri `net_total − kdv + tevkifat` ile tutarlı (örn. `11600 → 10000`). Ayrıca `parasut_token` tablosunda bir satır oluşmuş olmalı:

```bash
psql "$DATABASE_URL" -t -A -c "SELECT id, expires_at > now() AS gecerli FROM parasut_token;"
```
Beklenen: `default|t`

- [ ] **Adım 5: Commit**

```bash
git add server/parasut/client.ts server/parasut/hesap.ts
git commit -m "feat(parasut): oauth2 token yonetimi, throttle ve json:api istemcisi"
```

---

## Görev 4: PDF analizi ve doğrulama

**Dosyalar:**
- Oluştur: `server/nakliye/faturaAnaliz.ts`
- Oluştur: `server/nakliye/dogrulama.ts`

**Arayüzler:**
- Üretir:
  - `type FaturaAlanlari` (aşağıda tam tanım)
  - `pdfMetniCikar(buf: Buffer): Promise<string>`
  - `faturaAnalizEt(buf: Buffer): Promise<FaturaAlanlari>`
  - `faturaDogrula(a: FaturaAlanlari, hamMetin: string): { gecerli: boolean; hatalar: string[] }`

- [ ] **Adım 1: `server/nakliye/dogrulama.ts` dosyasını oluştur**

```typescript
export type FaturaAlanlari = {
  fatura_no: string | null;
  fatura_tarihi: string | null;      // YYYY-MM-DD
  tedarikci_unvan: string | null;
  tedarikci_vkn: string | null;
  musteri_firma_adi: string | null;
  konteynerler: string[];
  para_birimi: string | null;        // TRY | USD | EUR | GBP
  matrah: number | null;
  kdv_orani: number | null;
  kdv_tutari: number | null;
  tevkifat_tutari: number | null;
  odenecek_tutar: number | null;
  aciklama: string | null;
};

/**
 * Bir sayının PDF ham metninde geçip geçmediğini kontrol eder.
 * Türkçe biçim (1.234,56) ve İngilizce biçim (1234.56) birlikte denenir;
 * ayrıca binlik ayracı olmayan hâli de aranır.
 */
function tutarMetindeVar(tutar: number, hamMetin: string): boolean {
  const temiz = hamMetin.replace(/\s/g, "");
  const adaylar = new Set<string>();
  const trBicim = tutar.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  adaylar.add(trBicim);                                  // 1.234,56
  adaylar.add(trBicim.replace(/\./g, ""));               // 1234,56
  adaylar.add(tutar.toFixed(2));                         // 1234.56
  adaylar.add(tutar.toFixed(2).replace(".", ","));       // 1234,56
  adaylar.add(String(Math.round(tutar)));                // 1234
  for (const a of Array.from(adaylar)) {
    if (temiz.includes(a.replace(/\s/g, ""))) return true;
  }
  return false;
}

/**
 * İki katmanlı doğrulama:
 *  1) Metin kontrolü — LLM'in döndürdüğü her tutar ve fatura no ham metinde
 *     birebir geçmeli. Halüsinasyon böyle yakalanır.
 *  2) Aritmetik kontrolü — matrah + KDV − tevkifat == ödenecek (±0,01).
 */
export function faturaDogrula(
  a: FaturaAlanlari,
  hamMetin: string,
): { gecerli: boolean; hatalar: string[] } {
  const hatalar: string[] = [];

  if (!a.fatura_no) {
    hatalar.push("fatura_no boş");
  } else if (!hamMetin.replace(/\s/g, "").includes(a.fatura_no.replace(/\s/g, ""))) {
    hatalar.push(`fatura_no "${a.fatura_no}" PDF metninde bulunamadı`);
  }

  if (!a.fatura_tarihi || !/^\d{4}-\d{2}-\d{2}$/.test(a.fatura_tarihi)) {
    hatalar.push(`fatura_tarihi geçersiz: ${a.fatura_tarihi}`);
  }

  const tutarAlanlari: Array<[string, number | null]> = [
    ["matrah", a.matrah],
    ["kdv_tutari", a.kdv_tutari],
    ["tevkifat_tutari", a.tevkifat_tutari],
    ["odenecek_tutar", a.odenecek_tutar],
  ];
  for (const [ad, deger] of tutarAlanlari) {
    if (deger === null || deger === 0) continue; // 0 ve null doğal olarak metinde geçmeyebilir
    if (!tutarMetindeVar(deger, hamMetin)) {
      hatalar.push(`${ad}=${deger} PDF metninde bulunamadı`);
    }
  }

  if (a.matrah === null || a.odenecek_tutar === null) {
    hatalar.push("matrah veya odenecek_tutar boş");
  } else {
    const kdv = a.kdv_tutari ?? 0;
    const tevkifat = a.tevkifat_tutari ?? 0;
    const beklenen = a.matrah + kdv - tevkifat;
    if (Math.abs(beklenen - a.odenecek_tutar) > 0.01) {
      hatalar.push(
        `aritmetik tutmuyor: ${a.matrah} + ${kdv} - ${tevkifat} = ${beklenen.toFixed(2)}, ` +
        `ödenecek ${a.odenecek_tutar}`,
      );
    }
  }

  return { gecerli: hatalar.length === 0, hatalar };
}

/** Konteyner numarasını karşılaştırılabilir hale getirir: 4 harf + 7 rakam. */
export function normalizeKonteyner(s: string): string {
  return (s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Geçerli konteyner formatı mı? (ISO 6346 gövde kontrolü yapılmaz) */
export function konteynerGecerliMi(s: string): boolean {
  return /^[A-Z]{4}\d{7}$/.test(normalizeKonteyner(s));
}
```

- [ ] **Adım 2: `server/nakliye/faturaAnaliz.ts` dosyasını oluştur**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { FaturaAlanlari } from "./dogrulama";
import { normalizeKonteyner, konteynerGecerliMi } from "./dogrulama";

// pdf-parse 2.x'te DEFAULT EXPORT YOKTUR. v1'deki `pdfParse(buffer)` fonksiyonu
// kaldırılmış, yerine PDFParse sınıfı gelmiştir. Doğrulandı (2.4.5):
//   new PDFParse({ data: buf }) → await p.getText() → r.text → await p.destroy()
import { PDFParse } from "pdf-parse";

export function analizAktifMi(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * PDF'in ham metnini çıkarır. Doğrulamanın referans kaynağıdır.
 * Çıktıya sayfa ayracı eklenir ("-- 1 of 1 --") — doğrulamayı etkilemez.
 */
export async function pdfMetniCikar(buf: Buffer): Promise<string> {
  let p: PDFParse | null = null;
  try {
    p = new PDFParse({ data: new Uint8Array(buf) });
    const sonuc = await p.getText();
    return sonuc.text || "";
  } catch (e) {
    console.error("pdf-parse hatası:", e);
    return "";
  } finally {
    if (p) {
      try { await p.destroy(); } catch { /* yoksay */ }
    }
  }
}

// Elle yazılmış JSON Schema.
// zodOutputFormat KULLANILMAZ: SDK 0.110.0'ın helpers/zod'u zod v4 API'si
// bekler, repoda zod 3.25.76 kurulu ve çağrı TypeError ile patlar.
const FATURA_SEMASI = {
  type: "object",
  properties: {
    fatura_no: { type: ["string", "null"], description: "Fatura numarası, örn. GIB2026000000075" },
    fatura_tarihi: { type: ["string", "null"], description: "YYYY-MM-DD biçiminde düzenleme tarihi" },
    tedarikci_unvan: { type: ["string", "null"], description: "Faturayı kesen firmanın tam unvanı" },
    tedarikci_vkn: { type: ["string", "null"], description: "Faturayı kesenin vergi kimlik numarası" },
    musteri_firma_adi: {
      type: ["string", "null"],
      description:
        "Fatura açıklamasında/kaleminde adı geçen NİHAİ MÜŞTERİ firma adı. " +
        "Faturayı kesen ya da faturanın kesildiği firma DEĞİL; taşımanın kime " +
        "ait olduğunu belirten firma. Yoksa null.",
    },
    konteynerler: {
      type: "array",
      items: { type: "string" },
      description: "Metinde geçen konteyner numaraları, örn. MSBU4529335. Yoksa boş dizi.",
    },
    para_birimi: { type: ["string", "null"], description: "TRY, USD, EUR veya GBP" },
    matrah: { type: ["number", "null"], description: "KDV hariç mal/hizmet toplam tutarı" },
    kdv_orani: { type: ["number", "null"], description: "KDV yüzdesi, örn. 20 veya 0" },
    kdv_tutari: { type: ["number", "null"], description: "Hesaplanan KDV tutarı" },
    tevkifat_tutari: { type: ["number", "null"], description: "KDV tevkifat tutarı. Yoksa 0." },
    odenecek_tutar: { type: ["number", "null"], description: "Ödenecek toplam tutar" },
    aciklama: { type: ["string", "null"], description: "Mal/hizmet açıklaması, tek satır" },
  },
  required: [
    "fatura_no", "fatura_tarihi", "tedarikci_unvan", "tedarikci_vkn",
    "musteri_firma_adi", "konteynerler", "para_birimi", "matrah",
    "kdv_orani", "kdv_tutari", "tevkifat_tutari", "odenecek_tutar", "aciklama",
  ],
  additionalProperties: false,
} as const;

const SISTEM_TALIMATI = `Sen bir Türk e-Arşiv/e-Fatura belgesini okuyan bir çıkarım motorusun.
Yalnızca belgede AÇIKÇA yazan bilgiyi döndür.

KURALLAR:
- Emin olmadığın alan için null döndür. ASLA tahmin etme, ASLA hesaplama uydurma.
- Tutarlar sayı olarak döner (1.234,56 → 1234.56). Para birimi sembolü ekleme.
- tevkifat_tutari belgede yoksa 0 döndür.
- konteynerler: 4 harf + 7 rakam biçimindeki numaralar (örn. MSBU4529335).
  Belgede yoksa boş dizi döndür.
- musteri_firma_adi: taşımanın kime ait olduğunu belirten firma. Faturayı
  kesen firma ya da faturanın kesildiği firma DEĞİL. Emin değilsen null.`;

/**
 * PDF'i Claude ile ayrıştırır. Doğrulama YAPMAZ — çağıran taraf
 * faturaDogrula() ile kontrol etmelidir.
 */
export async function faturaAnalizEt(buf: Buffer): Promise<FaturaAlanlari> {
  if (!analizAktifMi()) {
    throw new Error("ANTHROPIC_API_KEY tanımlı değil");
  }

  const client = new Anthropic({ maxRetries: 2, timeout: 120_000 });

  const mesaj = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: SISTEM_TALIMATI,
    output_config: { format: { type: "json_schema", schema: FATURA_SEMASI } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: buf.toString("base64"),
            },
          },
          { type: "text", text: "Bu nakliye faturasındaki alanları çıkar." },
        ],
      },
    ],
  } as any); // output_config SDK 0.110.0 tiplerinde henüz dar tanımlı

  const metinBlok = mesaj.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!metinBlok) throw new Error("Claude cevabında metin bloğu yok");

  const ham = JSON.parse(metinBlok.text) as FaturaAlanlari;

  // Konteynerleri normalize et ve geçersizleri at
  ham.konteynerler = (ham.konteynerler || [])
    .map(normalizeKonteyner)
    .filter(konteynerGecerliMi)
    .filter((k, i, arr) => arr.indexOf(k) === i);

  return ham;
}
```

- [ ] **Adım 3: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hata yok. `PDFParse` named export'tur; `import pdfParse from "pdf-parse"` **yazma** — pdf-parse 2.x'te default export yoktur ve çalışma anında `undefined is not a function` verir.

- [ ] **Adım 4: Gerçek bir PDF ile doğrula**

Bir örnek e-Arşiv fatura PDF'i gerekiyor. VPS'te kayıtlı PDF **yok** (eski poller PDF saklamıyordu), bu yüzden iki yoldan biri:

**Yol A (önerilen):** Gmail'de `noreply@sysmond.com.tr`'den gelen bir "E-Arşiv Fatura" mailini aç, PDF ekini indir ve `uploads/nakliye/ornek.pdf` olarak kaydet.

**Yol B:** VPS'ten IMAP ile bir tane çek:

```bash
mkdir -p uploads/nakliye
ssh root@167.235.252.49 'python3 -c "
import imaplib, email, ssl, sys
d={}
for l in open(\"/var/www/cnctracker/.env\", encoding=\"utf-8\", errors=\"ignore\"):
    l=l.strip()
    if l and not l.startswith(\"#\") and \"=\" in l:
        k,v=l.split(\"=\",1); d[k.strip()]=v.strip()
M=imaplib.IMAP4_SSL(\"imap.gmail.com\", ssl_context=ssl.create_default_context())
M.login(d[\"GMAIL_USER\"], d[\"GMAIL_APP_PASSWORD\"]); M.select(\"INBOX\")
t,data=M.search(None,\"FROM\",\"noreply@sysmond.com.tr\")
ids=data[0].split()
t,md=M.fetch(ids[-1],\"(RFC822)\")
msg=email.message_from_bytes(md[0][1])
for p in msg.walk():
    if p.get_content_type()==\"application/pdf\":
        sys.stdout.buffer.write(p.get_payload(decode=True)); break
"' > uploads/nakliye/ornek.pdf
ls -la uploads/nakliye/ornek.pdf
```

Beklenen: sıfırdan büyük bir PDF dosyası. Sonra:

```bash
cat > ._atest.ts <<'EOF'
import "dotenv/config";
import fs from "fs";
import { pdfMetniCikar, faturaAnalizEt } from "./server/nakliye/faturaAnaliz";
import { faturaDogrula } from "./server/nakliye/dogrulama";

(async () => {
  const buf = fs.readFileSync("uploads/nakliye/ornek.pdf");
  const ham = await pdfMetniCikar(buf);
  console.log("ham metin uzunlugu:", ham.length);
  const alanlar = await faturaAnalizEt(buf);
  console.log(JSON.stringify(alanlar, null, 2));
  const d = faturaDogrula(alanlar, ham);
  console.log("gecerli:", d.gecerli, "| hatalar:", d.hatalar);
  process.exit(0);
})();
EOF
npx tsx ._atest.ts; rm -f ._atest.ts
```

Beklenen: alanlar dolu, `gecerli: true`, `hatalar: []`. Aritmetik tutmalı: `matrah + kdv_tutari − tevkifat_tutari === odenecek_tutar`.

- [ ] **Adım 5: Commit**

```bash
git add server/nakliye/faturaAnaliz.ts server/nakliye/dogrulama.ts
git commit -m "feat(nakliye): pdf fatura analizi (claude) ve iki katmanli dogrulama"
```

---

## Görev 5: Fatura yükleme ucu

**Dosyalar:**
- Değiştir: `server/routes.ts` (yeni uç ekle + `uploadNakliye` multer writer)

**Arayüzler:**
- Tüketir: Görev 4'ten `pdfMetniCikar`, `faturaAnalizEt`, `faturaDogrula`; Görev 1'den storage metotları
- Üretir: `POST /api/nakliye/fatura-yukle` (multipart, alan adı `file`)

- [ ] **Adım 1: multer writer'ı `server/routes.ts` içindeki diğer writer'ların yanına ekle**

Mevcut `uploadRuhsat`, `uploadDuf` vb. tanımlarının hemen altına:

```typescript
// Nakliye e-Arşiv fatura PDF'leri
const uploadNakliye = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dizin = path.join(process.cwd(), "uploads", "nakliye");
      fs.mkdirSync(dizin, { recursive: true });
      cb(null, dizin);
    },
    filename: (_req, file, cb) => {
      // Geçici ad; analiz sonrası fatura numarasıyla yeniden adlandırılır
      cb(null, `gecici-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
```

> `multer`, `path`, `fs` dosyanın başında zaten import edilmiş durumda.

- [ ] **Adım 2: Ucu ekle**

`registerRoutes` içinde, nakliye uçlarının yanına:

```typescript
  // Nakliye e-Arşiv faturası yükleme (VPS gmail_poller.py buraya POST eder)
  app.post("/api/nakliye/fatura-yukle", uploadNakliye.single("file"), async (req, res) => {
    const gecici = req.file?.path;
    try {
      if (!req.file) return res.status(400).json({ error: "Dosya yüklenmedi" });

      const buf = fs.readFileSync(req.file.path);
      const hamMetin = await pdfMetniCikar(buf);
      const alanlar = await faturaAnalizEt(buf);
      const dogrulama = faturaDogrula(alanlar, hamMetin);

      if (!alanlar.fatura_no) {
        fs.unlinkSync(req.file.path);
        return res.status(422).json({
          error: "Fatura numarası okunamadı",
          hatalar: dogrulama.hatalar,
        });
      }

      // Dedup — aynı fatura ikinci kez işlenmez
      const mevcut = await storage.getNakliyeFaturasiByNo(alanlar.fatura_no);
      if (mevcut) {
        fs.unlinkSync(req.file.path);
        return res.json({ success: true, already_exists: true, id: mevcut.id, faturaNo: mevcut.faturaNo });
      }

      // PDF'i fatura numarasıyla yeniden adlandır
      const guvenliAd = alanlar.fatura_no.replace(/[^A-Za-z0-9._-]/g, "_");
      const kalici = path.join(process.cwd(), "uploads", "nakliye", `${guvenliAd}.pdf`);
      fs.renameSync(req.file.path, kalici);

      const kayit = await storage.insertNakliyeFaturasi({
        kaynak: "earsiv",
        faturaNo: alanlar.fatura_no,
        faturaTarihi: alanlar.fatura_tarihi,
        tedarikciUnvan: alanlar.tedarikci_unvan,
        tedarikciVkn: alanlar.tedarikci_vkn,
        musteriFirmaAdi: alanlar.musteri_firma_adi,
        paraBirimi: alanlar.para_birimi || "TRY",
        kur: "1",
        matrah: alanlar.matrah !== null ? String(alanlar.matrah) : null,
        kdvOrani: alanlar.kdv_orani,
        kdvTutari: alanlar.kdv_tutari !== null ? String(alanlar.kdv_tutari) : null,
        tevkifatTutari: alanlar.tevkifat_tutari !== null ? String(alanlar.tevkifat_tutari) : null,
        odenecekTutar: alanlar.odenecek_tutar !== null ? String(alanlar.odenecek_tutar) : null,
        konteynerler: alanlar.konteynerler.join(", "),
        aciklama: alanlar.aciklama,
        pdfYolu: `uploads/nakliye/${guvenliAd}.pdf`,
        hamMetin,
        llmJson: JSON.stringify(alanlar),
        durum: dogrulama.gecerli ? "ayristirildi" : "dogrulama_hatasi",
        hataMesaji: dogrulama.gecerli ? null : dogrulama.hatalar.join(" | "),
      });

      res.json({
        success: true,
        id: kayit.id,
        faturaNo: kayit.faturaNo,
        durum: kayit.durum,
        hatalar: dogrulama.hatalar,
      });
    } catch (error) {
      if (gecici && fs.existsSync(gecici)) fs.unlinkSync(gecici);
      console.error("Nakliye fatura yükleme hatası:", error);
      const mesaj = error instanceof Error ? error.message : "Bilinmeyen hata";
      res.status(500).json({ error: `Fatura işlenemedi: ${mesaj}` });
    }
  });
```

- [ ] **Adım 3: Import satırlarını ekle**

`server/routes.ts` başına:

```typescript
import { pdfMetniCikar, faturaAnalizEt } from "./nakliye/faturaAnaliz";
import { faturaDogrula } from "./nakliye/dogrulama";
```

- [ ] **Adım 4: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hata yok.

- [ ] **Adım 5: Ucu canlıda doğrula**

Sunucuyu başlat (`npm run dev`) ve başka bir terminalde:

```bash
curl -s -X POST http://localhost:5000/api/nakliye/fatura-yukle \
  -F "file=@uploads/nakliye/ornek.pdf" | head -c 500
```

Beklenen: `{"success":true,"id":"...","faturaNo":"GIB...","durum":"ayristirildi","hatalar":[]}`

Aynı komutu **ikinci kez** çalıştır — beklenen: `"already_exists":true`.

DB doğrulaması:
```bash
psql "$DATABASE_URL" -t -A -F'|' -c "SELECT fatura_no, durum, matrah, kdv_tutari, tevkifat_tutari, odenecek_tutar, konteynerler FROM nakliye_faturalari;"
```

- [ ] **Adım 6: Commit**

```bash
git add server/routes.ts
git commit -m "feat(nakliye): e-arsiv fatura yukleme ucu (pdf -> claude -> dogrulama)"
```

---

## Görev 6: Paraşüt'e alış faturası yazma

**Dosyalar:**
- Oluştur: `server/nakliye/parasutYazma.ts`

**Arayüzler:**
- Tüketir: Görev 3'ten `parasutIstek`, `jsonApiCoz`, `paraBirimiParasut`
- Üretir: `parasutaYaz(fatura: NakliyeFaturasi): Promise<{ purchaseBillId: string; mevcuttu: boolean }>`

- [ ] **Adım 1: `server/nakliye/parasutYazma.ts` dosyasını oluştur**

```typescript
import type { NakliyeFaturasi } from "@shared/schema";
import { parasutIstek, jsonApiCoz } from "../parasut/client";
import { paraBirimiParasut } from "../parasut/hesap";

/** VKN ile Paraşüt cari kartını bulur. Bulamazsa undefined — cari YARATILMAZ. */
async function tedarikciBul(vkn: string): Promise<string | undefined> {
  const cevap = await parasutIstek<any>("/contacts", {
    query: { "filter[tax_number]": vkn, "page[size]": "5" },
  });
  const { veri } = jsonApiCoz(cevap);
  return veri[0]?.id;
}

/**
 * Fatura Paraşüt'te zaten var mı?
 * purchase_bills GET'te filter[invoice_no] YOK — sadece issue_date, due_date,
 * supplier_id, item_type, spender_id var. Bu yüzden tarih aralığı çekilip
 * istemci tarafında elenir.
 */
async function parasuttaVarMi(faturaNo: string, faturaTarihi: string): Promise<string | undefined> {
  const t = new Date(`${faturaTarihi}T00:00:00Z`);
  const bas = new Date(t.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
  const bit = new Date(t.getTime() + 7 * 86400_000).toISOString().slice(0, 10);

  for (let sayfa = 1; sayfa <= 10; sayfa++) {
    const cevap = await parasutIstek<any>("/purchase_bills", {
      query: {
        "filter[issue_date]": `${bas},${bit}`,
        "page[size]": "25",
        "page[number]": String(sayfa),
      },
    });
    const { veri } = jsonApiCoz(cevap);
    const bulunan = veri.find((d: any) => String(d.attributes?.invoice_no || "") === faturaNo);
    if (bulunan) return bulunan.id;
    if (veri.length < 25) break;
  }
  return undefined;
}

/**
 * e-Arşiv faturasını Paraşüt'e alış faturası olarak yazar.
 * Üç katmanlı dedup'ın 2. ve 3. katmanı burada (1. katman faturaNo unique index).
 *
 * Geçiş dönemi güvenliği: muhasebeci aynı faturayı elle girmişse yeni kayıt
 * AÇILMAZ, mevcut kaydın id'si döndürülür.
 */
export async function parasutaYaz(
  fatura: NakliyeFaturasi,
): Promise<{ purchaseBillId: string; mevcuttu: boolean }> {
  if (!fatura.faturaTarihi) throw new Error("faturaTarihi boş — Paraşüt'e yazılamaz");
  if (!fatura.tedarikciVkn) throw new Error("tedarikciVkn boş — cari bulunamaz");

  const mevcutId = await parasuttaVarMi(fatura.faturaNo, fatura.faturaTarihi);
  if (mevcutId) return { purchaseBillId: mevcutId, mevcuttu: true };

  const supplierId = await tedarikciBul(fatura.tedarikciVkn);
  if (!supplierId) {
    throw new Error(
      `Paraşüt'te ${fatura.tedarikciVkn} VKN'li cari bulunamadı. ` +
      `Cari otomatik yaratılmaz — Paraşüt'te elle açılmalı.`,
    );
  }

  const matrah = Number(fatura.matrah ?? 0);
  const kdvOrani = fatura.kdvOrani ?? 0;
  const tevkifat = Number(fatura.tevkifatTutari ?? 0);
  const kdv = Number(fatura.kdvTutari ?? 0);
  // Gelen faturada tevkifat KORUNUR (giden faturadan farklı olarak).
  const tevkifatOrani = kdv > 0 ? Math.round((tevkifat / kdv) * 100) : 0;

  const pdfLink = fatura.pdfYolu
    ? ` · PDF: ${process.env.APP_BASE_URL || "http://localhost:5000"}/${fatura.pdfYolu}`
    : "";

  const govde = {
    data: {
      type: "purchase_bills",
      attributes: {
        item_type: "purchase_bill",
        description: `${fatura.aciklama || "Nakliye bedeli"}${pdfLink}`,
        issue_date: fatura.faturaTarihi,
        due_date: fatura.faturaTarihi,
        invoice_no: fatura.faturaNo,
        currency: paraBirimiParasut(fatura.paraBirimi || "TRY"),
        exchange_rate: Number(fatura.kur ?? 1),
        withholding_rate: 0,
      },
      relationships: {
        supplier: { data: { id: supplierId, type: "contacts" } },
        details: {
          data: [
            {
              type: "purchase_bill_details",
              attributes: {
                quantity: 1,
                unit_price: matrah,
                vat_rate: kdvOrani,
                vat_withholding_rate: tevkifatOrani,
                description: fatura.aciklama || "Nakliye bedeli",
              },
              relationships: {
                product: { data: { id: process.env.PARASUT_NAKLIYE_URUN_ID!, type: "products" } },
              },
            },
          ],
        },
      },
    },
  };

  const cevap = await parasutIstek<any>("/purchase_bills#detailed", {
    method: "POST",
    body: govde,
  });

  const id = cevap?.data?.id;
  if (!id) throw new Error("Paraşüt cevabında purchase_bill id yok");
  return { purchaseBillId: String(id), mevcuttu: false };
}
```

- [ ] **Adım 2: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hata yok.

- [ ] **Adım 3: Dedup mantığını canlıda doğrula (YAZMADAN)**

Önce sadece "var mı" kısmını test et — gerçek yazma yapma:

```bash
cat > ._dtest.ts <<'EOF'
import "dotenv/config";
import { parasutIstek, jsonApiCoz } from "./server/parasut/client";

(async () => {
  // Bilinen bir faturayi ara: GIB2026000000075, tarih 2026-06-26
  const cevap = await parasutIstek<any>("/purchase_bills", {
    query: { "filter[issue_date]": "2026-06-19,2026-07-03", "page[size]": "25" },
  });
  const { veri } = jsonApiCoz(cevap);
  const bulunan = veri.find((d: any) => d.attributes?.invoice_no === "GIB2026000000075");
  console.log("bulundu mu:", !!bulunan, "| id:", bulunan?.id);
  console.log("taranan kayit:", veri.length);
  process.exit(0);
})();
EOF
npx tsx ._dtest.ts; rm -f ._dtest.ts
```

Beklenen: `bulundu mu: true` ve bir id. Bu, dedup'ın çalıştığını kanıtlar — elle girilmiş fatura yakalanıyor.

- [ ] **Adım 4: Gerçek yazmayı TEK bir test faturasıyla dene**

> ⚠️ Bu adım Paraşüt'te **gerçek kayıt oluşturur**. Görev 5'te yüklediğin faturayı kullan; sonucu Paraşüt arayüzünden kontrol edip gerekiyorsa sil.

```bash
cat > ._wtest.ts <<'EOF'
import "dotenv/config";
import { storage } from "./server/storage";
import { parasutaYaz } from "./server/nakliye/parasutYazma";

(async () => {
  const hepsi = await storage.getNakliyeFaturalari("ayristirildi");
  if (hepsi.length === 0) { console.log("ayristirilmis fatura yok"); process.exit(0); }
  const f = hepsi[0];
  console.log("yazilacak:", f.faturaNo, f.faturaTarihi, f.matrah);
  const r = await parasutaYaz(f);
  console.log("sonuc:", r);
  process.exit(0);
})();
EOF
npx tsx ._wtest.ts; rm -f ._wtest.ts
```

Beklenen: `{ purchaseBillId: "...", mevcuttu: true }` (fatura zaten elle girilmişse) veya `mevcuttu: false` (yeni yazıldıysa). Paraşüt arayüzünde kontrol et.

- [ ] **Adım 5: Commit**

```bash
git add server/nakliye/parasutYazma.ts
git commit -m "feat(nakliye): parasut'e alis faturasi yazma + uc katmanli dedup"
```

---

## Görev 7: Paraşüt'ten alış faturalarını okuma

**Dosyalar:**
- Oluştur: `server/nakliye/parasutOkuma.ts`

**Arayüzler:**
- Tüketir: Görev 3'ten `parasutIstek`, `jsonApiCoz`, `iliskiId`, `parasutMatrahTuret`, `paraBirimiCnc`; Görev 4'ten `normalizeKonteyner`, `konteynerGecerliMi`
- Üretir: `parasuttanCek(gunSayisi?: number): Promise<{ yeni: number; atlanan: number }>`

- [ ] **Adım 1: `server/nakliye/parasutOkuma.ts` dosyasını oluştur**

```typescript
import { storage } from "../storage";
import { parasutIstek, jsonApiCoz, iliskiId } from "../parasut/client";
import { parasutMatrahTuret, paraBirimiCnc } from "../parasut/hesap";
import { normalizeKonteyner, konteynerGecerliMi } from "./dogrulama";

const KONTEYNER_REGEX = /([A-Z]{4})\s*(\d{7})/g;

/** Serbest metinden konteyner numaralarını çıkarır. */
function konteynerCikar(metin: string): string[] {
  const bulunanlar = new Set<string>();
  const t = (metin || "").toUpperCase();
  let m: RegExpExecArray | null;
  KONTEYNER_REGEX.lastIndex = 0;
  while ((m = KONTEYNER_REGEX.exec(t)) !== null) {
    const k = normalizeKonteyner(m[1] + m[2]);
    if (konteynerGecerliMi(k)) bulunanlar.add(k);
  }
  return Array.from(bulunanlar);
}

/**
 * Paraşüt'teki alış faturalarını çeker ve nakliye olanları
 * nakliye_faturalari tablosuna yazar.
 *
 * "Nakliye faturası" tanımı: açıklama veya kalem açıklamalarında en az bir
 * konteyner numarası geçen fatura. Konteyner yoksa atlanır — bu, ofis/kira
 * gibi alakasız alış faturalarını dışarıda bırakır.
 */
export async function parasuttanCek(
  gunSayisi = 60,
): Promise<{ yeni: number; atlanan: number }> {
  const bugun = new Date();
  const bas = new Date(bugun.getTime() - gunSayisi * 86400_000).toISOString().slice(0, 10);
  const bit = bugun.toISOString().slice(0, 10);

  let yeni = 0;
  let atlanan = 0;

  for (let sayfa = 1; sayfa <= 40; sayfa++) {
    const cevap = await parasutIstek<any>("/purchase_bills", {
      query: {
        "filter[issue_date]": `${bas},${bit}`,
        "page[size]": "25",
        "page[number]": String(sayfa),
        include: "details,supplier,active_e_document",
        sort: "-issue_date",
      },
    });
    const { veri, iliskili } = jsonApiCoz(cevap);
    if (veri.length === 0) break;

    for (const d of veri) {
      const a = d.attributes || {};
      const faturaNo = String(a.invoice_no || "").trim();
      if (!faturaNo) { atlanan++; continue; }

      // Kalem açıklamalarını topla
      const detayIdler: string[] = (d.relationships?.details?.data || []).map((x: any) => x.id);
      const kalemMetinleri = detayIdler
        .map((id) => iliskili.get(`purchase_bill_details:${id}`)?.attributes?.description || "")
        .join(" ");
      const tumMetin = `${a.description || ""} ${kalemMetinleri}`;

      const konteynerler = konteynerCikar(tumMetin);
      if (konteynerler.length === 0) { atlanan++; continue; } // nakliye değil

      const mevcut = await storage.getNakliyeFaturasiByNo(faturaNo);
      if (mevcut) {
        // Paraşüt id'si henüz bağlanmadıysa bağla
        if (!mevcut.parasutPurchaseBillId) {
          await storage.updateNakliyeFaturasi(mevcut.id, {
            parasutPurchaseBillId: String(d.id),
            durum: mevcut.durum === "ayristirildi" ? "parasutta" : mevcut.durum,
          });
        }
        atlanan++;
        continue;
      }

      const netTotal = Number(a.net_total ?? 0);
      const totalVat = Number(a.total_vat ?? 0);
      const tevkifat = Number(a.total_vat_withholding ?? 0);
      const matrah = parasutMatrahTuret(netTotal, totalVat, tevkifat);

      const supplierId = iliskiId(d, "supplier");
      const supplier = supplierId ? iliskili.get(`contacts:${supplierId}`) : undefined;

      const eBelgeId = iliskiId(d, "active_e_document");
      const eBelge = eBelgeId ? iliskili.get(`e_invoices:${eBelgeId}`) : undefined;

      // KDV oranı: ilk kalemden; yoksa matrahtan türet
      const ilkKalem = detayIdler[0]
        ? iliskili.get(`purchase_bill_details:${detayIdler[0]}`)
        : undefined;
      const kdvOrani = ilkKalem?.attributes?.vat_rate != null
        ? Number(ilkKalem.attributes.vat_rate)
        : (matrah > 0 ? Math.round((totalVat / matrah) * 100) : 0);

      await storage.insertNakliyeFaturasi({
        kaynak: "efatura",
        faturaNo,
        faturaTarihi: a.issue_date || null,
        tedarikciUnvan: supplier?.attributes?.name || null,
        tedarikciVkn: supplier?.attributes?.tax_number || null,
        musteriFirmaAdi: null,
        paraBirimi: paraBirimiCnc(a.currency || "TRL"),
        kur: String(a.exchange_rate ?? 1),
        matrah: String(matrah),
        kdvOrani,
        kdvTutari: String(totalVat),
        tevkifatTutari: String(tevkifat),
        odenecekTutar: String(netTotal),
        konteynerler: konteynerler.join(", "),
        aciklama: (a.description || "").slice(0, 500) || null,
        pdfYolu: null,
        parasutPurchaseBillId: String(d.id),
        parasutEttn: eBelge?.attributes?.uuid || null,
        hamMetin: null,
        llmJson: null,
        durum: "parasutta",
        hataMesaji: null,
      });
      yeni++;
    }

    if (veri.length < 25) break;
  }

  return { yeni, atlanan };
}
```

- [ ] **Adım 2: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hata yok.

- [ ] **Adım 3: Canlıda doğrula**

```bash
cat > ._rtest.ts <<'EOF'
import "dotenv/config";
import { parasuttanCek } from "./server/nakliye/parasutOkuma";
(async () => {
  const r = await parasuttanCek(90);
  console.log("sonuc:", r);
  process.exit(0);
})();
EOF
npx tsx ._rtest.ts; rm -f ._rtest.ts
```

Beklenen: `{ yeni: <sayı>, atlanan: <sayı> }`. Konteyner içermeyen faturalar `atlanan`a düşmeli.

DB kontrolü:
```bash
psql "$DATABASE_URL" -t -A -F'|' -c "SELECT kaynak, count(*), count(konteynerler) FROM nakliye_faturalari GROUP BY kaynak;"
```

- [ ] **Adım 4: Commit**

```bash
git add server/nakliye/parasutOkuma.ts
git commit -m "feat(nakliye): parasut alis faturalarini cekme (e-fatura kanali)"
```

---

## Görev 8: Eşleştirme motoru

**Dosyalar:**
- Oluştur: `server/nakliye/eslestirme.ts`

**Arayüzler:**
- Tüketir: Görev 2'den `firmaAdiBenzerligi`; Görev 4'ten `normalizeKonteyner`; Görev 1'den storage metotları; mevcut `storage.getGumrukHouseNoVerileri()`
- Üretir: `eslestirmeCalistir(): Promise<{ taranan: number; eslesen: number; kuyruk: number }>`

- [ ] **Adım 1: `server/nakliye/eslestirme.ts` dosyasını oluştur**

```typescript
import { storage } from "../storage";
import { firmaAdiBenzerligi } from "@shared/turkceNormalize";
import { normalizeKonteyner } from "./dogrulama";
import type { NakliyeFaturasi } from "@shared/schema";

const FIRMA_ESIK = 50; // bu skorun altındaki firma benzerliği kırıcı sayılmaz

/**
 * Konteyner numarasıyla beyanname eşleştirir.
 *
 * Sıra:
 *   1) Konteyner → gumruk_verileri.house_no (normalize)
 *   2) Tek aday → skor 90, kaynak "konteyner"
 *   3) Çok aday → musteriFirmaAdi ile firma_unvan benzerliği; tek kalırsa
 *      skor 95, kaynak "konteyner+firma"
 *   4) Firma kırmazsa → fatura tarihine en yakın tescil, skor 60 (kuyrukta
 *      onay bekler)
 *   5) Bir fatura >1 beyannameye düşerse otomatik bölüştürme YAPILMAZ;
 *      tüm eşleşmeler skor 60 ile kaydedilir ve kuyruğa gider.
 */
export async function eslestirmeCalistir(): Promise<{
  taranan: number; eslesen: number; kuyruk: number;
}> {
  const faturalar = (await storage.getNakliyeFaturalari()).filter(
    (f) => f.durum === "ayristirildi" || f.durum === "parasutta",
  );
  if (faturalar.length === 0) return { taranan: 0, eslesen: 0, kuyruk: 0 };

  // house_no dolu gümrük kayıtları — Map<normalize konteyner, kayıtlar[]>
  const gumrukVerileri = await storage.getGumrukHouseNoVerileri();
  const gumrukMap = new Map<string, any[]>();
  for (const g of gumrukVerileri) {
    if (!g.houseNo) continue;
    const k = normalizeKonteyner(g.houseNo);
    if (k.length < 8) continue;
    if (!gumrukMap.has(k)) gumrukMap.set(k, []);
    gumrukMap.get(k)!.push(g);
  }

  let eslesen = 0;
  let kuyruk = 0;

  for (const f of faturalar) {
    const konteynerler = (f.konteynerler || "")
      .split(",")
      .map((k) => normalizeKonteyner(k.trim()))
      .filter((k) => k.length >= 8);

    if (konteynerler.length === 0) { kuyruk++; continue; }

    const bulunanDosyalar = new Set<string>();
    let herhangiEslesme = false;

    for (const kont of konteynerler) {
      const adaylar = gumrukMap.get(kont);
      if (!adaylar || adaylar.length === 0) continue;

      let secilen = adaylar[0];
      let skor = 90;
      let kaynak = "konteyner";

      if (adaylar.length > 1) {
        // Firma adı ile kır
        if (f.musteriFirmaAdi) {
          const puanli = adaylar
            .map((g) => ({ g, p: firmaAdiBenzerligi(f.musteriFirmaAdi!, g.firmaUnvan || "") }))
            .sort((a, b) => b.p - a.p);
          if (puanli[0].p >= FIRMA_ESIK && (puanli.length === 1 || puanli[0].p > puanli[1].p)) {
            secilen = puanli[0].g;
            skor = 95;
            kaynak = "konteyner+firma";
          } else {
            secilen = tarihEnYakin(adaylar, f.faturaTarihi);
            skor = 60;
          }
        } else {
          secilen = tarihEnYakin(adaylar, f.faturaTarihi);
          skor = 60;
        }
      }

      await storage.insertEslesme({
        faturaId: f.id,
        gumrukVerisiId: secilen.id,
        konteyner: kont,
        skor,
        kaynak,
        durum: skor >= 90 ? "otomatik" : "otomatik",
      });
      if (secilen.dosyaNo) bulunanDosyalar.add(secilen.dosyaNo);
      herhangiEslesme = true;
    }

    if (!herhangiEslesme) { kuyruk++; continue; }

    // Bir fatura birden fazla beyannameye düştüyse otomatik ilerletme
    if (bulunanDosyalar.size > 1) {
      await storage.updateNakliyeFaturasi(f.id, {
        durum: "eslesti",
        hataMesaji: `${bulunanDosyalar.size} farklı beyannameye düştü — elle bölüştürme gerekli`,
      });
      kuyruk++;
    } else {
      await storage.updateNakliyeFaturasi(f.id, { durum: "eslesti", hataMesaji: null });
      eslesen++;
    }
  }

  return { taranan: faturalar.length, eslesen, kuyruk };
}

/** Fatura tarihine en yakın tescil tarihli gümrük kaydını seçer. */
function tarihEnYakin(adaylar: any[], faturaTarihi: string | null): any {
  if (!faturaTarihi) return adaylar[0];
  const hedef = gunSayisi(faturaTarihi);
  if (hedef === null) return adaylar[0];

  let en = adaylar[0];
  let enFark = Number.MAX_SAFE_INTEGER;
  for (const g of adaylar) {
    const t = gunSayisi(g.tescilTarihi);
    if (t === null) continue;
    const fark = Math.abs(t - hedef);
    if (fark < enFark) { enFark = fark; en = g; }
  }
  return en;
}

/**
 * Tarihi epoch'tan gün sayısına çevirir. YYYY-MM-DD ve DD.MM.YYYY destekli.
 * new Date(...) KULLANILMAZ — timezone kayması hatası (commit c897dff).
 */
function gunSayisi(tarih: string | null | undefined): number | null {
  if (!tarih) return null;
  let y: number, a: number, g: number;
  if (/^\d{4}-\d{2}-\d{2}/.test(tarih)) {
    [y, a, g] = tarih.slice(0, 10).split("-").map(Number);
  } else if (/^\d{2}\.\d{2}\.\d{4}/.test(tarih)) {
    [g, a, y] = tarih.slice(0, 10).split(".").map(Number);
  } else {
    return null;
  }
  if (!y || !a || !g) return null;
  return Math.floor(Date.UTC(y, a - 1, g) / 86400_000);
}
```

- [ ] **Adım 2: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hata yok. `getGumrukHouseNoVerileri()` dönüş tipi `any[]` değilse `secilen.dosyaNo`/`firmaUnvan`/`tescilTarihi` alanları için tip hatası çıkabilir — o durumda dönüş tipini `GumrukVerisi[]` olarak import edip `any` yerine kullan.

- [ ] **Adım 3: Canlıda doğrula**

```bash
cat > ._etest.ts <<'EOF'
import "dotenv/config";
import { eslestirmeCalistir } from "./server/nakliye/eslestirme";
(async () => {
  console.log(await eslestirmeCalistir());
  process.exit(0);
})();
EOF
npx tsx ._etest.ts; rm -f ._etest.ts
```

Beklenen: `{ taranan: N, eslesen: M, kuyruk: K }`.

DB kontrolü:
```bash
psql "$DATABASE_URL" -t -A -F'|' -c "SELECT e.kaynak, e.skor, count(*) FROM nakliye_fatura_eslesme e GROUP BY 1,2 ORDER BY 2 DESC;"
```

- [ ] **Adım 4: Commit**

```bash
git add server/nakliye/eslestirme.ts
git commit -m "feat(nakliye): konteyner + firma adi tabanli beyanname eslestirme"
```

---

## Görev 9: Satış faturası taslağı

**Dosyalar:**
- Oluştur: `server/nakliye/satisFaturasi.ts`

**Arayüzler:**
- Tüketir: Görev 3'ten `parasutIstek`, `jsonApiCoz`, `paraBirimiParasut`; Görev 1'den storage metotları
- Üretir: `tamamlananDosyalariFaturala(): Promise<{ olusturulan: number; kuyruk: number }>`

- [ ] **Adım 1: `server/nakliye/satisFaturasi.ts` dosyasını oluştur**

```typescript
import { storage } from "../storage";
import { parasutIstek, jsonApiCoz } from "../parasut/client";
import { paraBirimiParasut } from "../parasut/hesap";
import { normalizeKonteyner } from "./dogrulama";
import type { NakliyeFaturasi } from "@shared/schema";

const MARJ = 1.20; // gelen matrahın %20 fazlası

/** VKN ile müşteri cari kartını bulur. Bulamazsa undefined — cari YARATILMAZ. */
async function musteriBul(vkn: string): Promise<string | undefined> {
  const cevap = await parasutIstek<any>("/contacts", {
    query: { "filter[tax_number]": vkn, "page[size]": "5" },
  });
  const { veri } = jsonApiCoz(cevap);
  return veri[0]?.id;
}

/**
 * Beyanname dosya numarasını Paraşüt etiketi olarak bulur; yoksa oluşturur.
 * Böylece Paraşüt arayüzünde de dosya bazlı filtreleme mümkün olur.
 * tags GET'te ada göre filtre yoktur — sayfalanarak taranır.
 * Hata durumunda undefined döner; etiket faturanın kesilmesini ENGELLEMEZ.
 */
async function etiketBulVeyaOlustur(dosyaNo: string): Promise<string | undefined> {
  try {
    for (let sayfa = 1; sayfa <= 20; sayfa++) {
      const cevap = await parasutIstek<any>("/tags", {
        query: { "page[size]": "25", "page[number]": String(sayfa) },
      });
      const { veri } = jsonApiCoz(cevap);
      const bulunan = veri.find((t: any) => String(t.attributes?.name || "") === dosyaNo);
      if (bulunan) return String(bulunan.id);
      if (veri.length < 25) break;
    }
    const yeni = await parasutIstek<any>("/tags", {
      method: "POST",
      body: { data: { type: "tags", attributes: { name: dosyaNo } } },
    });
    return yeni?.data?.id ? String(yeni.data.id) : undefined;
  } catch (e) {
    console.error(`Etiket oluşturulamadı (${dosyaNo}):`, e instanceof Error ? e.message : e);
    return undefined;
  }
}

/**
 * Eşleşen faturaları beyanname bazında gruplar; beyannamenin konteyner
 * sayısı ile eşleşen ayrık konteyner sayısı tuttuğunda Paraşüt'e satış
 * faturası TASLAĞI yazar.
 *
 * Resmileştirme YAPILMAZ — e_invoices/e_archives çağrılmaz.
 * konteyner_sayisi boş/0 olan beyanname otomatik tetiklenmez (sayaç yoksa
 * "tamamlandı" kararı verilemez); kuyrukta bekler.
 */
export async function tamamlananDosyalariFaturala(): Promise<{
  olusturulan: number; kuyruk: number;
}> {
  const faturalar = (await storage.getNakliyeFaturalari()).filter((f) => f.durum === "eslesti");
  if (faturalar.length === 0) return { olusturulan: 0, kuyruk: 0 };

  const eslesmeler = await storage.getEslesmelerByFatura(faturalar.map((f) => f.id));
  if (eslesmeler.length === 0) return { olusturulan: 0, kuyruk: 0 };

  // gumrukVerisiId → gümrük kaydı (N+1 önleme: tek sorgu + Map)
  const gumrukIdler = Array.from(new Set(eslesmeler.map((e) => e.gumrukVerisiId!).filter(Boolean)));
  const gumrukKayitlari = await storage.getGumrukVerileriByIds(gumrukIdler);
  const gumrukMap = new Map(gumrukKayitlari.map((g) => [g.id, g]));

  const faturaMap = new Map<string, NakliyeFaturasi>(faturalar.map((f) => [f.id, f]));

  // dosyaNo → { gumruk, faturaIdler:Set, konteynerler:Set }
  const gruplar = new Map<string, {
    gumruk: any; faturaIdler: Set<string>; konteynerler: Set<string>;
  }>();

  for (const e of eslesmeler) {
    const g = gumrukMap.get(e.gumrukVerisiId!);
    if (!g || !g.dosyaNo) continue;
    if (!gruplar.has(g.dosyaNo)) {
      gruplar.set(g.dosyaNo, { gumruk: g, faturaIdler: new Set(), konteynerler: new Set() });
    }
    const grup = gruplar.get(g.dosyaNo)!;
    grup.faturaIdler.add(e.faturaId!);
    if (e.konteyner) grup.konteynerler.add(normalizeKonteyner(e.konteyner));
  }

  let olusturulan = 0;
  let kuyruk = 0;

  for (const [dosyaNo, grup] of Array.from(gruplar.entries())) {
    const mevcut = await storage.getSatisFaturasiByDosyaNo(dosyaNo);
    if (mevcut) {
      // Taslak zaten var — yeni fatura eklendiyse revizyon gerekir
      for (const fid of Array.from(grup.faturaIdler)) {
        const f = faturaMap.get(fid);
        if (f && f.durum === "eslesti") {
          await storage.updateNakliyeFaturasi(fid, {
            durum: "revizyon_gerekli",
            hataMesaji: `${dosyaNo} için taslak zaten var — elle revizyon gerekli`,
          });
        }
      }
      kuyruk++;
      continue;
    }

    const beklenen = parseInt(String(grup.gumruk.konteynerSayisi || "0"), 10);
    if (!beklenen || beklenen <= 0) { kuyruk++; continue; }        // sayaç yok
    if (grup.konteynerler.size < beklenen) { kuyruk++; continue; } // henüz tamamlanmadı

    const vkn = String(grup.gumruk.vn || "").replace(/\D/g, "");
    if (!vkn) { kuyruk++; continue; }

    let contactId: string | undefined;
    try {
      contactId = await musteriBul(vkn);
    } catch (e) {
      console.error(`Cari arama hatası (${dosyaNo}):`, e);
    }
    if (!contactId) {
      await storage.insertSatisFaturasi({
        gumrukDosyaNo: dosyaNo,
        parasutSalesInvoiceId: null,
        contactId: null,
        netToplam: null,
        paraBirimi: "TRY",
        kalemSayisi: grup.faturaIdler.size,
        durum: "hata",
        hataMesaji: `Paraşüt'te ${vkn} VKN'li müşteri bulunamadı — cari elle açılmalı`,
      });
      kuyruk++;
      continue;
    }

    const grupFaturalari = Array.from(grup.faturaIdler)
      .map((id) => faturaMap.get(id))
      .filter((f): f is NakliyeFaturasi => Boolean(f));

    const paraBirimi = grupFaturalari[0]?.paraBirimi || "TRY";

    const kalemler = grupFaturalari.map((f) => ({
      type: "sales_invoice_details",
      attributes: {
        quantity: 1,
        unit_price: Math.round(Number(f.matrah ?? 0) * MARJ * 100) / 100,
        vat_rate: f.kdvOrani ?? 0,
        // TEVKİFAT GİDEN FATURADA ASLA YOK — kodda sabit, gelenden türetilmez
        vat_withholding_rate: 0,
        description: `${f.tedarikciUnvan || "Nakliye"} · ${f.faturaNo} · ${f.konteynerler || ""}`.slice(0, 200),
      },
      relationships: {
        product: { data: { id: process.env.PARASUT_NAKLIYE_URUN_ID!, type: "products" } },
      },
    }));

    const netToplam = kalemler.reduce((t, k) => t + k.attributes.unit_price, 0);
    const bugun = new Date().toISOString().slice(0, 10);

    // Etiket best-effort: başarısız olursa fatura yine kesilir
    const etiketId = await etiketBulVeyaOlustur(dosyaNo);

    const govde: any = {
      data: {
        type: "sales_invoices",
        attributes: {
          item_type: "invoice",
          description: `Beyanname ${dosyaNo} nakliye hizmeti`,
          issue_date: bugun,
          due_date: bugun,
          currency: paraBirimiParasut(paraBirimi),
          exchange_rate: 1,
          // TEVKİFAT GİDEN FATURADA ASLA YOK — kodda sabit
          withholding_rate: 0,
        },
        relationships: {
          contact: { data: { id: contactId, type: "contacts" } },
          details: { data: kalemler },
          ...(etiketId
            ? { tags: { data: [{ id: etiketId, type: "tags" }] } }
            : {}),
        },
      },
    };

    try {
      const cevap = await parasutIstek<any>("/sales_invoices", { method: "POST", body: govde });
      const salesId = cevap?.data?.id;
      if (!salesId) throw new Error("Paraşüt cevabında sales_invoice id yok");

      await storage.insertSatisFaturasi({
        gumrukDosyaNo: dosyaNo,
        parasutSalesInvoiceId: String(salesId),
        contactId,
        netToplam: String(Math.round(netToplam * 100) / 100),
        paraBirimi,
        kalemSayisi: kalemler.length,
        durum: "taslak",
        hataMesaji: null,
      });

      for (const fid of Array.from(grup.faturaIdler)) {
        await storage.updateNakliyeFaturasi(fid, { durum: "faturalandi", hataMesaji: null });
      }
      olusturulan++;
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : "Bilinmeyen hata";
      await storage.insertSatisFaturasi({
        gumrukDosyaNo: dosyaNo,
        parasutSalesInvoiceId: null,
        contactId,
        netToplam: String(Math.round(netToplam * 100) / 100),
        paraBirimi,
        kalemSayisi: kalemler.length,
        durum: "hata",
        hataMesaji: mesaj.slice(0, 500),
      });
      kuyruk++;
    }
  }

  return { olusturulan, kuyruk };
}
```

- [ ] **Adım 2: `getGumrukVerileriByIds` metodunu storage'a ekle**

`IStorage` arayüzüne:

```typescript
  getGumrukVerileriByIds(ids: string[]): Promise<GumrukVerisi[]>;
```

`DatabaseStorage` sınıfına:

```typescript
  async getGumrukVerileriByIds(ids: string[]): Promise<GumrukVerisi[]> {
    if (ids.length === 0) return [];
    return await db.select().from(gumrukVerileri).where(inArray(gumrukVerileri.id, ids));
  }
```

- [ ] **Adım 3: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hata yok.

- [ ] **Adım 4: Kuru çalıştırma ile doğrula**

> ⚠️ Bu adım Paraşüt'te **gerçek satış faturası taslağı oluşturur**. Önce hangi dosyaların tetikleneceğini gör:

```bash
psql "$DATABASE_URL" -t -A -F'|' -c "
SELECT g.dosya_no, g.firma_unvan, g.konteyner_sayisi,
       count(DISTINCT e.konteyner) AS eslesen_konteyner
FROM nakliye_fatura_eslesme e
JOIN gumruk_verileri g ON g.id = e.gumruk_verisi_id
GROUP BY g.dosya_no, g.firma_unvan, g.konteyner_sayisi
HAVING g.konteyner_sayisi ~ '^[0-9]+\$'
   AND count(DISTINCT e.konteyner) >= g.konteyner_sayisi::int
ORDER BY 1;"
```

Beklenen: tetiklenecek dosyaların listesi. Sayı makul değilse (örn. 50+) önce eşleştirmeyi gözden geçir.

Sonra çalıştır:

```bash
cat > ._stest.ts <<'EOF'
import "dotenv/config";
import { tamamlananDosyalariFaturala } from "./server/nakliye/satisFaturasi";
(async () => {
  console.log(await tamamlananDosyalariFaturala());
  process.exit(0);
})();
EOF
npx tsx ._stest.ts; rm -f ._stest.ts
```

Paraşüt arayüzünde oluşan taslağı aç ve doğrula: **matrah gelen faturanın 1,20 katı**, KDV oranı gelenle aynı, **tevkifat yok**.

- [ ] **Adım 5: Commit**

```bash
git add server/nakliye/satisFaturasi.ts server/storage.ts
git commit -m "feat(nakliye): beyanname bazli satis faturasi taslagi (matrah x1.20, tevkifat yok)"
```

---

## Görev 10: Zamanlayıcı

**Dosyalar:**
- Oluştur: `server/nakliye/senkron.ts`
- Değiştir: `server/index.ts` (zamanlayıcıyı başlat)
- Değiştir: `server/routes.ts` (elle tetikleme ucu)

**Arayüzler:**
- Tüketir: Görev 7'den `parasuttanCek`, Görev 8'den `eslestirmeCalistir`, Görev 9'dan `tamamlananDosyalariFaturala`, Görev 6'dan `parasutaYaz`
- Üretir: `senkronCalistir(): Promise<SenkronSonuc>`, `senkronZamanlayiciBaslat(): void`

- [ ] **Adım 1: `server/nakliye/senkron.ts` dosyasını oluştur**

```typescript
import { storage } from "../storage";
import { parasutAktifMi } from "../parasut/client";
import { parasuttanCek } from "./parasutOkuma";
import { parasutaYaz } from "./parasutYazma";
import { eslestirmeCalistir } from "./eslestirme";
import { tamamlananDosyalariFaturala } from "./satisFaturasi";

export type SenkronSonuc = {
  cekilen: { yeni: number; atlanan: number };
  yazilan: { basarili: number; hatali: number };
  eslestirme: { taranan: number; eslesen: number; kuyruk: number };
  faturalama: { olusturulan: number; kuyruk: number };
};

let calisiyorMu = false;

/**
 * Boru hattının tamamını bir kez çalıştırır. Her adım idempotenttir;
 * kesinti olursa bir sonraki turda kaldığı yerden devam eder.
 */
export async function senkronCalistir(): Promise<SenkronSonuc> {
  if (calisiyorMu) {
    throw new Error("Senkron zaten çalışıyor");
  }
  calisiyorMu = true;
  try {
    // 1) Paraşüt'ten e-Fatura kanalını çek
    const cekilen = await parasuttanCek(60);

    // 2) Doğrulamayı geçmiş e-Arşiv faturalarını Paraşüt'e yaz
    const yazilacaklar = (await storage.getNakliyeFaturalari("ayristirildi"))
      .filter((f) => f.kaynak === "earsiv" && !f.parasutPurchaseBillId);
    let basarili = 0;
    let hatali = 0;
    for (const f of yazilacaklar) {
      try {
        const r = await parasutaYaz(f);
        await storage.updateNakliyeFaturasi(f.id, {
          parasutPurchaseBillId: r.purchaseBillId,
          durum: "parasutta",
          hataMesaji: r.mevcuttu ? "Paraşüt'te elle girilmiş kayda bağlandı" : null,
        });
        basarili++;
      } catch (e) {
        const mesaj = e instanceof Error ? e.message : "Bilinmeyen hata";
        await storage.updateNakliyeFaturasi(f.id, {
          durum: "hata",
          hataMesaji: mesaj.slice(0, 500),
        });
        hatali++;
      }
    }

    // 3) Eşleştir
    const eslestirme = await eslestirmeCalistir();

    // 4) Tamamlanan dosyaları faturala
    const faturalama = await tamamlananDosyalariFaturala();

    return { cekilen, yazilan: { basarili, hatali }, eslestirme, faturalama };
  } finally {
    calisiyorMu = false;
  }
}

/** 15 dakikada bir çalışan zamanlayıcı. Kimlik bilgisi yoksa hiç başlamaz. */
export function senkronZamanlayiciBaslat(): void {
  if (!parasutAktifMi()) {
    console.log("[nakliye-senkron] Paraşüt kimlik bilgileri eksik — zamanlayıcı başlatılmadı.");
    return;
  }
  const ARALIK_MS = 15 * 60 * 1000;
  console.log("[nakliye-senkron] Zamanlayıcı başlatıldı (15 dk).");

  const tur = async () => {
    try {
      const sonuc = await senkronCalistir();
      console.log("[nakliye-senkron]", JSON.stringify(sonuc));
    } catch (e) {
      console.error("[nakliye-senkron] hata:", e instanceof Error ? e.message : e);
    }
  };

  // İlk turu 60 saniye sonra çalıştır (sunucu açılışını bloklamamak için)
  setTimeout(tur, 60_000);
  setInterval(tur, ARALIK_MS);
}
```

- [ ] **Adım 2: `server/index.ts` içinde zamanlayıcıyı başlat**

Sunucu `listen` çağrısının hemen ardına:

```typescript
import { senkronZamanlayiciBaslat } from "./nakliye/senkron";
// ...
senkronZamanlayiciBaslat();
```

- [ ] **Adım 3: Elle tetikleme ucunu `server/routes.ts` içine ekle**

```typescript
  // Nakliye senkronunu elle tetikle (UI'daki "Şimdi çalıştır" butonu)
  app.post("/api/nakliye/senkron", async (_req, res) => {
    try {
      const sonuc = await senkronCalistir();
      res.json({ success: true, ...sonuc });
    } catch (error) {
      console.error("Nakliye senkron hatası:", error);
      const mesaj = error instanceof Error ? error.message : "Bilinmeyen hata";
      res.status(500).json({ error: mesaj });
    }
  });
```

Import ekle:
```typescript
import { senkronCalistir } from "./nakliye/senkron";
```

- [ ] **Adım 4: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hata yok.

- [ ] **Adım 5: Canlıda doğrula**

Sunucuyu başlat, log'da `[nakliye-senkron] Zamanlayıcı başlatıldı (15 dk).` satırını gör. Sonra:

```bash
curl -s -X POST http://localhost:5000/api/nakliye/senkron | head -c 600
```

Beklenen: `{"success":true,"cekilen":{...},"yazilan":{...},"eslestirme":{...},"faturalama":{...}}`

İkinci çağrıyı **hemen** yap — beklenen: `{"error":"Senkron zaten çalışıyor"}` (eşzamanlılık koruması çalışıyor).

- [ ] **Adım 6: Commit**

```bash
git add server/nakliye/senkron.ts server/index.ts server/routes.ts
git commit -m "feat(nakliye): 15 dakikalik senkron zamanlayicisi ve elle tetikleme ucu"
```

---

## Görev 11: Arayüz — `/nakliye-faturalari`

**Dosyalar:**
- Oluştur: `client/src/pages/NakliyeFaturalari.tsx`
- Değiştir: `client/src/App.tsx`
- Değiştir: `server/routes.ts` (okuma uçları)

**Arayüzler:**
- Tüketir: Görev 1 storage metotları
- Üretir: `GET /api/nakliye/faturalar`, `GET /api/nakliye/satis-faturalari`, `PUT /api/nakliye/faturalar/:id`

- [ ] **Adım 1: Okuma uçlarını `server/routes.ts` içine ekle**

```typescript
  // Nakliye faturaları listesi (eşleşme bilgisiyle)
  app.get("/api/nakliye/faturalar", async (_req, res) => {
    try {
      const faturalar = await storage.getNakliyeFaturalari();
      const eslesmeler = await storage.getEslesmelerByFatura(faturalar.map((f) => f.id));

      // N+1 önleme: gümrük kayıtlarını tek sorguda çek, Map ile birleştir
      const gumrukIdler = Array.from(
        new Set(eslesmeler.map((e) => e.gumrukVerisiId!).filter(Boolean)),
      );
      const gumrukKayitlari = await storage.getGumrukVerileriByIds(gumrukIdler);
      const gumrukMap = new Map(gumrukKayitlari.map((g) => [g.id, g]));

      const eslesmeMap = new Map<string, any[]>();
      for (const e of eslesmeler) {
        if (!eslesmeMap.has(e.faturaId!)) eslesmeMap.set(e.faturaId!, []);
        const g = gumrukMap.get(e.gumrukVerisiId!);
        eslesmeMap.get(e.faturaId!)!.push({
          id: e.id,
          konteyner: e.konteyner,
          skor: e.skor,
          kaynak: e.kaynak,
          dosyaNo: g?.dosyaNo || null,
          firmaUnvan: g?.firmaUnvan || null,
          tescilNo: g?.tescilNo || null,
        });
      }

      res.json(faturalar.map((f) => ({ ...f, eslesmeler: eslesmeMap.get(f.id) || [] })));
    } catch (error) {
      console.error("Nakliye faturaları getirme hatası:", error);
      res.status(500).json({ error: "Faturalar alınamadı" });
    }
  });

  // Satış faturası taslakları
  app.get("/api/nakliye/satis-faturalari", async (_req, res) => {
    try {
      res.json(await storage.getSatisFaturalari());
    } catch (error) {
      console.error("Satış faturaları getirme hatası:", error);
      res.status(500).json({ error: "Satış faturaları alınamadı" });
    }
  });

  // Kuyruktaki bir faturayı elle düzelt
  app.put("/api/nakliye/faturalar/:id", async (req, res) => {
    try {
      const guncel = await storage.updateNakliyeFaturasi(req.params.id, req.body);
      if (!guncel) return res.status(404).json({ error: "Bulunamadı" });
      res.json(guncel);
    } catch (error) {
      console.error("Nakliye faturası güncelleme hatası:", error);
      res.status(500).json({ error: "Güncellenemedi" });
    }
  });
```

- [ ] **Adım 2: `client/src/pages/NakliyeFaturalari.tsx` dosyasını oluştur**

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Eslesme = {
  id: string; konteyner: string | null; skor: number; kaynak: string;
  dosyaNo: string | null; firmaUnvan: string | null; tescilNo: string | null;
};

type Fatura = {
  id: string; kaynak: string; faturaNo: string; faturaTarihi: string | null;
  tedarikciUnvan: string | null; musteriFirmaAdi: string | null;
  paraBirimi: string | null; matrah: string | null; kdvOrani: number | null;
  kdvTutari: string | null; tevkifatTutari: string | null; odenecekTutar: string | null;
  konteynerler: string | null; pdfYolu: string | null; durum: string;
  hataMesaji: string | null; eslesmeler: Eslesme[];
};

type SatisFaturasi = {
  id: string; gumrukDosyaNo: string; parasutSalesInvoiceId: string | null;
  netToplam: string | null; paraBirimi: string | null; kalemSayisi: number | null;
  durum: string; hataMesaji: string | null;
};

/** YYYY-MM-DD → dd/mm/yyyy. new Date() KULLANILMAZ (timezone kayması). */
function tarihGoster(t: string | null): string {
  if (!t || !/^\d{4}-\d{2}-\d{2}/.test(t)) return t || "-";
  const [y, a, g] = t.slice(0, 10).split("-");
  return `${g}/${a}/${y}`;
}

function tutarGoster(v: string | null, pb: string | null): string {
  if (v === null) return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${pb || "TRY"}`;
}

const KUYRUK_DURUMLARI = ["dogrulama_hatasi", "hata", "revizyon_gerekli"];

export default function NakliyeFaturalari() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [senkronCalisiyor, setSenkronCalisiyor] = useState(false);

  const { data: faturalar = [], isLoading } = useQuery<Fatura[]>({
    queryKey: ["/api/nakliye/faturalar"],
  });
  const { data: satislar = [] } = useQuery<SatisFaturasi[]>({
    queryKey: ["/api/nakliye/satis-faturalari"],
  });

  const senkron = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/nakliye/senkron", { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error || "Senkron başarısız");
      return r.json();
    },
    onMutate: () => setSenkronCalisiyor(true),
    onSettled: () => setSenkronCalisiyor(false),
    onSuccess: (d: any) => {
      toast({
        title: "Senkron tamamlandı",
        description:
          `Çekilen: ${d.cekilen.yeni} · Yazılan: ${d.yazilan.basarili} · ` +
          `Eşleşen: ${d.eslestirme.eslesen} · Fatura: ${d.faturalama.olusturulan}`,
      });
      qc.invalidateQueries({ queryKey: ["/api/nakliye/faturalar"] });
      qc.invalidateQueries({ queryKey: ["/api/nakliye/satis-faturalari"] });
    },
    onError: (e: Error) => toast({ title: "Senkron hatası", description: e.message, variant: "destructive" }),
  });

  const kuyruktakiler = faturalar.filter(
    (f) => KUYRUK_DURUMLARI.includes(f.durum) || f.eslesmeler.length === 0,
  );
  const normaller = faturalar.filter((f) => !kuyruktakiler.includes(f));

  if (isLoading) return <div className="p-6 text-muted-foreground">Yükleniyor…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Nakliye Faturaları</h2>
          <p className="text-sm text-muted-foreground">
            {faturalar.length} fatura · {kuyruktakiler.length} kuyrukta · {satislar.length} taslak
          </p>
        </div>
        <Button onClick={() => senkron.mutate()} disabled={senkronCalisiyor}>
          {senkronCalisiyor ? "Çalışıyor…" : "Şimdi çalıştır"}
        </Button>
      </div>

      <Tabs defaultValue="gelen">
        <TabsList>
          <TabsTrigger value="gelen">Gelen Faturalar ({normaller.length})</TabsTrigger>
          <TabsTrigger value="kuyruk">Kuyruk ({kuyruktakiler.length})</TabsTrigger>
          <TabsTrigger value="taslak">Kesilen Taslaklar ({satislar.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="gelen">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <FaturaTablosu faturalar={normaller} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kuyruk">
          <Card>
            <CardHeader><CardTitle className="text-sm">Elle müdahale bekleyenler</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <FaturaTablosu faturalar={kuyruktakiler} hataGoster />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="taslak">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dosya No</TableHead>
                    <TableHead>Kalem</TableHead>
                    <TableHead className="text-right">Net Toplam</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Paraşüt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {satislar.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono whitespace-nowrap">{s.gumrukDosyaNo}</TableCell>
                      <TableCell>{s.kalemSayisi ?? "-"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {tutarGoster(s.netToplam, s.paraBirimi)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.durum === "taslak" ? "default" : "destructive"}>{s.durum}</Badge>
                        {s.hataMesaji && (
                          <div className="text-xs text-muted-foreground mt-1">{s.hataMesaji}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.parasutSalesInvoiceId ? (
                          <a
                            className="text-primary underline"
                            target="_blank"
                            rel="noreferrer"
                            href={`https://uygulama.parasut.com/216831/satis-faturalari/${s.parasutSalesInvoiceId}`}
                          >
                            Aç
                          </a>
                        ) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {satislar.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Henüz taslak yok
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FaturaTablosu({ faturalar, hataGoster }: { faturalar: Fatura[]; hataGoster?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tarih</TableHead>
          <TableHead>Fatura No</TableHead>
          <TableHead>Tedarikçi</TableHead>
          <TableHead className="text-right">Matrah</TableHead>
          <TableHead className="text-right">Ödenecek</TableHead>
          <TableHead>Konteyner</TableHead>
          <TableHead>Beyanname</TableHead>
          <TableHead>Kaynak</TableHead>
          <TableHead>PDF</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {faturalar.map((f) => (
          <TableRow key={f.id}>
            <TableCell className="whitespace-nowrap">{tarihGoster(f.faturaTarihi)}</TableCell>
            <TableCell className="font-mono whitespace-nowrap">{f.faturaNo}</TableCell>
            <TableCell className="max-w-[220px] truncate">{f.tedarikciUnvan || "-"}</TableCell>
            <TableCell className="text-right whitespace-nowrap">{tutarGoster(f.matrah, f.paraBirimi)}</TableCell>
            <TableCell className="text-right whitespace-nowrap">{tutarGoster(f.odenecekTutar, f.paraBirimi)}</TableCell>
            <TableCell className="font-mono text-xs">{f.konteynerler || "-"}</TableCell>
            <TableCell className="text-xs">
              {f.eslesmeler.length === 0 ? (
                <span className="text-muted-foreground">eşleşmedi</span>
              ) : (
                f.eslesmeler.map((e) => (
                  <div key={e.id} className="whitespace-nowrap">
                    {e.dosyaNo} <span className="text-muted-foreground">({e.skor})</span>
                  </div>
                ))
              )}
            </TableCell>
            <TableCell>
              <Badge variant={f.kaynak === "earsiv" ? "secondary" : "outline"}>
                {f.kaynak === "earsiv" ? "e-Arşiv" : "e-Fatura"}
              </Badge>
              {hataGoster && f.hataMesaji && (
                <div className="text-xs text-destructive mt-1 max-w-[280px]">{f.hataMesaji}</div>
              )}
            </TableCell>
            <TableCell>
              {f.pdfYolu ? (
                <a className="text-primary underline" target="_blank" rel="noreferrer" href={`/${f.pdfYolu}`}>
                  Aç
                </a>
              ) : "-"}
            </TableCell>
          </TableRow>
        ))}
        {faturalar.length === 0 && (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
              Kayıt yok
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Adım 3: `client/src/App.tsx` içine route ve başlık ekle**

Import bloğuna:
```typescript
import NakliyeFaturalari from "@/pages/NakliyeFaturalari";
```

`pageTitles` nesnesine:
```typescript
  "/nakliye-faturalari": "Nakliye Faturaları",
```

`<Switch>` içine, `/nakliye` route'unun hemen altına:
```tsx
      <Route path="/nakliye-faturalari" component={NakliyeFaturalari} />
```

- [ ] **Adım 4: Tip kontrolü**

Çalıştır: `npm run check`
Beklenen: hata yok. `Tabs` bileşeni yoksa `npx shadcn@latest add tabs` ile ekle.

- [ ] **Adım 5: Tarayıcıda doğrula**

`npm run dev` çalıştır, `http://localhost:5000/nakliye-faturalari` adresini aç.

Doğrula:
- Üç sekme görünüyor, sayılar doğru
- "Şimdi çalıştır" butonu senkronu tetikliyor ve toast gösteriyor
- Tarihler `dd/mm/yyyy` biçiminde
- e-Arşiv/e-Fatura rozetleri doğru
- PDF bağlantıları açılıyor

- [ ] **Adım 6: Commit**

```bash
git add client/src/pages/NakliyeFaturalari.tsx client/src/App.tsx server/routes.ts
git commit -m "feat(nakliye): nakliye faturalari ekrani (gelen/kuyruk/taslak)"
```

---

## Görev 12: Poller küçültme ve ölü kod temizliği

**Dosyalar:**
- Değiştir: VPS `/root/nakliye/gmail_poller.py`
- Değiştir: `server/routes.ts` (ölü n8n proxy'sini sil)

- [ ] **Adım 1: Ölü n8n proxy'sini `server/routes.ts` içinden sil**

`app.post("/api/proxy/nakliye-upload", ...)` bloğunun tamamını sil (yaklaşık [routes.ts:3756](../../../server/routes.ts) civarı, `N8N_WEBHOOK_URL` sabitini içeren blok).

`client/src/pages/Nakliye.tsx` içindeki `PROXY_URL` sabitini ve onu kullanan `handleFileUpload` fonksiyonunu **silme** — kullanıcının elle yükleme özelliğidir; yalnızca sunucu tarafındaki ölü proxy siliniyorsa upload kırılır. Bu yüzden önce kontrol et:

```bash
grep -n "proxy/nakliye-upload" client/src/pages/Nakliye.tsx
```

Eşleşme varsa proxy'yi **silme**, bunun yerine yorum ekleyip bırak:
```typescript
  // NOT: n8n devre dışı ama Nakliye.tsx'teki elle yükleme hâlâ bu ucu
  // kullanıyor. Yeni akış /api/nakliye/fatura-yukle üzerinden gidiyor.
```

- [ ] **Adım 2: Yeni poller'ı yaz**

`/root/nakliye/gmail_poller.py` dosyasını şununla değiştir:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CNC Nakliye Gmail Poller (VPS'te calisir, saf stdlib)
- IMAP ile noreply@sysmond.com.tr faturalarini ceker (son 30 gun)
- PDF eklerini /api/nakliye/fatura-yukle'ye multipart POST eder
- Ayristirma YAPMAZ: fatura no, tutar, konteyner cikarimi Node tarafinda
  Claude ile yapilir. Dedup de orada (fatura_no unique).
Kimlik: /var/www/cnctracker/.env icindeki GMAIL_USER + GMAIL_APP_PASSWORD
Cron: saatte bir. Log: /var/log/nakliye-poller.log
"""
import imaplib, email, ssl, os, uuid, urllib.request
from datetime import datetime, timedelta

ENV_PATH = "/var/www/cnctracker/.env"
APP_BASE = "http://localhost:5000"
SENDER   = "noreply@sysmond.com.tr"


def load_env(path):
    d = {}
    try:
        for line in open(path, encoding="utf-8", errors="ignore"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            d[k.strip()] = v.strip()
    except Exception as e:
        print("env okunamadi:", e)
    return d


def post_pdf(pdf_bytes, filename):
    """multipart/form-data ile PDF gonderir (alan adi: file)."""
    sinir = uuid.uuid4().hex
    govde = b""
    govde += ("--%s\r\n" % sinir).encode()
    govde += ('Content-Disposition: form-data; name="file"; filename="%s"\r\n' % filename).encode()
    govde += b"Content-Type: application/pdf\r\n\r\n"
    govde += pdf_bytes
    govde += ("\r\n--%s--\r\n" % sinir).encode()

    req = urllib.request.Request(
        APP_BASE + "/api/nakliye/fatura-yukle",
        data=govde,
        headers={"Content-Type": "multipart/form-data; boundary=%s" % sinir},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read().decode("utf-8", "ignore")


def main():
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    env = load_env(ENV_PATH)
    user = env.get("GMAIL_USER")
    pw = env.get("GMAIL_APP_PASSWORD")
    host = env.get("GMAIL_IMAP_HOST", "imap.gmail.com")
    if not user or not pw:
        print("[%s] GMAIL_USER/GMAIL_APP_PASSWORD .env'de yok - atlaniyor." % stamp)
        return

    try:
        M = imaplib.IMAP4_SSL(host, ssl_context=ssl.create_default_context())
        M.login(user, pw)
        M.select("INBOX")
    except Exception as e:
        print("[%s] IMAP baglanti/login hatasi: %s" % (stamp, e))
        return

    since = (datetime.now() - timedelta(days=30)).strftime("%d-%b-%Y")
    typ, data = M.search(None, "FROM", SENDER, "SINCE", since)
    ids = data[0].split() if data and data[0] else []

    gonderilen = 0
    yeni = 0
    hata = 0
    for num in ids:
        typ, msgdata = M.fetch(num, "(RFC822)")
        if not msgdata or not msgdata[0]:
            continue
        msg = email.message_from_bytes(msgdata[0][1])
        for part in msg.walk():
            fn = (part.get_filename() or "")
            if part.get_content_type() != "application/pdf" and not fn.lower().endswith(".pdf"):
                continue
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            try:
                cevap = post_pdf(payload, os.path.basename(fn) or "fatura.pdf")
                gonderilen += 1
                if '"already_exists":true' in cevap.replace(" ", ""):
                    pass
                else:
                    yeni += 1
            except Exception as e:
                hata += 1
                print("[%s] POST hatasi (%s): %s" % (stamp, fn, e))

    try:
        M.logout()
    except Exception:
        pass

    print("[%s] gonderilen=%d yeni=%d hata=%d" % (stamp, gonderilen, yeni, hata))


if __name__ == "__main__":
    main()
```

- [ ] **Adım 3: Yeni poller'ı VPS'e kur**

```bash
scp /path/to/gmail_poller.py root@167.235.252.49:/root/nakliye/gmail_poller.py
ssh root@167.235.252.49 "cd /root/nakliye && python3 gmail_poller.py"
```

Beklenen çıktı: `[tarih] gonderilen=N yeni=M hata=0`

> ⚠️ **Sıra önemli:** Bu adım yalnızca Görev 5'teki `/api/nakliye/fatura-yukle` ucu **canlıya çıktıktan sonra** yapılmalı. Aksi halde poller 404 alır. Uç canlıda değilse bu adımı bekletin — eski poller çalışmaya devam eder, veri kaybı olmaz.

- [ ] **Adım 4: Eski `/api/nakliye/eslestir` cron'unu bırak**

`0 5 * * *` satırı **değişmez** — mevcut `nakliye_verileri` tablosu ve Nakliye sayfası korunuyor. İki eşleştirici farklı tablolara yazar, çakışma yok.

Doğrula:
```bash
ssh root@167.235.252.49 "crontab -l"
```
Beklenen: iki satır da yerinde.

- [ ] **Adım 5: Tip kontrolü ve commit**

```bash
npm run check
git add server/routes.ts
git commit -m "chore(nakliye): olu n8n proxy notu ve poller kucultme"
```

---

## Uygulama Sonrası Doğrulama

Tüm görevler bittikten sonra uçtan uca doğrulama:

- [ ] `npm run check` temiz
- [ ] `POST /api/nakliye/senkron` hatasız dönüyor
- [ ] `psql "$DATABASE_URL" -t -A -F'|' -c "SELECT durum, count(*) FROM nakliye_faturalari GROUP BY 1;"` — `hata` sayısı 0 veya açıklanabilir
- [ ] Paraşüt arayüzünde oluşan bir satış faturası taslağında: matrah gelen faturanın **1,20 katı**, KDV oranı gelenle aynı, **tevkifat satırı yok**
- [ ] `/nakliye-faturalari` ekranında üç sekme de veri gösteriyor
- [ ] VPS `tail -5 /var/log/nakliye-poller.log` — yeni format (`gonderilen=... yeni=...`)
- [ ] Mevcut `/nakliye` sayfası ve `nakliye_verileri` akışı **bozulmamış**
