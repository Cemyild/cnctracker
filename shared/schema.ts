import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, date, integer, uniqueIndex, index, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
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
  // Kasko
  kaskoSigortaSirketi: text("kasko_sigorta_sirketi"),
  kaskoPoliceNo: text("kasko_police_no"),
  kaskoBitisTarihi: text("kasko_bitis_tarihi"),
  kaskoSigortaFiyat: decimal("kasko_sigorta_fiyat", { precision: 15, scale: 2 }),
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
  olusturmaTarihi: timestamp("olusturma_tarihi").defaultNow(),
});

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
