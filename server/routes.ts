import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { buildDedupKey } from "./dedup";
import multer from "multer";
import { type IStorage } from "./storage";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import express from "express";
import { pdfMetniCikar, faturaAnalizEt } from "./nakliye/faturaAnaliz";
import { faturaDogrula } from "./nakliye/dogrulama";

const ruhsatStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads/ruhsat";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ruhsat-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const uploadRuhsat = multer({ storage: ruhsatStorage });

const trafikPoliceStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const dir = "uploads/trafik-police";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (_req, file, cb) {
    cb(null, `trafik-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});
const uploadTrafikPolice = multer({ storage: trafikPoliceStorage });

const kaskoPoliceStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const dir = "uploads/kasko-police";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (_req, file, cb) {
    cb(null, `kasko-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});
const uploadKaskoPolice = multer({ storage: kaskoPoliceStorage });

const dufStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const dir = "uploads/duf";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (_req, file, cb) {
    cb(null, `duf-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});
const uploadDuf = multer({ storage: dufStorage });

const tetkikStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const dir = "uploads/tetkik";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (_req, file, cb) {
    cb(null, `tetkik-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});
const uploadTetkik = multer({ storage: tetkikStorage });

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

const egitimStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "uploads/egitimler";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const uploadEgitim = multer({ storage: egitimStorage });

// Nakliye e-Arşiv fatura PDF'leri. Geçici adla kaydedilir; analiz sonrası
// fatura numarasıyla yeniden adlandırılır (fatura no analizden önce bilinmiyor).
const nakliyeFaturaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "uploads/nakliye";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `gecici-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
  },
});
const uploadNakliyeFatura = multer({
  storage: nakliyeFaturaStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Bordro arşiv: uploads/bordro/{yil}/{ay-sayi}/{filename}
// ay/yıl req.body'den geldiği için route handler'ında okunuyor; multer'a
// diskStorage yerine memoryStorage verip dosyayı kendimiz taşıyoruz.
const uploadBordroMemory = multer({ storage: multer.memoryStorage() });

// Mizan upload — memory storage; arşivleme route handler'ında md5 hesabıyla yapılır
const uploadMizanMemory = multer({ storage: multer.memoryStorage() });

// Beyanname Excel — memory storage; upsert route handler'ında yapılır
const uploadBeyannameMemory = multer({ storage: multer.memoryStorage() });

// Ödeme firmaları Excel içe aktarımı (bellekte; ay/yıl yok)
const uploadOdemeSirketExcel = multer({ storage: multer.memoryStorage() });

// Konşimento analizi — memory storage: analiz aşamasında diske yazılmaz
const uploadKonsimentoMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Yalnız PDF dosyası yüklenebilir"));
  },
});

const odemeBelgeStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "uploads/odemeler";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `odeme-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});
const uploadOdemeBelge = multer({ storage: odemeBelgeStorage });

const operasyonBelgeStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = "uploads/operasyon";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `op-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});
const uploadOperasyonBelge = multer({ storage: operasyonBelgeStorage });

// Multer Latin-1 default'undan kaynaklanan UTF-8 mojibake'i düzeltir.
// Türkçe dosya isimlerinde "ŞUBAT" → "ÅUBAT" gibi bozulmaları çözer.
function fixUploadFilename(name: string): string {
  if (!name) return name;
  try {
    return Buffer.from(name, "latin1").toString("utf8");
  } catch {
    return name;
  }
}

import { insertGumrukVerisiSchema, insertAracSchema, type InsertGumrukVerisi, insertNakliyeVerisiSchema, insertSigortaPoliceSchema, insertSigortaMuhasebeSchema, insertSalaryPlanSchema, insertExpenseCategorySchema, insertAracGiderSchema, aylar } from "@shared/schema";
import { konteynerAnahtarlari } from "@shared/konteyner";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import {
  aylikHesapla,
  yillikHesapla,
  belirliAyHesapla,
  PARAMETRELER_2025,
} from "@shared/salaryCalculations";
import { parseUcretPusulasiPdf, ayNumaraToKey } from "./bordroParser";
import { isGunuSayisi, bakiyeHesapla } from "@shared/izinHesaplari";
import { type InsertAcilisBakiye, type InsertCalisanIzin } from "@shared/schema";
import { parseMizanXlsx } from "./mizanParser";
import { parseBeyannameWorkbook, parseIhracatWorkbook } from "./beyannameParser";
import { benzerlikSkoru, ESLESME_AUTO_ESIK, ESLESME_ONERI_ESIK } from "./eslestirme";
import {
  netBakiye, gecikme, isAktivitesiAcigi, bakiyeFaturaAcigi, riskProfili,
  odemeOrani, firmaSegmenti, nedenCumlesi, odemeRitmi,
  type RiskEsikleri,
} from "@shared/tahsilatHesaplari";
import { type InsertMusteri, type InsertMizanYukleme, type InsertMizanBakiye, type InsertEslestirmeOneri, musteriler, mizanEslestirmeOnerileri } from "@shared/schema";
import { db } from "./db";
import { inArray } from "drizzle-orm";


import { PDFParse } from "pdf-parse";
import { getTCMBExchangeRate, normalizeCurrencyCode } from "./currency"; // Helper added
import { processUserQuery, generateNaturalLanguageResponse } from "./lib/openai";
import { extractPolicyFields } from "./lib/policeOcr";
import { hashSifre, dogrulaSifre, requirePortal, requireMuhasebe, requireOperasyon } from "./portalAuth";
import { konsimentoAnalizEt, analizYapilandirildiMi } from "./konsimentoAnaliz";
import { insertPortalKullaniciSchema, type PortalKullanici, type InsertPortalKullanici, type Beyanname } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";


// Row hash oluştur - satırı benzersiz tanımlamak için
function createRowHash(row: any[]): string {
  const key = row.map(v => String(v || "")).join("|");
  return createHash("md5").update(key).digest("hex");
}

// Geçerli ay değerleri
const gecerliAylar = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"] as const;

// FATURA TARİHİ alanından ay/yıl çıkar — Excel serial, YYYY-MM-DD veya dd.mm.yyyy / dd/mm/yyyy
function tarihiAyYilCikar(raw: any): { ay: string; yil: number } | null {
  if (raw == null || raw === "") return null;
  // Excel serial number
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const parsed = (XLSX as any).SSF?.parse_date_code?.(raw);
    if (parsed && parsed.y && parsed.m) return { ay: gecerliAylar[parsed.m - 1], yil: parsed.y };
    return null;
  }
  const s = String(raw).trim();
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const yy = Number(m[1]), mm = Number(m[2]);
    if (mm >= 1 && mm <= 12) return { ay: gecerliAylar[mm - 1], yil: yy };
  }
  // dd.mm.yyyy or dd/mm/yyyy
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) {
    const mm = Number(m[2]), yy = Number(m[3]);
    if (mm >= 1 && mm <= 12) return { ay: gecerliAylar[mm - 1], yil: yy };
  }
  return null;
}

// Upload parametreleri için validation schema
const uploadParamsSchema = z.object({
  ay: z.enum(gecerliAylar).optional(),
  yil: z.string().regex(/^\d{4}$/).transform(Number).optional(),
  bulk: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
  force: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
  headerMapping: z.string().optional(),
}).refine(d => (d.bulk === true || d.bulk === "true") || (d.ay && d.yil !== undefined), {
  message: "Bulk modunda değilse ay ve yıl zorunlu",
});

const upload = multer({ storage: multer.memoryStorage() });

class MizanMukerrerHata extends Error {
  constructor(public duplicateId: string) {
    super("Aynı dosya daha önce yüklenmiş");
  }
}
class MizanBosHata extends Error {}

async function processMizanBuffer(
  buffer: Buffer,
  filename: string,
  opts: { mizanTarihi?: string | null; not?: string | null; overrideDuplicate?: boolean } = {},
): Promise<{ mizanId: string; eklenenMusteri: number; guncellenenMusteri: number; eklenenBakiye: number; kayitSayisi: number }> {
  const md5 = createHash("md5").update(buffer).digest("hex");
  if (!opts.overrideDuplicate) {
    const dup = await storage.getMizanByMd5(md5);
    if (dup) throw new MizanMukerrerHata(dup.id);
  }

  const parsed = parseMizanXlsx(buffer, filename);
  if (parsed.satirlar.length === 0) {
    throw new MizanBosHata("Mizan'da 120- ile başlayan satır bulunamadı");
  }

  const mizanTarihi = opts.mizanTarihi || parsed.mizanTarihi || new Date().toISOString().slice(0, 10);
  const not = opts.not ?? null;

  // Filesystem arşivi
  const yil = mizanTarihi.slice(0, 4);
  const ay = mizanTarihi.slice(5, 7);
  const safeName = filename.replace(/[\\/:*?"<>|]/g, "_");
  const archiveDir = path.join(process.cwd(), "uploads", "mizan", yil, ay);
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  const filepath = path.join(archiveDir, `${md5}-${safeName}`);
  await fs.promises.writeFile(filepath, buffer);

  const toplamNetBakiye = parsed.satirlar.reduce(
    (acc, r) => acc + netBakiye({ sonBakiye: r.sonBakiye, sonBakiyeBA: r.sonBakiyeBA }),
    0,
  );

  const mizan = await storage.insertMizanYukleme({
    mizanTarihi,
    filename,
    filepath,
    sizeBytes: buffer.length,
    md5Hash: md5,
    kayitSayisi: parsed.satirlar.length,
    toplamNetBakiye: String(toplamNetBakiye),
    not,
  });

  let eklenenMusteri = 0;
  let guncellenenMusteri = 0;
  const bakiyeBatch: InsertMizanBakiye[] = [];
  const gumrukUnvanlar = await storage.getDistinctGumrukUnvanlar();

  for (const r of parsed.satirlar) {
    let musteri = await storage.getMusteriByHesapKodu(r.hesapKodu);
    if (!musteri) {
      let gumrukEslesen: string | null = null;
      let gumrukEslesenSkor = 0;
      const oneriler: { unvan: string; skor: number }[] = [];
      for (const u of gumrukUnvanlar) {
        const s = benzerlikSkoru(r.hesapAdi, u);
        if (s >= ESLESME_AUTO_ESIK && !gumrukEslesen) {
          gumrukEslesen = u;
          gumrukEslesenSkor = s;
        } else if (s >= ESLESME_ONERI_ESIK && s < ESLESME_AUTO_ESIK) {
          oneriler.push({ unvan: u, skor: s });
        }
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
          benzerlikSkoru: gumrukEslesenSkor.toFixed(3),
        });
      }
      for (const o of oneriler.slice(0, 5)) {
        await storage.insertEslestirmeOneri({
          musteriId: musteri.id,
          gumrukUnvan: o.unvan,
          benzerlikSkoru: String(o.skor.toFixed(3)),
        });
      }
      eklenenMusteri++;
    } else {
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

  return {
    mizanId: mizan.id,
    eklenenMusteri,
    guncellenenMusteri,
    eklenenBakiye,
    kayitSayisi: parsed.satirlar.length,
  };
}

// Yerel "YYYY-MM-DD HH:mm:ss" (log zamanı) — new Date() display yönlendirmesi yok
function zamanDamgasi(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Otomatik alım token doğrulaması — fail-closed (env yoksa 503)
function requireIngestToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) return res.status(503).json({ error: "Otomatik alım devre dışı" });
  const got = req.header("x-ingest-token") || "";
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(expected).digest();
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Yetkisiz" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Serve static files
  app.use('/uploads', express.static('uploads'));

  app.post("/api/araclar/:id/ruhsat", uploadRuhsat.single('ruhsat'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Dosya yüklenemedi." });
      }

      const fileUrl = `/uploads/ruhsat/${req.file.filename}`;

      await storage.updateArac(req.params.id, { ruhsatDosyasi: fileUrl });

      res.json({ message: "Ruhsat yüklendi", url: fileUrl });
    } catch (err) {
      console.error("Ruhsat yükleme hatası:", err);
      res.status(500).json({ error: "Ruhsat yüklenirken bir hata oluştu" });
    }
  });

  app.post("/api/araclar/:id/trafik-police", uploadTrafikPolice.single('police'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Dosya yüklenemedi." });
      }
      const fileUrl = `/uploads/trafik-police/${req.file.filename}`;
      const updated = await storage.updateArac(req.params.id, { trafikPoliceDosyasi: fileUrl });
      if (!updated) return res.status(404).json({ error: "Bulunamadı" });

      // OCR (best-effort): poliçeden alanları çıkar; yalnızca BOŞ alanları doldur (mevcut veriyi ezme)
      let extracted = null;
      try {
        extracted = await extractPolicyFields(req.file.path, "trafik");
        if (extracted) {
          const patch: any = {};
          if (extracted.sirket && !updated.trafikSigortaSirketi) patch.trafikSigortaSirketi = extracted.sirket;
          if (extracted.policeNo && !updated.trafikPoliceNo) patch.trafikPoliceNo = extracted.policeNo;
          if (extracted.bitisTarihi && !updated.trafikBitisTarihi) patch.trafikBitisTarihi = extracted.bitisTarihi;
          if (extracted.fiyat && (!updated.trafikSigortaFiyat || Number(updated.trafikSigortaFiyat) === 0)) patch.trafikSigortaFiyat = extracted.fiyat;
          if (Object.keys(patch).length > 0) await storage.updateArac(req.params.id, patch);
        }
      } catch (ocrErr) {
        console.error("Trafik poliçe OCR hatası (yükleme yine de başarılı):", ocrErr);
      }

      res.json({ message: "Trafik poliçesi yüklendi", url: fileUrl, extracted });
    } catch (err) {
      console.error("Trafik poliçe yükleme hatası:", err);
      res.status(500).json({ error: "Trafik poliçesi yüklenirken bir hata oluştu" });
    }
  });

  app.post("/api/araclar/:id/kasko-police", uploadKaskoPolice.single('police'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Dosya yüklenemedi." });
      }
      const fileUrl = `/uploads/kasko-police/${req.file.filename}`;
      const updated = await storage.updateArac(req.params.id, { kaskoPoliceDosyasi: fileUrl });
      if (!updated) return res.status(404).json({ error: "Bulunamadı" });

      // OCR (best-effort): poliçeden alanları çıkar; yalnızca BOŞ alanları doldur (mevcut veriyi ezme)
      let extracted = null;
      try {
        extracted = await extractPolicyFields(req.file.path, "kasko");
        if (extracted) {
          const patch: any = {};
          if (extracted.sirket && !updated.kaskoSigortaSirketi) patch.kaskoSigortaSirketi = extracted.sirket;
          if (extracted.policeNo && !updated.kaskoPoliceNo) patch.kaskoPoliceNo = extracted.policeNo;
          if (extracted.bitisTarihi && !updated.kaskoBitisTarihi) patch.kaskoBitisTarihi = extracted.bitisTarihi;
          if (extracted.fiyat && (!updated.kaskoSigortaFiyat || Number(updated.kaskoSigortaFiyat) === 0)) patch.kaskoSigortaFiyat = extracted.fiyat;
          if (Object.keys(patch).length > 0) await storage.updateArac(req.params.id, patch);
        }
      } catch (ocrErr) {
        console.error("Kasko poliçe OCR hatası (yükleme yine de başarılı):", ocrErr);
      }

      res.json({ message: "Kasko poliçesi yüklendi", url: fileUrl, extracted });
    } catch (err) {
      console.error("Kasko poliçe yükleme hatası:", err);
      res.status(500).json({ error: "Kasko poliçesi yüklenirken bir hata oluştu" });
    }
  });

  // Trend Analysis Endpoint
  app.get("/api/gumruk/analiz", async (req, res) => {
    try {
      const churnMonths = req.query.churnMonths ? parseInt(req.query.churnMonths as string) : 2;
      // Karşılaştırma penceresi (kaç ay vs kaç ay) — varsayılan 3
      const comparisonWindow = req.query.comparisonWindow ? Math.max(1, parseInt(req.query.comparisonWindow as string)) : 3;
      // "Tamamen kaybedilenleri de göster" → lookback limitini kaldır
      const includeAllChurn = req.query.includeAllChurn === "true";
      // Trend listesi sınırı (default 100, "all" → sınırsız)
      const topNRaw = req.query.topN as string | undefined;
      const topN = topNRaw === "all" ? Infinity : (topNRaw ? Math.max(10, parseInt(topNRaw)) : 100);
      const allData = await storage.getAllGumrukVerileri();
      
      const parseBalance = (val: string | null | undefined): number => {
          if (!val) return 0;
          // If it's already a clean number-like string (no dots/commas mixed weirdly), Number() might work
          // But to be safe for "1.234,56":
          // 1. Remove dots (thousands)
          // 2. Replace comma with dot
          
          let v = String(val).trim();
          if (!v) return 0;

          // Check format
          if (v.includes(",") && v.includes(".")) {
             // Likely 1.234,56 (TR) or 1,234.56 (US)
             // Determine which is last.
             const lastDot = v.lastIndexOf(".");
             const lastComma = v.lastIndexOf(",");
             
             if (lastComma > lastDot) {
                 // 1.234,56 -> TR format
                 v = v.replace(/\./g, "").replace(",", ".");
             } else {
                 // 1,234.56 -> US format
                 v = v.replace(/,/g, "");
             }
          } else if (v.includes(",")) {
              // 123,56 -> TR decimal? or 123,456 US thousand?
              // Usually in this app context, comma is decimal.
              v = v.replace(",", ".");
          }
          // If only dots? "1.200" -> TR thousand? or US low decimal? 
          // Assuming TR app: dots are thousands remover.
          // BUT wait, if val is "1200.50" (standard DB decimal string), removing dot makes it 120050.
          else if (v.includes(".")) {
               // Standard DB return for decimal type is "1234.56".
               // So if we have JUST dots, it's ambiguous without context, but valid JS number string is dot-decimal.
               // We will trust Number() for dot-only strings unless we know it's TR formatting.
               // For safety in this specific DB context: `decimal` type returns "1234.56".
               // So we typically don't need to strip dots if it comes from DB driver as `decimal`.
               // HOWEVER, if it was saved as text "1.234", then it's problem.
               // Given schema is `decimal`, Drizzle/PG returns "1234.56".
          }

          const parsed = parseFloat(v);
          return isNaN(parsed) ? 0 : parsed;
      };

      if (allData.length === 0) {
        return res.json({ alerts: [], risingTrends: [], fallingTrends: [] });
      }

      // 1. Determine "Current" Date (Max Date in DB)
      let maxYil = 0;
      let maxAyIndex = -1;

      const getAyIndex = (ayStr: string) => aylar.findIndex(a => a.value === ayStr);

      allData.forEach(d => {
        if (d.yil > maxYil) {
          maxYil = d.yil;
          maxAyIndex = getAyIndex(d.ay);
        } else if (d.yil === maxYil) {
          const idx = getAyIndex(d.ay);
          if (idx > maxAyIndex) maxAyIndex = idx;
        }
      });
      
      // If no valid date found
      if (maxYil === 0 || maxAyIndex === -1) {
         return res.json({ alerts: [], risingTrends: [], fallingTrends: [] });
      }

      // Convert a date (year, monthIdx) to absolute month count for easy diff
      const toAbsMonth = (y: number, mIdx: number) => y * 12 + mIdx;
      
      const currentAbs = toAbsMonth(maxYil, maxAyIndex);
      
      // Define Periods (parametrik karşılaştırma penceresi)
      // Current Period: Son N ay (currentAbs dahil) → [current - (N-1), current]
      // Previous Period: Bunun öncesi N ay → [current - (2N-1), current - N]
      const W = comparisonWindow;
      const currentStart = currentAbs - (W - 1);
      const currentEnd = currentAbs;
      const prevStart = currentAbs - (2 * W - 1);
      const prevEnd = currentAbs - W;

      const firms = new Map<string, {
         name: string;
         volCurrent: number;
         volPrev: number;
         lastSeenAbs: number;
         firstSeenAbs: number;
         totalVol: number;
         transactionCount: number; // toplam işlem sayısı
      }>();

      // Ay numarasını okunabilir label'a çevir: "ocak"+2026 → "Ocak 2026"
      const absToLabel = (abs: number): string => {
         const y = Math.floor(abs / 12);
         const mIdx = abs - y * 12;
         const ayObj = aylar[mIdx];
         return ayObj ? `${ayObj.label} ${y}` : `?${abs}`;
      };

      for (const d of allData) {
         if (!d.firmaUnvan) continue;
         const fName = d.firmaUnvan;

         if (!firms.has(fName)) {
            firms.set(fName, {
                name: fName,
                volCurrent: 0,
                volPrev: 0,
                lastSeenAbs: -1,
                firstSeenAbs: 9999999,
                totalVol: 0,
                transactionCount: 0,
            });
         }

         const firm = firms.get(fName)!;
         const dAyIdx = getAyIndex(d.ay);
         if (dAyIdx === -1) continue;

         const dAbs = toAbsMonth(d.yil, dAyIdx);

         const vol = parseBalance(d.malBedeli);

         firm.totalVol += vol;
         firm.transactionCount += 1;

         if (dAbs > firm.lastSeenAbs) firm.lastSeenAbs = dAbs;
         if (dAbs < firm.firstSeenAbs) firm.firstSeenAbs = dAbs;

         if (dAbs >= currentStart && dAbs <= currentEnd) {
            firm.volCurrent += vol;
         } else if (dAbs >= prevStart && dAbs <= prevEnd) {
            firm.volPrev += vol;
         }
      }

      const alerts: any[] = [];
      const trends: any[] = [];
      // Risk altındaki ciro: son işlem ayında aktif olan ama şimdi inactive
      // firmaların TOPLAM hacmi (KDV hariç). Kayıp yıllık potansiyel.
      let riskliFirmalarToplamHacim = 0;
      let riskliFirmaSayisi = 0;
      // "Yeni" kategorisindeki firmalar — trends'ten çıkarmak için
      const yeniFirmalar = new Set<string>();

      firms.forEach(f => {
         // 1. Churn Risk
         // includeAllChurn=true ise lookback yok (her zaman aktif olmuş herkes dahil)
         // false ise sadece son (churnMonths + 3) ay içinde aktif olanlar
         const lookbackLimit = currentAbs - (churnMonths + 3);
         const isRelevant = includeAllChurn ? true : f.lastSeenAbs >= lookbackLimit;
         const isInactive = f.lastSeenAbs <= (currentAbs - churnMonths);
         // Hiç görülmemiş firmalar dahil olmasın (lastSeenAbs = -1)
         const everSeen = f.lastSeenAbs >= 0;

         if (everSeen && isRelevant && isInactive) {
             const inactiveMonths = Math.floor(currentAbs - f.lastSeenAbs);
             alerts.push({
                 type: "churn_risk",
                 company: f.name,
                 message: `Son işlem: ${inactiveMonths} ay önce`,
                 inactiveMonths,
                 lastSeenLabel: absToLabel(f.lastSeenAbs),
                 totalVol: f.totalVol,
                 transactionCount: f.transactionCount,
                 severity: "high",
             });
             riskliFirmalarToplamHacim += f.totalVol;
             riskliFirmaSayisi += 1;
         }

         // 2. Yeni Müşteri: ilk işlem son N ayda
         if (f.firstSeenAbs >= (currentAbs - (W - 1)) && f.firstSeenAbs >= 0) {
             alerts.push({
                 type: "new_customer",
                 company: f.name,
                 message: `İlk işlem: ${absToLabel(f.firstSeenAbs)}`,
                 firstSeenLabel: absToLabel(f.firstSeenAbs),
                 firstSeenAbs: f.firstSeenAbs,
                 totalVol: f.totalVol,
                 transactionCount: f.transactionCount,
                 currentVol: f.volCurrent,
                 severity: "success",
             });
             yeniFirmalar.add(f.name);
         }

         // TRENDS
         if (f.volCurrent > 0 || f.volPrev > 0) {
             let growthPct = 0;
             if (f.volPrev > 0) {
                 growthPct = ((f.volCurrent - f.volPrev) / f.volPrev) * 100;
             } else if (f.volCurrent > 0) {
                 growthPct = 100;
             }

             if (f.volCurrent + f.volPrev > 1000) {
                 trends.push({
                     company: f.name,
                     currentVol: f.volCurrent,
                     prevVol: f.volPrev,
                     growth: growthPct,
                     absGrowth: f.volCurrent - f.volPrev,
                 });
             }
         }
      });

      // Yeni müşterileri rising trendsten çıkar (çakışma — onlar zaten Yeni tab'ında)
      const trendsExcludingNew = trends.filter(t => !yeniFirmalar.has(t.company));

      // Sırala + topN ile kes
      const risingTrends = trendsExcludingNew
         .filter(t => t.growth > 0)
         .sort((a, b) => b.growth - a.growth)
         .slice(0, Number.isFinite(topN) ? topN : trendsExcludingNew.length);
      const fallingTrends = trendsExcludingNew
         .filter(t => t.growth < 0)
         .sort((a, b) => a.growth - b.growth)
         .slice(0, Number.isFinite(topN) ? topN : trendsExcludingNew.length);

      const currentPeriodLabel = W === 1
         ? `Son Ay (${absToLabel(currentEnd)})`
         : `Son ${W} Ay (${absToLabel(currentStart)} – ${absToLabel(currentEnd)})`;
      const previousPeriodLabel = W === 1
         ? `Önceki Ay (${absToLabel(prevEnd)})`
         : `Önceki ${W} Ay (${absToLabel(prevStart)} – ${absToLabel(prevEnd)})`;

      res.json({
         currentPeriodLabel,
         previousPeriodLabel,
         comparisonWindow: W,
         alerts,
         risingTrends,
         fallingTrends,
         riskOzet: {
             firmaSayisi: riskliFirmaSayisi,
             toplamHacim: riskliFirmalarToplamHacim,
         },
      });

    } catch (e) {
      console.error("Analiz hatası:", e);
      res.status(500).json({ error: "Analiz yapılamadı" });
    }
  });

  // Firma drill-down: belirli firmanın aylık hacim+işlem timeline'ı.
  // Trend Analizi'nden bir firmaya tıklandığında detay grafik için.
  app.get("/api/gumruk/firma-timeline", async (req, res) => {
    try {
      const firma = (req.query.firma as string || "").trim();
      if (!firma) return res.status(400).json({ error: "firma parametresi zorunlu" });

      const getAyIndex = (ayStr: string) => aylar.findIndex(a => a.value === ayStr);

      // TR/US locale-aware sayı parse'ı (analiz endpoint'iyle aynı mantık)
      const parseBalance = (val: string | null | undefined): number => {
         if (!val) return 0;
         let v = String(val).trim();
         if (!v) return 0;
         if (v.includes(",") && v.includes(".")) {
             const lastDot = v.lastIndexOf(".");
             const lastComma = v.lastIndexOf(",");
             v = lastComma > lastDot ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
         } else if (v.includes(",")) {
             v = v.replace(",", ".");
         }
         const parsed = parseFloat(v);
         return isNaN(parsed) ? 0 : parsed;
      };

      // Firmaya ait kayıtları DB-side WHERE ile çek (filter optimize).
      const matched = await storage.getGumrukVerileriByFirma(firma);
      if (matched.length === 0) {
         return res.json({ firma, timeline: [], toplamHacim: 0, toplamIslem: 0 });
      }

      // (yıl, ayIdx) → { malBedeli, kdv, faturaTutari, islemSayisi }
      const monthly = new Map<number, {
         yil: number; ayIdx: number; ay: string;
         malBedeli: number; kdv: number; faturaTutari: number; islemSayisi: number;
      }>();

      let toplamHacim = 0;
      for (const d of matched) {
         const ayIdx = getAyIndex(d.ay);
         if (ayIdx === -1) continue;
         const abs = d.yil * 12 + ayIdx;
         if (!monthly.has(abs)) {
             monthly.set(abs, { yil: d.yil, ayIdx, ay: d.ay, malBedeli: 0, kdv: 0, faturaTutari: 0, islemSayisi: 0 });
         }
         const m = monthly.get(abs)!;
         const mb = parseBalance(d.malBedeli);
         m.malBedeli += mb;
         m.kdv += parseBalance(d.topKdvTutar);
         m.faturaTutari += parseBalance(d.topFaturaTutar);
         m.islemSayisi += 1;
         toplamHacim += mb;
      }

      // Sırala (kronolojik)
      const timeline = Array.from(monthly.values())
         .sort((a, b) => (a.yil * 12 + a.ayIdx) - (b.yil * 12 + b.ayIdx))
         .map(m => ({
             yil: m.yil,
             ay: m.ay,
             label: `${aylar[m.ayIdx]?.label || m.ay} ${m.yil}`,
             kisaLabel: `${(aylar[m.ayIdx]?.label || m.ay).slice(0, 3)} ${String(m.yil).slice(2)}`,
             malBedeli: m.malBedeli,
             kdv: m.kdv,
             faturaTutari: m.faturaTutari,
             islemSayisi: m.islemSayisi,
         }));

      res.json({
         firma,
         timeline,
         toplamHacim,
         toplamIslem: matched.length,
         ilkIslem: timeline[0]?.label,
         sonIslem: timeline[timeline.length - 1]?.label,
      });
    } catch (e) {
      console.error("Firma timeline hatası:", e);
      res.status(500).json({ error: "Timeline alınamadı" });
    }
  });

  // Nakliye e-Arşiv faturası yükleme — VPS'teki gmail_poller.py buraya
  // multipart POST eder. Ayrıştırma (Claude) ve doğrulama burada yapılır;
  // poller yalnızca PDF taşır.
  app.post("/api/nakliye/fatura-yukle", uploadNakliyeFatura.single("file"), async (req, res) => {
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

      // PDF'i fatura numarasıyla yeniden adlandır (mükerrer yüklemede üzerine yazar)
      const guvenliAd = alanlar.fatura_no.replace(/[^A-Za-z0-9._-]/g, "_");
      const kalici = path.join("uploads", "nakliye", `${guvenliAd}.pdf`);
      if (fs.existsSync(kalici)) fs.unlinkSync(kalici);
      fs.renameSync(req.file.path, kalici);

      // Dedup katman 1: aynı fatura ikinci kez işlenmez.
      // Yine de nakliye_verileri kontrolü aşağıda yapılır — ekranın kullandığı
      // tabloda kayıt eksikse tamamlanır.
      const mevcut = await storage.getNakliyeFaturasiByNo(alanlar.fatura_no);

      // e-Arşiv PDF'lerinde ETTN metinde geçer; Paraşüt kaydıyla kesin
      // eşleştirme için yakalanır (yoksa null).
      const ettnEslesme = hamMetin.match(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
      );

      const kayit = mevcut ?? await storage.insertNakliyeFaturasi({
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
        parasutEttn: ettnEslesme ? ettnEslesme[0].toLowerCase() : null,
        hamMetin,
        llmJson: JSON.stringify(alanlar),
        durum: dogrulama.gecerli ? "ayristirildi" : "dogrulama_hatasi",
        hataMesaji: dogrulama.gecerli ? null : dogrulama.hatalar.join(" | "),
      });

      // Nakliye ekranının (Navlun Faturaları) kullandığı tabloya da yaz.
      // Geçiş dönemi: nakliye_verileri ekranı besler, nakliye_faturalari
      // Paraşüt akışını yürütür; ikisi faturaNo üzerinden eşleşir.
      const mevcutVeri = (await storage.getNakliyeVerileri())
        .find((v) => v.faturaNo === alanlar.fatura_no);
      if (!mevcutVeri) {
        const kdvOrani = alanlar.kdv_orani ?? 0;
        const matrah = alanlar.matrah ?? 0;
        await storage.insertNakliyeVerileri([{
          faturaNo: alanlar.fatura_no,
          faturaTarihi: alanlar.fatura_tarihi,
          malHizmet: alanlar.aciklama,
          miktar: "1",
          birimFiyat: String(matrah),
          kdvOranı: kdvOrani,
          kdvTutarı: alanlar.kdv_tutari !== null ? String(alanlar.kdv_tutari) : null,
          malHizmetToplamTutarı: String(matrah),
          hesaplananKdv20: alanlar.kdv_tutari !== null ? String(alanlar.kdv_tutari) : null,
          hesaplananKdvTevkifat20:
            alanlar.tevkifat_tutari !== null ? String(alanlar.tevkifat_tutari) : null,
          vergilerDahilToplamTutar: String(matrah + (alanlar.kdv_tutari ?? 0)),
          odenecekTutar: alanlar.odenecek_tutar !== null ? String(alanlar.odenecek_tutar) : null,
          musteri: alanlar.musteri_firma_adi,
          konteynerler: alanlar.konteynerler.join(", "),
          tedarikciUnvan: alanlar.tedarikci_unvan,
          tedarikciVkn: alanlar.tedarikci_vkn,
          pdfYolu: `uploads/nakliye/${guvenliAd}.pdf`,
          rawJson: JSON.stringify(alanlar),
        }]);
      }

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

  // N8N Webhook Receiver (Gelen otomatik verileri dinler) - EN USTTE OLMALI
  app.post("/api/nakliye/webhook-receiver", async (req, res) => {
    console.log("--- N8N AUTOMATED RECEIVER START ---");
    try {
      const v = req.body;
      if (!v) return res.status(400).json({ error: "Veri boş geldi" });

      const parseNumber = (val: any) => {
        if (val === undefined || val === null || val === "") return null;
        const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : parseFloat(val);
        return isNaN(num) ? null : num.toString();
      };

      // Tekil veya dizi halindeki veriyi standardize et
      const items = Array.isArray(v) ? v : [v];

      const validVeriler = items.map(item => {
        // Eğer veri n8n'den nested geliyorsa (output/data içinde)
        const data = item.output || item.data || item;

        return {
          // AI bazen "Fatura No:" seklinde (iki noktali) gonderiyor, ikisini de kontrol et
          faturaNo: data["Fatura No"] || data["Fatura No:"] || data.faturaNo || null,
          faturaTarihi: data["Fatura Tarihi"] || data["Fatura Tarihi:"] || data.faturaTarihi || null,
          malHizmet: data["Mal Hizmet"] || data.malHizmet || null,
          miktar: parseNumber(data["Miktar"] || data.miktar),
          birimFiyat: parseNumber(data["Birim Fiyat"] || data.birimFiyat),
          kdvOranı: data["KDV Oranı"] ? parseInt(data["KDV Oranı"]) : (data.kdvOrani ? parseInt(data.kdvOrani) : null),
          kdvTutarı: parseNumber(data["KDV Tutarı"] || data.kdvTutari),
          malHizmetToplamTutarı: parseNumber(data["Mal Hizmet Toplam Tutarı"] || data.malHizmetToplamTutari),
          hesaplananKdv20: parseNumber(data["Hesaplanan KDV(%20)"] || data.hesaplananKdv20),
          hesaplananKdvTevkifat20: parseNumber(data["Hesaplanan KDV Tevkifat(%20)"] || data.hesaplananKdvTevkifat20),
          vergilerDahilToplamTutar: parseNumber(data["Vergiler Dahil Toplam Tutar"] || data.vergilerDahilToplamTutar),
          odenecekTutar: parseNumber(data["Ödenecek Tutar"] || data.odenecekTutar),
          rawJson: JSON.stringify(data)
        };
      });

      const saved = await storage.insertNakliyeVerileri(validVeriler);
      console.log(`DEBUG: Automated receiver saved ${saved.length} records.`);
      res.json({ success: true, count: saved.length });
    } catch (error) {
      console.error("DEBUG: Automated receiver error:", error);
      res.status(500).json({ error: "Veri işlenirken hata oluştu" });
    } finally {
      console.log("--- N8N AUTOMATED RECEIVER END ---");
    }
  });

  // Araçlar Endpoints
  app.get("/api/araclar", async (req, res) => {
    try {
      const araclar = await storage.getAraclar();
      res.json(araclar);
    } catch (err) {
      console.error("Araçlar listelenirken hata:", err);
      res.status(500).json({ error: "Araçlar listelenirken bir hata oluştu" });
    }
  });

  app.post("/api/araclar", async (req, res) => {
    try {
      const parsed = insertAracSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error });
      }
      const newArac = await storage.createArac(parsed.data);
      res.status(201).json(newArac);
    } catch (err) {
      console.error("Araç eklenirken hata:", err);
      res.status(500).json({ error: "Araç eklenirken bir hata oluştu" });
    }
  });

  app.put("/api/araclar/:id", async (req, res) => {
    try {
      const parsed = insertAracSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error });
      }
      const updatedArac = await storage.updateArac(req.params.id, parsed.data);
      res.json(updatedArac);
    } catch (err) {
      console.error("Araç güncellenirken hata:", err);
      res.status(500).json({ error: "Araç güncellenirken bir hata oluştu" });
    }
  });



  app.delete("/api/araclar/:id", async (req, res) => {
    try {
      await storage.deleteArac(req.params.id);
      res.sendStatus(204);
    } catch (err) {
      console.error("Araç silinirken hata:", err);
      res.status(500).json({ error: "Araç silinirken bir hata oluştu" });
    }
  });

  // Araç Giderleri Endpoints
  app.get("/api/araclar/:id/giderler", async (req, res) => {
    try {
      const giderler = await storage.getAracGiderler(req.params.id);
      res.json(giderler);
    } catch (err) {
      console.error("Araç giderleri listelenirken hata:", err);
      res.status(500).json({ error: "Giderler listelenirken hata oluştu" });
    }
  });

  app.post("/api/araclar/:id/giderler", async (req, res) => {
    try {
      const veriler = { ...req.body, aracId: req.params.id };
      const parsed = insertAracGiderSchema.safeParse(veriler);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error });
      }
      const newGider = await storage.createAracGider(parsed.data);
      res.status(201).json(newGider);
    } catch (err) {
      console.error("Araç gideri eklenirken hata:", err);
      res.status(500).json({ error: "Gider eklenirken hata oluştu" });
    }
  });

  app.post("/api/araclar/bulk-gider", async (req, res) => {
    try {
      const veriler = Array.isArray(req.body) ? req.body : [req.body];

      const validVeriler = [];
      for (const item of veriler) {
        const parsed = insertAracGiderSchema.safeParse(item);
        if (parsed.success) {
          // Kaynak işlem no'su (Halis Petrol "Satış ID") varsa tekrar yüklemede çift kaydı
          // önlemek için rowHash üret. Yoksa null → dedup uygulanmaz (manuel/tekil giderler gibi).
          const kaynakId = item?.kaynakId ?? item?.dedupKey;
          const data: any = { ...parsed.data };
          if (kaynakId) data.rowHash = createRowHash([String(data.aracId), String(kaynakId)]);
          validVeriler.push(data);
        } else {
          console.warn("Invalid vehicle expense item:", item, parsed.error);
        }
      }

      if (validVeriler.length === 0 && veriler.length > 0) {
        return res.status(400).json({ error: "Hiçbir gider kaydı geçerli formatta değil." });
      }

      const inserted = await storage.insertAracGiderler(validVeriler);
      res.json({ success: true, count: inserted.length, skipped: validVeriler.length - inserted.length });
    } catch (err) {
      console.error("Toplu araç gideri eklenirken hata:", err);
      res.status(500).json({ error: "Giderler eklenirken hata oluştu" });
    }
  });

  app.delete("/api/araclar/giderler/:id", async (req, res) => {
    try {
      await storage.deleteAracGider(req.params.id);
      res.sendStatus(204);
    } catch (err) {
      console.error("Araç gideri silinirken hata:", err);
      res.status(500).json({ error: "Gider silinirken hata oluştu" });
    }
  });

  // Tekrarlı yüklemelerden oluşan aynı yakıt giderlerini temizler (her gruptan biri kalır)
  app.post("/api/araclar/yakit-temizle-tekrar", async (_req, res) => {
    try {
      const removed = await storage.removeDuplicateAracGiderler();
      res.json({ removed });
    } catch (err) {
      console.error("Yakıt tekrar temizleme hatası:", err);
      res.status(500).json({ error: "Tekrarlar temizlenirken hata oluştu" });
    }
  });


  // ============================================================================
  // SİGORTA API'LERİ
  // ============================================================================

  app.get("/api/sigorta/policeler", async (req, res) => {
    try {
      const { sirket, ay, yil } = req.query;
      const results = await storage.getSigortaPoliceleri(
        sirket as string,
        ay as string,
        yil ? parseInt(yil as string) : undefined
      );
      res.json(results);
    } catch (err) {
      console.error("Poliçeler listelenirken hata:", err);
      if (err instanceof Error) console.error(err.stack);
      res.status(500).json({ error: "Poliçeler listelenirken hata oluştu: " + (err as Error).message });
    }
  });

  app.post("/api/sigorta/policeler", async (req, res) => {
    try {
      // Expecting array of policies
      const body = Array.isArray(req.body) ? req.body : [req.body];
      
      // Basic validation via schema is tricky for array directly with `safeParse`, loop it
      const validItems = [];
      for (const item of body) {
         const parsed = insertSigortaPoliceSchema.safeParse(item);
         if (parsed.success) {
            validItems.push(parsed.data);
         } else {
            console.warn("Invalid policy item:", item, parsed.error);
         }
      }

      if (validItems.length === 0 && body.length > 0) {
        console.warn("All policy items failed validation. First error:", insertSigortaPoliceSchema.safeParse(body[0]));
        return res.status(400).json({ 
            error: "Hiçbir poliçe geçerli formatta değil. Lütfen veri türlerini kontrol edin.",
            details: insertSigortaPoliceSchema.safeParse(body[0]) 
        });
      }

      const inserted = await storage.insertSigortaPoliceleri(validItems);
      res.json({ success: true, count: inserted.length });
    } catch (err) {
      console.error("Poliçe eklenirken hata:", err);
      if (err instanceof Error) console.error(err.stack);
      res.status(500).json({ error: "Poliçe eklenirken hata oluştu: " + (err as Error).message });
    }
  });

  // Race-safe nokta atışı dekont durumu güncellemesi (tek poliçe veya toplu).
  // Body: { id: string, dekontDurumu: string }  veya  { ids: string[], dekontDurumu: string }
  app.patch("/api/sigorta/policeler/dekont", async (req, res) => {
    try {
      const { id, ids, dekontDurumu } = req.body;
      const ALLOWED = ["EVET", "HAYIR", "TUTAR FARKI", ""];
      if (!ALLOWED.includes(dekontDurumu)) {
        return res.status(400).json({ error: "Geçersiz dekontDurumu" });
      }

      if (Array.isArray(ids) && ids.length > 0) {
        const count = await storage.updateSigortaPoliceleriDekontDurumuBulk(ids, dekontDurumu);
        return res.json({ success: true, count });
      }
      if (id) {
        const updated = await storage.updateSigortaPoliceDekontDurumu(id, dekontDurumu);
        if (!updated) return res.status(404).json({ error: "Bulunamadı" });
        return res.json({ success: true, policy: updated });
      }
      return res.status(400).json({ error: "id veya ids zorunlu" });
    } catch (err) {
      console.error("Dekont durumu güncellenirken hata:", err);
      res.status(500).json({ error: "Güncelleme sırasında hata oluştu" });
    }
  });

  app.delete("/api/sigorta/policeler", async (req, res) => {
    try {
       const { sirket, ay, yil } = req.query;
       if (!sirket) return res.status(400).json({ error: "Şirket seçilmeli" });
       
       await storage.deleteSigortaPoliceleri(
         sirket as string, 
         ay as string, 
         yil ? parseInt(yil as string) : undefined
       );
       res.json({ success: true });
    } catch (err) {
       console.error("Poliçe silinirken hata:", err);
       res.status(500).json({ error: "Poliçe silinirken hata oluştu" });
    }
  });

  // ============================================================================
  // SİGORTA MUHASEBE API'LERİ
  // ============================================================================

  app.get("/api/sigorta/muhasebe/by-police/:policyId", async (req, res) => {
    try {
      const records = await storage.getSigortaMuhasebeByPoliceId(req.params.policyId);
      res.json(records);
    } catch (err) {
      console.error("Poliçeye bağlı muhasebe kayıtları alınırken hata:", err);
      res.status(500).json({ error: "Kayıtlar alınırken hata oluştu" });
    }
  });

  app.get("/api/sigorta/muhasebe", async (req, res) => {
    try {
      const { sirket, ay, yil } = req.query;
      const results = await storage.getSigortaMuhasebeKayitlari(
        sirket as string,
        ay as string,
        yil ? parseInt(yil as string) : undefined
      );
      res.json(results);
    } catch (err) {
      console.error("Muhasebe kayıtları listelenirken hata:", err);
      res.status(500).json({ error: "Kayıtlar listelenirken hata oluştu" });
    }
  });

  app.post("/api/sigorta/muhasebe", async (req, res) => {
    try {
        const body = Array.isArray(req.body) ? req.body : [req.body];
        
        const validItems = [];
        for (const item of body) {
            // Auto-generate row hash
            const rowHash = createRowHash([
                item.tarih, 
                item.aciklama, 
                item.belgeNo, 
                item.borc, 
                item.alacak, 
                item.bakiye,
                item.sirket
            ]);

            const itemWithHash = { ...item, rowHash };
            
            const parsed = insertSigortaMuhasebeSchema.safeParse(itemWithHash);
            if (parsed.success) {
                validItems.push(parsed.data);
            } else {
                console.warn("Invalid muhasebe item:", item, parsed.error);
            }
        }

        if (validItems.length === 0 && body.length > 0) {
            return res.status(400).json({ error: "Hiçbir kayıt geçerli formatta değil." });
        }

        const inserted = await storage.insertSigortaMuhasebeKayitlari(validItems);
        res.json({ success: true, count: inserted.length });
    } catch (err) {
        console.error("Muhasebe kaydı eklenirken hata:", err);
        res.status(500).json({ error: "Kayıt eklenirken hata oluştu: " + (err as Error).message });
    }
  });

  app.delete("/api/sigorta/muhasebe", async (req, res) => {
    try {
       const { sirket, ay, yil } = req.query;
       if (!sirket) return res.status(400).json({ error: "Şirket seçilmeli" });
       
       await storage.deleteSigortaMuhasebeKayitlari(
         sirket as string, 
         ay as string, 
         yil ? parseInt(yil as string) : undefined
       );
       res.json({ success: true });
    } catch (err) {
       console.error("Muhasebe kayıtları silinirken hata:", err);
       res.status(500).json({ error: "Kayıtlar silinirken hata oluştu" });
    }
  });

  app.put("/api/sigorta/muhasebe/:id/match", async (req, res) => {
      try {
          const { eslestiMi, eslesenPolicyId } = req.body;
          const updated = await storage.updateSigortaMuhasebeKaydi(req.params.id, {
              eslestiMi: eslestiMi ? 1 : 0,
              eslesenPolicyId: eslesenPolicyId || null
          });
          if (!updated) {
              return res.status(404).json({ error: "Bulunamadı" });
          }
          // Eşleştirilen poliçenin dekont durumunu da senkron et.
          // eslesenPolicyId verildiyse → EVET, eslestiMi=false ise → HAYIR'a düşür.
          if (eslesenPolicyId) {
              await storage.updateSigortaPoliceDekontDurumu(eslesenPolicyId, "EVET");
          }
          res.json(updated);
      } catch (err) {
          console.error("Eşleştirme güncellenirken hata:", err);
          res.status(500).json({ error: "Eşleştirme sırasında hata oluştu" });
      }
  });

  app.delete("/api/sigorta/muhasebe/:id", async (req, res) => {
    try {
        await storage.deleteSigortaMuhasebeKaydi(req.params.id);
        res.sendStatus(204);
    } catch (err) {
        console.error("Muhasebe kaydı silinirken hata:", err);
        res.status(500).json({ error: "Silme işlemi başarısız" });
    }
  });

  // NOT: Eski `DELETE /api/sigorta/muhasebe-clear/mapfre` endpoint'i kaldırıldı.
  // Aynı işi `DELETE /api/sigorta/muhasebe?sirket=Mapfre` zaten yapıyor.

  app.get("/api/sigorta/firmalar/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const { ay, sirket } = req.query;
      const result = await storage.getSigortaFirmaOzet(parseInt(yil), ay as string | undefined, sirket as string | undefined);
      res.json(result);
    } catch (err) {
      console.error("Firma özeti alınırken hata:", err);
      res.status(500).json({ error: "Firma özeti alınırken hata oluştu" });
    }
  });

  app.get("/api/sigorta/ozet/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const summary = await storage.getSigortaOzet(parseInt(yil));
      res.json(summary);
    } catch (err) {
      console.error("Sigorta özeti alınırken hata:", err);
      // Log detailed error
      if (err instanceof Error) {
        console.error("Stack:", err.stack);
      }
      res.status(500).json({ error: "Özet alınırken hata oluştu: " + (err as Error).message });
    }
  });

  // Çalışanlar Endpoints
  app.get("/api/calisanlar", async (req, res) => {
    try {
      const { ay, yil } = req.query;

      // If 'ay' is 'toplam', verify aggregation
      if (ay === 'toplam') {
        const allRecords = await storage.getCalisanlar(undefined, yil ? parseInt(yil as string) : undefined);

        // Aggregate by TC No
        const aggMap = new Map<string, any>();

        for (const rec of allRecords) {
          if (!rec.tcNo) continue;

          if (!aggMap.has(rec.tcNo)) {
            // Initialize with first record found (to keep static fields like name, sube, job title)
            // Reset numeric fields to 0
            aggMap.set(rec.tcNo, {
              ...rec,
              brutUcret: 0,
              netUcret: 0,
              sgkMatrahi: 0,
              gelirVergisiMatrahi: 0,
              kumulatifVergiMatrahi: 0, // Should this be summed or max? Usually Max of year. But let's sum for now? No, Cumulative is cumulative. Max is better.
              gelirVergisi: 0,
              damgaVergisi: 0,
              sigortaKesintisi: 0,
              issizlikSigortasiKesintisi: 0,
              isverenSgkPayi: 0,
              isverenIssizlikPayi: 0,
              toplamIsverenMaliyeti: 0,
              ay: "toplam"
            });
          }

          const agg = aggMap.get(rec.tcNo);

          // Sum Financials
          agg.brutUcret += Number(rec.brutUcret || 0);
          agg.netUcret += Number(rec.netUcret || 0);
          agg.sgkMatrahi += Number(rec.sgkMatrahi || 0);
          agg.gelirVergisi += Number(rec.gelirVergisi || 0);
          agg.damgaVergisi += Number(rec.damgaVergisi || 0);
          agg.sigortaKesintisi += Number(rec.sigortaKesintisi || 0);
          agg.issizlikSigortasiKesintisi += Number(rec.issizlikSigortasiKesintisi || 0);
          agg.isverenSgkPayi += Number(rec.isverenSgkPayi || 0);
          agg.isverenIssizlikPayi += Number(rec.isverenIssizlikPayi || 0);
          agg.toplamIsverenMaliyeti += Number(rec.toplamIsverenMaliyeti || 0);

          // Max for Cumulative Base
          agg.kumulatifVergiMatrahi = Math.max(agg.kumulatifVergiMatrahi, Number(rec.kumulatifVergiMatrahi || 0));

          // Update static fields to latest month (if sorted? allRecords might not be sorted)
          // Assuming logic requires latest status/branch
          // parsing month:
          const curMonth = parseInt(rec.ay);
          const aggMonth = parseInt(agg.lastMonth || "0");
          if (!isNaN(curMonth) && curMonth > aggMonth) {
            agg.sube = rec.sube;
            agg.statu = rec.statu;
            agg.lastMonth = rec.ay;
          }
        }

        return res.json(Array.from(aggMap.values()));
      }

      const veriler = await storage.getCalisanlar(ay as string, yil ? parseInt(yil as string) : undefined);
      res.json(veriler);
    } catch (err) {
      console.error("Çalışanlar listelenirken hata:", err);
      res.status(500).json({ error: "Çalışanlar listelenirken bir hata oluştu" });
    }
  });

  // Çalışanları ekle (POST)
  app.post("/api/calisanlar", async (req, res) => {
    try {
      const veriler = Array.isArray(req.body) ? req.body : [req.body];
      const eklenen = await storage.insertCalisanlar(veriler);
      res.json({ success: true, count: eklenen.length, data: eklenen });
    } catch (err) {
      console.error("Çalışan eklenirken hata:", err);
      res.status(500).json({ error: "Çalışan eklenirken bir hata oluştu" });
    }
  });

  app.patch("/api/calisanlar/:id", async (req, res) => {
    try {
      const updated = await storage.updateCalisan(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Çalışan güncellenirken hata:", err);
      res.status(500).json({ error: "Çalışan güncellenirken bir hata oluştu" });
    }
  });

  app.delete("/api/calisanlar/:ay/:yil", async (req, res) => {
    try {
      const { ay, yil } = req.params;
      await storage.deleteCalisanlar(ay, parseInt(yil));
      res.json({ success: true, message: "Veriler silindi" });
    } catch (err) {
      console.error("Çalışan siliinirken hata:", err);
      res.status(500).json({ error: "Veriler silinemedi" });
    }
  });


  
  // ============================================================================
  // MAAŞ PLANLAMA API'LERİ
  // ============================================================================
  
  app.get("/api/salary-plans/:year", async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const plans = await storage.getSalaryPlans(year);
      res.json(plans);
    } catch (err) {
      console.error("Maaş planları alınırken hata:", err);
      res.status(500).json({ error: "Veriler alınamadı" });
    }
  });

  app.post("/api/salary-plans", async (req, res) => {
    try {
      // Body: { year: 2026, data: [{ tcNo: "123", netSalary: 50000, ... }] }
      const { year, data } = req.body;
      
      if (!year || !data || !Array.isArray(data)) {
        return res.status(400).json({ error: "Geçersiz format" });
      }

      const validItems = [];
      const _year = parseInt(year);

      for (let index = 0; index < data.length; index++) {
        const item = data[index];
         // Decimal fields should be strings for precision in Drizzle/Zod usually,
         // but let's handle both. toFixed(2) ensures string format "123.45"
         
         const planItem = {
            ...item,
            year: _year,
            netSalary: item.netSalary ? Number(item.netSalary).toFixed(2) : "0.00",
            // branch: item.sube ?? item.branch 
         };
         
         // Basic validation
         const parsed = insertSalaryPlanSchema.safeParse(planItem);
         if (parsed.success) {
            validItems.push(parsed.data);
         } else {
            console.warn(`Invalid salary plan item at index ${index}:`, parsed.error);
            // Collect errors to debug
            if (index < 3) console.log("Sample invalid item:", planItem); 
         }
      }

      if (validItems.length > 0) {
        console.log(`Saving ${validItems.length} salary plans for ${year}...`);
        const result = await storage.insertSalaryPlans(validItems);
        console.log(`Saved ${result.length} plans.`);
        res.json({ success: true, count: result.length });
      } else {
        console.warn("No valid salary plans found in payload.");
        res.json({ success: false, count: 0, message: "Kaydedilecek geçerli veri bulunamadı. Lütfen veri formatını kontrol edin." });
      }

    } catch (err) {
      console.error("Maaş planları kaydedilirken hata:", err);
      res.status(500).json({ error: "Kaydetme başarısız" });
    }
  });


  // Fix January 2025 employee costs (one-time fix endpoint)
  app.post("/api/calisanlar/fix-january-2025", async (req, res) => {
    try {
      // Get all January 2025 employees
      const employees = await storage.getCalisanlar("1", 2025);

      let fixed = 0;
      for (const emp of employees) {
        // Only fix if total cost is 0 but brut and sgk exist
        const totalMaliyet = Number(emp.toplamIsverenMaliyeti || 0);
        const brut = Number(emp.brutUcret || 0);
        const sgk = Number(emp.isverenSgkPayi || 0);

        if (totalMaliyet === 0 && (brut > 0 || sgk > 0)) {
          const correctTotal = brut + sgk;

          if (correctTotal > 0) {
            await storage.updateCalisan(emp.id, {
              toplamIsverenMaliyeti: correctTotal.toString()
            });
            fixed++;
          }
        }
      }

      res.json({ success: true, fixed, total: employees.length });
    } catch (err) {
      console.error("Fix January costs error:", err);
      res.status(500).json({ error: "Fix failed" });
    }
  });

  // ============================================================================
  // HESAPLAMA API'LERİ
  // ============================================================================

  // Hesaplama parametrelerini getir
  app.get("/api/calculations/parameters", async (_req, res) => {
    res.json({
      asgariUcret: {
        brut: PARAMETRELER_2025.BRUT_ASGARI_UCRET,
        net: PARAMETRELER_2025.NET_ASGARI_UCRET
      },
      sgkTavan: PARAMETRELER_2025.SGK_AYLIK_TAVAN,
      oranlar: {
        isciSgkNormal: PARAMETRELER_2025.ISCI_SGK_ORANI,
        isciSgkEmekli: PARAMETRELER_2025.ISCI_SGK_ORANI_EMEKLI,
        isciIssizlik: PARAMETRELER_2025.ISCI_ISSIZLIK_ORANI,
        isverenSgkNormal: PARAMETRELER_2025.ISVEREN_SGK_ORANI,
        isverenSgkTesvikli: PARAMETRELER_2025.ISVEREN_SGK_ORANI_TESVIKLI,
        isverenSgkEmekli: PARAMETRELER_2025.ISVEREN_SGK_ORANI_EMEKLI,
        isverenIssizlik: PARAMETRELER_2025.ISVEREN_ISSIZLIK_ORANI,
        damgaVergisi: PARAMETRELER_2025.DAMGA_VERGISI_ORANI,
        hazineTesviki: PARAMETRELER_2025.HAZINE_TESVIKI_ORANI
      },
      gelirVergisiDilimleri: PARAMETRELER_2025.GELIR_VERGISI_DILIMLERI
    });
  });

  // ============================================================================
  // BORDRO YÜKLE — ÜCRET PUSULASI (tek yükleme akışı)
  // "ÜCRET BORDROSU, PUANTAJ CETVELİ ve ÜCRET PUSULASI" PDF'i: her sayfa 1 kişi.
  // Tüm maaş değerleri belgeden okunur; sadece işveren SGK/işsizlik payı
  // sigorta matrahı × yasal oran − belgedeki teşvik tutarından türetilir.
  // ============================================================================

  // PDF'i yükle, parse et, önizleme döner. Henüz DB'ye yazmaz.
  app.post("/api/bordro/pusula/upload", uploadBordroMemory.single("pdf"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "PDF dosyası gönderilmedi." });
      if (!req.file.mimetype.includes("pdf")) {
        return res.status(400).json({ error: "Sadece PDF kabul edilir." });
      }

      const parsed = await parseUcretPusulasiPdf(req.file.buffer);

      // Şube bazlı özet
      const subeOzet: Record<string, {
        kisi: number; net: number; brut: number; isverenMaliyeti: number;
      }> = {};
      for (const s of parsed.satirlar) {
        const k = s.sube || "Bilinmiyor";
        if (!subeOzet[k]) subeOzet[k] = { kisi: 0, net: 0, brut: 0, isverenMaliyeti: 0 };
        subeOzet[k].kisi++;
        subeOzet[k].net += s.netUcret;
        subeOzet[k].brut += s.brutToplam;
        subeOzet[k].isverenMaliyeti += s.toplamIsverenMaliyeti;
      }

      res.json({
        ay: parsed.ay,
        ayKey: ayNumaraToKey(parsed.ay),
        yil: parsed.yil,
        toplamKisi: parsed.toplamKisi,
        toplamNet: parsed.toplamNet,
        toplamBrut: parsed.toplamBrut,
        toplamIsverenMaliyeti: parsed.toplamIsverenMaliyeti,
        subeOzet,
        atlananSayfalar: parsed.atlananSayfalar,
        onizleme: parsed.satirlar,
      });
    } catch (error) {
      console.error("Ücret Pusulası parse hatası:", error);
      res.status(400).json({ error: (error as Error).message || "PDF işlenirken hata oluştu." });
    }
  });

  // Onaylanmış önizleme verisini calisanlar tablosuna upsert eder; PDF'i arşive yazar.
  app.post("/api/bordro/pusula/save", uploadBordroMemory.single("pdf"), async (req, res) => {
    try {
      const payload = JSON.parse(req.body.payload || "{}");
      const { ay, yil, kayitlar } = payload as {
        ay: number; yil: number; kayitlar: any[];
      };

      if (!ay || !yil || !Array.isArray(kayitlar) || kayitlar.length === 0) {
        return res.status(400).json({ error: "Geçersiz payload." });
      }

      const ayKey = ayNumaraToKey(ay);

      const insertVerileri = kayitlar.map((k) => ({
        tcNo: String(k.tcNo),
        adSoyad: String(k.adSoyad),
        isGirisTarihi: k.isGirisTarihi || null,
        brutUcret: String(k.brutToplam ?? k.brutUcret ?? 0),
        netUcret: String(k.netUcret ?? 0),
        sgkMatrahi: String(k.sigortaMatrahi ?? 0),
        gelirVergisiMatrahi: String(k.vergiMatrahi ?? 0),
        kumulatifVergiMatrahi: String(k.devredenVergiMatrahi ?? 0),
        gelirVergisi: String(k.gelirVergisi ?? 0),
        damgaVergisi: String(k.damgaVergisi ?? 0),
        sigortaKesintisi: String(k.sgkIsciPrimi ?? 0),
        issizlikSigortasiKesintisi: String(k.issizlikIsciPrimi ?? 0),
        isverenSgkPayi: String(k.isverenSgkPayi ?? 0),
        isverenIssizlikPayi: String(k.isverenIssizlikPayi ?? 0),
        toplamIsverenMaliyeti: String(k.toplamIsverenMaliyeti ?? 0),
        sube: k.sube || null,
        statu: k.statu || "NORMAL",
        ay: String(ay),
        yil: yil,
      }));

      const sonuc = await storage.upsertCalisanlarToplu(insertVerileri);

      // PDF'i arşive yaz (varsa)
      let bordroDosyaId: string | null = null;
      if (req.file) {
        const fixedName = fixUploadFilename(req.file.originalname);
        const archiveDir = path.join(process.cwd(), "uploads", "bordro", String(yil), ayKey);
        if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
        // Filesystem güvenliği için sanitize (UTF-8 saklı, sadece path-tehlikeli karakterler kaldırılır)
        const safeForFs = fixedName.replace(/[\\/:*?"<>|]/g, "_");
        const filename = `pusula-${Date.now()}-${safeForFs}`;
        const filepath = path.join(archiveDir, filename);
        await fs.promises.writeFile(filepath, req.file.buffer);

        const md5 = createHash("md5").update(req.file.buffer).digest("hex");
        const dosya = await storage.insertBordroDosya({
          filename: fixedName,
          filepath,
          sizeBytes: req.file.size,
          md5Hash: md5,
          tip: "pusula",
          ay,
          yil,
          kayitSayisi: kayitlar.length,
        });
        bordroDosyaId = dosya.id;
      }

      res.json({
        success: true,
        inserted: sonuc.inserted,
        updated: sonuc.updated,
        toplam: sonuc.inserted + sonuc.updated,
        bordroDosyaId,
      });
    } catch (error) {
      console.error("Ücret Pusulası kaydetme hatası:", error);
      res.status(500).json({ error: (error as Error).message || "Kaydedilirken hata oluştu." });
    }
  });

  // ============================================================================
  // BORDRO ARŞİVİ (sadece dosya saklama, parse yok — denetim/yasal amaç)
  // ============================================================================

  app.post("/api/bordro/arsiv/upload", uploadBordroMemory.single("pdf"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "PDF dosyası gönderilmedi." });
      if (!req.file.mimetype.includes("pdf")) {
        return res.status(400).json({ error: "Sadece PDF kabul edilir." });
      }

      const ay = parseInt(req.body.ay, 10);
      const yil = parseInt(req.body.yil, 10);
      if (!Number.isFinite(ay) || ay < 1 || ay > 12) {
        return res.status(400).json({ error: "Geçersiz ay." });
      }
      if (!Number.isFinite(yil) || yil < 2020 || yil > 2100) {
        return res.status(400).json({ error: "Geçersiz yıl." });
      }

      const ayKey = ayNumaraToKey(ay);
      const archiveDir = path.join(process.cwd(), "uploads", "bordro", String(yil), ayKey);
      if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

      const fixedName = fixUploadFilename(req.file.originalname);
      const safeForFs = fixedName.replace(/[\\/:*?"<>|]/g, "_");
      const filename = `bordro-${Date.now()}-${safeForFs}`;
      const filepath = path.join(archiveDir, filename);
      await fs.promises.writeFile(filepath, req.file.buffer);

      const md5 = createHash("md5").update(req.file.buffer).digest("hex");
      const dosya = await storage.insertBordroDosya({
        filename: fixedName,
        filepath,
        sizeBytes: req.file.size,
        md5Hash: md5,
        tip: "bordro",
        ay,
        yil,
      });

      res.json({ success: true, dosya });
    } catch (error) {
      console.error("Bordro arşiv hatası:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/api/bordro/arsiv", async (req, res) => {
    try {
      const yil = req.query.yil ? parseInt(String(req.query.yil), 10) : undefined;
      const tip = req.query.tip ? String(req.query.tip) : undefined;
      const list = await storage.getBordroDosyalar(yil, tip);
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/api/bordro/arsiv/:id/download", async (req, res) => {
    try {
      const dosya = await storage.getBordroDosya(req.params.id);
      if (!dosya) return res.status(404).json({ error: "Dosya bulunamadı." });
      if (!fs.existsSync(dosya.filepath)) {
        return res.status(404).json({ error: "Dosya filesystem'de yok." });
      }
      // RFC 5987: Türkçe karakterli filename'i doğru göndermek için
      // hem ASCII fallback (filename=) hem UTF-8 (filename*=) ver.
      const asciiFallback = dosya.filename.replace(/[^\x20-\x7E]/g, "_");
      const utf8Encoded = encodeURIComponent(dosya.filename);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`,
      );
      res.setHeader("Content-Type", "application/pdf");
      res.sendFile(path.resolve(dosya.filepath));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete("/api/bordro/arsiv/:id", async (req, res) => {
    try {
      const result = await storage.deleteBordroDosya(req.params.id);
      if (!result) return res.status(404).json({ error: "Bulunamadı" });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================================================
  // İZİN TAKİP SİSTEMİ
  // ============================================================================

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

  // GET /api/izinler/bakiye?refTarih= — tüm aktif çalışanlar için bakiye
  app.get("/api/izinler/bakiye", async (req, res) => {
    try {
      const refTarih = (req.query.refTarih as string) || new Date().toISOString().slice(0, 10);
      // Aktif çalışan: son ay bordrosundaki tcNo'lar.
      // DB-side LIMIT 1 + WHERE ile sadece son ay'ın satırları transfer edilir.
      const aktifler = (await storage.getAktifCalisanlarSonAy())
        .filter((c) => c.tcNo && c.tcNo.trim().length > 0);

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
        const netUcret = Number(c.netUcret || 0);
        return {
          ...b,
          adSoyad: c.adSoyad,
          sube: c.sube,
          netUcret,
          gunlukNet: netUcret / 30,
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
      const updateData: Partial<InsertCalisanIzin> = {};
      if (tcNo !== undefined) updateData.tcNo = tcNo;
      if (tur !== undefined) updateData.tur = tur;
      if (aciklama !== undefined) updateData.aciklama = aciklama;
      if (parayaCevrildi !== undefined) updateData.parayaCevrildi = !!parayaCevrildi;
      if (parayaCevrilenTutar !== undefined) {
        updateData.parayaCevrilenTutar = parayaCevrilenTutar != null ? String(parayaCevrilenTutar) : null;
      }

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
      const overrideDuplicate = req.body.overrideDuplicate === "true";
      const sonuc = await processMizanBuffer(req.file.buffer, filename, {
        mizanTarihi: (req.body.mizanTarihi as string) || null,
        not: (req.body.not as string) || null,
        overrideDuplicate,
      });
      res.json({ success: true, ...sonuc });
    } catch (e: any) {
      if (e instanceof MizanMukerrerHata) {
        return res.status(409).json({ error: e.message, duplicateId: e.duplicateId });
      }
      if (e instanceof MizanBosHata) {
        return res.status(400).json({ error: e.message });
      }
      console.error("Mizan save hatası:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // 2b. Otomatik alım (Power Automate) — token korumalı, ham binary gövde
  app.post(
    "/api/ingest/:tip",
    requireIngestToken,
    express.raw({ type: "application/octet-stream", limit: "25mb" }),
    async (req, res) => {
      const tip = req.params.tip;
      const headerDosyaAdi = req.header("x-dosya-adi");
      const dosyaAdi = (headerDosyaAdi ? fixUploadFilename(headerDosyaAdi) : (req.query.dosya as string) || `ingest-${Date.now()}.xlsx`).toString();
      const buffer = req.body as Buffer;

      if (tip !== "mizan" && tip !== "beyanname" && tip !== "beyanname-ex") {
        await storage.insertOtomatikYuklemeLog({ tip: req.params.tip, dosyaAdi, durum: "hata", kayitSayisi: 0, mesaj: "Geçersiz tip (mizan | beyanname | beyanname-ex)", zaman: zamanDamgasi() });
        return res.status(400).json({ error: "Geçersiz tip (mizan | beyanname | beyanname-ex)" });
      }
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        await storage.insertOtomatikYuklemeLog({ tip, dosyaAdi, durum: "hata", kayitSayisi: 0, mesaj: "Boş gövde — dosya gönderilmedi", zaman: zamanDamgasi() });
        return res.status(400).json({ error: "Boş gövde — dosya gönderilmedi" });
      }

      try {
        if (tip === "mizan") {
          try {
            const sonuc = await processMizanBuffer(buffer, dosyaAdi, { overrideDuplicate: false });
            const mesaj = `${sonuc.kayitSayisi} kayıt, ${sonuc.eklenenMusteri} yeni müşteri`;
            await storage.insertOtomatikYuklemeLog({ tip, dosyaAdi, durum: "basarili", kayitSayisi: sonuc.kayitSayisi, mesaj, zaman: zamanDamgasi() });
            return res.json({ durum: "basarili", tip, kayitSayisi: sonuc.kayitSayisi, mesaj });
          } catch (e: any) {
            if (e instanceof MizanMukerrerHata) {
              await storage.insertOtomatikYuklemeLog({ tip, dosyaAdi, durum: "atlandi", kayitSayisi: 0, mesaj: "Aynı dosya daha önce yüklendi", zaman: zamanDamgasi() });
              return res.json({ durum: "atlandi", mesaj: "Aynı dosya daha önce yüklendi" });
            }
            throw e;
          }
        } else if (tip === "beyanname-ex") {
          const { rows, uyarilar } = parseIhracatWorkbook(buffer);
          if (!rows.length) throw new Error("Excel'de veri satırı bulunamadı");
          const sonuc = await storage.upsertBeyannameler(rows);
          const mesaj = `${rows.length} satır (${sonuc.eklenen} yeni, ${sonuc.guncellenen} güncellendi)`
            + (uyarilar.length ? ` — UYARI: ${uyarilar.join("; ")}` : "");
          await storage.insertOtomatikYuklemeLog({ tip, dosyaAdi, durum: "basarili", kayitSayisi: rows.length, mesaj, zaman: zamanDamgasi() });
          return res.json({ durum: "basarili", tip, kayitSayisi: rows.length, mesaj });
        } else {
          // Bu uc YALNIZ ithalat raporunu alir; ihracat /api/ingest/beyanname-ex'e gider.
          const { rows, uyarilar } = parseBeyannameWorkbook(buffer);
          if (!rows.length) throw new Error("Excel'de veri satırı bulunamadı");
          const sonuc = await storage.upsertBeyannameler(rows);
          const mesaj = `${rows.length} satır (${sonuc.eklenen} yeni, ${sonuc.guncellenen} güncellendi)`
            + (uyarilar.length ? ` — UYARI: ${uyarilar.join("; ")}` : "");
          await storage.insertOtomatikYuklemeLog({ tip, dosyaAdi, durum: "basarili", kayitSayisi: rows.length, mesaj, zaman: zamanDamgasi() });
          return res.json({ durum: "basarili", tip, kayitSayisi: rows.length, mesaj });
        }
      } catch (e: any) {
        await storage.insertOtomatikYuklemeLog({ tip, dosyaAdi, durum: "hata", kayitSayisi: 0, mesaj: (e.message || "Bilinmeyen hata").slice(0, 500), zaman: zamanDamgasi() });
        return res.status(400).json({ durum: "hata", error: e.message || "İşlenemedi" });
      }
    },
  );

  // 2c. Otomatik yükleme log — görünürlük
  app.get("/api/otomatik-yukleme/log", async (req, res) => {
    try {
      const tip = (req.query.tip as string) || null;
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 50));
      const loglar = await storage.getOtomatikYuklemeLoglar(tip, limit);
      res.json(loglar);
    } catch (e: any) {
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

      // Önceki mizan (yalnız AYNI YIL — mizan yıl başında sıfırlanır, DEVİR=0)
      const tumMizanlar = await storage.getMizanYuklemeleri(); // mizanTarihi desc
      const oncekiMizan = tumMizanlar.find((x) =>
        x.mizanTarihi < mizan.mizanTarihi &&
        x.mizanTarihi.slice(0, 4) === mizan.mizanTarihi.slice(0, 4)
      ) ?? null;
      const oncekiBakiyeMap = new Map<string, (typeof bakiyeler)[number]>();
      if (oncekiMizan) {
        for (const ob of await storage.getEnSonBakiyelerByMizan(oncekiMizan.id)) {
          oncekiBakiyeMap.set(ob.musteriId, ob);
        }
      }

      // Tüm müşterileri tek seferde çek (N+1 önleme) — önceki mizanın
      // müşterileri de dahil (döviz ayrımı için hesap kodu lazım)
      const musteriIdler = Array.from(new Set([
        ...bakiyeler.map((b) => b.musteriId),
        ...Array.from(oncekiBakiyeMap.keys()),
      ]));
      const musteriList = musteriIdler.length > 0
        ? await db.select().from(musteriler).where(inArray(musteriler.id, musteriIdler))
        : [];
      const musteriMap = new Map(musteriList.map((m) => [m.id, m]));

      // Hesap kodu 120-01-* = TL, 120-02-* = USD hesabı
      const dovizOf = (musteriId: string): "TL" | "USD" =>
        (musteriMap.get(musteriId)?.hesapKodu || "").startsWith("120-02") ? "USD" : "TL";

      // Gümrük fatura toplamlarını DB-side aggregate ile çek (transfer optimize).
      // Eskiden: getAllGumrukVerileri() ile binlerce satır + JS aggregate.
      // Şimdi: SQL GROUP BY + SUM, firma sayısı kadar satır (binlerce → onlarca).
      const faturaMap = await storage.getGumrukFirmaFaturaAggregate(
        refTarih,
        ayarlar.faturaPenceresi,
      );
      const mizanAyNo = Math.max(1, parseInt(refTarih.slice(5, 7), 10) || 1);
      const segmentEsikleri = {
        odemeOraniEsik: ayarlar.odemeOraniEsik,
        eskiOdemeEsik: ayarlar.eskiOdemeEsik,
      };

      // Her bakiye için risk hesapla
      const detaylar = bakiyeler.map((b) => {
        const m = musteriMap.get(b.musteriId);
        if (!m) return null;
        const sonBakiyeNum = Number(b.sonBakiye || 0);
        const nb = netBakiye({ sonBakiye: sonBakiyeNum, sonBakiyeBA: b.sonBakiyeBA || "B" });
        const gec = gecikme(b.sonAlacakTarihi, refTarih);
        const borcGec = gecikme(b.sonBorcTarihi, refTarih); // son faturanın yaşı
        const isAcik = isAktivitesiAcigi(b.sonBorcTarihi, b.sonAlacakTarihi);
        // Müşterinin tüm gümrük unvanlarının toplamı
        let son90 = 0, yillik = 0, ytdCiro = 0, ytdIslemSayisi = 0;
        for (const u of (m.gumrukFirmaUnvanlari || [])) {
          const f = faturaMap.get(u);
          if (f) { son90 += f.son90; yillik += f.yillik; ytdCiro += f.ytdCiro; ytdIslemSayisi += f.ytdIslemSayisi; }
        }
        const bfa = bakiyeFaturaAcigi(nb, son90);
        const risk = riskProfili({
          netBakiye: nb,
          gecikme: gec,
          borcGecikme: borcGec,
          bakiyeFaturaAcikYuzde: bfa.acikYuzde,
          yillikFaturaToplami: yillik,
          esikler,
        });
        // Aksiyon Merkezi sinyalleri
        const borcNum = Number(b.borc || 0);
        const alacakNum = Number(b.alacak || 0);
        const oran = odemeOrani(borcNum, alacakNum);
        const eslesmemis = (m.gumrukFirmaUnvanlari || []).length === 0;
        const islemAyOrt = eslesmemis ? null : ytdIslemSayisi / mizanAyNo;
        // Eşleşmemiş firmada hacim göstergesi mizan BORÇ toplamıdır
        const kazandiriyor = (eslesmemis ? borcNum : ytdCiro) >= Number(ayarlar.ciroEsik);
        const onceki = oncekiBakiyeMap.get(b.musteriId);
        const deltaNetBakiye = onceki
          ? nb - netBakiye({ sonBakiye: Number(onceki.sonBakiye || 0), sonBakiyeBA: onceki.sonBakiyeBA || "B" })
          : null;
        const donemOdeme = onceki ? alacakNum - Number(onceki.alacak || 0) : null;
        const donemFatura = onceki ? borcNum - Number(onceki.borc || 0) : null;
        const segment = firmaSegmenti({ netBakiye: nb, odemeOrani: oran, gecikme: gec, kazandiriyor, esikler: segmentEsikleri });
        const hicOdemeYok = borcNum > 0 && alacakNum === 0;
        const neden = nedenCumlesi({
          gecikme: gec,
          odemeOrani: oran,
          hicOdemeYok,
          ytdIslemSayisi: eslesmemis ? null : ytdIslemSayisi,
          islemAyOrt,
          deltaNetBakiye,
          eslesmemis,
          esikler: segmentEsikleri,
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
          doviz: dovizOf(b.musteriId),
          odemeOrani: oran,
          ytdCiro,
          ytdIslemSayisi: eslesmemis ? null : ytdIslemSayisi,
          islemAyOrt,
          eslesmemis,
          kazandiriyor,
          segment,
          neden,
          deltaNetBakiye,
          donemOdeme,
          donemFatura,
          ...risk,
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null);

      // Özet metrikler — TL ve USD hesaplar AYRI toplanır (para birimi karıştırılmaz)
      const oncekiToplamTL = oncekiMizan
        ? Array.from(oncekiBakiyeMap.entries())
            .filter(([mid]) => dovizOf(mid) === "TL")
            .map(([, ob]) => netBakiye({ sonBakiye: Number(ob.sonBakiye || 0), sonBakiyeBA: ob.sonBakiyeBA || "B" }))
            .filter((v) => v > 0)
            .reduce((a, v) => a + v, 0)
        : null;
      const pozToplam = (dv: "TL" | "USD") =>
        detaylar.filter((d) => d.doviz === dv && d.netBakiye > 0).reduce((a, d) => a + d.netBakiye, 0);
      const segToplam = (s: string, dv: "TL" | "USD") =>
        detaylar.filter((d) => d.segment === s && d.doviz === dv).reduce((a, d) => a + Math.max(0, d.netBakiye), 0);
      const toplamNetAlacakSimdi = pozToplam("TL");
      const SEGMENTLER = ["SAGLIKLI", "BUYUK_RISK", "KUCUK_NOTR", "NAKIT_TUZAGI"] as const;
      const ozet = {
        toplamNetAlacak: toplamNetAlacakSimdi,
        toplamNetAlacakUsd: pozToplam("USD"),
        nakitTuzagiSayisi: detaylar.filter((d) => d.segment === "NAKIT_TUZAGI").length,
        nakitTuzagiToplam: segToplam("NAKIT_TUZAGI", "TL"),
        nakitTuzagiToplamUsd: segToplam("NAKIT_TUZAGI", "USD"),
        buyukRiskSayisi: detaylar.filter((d) => d.segment === "BUYUK_RISK").length,
        buyukRiskToplam: segToplam("BUYUK_RISK", "TL"),
        buyukRiskToplamUsd: segToplam("BUYUK_RISK", "USD"),
        oncekiMizanTarihi: oncekiMizan?.mizanTarihi ?? null,
        toplamNetAlacakDelta: oncekiToplamTL === null ? null : toplamNetAlacakSimdi - oncekiToplamTL,
        segmentDagilim: SEGMENTLER.map((s) => ({
          segment: s,
          sayi: detaylar.filter((d) => d.segment === s).length,
          toplam: segToplam(s, "TL"),
          toplamUsd: segToplam(s, "USD"),
        })),
        // Dönmeyen nakit yaşlandırması — son ödeme tarihine göre (gecikme 9999 → 90+)
        yasDagilimi: [
          { aralik: "0-30", min: 0, max: 30 },
          { aralik: "31-60", min: 31, max: 60 },
          { aralik: "61-90", min: 61, max: 90 },
          { aralik: "90+", min: 91, max: 999999 },
        ].map((k) => {
          const grup = detaylar.filter((d) => d.netBakiye > 0 && d.gecikme >= k.min && d.gecikme <= k.max);
          return {
            aralik: k.aralik,
            tl: grup.filter((d) => d.doviz === "TL").reduce((a, d) => a + d.netBakiye, 0),
            usd: grup.filter((d) => d.doviz === "USD").reduce((a, d) => a + d.netBakiye, 0),
            sayi: grup.length,
          };
        }),
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

      // Haftalık Değişim Raporu — önceki aynı-yıl mizana göre dönem özeti
      let rapor: any = null;
      if (oncekiMizan) {
        const kotuluk: Record<string, number> = { SAGLIKLI: 0, KUCUK_NOTR: 1, BUYUK_RISK: 2, NAKIT_TUZAGI: 3 };
        const gecisler = detaylar
          .map((d) => {
            const onceki = oncekiBakiyeMap.get(d.musteriId);
            if (!onceki) return null;
            const oncekiNet = netBakiye({ sonBakiye: Number(onceki.sonBakiye || 0), sonBakiyeBA: onceki.sonBakiyeBA || "B" });
            const oncekiOran = odemeOrani(Number(onceki.borc || 0), Number(onceki.alacak || 0));
            const oncekiGec = gecikme(onceki.sonAlacakTarihi, oncekiMizan.mizanTarihi);
            // Değer ekseni haftalık pencerede sabit kabul edilir (şimdiki kazandiriyor)
            const eski = firmaSegmenti({ netBakiye: oncekiNet, odemeOrani: oncekiOran, gecikme: oncekiGec, kazandiriyor: d.kazandiriyor, esikler: segmentEsikleri });
            if (eski === d.segment) return null;
            return {
              musteriId: d.musteriId, ad: d.ad, doviz: d.doviz, netBakiye: d.netBakiye,
              eski, yeni: d.segment,
              yon: kotuluk[d.segment] > kotuluk[eski] ? "bozuldu" : "duzeldi",
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        const donemli = detaylar.filter((d) => d.donemOdeme !== null);
        const topla = (dv: "TL" | "USD", alan: "donemOdeme" | "donemFatura") =>
          donemli.filter((d) => d.doviz === dv).reduce((a, d) => a + Math.max(0, (d as any)[alan] || 0), 0);
        const hicOdemeyenList = donemli
          .filter((d) => d.netBakiye > 0 && (d.donemOdeme || 0) <= 0)
          .sort((a, b) => b.netBakiye - a.netBakiye);
        const kisi = (d: any) => ({ musteriId: d.musteriId, ad: d.ad, doviz: d.doviz, netBakiye: d.netBakiye });
        rapor = {
          oncekiMizanTarihi: oncekiMizan.mizanTarihi,
          gunSayisi: gecikme(oncekiMizan.mizanTarihi, refTarih),
          toplamTahsilatTL: topla("TL", "donemOdeme"),
          toplamTahsilatUsd: topla("USD", "donemOdeme"),
          toplamYeniFaturaTL: topla("TL", "donemFatura"),
          toplamYeniFaturaUsd: topla("USD", "donemFatura"),
          netDegisimTL: ozet.toplamNetAlacakDelta,
          enCokOdeyen: donemli.filter((d) => (d.donemOdeme || 0) > 0)
            .sort((a, b) => (b.donemOdeme || 0) - (a.donemOdeme || 0)).slice(0, 5)
            .map((d) => ({ ...kisi(d), tutar: d.donemOdeme })),
          borcuBuyuyen: donemli.filter((d) => (d.deltaNetBakiye || 0) > 0)
            .sort((a, b) => (b.deltaNetBakiye || 0) - (a.deltaNetBakiye || 0)).slice(0, 5)
            .map((d) => ({ ...kisi(d), tutar: d.deltaNetBakiye })),
          hicOdemeyen: {
            sayi: hicOdemeyenList.length,
            toplamTL: hicOdemeyenList.filter((d) => d.doviz === "TL").reduce((a, d) => a + d.netBakiye, 0),
            ilk10: hicOdemeyenList.slice(0, 10).map((d) => ({ ...kisi(d), gecikme: d.gecikme })),
          },
          bozulanlar: gecisler.filter((g) => g.yon === "bozuldu"),
          duzelenler: gecisler.filter((g) => g.yon === "duzeldi"),
        };
      }

      res.json({ mizan, ozet, rapor, musteriler: detaylar });
    } catch (e: any) {
      console.error("Dashboard hatası:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // 10b. Derin analiz — ödeme ritmi bozulma alarmları (haftalık mizan serisi)
  app.get("/api/tahsilat/analiz", async (req, res) => {
    try {
      const mizanIdParam = req.query.mizanId as string | undefined;
      const tumMizanlar = await storage.getMizanYuklemeleri();
      const mizan = mizanIdParam ? await storage.getMizanYukleme(mizanIdParam) : tumMizanlar[0];
      if (!mizan) return res.json({ mizanTarihi: null, mizanSayisiYil: 0, alarmlar: [] });
      const yil = mizan.mizanTarihi.slice(0, 4);
      const seri = await storage.getMizanBakiyeSerisiByYil(yil);

      // Firma başına farklı ödeme tarihleri (seçili mizan tarihine kadar)
      const odemeTarihleri = new Map<string, Set<string>>();
      for (const r of seri) {
        if (r.mizanTarihi > mizan.mizanTarihi || !r.sonAlacakTarihi) continue;
        if (!odemeTarihleri.has(r.musteriId)) odemeTarihleri.set(r.musteriId, new Set());
        odemeTarihleri.get(r.musteriId)!.add(r.sonAlacakTarihi);
      }

      const guncel = seri.filter((r) => r.mizanId === mizan.id);
      const analizMusteriIdler = guncel.map((r) => r.musteriId);
      const analizMusteriList = analizMusteriIdler.length > 0
        ? await db.select().from(musteriler).where(inArray(musteriler.id, analizMusteriIdler))
        : [];
      const analizMusteriMap = new Map(analizMusteriList.map((m) => [m.id, m]));

      const alarmlar = guncel.map((r) => {
        const m = analizMusteriMap.get(r.musteriId);
        if (!m) return null;
        const nb = netBakiye({ sonBakiye: Number(r.sonBakiye || 0), sonBakiyeBA: r.sonBakiyeBA || "B" });
        if (nb <= 0) return null;
        const tarihler = Array.from(odemeTarihleri.get(r.musteriId) || []);
        const ritim = odemeRitmi(tarihler, mizan.mizanTarihi);
        if (!ritim.alarm) return null;
        return {
          musteriId: m.id,
          ad: m.ad,
          hesapKodu: m.hesapKodu,
          doviz: (m.hesapKodu || "").startsWith("120-02") ? "USD" : "TL",
          netBakiye: nb,
          ortalamaAralik: Math.round(ritim.ortalamaAralik!),
          sonOdemeGun: ritim.sonOdemeGun,
          odemeSayisi: tarihler.length,
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.netBakiye - a.netBakiye);

      res.json({
        mizanTarihi: mizan.mizanTarihi,
        mizanSayisiYil: new Set(seri.map((r) => r.mizanId)).size,
        alarmlar,
      });
    } catch (e: any) {
      console.error("Analiz hatası:", e);
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

  // Tüm bekleyen önerileri sil + algoritmayı yeniden çalıştır
  // (Algoritma değişikliği sonrası mevcut önerileri tazelemek için)
  app.post("/api/tahsilat/eslestirme/reset", async (_req, res) => {
    try {
      // Tüm bekleyen önerileri sil (reddedildi=false olanlar)
      const silinen = await db.delete(mizanEslestirmeOnerileri).returning({ id: mizanEslestirmeOnerileri.id });

      // Hiç gümrük unvanı eşleşmesi olmayan müşteriler için yeniden öner
      const tumMusteriler = await db.select().from(musteriler);
      const eslesmesizMusteriler = tumMusteriler.filter(
        (m) => !m.gumrukFirmaUnvanlari || m.gumrukFirmaUnvanlari.length === 0,
      );

      // Gümrük unvanlarını çek (DB-side DISTINCT, transfer optimize).
      const gumrukUnvanlar = await storage.getDistinctGumrukUnvanlar();

      let yeniOneri = 0;
      let yeniOtomatik = 0;
      for (const m of eslesmesizMusteriler) {
        let gumrukEslesen: string | null = null;
        let gumrukEslesenSkor: number = 0;
        const oneriler: { unvan: string; skor: number }[] = [];
        for (const u of gumrukUnvanlar) {
          const s = benzerlikSkoru(m.ad, u);
          if (s >= ESLESME_AUTO_ESIK && !gumrukEslesen) {
            gumrukEslesen = u;
            gumrukEslesenSkor = s;
          } else if (s >= ESLESME_ONERI_ESIK && s < ESLESME_AUTO_ESIK) {
            oneriler.push({ unvan: u, skor: s });
          }
        }
        if (gumrukEslesen) {
          await storage.addGumrukUnvan(m.id, gumrukEslesen);
          await storage.insertEslestirmeLog({
            musteriId: m.id,
            gumrukUnvan: gumrukEslesen,
            eklemeTipi: "auto-fuzzy",
            benzerlikSkoru: gumrukEslesenSkor.toFixed(3),
          });
          yeniOtomatik++;
        }
        // En yüksek 5 öneri
        oneriler.sort((a, b) => b.skor - a.skor);
        for (const o of oneriler.slice(0, 5)) {
          await storage.insertEslestirmeOneri({
            musteriId: m.id,
            gumrukUnvan: o.unvan,
            benzerlikSkoru: o.skor.toFixed(3),
          });
          yeniOneri++;
        }
      }

      res.json({
        silinenEskiOneri: silinen.length,
        kontroliMusteri: eslesmesizMusteriler.length,
        yeniOtomatikEslesen: yeniOtomatik,
        yeniOneri,
      });
    } catch (e: any) {
      console.error("Eşleştirme reset hatası:", e);
      res.status(500).json({ error: e.message });
    }
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

  // Yüklü ayları getir (spesifik route - önce tanımlanmalı)
  app.get("/api/gumruk/aylar", async (req, res) => {
    try {
      const aylar = await storage.getGumrukAylari();
      res.json(aylar);
    } catch (error) {
      console.error("Aylar getirme hatası:", error);
      res.status(500).json({ error: "Aylar alınamadı" });
    }
  });

  // Aylık özet getir - grafik için (spesifik route - önce tanımlanmalı)
  app.get("/api/gumruk/ozet/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const ozet = await storage.getAylikOzet(parseInt(yil));
      res.json(ozet);
    } catch (error) {
      console.error("Özet getirme hatası:", error);
      res.status(500).json({ error: "Özet alınamadı" });
    }
  });

  // Dashboard Aggregated Summary Endpoint
  app.get("/api/dashboard/summary/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const summary = await storage.getOzetSummary(parseInt(yil));
      res.json(summary);
    } catch (error) {
      console.error("Dashboard summary error:", error);
      res.status(500).json({ error: "Dashboard verileri alınamadı" });
    }
  });

  // Dashboard: en çok fatura kesilen firmalar (tutar bazlı top-N)
  app.get("/api/dashboard/gumruk-top-firmalar/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const firmalar = await storage.getGumrukTopFirmalar(parseInt(yil), limit);
      res.json(firmalar);
    } catch (error) {
      console.error("Gümrük top firmalar hatası:", error);
      res.status(500).json({ error: "Firma sıralaması alınamadı" });
    }
  });

  // Firma listesi getir (spesifik route - önce tanımlanmalı)
  app.get("/api/gumruk/firmalar/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const firmalar = await storage.getFirmalar(parseInt(yil));
      res.json(firmalar);
    } catch (error) {
      console.error("Firma listesi getirme hatası:", error);
      res.status(500).json({ error: "Firmalar alınamadı" });
    }
  });

  // Tüm benzersiz firmaları getir
  app.get("/api/gumruk/tum-firmalar", async (_req, res) => {
    try {
      const firmalar = await storage.getAllUniqueFirmalar();
      res.json(firmalar);
    } catch (error) {
      console.error("Tüm firmalar listesi getirme hatası:", error);
      res.status(500).json({ error: "Firmalar alınamadı" });
    }
  });

  // Firma bazlı aylık özet getir (spesifik route - önce tanımlanmalı)
  app.get("/api/gumruk/firma-ozet/:yil/:firma", async (req, res) => {
    try {
      const { yil, firma } = req.params;
      const ozet = await storage.getFirmaAylikOzet(parseInt(yil), decodeURIComponent(firma));
      res.json(ozet);
    } catch (error) {
      console.error("Firma özet getirme hatası:", error);
      res.status(500).json({ error: "Firma özeti alınamadı" });
    }
  });

  // Giriş elemanları listesi getir (spesifik route - önce tanımlanmalı)
  app.get("/api/gumruk/giris-elemanlari/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const elemanlar = await storage.getGirisElemanlari(parseInt(yil));
      res.json(elemanlar);
    } catch (error) {
      console.error("Giriş elemanları getirme hatası:", error);
      res.status(500).json({ error: "Giriş elemanları alınamadı" });
    }
  });

  // Giriş elemanı bazlı özet getir (spesifik route - önce tanımlanmalı)
  app.get("/api/gumruk/eleman-ozet/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const ozet = await storage.getGirisElemaniOzet(parseInt(yil));
      res.json(ozet);
    } catch (error) {
      console.error("Eleman özet getirme hatası:", error);
      res.status(500).json({ error: "Eleman özeti alınamadı" });
    }
  });

  // Gümrük müdürlükleri listesi getir
  app.get("/api/gumruk/gumrukler-listesi/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const gumrukler = await storage.getGumrukler(parseInt(yil));
      res.json(gumrukler);
    } catch (error) {
      console.error("Gümrük listesi getirme hatası:", error);
      res.status(500).json({ error: "Gümrükler alınamadı" });
    }
  });

  // Fatura kesenler listesi getir
  app.get("/api/gumruk/fatura-kesenler/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const kesenler = await storage.getFaturaKesenler(parseInt(yil));
      res.json(kesenler);
    } catch (error) {
      console.error("Fatura kesenler listesi getirme hatası:", error);
      res.status(500).json({ error: "Fatura kesenler alınamadı" });
    }
  });

  // Gelişmiş grafik verilerini getir (spesifik route - önce tanımlanmalı)
  app.get("/api/gumruk/advanced-chart/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const { groupBy = "month", names } = req.query;

      let namesArray: string[] | undefined;
      if (names) {
        namesArray = (names as string).split(',');
      }

      const veriler = await storage.getAdvancedChartData(parseInt(yil), groupBy as string, namesArray);
      res.json(veriler);
    } catch (error) {
      console.error("Gelişmiş grafik verileri getirme hatası:", error);
      res.status(500).json({ error: "Veriler alınamadı" });
    }
  });



  // Tip listesini getir
  app.get("/api/gumruk/tips/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const tips = await storage.getTips(parseInt(yil));
      res.json(tips);
    } catch (error) {
      console.error("Tip listesi getirme hatası:", error);
      res.status(500).json({ error: "Tipler alınamadı" });
    }
  });

  // Trend grafik verilerini getir (ay bazlı kırılım)
  app.get("/api/gumruk/advanced-chart-trend/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const { groupBy = "month", names } = req.query;

      let namesArray: string[] | undefined;
      if (names) {
        namesArray = (names as string).split(',');
      }

      const veriler = await storage.getAdvancedChartTrend(parseInt(yil), groupBy as string, namesArray);
      res.json(veriler);
    } catch (error) {
      console.error("Trend grafik verileri getirme hatası:", error);
      res.status(500).json({ error: "Trend verileri alınamadı" });
    }
  });

  // Gümrük müdürlüğü bazlı özet getir (spesifik route - önce tanımlanmalı)
  app.get("/api/gumruk/gumruk-ozet/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const ozet = await storage.getGumrukOzet(parseInt(yil));
      res.json(ozet);
    } catch (error) {
      console.error("Gümrük özet getirme hatası:", error);
      res.status(500).json({ error: "Gümrük özeti alınamadı" });
    }
  });

  // Özet summary - combined sales, expenses, and employee data by month (spesifik route - önce tanımlanmalı)
  app.get("/api/gumruk/ozet-summary/:yil", async (req, res) => {
    try {
      const { yil } = req.params;
      const ozet = await storage.getOzetSummary(parseInt(yil));
      res.json(ozet);
    } catch (error) {
      console.error("Özet summary getirme hatası:", error);
      res.status(500).json({ error: "Özet summary alınamadı" });
    }
  });

  // Gümrük verilerini getir (parametrik route - en son tanımlanmalı)
  app.get("/api/gumruk/:ay/:yil", async (req, res) => {
    try {
      const { ay, yil } = req.params;
      const veriler = await storage.getGumrukVerileri(ay, parseInt(yil));
      res.json(veriler);
    } catch (error) {
      console.error("Gümrük verileri getirme hatası:", error);
      res.status(500).json({ error: "Veriler alınamadı" });
    }
  });



  // ============================================================================
  // GIDERLER API
  // ============================================================================

  // Giderler Listesi
  app.get("/api/giderler", async (req, res) => {
    try {
      const { ay, yil } = req.query;
      const giderler = await storage.getGiderler(ay as string, yil ? parseInt(yil as string) : undefined);
      res.json(giderler);
    } catch (error) {
      console.error("Giderler listelenirken hata:", error);
      res.status(500).json({ error: "Giderler alınamadı" });
    }
  });

  // Gider İstatistikleri
  app.get("/api/giderler/stats", async (req, res) => {
    try {
      const { ay, yil } = req.query;
      const stats = await storage.getGiderStats(
        yil ? parseInt(yil as string) : undefined,
        ay as string
      );
      res.json(stats);
    } catch (error) {
      console.error("Gider istatistikleri alınırken hata:", error);
      res.status(500).json({ error: "İstatistikler alınamadı" });
    }
  });

  // Expense Categories Endpoints
  // Get all categories
  app.get("/api/categories", async (req, res) => {
    try {
      // Ensure seed logic runs (lite version of idempotency)
      // Usually better to run on server start, but to avoid modifying index.ts heavily, we trigger here if empty?
      // Actually storage.seedExpenseCategories uses ON CONFLICT DO NOTHING, so it's safe to call.
      // Or we just rely on calling it once. Let's call it here for the first time to ensure user sees data.
      await storage.seedExpenseCategories(); 
      const categories = await storage.getExpenseCategories();
      res.json(categories);
    } catch (error) {
      console.error("Kategoriler alınırken hata:", error);
      res.status(500).json({ error: "Kategoriler alınamadı" });
    }
  });

  // Add category
  app.post("/api/categories", async (req, res) => {
    try {
      const parsed = insertExpenseCategorySchema.parse(req.body);
      const newCategory = await storage.createExpenseCategory(parsed);
      res.json(newCategory);
    } catch (error) {
      console.error("Kategori eklenirken hata:", error);
      // Handle unique constraint error
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
         return res.status(409).json({ error: "Bu kategori zaten mevcut" });
      }
      res.status(500).json({ error: "Kategori eklenemedi" });
    }
  });

  // Delete category
  app.delete("/api/categories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteExpenseCategory(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Kategori silinirken hata:", error);
      res.status(500).json({ error: "Kategori silinemedi" });
    }
  });

  // Yakıt Faturaları (Halis Petrol) — Araçlar sayfasında listelenir;
  // ay bazlı araçlara dağıtılan tutar karşılaştırması ile birlikte döner
  app.get("/api/giderler/yakit-faturalari", async (req, res) => {
    try {
      const rows = await storage.getYakitFaturalari();
      res.json(rows);
    } catch (error) {
      console.error("Yakıt faturaları alınırken hata:", error);
      res.status(500).json({ error: "Yakıt faturaları alınamadı" });
    }
  });

  // Toplu Gider Güncelleme (seçili faturalara şube/kategori/plaka ata)
  app.post("/api/giderler/bulk-update", async (req, res) => {
    try {
      const bulkGiderUpdateSchema = z.object({
        ids: z.array(z.string()).min(1),
        veri: z.object({
          sube: z.string().nullable().optional(),
          kategori: z.string().nullable().optional(),
          plaka: z.string().nullable().optional(),
        }).strict(),
      });
      const parsed = bulkGiderUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Geçersiz istek formatı" });
      }
      const { ids, veri } = parsed.data;
      if (Object.keys(veri).length === 0) {
        return res.status(400).json({ error: "Güncellenecek alan belirtilmedi" });
      }
      const updated = await storage.updateGiderlerBulk(ids, veri);
      res.json({ updated });
    } catch (error) {
      console.error("Toplu gider güncellenirken hata:", error);
      res.status(500).json({ error: "Toplu güncelleme başarısız" });
    }
  });

  // Gider Güncelleme
  app.put("/api/giderler/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const veri = req.body;
      const updated = await storage.updateGider(id, veri);
      res.json(updated);
    } catch (error) {
      console.error("Gider güncellenirken hata:", error);
      res.status(500).json({ error: "Gider güncellenemedi" });
    }
  });

  // Plakaya göre giderleri getir (Araçlar sayfası için)
  app.get("/api/giderler/by-plaka/:plaka", async (req, res) => {
    try {
      const { plaka } = req.params;
      const giderler = await storage.getGiderlerByPlaka(plaka);
      res.json(giderler);
    } catch (error) {
      console.error("Plakaya göre giderler alınırken hata:", error);
      res.status(500).json({ error: "Giderler alınamadı" });
    }
  });

  // Nakliye - Gümrük Eşleştirme (Konteyner Cross-Reference)
  app.post("/api/nakliye/eslestir", async (req, res) => {
    try {
      console.log("Nakliye eşleştirme başlatılıyor...");
      const nakliyeVerileri = await storage.getNakliyeVerileri();
      let matchCount = 0;

      // ---------------------------------------------------------
      // 0. EŞLEŞME HAVUZU — İKİ KAYNAK
      // ---------------------------------------------------------
      // (a) gumruk_verileri  → Gümrük ▸ Satışlar yüklemesi, "HOUSE NO" sütunu
      // (b) beyannameler     → Ödemeler ▸ Beyanname yüklemesi, "HOUSE NO" + "KONŞİMENTO NO"
      // Eskiden yalnız (a) taranıyordu; ölçümde o listelerin ancak %2-3'ünde
      // kullanılabilir konteyner numarası vardı, dolayısıyla eşleşmelerin
      // büyük kısmı hiç kurulamıyordu.
      type EslesmeAdayi = {
        kaynak: "gumruk" | "beyanname";
        dosyaNo: string | null;
        firmaUnvan: string | null;
        gumrukAdi: string | null;
        dovizKiymeti: string | null;
        doviz: string | null;
        tescilNo: string | null;
        tescilTarihi: string | null;  // ham; görüntü biçimi aşağıda normalize edilir
        houseNo: string | null;       // eşleşmeyi kuran numara
      };

      // Excel seri numarası → "DD.MM.YYYY" (görüntü için). Excel epoch'u 1899-12-30.
      const formatExcelDate = (serial: string | number): string => {
        if (!serial) return "";
        const num = typeof serial === "string" ? parseFloat(serial) : serial;
        if (isNaN(num)) return serial.toString();
        const date = new Date(Math.round((num - 25569) * 86400 * 1000));
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${date.getFullYear()}`;
      };

      // "YYYY-MM-DD" → "DD.MM.YYYY". new Date() ile AYRIŞTIRMA yok: timezone
      // off-by-one tuzağı (commit c897dff) — düz metin işlemi.
      const ymdToDisplay = (s: string): string => {
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
      };

      // Tarih karşılaştırması için ortak ayrıştırıcı. Üç biçimi de tanır:
      //   "YYYY-MM-DD" (beyanname), "DD.MM.YYYY" (gümrük), "46044" (Excel serisi).
      // Excel serisi ÖNEMLİ: gümrük tescil tarihleri seri sayı olarak gelebiliyor;
      // eski kod bunu ayrıştıramayıp tarihi yok sayıyordu.
      const tariheCevir = (ham: string | null | undefined): Date | null => {
        if (!ham) return null;
        const s = String(ham).trim();
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
        m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
        if (/^\d+$/.test(s)) {
          const gun = parseInt(s, 10);
          const d = new Date(Date.UTC(1899, 11, 30) + gun * 86400000);
          const yil = d.getUTCFullYear();
          if (Number.isFinite(yil) && yil >= 1990 && yil <= 2100) {
            return new Date(yil, d.getUTCMonth(), d.getUTCDate());
          }
        }
        return null;
      };

      // Anahtar: normalize konteyner no → adaylar
      const havuz = new Map<string, EslesmeAdayi[]>();
      const havuzaEkle = (ham: string | null | undefined, aday: Omit<EslesmeAdayi, "houseNo">) => {
        for (const anahtar of konteynerAnahtarlari(ham)) {
          if (!havuz.has(anahtar)) havuz.set(anahtar, []);
          havuz.get(anahtar)!.push({ ...aday, houseNo: anahtar });
        }
      };

      const gumrukVerileri = await storage.getGumrukHouseNoVerileri();
      for (const g of gumrukVerileri) {
        havuzaEkle(g.houseNo, {
          kaynak: "gumruk",
          dosyaNo: g.dosyaNo,
          firmaUnvan: g.firmaUnvan,
          gumrukAdi: g.gumruk,
          dovizKiymeti: g.dovizKiymeti,
          doviz: g.doviz,
          tescilNo: g.tescilNo,
          tescilTarihi: g.tescilTarihi,
        });
      }
      const gumrukAnahtarSayisi = havuz.size;

      const beyannameVerileri = await storage.getBeyannameKonteynerVerileri();
      for (const b of beyannameVerileri) {
        havuzaEkle(b.konteynerler, {
          kaynak: "beyanname",
          dosyaNo: b.dosyaNo,
          // İthalatta ALICI = bizim müşterimiz; gümrük tarafındaki firmaUnvan'ın karşılığı.
          firmaUnvan: b.alici,
          gumrukAdi: b.gumrukIdaresi,
          dovizKiymeti: b.fatBedeli,
          doviz: b.doviz,
          tescilNo: b.beyanNo,
          tescilTarihi: b.beyanTarihi,
        });
      }

      console.log(
        `Eşleşme havuzu hazır: ${havuz.size} benzersiz konteyner ` +
        `(gümrük listesinden ${gumrukAnahtarSayisi}, beyanname listesiyle birlikte toplam)`,
      );

      // Fatura tarihi ile tescil/beyan tarihi arasındaki azami fark.
      // Navlun faturası tescilden epey sonra kesilebildiği için 45 → 90 gün.
      const AZAMI_GUN_FARKI = 90;

      for (const n of nakliyeVerileri) {
        // ---------------------------------------------------------
        // 1. DYNAMIC EXTRACTION & PERSISTENCE (User Request)
        // ---------------------------------------------------------
        let activeKonteynerler = n.konteynerler || "";

        // Regex exactly as used in Frontend (Nakliye.tsx) but relaxed for backend processing
        // Removed leading \b to capture "TaşimaHMMU..." cases
        const containerRegex = /([A-Z]{4})\s*(\d{6,7})\b/g;
        const extracted = (n.malHizmet || "").match(containerRegex);

        if (extracted && extracted.length > 0) {
             const uniqueExtracted = Array.from(new Set(extracted)).join(", ");

             // If DB is empty, or we found MORE/DIFFERENT data, update it.
             // Simple check: if current is empty or doesn't include the new find
             if (!activeKonteynerler || activeKonteynerler.length < uniqueExtracted.length) {
                 try {
                     console.log(`Fixing Container Data for Invoice ${n.faturaNo}: ${activeKonteynerler} -> ${uniqueExtracted}`);
                     await storage.updateNakliyeVerisi(n.id, { konteynerler: uniqueExtracted });
                     activeKonteynerler = uniqueExtracted; // Use new data for matching
                 } catch (saveErr) {
                     console.error(`Container save error ID ${n.id}:`, saveErr);
                 }
             }
        }

        if (!activeKonteynerler) continue;

        // ---------------------------------------------------------
        // 2. MATCHING LOGIC
        // ---------------------------------------------------------
        const invoiceDate = tariheCevir(n.faturaTarihi);

        // Tek hücrede birden fazla numara olabilir; desenle çıkarılır.
        const konteynerList = konteynerAnahtarlari(activeKonteynerler);

        for (const cont of konteynerList) {
          const candidates = havuz.get(cont);
          if (!candidates || candidates.length === 0) continue;

          let bestMatch: EslesmeAdayi | null = null;
          let minDayDiff = Number.POSITIVE_INFINITY;

          for (const cand of candidates) {
            const tescilDate = tariheCevir(cand.tescilTarihi);

            if (!invoiceDate || !tescilDate) {
              // Tarih yoksa eleyemeyiz; tarihi olan bir aday çıkarsa o kazanır.
              if (!bestMatch) bestMatch = cand;
              continue;
            }

            const diffDays = Math.ceil(
              Math.abs(tescilDate.getTime() - invoiceDate.getTime()) / 86400000,
            );
            if (diffDays > AZAMI_GUN_FARKI) continue;

            // En yakın tarih kazanır. Eşitlikte gümrük kaynağı öncelikli:
            // dosya no + firma ünvanı + tescil no orada daha eksiksiz.
            const dahaIyi =
              diffDays < minDayDiff ||
              (diffDays === minDayDiff && cand.kaynak === "gumruk" && bestMatch?.kaynak !== "gumruk");
            if (dahaIyi) {
              minDayDiff = diffDays;
              bestMatch = cand;
            }
          }

          if (!bestMatch) continue;

          // Tescil tarihini görüntü biçimine getir: Excel serisi veya YYYY-MM-DD olabilir.
          let finalTescilTarihi = bestMatch.tescilTarihi;
          if (finalTescilTarihi) {
            if (/^\d+$/.test(finalTescilTarihi)) finalTescilTarihi = formatExcelDate(finalTescilTarihi);
            else finalTescilTarihi = ymdToDisplay(finalTescilTarihi);
          }

          try {
            await storage.updateNakliyeVerisi(n.id, {
              ilgiliDosyaNo: bestMatch.dosyaNo,
              gumrukFirmaUnvan: bestMatch.firmaUnvan,
              gumrukAdi: bestMatch.gumrukAdi,
              gumrukDovizKiymeti: bestMatch.dovizKiymeti,
              gumrukDovizCinsi: bestMatch.doviz,
              gumrukTescilNo: bestMatch.tescilNo,
              gumrukTescilTarihi: finalTescilTarihi,
              eslesenHouseNo: bestMatch.houseNo,
            });
            matchCount++;
            break; // Found a match for this invoice
          } catch (err) {
            console.error(`Nakliye güncelleme hatası ID: ${n.id}`, err);
          }
        }
      }

      console.log(`Eşleştirme Tamamlandı. Toplam Eşleşen Fatura: ${matchCount}`);
      res.json({ success: true, matchCount, totalScanned: nakliyeVerileri.length });

    } catch (error) {
      console.error("Eşleştirme hatası:", error);
      res.status(500).json({ error: "Eşleştirme işlemi sırasında hata oluştu" });
    }
  });

  // Gider Excel Yükle
  app.post("/api/giderler/upload", upload.single("excel"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Dosya yüklenmedi" });
      }

      const isForce = req.body?.force === true || req.body?.force === "true";

      // 1. Read Excel
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[];

      // Skip first row (header)
      const dataRows = rawData.slice(1);

      const parsedVeriler: any[] = [];
      const currentYear = new Date().getFullYear(); // Default if needed, but we look at date

      // Fetch Historical Mappings once
      const historicalMappings = await storage.getHistoricalMappings();

      // A: Tarih, B: Firma, C: Fatura No, D: Mal Bedeli, E: KDV, F: Toplam, G: Para Birimi, H: Şube, I: Kategori
      for (const row of dataRows) {
        if (!row[0] || !row[1]) continue; // Skip empty rows



        let tarihStr = "";
        let yil = currentYear;
        let ay = "ocak"; // Default

        const safeParseFloat = (val: any) => {
          if (typeof val === 'number') return val;
          if (!val) return 0;
          const clean = String(val).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''); // Remove thousands separator dots, replace decimal comma
          const num = parseFloat(clean);
          return isNaN(num) ? 0 : num;
        };

        const firma = String(row[1] || "").trim();
        const faturaNo = String(row[2] || "").trim();
        const malBedeli = safeParseFloat(row[3]);
        const kdvTutari = safeParseFloat(row[4]);
        const toplamTutar = safeParseFloat(row[5]);
        const paraBirimi = normalizeCurrencyCode(row[6]);
        let sube = row[7] ? String(row[7]).trim() : null;
        let kategori = row[8] ? String(row[8]).trim() : null;

        // Auto-Categorization Logic
        if (!sube || !kategori) {
           const map = historicalMappings.find((m: { firma: string }) => m.firma === firma);
           if (map) {
             if (!sube && map.sube) sube = map.sube;
             if (!kategori && map.kategori) kategori = map.kategori;
           }
        }

        // Date Parsing Logic
        if (typeof row[0] === 'number') {
          // Excel Date (Serial Number)
          const date = new Date(Math.round((row[0] - 25569) * 86400 * 1000));
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          tarihStr = `${day}.${month}.${year}`;
          yil = year;
        } else if (typeof row[0] === 'string') {
          tarihStr = row[0].trim();
          const dateParts = tarihStr.split('.');
          if (dateParts.length === 3) {
            yil = parseInt(dateParts[2]);
          }
        } else {
          tarihStr = String(row[0] || "");
        }

        // Determine month name from date
        const parts = tarihStr.split('.');
        if (parts.length === 3) {
          const monthNum = parseInt(parts[1]);
          const ayMap = ["", "ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];
          if (monthNum >= 1 && monthNum <= 12) ay = ayMap[monthNum];
        }

        let kur = 1;
        let tryTutar = toplamTutar;

        if (paraBirimi !== 'TRY' && paraBirimi !== 'TL' && tarihStr) {
          try {
            // Fetch Rate
            kur = await getTCMBExchangeRate(tarihStr, paraBirimi);
            tryTutar = toplamTutar * kur;
          } catch (e) {
            console.error(`Rate fetch error for ${tarihStr} ${paraBirimi}:`, e);
          }
        }

        parsedVeriler.push({
          tarih: tarihStr,
          firma,
          faturaNo,
          malBedeli,
          kdvTutari,
          toplamTutar,
          paraBirimi,
          kur,
          tryTutar,
          sube,
          kategori,
          ay,
          yil
        });
      }

      if (parsedVeriler.length === 0) {
        return res.status(400).json({ error: "Geçerli veri bulunamadı" });
      }

      console.log(`Parsed ${parsedVeriler.length} rows. First row example:`, parsedVeriler[0]);

      // 2. MD5 fast-path: aynı dosya daha önce yüklendiyse 409 dön (force yoksa)
      const md5Hash = createHash("md5").update(req.file.buffer).digest("hex");

      if (!isForce) {
        const existing = await storage.findGumrukDosyaByMd5(md5Hash, "gider");
        if (existing) {
          return res.status(409).json({
            duplicate: true,
            existing: {
              id: existing.id,
              filename: existing.filename,
              uploadDate: existing.uploadDate,
              recordCount: existing.recordCount,
            },
          });
        }
      }

      // 3. Arşiv klasörünü belirle: uploads/giderler/{yil}/{ay}/
      const fsLib = await import("fs");
      const pathLib = await import("path");

      const archiveYil = parsedVeriler[0]?.yil || currentYear;
      const archiveAy = parsedVeriler[0]?.ay || "ocak";
      const archiveDir = pathLib.join(process.cwd(), "uploads", "giderler", String(archiveYil), archiveAy);
      await fsLib.promises.mkdir(archiveDir, { recursive: true });

      const timestamp = new Date().getTime();
      const safeFilename = req.file.originalname.replace(/[^a-z0-9.]/gi, '_');
      const filename = `${timestamp}_${safeFilename}`;
      const filepath = pathLib.join(archiveDir, filename);

      // 4. Dosyayı diske yaz
      await fsLib.promises.writeFile(filepath, req.file.buffer);

      // 5. Dosya kaydını oluştur (recordCount sonra güncellenecek)
      const dosyaKaydi = await storage.createGumrukDosya({
        filename: req.file.originalname,
        filepath: filepath,
        sizeBytes: req.file.size,
        recordCount: 0,
        md5Hash: md5Hash,
        tip: "gider",
      });

      // 6. dosyaId'yi tüm satırlara ata
      for (const v of parsedVeriler) {
        v.dosyaId = dosyaKaydi.id;
      }

      // 7. Insert
      const inserted = await storage.insertGiderler(parsedVeriler);

      // 8. Dosya kaydının recordCount'unu güncelle
      await storage.updateGumrukDosyaRecordCount(dosyaKaydi.id, inserted.length);

      res.json({ success: true, count: inserted.length });

    } catch (error) {
      console.error("Giderler yüklenirken hata:", error);
      res.status(500).json({ error: "Dosya işlenirken hata oluştu: " + (error as Error).message });
    }
  });

  // Belirli bir ay/yıl için tüm gider kayıtlarını topluca sil (toplu cleanup için).
  // Yanlış yüklenen ay'ı yeniden yüklemek için kullanılır.
  app.delete("/api/giderler", async (req, res) => {
    try {
      const ay = String(req.query.ay ?? "").trim();
      const yilParam = req.query.yil ? Number(req.query.yil) : NaN;
      if (!ay || !Number.isFinite(yilParam) || yilParam < 2000 || yilParam > 2100) {
        return res.status(400).json({ error: "Geçersiz ay veya yıl" });
      }
      await storage.deleteGiderler(ay, yilParam);
      res.json({ success: true });
    } catch (err) {
      console.error("Giderler toplu silme hatası:", err);
      res.status(500).json({ error: "Silinemedi" });
    }
  });

  // Giderler — Yükleme Geçmişi (Upload history)
  app.get("/api/giderler/dosyalar", async (req, res) => {
    try {
      const yilParam = req.query.yil ? Number(req.query.yil) : undefined;
      if (yilParam !== undefined && (!Number.isFinite(yilParam) || yilParam < 2000 || yilParam > 2100)) {
        return res.status(400).json({ error: "Geçersiz yıl" });
      }
      const rows = await storage.listGumrukDosyalar(yilParam, "gider");
      res.json(rows);
    } catch (err) {
      console.error("Gider dosya listesi hatası:", err);
      res.status(500).json({ error: "Liste alınamadı" });
    }
  });

  app.delete("/api/giderler/dosyalar/:id", async (req, res) => {
    try {
      const result = await storage.deleteGumrukDosyaWithVerileri(req.params.id);
      if (!result) return res.status(404).json({ error: "Bulunamadı" });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("Gider dosya silme hatası:", err);
      res.status(500).json({ error: "Silinemedi" });
    }
  });


  // Yükleme geçmişi (Upload history)
  app.get("/api/gumruk/dosyalar", async (req, res) => {
    try {
      const yilParam = req.query.yil ? Number(req.query.yil) : undefined;
      if (yilParam !== undefined && (!Number.isFinite(yilParam) || yilParam < 2000 || yilParam > 2100)) {
        return res.status(400).json({ error: "Geçersiz yıl" });
      }
      const rows = await storage.listGumrukDosyalar(yilParam, "gumruk");
      res.json(rows);
    } catch (err) {
      console.error("Dosya listesi hatası:", err);
      res.status(500).json({ error: "Liste alınamadı" });
    }
  });

  app.delete("/api/gumruk/dosyalar/:id", async (req, res) => {
    try {
      const result = await storage.deleteGumrukDosyaWithVerileri(req.params.id);
      if (!result) return res.status(404).json({ error: "Bulunamadı" });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("Dosya silme hatası:", err);
      res.status(500).json({ error: "Silinemedi" });
    }
  });

  // Enhanced Excel Upload (Gümrük Sayfası İçin)
  app.post("/api/gumruk/yukle", upload.single("excel"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Dosya yüklenmedi" });
      }

      // 1. Parametreleri doğrula
      const parseResult = uploadParamsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Geçersiz ay veya yıl değeri" });
      }
      const { ay, yil, bulk, force, headerMapping: headerMappingRaw } = parseResult.data;
      const isBulk = bulk === true || bulk === "true";
      const isForce = force === true || force === "true";

      // 1a. Header mapping (canonical_target -> source_header_in_excel)
      let mapping: Record<string, string> = {};
      if (headerMappingRaw) {
        try {
          const parsed = JSON.parse(headerMappingRaw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof k === "string" && typeof v === "string" && v) {
                mapping[k] = v;
              }
            }
          }
        } catch {
          return res.status(400).json({ error: "headerMapping JSON çözümlenemedi" });
        }
      }
      const hasMapping = Object.keys(mapping).length > 0;

      const remapRow = (row: any, mapping: Record<string, string>): any => {
        if (!mapping || Object.keys(mapping).length === 0) return row;
        const out: any = { ...row };
        for (const [target, source] of Object.entries(mapping)) {
          if (source && row[source] !== undefined) {
            out[target] = row[source];
          }
        }
        return out;
      };

      // 2. Excel'i parse et (henüz diske yazma yok)
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const allSheetNames = workbook.SheetNames.filter(
        (name) => !name.startsWith("~$") && !name.startsWith("_xlnm")
      );
      if (allSheetNames.length === 0) {
        return res.status(400).json({ error: "Excel dosyasında okunabilir sayfa bulunamadı" });
      }

      type RowWithSheet = { row: any; sheetName: string };
      const data: RowWithSheet[] = [];
      for (const name of allSheetNames) {
        const sheet = workbook.Sheets[name];
        if (!sheet) continue;
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as any[];
        for (const row of rows) data.push({ row, sheetName: name });
      }

      if (data.length === 0) {
        return res.status(400).json({ error: "Excel dosyası boş veya geçersiz" });
      }

      // 3. Satırları işle ve veriler[] dizisini oluştur
      const veriler: InsertGumrukVerisi[] = [];
      const skippedRows: { ay: string | null; yil: number | null; row: any; reason: string }[] = [];
      let tarihsiz = 0;

      for (const { row, sheetName } of data) {
         const resolvedRow = hasMapping ? remapRow(row, mapping) : row;

         // Skip empty-ish rows (must have basics)
         if (!resolvedRow["FİRMA ÜNVAN"] && !resolvedRow["FATURA NO"]) {
           skippedRows.push({ ay: isBulk ? null : (ay as string), yil: isBulk ? null : (yil as number), row: { ...resolvedRow, _sheet: sheetName }, reason: "Boş satır" });
           continue;
         }

         const parseNumber = (val: any): string | null => {
           if (val === undefined || val === null || val === "") return null;
           if (typeof val === 'number') return val.toFixed(2);
           const str = String(val).trim();
           if (!str) return null;
           let clean = str;
           if (str.includes(",") && str.includes(".")) {
              clean = str.replace(/\./g, "").replace(",", ".");
           } else if (str.includes(",")) {
              clean = str.replace(",", ".");
           }
           const num = parseFloat(clean);
           return isNaN(num) ? null : num.toFixed(2);
         };

         // Row hash - using object values (resolved so identical logical records hash the same)
         const rowHash = createRowHash(Object.values(resolvedRow));

         // Bulk modunda ay/yıl satırın FATURA TARİHİ alanından çıkarılır
         let satirAy: string;
         let satirYil: number;
         if (isBulk) {
           const parsed = tarihiAyYilCikar(resolvedRow["FATURA TARİHİ"]);
           if (!parsed) {
             skippedRows.push({ ay: null, yil: null, row: { ...resolvedRow, _sheet: sheetName }, reason: "Tarihsiz" });
             tarihsiz++;
             continue;
           }
           satirAy = parsed.ay;
           satirYil = parsed.yil;
         } else {
           // Non-bulk mode: ay/yıl body'den gelir (refine garantili)
           satirAy = ay as string;
           satirYil = yil as number;
         }

         // Tip Mapping
         let tipRaw = resolvedRow["TİP"] ? String(resolvedRow["TİP"]).trim() : "Diğer";
         let tip = "Diğer";
         const tr = tipRaw.toUpperCase();
         if (tr === "T" || tr === "İTHALAT") tip = "İthalat";
         else if (tr === "H" || tr === "İHRACAT") tip = "İhracat";
         else if (tr === "@" || tr === "TRANSİT") tip = "Transit";
         else if (tr === "A") tip = "Serbest B. Giriş";
         else if (tr === "B") tip = "Serbest B. Çıkış";
         else tip = "Diğer";

         const g = (key: string) => resolvedRow[key] ? String(resolvedRow[key]).trim() : null;

         // Serialize FULL row data for archival
         const rawData = JSON.stringify({ ...resolvedRow, _sheet: sheetName });

         const veri: InsertGumrukVerisi = {
           ay: satirAy,
           yil: satirYil,
           firmaUnvan: resolvedRow["FİRMA ÜNVAN"],
           faturaNo: resolvedRow["FATURA NO"],
           malBedeli: parseNumber(resolvedRow["MAL BEDELİ"]),
           topKdvTutar: parseNumber(resolvedRow["TOP KDV TUTAR"]),
           topFaturaTutar: parseNumber(resolvedRow["TOP FATURA TUTAR"]),
           topIskonto: parseNumber(resolvedRow["TOP İSKONTO"]),

           // Mapped fields
           tip,
           dosyaNo: g("DOSYA NO"),
           rejim: g("REJİM"),
           faturaTarihi: g("FATURA TARİHİ"),
           gumruk: g("GÜMRÜK"),
           tescilTarihi: g("TESCİL TARİHİ"),
           tescilNo: g("TESCİL NO"),
           faturayiKesen: g("FATURAYI KESEN"),
           dovizKiymeti: g("DOVİZ KIYMETİ"),
           doviz: g("DOVİZ"),
           girisElemani: g("GİRİŞ ELEMANI"),

           // New Enhanced Fields
           firmaNo: g("FİRMA NO"),
           firmaOzellik: g("FİRMA ÖZELLİK"),
           hesapNo: g("HesapNo"),
           malinCinsi: g("MALIN CİNSİ"),
           referansNo: g("REFERANS NO"),
           houseNo: g("HOUSE NO"),
           konteynerSayisi: g("KONTEYNER SAYISI"),
           siraNo: g("SIRA NO"),
           faturaKesimTarihi: g("FATURA KESİM TARİHİ"),
           valorTarihi: g("VALÖR TARİHİ"),
           mensei: g("MENŞEİ"),
           mm: g("M.M"),
           ydFirma: g("Y.D FİRMA"),
           kullanici: g("KULLANICI"),
           araKonsNo: g("ARA KONS. NO"),
           accountNo: g("ACCOUNT NO"),
           // Satışlar Excel'inde başlıklar noktasız: "VD" / "VN".
           // Yalnızca "V.D"/"V.N" arandığı için bu iki alan yıllarca boş
           // kaldı (2026'daki 17.869 satırın tamamında null). Noktasız
           // varyantlar önce denenir.
           vd: g("VD") || g("V.D") || g("VERGİ DAİRESİ"),
           vn: g("VN") || g("V.N") || g("VERGİ NO"),
           odemeSekli: g("ÖDEME ŞEKLİ"),
           musFatura: g("MÜŞ. FATURA"),
           komisyonHesap: g("KOMİSYON HESAP"),
           isTf: g("İS TF"),
           imalatci: g("İMALATÇI"),
           tevkifatKod: g("TEVKİFAT KOD"),
           poNo: g("PO NO"),
           supalan: g("SUPALAN"),
           fe: g("FE"),
           sm: g("SM"),
           kapAdedi: g("KAP ADEDİ"),
           tasimaCinsi: g("TAŞIMA CİNSİ"),
           tasitCinsi: g("TAŞIT CİNSİ"),
           kalemSayisi: g("KALEM SAYISI"),

           // Numeric Fields (Enhanced)
           cifKiymet: parseNumber(resolvedRow["CİF KIYMET"]),
           istKiymet: parseNumber(resolvedRow["İST. KIYMET"]),
           kur: parseNumber(resolvedRow["KUR"]),

           // Raw Data Vault
           rawData: rawData,
           dosyaId: undefined, // Aşağıda dosya kaydı oluşturulduktan sonra set edilecek
           rowHash
         };

         veriler.push(veri);
      }

      if (veriler.length === 0) {
        return res.status(400).json({ error: "Geçerli veri bulunamadı" });
      }

      // 4. Dosya hash'ini hesapla
      const md5Hash = createHash("md5").update(req.file.buffer).digest("hex");

      // 4a. Mükerrer dosya kontrolü (force=true ise atla)
      if (!isForce) {
        const existing = await storage.findGumrukDosyaByMd5(md5Hash);
        if (existing) {
          return res.status(409).json({
            duplicate: true,
            existing: {
              id: existing.id,
              filename: existing.filename,
              uploadDate: existing.uploadDate,
              recordCount: existing.recordCount,
            },
          });
        }
      }

      // 5. Arşiv klasörünü belirle
      // - non-bulk: uploads/gumruk/{yil}/{ay}/
      // - bulk: uploads/gumruk/{ilk_geçerli_satırın_yılı}/all/
      const fs = await import("fs");
      const path = await import("path");

      const archiveYil = isBulk ? veriler[0].yil : (yil as number);
      const archiveAy = isBulk ? "all" : (ay as string);
      const archiveDir = path.join(process.cwd(), "uploads", "gumruk", String(archiveYil), archiveAy);
      await fs.promises.mkdir(archiveDir, { recursive: true });

      const timestamp = new Date().getTime();
      const safeFilename = req.file.originalname.replace(/[^a-z0-9.]/gi, '_');
      const filename = `${timestamp}_${safeFilename}`;
      const filepath = path.join(archiveDir, filename);

      // 6. Dosyayı diske yaz
      await fs.promises.writeFile(filepath, req.file.buffer);

      // 7. Dosya kaydını oluştur (recordCount sonra güncellenecek)
      const dosyaKaydi = await storage.createGumrukDosya({
        filename: req.file.originalname,
        filepath: filepath,
        sizeBytes: req.file.size,
        recordCount: 0,
        md5Hash: md5Hash
      });

      // 8. dosyaId'yi tüm satırlara ata
      for (const v of veriler) {
        v.dosyaId = dosyaKaydi.id;
      }

      // 9. Pre-insert dedup: kompozit anahtar üzerinden iş kuralı.
      // Bir satır mükerrer sayılır ANCAK faturaNo, dosyaNo, tescilNo, malBedeli,
      // topFaturaTutar ve siraNo'nun TÜMÜ aynı satırla eşleşirse. Herhangi bir
      // seviyede fark varsa (örn. aynı faturaNo'lu farklı dosyaNo'lu toplu
      // fatura kalemleri) satır benzersiz kabul edilir ve eklenir.
      // Detay: server/dedup.ts.
      const ayYilPairs = veriler
        .map(v => ({ ay: v.ay, yil: v.yil }))
        .filter((p): p is { ay: string; yil: number } => !!p.ay && typeof p.yil === "number");
      const existingKeys = await storage.getExistingKompozitKeysByAyYillar(ayYilPairs);

      const yeniVeriler: typeof veriler = [];
      const seenInBatch = new Set<string>();

      for (const v of veriler) {
        const key = buildDedupKey(v);
        if (key) {
          const faturaNo = v.faturaNo ? String(v.faturaNo).trim() : "";
          if (seenInBatch.has(key)) {
            skippedRows.push({
              ay: v.ay,
              yil: v.yil,
              row: JSON.parse(v.rawData ?? "{}"),
              reason: `Aynı dosyada bire bir aynı satır${faturaNo ? ` (fatura ${faturaNo})` : ""}`,
            });
            continue;
          }
          if (existingKeys.has(key)) {
            skippedRows.push({
              ay: v.ay,
              yil: v.yil,
              row: JSON.parse(v.rawData ?? "{}"),
              reason: `Bu satır ${v.ay} ${v.yil} dönemine daha önce yüklenmiş${faturaNo ? ` (fatura ${faturaNo})` : ""}`,
            });
            continue;
          }
          seenInBatch.add(key);
        }
        yeniVeriler.push(v);
      }

      // 10. Insert (ON CONFLICT DO NOTHING — (ay, yil, rowHash) ikincil savunma)
      const inserted = await storage.insertGumrukVerileri(yeniVeriler);
      const eklenen = inserted.length;
      const atlanan = veriler.length - eklenen;

      // 10a. ON CONFLICT ile sessizce atlananları (rowHash çakışması) da raporla —
      // genelde faturaNo'su olmayan satırlar için ikinci savunma devreye girer.
      if (yeniVeriler.length > inserted.length) {
        const insertedHashes = new Set(inserted.map(r => r.rowHash));
        for (const v of yeniVeriler) {
          if (!insertedHashes.has(v.rowHash)) {
            skippedRows.push({
              ay: v.ay,
              yil: v.yil,
              row: JSON.parse(v.rawData ?? "{}"),
              reason: "Aynı içerikli satır daha önce yüklenmiş (rowHash)",
            });
          }
        }
      }

      // 10. Dosya kaydının recordCount'unu güncelle
      await storage.updateGumrukDosyaRecordCount(dosyaKaydi.id, eklenen);

      // 11. Yanıtı oluştur (atlanan satırları en fazla 500 ile sınırla)
      const skippedRowsSample = skippedRows.slice(0, 500);

      res.json({
        success: true,
        message: `${eklenen} yeni kayıt eklendi${atlanan > 0 ? ` (${atlanan} mevcut kayıt atlandı)` : ""}${tarihsiz > 0 ? ` (${tarihsiz} tarihsiz satır atlandı)` : ""}`,
        eklenen,
        atlanan,
        tarihsiz,
        toplam: data.length,
        skippedCount: skippedRows.length,
        skippedRows: skippedRowsSample,
        sheetCount: allSheetNames.length,
        sheetNames: allSheetNames,
        headerMapping: hasMapping ? mapping : undefined,
      });
    } catch (error) {
      console.error("Excel yükleme hatası:", error);
      const errorMessage = error instanceof Error ? error.message : "Bilinmeyen hata";
      res.status(500).json({ error: `Excel yüklenirken bir hata oluştu: ${errorMessage} ` });
    }
  });

  // n8n Proxy Upload (Bypassing CORS) supporting multiple files
  app.post("/api/proxy/nakliye-upload", upload.any(), async (req, res) => {
    console.log("--- N8N MULTI-PROXY UPLOAD START ---");
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        console.error("DEBUG: No files found in request. Body keys:", Object.keys(req.body || {}));
        return res.status(400).json({ error: "Dosya yüklenmedi" });
      }

      console.log(`DEBUG: Total files received: ${files.length}`);
      files.forEach((f, i) => console.log(`  File ${i + 1}: field=${f.fieldname}, name=${f.originalname}`));

      const N8N_WEBHOOK_URL = "https://cnccem.app.n8n.cloud/webhook-test/aeb369ba-de90-4ee2-805c-26dd12693f90";

      // Create a new FormData for the server-to-server request
      const formData = new FormData();

      files.forEach((file, index) => {
        const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
        formData.append("file", blob, file.originalname);
        console.log(`DEBUG: Appending file ${index + 1}: ${file.originalname}`);
      });

      console.log(`DEBUG: Forwarding to n8n: ${N8N_WEBHOOK_URL}`);

      const response = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        body: formData,
      });

      console.log(`DEBUG: n8n response status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("spreadsheetml") || contentType.includes("excel")) {
          const arrayBuffer = await response.arrayBuffer();
          const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
          return res.json({ success: true, dataType: "xlsx_parsed", data: jsonData });
        }

        const data = await response.json().catch(() => ({ success: true }));
        res.json(data);
      } else {
        const errorText = await response.text();
        res.status(response.status).json({ error: "n8n hatası", details: errorText });
      }
    } catch (error) {
      console.error("DEBUG: Proxy system error:", error);
      res.status(500).json({ error: "Sunucu hatası" });
    } finally {
      console.log("--- N8N MULTI-PROXY UPLOAD END ---");
    }
  });

  // Nakliye Verilerini Getir
  app.get("/api/nakliye", async (_req, res) => {
    try {
      const veriler = await storage.getNakliyeVerileri();
      res.json(veriler);
    } catch (error) {
      console.error("Nakliye getirme hatası:", error);
      res.status(500).json({ error: "Veriler getirilirken bir hata oluştu." });
    }
  });

  // Nakliye Verilerini Kaydet
  app.post("/api/nakliye/kaydet", async (req, res) => {
    try {
      const veriler = req.body;
      if (!Array.isArray(veriler)) {
        return res.status(400).json({ error: "Geçersiz veri formatı, bir liste bekleniyor." });
      }

      // Veriyi şemaya göre temizle ve doğrula
      const validVeriler = veriler.map(v => {
        const parseNumber = (val: any) => {
          if (val === undefined || val === null || val === "") return null;
          const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : parseFloat(val);
          return isNaN(num) ? null : num.toString();
        };

        // N8N'den gelen alan adlarını DB alan adları ile eşleştir
        return {
          faturaNo: v["Fatura No"] || v.faturaNo || null,
          faturaTarihi: v["Fatura Tarihi"] || v.faturaTarihi || null,
          malHizmet: v["Mal Hizmet"] || v.malHizmet || null,
          miktar: parseNumber(v["Miktar"] || v.miktar),
          birimFiyat: parseNumber(v["Birim Fiyat"] || v.birimFiyat),
          kdvOranı: v["KDV Oranı"] ? parseInt(v["KDV Oranı"]) : (v.kdvOrani ? parseInt(v.kdvOrani) : null),
          kdvTutarı: parseNumber(v["KDV Tutarı"] || v.kdvTutari),
          malHizmetToplamTutarı: parseNumber(v["Mal Hizmet Toplam Tutarı"] || v.malHizmetToplamTutari),
          hesaplananKdv20: parseNumber(v["Hesaplanan KDV(%20)"] || v.hesaplananKdv20),
          hesaplananKdvTevkifat20: parseNumber(v["Hesaplanan KDV Tevkifat(%20)"] || v.hesaplananKdvTevkifat20),
          vergilerDahilToplamTutar: parseNumber(v["Vergiler Dahil Toplam Tutar"] || v.vergilerDahilToplamTutar),
          odenecekTutar: parseNumber(v["Ödenecek Tutar"] || v.odenecekTutar),
          rawJson: JSON.stringify(v)
        };
      });

      const saved = await storage.insertNakliyeVerileri(validVeriler);
      res.json({ success: true, message: `${saved.length} kayıt başarıyla kaydedildi.`, data: saved });
    } catch (error) {
      console.error("Nakliye kaydetme hatası:", error);
      res.status(500).json({ error: "Veriler kaydedilirken bir hata oluştu." });
    }
  });

  // Nakliye verisi sil
  app.delete("/api/nakliye/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteNakliyeVerisi(id);
      res.json({ success: true, message: "Kayıt silindi" });
    } catch (error) {
      console.error("Nakliye silme hatası:", error);
      res.status(500).json({ error: "Kayıt silinemedi" });
    }
  });

  // Nakliye verisi güncelle
  app.put("/api/nakliye/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const veri = req.body;
      const updated = await storage.updateNakliyeVerisi(id, veri);
      res.json({ success: true, message: "Kayıt güncellendi", data: updated });
    } catch (error) {
      console.error("Nakliye güncelleme hatası:", error);
      res.status(500).json({ error: "Kayıt güncellenemedi" });
    }
  });



  // Gümrük verilerini sil
  app.delete("/api/gumruk/:ay/:yil", async (req, res) => {
    try {
      const { ay, yil } = req.params;
      await storage.deleteGumrukVerileri(ay, parseInt(yil));
      res.json({ success: true, message: "Veriler silindi" });
    } catch (error) {
      console.error("Silme hatası:", error);
      res.status(500).json({ error: "Veriler silinemedi" });
    }
  });
  
  // Raporlar ve Analizler endpoint'leri
  app.get("/api/reports/branch-profitability", async (req, res) => {
    try {
      const yil = parseInt(req.query.yil as string) || new Date().getFullYear();
      const ay = req.query.ay as string;
      const data = await storage.getBranchProfitability(yil, ay);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Şube kârlılık raporu alınamadı" });
    }
  });

  app.get("/api/reports/vehicle-expenses/:plaka", async (req, res) => {
    try {
      const { plaka } = req.params;
      const data = await storage.getVehicleExpenses(plaka);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Araç masraf raporu alınamadı" });
    }
  });

  app.get("/api/reports/reminders", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 60; // 60 days default
      const data = await storage.getUpcomingPolicies(days);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Hatırlatıcılar alınamadı" });
    }
  });

  // AI Chat Endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: "Mesaj boş olamaz" });

      // 1. Generate SQL
      const { answer, sql, data } = await processUserQuery(message);
      
      // If direct answer (no SQL generated)
      if (!sql) {
        return res.json({ message: answer });
      }

      // 2. Execute SQL
      let result = [];
      try {
         result = await storage.executeRawSql(sql); 
      } catch (sqlError: any) {
         console.error("SQL Execution Error:", sqlError);
         return res.json({ message: "Sorgu çalıştırılırken hata oluştu: " + sqlError.message });
      }

      // 3. Generate Natural Language Response
      const finalResponse = await generateNaturalLanguageResponse(message, sql, result);
      
      res.json({ 
        message: finalResponse, 
        sql: sql, 
        data: result 
      });

    } catch (error: any) {
      console.error("AI Chat Error:", error);
      res.status(500).json({ error: "AI servisi hatası: " + error.message });
    }
  });

  // ISO9001 Stats
  app.get("/api/iso9001/stats", async (_req, res) => {
    try {
      const stats = await storage.getIso9001Stats();
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: "Stats alınamadı" });
    }
  });

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

  // DÜF
  app.get("/api/duf", async (_req, res) => {
    try {
      res.json(await storage.getDufList());
    } catch (e) {
      res.status(500).json({ error: "DÜF listesi alınamadı" });
    }
  });

  app.post("/api/duf", uploadDuf.single("dosyaEki"), async (req, res) => {
    try {
      const data = JSON.parse(req.body.data ?? "{}");
      if (req.file) data.dosyaEki = `/uploads/duf/${req.file.filename}`;
      const row = await storage.createDuf(data);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ error: "DÜF oluşturulamadı" });
    }
  });

  app.put("/api/duf/:id", uploadDuf.single("dosyaEki"), async (req, res) => {
    try {
      const data = JSON.parse(req.body.data ?? "{}");
      if (req.file) data.dosyaEki = `/uploads/duf/${req.file.filename}`;
      const row = await storage.updateDuf(req.params.id, data);
      res.json(row);
    } catch (e) {
      res.status(400).json({ error: "DÜF güncellenemedi" });
    }
  });

  app.delete("/api/duf/:id", async (req, res) => {
    try {
      await storage.deleteDuf(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "DÜF silinemedi" });
    }
  });

  // Bakım & Onarım
  app.get("/api/bakim/varliklar", async (req, res) => {
    try {
      const kategori = req.query.kategori as string | undefined;
      res.json(await storage.getBakimVarliklar(kategori));
    } catch (e) {
      res.status(500).json({ error: "Varlıklar alınamadı" });
    }
  });

  app.get("/api/bakim/varliklar/:id", async (req, res) => {
    try {
      const row = await storage.getBakimVarlik(req.params.id);
      if (!row) return res.status(404).json({ error: "Bulunamadı" });
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: "Varlık alınamadı" });
    }
  });

  app.post("/api/bakim/varliklar", async (req, res) => {
    try {
      const row = await storage.createBakimVarlik(req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ error: "Varlık oluşturulamadı" });
    }
  });

  app.put("/api/bakim/varliklar/:id", async (req, res) => {
    try {
      const row = await storage.updateBakimVarlik(req.params.id, req.body);
      if (!row) return res.status(404).json({ error: "Bulunamadı" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ error: "Varlık güncellenemedi" });
    }
  });

  app.delete("/api/bakim/varliklar/:id", async (req, res) => {
    try {
      await storage.deleteBakimVarlik(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Varlık silinemedi" });
    }
  });

  app.post("/api/bakim/varliklar/:id/kayitlar", async (req, res) => {
    try {
      const row = await storage.createBakimKayit({ ...req.body, varlikId: req.params.id });
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ error: "Bakım kaydı oluşturulamadı" });
    }
  });

  app.put("/api/bakim/kayitlar/:id", async (req, res) => {
    try {
      const row = await storage.updateBakimKayit(req.params.id, req.body);
      if (!row) return res.status(404).json({ error: "Bulunamadı" });
      res.json(row);
    } catch (e) {
      res.status(400).json({ error: "Bakım kaydı güncellenemedi" });
    }
  });

  app.delete("/api/bakim/kayitlar/:id", async (req, res) => {
    try {
      await storage.deleteBakimKayit(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Bakım kaydı silinemedi" });
    }
  });

  // Tetkik Planlar
  app.get("/api/tetkik/planlar", async (_req, res) => {
    try {
      res.json(await storage.getTetkikPlanlar());
    } catch (e) {
      res.status(500).json({ error: "Tetkik planları alınamadı" });
    }
  });

  app.post("/api/tetkik/planlar", uploadTetkik.single("dosyaEki"), async (req, res) => {
    try {
      const data = JSON.parse(req.body.data ?? "{}");
      if (req.file) data.dosyaEki = `/uploads/tetkik/${req.file.filename}`;
      const row = await storage.createTetkikPlan(data);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ error: "Tetkik planı oluşturulamadı" });
    }
  });

  app.put("/api/tetkik/planlar/:id", uploadTetkik.single("dosyaEki"), async (req, res) => {
    try {
      const data = JSON.parse(req.body.data ?? "{}");
      if (req.file) data.dosyaEki = `/uploads/tetkik/${req.file.filename}`;
      const row = await storage.updateTetkikPlan(req.params.id, data);
      res.json(row);
    } catch (e) {
      res.status(400).json({ error: "Tetkik planı güncellenemedi" });
    }
  });

  app.delete("/api/tetkik/planlar/:id", async (req, res) => {
    try {
      await storage.deleteTetkikPlan(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Tetkik planı silinemedi" });
    }
  });

  // Tetkik Bulgular
  app.get("/api/tetkik/bulgular", async (req, res) => {
    try {
      const planId = req.query.planId as string | undefined;
      res.json(await storage.getTetkikBulgular(planId));
    } catch (e) {
      res.status(500).json({ error: "Bulgular alınamadı" });
    }
  });

  app.post("/api/tetkik/bulgular", async (req, res) => {
    try {
      const row = await storage.createTetkikBulgu(req.body);
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ error: "Bulgu oluşturulamadı" });
    }
  });

  app.put("/api/tetkik/bulgular/:id", async (req, res) => {
    try {
      const row = await storage.updateTetkikBulgu(req.params.id, req.body);
      res.json(row);
    } catch (e) {
      res.status(400).json({ error: "Bulgu güncellenemedi" });
    }
  });

  app.delete("/api/tetkik/bulgular/:id", async (req, res) => {
    try {
      await storage.deleteTetkikBulgu(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Bulgu silinemedi" });
    }
  });

  // Surveys Endpoints
  app.get("/api/surveys", async (req, res) => {
    try {
      const type = req.query.type as string | undefined;
      const list = type ? await storage.getSurveysByType(type) : await storage.getSurveys();
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: "Anketler alınamadı" });
    }
  });

  app.get("/api/surveys/:id", async (req, res) => {
    try {
      const survey = await storage.getSurvey(req.params.id);
      if (!survey) return res.status(404).json({ error: "Anket bulunamadı" });
      res.json(survey);
    } catch (error) {
      res.status(500).json({ error: "Anket alınırken hata oluştu" });
    }
  });

  app.post("/api/surveys", async (req, res) => {
    try {
      const survey = await storage.createSurvey(req.body);
      res.status(201).json(survey);
    } catch (error) {
      res.status(500).json({ error: "Anket oluşturulurken hata oluştu" });
    }
  });

  app.put("/api/surveys/:id", async (req, res) => {
    try {
      const survey = await storage.updateSurvey(req.params.id, req.body);
      res.json(survey);
    } catch (error) {
      res.status(500).json({ error: "Anket güncellenirken hata oluştu" });
    }
  });

  app.get("/api/surveys/:id/responses", async (req, res) => {
    try {
      const responses = await storage.getSurveyResponses(req.params.id);
      res.json(responses);
    } catch (error) {
      res.status(500).json({ error: "Cevaplar alınırken hata oluştu" });
    }
  });

  app.post("/api/surveys/submit", async (req, res) => {
    try {
      const response = await storage.createSurveyResponse(req.body);
      res.status(201).json(response);
    } catch (error) {
      res.status(500).json({ error: "Cevap kaydedilirken hata oluştu" });
    }
  });

  app.delete("/api/surveys/responses/:id", async (req, res) => {
    try {
      await storage.deleteSurveyResponse(req.params.id);
      res.json({ message: "Başarıyla silindi" });
    } catch (error) {
      res.status(500).json({ error: "Silme işlemi başarısız" });
    }
  });

  app.post("/api/surveys/seed", async (req, res) => {
    try {
      const existing = await storage.getSurveys();
      if (existing.length > 0) return res.status(400).json({ error: "Zaten anketler var" });

      const defaultSurvey = {
        title: "Müşteri Memnuniyet Anketi",
        description: "Değerli Müşterimiz,\n\nSizlere daha iyi hizmet sunabilmek ve süreçlerimizi mükemmelleştirmek adına görüşleriniz bizim için çok kıymetlidir. Lütfen aşağıdaki soruları bizimle olan deneyiminize göre 1 ile 5 arasında puanlayınız.",
        questions: [
          { id: "q1", text: "CNC Gümrük Müşavirliği'nin sunduğu gümrükleme hizmetlerinin genel hızından ne kadar memnunsunuz?", type: "rating" },
          { id: "q2", text: "Operasyon ekibimizin ulaşılabilirliği ve iletişim kolaylığı nasıldı?", type: "rating" },
          { id: "q3", text: "Sunduğumuz hizmetlerdeki şeffaflık (maliyet, süreç bilgilendirmesi) beklentilerinizi karşıladı mı?", type: "rating" },
          { id: "q4", text: "Karşılaştığınız bir sorun olduğunda çözüm üretme potansiyelimizi nasıl değerlendirirsiniz?", type: "rating" },
          { id: "q5", text: "Firmamızı başka iş ortaklarına tavsiye etme olasılığınız nedir?", type: "rating" }
        ],
        isActive: 1,
      };

      const survey = await storage.createSurvey(defaultSurvey);
      res.status(201).json(survey);
    } catch (error) {
      res.status(500).json({ error: "Seed işlemi başarısız" });
    }
  });

  // ISO Personeller
  app.get("/api/iso-personeller", async (_req, res) => {
    try {
      res.json(await storage.getIsoPersoneller());
    } catch {
      res.status(500).json({ error: "Personel listesi alınamadı" });
    }
  });

  app.get("/api/iso-personeller/:id/kart", async (req, res) => {
    try {
      res.json(await storage.getIsoPersonelKart(req.params.id));
    } catch {
      res.status(404).json({ error: "Personel bulunamadı" });
    }
  });

  app.post("/api/iso-personeller", async (req, res) => {
    try {
      res.status(201).json(await storage.createIsoPersonel(req.body));
    } catch {
      res.status(400).json({ error: "Personel oluşturulamadı" });
    }
  });

  app.put("/api/iso-personeller/:id", async (req, res) => {
    try {
      res.json(await storage.updateIsoPersonel(req.params.id, req.body));
    } catch {
      res.status(400).json({ error: "Personel güncellenemedi" });
    }
  });

  app.delete("/api/iso-personeller/:id", async (req, res) => {
    try {
      await storage.deleteIsoPersonel(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Personel silinemedi" });
    }
  });

  // Eğitimler
  app.get("/api/egitimler", async (_req, res) => {
    try {
      res.json(await storage.getEgitimler());
    } catch {
      res.status(500).json({ error: "Eğitimler alınamadı" });
    }
  });

  app.post("/api/egitimler", uploadEgitim.single("sertifika"), async (req, res) => {
    try {
      const data = JSON.parse(req.body.data ?? "{}");
      if (req.file) data.sertifikaDosyaYolu = `/uploads/egitimler/${req.file.filename}`;
      res.status(201).json(await storage.createEgitim(data));
    } catch {
      res.status(400).json({ error: "Eğitim oluşturulamadı" });
    }
  });

  app.put("/api/egitimler/:id", uploadEgitim.single("sertifika"), async (req, res) => {
    try {
      const data = JSON.parse(req.body.data ?? "{}");
      if (req.file) data.sertifikaDosyaYolu = `/uploads/egitimler/${req.file.filename}`;
      res.json(await storage.updateEgitim(req.params.id, data));
    } catch {
      res.status(400).json({ error: "Eğitim güncellenemedi" });
    }
  });

  app.delete("/api/egitimler/:id", async (req, res) => {
    try {
      await storage.deleteEgitim(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Eğitim silinemedi" });
    }
  });

  app.get("/api/egitimler/:id/katilimcilar", async (req, res) => {
    try {
      res.json(await storage.getEgitimKatilimcilar(req.params.id));
    } catch {
      res.status(500).json({ error: "Katılımcılar alınamadı" });
    }
  });

  app.post("/api/egitimler/:id/katilimcilar", async (req, res) => {
    try {
      const { personelIds } = req.body as { personelIds: string[] };
      await storage.addEgitimKatilimcilar(req.params.id, personelIds);
      res.status(201).json({ ok: true });
    } catch {
      res.status(400).json({ error: "Katılımcı eklenemedi" });
    }
  });

  app.delete("/api/egitimler/:id/katilimcilar/:personelId", async (req, res) => {
    try {
      await storage.removeEgitimKatilimci(req.params.id, req.params.personelId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Katılımcı çıkarılamadı" });
    }
  });

  app.get("/api/egitimler/:id/degerlendirmeler", async (req, res) => {
    try {
      res.json(await storage.getEgitimDegerlendirmeleri(req.params.id));
    } catch {
      res.status(500).json({ error: "Değerlendirmeler alınamadı" });
    }
  });

  // Değerlendirme Şablonu
  app.get("/api/degerlendirme-sorulari", async (_req, res) => {
    try {
      res.json(await storage.getDegerlendirmeSorulari());
    } catch {
      res.status(500).json({ error: "Sorular alınamadı" });
    }
  });

  app.post("/api/degerlendirme-sorulari", async (req, res) => {
    try {
      res.status(201).json(await storage.createDegerlendirmeSoru(req.body));
    } catch {
      res.status(400).json({ error: "Soru oluşturulamadı" });
    }
  });

  app.put("/api/degerlendirme-sorulari/:id", async (req, res) => {
    try {
      res.json(await storage.updateDegerlendirmeSoru(req.params.id, req.body));
    } catch {
      res.status(400).json({ error: "Soru güncellenemedi" });
    }
  });

  app.delete("/api/degerlendirme-sorulari/:id", async (req, res) => {
    try {
      await storage.deleteDegerlendirmeSoru(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Soru silinemedi" });
    }
  });

  // Public: Eğitim Değerlendirme (no auth required - already public by default in Express)
  app.get("/api/egitim-degerlendirme/:id", async (req, res) => {
    try {
      const result = await storage.getEgitimForDegerlendirme(req.params.id);
      if (!result) return res.status(404).json({ error: "Eğitim bulunamadı" });
      res.json(result);
    } catch {
      res.status(500).json({ error: "Eğitim bilgisi alınamadı" });
    }
  });

  app.post("/api/egitim-degerlendirme", async (req, res) => {
    try {
      await storage.createEgitimDegerlendirme(req.body);
      res.status(201).json({ ok: true });
    } catch {
      res.status(400).json({ error: "Değerlendirme kaydedilemedi" });
    }
  });

  // ─── Tedarikçi Değerlendirme ────────────────────────────────────────────

  app.get("/api/tedarikcilar", async (_req, res) => {
    const list = await storage.getTedarikcilar();
    res.json(list);
  });

  app.post("/api/tedarikcilar", async (req, res) => {
    const tedarikci = await storage.createTedarikci(req.body);
    res.json(tedarikci);
  });

  app.put("/api/tedarikcilar/:id", async (req, res) => {
    const tedarikci = await storage.updateTedarikci(req.params.id, req.body);
    if (!tedarikci) return res.status(404).json({ error: "Bulunamadı" });
    res.json(tedarikci);
  });

  app.delete("/api/tedarikcilar/:id", async (req, res) => {
    await storage.deleteTedarikci(req.params.id);
    res.json({ ok: true });
  });

  app.get("/api/tedarikcilar/:id/degerlendirmeler", async (req, res) => {
    const list = await storage.getTedarikciDegerlendirmeleri(req.params.id);
    res.json(list);
  });

  app.post("/api/tedarikcilar/:id/degerlendirmeler", async (req, res) => {
    await storage.createTedarikciDegerlendirme({ tedarikciId: req.params.id, ...req.body });
    res.json({ ok: true });
  });

  app.get("/api/tedarikcilar/:id/degerlendirmeler/:degerlendirmeId", async (req, res) => {
    const result = await storage.getTedarikciDegerlendirme(req.params.id, req.params.degerlendirmeId);
    if (!result) return res.status(404).json({ error: "Bulunamadı" });
    res.json(result);
  });

  app.delete("/api/tedarikcilar/:id/degerlendirmeler/:degerlendirmeId", async (req, res) => {
    await storage.deleteTedarikciDegerlendirme(req.params.id, req.params.degerlendirmeId);
    res.json({ ok: true });
  });

  app.get("/api/tedarikci-degerlendirme-kriterleri", async (_req, res) => {
    const list = await storage.getTedarikciKriterleri();
    res.json(list);
  });

  app.post("/api/tedarikci-degerlendirme-kriterleri", async (req, res) => {
    const kriter = await storage.createTedarikciKriter(req.body);
    res.json(kriter);
  });

  app.put("/api/tedarikci-degerlendirme-kriterleri/:id", async (req, res) => {
    const kriter = await storage.updateTedarikciKriter(req.params.id, req.body);
    if (!kriter) return res.status(404).json({ error: "Bulunamadı" });
    res.json(kriter);
  });

  app.delete("/api/tedarikci-degerlendirme-kriterleri/:id", async (req, res) => {
    await storage.deleteTedarikciKriter(req.params.id);
    res.json({ ok: true });
  });

  // ─── Yönetim Gözden Geçirme ─────────────────────────────────────────────

  app.get("/api/yonetim-toplantilari", async (_req, res) => {
    const list = await storage.getToplantılar();
    res.json(list);
  });

  app.get("/api/yonetim-toplantilari/:id", async (req, res) => {
    const toplantı = await storage.getToplantı(req.params.id);
    if (!toplantı) return res.status(404).json({ error: "Bulunamadı" });
    res.json(toplantı);
  });

  app.post("/api/yonetim-toplantilari", async (req, res) => {
    const toplantı = await storage.createToplantı(req.body);
    res.json(toplantı);
  });

  app.put("/api/yonetim-toplantilari/:id", async (req, res) => {
    const toplantı = await storage.updateToplantı(req.params.id, req.body);
    if (!toplantı) return res.status(404).json({ error: "Bulunamadı" });
    res.json(toplantı);
  });

  app.delete("/api/yonetim-toplantilari/:id", async (req, res) => {
    await storage.deleteToplantı(req.params.id);
    res.json({ ok: true });
  });

  app.get("/api/yonetim-aksiyonlar", async (_req, res) => {
    const list = await storage.getAksiyonlar();
    res.json(list);
  });

  app.post("/api/yonetim-aksiyonlar", async (req, res) => {
    const aksiyon = await storage.createAksiyon(req.body);
    res.json(aksiyon);
  });

  app.put("/api/yonetim-aksiyonlar/:id", async (req, res) => {
    const aksiyon = await storage.updateAksiyon(req.params.id, req.body);
    if (!aksiyon) return res.status(404).json({ error: "Bulunamadı" });
    res.json(aksiyon);
  });

  app.delete("/api/yonetim-aksiyonlar/:id", async (req, res) => {
    await storage.deleteAksiyon(req.params.id);
    res.json({ ok: true });
  });

  // ==================== ÖDEMELER PORTALI: YÖNETİM ====================

  // Beyanname Excel yükleme — DOSYA NO ile upsert (yönetim paneli)
  app.post("/api/odemeler/beyanname-excel", uploadBeyannameMemory.single("dosya"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Dosya gerekli" });
      // Bu uc da YALNIZ ithalat raporunu alir (yonetim panelinden elle yukleme).
      const { rows } = parseBeyannameWorkbook(req.file.buffer);
      if (!rows.length) return res.status(400).json({ error: "Excel'de veri satırı bulunamadı" });
      const sonuc = await storage.upsertBeyannameler(rows);
      const eslesmeyen = await storage.getEslesmeyenBeyannameKullanicilari();
      res.json({ toplam: rows.length, ...sonuc, eslesmeyen });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ==================== ÖDEMELER PORTALI: OTURUM ====================

  // Oturumdaki AKTİF kullanıcıyı yükler; yoksa null.
  // Rol/kimlik daima sunucudan okunur — istemci parametresine güvenilmez.
  async function portalKullanici(req: Request): Promise<PortalKullanici | null> {
    if (!req.session.portalUserId) return null;
    const k = await storage.getPortalKullanici(req.session.portalUserId);
    return k && k.aktif ? k : null;
  }

  // Yerel tarih YYYY-MM-DD (saklama formatı)
  function bugunYmd(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // Tutar ayrıştırma: "1.500,50" | "1500,50" | "1500.50" → 1500.5; geçersiz → null.
  // Hem nokta hem virgül varsa nokta binlik ayracı sayılır.
  function parseTutar(v: unknown): number | null {
    let s = String(v ?? "").trim();
    if (!s) return null;
    if (s.includes(".") && s.includes(",")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      // "1.500" / "12.500.000" — yalnız nokta, 3'lü gruplar: binlik ayracı
      s = s.replace(/\./g, "");
    } else {
      s = s.replace(",", ".");
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function sanitizePortalKullanici(k: PortalKullanici) {
    const { sifreHash, ...rest } = k;
    return rest;
  }

  app.post("/api/portal/login", async (req, res) => {
    try {
      const { kullaniciAdi, sifre } = req.body || {};
      if (!kullaniciAdi || !sifre) {
        return res.status(400).json({ error: "Kullanıcı adı ve şifre gerekli" });
      }
      const k = await storage.getPortalKullaniciByKullaniciAdi(String(kullaniciAdi).trim());
      if (!k || !(await dogrulaSifre(String(sifre), k.sifreHash))) {
        return res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı" });
      }
      if (!k.aktif) return res.status(401).json({ error: "Hesap kapalı" });
      req.session.portalUserId = k.id;
      req.session.portalRol = k.rol;
      // Oturum store'a yazılmadan yanıt dönmesin — hemen ardından gelen
      // /api/portal/me isteğinin oturumu bulamaması yarışını önler.
      req.session.save((err) => {
        if (err) return res.status(500).json({ error: "Oturum kaydedilemedi" });
        res.json({ id: k.id, adSoyad: k.adSoyad, rol: k.rol, avAdi: k.avAdi });
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/portal/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/portal/me", requirePortal, async (req, res) => {
    try {
      const k = await portalKullanici(req);
      if (!k) return res.status(401).json({ error: "Giriş gerekli" });
      res.json({ id: k.id, adSoyad: k.adSoyad, rol: k.rol, avAdi: k.avAdi });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==================== ÖDEMELER PORTALI: KULLANICI YÖNETİMİ (yönetim paneli) ====================

  app.get("/api/odemeler/kullanicilar", async (_req, res) => {
    try {
      const liste = await storage.getPortalKullanicilar();
      res.json(liste.map(sanitizePortalKullanici));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/odemeler/kullanicilar", async (req, res) => {
    try {
      const { sifre, ...alanlar } = req.body || {};
      if (!sifre || String(sifre).length < 4) {
        return res.status(400).json({ error: "Şifre en az 4 karakter olmalı" });
      }
      const parsed = insertPortalKullaniciSchema.omit({ sifreHash: true }).parse(alanlar);
      if (!["temsilci", "muhasebe", "operasyon"].includes(parsed.rol)) {
        return res.status(400).json({ error: "Geçersiz rol" });
      }
      if (parsed.rol === "operasyon" && !String(parsed.sube ?? "").trim()) {
        return res.status(400).json({ error: "Operasyon kullanıcısı için şube zorunlu" });
      }
      const mevcut = await storage.getPortalKullaniciByKullaniciAdi(parsed.kullaniciAdi);
      if (mevcut) return res.status(400).json({ error: "Bu kullanıcı adı zaten var" });
      const k = await storage.createPortalKullanici({
        ...parsed,
        avAdi: parsed.avAdi ? parsed.avAdi.trim() : null,
        sube: parsed.rol === "operasyon" ? String(parsed.sube).trim() : null,
        sifreHash: await hashSifre(String(sifre)),
      });
      res.json(sanitizePortalKullanici(k));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/odemeler/kullanicilar/:id", async (req, res) => {
    try {
      // Alan beyaz listesi — sifreHash dışarıdan yazılamaz
      const izinli: Partial<InsertPortalKullanici> = {};
      if (typeof req.body?.adSoyad === "string" && req.body.adSoyad.trim()) {
        izinli.adSoyad = req.body.adSoyad.trim();
      }
      if (["temsilci", "muhasebe", "operasyon"].includes(req.body?.rol)) izinli.rol = req.body.rol;
      if (req.body?.avAdi !== undefined) {
        izinli.avAdi = req.body.avAdi ? String(req.body.avAdi).trim() : null;
      }
      if (typeof req.body?.aktif === "boolean") izinli.aktif = req.body.aktif;
      // Şube — beyaz listeye AÇIKÇA eklenmezse sessizce düşer.
      if (req.body?.sube !== undefined) {
        izinli.sube = req.body.sube ? String(req.body.sube).trim() : null;
      }
      // ETKİN rol/şube MEVCUT kayıttan tamamlanır: kısmi PUT (yalnız rol veya yalnız sube)
      // gönderildiğinde de invariant korunur — şube YALNIZ rol='operasyon' iken tutulur.
      if (izinli.rol !== undefined || izinli.sube !== undefined) {
        const mevcut = await storage.getPortalKullanici(req.params.id);
        if (!mevcut) return res.status(404).json({ error: "Bulunamadı" });
        const etkinRol = izinli.rol ?? mevcut.rol;
        const etkinSube = izinli.sube !== undefined ? izinli.sube : mevcut.sube;
        if (etkinRol !== "operasyon") {
          izinli.sube = null;
        } else if (!String(etkinSube ?? "").trim()) {
          return res.status(400).json({ error: "Operasyon kullanıcısı için şube zorunlu" });
        }
      }
      if (req.body?.sifre) {
        if (String(req.body.sifre).length < 4) {
          return res.status(400).json({ error: "Şifre en az 4 karakter olmalı" });
        }
        izinli.sifreHash = await hashSifre(String(req.body.sifre));
      }
      const k = await storage.updatePortalKullanici(req.params.id, izinli);
      if (!k) return res.status(404).json({ error: "Bulunamadı" });
      res.json(sanitizePortalKullanici(k));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ==================== ÖDEMELER PORTALI: VERİ ====================

  app.get("/api/portal/beyannameler", requirePortal, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      // Filtre SUNUCUDA: temsilci yalnız kendi (avAdi) beyannamelerini görür.
      // avAdi atanmamış temsilci hiçbir şey görmez (boş string hiçbir kullaniciyla eşleşmez).
      // Muhasebe ve operasyon (şube) TÜM beyannameleri görür (spec: şube tüm dosyalara ödeme yapabilir).
      const liste = ben.rol === "muhasebe" || ben.rol === "operasyon"
        ? await storage.getBeyannameler()
        : await storage.getBeyannameler(ben.avAdi ?? "");
      res.json(liste);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/portal/masraf-turleri", requirePortal, async (_req, res) => {
    try {
      res.json(await storage.getMasrafTurleri(true));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Portal kullanıcısı yeni masraf türü ekleyebilir (paylaşılan liste); çift kayıt açmaz.
  app.post("/api/portal/masraf-turleri", requirePortal, async (req, res) => {
    try {
      const ad = String(req.body?.ad ?? "").trim();
      if (!ad) return res.status(400).json({ error: "Tür adı zorunlu" });
      const norm = (s: string) => s.trim().toLocaleLowerCase("tr");
      const mevcutlar = await storage.getMasrafTurleri();
      const mevcut = mevcutlar.find((t) => norm(t.ad) === norm(ad));
      if (mevcut) return res.json(mevcut); // aynı ad → yeni kayıt AÇMA, mevcudu döndür
      const yeni = await storage.createMasrafTuru({ ad, sira: 0, aktif: true });
      res.json(yeni);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Manuel transit ekleme — TR beyannameleri otomatik gelmiyor, masrafi giren elle ekler.
  // Mukerrer beyan_no: mevcut transit doner (hata degil).
  app.post("/api/portal/transit", requirePortal, async (req, res) => {
    try {
      const beyanNo = String(req.body?.beyanNo ?? "").trim();
      const alici = String(req.body?.alici ?? "").trim();
      const gumrukIdaresi = String(req.body?.gumrukIdaresi ?? "").trim() || null;
      if (!beyanNo || !alici) return res.status(400).json({ error: "Beyanname no ve firma zorunlu" });
      const transit = await storage.createManuelTransit({ beyanNo, alici, gumrukIdaresi });
      res.json(transit);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Kayıtlı ödeme şirketleri — alacaklı alanı öneri listesi (depo onaylarından birikir)
  app.get("/api/portal/odeme-sirketleri", requirePortal, async (_req, res) => {
    try {
      res.json(await storage.getOdemeSirketleri());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Yönetim tablosu — tüm firmalar (aktif+pasif), ad sıralı
  app.get("/api/portal/odeme-sirketleri/tumu", requireMuhasebe, async (_req, res) => {
    try {
      res.json(await storage.getOdemeSirketleriTumu());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Elle firma ekleme
  app.post("/api/portal/odeme-sirketleri", requireMuhasebe, async (req, res) => {
    try {
      // ibanlar: yeni F1.11 gövdesi. iban/ibanTry/ibanUsd/banka: eski F1.10 frontend'i —
      // storage köprüsü (legacyIbanlar) bunları çocuk satıra çevirir (kısmi deploy'da IBAN düşmesin).
      const { ad, iban, ibanTry, ibanUsd, banka, vergiNo, notlar, ibanlar } = req.body || {};
      if (!String(ad ?? "").trim()) return res.status(400).json({ error: "Firma adı zorunlu" });
      const yeni = await storage.createOdemeSirketi({
        ad: String(ad), iban, ibanTry, ibanUsd, banka, vergiNo, notlar,
        ibanlar: Array.isArray(ibanlar) ? ibanlar : undefined,
      });
      if (!yeni) return res.status(409).json({ error: "Bu firma zaten kayıtlı" });
      res.json(yeni);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Firma güncelleme (IBAN tamamlama + aktif/pasif)
  app.put("/api/portal/odeme-sirketleri/:id", requireMuhasebe, async (req, res) => {
    try {
      const { ad, iban, ibanTry, ibanUsd, banka, vergiNo, notlar, aktif, ibanlar } = req.body || {};
      const data: any = {};
      if (ad !== undefined) data.ad = String(ad);
      if (iban !== undefined) data.iban = iban;
      if (ibanTry !== undefined) data.ibanTry = ibanTry;
      if (ibanUsd !== undefined) data.ibanUsd = ibanUsd;
      if (banka !== undefined) data.banka = banka;
      if (vergiNo !== undefined) data.vergiNo = vergiNo;
      if (notlar !== undefined) data.notlar = notlar;
      if (aktif !== undefined) data.aktif = aktif === true || aktif === "true";
      if (Array.isArray(ibanlar)) data.ibanlar = ibanlar;
      const guncel = await storage.updateOdemeSirketi(req.params.id, data);
      if (!guncel) return res.status(404).json({ error: "Bulunamadı" });
      res.json(guncel);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Excel içe aktarım — her IBAN bir satır: Firma Adı | Para Birimi | IBAN | Etiket | Vergi/TC No | Not
  app.post("/api/portal/odeme-sirketleri/excel", requireMuhasebe, uploadOdemeSirketExcel.single("excel"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Dosya yüklenmedi" });
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[];
      // İlk satır başlık — atla. A:Ad B:Para Birimi C:IBAN D:Etiket E:VergiNo F:Not
      const rows = rawData.slice(1).map((r) => ({
        ad: String(r[0] ?? "").trim(),
        paraBirimi: String(r[1] ?? "").trim(),
        iban: String(r[2] ?? "").trim(),
        etiket: r[3] != null ? String(r[3]).trim() : null,
        vergiNo: r[4] != null ? String(r[4]).trim() : null,
        notlar: r[5] != null ? String(r[5]).trim() : null,
      })).filter((r) => r.ad);
      const sonuc = await storage.bulkUpsertFirmaIbanRows(rows);
      res.json(sonuc);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Excel şablonu indir (doğru başlıklar + örnek satırlar)
  app.get("/api/portal/odeme-sirketleri/sablon", requireMuhasebe, async (_req, res) => {
    try {
      const buf = await storage.firmaIbanlariExcelSablonu();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="odeme-firmalari-sablon.xlsx"');
      res.end(buf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post(
    "/api/portal/talepler",
    requirePortal,
    uploadOdemeBelge.fields([
      { name: "belgeler", maxCount: 10 },
      { name: "konsimento", maxCount: 1 },
    ]),
    async (req, res) => {
    const dosyaGruplari = req.files as Record<string, Express.Multer.File[]> | undefined;
    const yuklenenDosyalar = dosyaGruplari?.belgeler ?? [];
    const konsimentoDosyasi = dosyaGruplari?.konsimento?.[0];
    const yuklenenleriSil = () => {
      for (const f of [...yuklenenDosyalar, ...(konsimentoDosyasi ? [konsimentoDosyasi] : [])]) {
        fs.unlink(f.path, () => {});
      }
    };
    try {
      const ben = await portalKullanici(req);
      if (!ben) {
        yuklenenleriSil();
        return res.status(401).json({ error: "Giriş gerekli" });
      }
      const { beyannameId, odemeTipi, masrafTuru, tutar, paraBirimi, alacakli, iban, aciklama, konsimentoNo, tasiyici } = req.body || {};

      // Beyanname OPSİYONEL: dosya henüz açılmamışsa "dosyasız talep" gönderilir,
      // ödeme sonrası temsilci eşleştirir. Dosyasızsa açıklama zorunlu (muhasebe işi tanısın).
      const beyannameIdStr = String(beyannameId ?? "").trim();
      let beyanname: Beyanname | undefined;
      if (beyannameIdStr) {
        beyanname = await storage.getBeyanname(beyannameIdStr);
        if (!beyanname) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Beyanname bulunamadı" });
        }
        if (ben.rol === "temsilci" && beyanname.kullanici !== ben.avAdi) {
          yuklenenleriSil();
          return res.status(403).json({ error: "Bu beyanname size ait değil" });
        }
      } else if (!String(aciklama ?? "").trim()) {
        yuklenenleriSil();
        return res.status(400).json({ error: "Dosyasız talepte açıklama zorunlu" });
      }
      if (!["masraf", "depo_teminat"].includes(String(odemeTipi))) {
        yuklenenleriSil();
        return res.status(400).json({ error: "Geçersiz ödeme tipi" });
      }
      const tutarNum = parseTutar(tutar);
      if (tutarNum == null || tutarNum <= 0) {
        yuklenenleriSil();
        return res.status(400).json({ error: "Geçersiz tutar" });
      }
      const alacakliStr = String(alacakli ?? "").trim();
      if (!alacakliStr) {
        yuklenenleriSil();
        return res.status(400).json({ error: "Alacaklı (kime ödenecek) zorunlu" });
      }
      // Depo teminatında masraf türü sabittir; masrafta listeden gelir.
      const masrafTuruStr = odemeTipi === "depo_teminat" ? "Depo Teminatı" : String(masrafTuru ?? "").trim();
      if (!masrafTuruStr) {
        yuklenenleriSil();
        return res.status(400).json({ error: "Masraf türü zorunlu" });
      }

      // Depo teminatında konşimento dosyası ve numarası ZORUNLU (Faz 1.6 iş kuralı)
      const konsimentoNoStr = String(konsimentoNo ?? "").trim();
      if (odemeTipi === "depo_teminat") {
        if (!konsimentoDosyasi) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Depo teminatında konşimento zorunlu" });
        }
        if (!konsimentoNoStr) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Konşimento numarası zorunlu" });
        }
      }

      const talep = await storage.createOdemeTalep({
        beyannameId: beyanname?.id ?? null,
        talepEdenId: ben.id,
        odemeTipi: String(odemeTipi),
        masrafTuru: masrafTuruStr,
        tutar: String(tutarNum),
        paraBirimi: ["TRY", "USD", "EUR"].includes(String(paraBirimi)) ? String(paraBirimi) : "TRY",
        alacakli: alacakliStr,
        iban: iban ? String(iban).trim() : null,
        aciklama: aciklama ? String(aciklama) : null,
        durum: "bekliyor",
        talepTarihi: bugunYmd(),
        konsimentoNo: odemeTipi === "depo_teminat" ? konsimentoNoStr : null,
        tasiyici: odemeTipi === "depo_teminat" && String(tasiyici ?? "").trim() ? String(tasiyici).trim() : null,
        iadeDurumu: odemeTipi === "depo_teminat" ? "beklemede" : null,
      });

      for (const f of yuklenenDosyalar) {
        await storage.createOdemeBelge({
          talepId: talep.id,
          belgeTipi: "fatura",
          filename: fixUploadFilename(f.originalname),
          filepath: f.path.replace(/\\/g, "/"),
          yukleyenId: ben.id,
        });
      }
      if (konsimentoDosyasi) {
        await storage.createOdemeBelge({
          talepId: talep.id,
          belgeTipi: "konsimento",
          filename: fixUploadFilename(konsimentoDosyasi.originalname),
          filepath: konsimentoDosyasi.path.replace(/\\/g, "/"),
          yukleyenId: ben.id,
        });
      }
      // Girilen alacaklıyı firma listesine kaydet (best-effort — talebi bozmaz)
      storage.upsertOdemeSirketi(alacakliStr, {
        iban: iban ? String(iban).trim() : null,
        paraBirimi: ["TRY", "USD", "EUR"].includes(String(paraBirimi)) ? String(paraBirimi) : "TRY",
        kaynak: odemeTipi === "depo_teminat" ? "depo" : "temsilci",
      }).catch((e) => console.warn(`[odeme-sirketleri] upsert hatası: ${e.message}`));
      res.json(talep);
    } catch (e: any) {
      yuklenenleriSil();
      res.status(400).json({ error: e.message });
    }
  },
  );

  app.get("/api/portal/talepler", requirePortal, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const filtre = ben.rol === "muhasebe" ? {} : { talepEdenId: ben.id };
      res.json(await storage.getOdemeTalepleri(filtre));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post(
    "/api/portal/talepler/:id/odeme",
    requireMuhasebe,
    uploadOdemeBelge.fields([
      { name: "dekont", maxCount: 1 },
      { name: "konsimento", maxCount: 1 },
    ]),
    async (req, res) => {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const yuklenenleriSil = () => {
        for (const f of [...(files?.dekont ?? []), ...(files?.konsimento ?? [])]) fs.unlink(f.path, () => {});
      };
      try {
        const ben = await portalKullanici(req);
        if (!ben) {
          yuklenenleriSil();
          return res.status(401).json({ error: "Giriş gerekli" });
        }
        const talep = await storage.getOdemeTalep(req.params.id);
        if (!talep) {
          yuklenenleriSil();
          return res.status(404).json({ error: "Bulunamadı" });
        }
        if (talep.durum === "odendi") {
          yuklenenleriSil();
          return res.status(400).json({ error: "Talep zaten ödendi" });
        }

        const dekont = files?.dekont?.[0];
        if (!dekont) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Dekont dosyası zorunlu" });
        }

        await storage.createOdemeBelge({
          talepId: talep.id,
          belgeTipi: "dekont",
          filename: fixUploadFilename(dekont.originalname),
          filepath: dekont.path.replace(/\\/g, "/"),
          yukleyenId: ben.id,
        });
        const konsimento = files?.konsimento?.[0];
        if (konsimento) {
          await storage.createOdemeBelge({
            talepId: talep.id,
            belgeTipi: "konsimento",
            filename: fixUploadFilename(konsimento.originalname),
            filepath: konsimento.path.replace(/\\/g, "/"),
            yukleyenId: ben.id,
          });
        }
        const guncel = await storage.updateOdemeTalep(talep.id, {
          durum: "odendi",
          odemeTarihi: bugunYmd(),
          odeyenId: ben.id,
        });
        res.json(guncel);
      } catch (e: any) {
        yuklenenleriSil();
        res.status(400).json({ error: e.message });
      }
    },
  );

  app.put("/api/portal/talepler/:id/iade", requireMuhasebe, async (req, res) => {
    try {
      const talep = await storage.getOdemeTalep(req.params.id);
      if (!talep) return res.status(404).json({ error: "Bulunamadı" });
      if (talep.odemeTipi !== "depo_teminat") {
        return res.status(400).json({ error: "Yalnız depo teminatları iade takibindedir" });
      }
      const { iadeDurumu, iadeTutari, iadeTarihi, iadeNotu } = req.body || {};
      if (!["beklemede", "iade_edildi"].includes(String(iadeDurumu))) {
        return res.status(400).json({ error: "Geçersiz iade durumu" });
      }
      const guncel = await storage.updateOdemeTalep(talep.id, {
        iadeDurumu: String(iadeDurumu),
        iadeTutari: (() => {
          if (iadeTutari == null || String(iadeTutari).trim() === "") return null;
          const n = parseTutar(iadeTutari);
          return n != null && n >= 0 ? String(n) : null;
        })(),
        iadeTarihi: iadeTarihi ? String(iadeTarihi) : null,
        iadeNotu: iadeNotu ? String(iadeNotu) : null,
      });
      if (!guncel) return res.status(404).json({ error: "Bulunamadı" });
      res.json(guncel);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Dosyasız talebe sonradan beyanname eşleştirme (talep sahibi veya muhasebe)
  app.put("/api/portal/talepler/:id/beyanname", requirePortal, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const talep = await storage.getOdemeTalep(req.params.id);
      if (!talep) return res.status(404).json({ error: "Bulunamadı" });
      if (ben.rol !== "muhasebe" && talep.talepEdenId !== ben.id) {
        return res.status(403).json({ error: "Yetkisiz" });
      }
      if (talep.beyannameId) {
        return res.status(400).json({ error: "Talep zaten bir beyannameyle eşleşmiş" });
      }
      const beyanname = await storage.getBeyanname(String(req.body?.beyannameId ?? ""));
      if (!beyanname) return res.status(400).json({ error: "Beyanname bulunamadı" });
      if (ben.rol === "temsilci" && beyanname.kullanici !== ben.avAdi) {
        return res.status(403).json({ error: "Bu beyanname size ait değil" });
      }
      const guncel = await storage.updateOdemeTalep(talep.id, { beyannameId: beyanname.id });
      if (!guncel) return res.status(404).json({ error: "Bulunamadı" });
      res.json(guncel);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Konşimento PDF analizi — Claude ile konşimento no / taşıyıcı / TR acentesi çıkarımı.
  // Sonuç her zaman kullanıcı onayından geçer; hata durumunda istemci elle girişe düşer.
  app.post(
    "/api/portal/konsimento-analiz",
    requirePortal,
    (req, res, next) => {
      uploadKonsimentoMemory.single("konsimento")(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
      });
    },
    async (req, res) => {
      try {
        if (!analizYapilandirildiMi()) {
          return res.status(503).json({ error: "Analiz servisi yapılandırılmamış" });
        }
        if (!req.file) return res.status(400).json({ error: "Konşimento dosyası gerekli" });
        const sonuc = await konsimentoAnalizEt(req.file.buffer);
        res.json({
          konsimentoNo: sonuc.konsimentoNo,
          tasiyici: sonuc.tasiyici,
          acenteAdi: sonuc.turkiyeAcentesi?.ad ?? null,
          acenteAdres: sonuc.turkiyeAcentesi?.adres ?? null,
          acenteBulundu: sonuc.turkiyeAcentesi != null,
          acenteKaynagi: sonuc.acenteKaynagi,
        });
      } catch (e: any) {
        console.warn(`[konsimento-analiz] hata: ${e.message}`);
        res.status(502).json({ error: "Analiz yapılamadı — bilgileri elle girin" });
      }
    },
  );

  // Muhasebe: talepsiz DOĞRUDAN ödeme kaydı — tek adımda "odendi" oluşur.
  // Dekont zorunlu; beyanname opsiyonel (muhasebe tüm listeyi görür, avAdi kontrolü yok);
  // beyannamesizse açıklama zorunlu (temsilci dosyasız talep kuralıyla aynı).
  app.post(
    "/api/portal/dogrudan-odeme",
    requireMuhasebe,
    uploadOdemeBelge.fields([
      { name: "dekont", maxCount: 1 },
      { name: "konsimento", maxCount: 1 },
    ]),
    async (req, res) => {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const yuklenenleriSil = () => {
        for (const f of [...(files?.dekont ?? []), ...(files?.konsimento ?? [])]) {
          fs.unlink(f.path, () => {});
        }
      };
      try {
        const ben = await portalKullanici(req);
        if (!ben) {
          yuklenenleriSil();
          return res.status(401).json({ error: "Giriş gerekli" });
        }
        const { beyannameId, odemeTipi, masrafTuru, tutar, paraBirimi, alacakli, iban, aciklama, konsimentoNo, tasiyici } =
          req.body || {};

        const beyannameIdStr = String(beyannameId ?? "").trim();
        let beyanname: Beyanname | undefined;
        if (beyannameIdStr) {
          beyanname = await storage.getBeyanname(beyannameIdStr);
          if (!beyanname) {
            yuklenenleriSil();
            return res.status(400).json({ error: "Beyanname bulunamadı" });
          }
        } else if (!String(aciklama ?? "").trim()) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Dosyasız talepte açıklama zorunlu" });
        }
        if (!["masraf", "depo_teminat"].includes(String(odemeTipi))) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Geçersiz ödeme tipi" });
        }
        const tutarNum = parseTutar(tutar);
        if (tutarNum == null || tutarNum <= 0) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Geçersiz tutar" });
        }
        const alacakliStr = String(alacakli ?? "").trim();
        if (!alacakliStr) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Alacaklı (kime ödenecek) zorunlu" });
        }
        const masrafTuruStr =
          odemeTipi === "depo_teminat" ? "Depo Teminatı" : String(masrafTuru ?? "").trim();
        if (!masrafTuruStr) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Masraf türü zorunlu" });
        }
        const konsimentoNoStr = String(konsimentoNo ?? "").trim();
        const konsimento = files?.konsimento?.[0];
        if (odemeTipi === "depo_teminat") {
          if (!konsimento) {
            yuklenenleriSil();
            return res.status(400).json({ error: "Depo teminatında konşimento zorunlu" });
          }
          if (!konsimentoNoStr) {
            yuklenenleriSil();
            return res.status(400).json({ error: "Konşimento numarası zorunlu" });
          }
        }
        const dekont = files?.dekont?.[0];
        if (!dekont) {
          yuklenenleriSil();
          return res.status(400).json({ error: "Dekont dosyası zorunlu" });
        }

        const bugun = bugunYmd();
        // BİLİNEN RİSK (Faz 2'de db.transaction ile çözülecek): talep "odendi" olarak
        // önce yazılır; ardından dekont belgesi eklenir. Aradaki nadir bir DB hatası
        // dekontsuz "odendi" kaydı bırakabilir (belge FK talepId gerektirdiğinden
        // sıralama tersine çevrilemez).
        const talep = await storage.createOdemeTalep({
          beyannameId: beyanname?.id ?? null,
          talepEdenId: ben.id,
          odemeTipi: String(odemeTipi),
          masrafTuru: masrafTuruStr,
          tutar: String(tutarNum),
          paraBirimi: ["TRY", "USD", "EUR"].includes(String(paraBirimi)) ? String(paraBirimi) : "TRY",
          alacakli: alacakliStr,
          iban: iban ? String(iban).trim() : null,
          aciklama: aciklama ? String(aciklama) : null,
          durum: "odendi",
          talepTarihi: bugun,
          odemeTarihi: bugun,
          odeyenId: ben.id,
          konsimentoNo: odemeTipi === "depo_teminat" ? konsimentoNoStr : null,
          tasiyici: odemeTipi === "depo_teminat" && String(tasiyici ?? "").trim() ? String(tasiyici).trim() : null,
          iadeDurumu: odemeTipi === "depo_teminat" ? "beklemede" : null,
        });
        await storage.createOdemeBelge({
          talepId: talep.id,
          belgeTipi: "dekont",
          filename: fixUploadFilename(dekont.originalname),
          filepath: dekont.path.replace(/\\/g, "/"),
          yukleyenId: ben.id,
        });
        if (konsimento) {
          await storage.createOdemeBelge({
            talepId: talep.id,
            belgeTipi: "konsimento",
            filename: fixUploadFilename(konsimento.originalname),
            filepath: konsimento.path.replace(/\\/g, "/"),
            yukleyenId: ben.id,
          });
        }
        // Girilen alacaklıyı firma listesine kaydet (best-effort — kaydı bozmaz)
        storage.upsertOdemeSirketi(alacakliStr, {
          iban: iban ? String(iban).trim() : null,
          paraBirimi: ["TRY", "USD", "EUR"].includes(String(paraBirimi)) ? String(paraBirimi) : "TRY",
          kaynak: "muhasebe",
        }).catch((e) => console.warn(`[odeme-sirketleri] upsert hatası: ${e.message}`));
        res.json(talep);
      } catch (e: any) {
        yuklenenleriSil();
        res.status(400).json({ error: e.message });
      }
    },
  );

  // ---- OPERASYON (kasa sahibi) ----
  app.get("/api/portal/operasyon/ozet", requireOperasyon, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const bakiye = await storage.getOperasyonBakiye(ben.id);
      const { avanslar, masraflar } = await storage.getAcikHareketler(ben.id);
      const sonDevir = await storage.getSonKapanis(ben.id);
      res.json({ bakiye, avanslar, masraflar, sonDevir });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/portal/operasyon/masraf", requireOperasyon, uploadOperasyonBelge.single("belge"), async (req, res) => {
    const belge = req.file;
    const sil = () => { if (belge) fs.promises.unlink(belge.path).catch(() => {}); };
    try {
      const ben = await portalKullanici(req);
      if (!ben) { sil(); return res.status(401).json({ error: "Giriş gerekli" }); }
      const { beyannameId, dosyaYok, masrafTuru, tutar, alacakli, iban, aciklama } = req.body || {};
      const dosyaYokB = dosyaYok === "true" || dosyaYok === true;
      const tutarNum = parseTutar(tutar);
      // Belge zorunluluğu masraf TÜRÜNE bağlı. Bayrağı SUNUCU okur — istemciye güvenilmez.
      // Tür boş veya bulunamadıysa GÜVENLİ varsayılan: belge zorunlu.
      const turAdi = String(masrafTuru ?? "").trim();
      const tur = turAdi ? await storage.getMasrafTuruByAd(turAdi) : undefined;
      const belgeZorunlu = tur ? tur.belgeZorunlu : true;
      if (belgeZorunlu && !belge) return res.status(400).json({ error: "Belge (fiş/fatura) zorunlu" });
      if (tutarNum === null || tutarNum <= 0) { sil(); return res.status(400).json({ error: "Geçerli tutar girin" }); }
      if (!String(alacakli ?? "").trim()) { sil(); return res.status(400).json({ error: "Alacaklı zorunlu" }); }
      if (dosyaYokB && !String(aciklama ?? "").trim()) { sil(); return res.status(400).json({ error: "Dosyasız kayıtta açıklama zorunlu" }); }
      if (!dosyaYokB && !String(beyannameId ?? "").trim()) { sil(); return res.status(400).json({ error: "Beyanname seçin veya 'Dosya yok' işaretleyin" }); }
      const masraf = await storage.masrafKaydet({
        operasyonId: ben.id,
        beyannameId: dosyaYokB ? null : String(beyannameId),
        dosyaYok: dosyaYokB,
        masrafTuru: masrafTuru ? String(masrafTuru) : null,
        sube: ben.sube ?? null, // SNAPSHOT — istemciden GELMEZ, oturum sahibinden okunur
        tutar: tutarNum,
        alacakli: String(alacakli).trim(),
        iban: iban ? String(iban).trim() : null,
        aciklama: aciklama ? String(aciklama) : null,
        tarih: bugunYmd(),
        belgeDosya: belge ? belge.path.replace(/\\/g, "/") : null,
        belgeAdi: belge ? fixUploadFilename(belge.originalname) : null,
      });
      // Alacaklıyı firma listesine kaydet (best-effort — F1.x kalıbı)
      storage.upsertOdemeSirketi(String(alacakli).trim(), { iban: iban ? String(iban).trim() : null, kaynak: "operasyon" }).catch(() => {});
      res.json(masraf);
    } catch (e: any) { sil(); res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/portal/operasyon/masraf/:id", requireOperasyon, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const m = await storage.getOperasyonMasraf(req.params.id);
      if (!m || m.operasyonId !== ben.id) return res.status(404).json({ error: "Bulunamadı" });
      if (m.kapanisId) return res.status(409).json({ error: "Kapanmış gün — silinemez" });
      await storage.masrafSil(m.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/portal/operasyon/gunu-kapat", requireOperasyon, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const kapanis = await storage.gunuKapat(ben.id, bugunYmd());
      if (!kapanis) return res.status(400).json({ error: "Kapatılacak açık hareket yok" });
      res.json(kapanis);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/portal/operasyon/kapanislar", requireOperasyon, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      res.json(await storage.getKapanislar(ben.id));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ---- MUHASEBE: ŞUBE MASRAF (operasyon takip) ----
  app.get("/api/portal/operasyon-takip", requireMuhasebe, async (_req, res) => {
    try {
      const kullanicilar = await storage.getOperasyonKullanicilar();
      const bugun = bugunYmd();
      const sonuc = await Promise.all(kullanicilar.map(async (k) => {
        const bakiye = await storage.getOperasyonBakiye(k.id);
        const { masraflar } = await storage.getAcikHareketler(k.id);
        const bugunHarcanan = masraflar.filter((m) => m.tarih === bugun).reduce((s, m) => s + parseFloat(m.tutar), 0);
        return { id: k.id, adSoyad: k.adSoyad, kullaniciAdi: k.kullaniciAdi, sube: k.sube ?? null, bakiye, bugunHarcanan: Math.round(bugunHarcanan * 100) / 100 };
      }));
      res.json(sonuc);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Şube gider raporu — İKİ SEGMENTLİ yol (rapor/sube): tek segmentlik /:operasyonId ile çakışmaz.
  const raporAraligi = (req: any): { baslangic: string; bitis: string } | null => {
    const baslangic = String(req.query?.baslangic ?? "");
    const bitis = String(req.query?.bitis ?? "");
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (!ymd.test(baslangic) || !ymd.test(bitis)) return null;
    return { baslangic, bitis };
  };

  app.get("/api/portal/operasyon-takip/rapor/sube", requireMuhasebe, async (req, res) => {
    try {
      const aralik = raporAraligi(req);
      if (!aralik) return res.status(400).json({ error: "baslangic ve bitis YYYY-MM-DD olmalı" });
      res.json(await storage.getSubeGiderRaporu(aralik.baslangic, aralik.bitis));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/portal/operasyon-takip/rapor/sube/excel", requireMuhasebe, async (req, res) => {
    try {
      const aralik = raporAraligi(req);
      if (!aralik) return res.status(400).json({ error: "baslangic ve bitis YYYY-MM-DD olmalı" });
      const buf = await storage.subeGiderRaporuExcel(aralik.baslangic, aralik.bitis);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="sube-gider-${aralik.baslangic}_${aralik.bitis}.xlsx"`);
      res.end(buf);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/portal/operasyon-takip/:operasyonId", requireMuhasebe, async (req, res) => {
    try {
      const bakiye = await storage.getOperasyonBakiye(req.params.operasyonId);
      const acik = await storage.getAcikHareketler(req.params.operasyonId);
      const kapanislar = await storage.getKapanislar(req.params.operasyonId);
      res.json({ bakiye, acik, kapanislar });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/portal/operasyon-takip/:operasyonId/avans", requireMuhasebe, uploadOperasyonBelge.single("dekont"), async (req, res) => {
    const dekont = req.file; // OPSİYONEL — elden nakit avansta dekont olmayabilir
    const sil = () => { if (dekont) fs.promises.unlink(dekont.path).catch(() => {}); };
    try {
      const ben = await portalKullanici(req);
      if (!ben) { sil(); return res.status(401).json({ error: "Giriş gerekli" }); }
      const { tutar, aciklama, tarih } = req.body || {};
      const tutarNum = parseTutar(tutar);
      if (tutarNum === null || tutarNum <= 0) { sil(); return res.status(400).json({ error: "Geçerli tutar girin" }); }
      // Tarih opsiyonel — geriye dönük avans için. Verilmez/geçersizse bugün (YYYY-MM-DD doğrula).
      const avansTarih = typeof tarih === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tarih) ? tarih : bugunYmd();
      const avans = await storage.avansYukle({
        operasyonId: req.params.operasyonId, tutar: tutarNum,
        aciklama: aciklama ? String(aciklama) : null, tarih: avansTarih, gonderenId: ben.id,
        belgeDosya: dekont ? dekont.path.replace(/\\/g, "/") : null,
        belgeAdi: dekont ? fixUploadFilename(dekont.originalname) : null,
      });
      res.json(avans);
    } catch (e: any) { sil(); res.status(500).json({ error: e.message }); }
  });

  // Muhasebe yanlış girdiği avansı silebilir — YALNIZ açık (kapanmamış) avans.
  app.delete("/api/portal/operasyon-takip/avans/:id", requireMuhasebe, async (req, res) => {
    try {
      const a = await storage.getOperasyonAvans(req.params.id);
      if (!a) return res.status(404).json({ error: "Bulunamadı" });
      if (a.kapanisId) return res.status(409).json({ error: "Kapanmış gün — silinemez" });
      if (a.belgeDosya) fs.promises.unlink(a.belgeDosya).catch(() => {}); // dekontu da temizle
      await storage.avansSil(a.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/portal/operasyon-takip/kapanis/:kapanisId/geri-ac", requireMuhasebe, async (req, res) => {
    try {
      const ben = await portalKullanici(req);
      if (!ben) return res.status(401).json({ error: "Giriş gerekli" });
      const k = await storage.geriAc(req.params.kapanisId, ben.id);
      if (!k) return res.status(404).json({ error: "Bulunamadı" });
      res.json(k);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ==================== ÖDEMELER: YÖNETİM PANELİ EK ROTALAR ====================

  app.get("/api/odemeler/masraf-turleri", async (_req, res) => {
    try {
      res.json(await storage.getMasrafTurleri());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/odemeler/masraf-turleri", async (req, res) => {
    try {
      const ad = String(req.body?.ad ?? "").trim();
      if (!ad) return res.status(400).json({ error: "Ad zorunlu" });
      const sira = Number.isFinite(Number(req.body?.sira)) ? Number(req.body.sira) : 0;
      // Case-insensitive dedup (POST /api/portal/masraf-turleri ile aynı kalıp) — "Ardiye" varken
      // "ardiye" açılırsa case-sensitive unique kısıtı bunu durdurmaz, çift kayıt belge zorunluluğunu
      // sessizce kaldırabilir (bkz. getMasrafTuruByAd fail-safe notu).
      const norm = (s: string) => s.trim().toLocaleLowerCase("tr");
      const mevcutlar = await storage.getMasrafTurleri();
      const mevcut = mevcutlar.find((t) => norm(t.ad) === norm(ad));
      if (mevcut) return res.json(mevcut); // aynı ad → yeni kayıt AÇMA, mevcudu döndür
      const yeni = await storage.createMasrafTuru({ ad, sira, aktif: true });
      res.json(yeni);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/odemeler/masraf-turleri/:id", async (req, res) => {
    try {
      const izinli: { ad?: string; aktif?: boolean; sira?: number; belgeZorunlu?: boolean } = {};
      if (typeof req.body?.ad === "string" && req.body.ad.trim()) izinli.ad = req.body.ad.trim();
      if (typeof req.body?.aktif === "boolean") izinli.aktif = req.body.aktif;
      if (Number.isFinite(Number(req.body?.sira))) izinli.sira = Number(req.body.sira);
      // Beyaz listeye AÇIKÇA eklenmezse sessizce düşer.
      if (typeof req.body?.belgeZorunlu === "boolean") izinli.belgeZorunlu = req.body.belgeZorunlu;
      const guncel = await storage.updateMasrafTuru(req.params.id, izinli);
      if (!guncel) return res.status(404).json({ error: "Bulunamadı" });
      res.json(guncel);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // İzleme sayfası: tüm talepler + eşleşmeyen beyanname kullanıcıları
  app.get("/api/odemeler/ozet", async (_req, res) => {
    try {
      const [talepler, eslesmeyen] = await Promise.all([
        storage.getOdemeTalepleri({}),
        storage.getEslesmeyenBeyannameKullanicilari(),
      ]);
      res.json({ talepler, eslesmeyen });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
