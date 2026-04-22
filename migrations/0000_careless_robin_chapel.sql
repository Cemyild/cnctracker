-- Incremental migration: add surveys.type column and new ISO 9001 tables
-- Existing tables are already in DB; only new additions are applied here.

ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'musteri' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "duf" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baslik" text NOT NULL,
	"uygunsuzluk_kaynagi" text NOT NULL,
	"aciklama" text NOT NULL,
	"sorumlu_kisi" text NOT NULL,
	"hedef_kapanis_tarihi" text NOT NULL,
	"durum" text DEFAULT 'acik' NOT NULL,
	"kok_neden_analizi" text,
	"alinan_aksiyon" text,
	"dosya_eki" text,
	"olusturma_tarihi" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tetkik_planlar" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tetkik_adi" text NOT NULL,
	"planlanan_tarih" text NOT NULL,
	"tetkik_edilen_bolum" text NOT NULL,
	"bas_tetkikci" text NOT NULL,
	"durum" text DEFAULT 'planlandi' NOT NULL,
	"dosya_eki" text,
	"olusturma_tarihi" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tetkik_bulgular" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tetkik_plan_id" varchar NOT NULL,
	"bulgu_turu" text NOT NULL,
	"bulgu_aciklamasi" text NOT NULL,
	"ilgili_iso_maddesi" text,
	"durum" text DEFAULT 'acik' NOT NULL,
	"olusturma_tarihi" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "tetkik_bulgular" ADD CONSTRAINT "tetkik_bulgular_tetkik_plan_id_tetkik_planlar_id_fk" FOREIGN KEY ("tetkik_plan_id") REFERENCES "public"."tetkik_planlar"("id") ON DELETE cascade ON UPDATE no action;