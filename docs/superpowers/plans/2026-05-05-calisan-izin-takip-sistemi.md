# Çalışan İzin Takip Sistemi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çalışanlar sayfasına TR İş Kanunu uyumlu yıllık izin + mazeret takip sistemi eklemek; klasik aylık takvim + bakiye yönetimi + paraya çevirme hesaplayıcı ile.

**Architecture:** 3 yeni Postgres tablosu (`calisan_izinler`, `calisan_izin_acilis_bakiyesi`, `resmi_tatiller`); paylaşılan saf hesap mantığı `shared/izinHesaplari.ts`'de; `IStorage` arayüzüne 9 yeni metod; 7 REST endpoint; Çalışanlar sayfasına 2 üst sekme (Maaşlar/İzinler) + 3 alt sekme (Takvim/Liste/Bakiye); 3 yeni modal. Modüler component yapısı: her UI parçası kendi dosyasında.

**Tech Stack:**
- Backend: Express ESM, Drizzle ORM, Postgres (Neon)
- Shared logic: TypeScript pure functions (`@shared/izinHesaplari`)
- Frontend: React 18, shadcn/ui, react-day-picker (kurulu), date-fns (kurulu), TanStack Query
- Test: Manuel — `npm run check` (type gate) + smoke scripts + tarayıcı validation (CLAUDE.md: test runner yok)

**Spec referansı:** [docs/superpowers/specs/2026-05-05-calisan-izin-takip-sistemi-design.md](../specs/2026-05-05-calisan-izin-takip-sistemi-design.md)

---

## Dosya Haritası

**Yeni:**
- `shared/izinHesaplari.ts` — pure logic: kıdem, hak, iş günü, paraya çevirme
- `client/src/components/IzinTakvimi.tsx` — klasik aylık takvim grid
- `client/src/components/IzinListesi.tsx` — sortable izin tablosu + CSV
- `client/src/components/IzinBakiye.tsx` — bakiye kartları + paraya çevirme calculator
- `client/src/components/IzinEkleModal.tsx` — ortak izin ekleme modal
- `client/src/components/GunDetayModal.tsx` — takvim hücresi detay modal
- `client/src/components/AcilisBakiyeModal.tsx` — açılış bakiyesi düzenleme inline

**Değiştirilen:**
- `shared/schema.ts` — 3 yeni tablo + insert şemaları + types
- `server/storage.ts` — IStorage interface + DatabaseStorage impl + seedResmiTatiller
- `server/routes.ts` — 7 yeni endpoint (`/api/izinler/*`, `/api/resmi-tatiller`)
- `server/index.ts` — startup'ta seed çağrısı
- `client/src/pages/Calisanlar.tsx` — üst tab yapısı, mevcut içerik "Maaşlar" sekmesine gider

---

## Task 1: Schema — 3 yeni tablo

**Files:**
- Modify: `shared/schema.ts` (mevcut `bordroDosyalar` paterninden sonra)

- [ ] **Step 1: Schema kodunu ekle**

`shared/schema.ts`'deki `bordroDosyalar` tablosu tanımının sonuna ekle:

```ts
// İzin kayıtları
export const calisanIzinler = pgTable("calisan_izinler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tcNo: text("tc_no").notNull(),
  baslangicTarihi: text("baslangic_tarihi").notNull(), // YYYY-MM-DD
  bitisTarihi: text("bitis_tarihi").notNull(),         // YYYY-MM-DD
  tur: text("tur").notNull(),                          // 'YILLIK' | 'MAZERET'
  gunSayisi: integer("gun_sayisi").notNull(),          // hesaplanmış iş günü
  aciklama: text("aciklama"),
  parayaCevrildi: boolean("paraya_cevrildi").notNull().default(false),
  parayaCevrilenTutar: decimal("paraya_cevrilen_tutar", { precision: 15, scale: 2 }),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
}, (table) => [
  index("calisan_izinler_tc_idx").on(table.tcNo),
  index("calisan_izinler_baslangic_idx").on(table.baslangicTarihi),
]);

export const insertCalisanIzinSchema = createInsertSchema(calisanIzinler).omit({
  id: true,
  olusturmaTarihi: true,
});
export type InsertCalisanIzin = z.infer<typeof insertCalisanIzinSchema>;
export type CalisanIzin = typeof calisanIzinler.$inferSelect;

// Açılış bakiyesi (sistem öncesi snapshot)
export const calisanIzinAcilisBakiyesi = pgTable("calisan_izin_acilis_bakiyesi", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tcNo: text("tc_no").notNull(),
  acilisTarihi: text("acilis_tarihi").notNull(),       // YYYY-MM-DD, default '2026-01-01'
  acilisBakiyesi: integer("acilis_bakiyesi").notNull(), // negatif olabilir
  not: text("not"),
}, (table) => [
  uniqueIndex("acilis_bakiye_tc_idx").on(table.tcNo),
]);

export const insertAcilisBakiyeSchema = createInsertSchema(calisanIzinAcilisBakiyesi).omit({
  id: true,
});
export type InsertAcilisBakiye = z.infer<typeof insertAcilisBakiyeSchema>;
export type AcilisBakiye = typeof calisanIzinAcilisBakiyesi.$inferSelect;

// Resmi tatiller
export const resmiTatiller = pgTable("resmi_tatiller", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tarih: text("tarih").notNull(), // YYYY-MM-DD
  ad: text("ad").notNull(),
  yil: integer("yil").notNull(),
}, (table) => [
  uniqueIndex("resmi_tatiller_tarih_idx").on(table.tarih),
  index("resmi_tatiller_yil_idx").on(table.yil),
]);

export const insertResmiTatilSchema = createInsertSchema(resmiTatiller).omit({
  id: true,
});
export type InsertResmiTatil = z.infer<typeof insertResmiTatilSchema>;
export type ResmiTatil = typeof resmiTatiller.$inferSelect;
```

**Not:** `boolean` ve `index` import'larının `drizzle-orm/pg-core`'dan eklendiğini doğrula. Mevcut `pgTable, varchar, text, integer, decimal, timestamp, uniqueIndex, sql` zaten import edilmiş; sadece `boolean` ve `index` eksikse ekle.

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: PASS — boş çıktı veya sadece `tsc` satırı.

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(izin): schema — calisan_izinler, acilis_bakiyesi, resmi_tatiller tabloları"
```

---

## Task 2: DB sync (db:push)

**Files:** Hiçbiri (runtime ortam değişimi)

- [ ] **Step 1: Schema'yı DB'ye push**

Run: `npm run db:push`
Expected: Drizzle yeni 3 tabloyu Postgres'e yazar. Çıktıda `[+] CREATE TABLE` satırları görünmeli.

- [ ] **Step 2: Doğrulama (opsiyonel, eğer Neon dashboard'a erişimin varsa)**

Neon dashboard → Tables sekmesi → `calisan_izinler`, `calisan_izin_acilis_bakiyesi`, `resmi_tatiller` görünmeli.

- [ ] **Step 3: Commit yok**

`db:push` runtime aksiyonu, commit yapılmaz.

---

## Task 3: Hesap fonksiyonları — `shared/izinHesaplari.ts`

**Files:**
- Create: `shared/izinHesaplari.ts`

- [ ] **Step 1: Pure logic dosyasını oluştur**

```ts
// shared/izinHesaplari.ts
// TR İş Kanunu uyumlu izin hesap mantığı.
// new Date() KULLANMAZ — tüm tarih hesapları YYYY-MM-DD string parse'ı ile.

// YYYY-MM-DD → { yil, ay (1-12), gun }
function parseDate(s: string): { yil: number; ay: number; gun: number } {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`Geçersiz tarih: ${s}`);
  return { yil: +m[1], ay: +m[2], gun: +m[3] };
}

// İki tarih arası gün farkı (bitis dahil değil)
function daysBetween(bas: string, bit: string): number {
  // UTC midnight kullan ki DST etkilemesin
  const b = parseDate(bas);
  const e = parseDate(bit);
  const ms = Date.UTC(e.yil, e.ay - 1, e.gun) - Date.UTC(b.yil, b.ay - 1, b.gun);
  return Math.round(ms / 86400000);
}

// Tam yıl farkı (TR İş Kanunu kıdem hesabı)
// Örn: 2018-03-15 → 2026-05-05 = 8 yıl (mart 15'i geçtikten sonra)
//       2018-03-15 → 2026-03-14 = 7 yıl (mart 15 dolmadı)
export function kidemYili(iseGiris: string, refTarih: string): number {
  const g = parseDate(iseGiris);
  const r = parseDate(refTarih);
  let fark = r.yil - g.yil;
  if (r.ay < g.ay || (r.ay === g.ay && r.gun < g.gun)) {
    fark -= 1;
  }
  return Math.max(0, fark);
}

// TR İş Kanunu m.53 — yıllık izin gün sayısı
export function yillikIzinHakki(kidem: number): number {
  if (kidem >= 15) return 26;
  if (kidem >= 5) return 20;
  if (kidem >= 1) return 14;
  return 0;
}

// İş günü sayısı (hafta sonu + resmi tatil hariç)
// resmiTatiller: Set<"YYYY-MM-DD">
export function isGunuSayisi(bas: string, bit: string, resmiTatiller: Set<string>): number {
  const farkGun = daysBetween(bas, bit) + 1; // bitis dahil
  if (farkGun <= 0) return 0;

  const b = parseDate(bas);
  let count = 0;
  for (let i = 0; i < farkGun; i++) {
    const dMs = Date.UTC(b.yil, b.ay - 1, b.gun) + i * 86400000;
    const d = new Date(dMs);
    const dow = d.getUTCDay(); // 0=Paz, 6=Cmt
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const iso = `${yyyy}-${mm}-${dd}`;
    if (dow !== 0 && dow !== 6 && !resmiTatiller.has(iso)) {
      count++;
    }
  }
  return count;
}

// Açılış tarihinden ref tarihine kadar yıllık eklemeli hak hesabı
// Her tam çalışma yılı dolduğunda o yılki kıdem aralığına göre ekleme yapılır.
export function sistemHakEdileniHesapla(
  iseGiris: string,
  acilisTarihi: string,
  refTarih: string,
): number {
  const ig = parseDate(iseGiris);
  const ac = parseDate(acilisTarihi);
  const ref = parseDate(refTarih);

  // İşe giriş günü/ay'ı ile her yıl, "kıdem doldu" tarihi olur.
  // Açılıştan büyük olan ve ref'ten küçük olan kıdem dolma tarihlerini topla.
  let toplam = 0;
  let yilCounter = 1;
  while (true) {
    const kidemDolmaYil = ig.yil + yilCounter;
    const kidemDolmaIsoDate = `${kidemDolmaYil}-${String(ig.ay).padStart(2, "0")}-${String(ig.gun).padStart(2, "0")}`;
    // Ref'ten sonra mı?
    if (compareDate(kidemDolmaIsoDate, refTarih) > 0) break;
    // Açılıştan sonra mı?
    if (compareDate(kidemDolmaIsoDate, acilisTarihi) > 0) {
      toplam += yillikIzinHakki(yilCounter);
    }
    yilCounter++;
    if (yilCounter > 100) break; // güvenlik
  }
  return toplam;
}

// "YYYY-MM-DD" karşılaştırma: a<b ise <0, a>b ise >0, eşitse 0
function compareDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Paraya çevirme tutarı (sadece NET — günlük net = aylık net / 30)
export function parayaCevirmeHesabi(aylikNet: number, gunSayisi: number): number {
  if (!aylikNet || aylikNet <= 0 || gunSayisi <= 0) return 0;
  return Math.round((aylikNet / 30) * gunSayisi * 100) / 100;
}

// Bakiye sonucu tipi
export interface BakiyeSonuc {
  tcNo: string;
  iseGirisTarihi: string | null;
  kidemYili: number;
  yillikHakkiPerYil: number;
  acilisBakiyesi: number;
  sistemHakEdileni: number;
  toplamHakEdilen: number;
  kullanilan: number;
  guncelBakiye: number;
}

// Bakiye hesaplama — referans tarih varsayılan bugünün UTC tarihi
export function bakiyeHesapla(params: {
  tcNo: string;
  iseGirisTarihi: string | null;
  acilisTarihi: string;
  acilisBakiyesi: number;
  kullanilanYillikGun: number;
  refTarih: string;
}): BakiyeSonuc {
  if (!params.iseGirisTarihi) {
    return {
      tcNo: params.tcNo,
      iseGirisTarihi: null,
      kidemYili: 0,
      yillikHakkiPerYil: 0,
      acilisBakiyesi: params.acilisBakiyesi,
      sistemHakEdileni: 0,
      toplamHakEdilen: params.acilisBakiyesi,
      kullanilan: params.kullanilanYillikGun,
      guncelBakiye: params.acilisBakiyesi - params.kullanilanYillikGun,
    };
  }
  const kidem = kidemYili(params.iseGirisTarihi, params.refTarih);
  const yillikPerYil = yillikIzinHakki(kidem);
  const sistemHak = sistemHakEdileniHesapla(params.iseGirisTarihi, params.acilisTarihi, params.refTarih);
  const toplam = params.acilisBakiyesi + sistemHak;
  return {
    tcNo: params.tcNo,
    iseGirisTarihi: params.iseGirisTarihi,
    kidemYili: kidem,
    yillikHakkiPerYil: yillikPerYil,
    acilisBakiyesi: params.acilisBakiyesi,
    sistemHakEdileni: sistemHak,
    toplamHakEdilen: toplam,
    kullanilan: params.kullanilanYillikGun,
    guncelBakiye: toplam - params.kullanilanYillikGun,
  };
}
```

- [ ] **Step 2: Smoke test script'i (geçici, commit edilmez)**

Create: `_izin_smoke.ts` (repo root)

```ts
import {
  kidemYili,
  yillikIzinHakki,
  isGunuSayisi,
  sistemHakEdileniHesapla,
  parayaCevirmeHesabi,
  bakiyeHesapla,
} from "./shared/izinHesaplari";

// Test 1: Kıdem
console.log("Kıdem 2018-03-15 → 2026-05-05:", kidemYili("2018-03-15", "2026-05-05"), "(beklenen 8)");
console.log("Kıdem 2018-03-15 → 2026-03-14:", kidemYili("2018-03-15", "2026-03-14"), "(beklenen 7)");
console.log("Kıdem 2018-03-15 → 2018-03-15:", kidemYili("2018-03-15", "2018-03-15"), "(beklenen 0)");

// Test 2: Yıllık hak
console.log("Hak 0 yıl:", yillikIzinHakki(0), "(beklenen 0)");
console.log("Hak 1 yıl:", yillikIzinHakki(1), "(beklenen 14)");
console.log("Hak 5 yıl:", yillikIzinHakki(5), "(beklenen 20)");
console.log("Hak 15 yıl:", yillikIzinHakki(15), "(beklenen 26)");

// Test 3: İş günü (15-25 Mayıs 2026, 19 Mayıs RT, hafta sonu 16-17, 23-24)
const rt = new Set(["2026-05-19"]);
console.log("İş günü 2026-05-15..2026-05-25:", isGunuSayisi("2026-05-15", "2026-05-25", rt), "(beklenen 6)");

// Test 4: Sistem hak edileni (işe giriş 2018-03-15, açılış 2026-01-01, ref 2026-05-05)
// Kıdem dolma tarihleri: 2019-2026 her 03-15. Açılış 2026-01-01'den sonra → sadece 2026-03-15.
// 2026-03-15'te kıdem = 8, yıllık hak 20.
console.log("Sistem hak 2018-03-15 / 2026-01-01 / 2026-05-05:",
  sistemHakEdileniHesapla("2018-03-15", "2026-01-01", "2026-05-05"), "(beklenen 20)");

// Test 5: Paraya çevirme
console.log("Paraya 100k net × 14 gün:", parayaCevirmeHesabi(100000, 14), "(beklenen 46666.67)");

// Test 6: Bakiye
const b = bakiyeHesapla({
  tcNo: "12345678901",
  iseGirisTarihi: "2018-03-15",
  acilisTarihi: "2026-01-01",
  acilisBakiyesi: 12,
  kullanilanYillikGun: 6,
  refTarih: "2026-05-05",
});
console.log("Bakiye:", JSON.stringify(b, null, 2));
console.log("guncelBakiye beklenen: 12 + 20 - 6 = 26");
```

Run: `npx tsx _izin_smoke.ts`
Expected: Tüm "beklenen" değerleri eşleşmeli.

- [ ] **Step 3: Smoke script'i sil**

Run: `rm _izin_smoke.ts`

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/izinHesaplari.ts
git commit -m "feat(izin): shared/izinHesaplari.ts — kıdem, hak, iş günü, paraya çevirme"
```

---

## Task 4: Resmi Tatil Seed

**Files:**
- Modify: `server/storage.ts` (DatabaseStorage class içine `seedResmiTatiller` metodu)
- Modify: `server/index.ts` (startup'ta seed çağırma)

- [ ] **Step 1: IStorage'a seed metodu ekle**

`server/storage.ts`'de IStorage interface'inin sonuna ekle (mevcut `upsertCalisanlarToplu` satırından sonra):

```ts
  // İzin sistemi
  seedResmiTatiller(): Promise<{ inserted: number }>;
  getResmiTatiller(yil?: number): Promise<ResmiTatil[]>;
```

İmport'lara ekle:
```ts
  bordroDosyalar, type BordroDosya, type InsertBordroDosya,
  calisanIzinler, type CalisanIzin, type InsertCalisanIzin,
  calisanIzinAcilisBakiyesi, type AcilisBakiye, type InsertAcilisBakiye,
  resmiTatiller, type ResmiTatil, type InsertResmiTatil,
```

- [ ] **Step 2: Seed implementasyonu**

DatabaseStorage'da `upsertCalisanlarToplu` metodundan sonra:

```ts
  // ============================================================================
  // İZİN SİSTEMİ — RESMİ TATİL SEED
  // ============================================================================

  // 2024-2030 arası TR resmi tatilleri (sabit + hicri).
  // Yeni dini bayram tarihleri her yılın aralığında manuel güncellenir.
  private static readonly RESMI_TATILLER_DATA: { tarih: string; ad: string }[] = [
    // SABİT (her yıl aynı)
    ...["2024", "2025", "2026", "2027", "2028", "2029", "2030"].flatMap((y) => [
      { tarih: `${y}-01-01`, ad: "Yılbaşı" },
      { tarih: `${y}-04-23`, ad: "Ulusal Egemenlik ve Çocuk Bayramı" },
      { tarih: `${y}-05-01`, ad: "Emek ve Dayanışma Günü" },
      { tarih: `${y}-05-19`, ad: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
      { tarih: `${y}-07-15`, ad: "Demokrasi ve Milli Birlik Günü" },
      { tarih: `${y}-08-30`, ad: "Zafer Bayramı" },
      { tarih: `${y}-10-29`, ad: "Cumhuriyet Bayramı" },
    ]),
    // HİCRİ (her yıl ~11 gün geri kayar — Diyanet takvimine göre)
    // 2024
    { tarih: "2024-04-10", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2024-04-11", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2024-04-12", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2024-06-16", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2024-06-17", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2024-06-18", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2024-06-19", ad: "Kurban Bayramı 4. Gün" },
    // 2025
    { tarih: "2025-03-30", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2025-03-31", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2025-04-01", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2025-06-06", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2025-06-07", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2025-06-08", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2025-06-09", ad: "Kurban Bayramı 4. Gün" },
    // 2026
    { tarih: "2026-03-20", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2026-03-21", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2026-03-22", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2026-05-27", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2026-05-28", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2026-05-29", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2026-05-30", ad: "Kurban Bayramı 4. Gün" },
    // 2027
    { tarih: "2027-03-09", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2027-03-10", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2027-03-11", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2027-05-16", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2027-05-17", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2027-05-18", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2027-05-19", ad: "Kurban Bayramı 4. Gün" },
    // 2028
    { tarih: "2028-02-26", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2028-02-27", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2028-02-28", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2028-05-04", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2028-05-05", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2028-05-06", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2028-05-07", ad: "Kurban Bayramı 4. Gün" },
    // 2029
    { tarih: "2029-02-14", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2029-02-15", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2029-02-16", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2029-04-23", ad: "Kurban Bayramı 1. Gün (Çocuk Bayramı ile çakışır)" },
    { tarih: "2029-04-24", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2029-04-25", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2029-04-26", ad: "Kurban Bayramı 4. Gün" },
    // 2030
    { tarih: "2030-02-04", ad: "Ramazan Bayramı 1. Gün" },
    { tarih: "2030-02-05", ad: "Ramazan Bayramı 2. Gün" },
    { tarih: "2030-02-06", ad: "Ramazan Bayramı 3. Gün" },
    { tarih: "2030-04-13", ad: "Kurban Bayramı 1. Gün" },
    { tarih: "2030-04-14", ad: "Kurban Bayramı 2. Gün" },
    { tarih: "2030-04-15", ad: "Kurban Bayramı 3. Gün" },
    { tarih: "2030-04-16", ad: "Kurban Bayramı 4. Gün" },
  ];

  async seedResmiTatiller(): Promise<{ inserted: number }> {
    const existing = await db.select({ tarih: resmiTatiller.tarih }).from(resmiTatiller);
    const existingSet = new Set(existing.map((r) => r.tarih));
    const yeni = DatabaseStorage.RESMI_TATILLER_DATA
      .filter((r) => !existingSet.has(r.tarih))
      .map((r) => ({ ...r, yil: parseInt(r.tarih.slice(0, 4), 10) }));
    if (yeni.length === 0) return { inserted: 0 };
    await db.insert(resmiTatiller).values(yeni);
    return { inserted: yeni.length };
  }

  async getResmiTatiller(yil?: number): Promise<ResmiTatil[]> {
    if (yil) {
      return await db.select().from(resmiTatiller).where(eq(resmiTatiller.yil, yil)).orderBy(resmiTatiller.tarih);
    }
    return await db.select().from(resmiTatiller).orderBy(resmiTatiller.tarih);
  }
```

- [ ] **Step 3: Server startup'ta seed çağrısı**

`server/index.ts`'i oku ve `app.listen` çağrısından önce şunu ekle (storage import'u zaten olmalı):

```ts
import { storage } from "./storage";

// ... mevcut server setup ...

// İzin sistemi: resmi tatilleri seed et (idempotent)
storage.seedResmiTatiller()
  .then((r) => {
    if (r.inserted > 0) console.log(`✓ ${r.inserted} resmi tatil eklendi.`);
  })
  .catch((e) => console.error("Resmi tatil seed hatası:", e));
```

Eğer `server/index.ts` farklı yapıdaysa (storage zaten import edilmişse) sadece seed çağrısını uygun yere koy. Mevcut yapıyı bozmadan, mantıklı bir startup hook yerine.

- [ ] **Step 4: Type-check + dev server'da seed çıktısını gör**

Run: `npm run check`
Expected: PASS

Run: `npm run dev`
Expected: Konsol log: `✓ 70+ resmi tatil eklendi.` (ilk açılış). İkinci açılışta log yok (idempotent).

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts server/index.ts
git commit -m "feat(izin): resmi tatil seed (2024-2030 sabit + hicri)"
```

---

## Task 5: Storage CRUD metodları

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: IStorage interface'ine metodları ekle**

`seedResmiTatiller` ve `getResmiTatiller` satırlarının üstüne (yine "İzin sistemi" başlığı altında) ekle:

```ts
  // İzin sistemi — kayıtlar
  getIzinler(filter?: { yil?: number; tcNo?: string; tur?: string }): Promise<CalisanIzin[]>;
  getIzinlerForCalendar(yil: number, ay: number): Promise<CalisanIzin[]>;
  insertIzin(data: InsertCalisanIzin): Promise<CalisanIzin>;
  updateIzin(id: string, data: Partial<InsertCalisanIzin>): Promise<CalisanIzin | null>;
  deleteIzin(id: string): Promise<{ success: boolean }>;

  // İzin sistemi — açılış bakiyesi
  getAcilisBakiyeler(): Promise<AcilisBakiye[]>;
  getAcilisBakiye(tcNo: string): Promise<AcilisBakiye | null>;
  upsertAcilisBakiye(data: InsertAcilisBakiye): Promise<AcilisBakiye>;
```

- [ ] **Step 2: Implementations**

`seedResmiTatiller` metodundan SONRA ekle:

```ts
  // ============================================================================
  // İZİN SİSTEMİ — KAYITLAR
  // ============================================================================

  async getIzinler(filter?: { yil?: number; tcNo?: string; tur?: string }): Promise<CalisanIzin[]> {
    const filters = [];
    if (filter?.tcNo) filters.push(eq(calisanIzinler.tcNo, filter.tcNo));
    if (filter?.tur) filters.push(eq(calisanIzinler.tur, filter.tur));
    if (filter?.yil) {
      const start = `${filter.yil}-01-01`;
      const end = `${filter.yil}-12-31`;
      filters.push(sql`${calisanIzinler.baslangicTarihi} <= ${end} AND ${calisanIzinler.bitisTarihi} >= ${start}`);
    }
    if (filters.length > 0) {
      return await db.select().from(calisanIzinler).where(and(...filters)).orderBy(desc(calisanIzinler.baslangicTarihi));
    }
    return await db.select().from(calisanIzinler).orderBy(desc(calisanIzinler.baslangicTarihi));
  }

  async getIzinlerForCalendar(yil: number, ay: number): Promise<CalisanIzin[]> {
    // O ayın başı ve sonu — tarih aralığı çakışan tüm izinleri döndür
    const ayStr = String(ay).padStart(2, "0");
    const ayBas = `${yil}-${ayStr}-01`;
    // Ayın son günü: bir sonraki ayın 0. günü
    const sonGun = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
    const ayBit = `${yil}-${ayStr}-${String(sonGun).padStart(2, "0")}`;
    return await db.select().from(calisanIzinler)
      .where(sql`${calisanIzinler.baslangicTarihi} <= ${ayBit} AND ${calisanIzinler.bitisTarihi} >= ${ayBas}`)
      .orderBy(calisanIzinler.baslangicTarihi);
  }

  async insertIzin(data: InsertCalisanIzin): Promise<CalisanIzin> {
    const [row] = await db.insert(calisanIzinler).values(data).returning();
    return row;
  }

  async updateIzin(id: string, data: Partial<InsertCalisanIzin>): Promise<CalisanIzin | null> {
    const [row] = await db.update(calisanIzinler).set(data).where(eq(calisanIzinler.id, id)).returning();
    return row ?? null;
  }

  async deleteIzin(id: string): Promise<{ success: boolean }> {
    const result = await db.delete(calisanIzinler).where(eq(calisanIzinler.id, id)).returning({ id: calisanIzinler.id });
    return { success: result.length > 0 };
  }

  // ============================================================================
  // İZİN SİSTEMİ — AÇILIŞ BAKİYESİ
  // ============================================================================

  async getAcilisBakiyeler(): Promise<AcilisBakiye[]> {
    return await db.select().from(calisanIzinAcilisBakiyesi);
  }

  async getAcilisBakiye(tcNo: string): Promise<AcilisBakiye | null> {
    const [row] = await db.select().from(calisanIzinAcilisBakiyesi).where(eq(calisanIzinAcilisBakiyesi.tcNo, tcNo));
    return row ?? null;
  }

  async upsertAcilisBakiye(data: InsertAcilisBakiye): Promise<AcilisBakiye> {
    const existing = await this.getAcilisBakiye(data.tcNo);
    if (existing) {
      const [row] = await db.update(calisanIzinAcilisBakiyesi)
        .set(data)
        .where(eq(calisanIzinAcilisBakiyesi.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(calisanIzinAcilisBakiyesi).values(data).returning();
    return row;
  }
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(izin): storage CRUD — izinler, açılış bakiyesi, calendar sorgu"
```

---

## Task 6: API Endpoints

**Files:**
- Modify: `server/routes.ts` (yeni endpoint grubu, mevcut bordro endpoint'lerinden sonra mantıklı bir yere)

- [ ] **Step 1: Endpoint'leri ekle**

`server/routes.ts`'de mevcut `/api/bordro/arsiv/*` endpoint'lerinden sonra ekle:

```ts
  // ============================================================================
  // İZİN TAKİP SİSTEMİ
  // ============================================================================
  import_logged_already_above: {
    // bu satırı silme — sadece hatırlatma: storage, izinHesaplari import'lar üstte mevcut
  }

  // GET /api/izinler — liste, filtre params (yil, tcNo, tur)
  app.get("/api/izinler", async (req, res) => {
    try {
      const yil = req.query.yil ? parseInt(req.query.yil as string) : undefined;
      const tcNo = req.query.tcNo ? String(req.query.tcNo) : undefined;
      const tur = req.query.tur ? String(req.query.tur) : undefined;
      const list = await storage.getIzinler({ yil, tcNo, tur });
      res.json(list);
    } catch (e) {
      console.error("İzinler listesi hatası:", e);
      res.status(500).json({ error: "Listeleme başarısız" });
    }
  });

  // GET /api/izinler/takvim?yil=&ay=
  app.get("/api/izinler/takvim", async (req, res) => {
    try {
      const yil = parseInt(req.query.yil as string);
      const ay = parseInt(req.query.ay as string);
      if (!yil || !ay || ay < 1 || ay > 12) {
        return res.status(400).json({ error: "Geçersiz yil veya ay" });
      }
      const list = await storage.getIzinlerForCalendar(yil, ay);
      res.json(list);
    } catch (e) {
      console.error("Takvim sorgu hatası:", e);
      res.status(500).json({ error: "Takvim alınamadı" });
    }
  });

  // POST /api/izinler — yeni izin (gunSayisi otomatik hesaplanır)
  app.post("/api/izinler", async (req, res) => {
    try {
      const { tcNo, baslangicTarihi, bitisTarihi, tur, aciklama, parayaCevrildi, parayaCevrilenTutar } = req.body;
      if (!tcNo || !baslangicTarihi || !bitisTarihi || !tur) {
        return res.status(400).json({ error: "Zorunlu alanlar eksik (tcNo, baslangicTarihi, bitisTarihi, tur)" });
      }
      if (tur !== "YILLIK" && tur !== "MAZERET") {
        return res.status(400).json({ error: "Geçersiz tür (YILLIK | MAZERET)" });
      }
      if (baslangicTarihi > bitisTarihi) {
        return res.status(400).json({ error: "Başlangıç bitişten sonra olamaz" });
      }
      // İş günü hesabı için resmi tatilleri çek
      const startYil = parseInt(baslangicTarihi.slice(0, 4));
      const endYil = parseInt(bitisTarihi.slice(0, 4));
      const tatilSet = new Set<string>();
      for (let y = startYil; y <= endYil; y++) {
        const list = await storage.getResmiTatiller(y);
        list.forEach((t) => tatilSet.add(t.tarih));
      }
      const gunSayisi = isGunuSayisi(baslangicTarihi, bitisTarihi, tatilSet);

      const inserted = await storage.insertIzin({
        tcNo,
        baslangicTarihi,
        bitisTarihi,
        tur,
        gunSayisi,
        aciklama: aciklama ?? null,
        parayaCevrildi: !!parayaCevrildi,
        parayaCevrilenTutar: parayaCevrilenTutar != null ? String(parayaCevrilenTutar) : null,
      });
      res.json(inserted);
    } catch (e) {
      console.error("İzin ekleme hatası:", e);
      res.status(500).json({ error: "Ekleme başarısız" });
    }
  });

  // PUT /api/izinler/:id
  app.put("/api/izinler/:id", async (req, res) => {
    try {
      const { tcNo, baslangicTarihi, bitisTarihi, tur, aciklama, parayaCevrildi, parayaCevrilenTutar } = req.body;
      const updateData: any = {};
      if (tcNo !== undefined) updateData.tcNo = tcNo;
      if (tur !== undefined) updateData.tur = tur;
      if (aciklama !== undefined) updateData.aciklama = aciklama;
      if (parayaCevrildi !== undefined) updateData.parayaCevrildi = !!parayaCevrildi;
      if (parayaCevrilenTutar !== undefined) updateData.parayaCevrilenTutar = parayaCevrilenTutar != null ? String(parayaCevrilenTutar) : null;

      // Tarihler değişmişse gunSayisi yeniden hesaplanır
      if (baslangicTarihi !== undefined && bitisTarihi !== undefined) {
        if (baslangicTarihi > bitisTarihi) return res.status(400).json({ error: "Başlangıç bitişten sonra olamaz" });
        updateData.baslangicTarihi = baslangicTarihi;
        updateData.bitisTarihi = bitisTarihi;
        const startYil = parseInt(baslangicTarihi.slice(0, 4));
        const endYil = parseInt(bitisTarihi.slice(0, 4));
        const tatilSet = new Set<string>();
        for (let y = startYil; y <= endYil; y++) {
          const list = await storage.getResmiTatiller(y);
          list.forEach((t) => tatilSet.add(t.tarih));
        }
        updateData.gunSayisi = isGunuSayisi(baslangicTarihi, bitisTarihi, tatilSet);
      }

      const updated = await storage.updateIzin(req.params.id, updateData);
      if (!updated) return res.status(404).json({ error: "Bulunamadı" });
      res.json(updated);
    } catch (e) {
      console.error("İzin güncelleme hatası:", e);
      res.status(500).json({ error: "Güncelleme başarısız" });
    }
  });

  // DELETE /api/izinler/:id
  app.delete("/api/izinler/:id", async (req, res) => {
    try {
      const r = await storage.deleteIzin(req.params.id);
      if (!r.success) return res.status(404).json({ error: "Bulunamadı" });
      res.json(r);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/izinler/bakiye?yil= — tüm aktif çalışanlar için bakiye
  app.get("/api/izinler/bakiye", async (req, res) => {
    try {
      const refTarih = req.query.refTarih as string || new Date().toISOString().slice(0, 10);
      // Aktif çalışan: en yeni (yıl,ay) bordrosundaki tcNo'lar
      const allCalisanlar = await storage.getCalisanlar(undefined, undefined);
      // En yeni (yıl, ay)'ı bul
      let maxYil = 0;
      let maxAy = "";
      for (const c of allCalisanlar) {
        if (c.yil > maxYil) { maxYil = c.yil; maxAy = c.ay; }
        else if (c.yil === maxYil && c.ay > maxAy) { maxAy = c.ay; }
      }
      const aktifler = allCalisanlar.filter((c) => c.yil === maxYil && c.ay === maxAy);

      // Her aktif çalışan için: açılış + kullanılan + bakiye
      const acilisList = await storage.getAcilisBakiyeler();
      const acilisMap = new Map(acilisList.map((a) => [a.tcNo, a]));
      const tumIzinler = await storage.getIzinler({ tur: "YILLIK" });
      const kullanilanMap = new Map<string, number>();
      for (const i of tumIzinler) {
        kullanilanMap.set(i.tcNo, (kullanilanMap.get(i.tcNo) || 0) + i.gunSayisi);
      }

      const sonuc = aktifler.map((c) => {
        const acilis = acilisMap.get(c.tcNo);
        const acilisBakiyesi = acilis?.acilisBakiyesi ?? 0;
        const acilisTarihi = acilis?.acilisTarihi ?? "2026-01-01";
        const kullanilan = kullanilanMap.get(c.tcNo) ?? 0;
        const b = bakiyeHesapla({
          tcNo: c.tcNo,
          iseGirisTarihi: c.isGirisTarihi || null,
          acilisTarihi,
          acilisBakiyesi,
          kullanilanYillikGun: kullanilan,
          refTarih,
        });
        return {
          ...b,
          adSoyad: c.adSoyad,
          sube: c.sube,
          netUcret: Number(c.netUcret || 0),
          gunlukNet: Number(c.netUcret || 0) / 30,
        };
      });

      res.json(sonuc);
    } catch (e) {
      console.error("Bakiye hatası:", e);
      res.status(500).json({ error: "Bakiye alınamadı" });
    }
  });

  // GET /api/izinler/acilis-bakiye
  app.get("/api/izinler/acilis-bakiye", async (_req, res) => {
    try {
      const list = await storage.getAcilisBakiyeler();
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // PUT /api/izinler/acilis-bakiye/:tcNo — upsert
  app.put("/api/izinler/acilis-bakiye/:tcNo", async (req, res) => {
    try {
      const { acilisBakiyesi, acilisTarihi, not } = req.body;
      if (acilisBakiyesi == null || isNaN(parseInt(acilisBakiyesi))) {
        return res.status(400).json({ error: "acilisBakiyesi zorunlu (sayı)" });
      }
      const data: InsertAcilisBakiye = {
        tcNo: req.params.tcNo,
        acilisTarihi: acilisTarihi || "2026-01-01",
        acilisBakiyesi: parseInt(acilisBakiyesi),
        not: not ?? null,
      };
      const row = await storage.upsertAcilisBakiye(data);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /api/resmi-tatiller?yil=
  app.get("/api/resmi-tatiller", async (req, res) => {
    try {
      const yil = req.query.yil ? parseInt(req.query.yil as string) : undefined;
      const list = await storage.getResmiTatiller(yil);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
```

**Önemli:** Üstteki kod bloğundaki `import_logged_already_above` placeholder satırını gerçek koda eklemeyin — sadece bir hatırlatma. Dosyanın üstünde şu satırların olduğunu doğrulayın (gerekirse ekleyin):

```ts
import { isGunuSayisi, bakiyeHesapla } from "@shared/izinHesaplari";
import { type InsertAcilisBakiye } from "@shared/schema";
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Manuel curl testleri (dev server çalışırken)**

```bash
# Resmi tatilleri çek
curl http://localhost:5000/api/resmi-tatiller?yil=2026

# Açılış bakiyesi koy
curl -X PUT http://localhost:5000/api/izinler/acilis-bakiye/12345678901 \
  -H "Content-Type: application/json" \
  -d '{"acilisBakiyesi":12,"not":"test"}'

# İzin ekle
curl -X POST http://localhost:5000/api/izinler \
  -H "Content-Type: application/json" \
  -d '{"tcNo":"12345678901","baslangicTarihi":"2026-05-15","bitisTarihi":"2026-05-25","tur":"YILLIK","aciklama":"yaz tatili"}'
# Beklenen: gunSayisi=6 (11 takvim - 4 hafta sonu - 1 RT (19 Mayıs))

# Bakiye
curl http://localhost:5000/api/izinler/bakiye

# Listele
curl http://localhost:5000/api/izinler?yil=2026
```

Expected: Tüm istekler 200 + JSON döner. gunSayisi 6 olmalı.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(izin): API endpoints — CRUD + takvim + bakiye + açılış bakiyesi"
```

---

## Task 7: UI — Üst tab yapısı (Maaşlar / İzinler)

**Files:**
- Modify: `client/src/pages/Calisanlar.tsx`

- [ ] **Step 1: Mevcut return JSX'i Tabs içine sar**

`Calisanlar.tsx`'de `return ( ... )` bloğunun en dışına `<Tabs>` yapısı ekle. Ana içerik bir `TabsContent value="maaslar"`'a girer; "İzinler" sekmesi şimdilik 3 alt-sekmeli boş placeholder olur.

Dosyanın import'larına bunlar zaten var (mevcut kontrol et):
```ts
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
```

`return (` satırından hemen sonra (mevcut `<div className="relative min-h-screen pb-20">` ile başlayan ana wrapper — onu Tabs ile sar):

```tsx
return (
  <div className="relative min-h-screen pb-20">
    <BackgroundPaths />
    <div className="relative z-10 p-6 lg:p-8 max-w-[1600px] mx-auto">
      <Tabs defaultValue="maaslar" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="maaslar" className="gap-2">
            <Wallet className="w-4 h-4" /> Maaşlar
          </TabsTrigger>
          <TabsTrigger value="izinler" className="gap-2">
            <Calendar className="w-4 h-4" /> İzinler
          </TabsTrigger>
        </TabsList>

        <TabsContent value="maaslar" className="space-y-8">
          {/* ANA HEADER — yıl/ay seçici, search, şube filtresi, butonlar */}
          {/* (mevcut Calisanlar içeriğinin tamamı buraya taşınır) */}
        </TabsContent>

        <TabsContent value="izinler" className="space-y-6">
          <Tabs defaultValue="takvim" className="w-full">
            <TabsList>
              <TabsTrigger value="takvim">Aylık Takvim</TabsTrigger>
              <TabsTrigger value="liste">İzin Listesi</TabsTrigger>
              <TabsTrigger value="bakiye">Bakiye Yönetimi</TabsTrigger>
            </TabsList>
            <TabsContent value="takvim" className="mt-6">
              <div className="text-muted-foreground text-center py-12">Takvim — Task 11</div>
            </TabsContent>
            <TabsContent value="liste" className="mt-6">
              <div className="text-muted-foreground text-center py-12">Liste — Task 9</div>
            </TabsContent>
            <TabsContent value="bakiye" className="mt-6">
              <div className="text-muted-foreground text-center py-12">Bakiye — Task 8</div>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  </div>
);
```

**Mevcut return içeriğini tamamen "maaslar" TabsContent'ine taşı.** Header ile başlayan tüm içerik (yıl/ay seçici, butonlar, tablo, dialoglar) `<TabsContent value="maaslar">` içine girer. `BackgroundPaths` ve dış wrapper dışta kalır. Modal/Dialog'lar (uploadDialog, maasListesi, arsiv) ana wrapper'ın direkt çocukları olarak kalabilir (Tabs dışında).

**Bu adımın amacı:** Mevcut hiçbir Maaşlar fonksiyonu bozulmaz, sadece bir tab altına alınır. İzinler tab'ı şimdilik boş placeholder.

- [ ] **Step 2: Type-check + tarayıcıda görsel kontrol**

Run: `npm run check`
Expected: PASS

Run: `npm run dev` (zaten çalışmıyorsa)
Tarayıcıda: Çalışanlar sayfasını aç. "Maaşlar" sekmesi default açık olmalı, mevcut tablo ve butonlar gözükmeli. "İzinler"e tıklayınca 3 alt-sekme placeholder görünmeli.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Calisanlar.tsx
git commit -m "feat(izin): Çalışanlar sayfasına Maaşlar/İzinler üst sekmesi"
```

---

## Task 8: Bakiye Yönetimi component

**Files:**
- Create: `client/src/components/IzinBakiye.tsx`
- Modify: `client/src/pages/Calisanlar.tsx` (placeholder yerine wire)

- [ ] **Step 1: Component dosyasını oluştur**

```tsx
// client/src/components/IzinBakiye.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Calendar, Banknote, Edit2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BakiyeRow {
  tcNo: string;
  adSoyad: string;
  iseGirisTarihi: string | null;
  kidemYili: number;
  yillikHakkiPerYil: number;
  acilisBakiyesi: number;
  toplamHakEdilen: number;
  kullanilan: number;
  guncelBakiye: number;
  netUcret: number;
  gunlukNet: number;
  sube: string | null;
}

export function IzinBakiye({ onYeniIzin }: { onYeniIzin: (tcNo: string) => void }) {
  const { data: bakiyeler, isLoading } = useQuery<BakiyeRow[]>({
    queryKey: ["/api/izinler/bakiye"],
  });
  const [editingTcNo, setEditingTcNo] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<string>("");
  const [parayaTcNo, setParayaTcNo] = useState<string | null>(null);
  const [parayaGun, setParayaGun] = useState<string>("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  const handleAcilisSave = async (tcNo: string) => {
    const num = parseInt(editVal);
    if (isNaN(num)) { toast({ variant: "destructive", title: "Geçersiz sayı" }); return; }
    const r = await fetch(`/api/izinler/acilis-bakiye/${tcNo}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acilisBakiyesi: num, acilisTarihi: "2026-01-01" }),
    });
    if (!r.ok) { toast({ variant: "destructive", title: "Hata" }); return; }
    toast({ title: "Açılış bakiyesi güncellendi" });
    setEditingTcNo(null);
    qc.invalidateQueries({ queryKey: ["/api/izinler/bakiye"] });
  };

  const handleParayaCevir = async (b: BakiyeRow) => {
    const gun = parseInt(parayaGun);
    if (isNaN(gun) || gun <= 0) { toast({ variant: "destructive", title: "Geçerli gün sayısı girin" }); return; }
    if (gun > b.guncelBakiye) {
      if (!confirm(`Bakiyeniz ${b.guncelBakiye} gün, ${gun} gün izin paraya çevriliyor. Devam edilsin mi?`)) return;
    }
    const tutar = (b.netUcret / 30) * gun;
    // Bugünden itibaren "izin" olarak kaydet (paraya çevrildi flag'i ile)
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch(`/api/izinler`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tcNo: b.tcNo,
        baslangicTarihi: today,
        bitisTarihi: today,
        tur: "YILLIK",
        aciklama: `${gun} gün izin paraya çevrildi (otomatik kayıt)`,
        parayaCevrildi: true,
        parayaCevrilenTutar: tutar,
      }),
    });
    // gunSayisi yeniden hesaplanır (bugün hafta sonu/RT olabilir) — manuel kayıt için kullanıcı
    // ayrıca İzin Listesi'nden gun sayısını düzenleyebilir.
    if (!r.ok) { toast({ variant: "destructive", title: "Hata" }); return; }
    toast({ title: `${fmtTry(tutar)} ödeme kaydı oluşturuldu` });
    setParayaTcNo(null);
    setParayaGun("");
    qc.invalidateQueries({ queryKey: ["/api/izinler/bakiye"] });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  if (!bakiyeler?.length) return <div className="text-center text-muted-foreground py-12">Aktif çalışan bulunamadı (bordro yüklenmemiş olabilir).</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {bakiyeler.map((b) => (
        <Card key={b.tcNo} className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-base">{b.adSoyad}</div>
                {b.sube && <div className="text-xs text-muted-foreground">{b.sube}</div>}
              </div>
              {b.iseGirisTarihi && (
                <div className="text-xs text-muted-foreground text-right">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  {b.iseGirisTarihi}<br />
                  <span className="font-semibold">{b.kidemYili} yıl kıdem</span>
                </div>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              Yıllık hak: <strong className="text-foreground">{b.yillikHakkiPerYil} gün/yıl</strong>
            </div>

            <div className="border-t pt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span>Açılış bakiyesi:</span>
                {editingTcNo === b.tcNo ? (
                  <div className="flex items-center gap-1">
                    <Input value={editVal} onChange={(e) => setEditVal(e.target.value)} className="h-7 w-16" type="number" />
                    <Button size="sm" className="h-7" onClick={() => handleAcilisSave(b.tcNo)}>OK</Button>
                  </div>
                ) : (
                  <button className="font-semibold tabular-nums hover:text-primary" onClick={() => { setEditingTcNo(b.tcNo); setEditVal(String(b.acilisBakiyesi)); }}>
                    {b.acilisBakiyesi} <Edit2 className="w-3 h-3 inline opacity-50" />
                  </button>
                )}
              </div>
              <div className="flex justify-between"><span>Toplam hak edilen:</span><strong className="tabular-nums">{b.toplamHakEdilen}</strong></div>
              <div className="flex justify-between"><span>Kullanılan:</span><strong className="tabular-nums text-orange-600">{b.kullanilan}</strong></div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="font-bold">Kalan bakiye:</span>
                <strong className={`tabular-nums text-lg ${b.guncelBakiye < 0 ? "text-red-600" : "text-green-600"}`}>{b.guncelBakiye}</strong>
              </div>
            </div>

            <div className="border-t pt-2 space-y-1 text-sm bg-muted/20 -mx-4 -mb-4 px-4 py-3">
              <div className="font-semibold flex items-center gap-1"><Banknote className="w-4 h-4" /> Paraya çevirme</div>
              <div className="text-xs text-muted-foreground">Aylık net: {fmtTry(b.netUcret)} · Günlük: {fmtTry(b.gunlukNet)}</div>
              {parayaTcNo === b.tcNo ? (
                <div className="space-y-2">
                  <Input value={parayaGun} onChange={(e) => setParayaGun(e.target.value)} placeholder="Gün sayısı" type="number" className="h-8" />
                  {parayaGun && !isNaN(parseInt(parayaGun)) && (
                    <div className="text-sm">Hesap: <strong className="text-green-700">{fmtTry((b.netUcret / 30) * parseInt(parayaGun))}</strong></div>
                  )}
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 flex-1" onClick={() => handleParayaCevir(b)}>İzin Olarak İşaretle</Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => { setParayaTcNo(null); setParayaGun(""); }}>İptal</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="w-full h-7" onClick={() => setParayaTcNo(b.tcNo)} disabled={!b.netUcret}>
                  Hesapla & Kaydet
                </Button>
              )}
            </div>

            <Button size="sm" className="w-full" onClick={() => onYeniIzin(b.tcNo)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Yeni İzin Ekle
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Calisanlar.tsx'te wire et**

Task 7'de eklediğin "Bakiye — Task 8" placeholder'ını şununla değiştir:

```tsx
<TabsContent value="bakiye" className="mt-6">
  <IzinBakiye onYeniIzin={(tcNo) => { setIzinModalTcNo(tcNo); setIzinModalOpen(true); }} />
</TabsContent>
```

Component üstünde import + state ekle:

```ts
import { IzinBakiye } from "@/components/IzinBakiye";
// ...
const [izinModalOpen, setIzinModalOpen] = useState(false);
const [izinModalTcNo, setIzinModalTcNo] = useState<string | null>(null);
```

`IzinEkleModal` Task 10'da geleceği için şimdilik bu state'ler henüz gerçek modal'a bağlı değil — TODO comment bırak veya inline placeholder modal yaz.

- [ ] **Step 3: Type-check + tarayıcıda görsel kontrol**

Run: `npm run check`
Expected: PASS

Tarayıcıda: Çalışanlar > İzinler > Bakiye Yönetimi → aktif çalışanlar için kart grid görünmeli. Açılış bakiyesi düzenleme inline çalışmalı. Paraya çevirme calculator canlı hesap göstermeli.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/IzinBakiye.tsx client/src/pages/Calisanlar.tsx
git commit -m "feat(izin): IzinBakiye component — bakiye kartları + paraya çevirme + açılış düzenleme"
```

---

## Task 9: İzin Listesi component

**Files:**
- Create: `client/src/components/IzinListesi.tsx`
- Modify: `client/src/pages/Calisanlar.tsx`

- [ ] **Step 1: Component dosyası**

```tsx
// client/src/components/IzinListesi.tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Edit2, Trash2, Download as DownloadIcon, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IzinRow {
  id: string;
  tcNo: string;
  baslangicTarihi: string;
  bitisTarihi: string;
  tur: string;
  gunSayisi: number;
  aciklama: string | null;
  parayaCevrildi: boolean;
  parayaCevrilenTutar: string | null;
}

interface IzinListesiProps {
  onYeniEkle: () => void;
  onDuzenle: (izin: IzinRow) => void;
}

export function IzinListesi({ onYeniEkle, onDuzenle }: IzinListesiProps) {
  const [yil, setYil] = useState<string>(String(new Date().getFullYear()));
  const [tcNoFilter, setTcNoFilter] = useState<string>("");
  const [turFilter, setTurFilter] = useState<string>("HEPSI");
  const [sortField, setSortField] = useState<keyof IzinRow>("baslangicTarihi");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { toast } = useToast();
  const qc = useQueryClient();

  // Çalışan adlarını çek
  const { data: calisanlar } = useQuery<any[]>({
    queryKey: ["/api/calisanlar"],
  });
  const adMap = useMemo(() => {
    const m = new Map<string, string>();
    calisanlar?.forEach((c) => m.set(c.tcNo, c.adSoyad));
    return m;
  }, [calisanlar]);

  const queryUrl = `/api/izinler?yil=${yil}${tcNoFilter ? `&tcNo=${tcNoFilter}` : ""}${turFilter !== "HEPSI" ? `&tur=${turFilter}` : ""}`;
  const { data: izinler, isLoading } = useQuery<IzinRow[]>({ queryKey: [queryUrl] });

  const sorted = useMemo(() => {
    if (!izinler) return [];
    return [...izinler].sort((a, b) => {
      const av = (a as any)[sortField] ?? "";
      const bv = (b as any)[sortField] ?? "";
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv), "tr") : String(bv).localeCompare(String(av), "tr");
    });
  }, [izinler, sortField, sortDir]);

  const handleSort = (f: keyof IzinRow) => {
    if (sortField === f) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu izin kaydı silinsin mi?")) return;
    const r = await fetch(`/api/izinler/${id}`, { method: "DELETE" });
    if (!r.ok) { toast({ variant: "destructive", title: "Silinemedi" }); return; }
    toast({ title: "Silindi" });
    qc.invalidateQueries({ queryKey: [queryUrl] });
    qc.invalidateQueries({ queryKey: ["/api/izinler/bakiye"] });
  };

  const exportCsv = () => {
    const escape = (v: any) => { const s = String(v ?? ""); return s.includes(";") ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = sorted.map((r) => [adMap.get(r.tcNo) ?? r.tcNo, r.tur, r.baslangicTarihi, r.bitisTarihi, r.gunSayisi, r.aciklama ?? "", r.parayaCevrildi ? "Evet" : "Hayır", r.parayaCevrilenTutar ?? ""]);
    const csv = "﻿" + [["Çalışan", "Tür", "Başlangıç", "Bitiş", "Gün", "Açıklama", "Paraya Çevrildi", "Tutar"], ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `izinler-${yil}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const SortIcon = ({ f }: { f: keyof IzinRow }) => sortField === f ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />) : <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4 rounded-lg border bg-muted/20">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="text-xs">Yıl</label>
            <Select value={yil} onValueChange={setYil}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs">Çalışan</label>
            <Select value={tcNoFilter || "HEPSI"} onValueChange={(v) => setTcNoFilter(v === "HEPSI" ? "" : v)}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Hepsi" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HEPSI">Hepsi</SelectItem>
                {Array.from(adMap.entries()).map(([tc, ad]) => <SelectItem key={tc} value={tc}>{ad}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs">Tür</label>
            <Select value={turFilter} onValueChange={setTurFilter}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HEPSI">Hepsi</SelectItem>
                <SelectItem value="YILLIK">Yıllık</SelectItem>
                <SelectItem value="MAZERET">Mazeret</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!sorted.length}>
            <DownloadIcon className="w-3.5 h-3.5 mr-1.5" /> CSV
          </Button>
          <Button onClick={onYeniEkle} className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1.5" /> Yeni İzin Ekle
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              <Table className="text-sm">
                <TableHeader className="sticky top-0 bg-muted z-10">
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => handleSort("tcNo")}>Çalışan <SortIcon f="tcNo" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort("tur")}>Tür <SortIcon f="tur" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort("baslangicTarihi")}>Başlangıç <SortIcon f="baslangicTarihi" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort("bitisTarihi")}>Bitiş <SortIcon f="bitisTarihi" /></TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => handleSort("gunSayisi")}>Gün <SortIcon f="gunSayisi" /></TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead>Paraya Çevr.</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead className="w-[80px]">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : !sorted.length ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Kayıt yok</TableCell></TableRow>
                  ) : sorted.map((r) => (
                    <TableRow key={r.id} className="hover:bg-accent/40">
                      <TableCell className="font-medium">{adMap.get(r.tcNo) ?? r.tcNo}</TableCell>
                      <TableCell>
                        <Badge variant={r.tur === "YILLIK" ? "default" : "outline"} className={r.tur === "YILLIK" ? "bg-blue-600 hover:bg-blue-700" : "border-orange-400 text-orange-700"}>
                          {r.tur === "YILLIK" ? "Yıllık" : "Mazeret"}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{r.baslangicTarihi}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{r.bitisTarihi}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{r.gunSayisi}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={r.aciklama ?? ""}>{r.aciklama}</TableCell>
                      <TableCell>{r.parayaCevrildi && <Badge className="bg-green-600">💰</Badge>}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.parayaCevrilenTutar ? new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(r.parayaCevrilenTutar)) : "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDuzenle(r)}><Edit2 className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => handleDelete(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Calisanlar.tsx wire**

`<TabsContent value="liste">` placeholder'ını değiştir:

```tsx
<TabsContent value="liste" className="mt-6">
  <IzinListesi
    onYeniEkle={() => { setIzinModalTcNo(null); setIzinModalEdit(null); setIzinModalOpen(true); }}
    onDuzenle={(izin) => { setIzinModalEdit(izin); setIzinModalOpen(true); }}
  />
</TabsContent>
```

State ekle:
```ts
const [izinModalEdit, setIzinModalEdit] = useState<any>(null);
```

Import:
```ts
import { IzinListesi } from "@/components/IzinListesi";
```

- [ ] **Step 3: Type-check + tarayıcı**

Run: `npm run check`
Expected: PASS

Tarayıcıda: İzin Listesi sekmesinde Task 6'da curl ile eklediğin izin görünmeli, sortable, CSV export çalışmalı.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/IzinListesi.tsx client/src/pages/Calisanlar.tsx
git commit -m "feat(izin): IzinListesi component — sortable tablo + filtreler + CSV export"
```

---

## Task 10: İzin Ekle Modal (ortak)

**Files:**
- Create: `client/src/components/IzinEkleModal.tsx`
- Modify: `client/src/pages/Calisanlar.tsx`

- [ ] **Step 1: Modal component**

```tsx
// client/src/components/IzinEkleModal.tsx
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Info, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IzinEkleModalProps {
  open: boolean;
  onClose: () => void;
  defaultTcNo?: string | null;
  defaultDate?: string | null;
  editIzin?: any | null;
}

export function IzinEkleModal({ open, onClose, defaultTcNo, defaultDate, editIzin }: IzinEkleModalProps) {
  const isEdit = !!editIzin;
  const [tcNo, setTcNo] = useState<string>("");
  const [tur, setTur] = useState<"YILLIK" | "MAZERET">("YILLIK");
  const [bas, setBas] = useState<string>("");
  const [bit, setBit] = useState<string>("");
  const [aciklama, setAciklama] = useState<string>("");
  const [parayaCevrildi, setParayaCevrildi] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: calisanlar } = useQuery<any[]>({ queryKey: ["/api/calisanlar"], enabled: open });
  const { data: bakiyeler } = useQuery<any[]>({ queryKey: ["/api/izinler/bakiye"], enabled: open });
  const { data: tatiller } = useQuery<any[]>({ queryKey: ["/api/resmi-tatiller"], enabled: open });

  // Aktif çalışanlar (en yeni bordrodakiler)
  const aktifler = useMemo(() => {
    if (!calisanlar?.length) return [];
    let maxYil = 0; let maxAy = "";
    calisanlar.forEach((c: any) => {
      if (c.yil > maxYil) { maxYil = c.yil; maxAy = c.ay; }
      else if (c.yil === maxYil && c.ay > maxAy) { maxAy = c.ay; }
    });
    return calisanlar.filter((c: any) => c.yil === maxYil && c.ay === maxAy);
  }, [calisanlar]);

  // Form'u açılışta resetle
  useEffect(() => {
    if (open) {
      if (isEdit && editIzin) {
        setTcNo(editIzin.tcNo);
        setTur(editIzin.tur);
        setBas(editIzin.baslangicTarihi);
        setBit(editIzin.bitisTarihi);
        setAciklama(editIzin.aciklama ?? "");
        setParayaCevrildi(!!editIzin.parayaCevrildi);
      } else {
        setTcNo(defaultTcNo ?? "");
        setTur("YILLIK");
        setBas(defaultDate ?? "");
        setBit(defaultDate ?? "");
        setAciklama("");
        setParayaCevrildi(false);
      }
    }
  }, [open, isEdit, editIzin, defaultTcNo, defaultDate]);

  // İş günü hesabı (canlı önizleme)
  const tatilSet = useMemo(() => new Set((tatiller ?? []).map((t: any) => t.tarih)), [tatiller]);
  const isGunHesabi = useMemo(() => {
    if (!bas || !bit || bas > bit) return null;
    let count = 0; let total = 0; let weekend = 0; let rt = 0;
    const startMs = Date.UTC(+bas.slice(0, 4), +bas.slice(5, 7) - 1, +bas.slice(8, 10));
    const endMs = Date.UTC(+bit.slice(0, 4), +bit.slice(5, 7) - 1, +bit.slice(8, 10));
    for (let ms = startMs; ms <= endMs; ms += 86400000) {
      const d = new Date(ms);
      const dow = d.getUTCDay();
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const iso = `${yyyy}-${mm}-${dd}`;
      total++;
      if (dow === 0 || dow === 6) weekend++;
      else if (tatilSet.has(iso)) rt++;
      else count++;
    }
    return { count, total, weekend, rt };
  }, [bas, bit, tatilSet]);

  // Paraya çevirme tutarı
  const seciliBakiye = bakiyeler?.find((b) => b.tcNo === tcNo);
  const parayaCevirmeTutar = useMemo(() => {
    if (!parayaCevrildi || !seciliBakiye?.netUcret || !isGunHesabi?.count) return 0;
    return Math.round((Number(seciliBakiye.netUcret) / 30) * isGunHesabi.count * 100) / 100;
  }, [parayaCevrildi, seciliBakiye, isGunHesabi]);

  const handleSave = async () => {
    if (!tcNo || !bas || !bit || !tur) { toast({ variant: "destructive", title: "Zorunlu alanlar eksik" }); return; }
    if (bas > bit) { toast({ variant: "destructive", title: "Başlangıç bitişten sonra olamaz" }); return; }
    if (isGunHesabi?.count === 0) {
      if (!confirm("Tüm tarihler hafta sonu/resmi tatil — iş günü 0. Yine de kaydedilsin mi?")) return;
    }
    setBusy(true);
    const body = {
      tcNo, baslangicTarihi: bas, bitisTarihi: bit, tur, aciklama: aciklama || null,
      parayaCevrildi, parayaCevrilenTutar: parayaCevrildi ? parayaCevirmeTutar : null,
    };
    const url = isEdit ? `/api/izinler/${editIzin.id}` : "/api/izinler";
    const method = isEdit ? "PUT" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { toast({ variant: "destructive", title: "Hata", description: (await r.json()).error }); return; }
    toast({ title: isEdit ? "Güncellendi" : "Kaydedildi" });
    qc.invalidateQueries({ queryKey: ["/api/izinler"] });
    qc.invalidateQueries({ queryKey: ["/api/izinler/bakiye"] });
    qc.invalidateQueries({ queryKey: ["/api/izinler/takvim"] });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "İzin Düzenle" : "Yeni İzin Ekle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Çalışan</Label>
            <Select value={tcNo} onValueChange={setTcNo}>
              <SelectTrigger><SelectValue placeholder="Çalışan seçin" /></SelectTrigger>
              <SelectContent>
                {aktifler.map((c: any) => <SelectItem key={c.tcNo} value={c.tcNo}>{c.adSoyad}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tür</Label>
            <div className="flex gap-2">
              <Button variant={tur === "YILLIK" ? "default" : "outline"} onClick={() => setTur("YILLIK")} type="button">Yıllık</Button>
              <Button variant={tur === "MAZERET" ? "default" : "outline"} onClick={() => setTur("MAZERET")} type="button">Mazeret</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Başlangıç</Label>
              <Input type="date" value={bas} onChange={(e) => setBas(e.target.value)} />
            </div>
            <div>
              <Label>Bitiş</Label>
              <Input type="date" value={bit} onChange={(e) => setBit(e.target.value)} />
            </div>
          </div>
          {isGunHesabi && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
              <div>
                Hesaplanan iş günü: <strong className="text-primary">{isGunHesabi.count} gün</strong>
                <span className="text-muted-foreground"> ({isGunHesabi.total} takvim - {isGunHesabi.weekend} hafta sonu - {isGunHesabi.rt} resmi tatil)</span>
                {isGunHesabi.count === 0 && (
                  <div className="text-amber-600 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" /> Tüm tarihler tatil günü
                  </div>
                )}
              </div>
            </div>
          )}
          <div>
            <Label>Açıklama (opsiyonel)</Label>
            <Textarea value={aciklama} onChange={(e) => setAciklama(e.target.value)} rows={2} placeholder="Doktor randevusu, vefat, evlilik vs." />
          </div>
          {tur === "YILLIK" && (
            <div className="flex items-start gap-2 rounded-lg border bg-green-500/5 border-green-500/20 p-3">
              <Switch checked={parayaCevrildi} onCheckedChange={setParayaCevrildi} />
              <div className="flex-1">
                <Label className="cursor-pointer">Bu izni paraya çevir</Label>
                {parayaCevrildi && parayaCevirmeTutar > 0 && (
                  <div className="text-sm text-green-700 mt-1">
                    Hesap: <strong>{new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(parayaCevirmeTutar)}</strong>
                    <span className="text-muted-foreground"> (günlük net × {isGunHesabi?.count} gün)</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {isEdit ? "Güncelle" : "Kaydet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Calisanlar.tsx'te Modal'ı render et**

İzinler tab'ının dışında, ana wrapper'ın altında (mevcut diğer Dialog'ların yanında):

```tsx
<IzinEkleModal
  open={izinModalOpen}
  onClose={() => { setIzinModalOpen(false); setIzinModalTcNo(null); setIzinModalEdit(null); }}
  defaultTcNo={izinModalTcNo}
  editIzin={izinModalEdit}
/>
```

Import:
```ts
import { IzinEkleModal } from "@/components/IzinEkleModal";
```

`Textarea` ve `Switch` import gerekirse `@/components/ui/textarea` ve `@/components/ui/switch` mevcut (Switch task 6'da zaten Trend için ekledik).

- [ ] **Step 3: Type-check + manuel test**

Run: `npm run check`
Expected: PASS

Tarayıcıda:
- Bakiye kartından "Yeni İzin Ekle" → modal açılmalı, çalışan pre-fill
- Liste sekmesinden "Yeni İzin Ekle" → modal boş açılmalı
- Tarih girince iş günü hesabı canlı görünmeli
- Yıllık + paraya çevir → tutar canlı hesaplansın
- Kaydet → bakiye/liste/takvim invalide olmalı (otomatik refresh)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/IzinEkleModal.tsx client/src/pages/Calisanlar.tsx
git commit -m "feat(izin): IzinEkleModal — yeni/düzenle, canlı iş günü hesabı, paraya çevirme toggle"
```

---

## Task 11: Aylık Takvim component (klasik)

**Files:**
- Create: `client/src/components/IzinTakvimi.tsx`
- Create: `client/src/components/GunDetayModal.tsx`
- Modify: `client/src/pages/Calisanlar.tsx`

- [ ] **Step 1: GunDetayModal component**

```tsx
// client/src/components/GunDetayModal.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface GunDetayModalProps {
  open: boolean;
  onClose: () => void;
  tarih: string | null;
  izinler: any[];
  adMap: Map<string, string>;
  onEkle: (tarih: string) => void;
  onDuzenle: (izin: any) => void;
}

export function GunDetayModal({ open, onClose, tarih, izinler, adMap, onEkle, onDuzenle }: GunDetayModalProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  if (!tarih) return null;

  // O tarihe denk gelen izinler
  const gununIzinleri = izinler.filter((i) => tarih >= i.baslangicTarihi && tarih <= i.bitisTarihi);

  const handleDelete = async (id: string) => {
    if (!confirm("Bu izin kaydı silinsin mi?")) return;
    const r = await fetch(`/api/izinler/${id}`, { method: "DELETE" });
    if (!r.ok) { toast({ variant: "destructive", title: "Silinemedi" }); return; }
    toast({ title: "Silindi" });
    qc.invalidateQueries({ queryKey: ["/api/izinler"] });
    qc.invalidateQueries({ queryKey: ["/api/izinler/takvim"] });
    qc.invalidateQueries({ queryKey: ["/api/izinler/bakiye"] });
  };

  // dd Ay yyyy, gün
  const labelTarih = (() => {
    const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const gunler = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
    const [y, m, d] = tarih.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return `${d} ${aylar[m - 1]} ${y}, ${gunler[date.getUTCDay()]}`;
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{labelTarih}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {gununIzinleri.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">Bu gün izinli kimse yok.</div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">İzinli çalışanlar ({gununIzinleri.length}):</div>
              {gununIzinleri.map((iz) => (
                <div key={iz.id} className="border rounded-lg p-3 flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge className={iz.tur === "YILLIK" ? "bg-blue-600" : "bg-orange-500"}>
                        {iz.tur === "YILLIK" ? "Yıllık" : "Mazeret"}
                      </Badge>
                      <span className="font-semibold">{adMap.get(iz.tcNo) ?? iz.tcNo}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {iz.baslangicTarihi} → {iz.bitisTarihi} ({iz.gunSayisi} gün)
                    </div>
                    {iz.aciklama && <div className="text-sm">{iz.aciklama}</div>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDuzenle(iz)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => handleDelete(iz.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button className="w-full" onClick={() => { onEkle(tarih); onClose(); }}>
            <Plus className="w-4 h-4 mr-1" /> Bu güne yeni izin ekle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Takvim component**

```tsx
// client/src/components/IzinTakvimi.tsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { GunDetayModal } from "./GunDetayModal";

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

interface IzinTakvimiProps {
  onYeniIzin: (tcNo: string | null, tarih: string) => void;
  onDuzenle: (izin: any) => void;
}

export function IzinTakvimi({ onYeniIzin, onDuzenle }: IzinTakvimiProps) {
  const today = new Date();
  const [yil, setYil] = useState(today.getFullYear());
  const [ay, setAy] = useState(today.getMonth() + 1); // 1-12
  const [detayTarih, setDetayTarih] = useState<string | null>(null);

  const { data: izinler, isLoading } = useQuery<any[]>({
    queryKey: [`/api/izinler/takvim?yil=${yil}&ay=${ay}`],
  });
  const { data: tatiller } = useQuery<any[]>({
    queryKey: [`/api/resmi-tatiller?yil=${yil}`],
  });
  const { data: calisanlar } = useQuery<any[]>({ queryKey: ["/api/calisanlar"] });
  const adMap = useMemo(() => {
    const m = new Map<string, string>();
    calisanlar?.forEach((c) => m.set(c.tcNo, c.adSoyad));
    return m;
  }, [calisanlar]);
  const tatilMap = useMemo(() => {
    const m = new Map<string, string>();
    (tatiller ?? []).forEach((t) => m.set(t.tarih, t.ad));
    return m;
  }, [tatiller]);

  // Takvim grid hesabı: hafta Pazartesi başlar
  const grid = useMemo(() => {
    const ilkGun = new Date(Date.UTC(yil, ay - 1, 1));
    const sonGun = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
    // İlk günün haftadaki sırası (Pzt=0..Paz=6)
    const baslangicOffset = (ilkGun.getUTCDay() + 6) % 7;
    const cells: { tarih: string | null; gun: number | null }[] = [];
    for (let i = 0; i < baslangicOffset; i++) cells.push({ tarih: null, gun: null });
    for (let g = 1; g <= sonGun; g++) {
      const iso = `${yil}-${String(ay).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
      cells.push({ tarih: iso, gun: g });
    }
    while (cells.length % 7 !== 0) cells.push({ tarih: null, gun: null });
    return cells;
  }, [yil, ay]);

  const navigateMonth = (delta: number) => {
    let yeniAy = ay + delta;
    let yeniYil = yil;
    if (yeniAy < 1) { yeniAy = 12; yeniYil--; }
    if (yeniAy > 12) { yeniAy = 1; yeniYil++; }
    setAy(yeniAy);
    setYil(yeniYil);
  };

  // Hücredeki izinleri al
  const izinHucre = (tarih: string) => (izinler ?? []).filter((iz) => tarih >= iz.baslangicTarihi && tarih <= iz.bitisTarihi);

  // Mini özet
  const ozet = useMemo(() => {
    const setKisi = new Set<string>();
    let toplamGun = 0;
    (izinler ?? []).forEach((iz) => {
      setKisi.add(iz.tcNo);
      // Bu ay içindeki gün sayısı
      const ayBas = `${yil}-${String(ay).padStart(2, "0")}-01`;
      const sonGun = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
      const ayBit = `${yil}-${String(ay).padStart(2, "0")}-${String(sonGun).padStart(2, "0")}`;
      const bas = iz.baslangicTarihi > ayBas ? iz.baslangicTarihi : ayBas;
      const bit = iz.bitisTarihi < ayBit ? iz.bitisTarihi : ayBit;
      const startMs = Date.UTC(+bas.slice(0, 4), +bas.slice(5, 7) - 1, +bas.slice(8, 10));
      const endMs = Date.UTC(+bit.slice(0, 4), +bit.slice(5, 7) - 1, +bit.slice(8, 10));
      toplamGun += Math.round((endMs - startMs) / 86400000) + 1;
    });
    return { kisi: setKisi.size, gun: toplamGun };
  }, [izinler, yil, ay]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => navigateMonth(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="text-xl font-bold tabular-nums px-3">{AYLAR[ay - 1]} {yil}</div>
          <Button size="icon" variant="outline" onClick={() => navigateMonth(1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { setYil(today.getFullYear()); setAy(today.getMonth() + 1); }}>Bugün</Button>
        </div>
        <div className="text-sm text-muted-foreground">
          Bu ay <strong className="text-foreground">{ozet.kisi}</strong> kişi izinli, <strong className="text-foreground">{ozet.gun}</strong> toplam izin günü
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
      ) : (
        <Card>
          <div className="grid grid-cols-7 border-b bg-muted/40">
            {GUN_KISA.map((g) => <div key={g} className="text-center text-xs font-semibold py-2">{g}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((cell, i) => {
              if (!cell.tarih) return <div key={i} className="min-h-[100px] border-r border-b bg-muted/10" />;
              const dow = new Date(Date.UTC(yil, ay - 1, cell.gun!)).getUTCDay();
              const isWeekend = dow === 0 || dow === 6;
              const tatilAd = tatilMap.get(cell.tarih);
              const cellIzinler = izinHucre(cell.tarih);
              const isToday = cell.tarih === today.toISOString().slice(0, 10);
              return (
                <div
                  key={i}
                  className={`min-h-[100px] border-r border-b p-1.5 cursor-pointer hover:bg-accent/40 transition-colors ${isWeekend ? "bg-muted/30" : ""} ${tatilAd ? "bg-gray-200/50 dark:bg-gray-800/40" : ""} ${isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                  onClick={() => setDetayTarih(cell.tarih!)}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className={`text-sm font-semibold ${tatilAd ? "text-red-700 dark:text-red-400" : ""}`}>{cell.gun}</div>
                  </div>
                  {tatilAd && <div className="text-[10px] text-red-700 dark:text-red-400 leading-tight truncate" title={tatilAd}>{tatilAd}</div>}
                  <div className="space-y-0.5">
                    {cellIzinler.slice(0, 2).map((iz) => (
                      <div key={iz.id} className={`text-[10px] truncate rounded px-1 ${iz.tur === "YILLIK" ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200" : "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200"}`}>
                        {iz.tur === "YILLIK" ? "🔵" : "🟠"} {(adMap.get(iz.tcNo) ?? iz.tcNo).split(" ")[0]}
                      </div>
                    ))}
                    {cellIzinler.length > 2 && (
                      <div className="text-[10px] text-muted-foreground font-semibold">+{cellIzinler.length - 2} kişi</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <GunDetayModal
        open={!!detayTarih}
        onClose={() => setDetayTarih(null)}
        tarih={detayTarih}
        izinler={izinler ?? []}
        adMap={adMap}
        onEkle={(tarih) => onYeniIzin(null, tarih)}
        onDuzenle={onDuzenle}
      />
    </div>
  );
}
```

- [ ] **Step 3: Calisanlar.tsx wire**

`<TabsContent value="takvim">` placeholder'ını değiştir:

```tsx
<TabsContent value="takvim" className="mt-6">
  <IzinTakvimi
    onYeniIzin={(tcNo, tarih) => { setIzinModalTcNo(tcNo); setIzinModalDefaultDate(tarih); setIzinModalEdit(null); setIzinModalOpen(true); }}
    onDuzenle={(izin) => { setIzinModalEdit(izin); setIzinModalOpen(true); }}
  />
</TabsContent>
```

State + import:
```ts
import { IzinTakvimi } from "@/components/IzinTakvimi";
const [izinModalDefaultDate, setIzinModalDefaultDate] = useState<string | null>(null);
```

`IzinEkleModal`'a `defaultDate` prop'unu geç:
```tsx
<IzinEkleModal
  open={izinModalOpen}
  onClose={() => { setIzinModalOpen(false); setIzinModalTcNo(null); setIzinModalEdit(null); setIzinModalDefaultDate(null); }}
  defaultTcNo={izinModalTcNo}
  defaultDate={izinModalDefaultDate}
  editIzin={izinModalEdit}
/>
```

- [ ] **Step 4: Type-check + tarayıcı test**

Run: `npm run check`
Expected: PASS

Tarayıcıda: Aylık Takvim sekmesi → Mayıs 2026'a git → 19 Mayıs gri arka plan + "Atatürk'ü Anma..." görünmeli, hafta sonları gri, Task 6'da eklediğin izin (15-25 Mayıs) günlerinde 🔵 Onur (veya hangi isim) görünmeli, hücreye tıklayınca GunDetayModal açılmalı.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/IzinTakvimi.tsx client/src/components/GunDetayModal.tsx client/src/pages/Calisanlar.tsx
git commit -m "feat(izin): klasik aylık takvim + gün detay modal"
```

---

## Task 12: Final test + push

**Files:** Hiçbiri (validation + deploy)

- [ ] **Step 1: Final type-check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 2: Tüm akışları tarayıcıdan test et**

1. Çalışanlar > İzinler > **Bakiye Yönetimi** — kartlar yüklenmiş, bakiye doğru hesaplanıyor mu?
2. Bir kartın **açılış bakiyesini düzenle** → 12 olarak ayarla → bakiye yeniden hesaplansın
3. Aynı kartın **paraya çevirme** alanından 5 gün gir → tutar canlı görünmeli → "İzin Olarak İşaretle" → liste sekmesinde paraya çevrildi badge'li kayıt görünmeli
4. **İzin Listesi** sekmesi → filtre (yıl/çalışan/tür) çalışıyor mu? CSV indir → Türkçe karakterli Excel açılışı
5. **Aylık Takvim** sekmesi → Mayıs 2026'a git, 19 Mayıs RT görünmeli, hafta sonları gri, izinler renkli badge
6. Takvim hücresine tıkla → **GunDetayModal** açılsın, "yeni ekle" butonu modal pre-fill date ile açsın
7. **İzin sil** → tüm view'lar refresh olsun (bakiye, liste, takvim)
8. **İzin düzenle** → tarih değişirse `gunSayisi` yeniden hesaplansın

- [ ] **Step 3: Push**

```bash
git push origin main
```

VPS deploy başlar (~1-3 dk). GitHub Actions otomatik:
- `npm install --legacy-peer-deps`
- `npm run db:push` (yeni 3 tabloyu oluşturur)
- `npm run build`
- `pm2 restart`

VPS'te seed otomatik çalışacak (server startup hook).

- [ ] **Step 4: Production smoke test**

Production URL'de Çalışanlar > İzinler sekmelerini aç. Bakiye/Liste/Takvim hepsi çalışmalı. Bir test izin kaydı ekle, doğrula.

---

## Self-Review (yazar tarafından, plan tamamlandıktan sonra)

**Spec coverage:**
- ✅ Schema (3 tablo) → Task 1
- ✅ db:push → Task 2
- ✅ Hesap mantığı → Task 3
- ✅ Resmi tatil seed → Task 4
- ✅ Storage CRUD → Task 5
- ✅ 7 endpoint → Task 6
- ✅ Üst tab + alt tab → Task 7
- ✅ Bakiye kartları + paraya çevirme + açılış bakiyesi → Task 8
- ✅ İzin Listesi + CSV → Task 9
- ✅ İzin Ekle Modal → Task 10
- ✅ Klasik takvim + Gün Detay Modal → Task 11
- ✅ Final test + push → Task 12

**Type consistency check:**
- `tcNo: text` her yerde tutarlı
- `gunSayisi: integer` (Task 1) ↔ `gunSayisi: number` (Task 3 isGunuSayisi return) ↔ frontend (Task 9 IzinRow) — ✅
- `parayaCevrildi: boolean` (Task 1) ↔ `!!parayaCevrildi` (Task 6 routes) — ✅
- `parayaCevrilenTutar: decimal` (Task 1, string at runtime) ↔ Task 9 `Number(r.parayaCevrilenTutar)` — ✅
- `sistemHakEdileniHesapla` (Task 3) ↔ `bakiyeHesapla` (Task 3 internal) — ✅

**Placeholder scan:**
- Task 6'da `import_logged_already_above` placeholder var ama açıkça "bu satırı silmeyin — sadece hatırlatma" notu ekledim. ✅
- Task 7'de "TODO" yok, sadece "Task 11'de geleceği için şimdilik" diye scope sınırlama açıklaması var. ✅
- Diğer tüm task'larda code blocks tam, exact paths verilmiş.

**Scope check:**
- 12 task, ~3-5 saat toplam iş. Tek developer için tek günlük plan, mantıklı.
- Her task bağımsız test edilebilir (UI placeholder ile bağlantı kuruldu).

**Ambiguity check:**
- Task 8 "Bu state'ler henüz gerçek modal'a bağlı değil" → Task 10'da bağlanacağı netleştirildi.
- Task 6 storage import ekleme talimatı: kod bloğunda hatırlatma yorumu var.
- Task 11 hafta başlangıcı Pazartesi (TR konvansiyonu), kod açıkça `(getUTCDay() + 6) % 7` ile belirtti.
