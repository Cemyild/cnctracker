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
