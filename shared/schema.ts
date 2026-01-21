import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, date, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Gümrük verileri tablosu
export const gumrukVerileri = pgTable("gumruk_verileri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ay: text("ay").notNull(), // ocak, subat, mart, vb.
  yil: integer("yil").notNull(),
  tip: text("tip"), // H, T, A, B, @ veya boş
  dosyaNo: text("dosya_no"),
  firmaUnvan: text("firma_unvan"), // Müşteri adı
  rejim: text("rejim"),
  faturaNo: text("fatura_no"),
  faturaTarihi: text("fatura_tarihi"),
  gumruk: text("gumruk"), // İşlemin gerçekleştirildiği gümrük
  tescilTarihi: text("tescil_tarihi"),
  tescilNo: text("tescil_no"),
  faturayiKesen: text("faturayi_kesen"), // Faturayı kesen çalışan
  dovizKiymeti: text("doviz_kiymeti"),
  doviz: text("doviz"),
  girisElemani: text("giris_elemani"), // İşlemi gerçekleştiren çalışan
  malBedeli: decimal("mal_bedeli", { precision: 15, scale: 2 }), // KDV'siz bedel
  topIskonto: decimal("top_iskonto", { precision: 15, scale: 2 }),
  topKdvTutar: decimal("top_kdv_tutar", { precision: 15, scale: 2 }),
  topFaturaTutar: decimal("top_fatura_tutar", { precision: 15, scale: 2 }), // Mal Bedeli + KDV
  rowHash: text("row_hash").notNull(), // Satırı benzersiz tanımlayan hash
}, (table) => [
  uniqueIndex("gumruk_verileri_ay_yil_hash_idx").on(table.ay, table.yil, table.rowHash),
]);

export const insertGumrukVerisiSchema = createInsertSchema(gumrukVerileri).omit({
  id: true,
});

export type InsertGumrukVerisi = z.infer<typeof insertGumrukVerisiSchema>;
export type GumrukVerisi = typeof gumrukVerileri.$inferSelect;

// Ay listesi
export const aylar = [
  { value: "ocak", label: "Ocak" },
  { value: "subat", label: "Şubat" },
  { value: "mart", label: "Mart" },
  { value: "nisan", label: "Nisan" },
  { value: "mayis", label: "Mayıs" },
  { value: "haziran", label: "Haziran" },
  { value: "temmuz", label: "Temmuz" },
  { value: "agustos", label: "Ağustos" },
  { value: "eylul", label: "Eylül" },
  { value: "ekim", label: "Ekim" },
  { value: "kasim", label: "Kasım" },
  { value: "aralik", label: "Aralık" },
] as const;

export const subeler = [
  "Bursa",
  "Gemlik",
  "İstanbul - Erenköy",
  "İstanbul - İHL",
  "Yönetim"
];

// Araçlar tablosu
export const araclar = pgTable("araclar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  plaka: text("plaka").notNull().unique(),
  // Trafik Sigortası
  trafikPoliceNo: text("trafik_police_no"),
  trafikBitisTarihi: text("trafik_bitis_tarihi"),
  // Kasko
  kaskoPoliceNo: text("kasko_police_no"),
  kaskoBitisTarihi: text("kasko_bitis_tarihi"),
});

export const insertAracSchema = createInsertSchema(araclar).omit({
  id: true,
});

export type InsertArac = z.infer<typeof insertAracSchema>;
export type Arac = typeof araclar.$inferSelect;

// Nakliye verileri tablosu
export const nakliyeVerileri = pgTable("nakliye_verileri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  faturaNo: text("fatura_no"),
  faturaTarihi: text("fatura_tarihi"),
  malHizmet: text("mal_hizmet"),
  miktar: decimal("miktar", { precision: 15, scale: 2 }),
  birimFiyat: decimal("birim_fiyat", { precision: 15, scale: 2 }),
  kdvOranı: integer("kdv_orani"),
  kdvTutarı: decimal("kdv_tutari", { precision: 15, scale: 2 }),
  malHizmetToplamTutarı: decimal("mal_hizmet_toplam_tutari", { precision: 15, scale: 2 }),
  hesaplananKdv20: decimal("hesaplanan_kdv_20", { precision: 15, scale: 2 }),
  hesaplananKdvTevkifat20: decimal("hesaplanan_kdv_tevkifat_20", { precision: 15, scale: 2 }),
  vergilerDahilToplamTutar: decimal("vergiler_dahil_toplam_tutar", { precision: 15, scale: 2 }),
  odenecekTutar: decimal("odenecek_tutar", { precision: 15, scale: 2 }),
  olusturmaTarihi: date("olusturma_tarihi").default(sql`CURRENT_DATE`),
  musteri: text("musteri"), // Eşleştirilen/Düzeltilen Müşteri
  konteynerler: text("konteynerler"), // Eşleştirilen/Düzeltilen Konteynerler (Virgülle ayrılmış)
  rawJson: text("raw_json"), // Her ihtimale karşı tüm veriyi saklamak için
});

export const insertNakliyeVerisiSchema = createInsertSchema(nakliyeVerileri).omit({
  id: true,
  olusturmaTarihi: true,
});

export type InsertNakliyeVerisi = z.infer<typeof insertNakliyeVerisiSchema>;
export type NakliyeVerisi = typeof nakliyeVerileri.$inferSelect;

// Çalışanlar tablosu
export const calisanlar = pgTable("calisanlar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tcNo: text("tc_no").notNull(),
  adSoyad: text("ad_soyad").notNull(),
  isGirisTarihi: text("is_giris_tarihi"),
  brutUcret: decimal("brut_ucret", { precision: 15, scale: 2 }),
  netUcret: decimal("net_ucret", { precision: 15, scale: 2 }),
  sgkMatrahi: decimal("sgk_matrahi", { precision: 15, scale: 2 }),
  gelirVergisiMatrahi: decimal("gelir_vergisi_matrahi", { precision: 15, scale: 2 }),
  kumulatifVergiMatrahi: decimal("kumulatif_vergi_matrahi", { precision: 15, scale: 2 }),
  gelirVergisi: decimal("gelir_vergisi", { precision: 15, scale: 2 }),
  damgaVergisi: decimal("damga_vergisi", { precision: 15, scale: 2 }),
  sigortaKesintisi: decimal("sigorta_kesintisi", { precision: 15, scale: 2 }),
  issizlikSigortasiKesintisi: decimal("issizlik_sigortasi_kesintisi", { precision: 15, scale: 2 }),
  isverenSgkPayi: decimal("isveren_sgk_payi", { precision: 15, scale: 2 }),
  isverenIssizlikPayi: decimal("isveren_issizlik_payi", { precision: 15, scale: 2 }),
  toplamIsverenMaliyeti: decimal("toplam_isveren_maliyeti", { precision: 15, scale: 2 }),
  sube: text("sube"),
  statu: text("statu"),
  ay: text("ay").notNull(),
  yil: integer("yil").notNull(),
}, (table) => [
  uniqueIndex("calisanlar_tc_ay_yil_idx").on(table.tcNo, table.ay, table.yil),
]);

export const insertCalisanSchema = createInsertSchema(calisanlar).omit({
  id: true,
});

export type InsertCalisan = z.infer<typeof insertCalisanSchema>;
export type Calisan = typeof calisanlar.$inferSelect;


// Giderler tablosu (Gümrük Sayfası için)
export const giderler = pgTable("giderler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tarih: text("tarih"), // dd.mm.yyyy formatında
  firma: text("firma"), // Fatura kesen firma
  faturaNo: text("fatura_no"),
  malBedeli: decimal("mal_bedeli", { precision: 15, scale: 2 }), // KDV Hariç
  kdvTutari: decimal("kdv_tutari", { precision: 15, scale: 2 }),
  toplamTutar: decimal("toplam_tutar", { precision: 15, scale: 2 }), // KDV Dahil
  paraBirimi: text("para_birimi").default("TRY"), // TRY, USD, EUR
  kur: decimal("kur", { precision: 10, scale: 4 }).default("1"), // Kullanılan kur
  tryTutar: decimal("try_tutar", { precision: 15, scale: 2 }), // TRY karşılığı (Toplam Tutar * Kur)
  ay: text("ay").notNull(),
  yil: integer("yil").notNull(),
  olusturmaTarihi: date("olusturma_tarihi").default(sql`CURRENT_DATE`),
}, (table) => [
  uniqueIndex("giderler_fatura_no_idx").on(table.faturaNo, table.firma),
]);

export const insertGiderlerSchema = createInsertSchema(giderler).omit({
  id: true,
  olusturmaTarihi: true,
});

export type InsertGiderler = z.infer<typeof insertGiderlerSchema>;
export type Gider = typeof giderler.$inferSelect;

// Sigorta Poliçeleri tablosu
export const sigortaPoliceleri = pgTable("sigorta_policeleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brans: text("brans"),
  policeNo: text("police_no").notNull(),
  sigortali: text("sigortali"),
  tanzimTarihi: text("tanzim_tarihi"),
  netPrim: decimal("net_prim", { precision: 15, scale: 2 }),
  brutPrim: decimal("brut_prim", { precision: 15, scale: 2 }),
  komisyon: decimal("komisyon", { precision: 15, scale: 2 }),
  sigortaBedeli: decimal("sigorta_bedeli", { precision: 15, scale: 2 }),
  dekontDurumu: text("dekont_durumu"), // EVET, HAYIR, ÖDENEN (veya null)
  sirket: text("sirket").notNull(), // Mapfre, Ray Sigorta
  ay: text("ay"),
  yil: integer("yil"),
  olusturmaTarihi: date("olusturma_tarihi").default(sql`CURRENT_DATE`),
}, (table) => [
  uniqueIndex("sigorta_policeleri_no_idx").on(table.policeNo, table.sirket),
]);

export const insertSigortaPoliceSchema = createInsertSchema(sigortaPoliceleri).omit({
  id: true,
  olusturmaTarihi: true,
});

export type InsertSigortaPolice = z.infer<typeof insertSigortaPoliceSchema>;
export type SigortaPolice = typeof sigortaPoliceleri.$inferSelect;

// Sigorta Muhasebe Kayıtları tablosu
export const sigortaMuhasebeKayitlari = pgTable("sigorta_muhasebe_kayitlari", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tarih: text("tarih"),
  aciklama: text("aciklama"),
  belgeNo: text("belge_no"),
  borc: decimal("borc", { precision: 15, scale: 2 }),
  alacak: decimal("alacak", { precision: 15, scale: 2 }),
  bakiye: decimal("bakiye", { precision: 15, scale: 2 }),
  eslestiMi: integer("eslesti_mi").default(0), // 0: Hayır, 1: Evet
  eslesenPolicyId: text("eslesen_policy_id"),
  sirket: text("sirket").notNull(), // Mapfre, Ray Sigorta
  ay: text("ay"),
  yil: integer("yil"),
  rowHash: text("row_hash").notNull(), // Tekrarlı yüklemeleri önlemek için
  olusturmaTarihi: date("olusturma_tarihi").default(sql`CURRENT_DATE`),
}, (table) => [
  uniqueIndex("sigorta_muhasebe_hash_idx").on(table.sirket, table.yil, table.rowHash),
]);

export const insertSigortaMuhasebeSchema = createInsertSchema(sigortaMuhasebeKayitlari).omit({
  id: true,
  olusturmaTarihi: true,
});

export type InsertSigortaMuhasebe = z.infer<typeof insertSigortaMuhasebeSchema>;
export type SigortaMuhasebe = typeof sigortaMuhasebeKayitlari.$inferSelect;

