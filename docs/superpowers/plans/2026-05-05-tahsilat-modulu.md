# Müşteri Tahsilat Modülü — Yeniden Tasarım Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut client-side Excel okuyucu Tahsilat.tsx'i tam fonksiyonel, backend-bağlı, gümrük entegrasyonlu bir tahsilat takip sistemine dönüştürmek (Sub-project 1).

**Architecture:** 6 yeni Postgres tablosu, paylaşılan saf hesap mantığı (`shared/tahsilatHesaplari.ts`), bağımsız Levenshtein eşleştirme modülü (`server/eslestirme.ts`), xlsx parser (`server/mizanParser.ts`), 14 REST endpoint, 5 sekmeli UI (Özet/Müşteriler/Trend/Eşleştirme/Arşiv) — her sekme kendi component dosyasında. Mevcut `Tahsilat.tsx` tamamen silinir ve sıfırdan yazılır.

**Tech Stack:**
- Backend: Express ESM, Drizzle ORM, Postgres (Neon), xlsx (yüklü), pdf-parse pattern (referans için)
- Shared logic: TypeScript pure functions (`@shared/tahsilatHesaplari`)
- Frontend: React 18, shadcn/ui, TanStack Query, Recharts (line chart için, mevcut)
- Test: Manuel — `npm run check` + smoke scripts + curl + tarayıcı (CLAUDE.md: test runner yok)

**Spec referansı:** [docs/superpowers/specs/2026-05-05-tahsilat-modulu-yeniden-tasarim-design.md](../specs/2026-05-05-tahsilat-modulu-yeniden-tasarim-design.md)

---

## Dosya Haritası

**Yeni:**
- `shared/tahsilatHesaplari.ts` — pure logic: netBakiye, gecikme, isAktivitesiAcigi, bakiyeFaturaAcigi, riskProfili
- `server/eslestirme.ts` — Levenshtein, normalize, benzerlikSkoru
- `server/mizanParser.ts` — xlsx parse → MizanRow[]
- `client/src/components/tahsilat/MizanYukleModal.tsx`
- `client/src/components/tahsilat/TahsilatOzet.tsx`
- `client/src/components/tahsilat/MusteriListesi.tsx`
- `client/src/components/tahsilat/MusteriDrillDown.tsx`
- `client/src/components/tahsilat/TahsilatTrend.tsx`
- `client/src/components/tahsilat/EslestirmeUI.tsx`
- `client/src/components/tahsilat/MizanArsivi.tsx`
- `client/src/components/tahsilat/RiskEsikleriModal.tsx`

**Değiştirilen:**
- `shared/schema.ts` — 6 yeni tablo + insert şemaları + types
- `server/storage.ts` — IStorage interface + DatabaseStorage impl + ayarlar seed
- `server/routes.ts` — 14 yeni endpoint
- `client/src/pages/Tahsilat.tsx` — **tamamen yeniden yazılır** (eski 324 satır → yeni ~80 satır iskelet)

---

## Task 1: Schema — 6 yeni tablo

**Files:**
- Modify: `shared/schema.ts` (mevcut izin tablolarından sonra)

- [ ] **Step 1: Schema kodunu ekle**

`shared/schema.ts`'in sonuna (mevcut `resmiTatiller` tablosundan sonra) ekle:

```ts
// ============================================================================
// MÜŞTERİ TAHSİLAT MODÜLÜ
// ============================================================================

export const musteriler = pgTable("musteriler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hesapKodu: text("hesap_kodu").notNull(),       // "120-01-000-002"
  ad: text("ad").notNull(),
  sektor: text("sektor"),
  firmaGrubu: text("firma_grubu"),
  limitTutar: decimal("limit_tutar", { precision: 18, scale: 2 }),
  problemli: boolean("problemli").notNull().default(false),
  gumrukFirmaUnvanlari: text("gumruk_firma_unvanlari").array().notNull().default(sql`'{}'::text[]`),
  sonGoruldugu: timestamp("son_goruldugu"),
  ilkGoruldugu: timestamp("ilk_goruldugu").defaultNow(),
}, (table) => [
  uniqueIndex("musteriler_hesap_kodu_idx").on(table.hesapKodu),
  index("musteriler_son_goruldugu_idx").on(table.sonGoruldugu),
]);

export const insertMusteriSchema = createInsertSchema(musteriler).omit({
  id: true,
  ilkGoruldugu: true,
});
export type InsertMusteri = z.infer<typeof insertMusteriSchema>;
export type Musteri = typeof musteriler.$inferSelect;

export const mizanYuklemeleri = pgTable("mizan_yuklemeleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mizanTarihi: text("mizan_tarihi").notNull(),    // YYYY-MM-DD
  filename: text("filename").notNull(),
  filepath: text("filepath").notNull(),
  sizeBytes: integer("size_bytes"),
  md5Hash: text("md5_hash"),
  kayitSayisi: integer("kayit_sayisi").notNull().default(0),
  toplamNetBakiye: decimal("toplam_net_bakiye", { precision: 18, scale: 2 }),
  yuklemeTarihi: timestamp("yukleme_tarihi").defaultNow(),
  not: text("not"),
}, (table) => [
  index("mizan_yukleme_tarih_idx").on(table.mizanTarihi),
  index("mizan_yukleme_md5_idx").on(table.md5Hash),
]);

export const insertMizanYuklemeSchema = createInsertSchema(mizanYuklemeleri).omit({
  id: true,
  yuklemeTarihi: true,
});
export type InsertMizanYukleme = z.infer<typeof insertMizanYuklemeSchema>;
export type MizanYukleme = typeof mizanYuklemeleri.$inferSelect;

export const mizanBakiye = pgTable("mizan_bakiye", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mizanId: varchar("mizan_id").notNull().references(() => mizanYuklemeleri.id, { onDelete: "cascade" }),
  musteriId: varchar("musteri_id").notNull().references(() => musteriler.id, { onDelete: "cascade" }),
  borc: decimal("borc", { precision: 18, scale: 2 }),
  alacak: decimal("alacak", { precision: 18, scale: 2 }),
  bakiyeBorc: decimal("bakiye_borc", { precision: 18, scale: 2 }),
  bakiyeAlacak: decimal("bakiye_alacak", { precision: 18, scale: 2 }),
  sonBakiye: decimal("son_bakiye", { precision: 18, scale: 2 }),
  sonBakiyeBA: text("son_bakiye_ba").default("B"),
  sonBorcTarihi: text("son_borc_tarihi"),
  sonAlacakTarihi: text("son_alacak_tarihi"),
}, (table) => [
  index("mizan_bakiye_musteri_mizan_idx").on(table.musteriId, table.mizanId),
  uniqueIndex("mizan_bakiye_unique_idx").on(table.mizanId, table.musteriId),
]);

export const insertMizanBakiyeSchema = createInsertSchema(mizanBakiye).omit({ id: true });
export type InsertMizanBakiye = z.infer<typeof insertMizanBakiyeSchema>;
export type MizanBakiye = typeof mizanBakiye.$inferSelect;

export const mizanEslestirmeLog = pgTable("mizan_eslestirme_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  musteriId: varchar("musteri_id").notNull().references(() => musteriler.id, { onDelete: "cascade" }),
  gumrukUnvan: text("gumruk_unvan").notNull(),
  eklemeTarihi: timestamp("ekleme_tarihi").defaultNow(),
  eklemeTipi: text("ekleme_tipi").notNull(),     // 'auto-fuzzy' | 'manual'
  benzerlikSkoru: decimal("benzerlik_skoru", { precision: 4, scale: 3 }),
}, (table) => [
  index("eslestirme_log_musteri_idx").on(table.musteriId),
]);

export const insertEslestirmeLogSchema = createInsertSchema(mizanEslestirmeLog).omit({
  id: true,
  eklemeTarihi: true,
});
export type InsertEslestirmeLog = z.infer<typeof insertEslestirmeLogSchema>;
export type EslestirmeLog = typeof mizanEslestirmeLog.$inferSelect;

export const mizanEslestirmeOnerileri = pgTable("mizan_eslestirme_onerileri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  musteriId: varchar("musteri_id").notNull().references(() => musteriler.id, { onDelete: "cascade" }),
  gumrukUnvan: text("gumruk_unvan").notNull(),
  benzerlikSkoru: decimal("benzerlik_skoru", { precision: 4, scale: 3 }).notNull(),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
  reddedildi: boolean("reddedildi").notNull().default(false),
}, (table) => [
  index("oneriler_musteri_idx").on(table.musteriId, table.reddedildi),
  uniqueIndex("oneriler_unique_idx").on(table.musteriId, table.gumrukUnvan),
]);

export const insertEslestirmeOneriSchema = createInsertSchema(mizanEslestirmeOnerileri).omit({
  id: true,
  olusturmaTarihi: true,
});
export type InsertEslestirmeOneri = z.infer<typeof insertEslestirmeOneriSchema>;
export type EslestirmeOneri = typeof mizanEslestirmeOnerileri.$inferSelect;

export const tahsilatAyarlari = pgTable("tahsilat_ayarlari", {
  id: varchar("id").primaryKey(),
  vipEsik: decimal("vip_esik", { precision: 18, scale: 2 }).notNull().default("5000000"),
  yuksekBakiyeEsik: decimal("yuksek_bakiye_esik", { precision: 18, scale: 2 }).notNull().default("500000"),
  eskiOdemeEsik: integer("eski_odeme_esik").notNull().default(30),
  cokEskiOdemeEsik: integer("cok_eski_odeme_esik").notNull().default(60),
  eksiPozisyonYuzde: integer("eksi_pozisyon_yuzde").notNull().default(20),
  faturaPenceresi: integer("fatura_penceresi").notNull().default(90),
  guncellenme: timestamp("guncellenme").defaultNow(),
});

export const insertTahsilatAyarlariSchema = createInsertSchema(tahsilatAyarlari).omit({
  guncellenme: true,
});
export type InsertTahsilatAyarlari = z.infer<typeof insertTahsilatAyarlariSchema>;
export type TahsilatAyarlari = typeof tahsilatAyarlari.$inferSelect;
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(tahsilat): schema — 6 yeni tablo (musteriler, mizan, eslestirme, ayarlar)"
```

---

## Task 2: DB sync (db:push)

- [ ] **Step 1: Schema'yı DB'ye push**

Run: `npm run db:push`
Expected: 6 yeni tablo CREATE edilir.

- [ ] **Step 2: Commit yok** (runtime aksiyonu)

---

## Task 3: Hesap fonksiyonları — `shared/tahsilatHesaplari.ts`

**Files:**
- Create: `shared/tahsilatHesaplari.ts`

- [ ] **Step 1: Pure logic dosyası**

```ts
// shared/tahsilatHesaplari.ts
// TR mizan tahsilat risk hesap mantığı.
// Tarih hesapları YYYY-MM-DD string parse'ı ile yapılır.

function parseDate(s: string): { yil: number; ay: number; gun: number } {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const tr = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (tr) return { yil: +tr[3], ay: +tr[2], gun: +tr[1] };
    throw new Error(`Geçersiz tarih: ${s}`);
  }
  return { yil: +m[1], ay: +m[2], gun: +m[3] };
}

function daysBetween(bas: string, bit: string): number {
  const b = parseDate(bas);
  const e = parseDate(bit);
  const ms = Date.UTC(e.yil, e.ay - 1, e.gun) - Date.UTC(b.yil, b.ay - 1, b.gun);
  return Math.round(ms / 86400000);
}

// Net bakiye (signed): K=A ise negatif (alacaklı), K=B ise pozitif (borçlu)
export function netBakiye(p: { sonBakiye: number; sonBakiyeBA: string }): number {
  return p.sonBakiyeBA === "A" ? -p.sonBakiye : p.sonBakiye;
}

// Son ödeme gecikmesi (gün); ödeme yoksa 9999
export function gecikme(sonAlacakTarihi: string | null, refTarih: string): number {
  if (!sonAlacakTarihi) return 9999;
  return daysBetween(sonAlacakTarihi, refTarih);
}

// İş aktivitesi açığı: pozitifse "iş yapıyor para vermiyor", negatifse "iş kesilmiş"
export function isAktivitesiAcigi(sonBorcTarihi: string | null, sonAlacakTarihi: string | null): number {
  if (!sonBorcTarihi || !sonAlacakTarihi) return 0;
  // sonBorc - sonAlacak: pozitifse borç son alacaktan yeni → kötü
  return daysBetween(sonAlacakTarihi, sonBorcTarihi);
}

// Bakiye-Fatura açığı: pozitifse devreden gecikmiş borç var
export function bakiyeFaturaAcigi(netBakiyeTutar: number, faturaToplami: number): {
  acik: number;
  acikYuzde: number;
} {
  const acik = netBakiyeTutar - faturaToplami;
  const acikYuzde = faturaToplami > 0 ? (acik / faturaToplami) * 100 : (acik > 0 ? 999 : 0);
  return { acik, acikYuzde };
}

export type RiskPattern = "SAGLIKLI" | "VIP_AKTIF_RISK" | "TAKIP_GEREKEN" | "YAVAS_ODEYICI" | "DONUK_KAYIP";

export interface RiskEsikleri {
  vipEsik: number;
  yuksekBakiyeEsik: number;
  eskiOdemeEsik: number;
  cokEskiOdemeEsik: number;
  eksiPozisyonYuzde: number;
}

export interface RiskSonuc {
  pattern: RiskPattern;
  vipRozeti: boolean;
  yuksekBakiyeRozeti: boolean;
  eksiPozisyonRozeti: boolean;
}

export function riskProfili(p: {
  netBakiye: number;
  gecikme: number;
  isAktivitesiAcigi: number;
  bakiyeFaturaAcikYuzde: number;
  yillikFaturaToplami: number;
  esikler: RiskEsikleri;
}): RiskSonuc {
  const vipRozeti = p.yillikFaturaToplami > p.esikler.vipEsik;
  const yuksekBakiyeRozeti = p.netBakiye > p.esikler.yuksekBakiyeEsik;
  const eksiPozisyonRozeti = p.bakiyeFaturaAcikYuzde > p.esikler.eksiPozisyonYuzde;

  let pattern: RiskPattern;
  if (p.netBakiye <= 0) {
    pattern = "SAGLIKLI";
  } else if (p.gecikme >= p.esikler.cokEskiOdemeEsik && p.isAktivitesiAcigi <= -p.esikler.cokEskiOdemeEsik) {
    // Hem son alacak (gecikme) hem son borç çok eski
    pattern = "DONUK_KAYIP";
  } else if (p.gecikme >= p.esikler.eskiOdemeEsik && p.isAktivitesiAcigi > 0) {
    // Son borç son alacaktan yeni (pozitif iş aktivitesi açığı) → iş yapıyor para vermiyor
    pattern = "YAVAS_ODEYICI";
  } else if (vipRozeti && p.gecikme < p.esikler.eskiOdemeEsik) {
    pattern = "VIP_AKTIF_RISK";
  } else if (p.gecikme >= 11 && p.gecikme < p.esikler.eskiOdemeEsik) {
    pattern = "TAKIP_GEREKEN";
  } else {
    pattern = "SAGLIKLI";
  }

  return { pattern, vipRozeti, yuksekBakiyeRozeti, eksiPozisyonRozeti };
}

export const PATTERN_LABEL: Record<RiskPattern, string> = {
  SAGLIKLI: "Sağlıklı Müşteri",
  VIP_AKTIF_RISK: "VIP — Büyük Aktif",
  TAKIP_GEREKEN: "Takip Gereken",
  YAVAS_ODEYICI: "Yavaş Ödeyici",
  DONUK_KAYIP: "Donuk Alacak",
};

export const PATTERN_COLOR: Record<RiskPattern, string> = {
  SAGLIKLI: "bg-green-500",
  VIP_AKTIF_RISK: "bg-blue-600",
  TAKIP_GEREKEN: "bg-yellow-500",
  YAVAS_ODEYICI: "bg-orange-500",
  DONUK_KAYIP: "bg-red-600",
};
```

- [ ] **Step 2: Smoke test**

Create `_tahsilat_smoke.ts`:

```ts
import {
  netBakiye, gecikme, isAktivitesiAcigi, bakiyeFaturaAcigi,
  riskProfili, PATTERN_LABEL,
} from "./shared/tahsilatHesaplari";

const esikler = { vipEsik: 5000000, yuksekBakiyeEsik: 500000, eskiOdemeEsik: 30, cokEskiOdemeEsik: 60, eksiPozisyonYuzde: 20 };

console.log("=== Net bakiye ===");
console.log(netBakiye({ sonBakiye: 1000, sonBakiyeBA: "B" }), "(beklenen +1000)");
console.log(netBakiye({ sonBakiye: 1000, sonBakiyeBA: "A" }), "(beklenen -1000)");

console.log("\n=== Gecikme ===");
console.log(gecikme("2026-04-01", "2026-05-05"), "(beklenen 34)");
console.log(gecikme(null, "2026-05-05"), "(beklenen 9999)");

console.log("\n=== İş aktivitesi açığı ===");
console.log(isAktivitesiAcigi("2026-05-01", "2026-04-15"), "(beklenen 16 — iş yapıyor para vermiyor)");
console.log(isAktivitesiAcigi("2026-04-01", "2026-05-01"), "(beklenen -30 — iş kesilmiş)");

console.log("\n=== Bakiye-Fatura açığı ===");
console.log(bakiyeFaturaAcigi(500000, 1000000), "(beklenen acik:-500000, yuzde:-50)");
console.log(bakiyeFaturaAcigi(800000, 200000), "(beklenen acik:600000, yuzde:300)");

console.log("\n=== Risk profili ===");
// Teknik Malzeme tipi: VIP, büyük bakiye, son ödeme yakın
const r1 = riskProfili({ netBakiye: 4500000, gecikme: 4, isAktivitesiAcigi: 4, bakiyeFaturaAcikYuzde: -75, yillikFaturaToplami: 50000000, esikler });
console.log("Teknik Malzeme:", PATTERN_LABEL[r1.pattern], r1, "(beklenen VIP_AKTIF_RISK + 2 rozet)");

// Yavaş ödeyici: iş yakın, ödeme eski
const r2 = riskProfili({ netBakiye: 200000, gecikme: 45, isAktivitesiAcigi: 30, bakiyeFaturaAcikYuzde: 50, yillikFaturaToplami: 1000000, esikler });
console.log("Yavaş Ödeyici:", PATTERN_LABEL[r2.pattern], r2, "(beklenen YAVAS_ODEYICI + EksiRozet)");

// Donuk
const r3 = riskProfili({ netBakiye: 100000, gecikme: 90, isAktivitesiAcigi: -90, bakiyeFaturaAcikYuzde: 999, yillikFaturaToplami: 0, esikler });
console.log("Donuk:", PATTERN_LABEL[r3.pattern], r3, "(beklenen DONUK_KAYIP + EksiRozet)");

// Sağlıklı küçük
const r4 = riskProfili({ netBakiye: 50000, gecikme: 5, isAktivitesiAcigi: 0, bakiyeFaturaAcikYuzde: -30, yillikFaturaToplami: 100000, esikler });
console.log("Sağlıklı:", PATTERN_LABEL[r4.pattern], r4, "(beklenen SAGLIKLI)");
```

Run: `npx tsx _tahsilat_smoke.ts`
Expected: tüm beklenen değerler eşleşmeli.

- [ ] **Step 3: Smoke script'i sil + type-check + commit**

```bash
rm -f _tahsilat_smoke.ts
npm run check
git add shared/tahsilatHesaplari.ts
git commit -m "feat(tahsilat): shared/tahsilatHesaplari.ts — 4 metrik + risk profili"
```

---

## Task 4: Eşleştirme — `server/eslestirme.ts`

**Files:**
- Create: `server/eslestirme.ts`

- [ ] **Step 1: Modül dosyası**

```ts
// server/eslestirme.ts
// Müşteri adı ↔ gümrük firmaUnvan eşleştirme algoritması.

const SIRKET_EKLERI = ["ltd", "sti", "as", "tic", "san", "paz", "ve", "sti"];
const TR_REPLACE: Record<string, string> = { "ı": "i", "ş": "s", "ü": "u", "ö": "o", "ç": "c", "ğ": "g" };

export function normalize(s: string): string {
  if (!s) return "";
  let r = s.toLocaleLowerCase("tr");
  // Türkçe karakter normalizasyonu
  r = r.replace(/[ışüöçğ]/g, (c) => TR_REPLACE[c] ?? c);
  // Şirket eklerini sil (kelime sınırı ile)
  for (const ek of SIRKET_EKLERI) {
    r = r.replace(new RegExp(`\\b${ek}\\b`, "g"), " ");
  }
  // Noktalama → boşluk, çoklu boşluk tek boşluk
  r = r.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return r;
}

// Levenshtein uzaklık (DP)
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

export function benzerlikSkoru(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.95;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

export const ESLESME_AUTO_ESIK = 0.95;
export const ESLESME_ONERI_ESIK = 0.75;

// Bir müşteri adı için gümrük unvan listesinde en iyi eşleşmeyi bul
export function enIyiEslesme(
  musteriAd: string,
  gumrukUnvanlar: string[],
): { unvan: string; skor: number } | null {
  let best: { unvan: string; skor: number } | null = null;
  for (const u of gumrukUnvanlar) {
    const s = benzerlikSkoru(musteriAd, u);
    if (!best || s > best.skor) best = { unvan: u, skor: s };
  }
  return best;
}
```

- [ ] **Step 2: Smoke test**

Create `_es_smoke.ts`:

```ts
import { normalize, benzerlikSkoru, enIyiEslesme } from "./server/eslestirme";

console.log("=== Normalize ===");
console.log(normalize("AKIN TİCARET LTD. ŞTİ."), "(beklenen 'akin ticaret')");
console.log(normalize("Akın Tic Ltd Şti"), "(beklenen 'akin')");
console.log(normalize("YEŞİM SATIŞ MAĞAZALARI A.Ş."), "(beklenen 'yesim satis magazalari')");

console.log("\n=== Skor ===");
console.log(benzerlikSkoru("AKIN TİCARET LTD ŞTİ", "Akın Ticaret"), "(beklenen >= 0.95 - includes)");
console.log(benzerlikSkoru("TEKNİK MALZEME TİCARET", "Teknik Malzeme Tic"), "(beklenen >= 0.95)");
console.log(benzerlikSkoru("ABC SAN", "XYZ SAN"), "(beklenen düşük)");

console.log("\n=== En iyi eşleşme ===");
const liste = ["Teknik Malzeme Tic", "Yeşim Satış", "Plastiform Plastik"];
console.log(enIyiEslesme("TEKNİK MALZEME TİCARET VE SANAYİ A.Ş.", liste));
```

Run: `npx tsx _es_smoke.ts`
Expected: normalize doğru, ilk skor >= 0.95, son eşleşme "Teknik Malzeme Tic" >= 0.9 olmalı.

- [ ] **Step 3: Cleanup + type-check + commit**

```bash
rm -f _es_smoke.ts
npm run check
git add server/eslestirme.ts
git commit -m "feat(tahsilat): server/eslestirme.ts — Levenshtein + Türkçe normalize"
```

---

## Task 5: Mizan parser — `server/mizanParser.ts`

**Files:**
- Create: `server/mizanParser.ts`

- [ ] **Step 1: Parser dosyası**

```ts
// server/mizanParser.ts
import * as XLSX from "xlsx";

export interface MizanRow {
  hesapKodu: string;
  doviz: string | null;
  hesapAdi: string;
  borc: number;
  alacak: number;
  bakiyeBorc: number;
  bakiyeAlacak: number;
  sonBakiye: number;
  sonBakiyeBA: "B" | "A";
  sonBorcTarihi: string | null;     // YYYY-MM-DD
  sonAlacakTarihi: string | null;
  grupKodu: string | null;
  problemli: boolean;
  limitTutar: number | null;
  firmaGrubu: string | null;
  sektor: string | null;
}

export interface MizanParseSonuc {
  mizanTarihi: string | null;
  satirlar: MizanRow[];
  toplamSatir: number;
  filtrelenenSatir: number;          // 120- ile başlamayan
  uyarilar: string[];
  toplamBorc: number;
  toplamAlacak: number;
}

// "1.234,56" / "1234.56" / 1234.56 → number
function parseNum(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (!s) return 0;
  // TR: nokta binlik, virgül ondalık → "1.234,56" → "1234.56"
  if (s.includes(",") && s.includes(".")) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// "06.02.2026" / Date / serial → "YYYY-MM-DD"
function parseTarih(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const tr = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (tr) return `${tr[3]}-${tr[2]}-${tr[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

function tahminMizanTarihi(filename: string): string | null {
  // "mizan 08022026.xlsx" → "2026-02-08"
  const m = filename.match(/(\d{2})(\d{2})(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseMizanXlsx(buffer: Buffer, filename = ""): MizanParseSonuc {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  // "Hesap Mizanı" sheet'i tercih et, yoksa ilki
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("mizan")) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return { mizanTarihi: null, satirlar: [], toplamSatir: 0, filtrelenenSatir: 0, uyarilar: ["Sheet bulunamadı"], toplamBorc: 0, toplamAlacak: 0 };
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: "A", raw: false });
  const uyarilar: string[] = [];
  const satirlar: MizanRow[] = [];
  let toplamSatir = 0;
  let filtrelenenSatir = 0;
  let toplamBorc = 0;
  let toplamAlacak = 0;

  // İlk satır header — atla
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as any;
    const hesapKodu = String(r.A ?? "").trim();
    if (!hesapKodu) continue; // boş satır
    toplamSatir++;
    if (!hesapKodu.startsWith("120")) {
      filtrelenenSatir++;
      continue;
    }
    const hesapAdi = String(r.C ?? "").trim();
    if (!hesapAdi) {
      uyarilar.push(`Satır ${i + 1}: hesap adı boş (${hesapKodu})`);
      continue;
    }

    const borc = parseNum(r.F);
    const alacak = parseNum(r.G);
    const bakiyeBorc = parseNum(r.H);
    const bakiyeAlacak = parseNum(r.I);
    let sonBakiye = parseNum(r.J);
    let sonBakiyeBA = (String(r.K ?? "").trim().toUpperCase() || "B") as "B" | "A";

    // K boşsa H/I'dan türet
    if (!r.K) {
      if (bakiyeBorc > 0) { sonBakiyeBA = "B"; if (!sonBakiye) sonBakiye = bakiyeBorc; }
      else if (bakiyeAlacak > 0) { sonBakiyeBA = "A"; if (!sonBakiye) sonBakiye = bakiyeAlacak; }
    }

    toplamBorc += borc;
    toplamAlacak += alacak;

    satirlar.push({
      hesapKodu,
      doviz: r.B ? String(r.B).trim() : null,
      hesapAdi,
      borc,
      alacak,
      bakiyeBorc,
      bakiyeAlacak,
      sonBakiye,
      sonBakiyeBA,
      sonBorcTarihi: parseTarih(r.L),
      sonAlacakTarihi: parseTarih(r.M),
      grupKodu: r.N ? String(r.N).trim() : null,
      problemli: r.O ? String(r.O).toUpperCase().startsWith("E") || String(r.O) === "1" : false,
      limitTutar: r.P ? parseNum(r.P) : null,
      firmaGrubu: r.R ? String(r.R).trim() : null,
      sektor: r.S ? String(r.S).trim() : null,
    });
  }

  if (filtrelenenSatir > 0) {
    uyarilar.push(`${filtrelenenSatir} satır filtrelendi (120- ile başlamıyordu)`);
  }

  return {
    mizanTarihi: tahminMizanTarihi(filename),
    satirlar,
    toplamSatir,
    filtrelenenSatir,
    uyarilar,
    toplamBorc,
    toplamAlacak,
  };
}
```

- [ ] **Step 2: Smoke test gerçek dosya ile**

Create `_mizan_smoke.ts`:

```ts
import { parseMizanXlsx } from "./server/mizanParser";
import fs from "fs";

const buf = fs.readFileSync("mizan 08022026.xlsx");
const r = parseMizanXlsx(buf, "mizan 08022026.xlsx");
console.log("Mizan tarihi:", r.mizanTarihi, "(beklenen 2026-02-08)");
console.log("Toplam satır:", r.toplamSatir);
console.log("Filtrelenen:", r.filtrelenenSatir);
console.log("Müşteri:", r.satirlar.length);
console.log("Toplam borç:", r.toplamBorc.toFixed(2));
console.log("Toplam alacak:", r.toplamAlacak.toFixed(2));
console.log("Uyarılar:", r.uyarilar);
console.log("\nİlk 3 satır:");
r.satirlar.slice(0, 3).forEach((s) => console.log(`  ${s.hesapKodu} | ${s.hesapAdi.slice(0, 40)} | bakiye: ${s.sonBakiye} ${s.sonBakiyeBA} | sonBorc: ${s.sonBorcTarihi} | sonAlacak: ${s.sonAlacakTarihi}`));
```

Run: `npx tsx _mizan_smoke.ts`
Expected: mizanTarihi="2026-02-08", müşteri sayısı 200+, ilk satırlarda Sumiriko/Teknik Malzeme/Plastiform vs.

- [ ] **Step 3: Cleanup + type-check + commit**

```bash
rm -f _mizan_smoke.ts
npm run check
git add server/mizanParser.ts
git commit -m "feat(tahsilat): server/mizanParser.ts — xlsx parse + 120- filtre"
```

---

## Task 6: Storage CRUD metodları

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Import + IStorage interface'e ekle**

`server/storage.ts`'in en üstündeki import bloğunu güncelle (mevcut izin import'larından sonra):

```ts
  bordroDosyalar, type BordroDosya, type InsertBordroDosya,
  calisanIzinler, type CalisanIzin, type InsertCalisanIzin,
  calisanIzinAcilisBakiyesi, type AcilisBakiye, type InsertAcilisBakiye,
  resmiTatiller, type ResmiTatil, type InsertResmiTatil,
  musteriler, type Musteri, type InsertMusteri,
  mizanYuklemeleri, type MizanYukleme, type InsertMizanYukleme,
  mizanBakiye, type MizanBakiye, type InsertMizanBakiye,
  mizanEslestirmeLog, type EslestirmeLog, type InsertEslestirmeLog,
  mizanEslestirmeOnerileri, type EslestirmeOneri, type InsertEslestirmeOneri,
  tahsilatAyarlari, type TahsilatAyarlari, type InsertTahsilatAyarlari } from "@shared/schema";
```

IStorage interface'in sonuna (mevcut `getResmiTatiller`'den sonra) ekle:

```ts
  // Tahsilat — müşteri
  getMusteriler(filter?: { gorulmePencereGun?: number; sektor?: string; search?: string }): Promise<Musteri[]>;
  getMusteri(id: string): Promise<Musteri | null>;
  getMusteriByHesapKodu(hesapKodu: string): Promise<Musteri | null>;
  insertMusteri(data: InsertMusteri): Promise<Musteri>;
  updateMusteri(id: string, data: Partial<InsertMusteri>): Promise<Musteri | null>;

  // Tahsilat — mizan yüklemeleri
  getMizanYuklemeleri(): Promise<MizanYukleme[]>;
  getMizanYukleme(id: string): Promise<MizanYukleme | null>;
  getMizanByMd5(md5: string): Promise<MizanYukleme | null>;
  insertMizanYukleme(data: InsertMizanYukleme): Promise<MizanYukleme>;
  deleteMizanYukleme(id: string): Promise<{ filename: string } | null>;

  // Tahsilat — bakiye
  insertMizanBakiyeBatch(rows: InsertMizanBakiye[]): Promise<number>;
  getMusteriBakiyeTimeline(musteriId: string): Promise<(MizanBakiye & { mizanTarihi: string })[]>;
  getEnSonBakiyelerByMizan(mizanId: string): Promise<MizanBakiye[]>;

  // Tahsilat — eşleştirme
  getEslestirmeOnerileri(): Promise<(EslestirmeOneri & { musteriAd: string })[]>;
  insertEslestirmeOneri(data: InsertEslestirmeOneri): Promise<EslestirmeOneri>;
  onaylaOneri(oneriId: string): Promise<EslestirmeOneri | null>;
  reddetOneri(oneriId: string): Promise<EslestirmeOneri | null>;
  insertEslestirmeLog(data: InsertEslestirmeLog): Promise<EslestirmeLog>;
  addGumrukUnvan(musteriId: string, gumrukUnvan: string): Promise<Musteri | null>;
  removeGumrukUnvan(musteriId: string, gumrukUnvan: string): Promise<Musteri | null>;

  // Tahsilat — ayarlar
  getTahsilatAyarlari(): Promise<TahsilatAyarlari>;
  updateTahsilatAyarlari(data: Partial<InsertTahsilatAyarlari>): Promise<TahsilatAyarlari>;
}
```

- [ ] **Step 2: DatabaseStorage'a implementasyonları ekle**

Sınıfın sonuna (mevcut `upsertAcilisBakiye`'den sonra) ekle:

```ts
  // ============================================================================
  // TAHSİLAT — MÜŞTERİ
  // ============================================================================

  async getMusteriler(filter?: { gorulmePencereGun?: number; sektor?: string; search?: string }): Promise<Musteri[]> {
    const filters = [];
    if (filter?.sektor) filters.push(eq(musteriler.sektor, filter.sektor));
    if (filter?.gorulmePencereGun != null) {
      const cutoff = new Date(Date.now() - filter.gorulmePencereGun * 86400000);
      filters.push(sql`${musteriler.sonGoruldugu} >= ${cutoff}`);
    }
    if (filter?.search) {
      const s = `%${filter.search}%`;
      filters.push(sql`(${musteriler.ad} ILIKE ${s} OR ${musteriler.hesapKodu} ILIKE ${s})`);
    }
    if (filters.length > 0) {
      return await db.select().from(musteriler).where(and(...filters)).orderBy(musteriler.ad);
    }
    return await db.select().from(musteriler).orderBy(musteriler.ad);
  }

  async getMusteri(id: string): Promise<Musteri | null> {
    const [row] = await db.select().from(musteriler).where(eq(musteriler.id, id));
    return row ?? null;
  }

  async getMusteriByHesapKodu(hesapKodu: string): Promise<Musteri | null> {
    const [row] = await db.select().from(musteriler).where(eq(musteriler.hesapKodu, hesapKodu));
    return row ?? null;
  }

  async insertMusteri(data: InsertMusteri): Promise<Musteri> {
    const [row] = await db.insert(musteriler).values(data).returning();
    return row;
  }

  async updateMusteri(id: string, data: Partial<InsertMusteri>): Promise<Musteri | null> {
    const [row] = await db.update(musteriler).set(data).where(eq(musteriler.id, id)).returning();
    return row ?? null;
  }

  // ============================================================================
  // TAHSİLAT — MİZAN
  // ============================================================================

  async getMizanYuklemeleri(): Promise<MizanYukleme[]> {
    return await db.select().from(mizanYuklemeleri).orderBy(desc(mizanYuklemeleri.mizanTarihi));
  }

  async getMizanYukleme(id: string): Promise<MizanYukleme | null> {
    const [row] = await db.select().from(mizanYuklemeleri).where(eq(mizanYuklemeleri.id, id));
    return row ?? null;
  }

  async getMizanByMd5(md5: string): Promise<MizanYukleme | null> {
    const [row] = await db.select().from(mizanYuklemeleri).where(eq(mizanYuklemeleri.md5Hash, md5));
    return row ?? null;
  }

  async insertMizanYukleme(data: InsertMizanYukleme): Promise<MizanYukleme> {
    const [row] = await db.insert(mizanYuklemeleri).values(data).returning();
    return row;
  }

  async deleteMizanYukleme(id: string): Promise<{ filename: string } | null> {
    const [m] = await db.select().from(mizanYuklemeleri).where(eq(mizanYuklemeleri.id, id));
    if (!m) return null;
    // mizan_bakiye CASCADE ile silinir
    await db.delete(mizanYuklemeleri).where(eq(mizanYuklemeleri.id, id));
    if (m.filepath) {
      try { await fs.unlink(m.filepath); } catch (e: any) {
        if (e.code !== "ENOENT") console.error("Mizan dosyası silinemedi:", e);
      }
    }
    return { filename: m.filename };
  }

  // ============================================================================
  // TAHSİLAT — BAKİYE
  // ============================================================================

  async insertMizanBakiyeBatch(rows: InsertMizanBakiye[]): Promise<number> {
    if (rows.length === 0) return 0;
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const r = await db.insert(mizanBakiye).values(chunk).returning({ id: mizanBakiye.id });
      inserted += r.length;
    }
    return inserted;
  }

  async getMusteriBakiyeTimeline(musteriId: string): Promise<(MizanBakiye & { mizanTarihi: string })[]> {
    const rows = await db
      .select({
        id: mizanBakiye.id,
        mizanId: mizanBakiye.mizanId,
        musteriId: mizanBakiye.musteriId,
        borc: mizanBakiye.borc,
        alacak: mizanBakiye.alacak,
        bakiyeBorc: mizanBakiye.bakiyeBorc,
        bakiyeAlacak: mizanBakiye.bakiyeAlacak,
        sonBakiye: mizanBakiye.sonBakiye,
        sonBakiyeBA: mizanBakiye.sonBakiyeBA,
        sonBorcTarihi: mizanBakiye.sonBorcTarihi,
        sonAlacakTarihi: mizanBakiye.sonAlacakTarihi,
        mizanTarihi: mizanYuklemeleri.mizanTarihi,
      })
      .from(mizanBakiye)
      .innerJoin(mizanYuklemeleri, eq(mizanBakiye.mizanId, mizanYuklemeleri.id))
      .where(eq(mizanBakiye.musteriId, musteriId))
      .orderBy(mizanYuklemeleri.mizanTarihi);
    return rows as any;
  }

  async getEnSonBakiyelerByMizan(mizanId: string): Promise<MizanBakiye[]> {
    return await db.select().from(mizanBakiye).where(eq(mizanBakiye.mizanId, mizanId));
  }

  // ============================================================================
  // TAHSİLAT — EŞLEŞTİRME
  // ============================================================================

  async getEslestirmeOnerileri(): Promise<(EslestirmeOneri & { musteriAd: string })[]> {
    const rows = await db
      .select({
        id: mizanEslestirmeOnerileri.id,
        musteriId: mizanEslestirmeOnerileri.musteriId,
        gumrukUnvan: mizanEslestirmeOnerileri.gumrukUnvan,
        benzerlikSkoru: mizanEslestirmeOnerileri.benzerlikSkoru,
        olusturmaTarihi: mizanEslestirmeOnerileri.olusturmaTarihi,
        reddedildi: mizanEslestirmeOnerileri.reddedildi,
        musteriAd: musteriler.ad,
      })
      .from(mizanEslestirmeOnerileri)
      .innerJoin(musteriler, eq(mizanEslestirmeOnerileri.musteriId, musteriler.id))
      .where(eq(mizanEslestirmeOnerileri.reddedildi, false))
      .orderBy(desc(mizanEslestirmeOnerileri.benzerlikSkoru));
    return rows as any;
  }

  async insertEslestirmeOneri(data: InsertEslestirmeOneri): Promise<EslestirmeOneri> {
    // Aynı musteriId+gumrukUnvan varsa skip (UNIQUE constraint)
    try {
      const [row] = await db.insert(mizanEslestirmeOnerileri).values(data).returning();
      return row;
    } catch (e: any) {
      // Mevcut öneri var, döndür
      const [existing] = await db.select().from(mizanEslestirmeOnerileri).where(
        and(eq(mizanEslestirmeOnerileri.musteriId, data.musteriId), eq(mizanEslestirmeOnerileri.gumrukUnvan, data.gumrukUnvan))
      );
      return existing;
    }
  }

  async onaylaOneri(oneriId: string): Promise<EslestirmeOneri | null> {
    const [oneri] = await db.select().from(mizanEslestirmeOnerileri).where(eq(mizanEslestirmeOnerileri.id, oneriId));
    if (!oneri) return null;
    await this.addGumrukUnvan(oneri.musteriId, oneri.gumrukUnvan);
    await this.insertEslestirmeLog({
      musteriId: oneri.musteriId,
      gumrukUnvan: oneri.gumrukUnvan,
      eklemeTipi: "manual",
      benzerlikSkoru: oneri.benzerlikSkoru,
    });
    await db.delete(mizanEslestirmeOnerileri).where(eq(mizanEslestirmeOnerileri.id, oneriId));
    return oneri;
  }

  async reddetOneri(oneriId: string): Promise<EslestirmeOneri | null> {
    const [row] = await db.update(mizanEslestirmeOnerileri).set({ reddedildi: true }).where(eq(mizanEslestirmeOnerileri.id, oneriId)).returning();
    return row ?? null;
  }

  async insertEslestirmeLog(data: InsertEslestirmeLog): Promise<EslestirmeLog> {
    const [row] = await db.insert(mizanEslestirmeLog).values(data).returning();
    return row;
  }

  async addGumrukUnvan(musteriId: string, gumrukUnvan: string): Promise<Musteri | null> {
    const m = await this.getMusteri(musteriId);
    if (!m) return null;
    const yeni = Array.from(new Set([...(m.gumrukFirmaUnvanlari || []), gumrukUnvan]));
    return await this.updateMusteri(musteriId, { gumrukFirmaUnvanlari: yeni } as any);
  }

  async removeGumrukUnvan(musteriId: string, gumrukUnvan: string): Promise<Musteri | null> {
    const m = await this.getMusteri(musteriId);
    if (!m) return null;
    const yeni = (m.gumrukFirmaUnvanlari || []).filter((u) => u !== gumrukUnvan);
    return await this.updateMusteri(musteriId, { gumrukFirmaUnvanlari: yeni } as any);
  }

  // ============================================================================
  // TAHSİLAT — AYARLAR (single-row)
  // ============================================================================

  private static readonly TAHSILAT_AYARLARI_ID = "00000000-0000-0000-0000-000000000001";

  async getTahsilatAyarlari(): Promise<TahsilatAyarlari> {
    const [row] = await db.select().from(tahsilatAyarlari).where(eq(tahsilatAyarlari.id, DatabaseStorage.TAHSILAT_AYARLARI_ID));
    if (row) return row;
    // Default kayıt yoksa oluştur
    const [created] = await db.insert(tahsilatAyarlari).values({
      id: DatabaseStorage.TAHSILAT_AYARLARI_ID,
      vipEsik: "5000000",
      yuksekBakiyeEsik: "500000",
      eskiOdemeEsik: 30,
      cokEskiOdemeEsik: 60,
      eksiPozisyonYuzde: 20,
      faturaPenceresi: 90,
    }).returning();
    return created;
  }

  async updateTahsilatAyarlari(data: Partial<InsertTahsilatAyarlari>): Promise<TahsilatAyarlari> {
    await this.getTahsilatAyarlari(); // varlığı garanti et
    const [row] = await db
      .update(tahsilatAyarlari)
      .set({ ...data, guncellenme: new Date() })
      .where(eq(tahsilatAyarlari.id, DatabaseStorage.TAHSILAT_AYARLARI_ID))
      .returning();
    return row;
  }
}
```

- [ ] **Step 3: Type-check + commit**

```bash
npm run check
git add server/storage.ts
git commit -m "feat(tahsilat): storage CRUD — müşteri, mizan, bakiye, eşleştirme, ayarlar"
```

---

## Task 7: API Endpoints (14 adet)

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Import + multer ekle**

`server/routes.ts`'in import bölümüne ekle:

```ts
import { isGunuSayisi, bakiyeHesapla } from "@shared/izinHesaplari";
import { type InsertAcilisBakiye, type InsertCalisanIzin } from "@shared/schema";
import { parseMizanXlsx } from "./mizanParser";
import { benzerlikSkoru, ESLESME_AUTO_ESIK, ESLESME_ONERI_ESIK } from "./eslestirme";
import {
  netBakiye, gecikme, isAktivitesiAcigi, bakiyeFaturaAcigi, riskProfili,
  type RiskEsikleri,
} from "@shared/tahsilatHesaplari";
import { type InsertMusteri, type InsertMizanYukleme, type InsertMizanBakiye, type InsertEslestirmeOneri } from "@shared/schema";
```

Multer için (mevcut `uploadBordroMemory`'nin yanına):

```ts
const uploadMizanMemory = multer({ storage: multer.memoryStorage() });
```

- [ ] **Step 2: 14 endpoint ekle**

Mevcut `/api/resmi-tatiller` endpoint'inden sonra ekle:

```ts
  // ============================================================================
  // MÜŞTERİ TAHSİLAT MODÜLÜ
  // ============================================================================

  // 1. Mizan upload — parse + önizleme döner (kaydetmez)
  app.post("/api/tahsilat/mizan/upload", uploadMizanMemory.single("xlsx"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Dosya gönderilmedi" });

      const filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
      const md5 = createHash("md5").update(req.file.buffer).digest("hex");
      const duplicate = await storage.getMizanByMd5(md5);

      const parsed = parseMizanXlsx(req.file.buffer, filename);
      const mizanTarihi = (req.body.mizanTarihi as string) || parsed.mizanTarihi || new Date().toISOString().slice(0, 10);

      // Otomatik tahmini özet — yeni vs mevcut müşteri sayısı
      let yeniMusteri = 0;
      let mevcutMusteri = 0;
      for (const r of parsed.satirlar) {
        const m = await storage.getMusteriByHesapKodu(r.hesapKodu);
        if (m) mevcutMusteri++;
        else yeniMusteri++;
      }

      res.json({
        filename,
        md5,
        mizanTarihi,
        toplamSatir: parsed.toplamSatir,
        filtrelenenSatir: parsed.filtrelenenSatir,
        kayitSayisi: parsed.satirlar.length,
        toplamBorc: parsed.toplamBorc,
        toplamAlacak: parsed.toplamAlacak,
        uyarilar: parsed.uyarilar,
        yeniMusteri,
        mevcutMusteri,
        duplicate: duplicate ? { id: duplicate.id, mizanTarihi: duplicate.mizanTarihi } : null,
        satirlar: parsed.satirlar, // önizleme için tam liste
      });
    } catch (e: any) {
      console.error("Mizan upload hatası:", e);
      res.status(500).json({ error: e.message || "Mizan parse edilirken hata oluştu" });
    }
  });

  // 2. Mizan save — onaylanan veriyi yaz (re-upload, çünkü buffer'ı saklamıyoruz)
  app.post("/api/tahsilat/mizan/save", uploadMizanMemory.single("xlsx"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Dosya gönderilmedi" });
      const filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
      const md5 = createHash("md5").update(req.file.buffer).digest("hex");
      const overrideDuplicate = req.body.overrideDuplicate === "true";
      if (!overrideDuplicate) {
        const dup = await storage.getMizanByMd5(md5);
        if (dup) return res.status(409).json({ error: "Aynı dosya daha önce yüklenmiş", duplicateId: dup.id });
      }

      const mizanTarihi = (req.body.mizanTarihi as string) || new Date().toISOString().slice(0, 10);
      const not = (req.body.not as string) || null;

      const parsed = parseMizanXlsx(req.file.buffer, filename);
      if (parsed.satirlar.length === 0) {
        return res.status(400).json({ error: "Mizan'da 120- ile başlayan satır bulunamadı" });
      }

      // Filesystem arşivi
      const yil = mizanTarihi.slice(0, 4);
      const ay = mizanTarihi.slice(5, 7);
      const safeName = filename.replace(/[\\/:*?"<>|]/g, "_");
      const archiveDir = path.join(process.cwd(), "uploads", "mizan", yil, ay);
      if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
      const filepath = path.join(archiveDir, `${md5}-${safeName}`);
      await fs.promises.writeFile(filepath, req.file.buffer);

      // Net bakiye toplamı (signed)
      const toplamNetBakiye = parsed.satirlar.reduce(
        (acc, r) => acc + netBakiye({ sonBakiye: r.sonBakiye, sonBakiyeBA: r.sonBakiyeBA }),
        0,
      );

      // 1. mizanYuklemeleri'ne ekle
      const mizan = await storage.insertMizanYukleme({
        mizanTarihi,
        filename,
        filepath,
        sizeBytes: req.file.size,
        md5Hash: md5,
        kayitSayisi: parsed.satirlar.length,
        toplamNetBakiye: String(toplamNetBakiye),
        not,
      });

      // 2. Müşterileri upsert + bakiyeleri ekle + eşleştirme önerileri tetikle
      let eklenenMusteri = 0;
      let guncellenenMusteri = 0;
      const bakiyeBatch: InsertMizanBakiye[] = [];

      // Gümrük firma unvanlarını cache'le (eşleştirme önerisi için)
      const gumrukUnvanlarSet = new Set<string>();
      const gumrukVeriler = await storage.getAllGumrukVerileri();
      gumrukVeriler.forEach((g) => { if (g.firmaUnvan) gumrukUnvanlarSet.add(g.firmaUnvan); });
      const gumrukUnvanlar = Array.from(gumrukUnvanlarSet);

      for (const r of parsed.satirlar) {
        let musteri = await storage.getMusteriByHesapKodu(r.hesapKodu);
        if (!musteri) {
          // Otomatik eşleştirme dene
          let gumrukEslesen: string | null = null;
          let oneriler: { unvan: string; skor: number }[] = [];
          for (const u of gumrukUnvanlar) {
            const s = benzerlikSkoru(r.hesapAdi, u);
            if (s >= ESLESME_AUTO_ESIK && !gumrukEslesen) gumrukEslesen = u;
            else if (s >= ESLESME_ONERI_ESIK && s < ESLESME_AUTO_ESIK) oneriler.push({ unvan: u, skor: s });
          }
          musteri = await storage.insertMusteri({
            hesapKodu: r.hesapKodu,
            ad: r.hesapAdi,
            sektor: r.sektor,
            firmaGrubu: r.firmaGrubu,
            limitTutar: r.limitTutar != null ? String(r.limitTutar) : null,
            problemli: r.problemli,
            gumrukFirmaUnvanlari: gumrukEslesen ? [gumrukEslesen] : [],
            sonGoruldugu: new Date(),
          } as any);
          if (gumrukEslesen) {
            await storage.insertEslestirmeLog({
              musteriId: musteri.id,
              gumrukUnvan: gumrukEslesen,
              eklemeTipi: "auto-fuzzy",
              benzerlikSkoru: "1.000",
            });
          }
          for (const o of oneriler.slice(0, 5)) { // max 5 öneri / müşteri
            await storage.insertEslestirmeOneri({
              musteriId: musteri.id,
              gumrukUnvan: o.unvan,
              benzerlikSkoru: String(o.skor.toFixed(3)),
            });
          }
          eklenenMusteri++;
        } else {
          // Latest-wins update
          await storage.updateMusteri(musteri.id, {
            ad: r.hesapAdi,
            sektor: r.sektor,
            firmaGrubu: r.firmaGrubu,
            limitTutar: r.limitTutar != null ? String(r.limitTutar) : null,
            problemli: r.problemli,
            sonGoruldugu: new Date(),
          } as any);
          guncellenenMusteri++;
        }

        bakiyeBatch.push({
          mizanId: mizan.id,
          musteriId: musteri.id,
          borc: String(r.borc),
          alacak: String(r.alacak),
          bakiyeBorc: String(r.bakiyeBorc),
          bakiyeAlacak: String(r.bakiyeAlacak),
          sonBakiye: String(r.sonBakiye),
          sonBakiyeBA: r.sonBakiyeBA,
          sonBorcTarihi: r.sonBorcTarihi,
          sonAlacakTarihi: r.sonAlacakTarihi,
        });
      }

      const eklenenBakiye = await storage.insertMizanBakiyeBatch(bakiyeBatch);

      res.json({
        success: true,
        mizanId: mizan.id,
        eklenenMusteri,
        guncellenenMusteri,
        eklenenBakiye,
      });
    } catch (e: any) {
      console.error("Mizan save hatası:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // 3. Mizan listesi
  app.get("/api/tahsilat/mizan", async (_req, res) => {
    try {
      const list = await storage.getMizanYuklemeleri();
      res.json(list);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 4. Mizan detay
  app.get("/api/tahsilat/mizan/:id", async (req, res) => {
    try {
      const m = await storage.getMizanYukleme(req.params.id);
      if (!m) return res.status(404).json({ error: "Bulunamadı" });
      res.json(m);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 5. Mizan sil
  app.delete("/api/tahsilat/mizan/:id", async (req, res) => {
    try {
      const r = await storage.deleteMizanYukleme(req.params.id);
      if (!r) return res.status(404).json({ error: "Bulunamadı" });
      res.json(r);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 6. Müşteri liste (filter destekli)
  app.get("/api/tahsilat/musteriler", async (req, res) => {
    try {
      const gorulmePencereGun = req.query.gorulmePencereGun ? parseInt(req.query.gorulmePencereGun as string) : undefined;
      const sektor = req.query.sektor as string | undefined;
      const search = req.query.search as string | undefined;
      const list = await storage.getMusteriler({ gorulmePencereGun, sektor, search });
      res.json(list);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 7. Müşteri detay (en son bakiye + tüm bakiye geçmişi)
  app.get("/api/tahsilat/musteriler/:id", async (req, res) => {
    try {
      const m = await storage.getMusteri(req.params.id);
      if (!m) return res.status(404).json({ error: "Bulunamadı" });
      const timeline = await storage.getMusteriBakiyeTimeline(req.params.id);
      res.json({ musteri: m, timeline });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 8. Müşteri timeline (sadece bakiye serisi — chart için)
  app.get("/api/tahsilat/musteriler/:id/timeline", async (req, res) => {
    try {
      const timeline = await storage.getMusteriBakiyeTimeline(req.params.id);
      res.json(timeline);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 9. Müşteri update
  app.put("/api/tahsilat/musteriler/:id", async (req, res) => {
    try {
      const r = await storage.updateMusteri(req.params.id, req.body);
      if (!r) return res.status(404).json({ error: "Bulunamadı" });
      res.json(r);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 10. Dashboard — özet metrikler (en son mizan referansıyla)
  app.get("/api/tahsilat/dashboard", async (req, res) => {
    try {
      const mizanIdParam = req.query.mizanId as string | undefined;
      let mizan: any;
      if (mizanIdParam) {
        mizan = await storage.getMizanYukleme(mizanIdParam);
      } else {
        const all = await storage.getMizanYuklemeleri();
        mizan = all[0]; // en yeni
      }
      if (!mizan) return res.json({ mizan: null, ozet: null, musteriler: [] });

      const ayarlar = await storage.getTahsilatAyarlari();
      const esikler: RiskEsikleri = {
        vipEsik: Number(ayarlar.vipEsik),
        yuksekBakiyeEsik: Number(ayarlar.yuksekBakiyeEsik),
        eskiOdemeEsik: ayarlar.eskiOdemeEsik,
        cokEskiOdemeEsik: ayarlar.cokEskiOdemeEsik,
        eksiPozisyonYuzde: ayarlar.eksiPozisyonYuzde,
      };
      const refTarih = mizan.mizanTarihi;
      const bakiyeler = await storage.getEnSonBakiyelerByMizan(mizan.id);

      // Tüm müşterileri tek seferde çek (N+1 önleme)
      const musteriIdler = bakiyeler.map((b) => b.musteriId);
      const musteriList = musteriIdler.length > 0
        ? await db.select().from(musteriler).where(inArray(musteriler.id, musteriIdler))
        : [];
      const musteriMap = new Map(musteriList.map((m) => [m.id, m]));

      // Gümrük fatura toplamlarını tek seferde çek
      const tumGumruk = await storage.getAllGumrukVerileri();
      const faturaPenceresi = ayarlar.faturaPenceresi;
      const faturaCutoff = new Date(Date.now() - faturaPenceresi * 86400000);
      const yillikCutoff = new Date(Date.now() - 365 * 86400000);

      // unvan → { son90: number, yillik: number }
      const faturaMap = new Map<string, { son90: number; yillik: number }>();
      for (const g of tumGumruk) {
        if (!g.firmaUnvan || !g.faturaTarihi) continue;
        const tr = g.faturaTarihi.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (!tr) continue;
        const fTarih = new Date(`${tr[3]}-${tr[2]}-${tr[1]}`);
        const tutar = Number(g.topFaturaTutar || 0);
        if (!faturaMap.has(g.firmaUnvan)) faturaMap.set(g.firmaUnvan, { son90: 0, yillik: 0 });
        const entry = faturaMap.get(g.firmaUnvan)!;
        if (fTarih >= yillikCutoff) entry.yillik += tutar;
        if (fTarih >= faturaCutoff) entry.son90 += tutar;
      }

      // Her bakiye için risk hesapla
      const detaylar = bakiyeler.map((b) => {
        const m = musteriMap.get(b.musteriId);
        if (!m) return null;
        const sonBakiyeNum = Number(b.sonBakiye || 0);
        const nb = netBakiye({ sonBakiye: sonBakiyeNum, sonBakiyeBA: b.sonBakiyeBA || "B" });
        const gec = gecikme(b.sonAlacakTarihi, refTarih);
        const isAcik = isAktivitesiAcigi(b.sonBorcTarihi, b.sonAlacakTarihi);
        // Müşterinin tüm gümrük unvanlarının toplamı
        let son90 = 0, yillik = 0;
        for (const u of (m.gumrukFirmaUnvanlari || [])) {
          const f = faturaMap.get(u);
          if (f) { son90 += f.son90; yillik += f.yillik; }
        }
        const bfa = bakiyeFaturaAcigi(nb, son90);
        const risk = riskProfili({
          netBakiye: nb,
          gecikme: gec,
          isAktivitesiAcigi: isAcik,
          bakiyeFaturaAcikYuzde: bfa.acikYuzde,
          yillikFaturaToplami: yillik,
          esikler,
        });
        return {
          musteriId: m.id,
          ad: m.ad,
          hesapKodu: m.hesapKodu,
          sektor: m.sektor,
          firmaGrubu: m.firmaGrubu,
          netBakiye: nb,
          gecikme: gec,
          isAktivitesiAcigi: isAcik,
          bakiyeFaturaAcik: bfa.acik,
          bakiyeFaturaAcikYuzde: bfa.acikYuzde,
          son90Fatura: son90,
          yillikFatura: yillik,
          sonBorcTarihi: b.sonBorcTarihi,
          sonAlacakTarihi: b.sonAlacakTarihi,
          ...risk,
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null);

      // Özet metrikler
      const ozet = {
        toplamNetAlacak: detaylar.filter((d) => d.netBakiye > 0).reduce((a, d) => a + d.netBakiye, 0),
        vipSayisi: detaylar.filter((d) => d.vipRozeti).length,
        vipBakiyeToplam: detaylar.filter((d) => d.vipRozeti).reduce((a, d) => a + d.netBakiye, 0),
        yavasOdeyiciSayisi: detaylar.filter((d) => d.pattern === "YAVAS_ODEYICI").length,
        yavasOdeyiciCiro: detaylar.filter((d) => d.pattern === "YAVAS_ODEYICI").reduce((a, d) => a + d.netBakiye, 0),
        donukSayisi: detaylar.filter((d) => d.pattern === "DONUK_KAYIP").length,
        donukCiro: detaylar.filter((d) => d.pattern === "DONUK_KAYIP").reduce((a, d) => a + d.netBakiye, 0),
        eksiPozisyonSayisi: detaylar.filter((d) => d.eksiPozisyonRozeti).length,
        eksiPozisyonToplam: detaylar.filter((d) => d.eksiPozisyonRozeti).reduce((a, d) => a + d.bakiyeFaturaAcik, 0),
        sektorDagilim: Array.from(
          detaylar.reduce((acc, d) => {
            const k = d.sektor || "Belirsiz";
            acc.set(k, (acc.get(k) || 0) + d.netBakiye);
            return acc;
          }, new Map<string, number>()).entries()
        ).map(([sektor, toplam]) => ({ sektor, toplam })),
      };

      res.json({ mizan, ozet, musteriler: detaylar });
    } catch (e: any) {
      console.error("Dashboard hatası:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // 11. Eşleştirme önerileri
  app.get("/api/tahsilat/eslestirme/onerileri", async (_req, res) => {
    try {
      const list = await storage.getEslestirmeOnerileri();
      res.json(list);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 12. Öneri onayla
  app.post("/api/tahsilat/eslestirme/onayla/:oneriId", async (req, res) => {
    try {
      const r = await storage.onaylaOneri(req.params.oneriId);
      if (!r) return res.status(404).json({ error: "Bulunamadı" });
      res.json(r);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 13. Öneri reddet
  app.post("/api/tahsilat/eslestirme/reddet/:oneriId", async (req, res) => {
    try {
      const r = await storage.reddetOneri(req.params.oneriId);
      if (!r) return res.status(404).json({ error: "Bulunamadı" });
      res.json(r);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 14. Manuel ekleme/silme + ayarlar
  app.post("/api/tahsilat/eslestirme/manuel-ekle", async (req, res) => {
    try {
      const { musteriId, gumrukUnvan } = req.body;
      if (!musteriId || !gumrukUnvan) return res.status(400).json({ error: "musteriId ve gumrukUnvan zorunlu" });
      const m = await storage.addGumrukUnvan(musteriId, gumrukUnvan);
      if (!m) return res.status(404).json({ error: "Müşteri bulunamadı" });
      await storage.insertEslestirmeLog({ musteriId, gumrukUnvan, eklemeTipi: "manual", benzerlikSkoru: "1.000" });
      res.json(m);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/tahsilat/eslestirme/:musteriId/:gumrukUnvan", async (req, res) => {
    try {
      const m = await storage.removeGumrukUnvan(req.params.musteriId, decodeURIComponent(req.params.gumrukUnvan));
      if (!m) return res.status(404).json({ error: "Bulunamadı" });
      res.json(m);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/tahsilat/ayarlar", async (_req, res) => {
    try {
      const a = await storage.getTahsilatAyarlari();
      res.json(a);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/tahsilat/ayarlar", async (req, res) => {
    try {
      const a = await storage.updateTahsilatAyarlari(req.body);
      res.json(a);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
```

- [ ] **Step 3: Type-check + commit**

```bash
npm run check
git add server/routes.ts
git commit -m "feat(tahsilat): API endpoints — mizan upload/save/list/delete, müşteri, dashboard, eşleştirme, ayarlar"
```

- [ ] **Step 4: Manuel curl test (dev server çalışıyorken)**

```bash
# Mizan dashboard (henüz mizan yok)
curl http://localhost:5000/api/tahsilat/dashboard
# Beklenen: { "mizan": null, "ozet": null, "musteriler": [] }

# Ayarlar (default oluşturulur)
curl http://localhost:5000/api/tahsilat/ayarlar
# Beklenen: vipEsik=5000000 vs.

# Mizan upload (gerçek dosya ile)
curl -X POST http://localhost:5000/api/tahsilat/mizan/upload \
  -F "xlsx=@mizan 08022026.xlsx"
# Beklenen: { kayitSayisi: 200+, satirlar: [...], yeniMusteri, mevcutMusteri, duplicate: null }

# Mizan save
curl -X POST http://localhost:5000/api/tahsilat/mizan/save \
  -F "xlsx=@mizan 08022026.xlsx" \
  -F "mizanTarihi=2026-02-08"
# Beklenen: { success: true, eklenenMusteri: 200+, eklenenBakiye: 200+ }

# Dashboard (artık dolu)
curl http://localhost:5000/api/tahsilat/dashboard
# Beklenen: ozet metrikler + müşteri listesi
```

---

## Task 8: UI iskelet — Tahsilat.tsx yeniden

**Files:**
- Modify: `client/src/pages/Tahsilat.tsx` (eski 324 satır → yeni iskelet)

- [ ] **Step 1: Eski içeriği komple sil ve yeniden yaz**

```tsx
// client/src/pages/Tahsilat.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutDashboard, Users, TrendingUp, Link2, Archive, Upload } from "lucide-react";

import { MizanYukleModal } from "@/components/tahsilat/MizanYukleModal";
import { TahsilatOzet } from "@/components/tahsilat/TahsilatOzet";
import { MusteriListesi } from "@/components/tahsilat/MusteriListesi";
import { TahsilatTrend } from "@/components/tahsilat/TahsilatTrend";
import { EslestirmeUI } from "@/components/tahsilat/EslestirmeUI";
import { MizanArsivi } from "@/components/tahsilat/MizanArsivi";

interface MizanRow {
  id: string;
  mizanTarihi: string;
  kayitSayisi: number;
}

export default function Tahsilat() {
  const [yukleOpen, setYukleOpen] = useState(false);
  const [selectedMizanId, setSelectedMizanId] = useState<string | undefined>();

  const { data: mizanList } = useQuery<MizanRow[]>({ queryKey: ["/api/tahsilat/mizan"] });
  const aktifMizanId = selectedMizanId || mizanList?.[0]?.id;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Müşteri Tahsilat</h1>
          <p className="text-muted-foreground">Mizan yükle, risk analizini ve trend takibini gör.</p>
        </div>
        <div className="flex items-center gap-2">
          {mizanList && mizanList.length > 0 && (
            <Select value={aktifMizanId} onValueChange={setSelectedMizanId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Mizan seç" />
              </SelectTrigger>
              <SelectContent>
                {mizanList.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.mizanTarihi} ({m.kayitSayisi} müşteri)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setYukleOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Mizan Yükle
          </Button>
        </div>
      </div>

      <Tabs defaultValue="ozet" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="ozet" className="gap-2"><LayoutDashboard className="w-4 h-4" /> Özet</TabsTrigger>
          <TabsTrigger value="musteriler" className="gap-2"><Users className="w-4 h-4" /> Müşteriler</TabsTrigger>
          <TabsTrigger value="trend" className="gap-2"><TrendingUp className="w-4 h-4" /> Trend</TabsTrigger>
          <TabsTrigger value="eslestirme" className="gap-2"><Link2 className="w-4 h-4" /> Eşleştirme</TabsTrigger>
          <TabsTrigger value="arsiv" className="gap-2"><Archive className="w-4 h-4" /> Arşiv</TabsTrigger>
        </TabsList>

        <TabsContent value="ozet" className="mt-6"><TahsilatOzet mizanId={aktifMizanId} /></TabsContent>
        <TabsContent value="musteriler" className="mt-6"><MusteriListesi mizanId={aktifMizanId} /></TabsContent>
        <TabsContent value="trend" className="mt-6"><TahsilatTrend /></TabsContent>
        <TabsContent value="eslestirme" className="mt-6"><EslestirmeUI /></TabsContent>
        <TabsContent value="arsiv" className="mt-6"><MizanArsivi /></TabsContent>
      </Tabs>

      <MizanYukleModal open={yukleOpen} onClose={() => setYukleOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Boş component placeholder'ları yarat**

`client/src/components/tahsilat/` klasörü oluştur, içine 7 placeholder dosya:

```tsx
// client/src/components/tahsilat/MizanYukleModal.tsx
export function MizanYukleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return null; // Task 9'da dolacak
}

// client/src/components/tahsilat/TahsilatOzet.tsx
export function TahsilatOzet({ mizanId }: { mizanId?: string }) {
  return <div className="text-center text-muted-foreground py-12">Özet — Task 12</div>;
}

// client/src/components/tahsilat/MusteriListesi.tsx
export function MusteriListesi({ mizanId }: { mizanId?: string }) {
  return <div className="text-center text-muted-foreground py-12">Müşteri Listesi — Task 11</div>;
}

// client/src/components/tahsilat/MusteriDrillDown.tsx
export function MusteriDrillDown({ musteriId, onClose }: { musteriId: string | null; onClose: () => void }) {
  return null; // Task 13
}

// client/src/components/tahsilat/TahsilatTrend.tsx
export function TahsilatTrend() {
  return <div className="text-center text-muted-foreground py-12">Trend — Task 14</div>;
}

// client/src/components/tahsilat/EslestirmeUI.tsx
export function EslestirmeUI() {
  return <div className="text-center text-muted-foreground py-12">Eşleştirme — Task 15</div>;
}

// client/src/components/tahsilat/MizanArsivi.tsx
export function MizanArsivi() {
  return <div className="text-center text-muted-foreground py-12">Arşiv — Task 10</div>;
}

// client/src/components/tahsilat/RiskEsikleriModal.tsx
export function RiskEsikleriModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return null; // Task 11 içinde wire
}
```

- [ ] **Step 3: Type-check + commit**

```bash
npm run check
git add client/src/pages/Tahsilat.tsx client/src/components/tahsilat/
git commit -m "feat(tahsilat): UI iskelet — 5 sekmeli Tahsilat sayfası + placeholder componentler"
```

---

## Task 9: MizanYukleModal

**Files:**
- Modify: `client/src/components/tahsilat/MizanYukleModal.tsx`

- [ ] **Step 1: Modal component**

```tsx
// client/src/components/tahsilat/MizanYukleModal.tsx
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OnizlemeSonuc {
  filename: string;
  md5: string;
  mizanTarihi: string;
  toplamSatir: number;
  filtrelenenSatir: number;
  kayitSayisi: number;
  toplamBorc: number;
  toplamAlacak: number;
  uyarilar: string[];
  yeniMusteri: number;
  mevcutMusteri: number;
  duplicate: { id: string; mizanTarihi: string } | null;
}

export function MizanYukleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [mizanTarihi, setMizanTarihi] = useState<string>("");
  const [not, setNot] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [onizleme, setOnizleme] = useState<OnizlemeSonuc | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const reset = () => { setFile(null); setMizanTarihi(""); setNot(""); setOnizleme(null); };
  const handleClose = () => { reset(); onClose(); };

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  const handleOnizle = async () => {
    if (!file) return;
    setBusy(true); setOnizleme(null);
    const fd = new FormData();
    fd.append("xlsx", file);
    if (mizanTarihi) fd.append("mizanTarihi", mizanTarihi);
    try {
      const r = await fetch("/api/tahsilat/mizan/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOnizleme(j);
      if (!mizanTarihi && j.mizanTarihi) setMizanTarihi(j.mizanTarihi);
      toast({ title: "Önizleme hazır", description: `${j.kayitSayisi} müşteri okundu` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: e.message });
    } finally { setBusy(false); }
  };

  const handleSave = async () => {
    if (!file || !onizleme) return;
    if (onizleme.duplicate && !confirm(`Bu dosya ${onizleme.duplicate.mizanTarihi} tarihiyle daha önce yüklenmiş. Yine de yüklensin mi?`)) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("xlsx", file);
    fd.append("mizanTarihi", mizanTarihi || onizleme.mizanTarihi);
    if (not) fd.append("not", not);
    if (onizleme.duplicate) fd.append("overrideDuplicate", "true");
    try {
      const r = await fetch("/api/tahsilat/mizan/save", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast({ title: "Kaydedildi", description: `${j.eklenenMusteri} yeni, ${j.guncellenenMusteri} güncelleme, ${j.eklenenBakiye} bakiye kaydı` });
      qc.invalidateQueries({ queryKey: ["/api/tahsilat/mizan"] });
      qc.invalidateQueries({ queryKey: ["/api/tahsilat/dashboard"] });
      qc.invalidateQueries({ queryKey: ["/api/tahsilat/musteriler"] });
      qc.invalidateQueries({ queryKey: ["/api/tahsilat/eslestirme/onerileri"] });
      handleClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Hata", description: e.message });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Mizan Yükle</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Mizan Tarihi (boş bırakılırsa dosya adından çıkarılır)</Label>
            <Input type="date" value={mizanTarihi} onChange={(e) => setMizanTarihi(e.target.value)} />
          </div>
          <div>
            <Label>Excel Dosyası</Label>
            <Input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setOnizleme(null); }} />
          </div>
          <div>
            <Label>Not (opsiyonel)</Label>
            <Textarea value={not} onChange={(e) => setNot(e.target.value)} rows={2} />
          </div>

          {!onizleme ? (
            <Button onClick={handleOnizle} disabled={!file || busy} className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Önizle
            </Button>
          ) : (
            <div className="space-y-3 border-t pt-3">
              <div className="text-sm font-semibold">Önizleme:</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>📅 Mizan tarihi: <strong>{onizleme.mizanTarihi}</strong></div>
                <div>📊 Müşteri sayısı: <strong>{onizleme.kayitSayisi}</strong></div>
                <div>➕ Yeni müşteri: <strong className="text-green-600">{onizleme.yeniMusteri}</strong></div>
                <div>🔄 Güncellenecek: <strong className="text-blue-600">{onizleme.mevcutMusteri}</strong></div>
                <div>💰 Toplam borç: <strong>{fmtTry(onizleme.toplamBorc)}</strong></div>
                <div>💵 Toplam alacak: <strong>{fmtTry(onizleme.toplamAlacak)}</strong></div>
              </div>
              {onizleme.uyarilar.length > 0 && (
                <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm">
                  <AlertTriangle className="w-4 h-4 inline mr-1 text-yellow-600" />
                  <strong>Uyarılar:</strong>
                  <ul className="list-disc list-inside mt-1 text-xs text-muted-foreground">
                    {onizleme.uyarilar.map((u, i) => <li key={i}>{u}</li>)}
                  </ul>
                </div>
              )}
              {onizleme.duplicate && (
                <div className="rounded border border-orange-500/30 bg-orange-500/5 p-3 text-sm">
                  <AlertTriangle className="w-4 h-4 inline mr-1 text-orange-600" />
                  Bu dosya <strong>{onizleme.duplicate.mizanTarihi}</strong> tarihiyle daha önce yüklenmiş. "Onayla ve Kaydet"e basarsan tekrar yüklenecek.
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOnizleme(null)} className="flex-1">Geri</Button>
                <Button onClick={handleSave} disabled={busy} className="flex-1">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Onayla ve Kaydet
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check + tarayıcı test**

Run: `npm run check`
Tarayıcı: Tahsilat sayfası → "Mizan Yükle" butonu → modal açılır → `mizan 08022026.xlsx` seç → Önizle → istatistikler görünür → Onayla → toast başarı mesajı.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/tahsilat/MizanYukleModal.tsx
git commit -m "feat(tahsilat): MizanYukleModal — önizleme + duplicate uyarısı + onayla&kaydet"
```

---

## Task 10: MizanArsivi sekmesi

**Files:**
- Modify: `client/src/components/tahsilat/MizanArsivi.tsx`

- [ ] **Step 1: Component**

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MizanRow {
  id: string;
  mizanTarihi: string;
  filename: string;
  sizeBytes: number | null;
  kayitSayisi: number;
  toplamNetBakiye: string | null;
  yuklemeTarihi: string;
  not: string | null;
}

export function MizanArsivi() {
  const { data: list, isLoading } = useQuery<MizanRow[]>({ queryKey: ["/api/tahsilat/mizan"] });
  const qc = useQueryClient();
  const { toast } = useToast();

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);
  const fmtSize = (b: number | null) => b ? (b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(2)} MB`) : "-";

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`"${filename}" mizan'ı silinsin mi? İlişkili tüm bakiye kayıtları da silinir.`)) return;
    const r = await fetch(`/api/tahsilat/mizan/${id}`, { method: "DELETE" });
    if (!r.ok) { toast({ variant: "destructive", title: "Silinemedi" }); return; }
    toast({ title: "Silindi", description: filename });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/mizan"] });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/dashboard"] });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (!list?.length) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş.</div>;

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mizan Tarihi</TableHead>
              <TableHead>Dosya</TableHead>
              <TableHead className="text-right">Müşteri Sayısı</TableHead>
              <TableHead className="text-right">Toplam Net Bakiye</TableHead>
              <TableHead className="text-right">Boyut</TableHead>
              <TableHead>Yükleme</TableHead>
              <TableHead className="w-[80px]">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium tabular-nums">{m.mizanTarihi}</TableCell>
                <TableCell className="truncate max-w-[300px]" title={m.filename}>{m.filename}</TableCell>
                <TableCell className="text-right tabular-nums">{m.kayitSayisi}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{m.toplamNetBakiye ? fmtTry(Number(m.toplamNetBakiye)) : "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtSize(m.sizeBytes)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(m.yuklemeTarihi).toLocaleString("tr-TR")}</TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => handleDelete(m.id, m.filename)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check + tarayıcı test + commit**

```bash
npm run check
git add client/src/components/tahsilat/MizanArsivi.tsx
git commit -m "feat(tahsilat): MizanArsivi — yüklenen mizan listesi + silme"
```

Tarayıcıda: Arşiv sekmesi → mevcut yüklemeler görünmeli, sil butonu çalışmalı.

---

## Task 11: MusteriListesi + RiskEsikleriModal

**Files:**
- Modify: `client/src/components/tahsilat/MusteriListesi.tsx`
- Modify: `client/src/components/tahsilat/RiskEsikleriModal.tsx`

- [ ] **Step 1: RiskEsikleriModal**

```tsx
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

export function RiskEsikleriModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: ayarlar } = useQuery<any>({ queryKey: ["/api/tahsilat/ayarlar"], enabled: open });
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (ayarlar) setForm({
      vipEsik: ayarlar.vipEsik,
      yuksekBakiyeEsik: ayarlar.yuksekBakiyeEsik,
      eskiOdemeEsik: ayarlar.eskiOdemeEsik,
      cokEskiOdemeEsik: ayarlar.cokEskiOdemeEsik,
      eksiPozisyonYuzde: ayarlar.eksiPozisyonYuzde,
      faturaPenceresi: ayarlar.faturaPenceresi,
    });
  }, [ayarlar]);

  const handleSave = async () => {
    setBusy(true);
    const r = await fetch("/api/tahsilat/ayarlar", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setBusy(false);
    if (!r.ok) { toast({ variant: "destructive", title: "Hata" }); return; }
    toast({ title: "Ayarlar güncellendi" });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat"] });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader><DialogTitle>Risk Eşikleri</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>VIP Müşteri Eşiği (yıllık fatura, TL)</Label><Input type="number" value={form.vipEsik || ""} onChange={(e) => setForm({ ...form, vipEsik: e.target.value })} /></div>
          <div><Label>Yüksek Bakiye Eşiği (TL)</Label><Input type="number" value={form.yuksekBakiyeEsik || ""} onChange={(e) => setForm({ ...form, yuksekBakiyeEsik: e.target.value })} /></div>
          <div><Label>Eski Ödeme Eşiği (gün)</Label><Input type="number" value={form.eskiOdemeEsik || ""} onChange={(e) => setForm({ ...form, eskiOdemeEsik: parseInt(e.target.value) })} /></div>
          <div><Label>Çok Eski Ödeme Eşiği (gün)</Label><Input type="number" value={form.cokEskiOdemeEsik || ""} onChange={(e) => setForm({ ...form, cokEskiOdemeEsik: parseInt(e.target.value) })} /></div>
          <div><Label>Eksi Pozisyon Yüzdesi (%)</Label><Input type="number" value={form.eksiPozisyonYuzde || ""} onChange={(e) => setForm({ ...form, eksiPozisyonYuzde: parseInt(e.target.value) })} /></div>
          <div><Label>Fatura Penceresi (gün)</Label><Input type="number" value={form.faturaPenceresi || ""} onChange={(e) => setForm({ ...form, faturaPenceresi: parseInt(e.target.value) })} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Kaydet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: MusteriListesi (sortable tablo + filtreler)**

```tsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Settings, Download as DownloadIcon, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { RiskEsikleriModal } from "./RiskEsikleriModal";
import { MusteriDrillDown } from "./MusteriDrillDown";

const PATTERN_LABEL: Record<string, string> = {
  SAGLIKLI: "Sağlıklı", VIP_AKTIF_RISK: "VIP Aktif", TAKIP_GEREKEN: "Takip", YAVAS_ODEYICI: "Yavaş", DONUK_KAYIP: "Donuk",
};
const PATTERN_BG: Record<string, string> = {
  SAGLIKLI: "bg-green-500", VIP_AKTIF_RISK: "bg-blue-600", TAKIP_GEREKEN: "bg-yellow-500", YAVAS_ODEYICI: "bg-orange-500", DONUK_KAYIP: "bg-red-600",
};

export function MusteriListesi({ mizanId }: { mizanId?: string }) {
  const [sortField, setSortField] = useState<string>("netBakiye");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [patternFilter, setPatternFilter] = useState<string>("HEPSI");
  const [sektorFilter, setSektorFilter] = useState<string>("HEPSI");
  const [search, setSearch] = useState("");
  const [esikOpen, setEsikOpen] = useState(false);
  const [drillId, setDrillId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/tahsilat/dashboard", mizanId],
    queryFn: async () => {
      const r = await fetch(`/api/tahsilat/dashboard${mizanId ? `?mizanId=${mizanId}` : ""}`);
      return r.json();
    },
  });

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  const filtered = useMemo(() => {
    if (!data?.musteriler) return [];
    let arr = data.musteriler as any[];
    if (patternFilter !== "HEPSI") arr = arr.filter((m) => m.pattern === patternFilter);
    if (sektorFilter !== "HEPSI") arr = arr.filter((m) => m.sektor === sektorFilter);
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter((m) => m.ad.toLowerCase().includes(s) || m.hesapKodu.includes(s));
    }
    return [...arr].sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      if (typeof av === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv), "tr") : String(bv).localeCompare(String(av), "tr");
    });
  }, [data, patternFilter, sektorFilter, search, sortField, sortDir]);

  const sektorler = useMemo(() => {
    if (!data?.musteriler) return [];
    return Array.from(new Set((data.musteriler as any[]).map((m) => m.sektor).filter(Boolean))).sort();
  }, [data]);

  const handleSort = (f: string) => {
    if (sortField === f) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };
  const SortIcon = ({ f }: { f: string }) => sortField === f ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />) : <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30" />;

  const exportCsv = () => {
    const escape = (v: any) => { const s = String(v ?? ""); return s.includes(";") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = filtered.map((m) => [m.hesapKodu, m.ad, m.sektor || "", m.netBakiye.toFixed(2), m.gecikme, m.isAktivitesiAcigi, m.bakiyeFaturaAcikYuzde.toFixed(1), PATTERN_LABEL[m.pattern]]);
    const csv = "﻿" + [["Hesap Kodu", "Ad", "Sektör", "Net Bakiye", "Gecikme", "İş Akt. Açığı", "Bakiye-Fatura %", "Risk"], ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `tahsilat-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (!data?.mizan) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş. Üstten "Mizan Yükle" ile başla.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4 rounded-lg border bg-muted/20">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Risk</label>
            <Select value={patternFilter} onValueChange={setPatternFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HEPSI">Hepsi</SelectItem>
                <SelectItem value="SAGLIKLI">Sağlıklı</SelectItem>
                <SelectItem value="VIP_AKTIF_RISK">VIP Aktif</SelectItem>
                <SelectItem value="TAKIP_GEREKEN">Takip</SelectItem>
                <SelectItem value="YAVAS_ODEYICI">Yavaş Ödeyici</SelectItem>
                <SelectItem value="DONUK_KAYIP">Donuk</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Sektör</label>
            <Select value={sektorFilter} onValueChange={setSektorFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HEPSI">Hepsi</SelectItem>
                {sektorler.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Ara</label>
            <Input placeholder="Müşteri / hesap kodu" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[200px]" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <DownloadIcon className="w-3.5 h-3.5 mr-1.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEsikOpen(true)}>
            <Settings className="w-3.5 h-3.5 mr-1.5" /> Risk Eşikleri
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto">
            <Table className="text-sm">
              <TableHeader className="sticky top-0 bg-muted z-10">
                <TableRow>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Sektör</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("netBakiye")}>Net Bakiye <SortIcon f="netBakiye" /></TableHead>
                  <TableHead>Son Borç</TableHead>
                  <TableHead>Son Ödeme</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("gecikme")}>Gecikme <SortIcon f="gecikme" /></TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("isAktivitesiAcigi")}>İş Akt. <SortIcon f="isAktivitesiAcigi" /></TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("bakiyeFaturaAcikYuzde")}>Bakiye-Fatura % <SortIcon f="bakiyeFaturaAcikYuzde" /></TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!filtered.length ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Filtreye uyan müşteri yok</TableCell></TableRow>
                ) : filtered.map((m) => (
                  <TableRow key={m.musteriId} className="cursor-pointer hover:bg-accent/40" onClick={() => setDrillId(m.musteriId)}>
                    <TableCell>
                      <div className="font-medium">{m.ad}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{m.hesapKodu}</div>
                    </TableCell>
                    <TableCell className="text-xs">{m.sektor || "-"}</TableCell>
                    <TableCell className={`text-right tabular-nums whitespace-nowrap font-semibold ${m.netBakiye < 0 ? "text-blue-600" : "text-orange-700"}`}>{fmtTry(m.netBakiye)}</TableCell>
                    <TableCell className="text-xs tabular-nums">{m.sonBorcTarihi || "-"}</TableCell>
                    <TableCell className="text-xs tabular-nums">{m.sonAlacakTarihi || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.gecikme >= 9999 ? "—" : `${m.gecikme}g`}</TableCell>
                    <TableCell className={`text-right tabular-nums ${m.isAktivitesiAcigi > 0 ? "text-red-600" : ""}`}>{m.isAktivitesiAcigi}g</TableCell>
                    <TableCell className={`text-right tabular-nums ${m.bakiyeFaturaAcikYuzde > 20 ? "text-red-600 font-semibold" : ""}`}>{m.bakiyeFaturaAcikYuzde >= 999 ? "—" : `${m.bakiyeFaturaAcikYuzde.toFixed(0)}%`}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge className={PATTERN_BG[m.pattern]}>{PATTERN_LABEL[m.pattern]}</Badge>
                        {m.vipRozeti && <span title="VIP">🌟</span>}
                        {m.yuksekBakiyeRozeti && <span title="Yüksek Bakiye">💰</span>}
                        {m.eksiPozisyonRozeti && <span title="Eksi Pozisyon">⚡</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RiskEsikleriModal open={esikOpen} onClose={() => setEsikOpen(false)} />
      <MusteriDrillDown musteriId={drillId} onClose={() => setDrillId(null)} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

```bash
npm run check
git add client/src/components/tahsilat/MusteriListesi.tsx client/src/components/tahsilat/RiskEsikleriModal.tsx
git commit -m "feat(tahsilat): MusteriListesi (sortable + filtre + CSV) + RiskEsikleriModal"
```

Tarayıcıda: Müşteriler sekmesi → mizan yüklü ise tablo görünmeli, sortable, filtreler çalışmalı.

---

## Task 12: TahsilatOzet (dashboard)

**Files:**
- Modify: `client/src/components/tahsilat/TahsilatOzet.tsx`

- [ ] **Step 1: Component**

```tsx
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, AlertTriangle, Star, Banknote, Zap, AlertCircle } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

const SEKTOR_RENKLER = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#ec4899"];

export function TahsilatOzet({ mizanId }: { mizanId?: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/tahsilat/dashboard", mizanId],
    queryFn: async () => {
      const r = await fetch(`/api/tahsilat/dashboard${mizanId ? `?mizanId=${mizanId}` : ""}`);
      return r.json();
    },
  });

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (!data?.mizan) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş.</div>;

  const o = data.ozet;
  const enKritikler = (data.musteriler as any[])
    .filter((m) => m.netBakiye > 0)
    .sort((a, b) => {
      // Önce risk pattern (Donuk > Yavaş > VIP > Takip > Sağlıklı), sonra bakiye
      const order: Record<string, number> = { DONUK_KAYIP: 0, YAVAS_ODEYICI: 1, VIP_AKTIF_RISK: 2, TAKIP_GEREKEN: 3, SAGLIKLI: 4 };
      if (order[a.pattern] !== order[b.pattern]) return order[a.pattern] - order[b.pattern];
      return b.netBakiye - a.netBakiye;
    })
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Banknote className="w-3.5 h-3.5" /> Toplam Net Alacak</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums">{fmtTry(o.toplamNetAlacak)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-600">
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Star className="w-3.5 h-3.5 text-blue-600" /> VIP ({o.vipSayisi})</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums text-blue-600">{fmtTry(o.vipBakiyeToplam)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 text-orange-500" /> Yavaş Ödeyici ({o.yavasOdeyiciSayisi})</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums text-orange-600">{fmtTry(o.yavasOdeyiciCiro)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-600">
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Donuk/Kayıp ({o.donukSayisi})</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums text-red-600">{fmtTry(o.donukCiro)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-600">
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-purple-600" /> Eksi Pozisyon ({o.eksiPozisyonSayisi})</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold tabular-nums text-purple-600">{fmtTry(o.eksiPozisyonToplam)}</div></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> En Kritik 10 Müşteri</CardTitle></CardHeader>
          <CardContent className="p-0">
            {enKritikler.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">Risk altında müşteri yok 🎉</div>
            ) : (
              <div className="divide-y">
                {enKritikler.map((m, i) => (
                  <div key={m.musteriId} className="p-3 flex items-center justify-between gap-2 hover:bg-accent/40">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{i + 1}. {m.ad}</div>
                      <div className="text-[10px] text-muted-foreground">{m.sektor || "Sektörsüz"} · Gecikme: {m.gecikme >= 9999 ? "—" : `${m.gecikme}g`}</div>
                    </div>
                    <div className="text-right tabular-nums shrink-0">
                      <div className="font-bold text-sm text-orange-700">{fmtTry(m.netBakiye)}</div>
                      <div className="text-[10px]">{m.pattern}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Sektör Dağılımı (Net Alacak)</CardTitle></CardHeader>
          <CardContent>
            {o.sektorDagilim.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">Veri yok</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={o.sektorDagilim.filter((s: any) => s.toplam > 0)}
                    dataKey="toplam"
                    nameKey="sektor"
                    cx="50%" cy="50%"
                    outerRadius={100}
                    innerRadius={60}
                    label={(e) => `${e.sektor}: ${(e.percent * 100).toFixed(0)}%`}
                  >
                    {o.sektorDagilim.map((_: any, i: number) => <Cell key={i} fill={SEKTOR_RENKLER[i % SEKTOR_RENKLER.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtTry(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run check
git add client/src/components/tahsilat/TahsilatOzet.tsx
git commit -m "feat(tahsilat): TahsilatOzet — 5 metrik kartı + en kritik 10 + sektör donut"
```

Tarayıcıda: Özet sekmesi → 5 kart + 10 müşteri listesi + donut chart görünmeli.

---

## Task 13: MusteriDrillDown

**Files:**
- Modify: `client/src/components/tahsilat/MusteriDrillDown.tsx`

- [ ] **Step 1: Drill-down dialog**

```tsx
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Building2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useToast } from "@/hooks/use-toast";

export function MusteriDrillDown({ musteriId, onClose }: { musteriId: string | null; onClose: () => void }) {
  const open = !!musteriId;
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/tahsilat/musteriler/${musteriId}`],
    queryFn: async () => {
      const r = await fetch(`/api/tahsilat/musteriler/${musteriId}`);
      return r.json();
    },
    enabled: open,
  });
  const { toast } = useToast();

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  const handleRemoveUnvan = async (unvan: string) => {
    if (!data?.musteri) return;
    if (!confirm(`"${unvan}" eşleşmesi silinsin mi?`)) return;
    const r = await fetch(`/api/tahsilat/eslestirme/${data.musteri.id}/${encodeURIComponent(unvan)}`, { method: "DELETE" });
    if (!r.ok) { toast({ variant: "destructive", title: "Silinemedi" }); return; }
    toast({ title: "Silindi" });
    // Refetch handled by parent
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
        {isLoading || !data ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                {data.musteri.ad}
              </DialogTitle>
              <div className="text-xs text-muted-foreground">
                {data.musteri.hesapKodu} · {data.musteri.sektor || "Sektörsüz"} · {data.musteri.firmaGrubu || ""}
                {data.musteri.limitTutar && ` · Limit: ${fmtTry(Number(data.musteri.limitTutar))}`}
              </div>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Trend grafiği */}
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm font-semibold mb-2">📈 Bakiye Geçmişi</div>
                  {data.timeline.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">Henüz bakiye kaydı yok</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={data.timeline.map((t: any) => ({
                        tarih: t.mizanTarihi,
                        bakiye: (t.sonBakiyeBA === "A" ? -1 : 1) * Number(t.sonBakiye),
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="tarih" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any) => fmtTry(v)} />
                        <Line type="monotone" dataKey="bakiye" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Eşleşen gümrük unvanları */}
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm font-semibold mb-2">🔗 Eşleşen Gümrük Unvanları</div>
                  {(data.musteri.gumrukFirmaUnvanlari || []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">Eşleşme yok. Eşleştirme sekmesinden ekleyebilirsin.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {data.musteri.gumrukFirmaUnvanlari.map((u: string) => (
                        <Badge key={u} variant="outline" className="gap-1.5">
                          {u}
                          <button onClick={() => handleRemoveUnvan(u)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tüm bakiye kayıtları */}
              <Card>
                <CardContent className="p-0">
                  <div className="text-sm font-semibold p-4 pb-2">📋 Tüm Mizan Kayıtları ({data.timeline.length})</div>
                  <div className="max-h-[300px] overflow-y-auto">
                    <Table className="text-xs">
                      <TableHeader className="sticky top-0 bg-muted">
                        <TableRow>
                          <TableHead>Tarih</TableHead>
                          <TableHead className="text-right">Borç</TableHead>
                          <TableHead className="text-right">Alacak</TableHead>
                          <TableHead className="text-right">Net Bakiye</TableHead>
                          <TableHead>Son Borç</TableHead>
                          <TableHead>Son Ödeme</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...data.timeline].reverse().map((t: any) => {
                          const nb = (t.sonBakiyeBA === "A" ? -1 : 1) * Number(t.sonBakiye);
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="font-medium tabular-nums">{t.mizanTarihi}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtTry(Number(t.borc))}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtTry(Number(t.alacak))}</TableCell>
                              <TableCell className={`text-right tabular-nums font-semibold ${nb < 0 ? "text-blue-600" : ""}`}>{fmtTry(nb)}</TableCell>
                              <TableCell className="tabular-nums">{t.sonBorcTarihi || "-"}</TableCell>
                              <TableCell className="tabular-nums">{t.sonAlacakTarihi || "-"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run check
git add client/src/components/tahsilat/MusteriDrillDown.tsx
git commit -m "feat(tahsilat): MusteriDrillDown — bakiye grafiği + eşleşmeler + tüm kayıtlar"
```

Tarayıcıda: Müşteriler sekmesinde bir satıra tıkla → drill-down dialog açılmalı, line chart + tablo + eşleşmeler görünmeli.

---

## Task 14: TahsilatTrend

**Files:**
- Modify: `client/src/components/tahsilat/TahsilatTrend.tsx`

- [ ] **Step 1: Trend genel grafik**

```tsx
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export function TahsilatTrend() {
  const { data: mizanList, isLoading: l1 } = useQuery<any[]>({ queryKey: ["/api/tahsilat/mizan"] });

  const { data: dashboardListesi, isLoading: l2 } = useQuery<any[]>({
    queryKey: ["/api/tahsilat/trend-genel", mizanList?.length],
    queryFn: async () => {
      if (!mizanList?.length) return [];
      // Her mizan için dashboard çek (paralel)
      const results = await Promise.all(mizanList.map(async (m) => {
        const r = await fetch(`/api/tahsilat/dashboard?mizanId=${m.id}`);
        const j = await r.json();
        return { mizanTarihi: m.mizanTarihi, ozet: j.ozet };
      }));
      return results.filter((r) => r.ozet);
    },
    enabled: !!mizanList?.length,
  });

  const fmtTry = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  if (l1 || l2) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (!mizanList?.length) return <div className="text-center text-muted-foreground py-12">Henüz mizan yüklenmemiş.</div>;
  if (!dashboardListesi?.length) return <div className="text-center text-muted-foreground py-12">Trend için en az 1 mizan gerekli.</div>;

  // Kronolojik sıraya çevir
  const trend = [...dashboardListesi].sort((a, b) => a.mizanTarihi.localeCompare(b.mizanTarihi)).map((d) => ({
    tarih: d.mizanTarihi,
    toplam: d.ozet.toplamNetAlacak,
    yavas: d.ozet.yavasOdeyiciCiro,
    donuk: d.ozet.donukCiro,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>📈 Toplam Net Alacak Trendi</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tarih" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtTry(v)} />
              <Legend />
              <Line type="monotone" dataKey="toplam" stroke="#3b82f6" strokeWidth={2} name="Toplam Net Alacak" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>⚠ Risk Altındaki Ciro</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tarih" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtTry(v)} />
              <Legend />
              <Line type="monotone" dataKey="yavas" stroke="#f97316" strokeWidth={2} name="Yavaş Ödeyici Ciro" />
              <Line type="monotone" dataKey="donuk" stroke="#dc2626" strokeWidth={2} name="Donuk Ciro" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run check
git add client/src/components/tahsilat/TahsilatTrend.tsx
git commit -m "feat(tahsilat): TahsilatTrend — toplam alacak + risk ciro trend grafikleri"
```

---

## Task 15: EslestirmeUI

**Files:**
- Modify: `client/src/components/tahsilat/EslestirmeUI.tsx`

- [ ] **Step 1: Component**

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function EslestirmeUI() {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/tahsilat/eslestirme/onerileri"] });
  const qc = useQueryClient();
  const { toast } = useToast();

  const handleOnayla = async (id: string) => {
    const r = await fetch(`/api/tahsilat/eslestirme/onayla/${id}`, { method: "POST" });
    if (!r.ok) { toast({ variant: "destructive", title: "Hata" }); return; }
    toast({ title: "Onaylandı" });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/eslestirme/onerileri"] });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/musteriler"] });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/dashboard"] });
  };

  const handleReddet = async (id: string) => {
    const r = await fetch(`/api/tahsilat/eslestirme/reddet/${id}`, { method: "POST" });
    if (!r.ok) { toast({ variant: "destructive", title: "Hata" }); return; }
    toast({ title: "Reddedildi" });
    qc.invalidateQueries({ queryKey: ["/api/tahsilat/eslestirme/onerileri"] });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (!data?.length) return <div className="text-center text-muted-foreground py-12">Bekleyen eşleştirme önerisi yok 🎉</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bekleyen Eşleştirme Önerileri ({data.length})</CardTitle>
          <div className="text-xs text-muted-foreground">
            Sistem mizan'daki müşteri adları ile gümrük modülündeki firma unvanları arasında benzerlik tespit etti.
            Her bir öneriyi onayla veya reddet.
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.map((o: any) => {
              const skor = Number(o.benzerlikSkoru);
              const skorColor = skor >= 0.9 ? "bg-green-600" : skor >= 0.85 ? "bg-blue-600" : "bg-yellow-600";
              return (
                <div key={o.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-accent/40">
                  <div className="flex-1 min-w-0 grid grid-cols-2 gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground uppercase">Mizan'daki müşteri</div>
                      <div className="font-medium truncate" title={o.musteriAd}>{o.musteriAd}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground uppercase">Gümrük'teki unvan</div>
                      <div className="font-medium truncate" title={o.gumrukUnvan}>{o.gumrukUnvan}</div>
                    </div>
                  </div>
                  <Badge className={`${skorColor} shrink-0`}>%{(skor * 100).toFixed(0)}</Badge>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-8 text-green-600" onClick={() => handleOnayla(o.id)}>
                      <Check className="w-4 h-4 mr-1" /> Onayla
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-red-600" onClick={() => handleReddet(o.id)}>
                      <X className="w-4 h-4 mr-1" /> Reddet
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run check
git add client/src/components/tahsilat/EslestirmeUI.tsx
git commit -m "feat(tahsilat): EslestirmeUI — bekleyen önerileri onayla/reddet"
```

---

## Task 16: Final test + push

**Files:** Hiçbiri (validation + deploy)

- [ ] **Step 1: Final type-check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 2: Tüm akışı tarayıcıdan test et**

1. **Tahsilat sayfası** açılır, "Mizan Yükle" butonu çalışır
2. `mizan 08022026.xlsx` yükle → önizleme + onayla → toast başarı
3. **Özet** sekmesi → 5 kart + en kritik 10 + sektör donut görünür
4. **Müşteriler** sekmesi → tablo, sortable, filtreler çalışır
5. Bir satıra tıkla → **Drill-down** dialog → trend grafiği + tablo + eşleşmeler
6. **Risk Eşikleri** modal → eşik değiştir → kaydet → metrikler yenilenir
7. **Eşleştirme** sekmesi → bekleyen öneriler varsa onayla/reddet
8. **Trend** sekmesi → en az 2 mizan yükledikten sonra grafikler
9. **Arşiv** sekmesi → mizan'ları görür, sil butonu çalışır
10. CSV indir → Türkçe karakterli Excel açılır

- [ ] **Step 3: Push**

```bash
git push origin main
```

VPS deploy başlar (~1-3 dk):
- `npm install --legacy-peer-deps`
- `npm run db:push` → 6 yeni tabloyu oluşturur
- `npm run build`
- `pm2 restart`

- [ ] **Step 4: Production smoke test**

Production URL'de tüm akışı tekrar test et.

---

## Self-Review

**Spec coverage:**
- ✅ Schema (6 tablo) → Task 1
- ✅ db:push → Task 2
- ✅ Hesap mantığı → Task 3
- ✅ Eşleştirme algoritması → Task 4
- ✅ Mizan parser → Task 5
- ✅ Storage CRUD → Task 6
- ✅ 14 API endpoint → Task 7
- ✅ UI iskelet (5 sekme) → Task 8
- ✅ Mizan upload modal → Task 9
- ✅ Arşiv → Task 10
- ✅ Müşteri listesi + risk eşikleri → Task 11
- ✅ Özet dashboard → Task 12
- ✅ Drill-down → Task 13
- ✅ Trend → Task 14
- ✅ Eşleştirme UI → Task 15
- ✅ Final test + push → Task 16

**Type consistency:**
- `RiskPattern` enum string olarak tutarlı tüm tasklarda
- `RiskEsikleri` interface (Task 3) ↔ `getTahsilatAyarlari` return (Task 6) ↔ dashboard usage (Task 7) — uyumlu (sayısal alanlar string'den parse ediliyor)
- `MizanRow` (Task 5) ↔ önizleme response (Task 7) — aynı alanlar
- `gumrukFirmaUnvanlari: text[]` (Task 1) ↔ array operasyonları (Task 6 storage) — uyumlu

**Placeholder scan:** TBD/TODO yok. Her task tam kod içeriyor.

**Scope:** 16 task, ~5-7 saat toplam iş, tek developer için 1-2 günlük plan. Mantıklı bütünlük.

**Ambiguity:** Notlar:
- Dashboard endpoint'inde gümrük fatura toplamı tüm `gumruk_verileri` taraması yapıyor — büyük datalarda yavaş olabilir, V2'de optimize edilebilir.
- Mizan save endpoint'i dosyayı 2 kez parse ediyor (upload + save) çünkü buffer'ı saklamıyoruz — kullanıcı önizlemede onayladıktan sonra dosyayı tekrar gönderiyor, bu UX karar olarak geçici çözüm.
