import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, date, integer, uniqueIndex, index, timestamp, jsonb, json, boolean } from "drizzle-orm/pg-core";
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

// Gümrük Dosyaları tablosu (Yüklenen Excel'lerin takibi)
export const gumrukDosyalar = pgTable("gumruk_dosyalar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  filepath: text("filepath").notNull(), // Sunucudaki fiziksel yol
  uploadDate: timestamp("upload_date").defaultNow(),
  sizeBytes: integer("size_bytes"),
  recordCount: integer("record_count"), // Kaç satır import edildi
  md5Hash: text("md5_hash"), // Dosya değişimi kontrolü için
  tip: text("tip").default("gumruk"), // Yüklemenin tipi: 'gumruk' (satışlar) | 'gider'
});

export const insertGumrukDosyaSchema = createInsertSchema(gumrukDosyalar).omit({
  id: true,
  uploadDate: true,
});

export type InsertGumrukDosya = z.infer<typeof insertGumrukDosyaSchema>;
export type GumrukDosya = typeof gumrukDosyalar.$inferSelect;

// Bordro arşiv dosyaları (PDF'ler — Maaş Listesi + Detaylı Bordro)
// Parse edilen Maaş Listesi'nin kaynak dosyası ve denetim için saklanan
// Detaylı Bordro PDF'leri burada arşivlenir.
export const bordroDosyalar = pgTable("bordro_dosyalar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  filepath: text("filepath").notNull(),
  uploadDate: timestamp("upload_date").defaultNow(),
  sizeBytes: integer("size_bytes"),
  md5Hash: text("md5_hash"),
  // 'maas-listesi' (parse edilip calisanlar'a yazıldı) | 'bordro' (sadece arşiv, denetim için)
  tip: text("tip").notNull().default("bordro"),
  ay: integer("ay"), // 1-12 (parse edildiyse PDF'ten otomatik, arşiv için kullanıcı seçer)
  yil: integer("yil"),
  // Maaş listesinden parse edildiyse kaç çalışana yazıldı
  kayitSayisi: integer("kayit_sayisi"),
});

export const insertBordroDosyaSchema = createInsertSchema(bordroDosyalar).omit({
  id: true,
  uploadDate: true,
});

export type InsertBordroDosya = z.infer<typeof insertBordroDosyaSchema>;
export type BordroDosya = typeof bordroDosyalar.$inferSelect;

// ============================================================================
// İZİN TAKİP SİSTEMİ
// ============================================================================

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
  
  // New Columns from "Satışlar Excel Temp.xlsx"
  firmaNo: text("firma_no"),
  firmaOzellik: text("firma_ozellik"),
  hesapNo: text("hesap_no"),
  malinCinsi: text("malin_cinsi"),
  referansNo: text("referans_no"),
  houseNo: text("house_no"),
  konteynerSayisi: text("konteyner_sayisi"),
  siraNo: text("sira_no"),
  faturaKesimTarihi: text("fatura_kesim_tarihi"),
  valorTarihi: text("valor_tarihi"),
  mensei: text("mensei"),
  cifKiymet: decimal("cif_kiymet", { precision: 15, scale: 2 }),
  tasimaCinsi: text("tasima_cinsi"),
  kapAdedi: text("kap_adedi"),
  tasitCinsi: text("tasit_cinsi"),
  kalemSayisi: text("kalem_sayisi"),
  mm: text("mm"),
  ydFirma: text("yd_firma"),
  istKiymet: decimal("ist_kiymet", { precision: 15, scale: 2 }),
  kullanici: text("kullanici"),
  araKonsNo: text("ara_kons_no"),
  accountNo: text("account_no"),
  vd: text("vd"),
  vn: text("vn"),
  fe: text("fe"),
  sm: text("sm"),
  odemeSekli: text("odeme_sekli"),
  kur: decimal("kur", { precision: 10, scale: 4 }),
  supalan: text("supalan"),
  musFatura: text("mus_fatura"),
  komisyonHesap: text("komisyon_hesap"),
  isTf: text("is_tf"),
  imalatci: text("imalatci"),
  tevkifatKod: text("tevkifat_kod"),
  poNo: text("po_no"),

  // Link to Source File
  dosyaId: varchar("dosya_id").references(() => gumrukDosyalar.id),
  
  // Archival Field
  rawData: text("raw_data"), // Stores the full original row as JSON string

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
  "Muratbey",
  "Yönetim"
];

// Araçlar tablosu
export const araclar = pgTable("araclar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  plaka: text("plaka").notNull().unique(),
  marka: text("marka"),
  model: text("model"),
  sube: text("sube"), // Şube
  // Trafik Sigortası
  trafikSigortaSirketi: text("trafik_sigorta_sirketi"),
  trafikPoliceNo: text("trafik_police_no"),
  trafikBitisTarihi: text("trafik_bitis_tarihi"),
  trafikSigortaFiyat: decimal("trafik_sigorta_fiyat", { precision: 15, scale: 2 }),
  trafikPoliceDosyasi: text("trafik_police_dosyasi"),
  // Kasko
  kaskoSigortaSirketi: text("kasko_sigorta_sirketi"),
  kaskoPoliceNo: text("kasko_police_no"),
  kaskoBitisTarihi: text("kasko_bitis_tarihi"),
  kaskoSigortaFiyat: decimal("kasko_sigorta_fiyat", { precision: 15, scale: 2 }),
  kaskoPoliceDosyasi: text("kasko_police_dosyasi"),
  // Ruhsat
  ruhsatDosyasi: text("ruhsat_dosyasi"),
});

export const insertAracSchema = createInsertSchema(araclar).omit({
  id: true,
});

export type InsertArac = z.infer<typeof insertAracSchema>;
export type Arac = typeof araclar.$inferSelect;

// Araç Giderleri tablosu
export const aracGiderler = pgTable("arac_giderler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  aracId: varchar("arac_id").references(() => araclar.id, { onDelete: 'cascade' }).notNull(),
  tarih: text("tarih").notNull(), // YYYY-MM-DD
  kategori: text("kategori").notNull(), // Yakıt, Bakım, Vergi, Diğer
  aciklama: text("aciklama"),
  tutar: decimal("tutar", { precision: 15, scale: 2 }).notNull(),
  kilometre: integer("kilometre"),
  // Excel (Halis Petrol) tekrar yüklemelerinde çift kaydı önler; manuel giderlerde null bırakılır.
  // Postgres UNIQUE indeksi NULL'ları birbirinden farklı sayar → yalnızca hash'li kayıtlar tekilleşir.
  rowHash: text("row_hash"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
}, (table) => [
  uniqueIndex("arac_giderler_row_hash_idx").on(table.rowHash),
]);

export const insertAracGiderSchema = createInsertSchema(aracGiderler).omit({
  id: true,
  olusturmaTarihi: true,
});

export type InsertAracGider = z.infer<typeof insertAracGiderSchema>;
export type AracGider = typeof aracGiderler.$inferSelect;

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
  
  // Gümrük Eşleşme Verileri
  ilgiliDosyaNo: text("ilgili_dosya_no"),
  gumrukFirmaUnvan: text("gumruk_firma_unvan"),
  gumrukAdi: text("gumruk_adi"),
  gumrukDovizKiymeti: text("gumruk_doviz_kiymeti"),
  gumrukDovizCinsi: text("gumruk_doviz_cinsi"),
  gumrukTescilNo: text("gumruk_tescil_no"),
  gumrukTescilTarihi: text("gumruk_tescil_tarihi"),
  eslesenHouseNo: text("eslesen_house_no"),
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
  sube: text("sube"), // Şube
  kategori: text("kategori"), // Kategori (Nakliye, Ardiye, vb.)
  plaka: text("plaka"), // Araç kategorileri için opsiyonel (ARAÇ BAKIM, ARAÇ MUAYENE, vb.)
  ay: text("ay").notNull(),
  yil: integer("yil").notNull(),
  olusturmaTarihi: date("olusturma_tarihi").default(sql`CURRENT_DATE`),
  // Yükleme geçmişi için kaynak dosya bağlantısı (geriye dönük rollback)
  dosyaId: varchar("dosya_id").references(() => gumrukDosyalar.id),
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
  eslestiMi: integer("eslesti_mi").default(0), // 0: Hayır, 1: Evet, 2: Şüpheli
  eslesenPolicyId: varchar("eslesen_policy_id").references((): any => sigortaPoliceleri.id, { onDelete: "set null" }),
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


// Maaş Planlama Tablosu (Yıllık bazda)
export const salaryPlans = pgTable("salary_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tcNo: text("tc_no").notNull(),
  year: integer("year").notNull(),
  netSalary: decimal("net_salary", { precision: 15, scale: 2 }), // Kullanıcının girdiği hedef net
  employeeType: text("employee_type").default("normal"), // normal, retired, management
  branch: text("branch"), // Planlama anındaki şube bilgisi (snapshot)
  updatedAt: date("updated_at").default(sql`CURRENT_DATE`),
}, (table) => [
  uniqueIndex("salary_plans_tc_year_idx").on(table.tcNo, table.year),
]);

export const insertSalaryPlanSchema = createInsertSchema(salaryPlans).omit({
  id: true,
  updatedAt: true,
});

export type InsertSalaryPlan = z.infer<typeof insertSalaryPlanSchema>;
export type SalaryPlan = typeof salaryPlans.$inferSelect;

// Expense Categories Table
export const expenseCategories = pgTable("expense_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
});

export const insertExpenseCategorySchema = createInsertSchema(expenseCategories).omit({
  id: true,
});

export type InsertExpenseCategory = z.infer<typeof insertExpenseCategorySchema>;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;

// Surveys table
export const surveys = pgTable("surveys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").unique(),
  title: text("title").notNull(),
  description: text("description"),
  questions: jsonb("questions").notNull(), // Array of question objects: { id, text, type (rating/text) }
  requireIdentity: integer("require_identity").default(1), // 1 for true, 0 for false
  identityLabel: text("identity_label").default("Firma / Ad Soyad"),
  contactFields: jsonb("contact_fields").default([]).notNull(), // Array of { id, label, placeholder, required }
  targetScore: integer("target_score").default(80).notNull(), // Target score threshold
  createdAt: timestamp("created_at").defaultNow(),
  isActive: integer("is_active").default(1),
  type: text("type").default("musteri").notNull(),
});

export const insertSurveySchema = createInsertSchema(surveys).omit({ id: true, createdAt: true });
export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export type Survey = typeof surveys.$inferSelect;

// Survey Responses table
export const surveyResponses = pgTable("survey_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyId: varchar("survey_id").references(() => surveys.id, { onDelete: 'cascade' }).notNull(),
  customerName: text("customer_name"), // legacy single name field
  contactInfo: jsonb("contact_info").default({}), // Maps custom field ids to their text values
  answers: jsonb("answers").notNull(), // Array of answer objects: { questionId, score (1-5), adjustedScore (20-100) }
  averageScore: decimal("average_score", { precision: 5, scale: 2 }).notNull(),
  comments: text("comments"),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

export const insertSurveyResponseSchema = createInsertSchema(surveyResponses).omit({ id: true, submittedAt: true });
export type InsertSurveyResponse = z.infer<typeof insertSurveyResponseSchema>;
export type SurveyResponse = typeof surveyResponses.$inferSelect;

// DÜF (Düzeltici Faaliyet) tablosu
export const duf = pgTable("duf", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  baslik: text("baslik").notNull(),
  uygunsuzlukKaynagi: text("uygunsuzluk_kaynagi").notNull(),
  aciklama: text("aciklama").notNull(),
  sorumluKisi: text("sorumlu_kisi").notNull(),
  hedefKapanisTarihi: text("hedef_kapanis_tarihi").notNull(),
  durum: text("durum").notNull().default("acik"),
  kokNedenAnalizi: text("kok_neden_analizi"),
  alinanAksiyon: text("alinan_aksiyon"),
  dosyaEki: text("dosya_eki"),
  talepTarihi: text("talep_tarihi"),
  talepEden: text("talep_eden"),
  kapamaTarihi: text("kapama_tarihi"),
  kapamaSonucu: text("kapama_sonucu"),
  sonucDogrulamaFaaliyetleri: text("sonuc_dogrulama_faaliyetleri"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertDufSchema = createInsertSchema(duf).omit({ id: true, olusturmaTarihi: true });
export type InsertDuf = z.infer<typeof insertDufSchema>;
export type Duf = typeof duf.$inferSelect;

// Bakım & Onarım — Varlıklar (araç, cihaz, donanım)
export const bakimVarliklar = pgTable("bakim_varliklar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kategori: text("kategori").notNull(), // "arac" | "cihaz" | "donanim"
  marka: text("marka").notNull(),
  model: text("model"),
  plaka: text("plaka"),
  kod: text("kod"),
  aciklama: text("aciklama"),
  bakimPeriyodu: text("bakim_periyodu"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});
export const insertBakimVarlikSchema = createInsertSchema(bakimVarliklar).omit({ id: true, olusturmaTarihi: true });
export type InsertBakimVarlik = z.infer<typeof insertBakimVarlikSchema>;
export type BakimVarlik = typeof bakimVarliklar.$inferSelect;

// Bakım & Onarım — Kayıtlar
export const bakimKayitlari = pgTable("bakim_kayitlari", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  varlikId: varchar("varlik_id").references(() => bakimVarliklar.id, { onDelete: "cascade" }).notNull(),
  bakimTarihi: text("bakim_tarihi").notNull(),
  km: text("km"),
  yapilanIslemler: text("yapilan_islemler").notNull(),
  faturaNu: text("fatura_nu"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});
export const insertBakimKayitSchema = createInsertSchema(bakimKayitlari).omit({ id: true, olusturmaTarihi: true });
export type InsertBakimKayit = z.infer<typeof insertBakimKayitSchema>;
export type BakimKayit = typeof bakimKayitlari.$inferSelect;

// İç Tetkik Planları tablosu
export const tetkikPlanlar = pgTable("tetkik_planlar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tetkikAdi: text("tetkik_adi").notNull(),
  planlananTarih: text("planlanan_tarih").notNull(),
  tetkikEdilenBolum: text("tetkik_edilen_bolum").notNull(),
  basTetkikci: text("bas_tetkikci").notNull(),
  durum: text("durum").notNull().default("planlandi"),
  dosyaEki: text("dosya_eki"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertTetkikPlanSchema = createInsertSchema(tetkikPlanlar).omit({ id: true, olusturmaTarihi: true });
export type InsertTetkikPlan = z.infer<typeof insertTetkikPlanSchema>;
export type TetkikPlan = typeof tetkikPlanlar.$inferSelect;

// İç Tetkik Bulguları tablosu
export const tetkikBulgular = pgTable("tetkik_bulgular", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tetkikPlanId: varchar("tetkik_plan_id").references(() => tetkikPlanlar.id, { onDelete: "cascade" }).notNull(),
  bulguTuru: text("bulgu_turu").notNull(),
  bulguAciklamasi: text("bulgu_aciklamasi").notNull(),
  ilgiliIsoMaddesi: text("ilgili_iso_maddesi"),
  durum: text("durum").notNull().default("acik"),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertTetkikBulguSchema = createInsertSchema(tetkikBulgular).omit({ id: true, olusturmaTarihi: true });
export type InsertTetkikBulgu = z.infer<typeof insertTetkikBulguSchema>;
export type TetkikBulgu = typeof tetkikBulgular.$inferSelect;

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
  egitimTarihi: text("egitim_tarihi").notNull(),
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
  tip: text("tip").notNull(),
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
  tip: text("tip").notNull(),
  sira: integer("sira").notNull(),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertTedarikciDegerlendirmeKriterSchema = createInsertSchema(tedarikciDegerlendirmeKriterleri).omit({ id: true, olusturmaTarihi: true });
export type InsertTedarikciDegerlendirmeKriter = z.infer<typeof insertTedarikciDegerlendirmeKriterSchema>;
export type TedarikciDegerlendirmeKriter = typeof tedarikciDegerlendirmeKriterleri.$inferSelect;

export const tedarikciDegerlendirmeler = pgTable("tedarikci_degerlendirmeler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tedarikciId: varchar("tedarikci_id").references(() => tedarikcilar.id, { onDelete: "cascade" }).notNull(),
  tarih: text("tarih").notNull(),
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

export const insertYonetimAksiyonSchema = createInsertSchema(yonetimAksiyonlar).omit({ id: true, olusturmaTarihi: true });
export type InsertYonetimAksiyon = z.infer<typeof insertYonetimAksiyonSchema>;
export type YonetimAksiyon = typeof yonetimAksiyonlar.$inferSelect;

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
  ciroEsik: decimal("ciro_esik", { precision: 18, scale: 2 }).notNull().default("500000"),
  odemeOraniEsik: integer("odeme_orani_esik").notNull().default(60),
  guncellenme: timestamp("guncellenme").defaultNow(),
});

export const insertTahsilatAyarlariSchema = createInsertSchema(tahsilatAyarlari).omit({
  guncellenme: true,
});
export type InsertTahsilatAyarlari = z.infer<typeof insertTahsilatAyarlariSchema>;
export type TahsilatAyarlari = typeof tahsilatAyarlari.$inferSelect;

// ==================== ÖDEMELER PORTALI ====================

// Portal kullanıcıları — çalışan girişi (yönetim panelinden bağımsız)
export const portalKullanicilar = pgTable("portal_kullanicilar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kullaniciAdi: text("kullanici_adi").notNull().unique(),
  sifreHash: text("sifre_hash").notNull(), // "salt:hash" (crypto.scrypt)
  adSoyad: text("ad_soyad").notNull(),
  rol: text("rol").notNull(), // 'temsilci' | 'muhasebe' | 'operasyon'
  avAdi: text("av_adi"), // Beyanname Excel AV sütunu eşleşmesi (örn. "SÜLEYMAN")
  sube: text("sube"), // Şube (yalnız rol='operasyon' için anlamlı; `subeler` listesinden). Nullable — operasyon dışı roller ve eski satırlar için.
  aktif: boolean("aktif").notNull().default(true),
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

export const insertPortalKullaniciSchema = createInsertSchema(portalKullanicilar).omit({
  id: true,
  olusturmaTarihi: true,
});
export type InsertPortalKullanici = z.infer<typeof insertPortalKullaniciSchema>;
export type PortalKullanici = typeof portalKullanicilar.$inferSelect;

// Beyanname referans listesi — Excel'den beslenir, DOSYA NO ile upsert
export const beyannameler = pgTable("beyannameler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Transitte dosya no YOKTUR -> nullable. IM/EX icin parser her zaman doldurur.
  dosyaNo: text("dosya_no"),
  alici: text("alici"),
  gonderen: text("gonderen"),
  koli: integer("koli"),
  gumrukIdaresi: text("gumruk_idaresi"),
  beyanTarihi: text("beyan_tarihi"), // YYYY-MM-DD; Excel'de "." veya boş → null
  beyanNo: text("beyan_no"),
  fatBedeli: decimal("fat_bedeli", { precision: 18, scale: 2 }),
  doviz: text("doviz"),
  kullanici: text("kullanici"), // AV sütunu — temsilci filtre alanı
  // Nakliye eşleştirmesi için: R (HOUSE NO) + BV (KONŞİMENTO NO) sütunlarından
  // çıkarılan benzersiz konteyner numaraları, virgülle ayrılmış.
  // Örn. "MRKU7242360, MSKU1234567". Hiç yoksa null.
  konteynerler: text("konteynerler"),
  // KANAL: hangi rapordan/uctan geldi. Gumruk rejim kodu DEGIL.
  // DEFAULT yalniz mevcut satirlari doldurmak icin; ice aktarma her zaman acikca yazar.
  rejim: text("rejim").notNull().default("IM"), // 'IM' | 'EX' | 'TR'
  // Ham gumruk rejim kodu (Excel AU sutunu): 4000, 7100, 5171 ...
  rejimKodu: text("rejim_kodu"),
  kaynak: text("kaynak").notNull().default("excel"), // 'excel' | 'manuel'
  sonGuncelleme: timestamp("son_guncelleme").defaultNow(),
}, (table) => [
  // IM ve EX ayni dosya no'yu kullanabilir -> kimlik CIFTTIR.
  // Tek kolonlu eski indeks, EX yuklemesinin IM kaydini sessizce ezmesine yol aciyordu.
  uniqueIndex("beyannameler_dosya_rejim_idx").on(table.dosyaNo, table.rejim),
  // Transitin kimligi beyan no'dur (dosya no'su yok). Kismi indeks: yalniz rejim='TR'.
  uniqueIndex("beyannameler_tr_beyan_no_idx").on(table.beyanNo).where(sql`${table.rejim} = 'TR'`),
  index("beyannameler_kullanici_idx").on(table.kullanici),
]);

export const insertBeyannameSchema = createInsertSchema(beyannameler).omit({
  id: true,
  sonGuncelleme: true,
});
export type InsertBeyanname = z.infer<typeof insertBeyannameSchema>;
export type Beyanname = typeof beyannameler.$inferSelect;

// Masraf türleri — yönetim panelinden düzenlenir
export const masrafTurleri = pgTable("masraf_turleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ad: text("ad").notNull().unique(),
  aktif: boolean("aktif").notNull().default(true),
  sira: integer("sira").notNull().default(0),
  belgeZorunlu: boolean("belge_zorunlu").notNull().default(true), // false: DOSYA gibi ayrı fişi olmayan yüksek hacimli türler
});

export const insertMasrafTuruSchema = createInsertSchema(masrafTurleri).omit({ id: true });
export type InsertMasrafTuru = z.infer<typeof insertMasrafTuruSchema>;
export type MasrafTuru = typeof masrafTurleri.$inferSelect;

// Ödeme talepleri — modülün kalbi
export const odemeTalepleri = pgTable("odeme_talepleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // NULLABLE: beyanname dosyası henüz açılmamışsa "dosyasız talep" — sonradan eşleştirilir
  beyannameId: varchar("beyanname_id").references(() => beyannameler.id),
  talepEdenId: varchar("talep_eden_id").notNull().references(() => portalKullanicilar.id),
  odemeTipi: text("odeme_tipi").notNull(), // 'masraf' | 'depo_teminat'
  masrafTuru: text("masraf_turu").notNull(), // masraf_turleri.ad kopyası; depo_teminat'ta sabit "Depo Teminatı"
  tutar: decimal("tutar", { precision: 18, scale: 2 }).notNull(),
  paraBirimi: text("para_birimi").notNull().default("TRY"), // TRY | USD | EUR
  alacakli: text("alacakli").notNull(), // kime ödenecek (firma adı)
  iban: text("iban"),
  aciklama: text("aciklama"),
  // Depo teminatında zorunlu (sunucu doğrular); masrafta null
  konsimentoNo: text("konsimento_no"),
  tasiyici: text("tasiyici"),
  durum: text("durum").notNull().default("bekliyor"), // 'bekliyor' | 'odendi'
  talepTarihi: text("talep_tarihi").notNull(), // YYYY-MM-DD
  odemeTarihi: text("odeme_tarihi"), // ödendi anında damgalanır
  odeyenId: varchar("odeyen_id").references(() => portalKullanicilar.id),
  // Depo teminatı iade takibi (Faz 2'de genişleyecek)
  iadeDurumu: text("iade_durumu"), // depo: 'beklemede' | 'iade_edildi'; masrafta null
  iadeTutari: decimal("iade_tutari", { precision: 18, scale: 2 }), // kısmi iade / demuraj kesintisi
  iadeTarihi: text("iade_tarihi"),
  iadeNotu: text("iade_notu"),
}, (table) => [
  index("odeme_talepleri_durum_idx").on(table.durum),
  index("odeme_talepleri_talep_eden_idx").on(table.talepEdenId),
  index("odeme_talepleri_tip_idx").on(table.odemeTipi),
]);

export const insertOdemeTalepSchema = createInsertSchema(odemeTalepleri).omit({ id: true });
export type InsertOdemeTalep = z.infer<typeof insertOdemeTalepSchema>;
export type OdemeTalep = typeof odemeTalepleri.$inferSelect;

// Ödeme belgeleri — talep başına çoklu dosya
export const odemeBelgeleri = pgTable("odeme_belgeleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  talepId: varchar("talep_id").notNull().references(() => odemeTalepleri.id, { onDelete: "cascade" }),
  belgeTipi: text("belge_tipi").notNull(), // 'fatura' (temsilci) | 'dekont' | 'konsimento' (muhasebe)
  filename: text("filename").notNull(),
  filepath: text("filepath").notNull(), // uploads/odemeler/... (ileri eğik çizgili)
  yukleyenId: varchar("yukleyen_id").notNull().references(() => portalKullanicilar.id),
  yuklemeTarihi: timestamp("yukleme_tarihi").defaultNow(),
}, (table) => [
  index("odeme_belgeleri_talep_idx").on(table.talepId),
]);

export const insertOdemeBelgeSchema = createInsertSchema(odemeBelgeleri).omit({
  id: true,
  yuklemeTarihi: true,
});
export type InsertOdemeBelge = z.infer<typeof insertOdemeBelgeSchema>;
export type OdemeBelge = typeof odemeBelgeleri.$inferSelect;

// Ödeme yapılacak firmalar — muhasebe elle/Excel girer; temsilci talepte seçer.
// Depo onaylarından ve F1.8 çoklu-kalem gönderiminden de otomatik birikir.
export const odemeSirketleri = pgTable("odeme_sirketleri", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ad: text("ad").notNull().unique(),
  iban: text("iban"),            // (F1.9) TRY için geriye-uyum yedeği; yeni yazımlar ibanTry'ye gider
  ibanTry: text("iban_try"),
  ibanUsd: text("iban_usd"),
  banka: text("banka"),
  vergiNo: text("vergi_no"),
  notlar: text("notlar"), // "not" SQL rezerve kelimesi — "notlar" kullanılır
  kaynak: text("kaynak").notNull().default("muhasebe"), // muhasebe | temsilci | depo
  kullanimSayisi: integer("kullanim_sayisi").notNull().default(1),
  sonKullanim: timestamp("son_kullanim").defaultNow(),
  aktif: boolean("aktif").notNull().default(true),
});

export const insertOdemeSirketiSchema = createInsertSchema(odemeSirketleri).omit({
  id: true,
  sonKullanim: true,
});
export type InsertOdemeSirketi = z.infer<typeof insertOdemeSirketiSchema>;
export type OdemeSirketi = typeof odemeSirketleri.$inferSelect;

// Firma başına IBAN listesi (çoklu döviz/hesap). odeme_sirketleri'nin eski tekil
// iban/ibanTry/ibanUsd kolonları drop edilmez; çocuk satır yoksa okuma-yedeği olur.
export const firmaIbanlari = pgTable("firma_ibanlari", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firmaId: varchar("firma_id").notNull(), // FK odeme_sirketleri.id (açık snake string)
  paraBirimi: text("para_birimi").notNull(), // TRY | USD | EUR
  iban: text("iban").notNull(),
  etiket: text("etiket"), // banka adı / ayırt edici not
}, (t) => [
  index("IDX_firma_ibanlari_firma").on(t.firmaId),
]);
export const insertFirmaIbanSchema = createInsertSchema(firmaIbanlari).omit({ id: true });
export type InsertFirmaIban = z.infer<typeof insertFirmaIbanSchema>;
export type FirmaIban = typeof firmaIbanlari.$inferSelect;
export type OdemeSirketiDetay = OdemeSirketi & { ibanlar: FirmaIban[] };

// ==================== OPERASYON KASASI (ŞUBE MASRAF) ====================
// Muhasebe → operasyon avans yüklemeleri
export const operasyonAvanslar = pgTable("operasyon_avanslar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  operasyonId: varchar("operasyon_id").notNull(),
  tutar: decimal("tutar", { precision: 14, scale: 2 }).notNull(),
  aciklama: text("aciklama"),
  tarih: text("tarih").notNull(),
  gonderenId: varchar("gonderen_id").notNull(),
  belgeDosya: text("belge_dosya"), // Dekont — OPSİYONEL (elden nakit avansta olmayabilir)
  belgeAdi: text("belge_adi"),
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
  sube: text("sube"), // Kayıt anındaki şube SNAPSHOT'ı — kullanıcının güncel şubesinden TÜRETİLMEZ (geçmiş sabit kalır)
  tutar: decimal("tutar", { precision: 14, scale: 2 }).notNull(),
  alacakli: text("alacakli").notNull(),
  iban: text("iban"),
  aciklama: text("aciklama"),
  tarih: text("tarih").notNull(),
  belgeDosya: text("belge_dosya"), // belgeZorunlu=false türlerde null olabilir
  belgeAdi: text("belge_adi"),
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

// Şube gider raporu — türetilmiş tipler (tablo DEĞİL, /api/portal/operasyon-takip/rapor/sube dönüşü)
export type SubeGiderSatiri = { masrafTuru: string; adet: number; tutar: number };
export type SubeGiderBloku = { sube: string; toplam: number; turler: SubeGiderSatiri[] };
export type SubeGiderRaporu = { subeler: SubeGiderBloku[]; genelToplam: number };

// connect-pg-simple'ın çalışma anında oluşturduğu oturum tablosu.
// Şemada tanımlı olmazsa drizzle-kit push bu tabloyu SİLMEYE çalışır ve
// CI'daki non-interactive push onay bekleyip HİÇBİR değişikliği uygulamaz.
// Yapı, canlıdaki tabloyla birebir aynıdır — push için no-op.
export const portalSessions = pgTable("portal_sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => [
  index("IDX_session_expire").on(table.expire),
]);

// Otomatik Excel yükleme log'u (Power Automate → /api/ingest)
export const otomatikYuklemeLog = pgTable("otomatik_yukleme_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tip: text("tip").notNull(),                       // "mizan" | "beyanname"
  dosyaAdi: text("dosya_adi").notNull(),
  durum: text("durum").notNull(),                   // "basarili" | "atlandi" | "hata"
  kayitSayisi: integer("kayit_sayisi").notNull().default(0),
  mesaj: text("mesaj"),
  zaman: text("zaman").notNull(),                   // yerel "YYYY-MM-DD HH:mm:ss"
});

export const insertOtomatikYuklemeLogSchema = createInsertSchema(otomatikYuklemeLog).omit({ id: true });
export type InsertOtomatikYuklemeLog = z.infer<typeof insertOtomatikYuklemeLogSchema>;
export type OtomatikYuklemeLog = typeof otomatikYuklemeLog.$inferSelect;
