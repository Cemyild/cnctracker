import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { type IStorage } from "./storage";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import express from "express";

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

import { insertGumrukVerisiSchema, insertAracSchema, type InsertGumrukVerisi, insertNakliyeVerisiSchema, insertSigortaPoliceSchema, insertSigortaMuhasebeSchema, insertSalaryPlanSchema, insertExpenseCategorySchema, insertAracGiderSchema, aylar } from "@shared/schema";
import { createHash } from "crypto";
import { z } from "zod";
import {
  aylikHesapla,
  yillikHesapla,
  belirliAyHesapla,
  PARAMETRELER_2025,
  bruttenHesapla2026,
  PARAMETRELER_2026,
  type CalisanStatu,
  type MonthlyCalculation,
  type MonthlyCalculation2026
} from "@shared/salaryCalculations";


import { PDFParse } from "pdf-parse";
import { getTCMBExchangeRate } from "./currency"; // Helper added
import { processUserQuery, generateNaturalLanguageResponse } from "./lib/openai";


// Row hash oluştur - satırı benzersiz tanımlamak için
function createRowHash(row: any[]): string {
  const key = row.map(v => String(v || "")).join("|");
  return createHash("md5").update(key).digest("hex");
}

// Geçerli ay değerleri
const gecerliAylar = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"] as const;

// Upload parametreleri için validation schema
const uploadParamsSchema = z.object({
  ay: z.enum(gecerliAylar),
  yil: z.string().regex(/^\d{4}$/).transform(Number),
});

const upload = multer({ storage: multer.memoryStorage() });

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

  // Trend Analysis Endpoint
  app.get("/api/gumruk/analiz", async (req, res) => {
    try {
      const churnMonths = req.query.churnMonths ? parseInt(req.query.churnMonths as string) : 2;
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
      
      // Define Periods
      // Current Period: Last 3 Months (inclusive of current) -> [current-2, current]
      // Previous Period: The 3 months before that -> [current-5, current-3]
      
      const firms = new Map<string, {
         name: string;
         volCurrent: number; // Last 3 months
         volPrev: number;    // Previous 3 months
         lastSeenAbs: number;
         firstSeenAbs: number;
         totalVol: number;
      }>();

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
                totalVol: 0
            });
         }
         
         const firm = firms.get(fName)!;
         const dAyIdx = getAyIndex(d.ay);
         if (dAyIdx === -1) continue;
         
         const dAbs = toAbsMonth(d.yil, dAyIdx);
         
         // Use robust parsing
         const vol = parseBalance(d.malBedeli); 

         firm.totalVol += vol;

         // Update Last/First Seen
         if (dAbs > firm.lastSeenAbs) firm.lastSeenAbs = dAbs;
         if (dAbs < firm.firstSeenAbs) firm.firstSeenAbs = dAbs;

         // Bin into periods
         // Current: [currentAbs - 2, currentAbs]
         if (dAbs >= currentAbs - 2 && dAbs <= currentAbs) {
            firm.volCurrent += vol;
         }
         // Previous: [currentAbs - 5, currentAbs - 3]
         else if (dAbs >= currentAbs - 5 && dAbs <= currentAbs - 3) {
            firm.volPrev += vol;
         }
      }

      const alerts: any[] = [];
      const trends: any[] = [];

      firms.forEach(f => {
         // ALERTS
         
         // 1. Churn Risk: Active before (LastSeen < current-churnMonths)
         // But within a relevant window so we don't show ancient history for short queries.
         // Sliding window: Look back (churnMonths + 3) max.
         // e.g. If churn=3, show inactive for 3..6 months. (Excludes 9mo).
         const lookbackLimit = currentAbs - (churnMonths + 3);
         
         const isRelevant = f.lastSeenAbs >= lookbackLimit;
         const isInactive = f.lastSeenAbs <= (currentAbs - churnMonths); 
         
         if (isRelevant && isInactive) {
             const inactiveMonths = Math.floor(currentAbs - f.lastSeenAbs);
             alerts.push({
                 type: "churn_risk",
                 company: f.name,
                 message: `Son işlem: ${inactiveMonths} ay önce`,
                 severity: "high"
             });
         }

         // 2. New Customer: First seen in last 3 months
         if (f.firstSeenAbs >= (currentAbs - 2)) {
             alerts.push({
                 type: "new_customer",
                 company: f.name,
                 message: "Yeni Müşteri",
                 severity: "success"
             });
         }
         
         // TRENDS
         // Calculate Growth if volume exists in both periods or at least current
         if (f.volCurrent > 0 || f.volPrev > 0) {
             let growthPct = 0;
             if (f.volPrev > 0) {
                 growthPct = ((f.volCurrent - f.volPrev) / f.volPrev) * 100;
             } else if (f.volCurrent > 0) {
                 growthPct = 100; // New or reactivated
             }

             // Only relevant if significant volume (e.g. > 1000 TL to avoid noise)
             if (f.volCurrent + f.volPrev > 1000) { 
                 trends.push({
                     company: f.name,
                     currentVol: f.volCurrent,
                     prevVol: f.volPrev,
                     growth: growthPct,
                     absGrowth: f.volCurrent - f.volPrev
                 });
             }
         }
      });

      // Sort and Split Trends
      const risingTrends = trends.filter(t => t.growth > 0).sort((a, b) => b.growth - a.growth).slice(0, 50);
      const fallingTrends = trends.filter(t => t.growth < 0).sort((a, b) => a.growth - b.growth).slice(0, 50);

      res.json({
         currentPeriodLabel: "Son 3 Ay",
         alerts,
         risingTrends,
         fallingTrends
      });

    } catch (e) {
      console.error("Analiz hatası:", e);
      res.status(500).json({ error: "Analiz yapılamadı" });
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
          validVeriler.push(parsed.data);
        } else {
          console.warn("Invalid vehicle expense item:", item, parsed.error);
        }
      }

      if (validVeriler.length === 0 && veriler.length > 0) {
        return res.status(400).json({ error: "Hiçbir gider kaydı geçerli formatta değil." });
      }

      const inserted = await storage.insertAracGiderler(validVeriler);
      res.json({ success: true, count: inserted.length });
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

  app.delete("/api/sigorta/muhasebe-clear/mapfre", async (req, res) => {
    try {
        await storage.deleteMapfreMuhasebe();
        res.json({ success: true });
    } catch (err) {
        console.error("Mapfre temizleme hatası:", err);
        res.status(500).json({ error: String(err) });
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
  // B ORDRO YÜKLEME VE KAYDETME API'LERİ
  // ============================================================================

  // Bordro PDF/Excel Yükle ve Önizle
  // Helper to apply branch history
  const applyBranchHistory = async (newEmployees: any[]) => {
    try {
      const allHistory = await storage.getCalisanlar();
      // Sort by Year asc, Month asc to get latest at the end
      allHistory.sort((a, b) => {
        const yDiff = (a.yil || 0) - (b.yil || 0);
        if (yDiff !== 0) return yDiff;
        return parseInt(a.ay || "0") - parseInt(b.ay || "0");
      });

      const branchMap = new Map<string, string>();
      for (const h of allHistory) {
        if (h.sube && h.tcNo) branchMap.set(h.tcNo, h.sube);
      }

      for (const emp of newEmployees) {
        if (emp.tcNo && branchMap.has(emp.tcNo)) {
          emp.sube = branchMap.get(emp.tcNo);
        }
      }
    } catch (e) {
      console.error("Şube geçmişi uygulanırken hata:", e);
    }
    return newEmployees;
  };

  app.post("/api/bordro/upload", upload.single("excel"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Dosya yüklenmedi" });
      }

      // 1. PDF Parsing Logic
      if (req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf')) {
        try {
          const parser = new PDFParse({ data: req.file.buffer });
          const pdfData = await parser.getText();
          const text = pdfData.text;

          // Parsing Logic
          const lines = text.split('\n');
          const employees: any[] = [];

          let currentEmployee: any = null;

          // Helper to parse Turkish currency "1.234,56" -> 1234.56
          const parseMoney = (str: string) => {
            if (!str) return 0;
            return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
          };

          let currentOffice = "Merkez";

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check for Office Name changes in header lines
            // Check for Office Name changes in header lines
            // March PDF: "AKPINAR ... BURSA Merkez" (Merkez Adres might be split)
            if (line.includes("Merkez Adres") || (line.includes("Merkez") && line.includes("BURSA"))) currentOffice = "Merkez";
            else if (line.includes("Yönetim") || line.includes("YÖNETİM")) currentOffice = "Yönetim";
            else if (line.includes("Gemlik")) currentOffice = "Gemlik";
            else if (line.includes("İstanbul") || line.includes("Istanbul")) currentOffice = "İstanbul";

            // Detect Start of Employee Block: Starts with Date, ends with Name
            // e.g. "10.01.2025 ... 0 NAME" or "10.01.2025 ... 2,5 NAME"
            const startsWithDate = /^\d{2}\.\d{2}\.\d{4}/.test(line);

            // Relaxed regex: match ANY digit/symbol chars followed by Name
            const nameMatch = line.match(/\s+[\d.,]+\s+([A-ZĞÜŞİÖÇ\s]{2,})$/);

            if (startsWithDate && nameMatch) {
              // Save previous student if exists
              if (currentEmployee) {
                employees.push(currentEmployee);
              }

              // Initialize new employee
              currentEmployee = {
                adSoyad: nameMatch[1].trim(),
                sube: currentOffice,
                rawLines: []
              };

              // Try to find Join Date "DD.MM.YYYY" in the same line
              const dateMatch = line.match(/(\d{2}\.\d{2}\.\d{4})\s+/);
              if (dateMatch) currentEmployee.isGirisTarihi = dateMatch[1];
            }

            if (currentEmployee) {
              // Check for Footer start to prevent massive totals from being included in the last employee
              if (line.includes("TOPLAM :") || line.includes("TAHAKKUK BİLGİLERİ")) {
                employees.push(currentEmployee);
                currentEmployee = null;
                continue; // Skip the rest of the loop for this line and future lines effectively (as currentEmployee is null)
              }

              currentEmployee.rawLines.push(line);

              // Try to find TC Identity Number (11 digits) 
              if (!currentEmployee.tcNo) {
                const tcMatch = line.match(/^\d{11}$/);
                if (tcMatch) currentEmployee.tcNo = tcMatch[0];
              }

              // Try to find Join Date "DD.MM.YYYY"
              if (!currentEmployee.isGirisTarihi) {
                const dateMatch = line.match(/(\d{2}\.\d{2}\.\d{4})\s+\d{2}\s+\d{2}/);
                if (dateMatch) currentEmployee.isGirisTarihi = dateMatch[1];
              }
            }
          }
          // Push last one
          if (currentEmployee) employees.push(currentEmployee);

          // Second Pass: Process raw lines to extract financials
          const parsedData = employees.map(emp => {
            const allMoney: number[] = [];
            emp.rawLines.forEach((l: string) => {
              // Match all numbers like X.XXX,XX
              const matches = l.match(/\d{1,3}(\.\d{3})*,\d{2}/g);
              if (matches) {
                matches.forEach(m => allMoney.push(parseMoney(m)));
              }
            });

            // Heuristics:
            // 1. Find TC line index
            let tcIndex = -1;
            for (let i = 0; i < emp.rawLines.length; i++) {
              if (/^\d{11}$/.test(emp.rawLines[i].trim())) {
                tcIndex = i;
                break;
              }
            }

            // 2. Brut is locally the first number relative to TC
            let foundBrut = 0;
            if (tcIndex !== -1 && tcIndex + 1 < emp.rawLines.length) {
              // Check next few lines for a valid number
              // Usually it is immediately next line
              for (let k = 1; k <= 3; k++) {
                if (tcIndex + k >= emp.rawLines.length) break;
                const valStr = emp.rawLines[tcIndex + k];
                const moneys = valStr.match(/\d{1,3}(\.\d{3})*,\d{2}/g);
                if (moneys && moneys.length > 0) {
                  foundBrut = parseMoney(moneys[0]);
                  break;
                }
              }
            }

            // 3. Fallback to Max if not found, but prefer foundBrut if available
            // Note: Total Cost is typically the MAX in the list, so picking MAX as Brut is incorrect if Total Cost is present.
            // If foundBrut is available, we use it.
            let brut = foundBrut;
            if (!brut) {
              // Heuristic Fallback: 2nd largest value? Or just Max if no Total Cost?
              const maxVal = Math.max(...allMoney, 0);
              const possibleBrut = allMoney.find(m => m < maxVal && m > maxVal * 0.4);
              brut = possibleBrut || maxVal; // Risky but fallback
            }

            // 4. Net is the LAST value that is > 30% of Brut
            // (Filters out small artifacts at the end)
            let net = 0;
            for (let i = allMoney.length - 1; i >= 0; i--) {
              // Net must be smaller than Brut usually (unless tax rebate etc makes it distinct? No)
              if (allMoney[i] > brut * 0.30 && (allMoney[i] < brut || brut === 0)) {
                net = allMoney[i];
                break;
              }
            }
            if (!net) net = allMoney.length > 0 ? allMoney[allMoney.length - 1] : 0;

            // Status Logic determined by 05510 code and specific names
            const managers = [
              "NEŞE YILDIRIM", "CENGİZ ÜNER", "COŞKUN YILDIRIM",
              "ÖZCAN EREN", "ÖZGÜR KÖSE", "CEM YILDIRIM", "ENİS ÜNER"
            ];

            let statu = "NORMAL";

            // 1. Check Manager List
            if (managers.some(m => emp.adSoyad.includes(m))) {
              statu = "YÖNETİCİ";
            } else {
              // 2. Check Kanun No in raw lines
              const hasNormalCode = emp.rawLines.some((l: string) => l.includes("05510"));
              const hasRetiredCode = emp.rawLines.some((l: string) => l.includes("00000"));

              if (hasRetiredCode) statu = "EMEKLİ";
              else if (hasNormalCode) statu = "NORMAL";
            }
            // Determine month and year from req.body (from formData) or default
            const monthVal = req.body.ay ? parseInt(req.body.ay) : 1;
            const yilVal = req.body.yil ? parseInt(req.body.yil) : 2026;

            // 2026+ için yeni detaylı hesaplama sistemi
            if (yilVal >= 2026) {
              const hesaplama = bruttenHesapla2026(
                brut,
                statu as CalisanStatu,
                monthVal,
                0, // Önizlemede kümülatif matrah 0, kayıtta DB'den çekilecek
                true // Hazine teşviki var
              );

              return {
                tcNo: emp.tcNo || "",
                adSoyad: emp.adSoyad,
                statu: statu,
                sube: emp.sube || "Merkez",
                isGirisTarihi: emp.isGirisTarihi || "",

                brutUcret: brut,
                netUcret: net, // PDF'den alınan net (karşılaştırma için)
                hesaplananNet: hesaplama.netMaas, // Brütten hesaplanan net
                sgkMatrahi: hesaplama.sgkPrimMatrahi,
                gelirVergisiMatrahi: hesaplama.gelirVergisiMatrahi,
                kumulatifVergiMatrahi: hesaplama.kumulatifGelirVergisiMatrahi,
                gelirVergisi: hesaplama.netGelirVergisi,
                damgaVergisi: hesaplama.netDamgaVergisi,
                sigortaKesintisi: hesaplama.sgkIsciPrimi,
                issizlikSigortasiKesintisi: hesaplama.issizlikIsciPrimi,
                isverenSgkPayi: hesaplama.sgkIsverenPrimi,
                isverenIssizlikPayi: hesaplama.issizlikIsverenPrimi,
                toplamIsverenMaliyeti: hesaplama.toplamIsverenMaliyeti
              };
            }

            // 2025 ve öncesi - ESKİ HESAPLAMA AYNEN KALACAK
            const workerSgkShare = Number((brut - net).toFixed(2));
            let employerSgkShare = 0;

            if (statu === "NORMAL") {
              const rate = (monthVal > 1) ? 0.1875 : 0.1775;
              employerSgkShare = Number((brut * rate).toFixed(2));
            } else if (statu === "EMEKLİ") {
              employerSgkShare = Number((brut * 0.2475).toFixed(2));
            } else if (statu === "YÖNETİCİ") {
              employerSgkShare = 0;
            }

            return {
              tcNo: emp.tcNo || "",
              adSoyad: emp.adSoyad,
              statu: statu,
              sube: emp.sube || "Merkez",
              isGirisTarihi: emp.isGirisTarihi || "",

              brutUcret: brut,
              netUcret: net,
              sgkMatrahi: brut,
              gelirVergisiMatrahi: 0,
              kumulatifVergiMatrahi: 0,
              gelirVergisi: 0,
              damgaVergisi: 0,
              sigortaKesintisi: workerSgkShare,
              issizlikSigortasiKesintisi: 0,
              isverenSgkPayi: employerSgkShare,
              isverenIssizlikPayi: 0,
              toplamIsverenMaliyeti: Number((brut + employerSgkShare).toFixed(2))
            };
          });

          const withHistory = await applyBranchHistory(parsedData);
          return res.json(withHistory);

        } catch (error) {
          console.error("PDF Parsing error:", error);
          return res.status(500).json({ error: "PDF işlenirken hata oluştu: " + (error as Error).message });
        }
      }

      // 2. Excel Parsing Logic (Fallback)
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet) as any[];

      if (data.length === 0) {
        return res.status(400).json({ error: "Dosya boş" });
      }

      const parsedData = data.map((row: any) => {
        const parseNum = (val: any) => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            let clean = val.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
            return parseFloat(clean) || 0;
          }
          return 0;
        };

        return {
          tcNo: String(row["TC No"] || row["TC"] || row["T.C."] || row["tcNo"] || ""),
          adSoyad: String(row["Ad Soyad"] || row["Adı Soyadı"] || row["Personel Adı"] || row["adSoyad"] || ""),
          statu: String(row["Statü"] || row["Statu"] || row["Durum"] || "NORMAL").toUpperCase(),
          sube: String(row["Şube"] || row["Sube"] || row["Bölüm"] || "Bursa"),
          isGirisTarihi: String(row["İşe Giriş"] || row["İşe Giriş Tarihi"] || row["Giriş Tarihi"] || ""),

          brutUcret: parseNum(row["Brüt Ücret"] || row["Brüt"] || row["Aylık Brüt"] || 0),
          netUcret: parseNum(row["Net Ücret"] || row["Net"] || row["Aylık Net"] || 0),
          sgkMatrahi: parseNum(row["SGK Matrahı"] || row["SGK Matrah"] || 0),
          gelirVergisiMatrahi: parseNum(row["GV Matrahı"] || row["Gelir Vergisi Matrahı"] || 0),
          kumulatifVergiMatrahi: parseNum(row["Kümülatif GV Matrahı"] || row["Kümülatif Vergi Matrahı"] || 0),
          gelirVergisi: parseNum(row["Gelir Vergisi"] || row["Kesilen GV"] || 0),
          damgaVergisi: parseNum(row["Damga Vergisi"] || row["Kesilen DV"] || 0),
          sigortaKesintisi: parseNum(row["SGK İşçi Payı"] || row["İşçi SGK"] || 0),
          issizlikSigortasiKesintisi: parseNum(row["İşsizlik İşçi Payı"] || row["İşçi İşsizlik"] || 0),
          isverenSgkPayi: parseNum(row["SGK İşveren Payı"] || row["İşveren SGK"] || 0),
          isverenIssizlikPayi: parseNum(row["İşsizlik İşveren Payı"] || row["İşveren İşsizlik"] || 0),
          toplamIsverenMaliyeti: parseNum(row["Toplam İşveren Maliyeti"] || row["İşveren Maliyeti"] || 0)
        };
      }).filter(p => p.adSoyad && p.adSoyad.length > 2);

      const withHistory = await applyBranchHistory(parsedData);
      res.json(withHistory);
    } catch (error) {
      console.error("Bordro yükleme hatası:", error);
      res.status(500).json({ error: "Dosya işlenirken hata oluştu" });
    }
  });

  // Bordro Verilerini Kaydet (Toplu)
  app.post("/api/bordro/save", async (req, res) => {
    try {
      const { ay, yil, data } = req.body;

      if (!ay || !yil || !data || !Array.isArray(data)) {
        return res.status(400).json({ error: "Geçersiz veri formatı" });
      }

      const ayNum = parseInt(ay);
      const yilNum = parseInt(yil);

      // 1. O ay ve yıla ait eski kayıtları sil
      await storage.deleteCalisanlar(String(ay), yilNum);

      // 2026+ için yeni hesaplama sistemi
      if (yilNum >= 2026) {
        // Önceki ayların verilerini çek (kümülatif matrah hesabı için)
        const tumOncekiVeriler = await storage.getCalisanlar(undefined, yilNum);

        // TC bazında kümülatif matrah hesapla
        const kumulatifMatrahlar: { [tcNo: string]: number } = {};
        for (const kayit of tumOncekiVeriler) {
          const kayitAy = parseInt(kayit.ay);
          if (kayitAy < ayNum) {
            const tcNo = kayit.tcNo;
            const matrah = Number(kayit.gelirVergisiMatrahi || 0);
            kumulatifMatrahlar[tcNo] = (kumulatifMatrahlar[tcNo] || 0) + matrah;
          }
        }

        // Her çalışan için detaylı hesaplama yap
        const calisanlarVerisi = data.map((item: any) => {
          const tcNo = item.tcNo;
          const kumulatifMatrah = kumulatifMatrahlar[tcNo] || 0;
          const brutUcret = Number(item.brutUcret || 0);
          const statu = (item.statu || "NORMAL") as CalisanStatu;

          // 2026 hesaplama fonksiyonunu kullan
          const hesaplama = bruttenHesapla2026(
            brutUcret,
            statu,
            ayNum,
            kumulatifMatrah,
            true // Hazine teşviki var
          );

          return {
            tcNo: item.tcNo,
            adSoyad: item.adSoyad,
            statu: item.statu,
            sube: item.sube || "Merkez",
            isGirisTarihi: item.isGirisTarihi || "",
            ay: String(ay),
            yil: yilNum,

            brutUcret: String(brutUcret.toFixed(2)),
            netUcret: String(hesaplama.netMaas.toFixed(2)),
            sgkMatrahi: String(hesaplama.sgkPrimMatrahi.toFixed(2)),
            gelirVergisiMatrahi: String(hesaplama.gelirVergisiMatrahi.toFixed(2)),
            kumulatifVergiMatrahi: String((kumulatifMatrah + hesaplama.gelirVergisiMatrahi).toFixed(2)),
            gelirVergisi: String(hesaplama.netGelirVergisi.toFixed(2)),
            damgaVergisi: String(hesaplama.netDamgaVergisi.toFixed(2)),
            sigortaKesintisi: String(hesaplama.sgkIsciPrimi.toFixed(2)),
            issizlikSigortasiKesintisi: String(hesaplama.issizlikIsciPrimi.toFixed(2)),
            isverenSgkPayi: String(hesaplama.sgkIsverenPrimi.toFixed(2)),
            isverenIssizlikPayi: String(hesaplama.issizlikIsverenPrimi.toFixed(2)),
            toplamIsverenMaliyeti: String(hesaplama.toplamIsverenMaliyeti.toFixed(2))
          };
        });

        const saved = await storage.insertCalisanlar(calisanlarVerisi);
        return res.json({ success: true, count: saved.length });
      }

      // 2025 ve öncesi - ESKİ HESAPLAMA AYNEN KALACAK
      const calisanlarVerisi = data.map((item: any) => ({
        ...item,
        ay: String(ay),
        yil: yilNum,
      }));

      const saved = await storage.insertCalisanlar(calisanlarVerisi);

      res.json({ success: true, count: saved.length });
    } catch (error) {
      console.error("Bordro kaydetme hatası:", error);
      res.status(500).json({ error: "Veriler kaydedilirken hata oluştu" });
    }
  });


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

      // Tüm gümrük verilerini çek
      const gumrukVerileri = await storage.getAllGumrukVerileri();
      
      // Hızlı arama için House No tabanlı Map (Multi-Value)
      // Key: Normalized Container No -> Value: Array of Records
      const gumrukMap = new Map<string, InsertGumrukVerisi[]>();

      // Normalization Helper
      const normalizeContainer = (val: string) => {
          if (!val) return "";
          return val.replace(/[^A-Z0-9]/g, '').toUpperCase();
      };
      
      gumrukVerileri.forEach(g => {
        if (g.houseNo) {
           const cleanHouse = normalizeContainer(g.houseNo);
           if (cleanHouse.length > 3) {
              if (!gumrukMap.has(cleanHouse)) {
                  gumrukMap.set(cleanHouse, []);
              }
              gumrukMap.get(cleanHouse)!.push(g);
           }
        }
      });

      console.log(`Gümrük Map Hazır: ${gumrukMap.size} unique konteyner.`);

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

        // Fatura Tarihi Parse (DD.MM.YYYY typically from Excel/PDF)
        let invoiceDate: Date | null = null;
        if (n.faturaTarihi) {
            // Try DD.MM.YYYY
            const parts = n.faturaTarihi.split('.');
            if (parts.length === 3) {
                invoiceDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            } else {
                // Try standard YYYY-MM-DD
                const d = new Date(n.faturaTarihi);
                if (!isNaN(d.getTime())) invoiceDate = d;
            }
        }

        const konteynerList = activeKonteynerler.split(',').map(c => normalizeContainer(c.trim()));

        for (const cont of konteynerList) {
          if (cont.length < 3) continue;

          // DEBUG for Target Container
          const isTargetDebug = cont.includes("HMMU2071981");

          // Eşleşme ara
          const candidates = gumrukMap.get(cont);
          
          if (candidates && candidates.length > 0) {
             
             let bestMatch: InsertGumrukVerisi | null = null;
             let minDayDiff = 9999;

             if (isTargetDebug) {
                 console.log(`DEBUG Check HMMU2071981: Found ${candidates.length} candidates.`);
             }

             // Find best match based on Date (within reasonable window, e.g. 45 days)
             // Customs Declaration (Tescil) usually happens around the invoice date
             for (const cand of candidates) {
                 // Parse Tescil Tarihi
                 let tescilDate: Date | null = null;
                 if (cand.tescilTarihi) {
                    const tParts = cand.tescilTarihi.split('.'); // Typically DD.MM.YYYY per previous lines
                    if (tParts.length === 3) {
                        tescilDate = new Date(parseInt(tParts[2]), parseInt(tParts[1]) - 1, parseInt(tParts[0]));
                    } else if (cand.faturaTarihi) {
                        // Fallback to Customs Invoice Date
                        const fParts = cand.faturaTarihi.split('.');
                        if (fParts.length === 3) {
                            tescilDate = new Date(parseInt(fParts[2]), parseInt(fParts[1]) - 1, parseInt(fParts[0]));
                        }
                    }
                 }

                 if (!invoiceDate || !tescilDate) {
                     // If no dates available, matching is risky but if it's the only one, take it.
                     // Or prioritze the one closest to "now" if multiple? 
                     // Let's just take the first if dates fail, but prioritize date match.
                     if (!bestMatch) bestMatch = cand;
                     continue;
                 }

                 // Log date comparison for debug
                 const diffTime = Math.abs(tescilDate.getTime() - invoiceDate.getTime());
                 const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                 if (isTargetDebug) {
                     console.log(`  Candidate: Tescil=${cand.tescilTarihi} vs Invoice=${n.faturaTarihi} -> Diff=${diffDays} days`);
                 }

                 // Allow match if within 45 days window
                 if (diffDays <= 45) {
                     if (diffDays < minDayDiff) {
                         minDayDiff = diffDays;
                         bestMatch = cand;
                     }
                 }
             }

             // Helper to convert Excel Serial Date (e.g., 46044) to DD.MM.YYYY
             const formatExcelDate = (serial: string | number): string => {
                 if (!serial) return "";
                 const num = typeof serial === 'string' ? parseFloat(serial) : serial;
                 if (isNaN(num)) return serial.toString();
                 
                 // Excel base date is Dec 30, 1899
                 const date = new Date(Math.round((num - 25569) * 86400 * 1000));
                 const day = date.getDate().toString().padStart(2, '0');
                 const month = (date.getMonth() + 1).toString().padStart(2, '0');
                 const year = date.getFullYear();
                 return `${day}.${month}.${year}`;
             };

             if (bestMatch) {
                if (isTargetDebug) {
                     console.log(`  MATCH_FOUND for HMMU2071981! Unvan: ${bestMatch.firmaUnvan}`);
                }
                const match = bestMatch; // Alias for readability

                // Format Tescil Tarihi if it looks like an Excel serial number (numeric)
                let finalTescilTarihi = match.tescilTarihi;
                if (match.tescilTarihi && /^\d+$/.test(match.tescilTarihi)) {
                    finalTescilTarihi = formatExcelDate(match.tescilTarihi);
                }

                try {
                  await storage.updateNakliyeVerisi(n.id, {
                    ilgiliDosyaNo: match.dosyaNo,
                    gumrukFirmaUnvan: match.firmaUnvan,
                    gumrukAdi: match.gumruk,
                    gumrukDovizKiymeti: match.dovizKiymeti,
                    gumrukDovizCinsi: match.doviz,
                    gumrukTescilNo: match.tescilNo,
                    gumrukTescilTarihi: finalTescilTarihi,
                    eslesenHouseNo: match.houseNo
                  });
                  matchCount++;
                  break; // Found a match for this invoice
                } catch (err) {
                  console.error(`Nakliye güncelleme hatası ID: ${n.id}`, err);
                }
             } else {
                 if (isTargetDebug) console.log("  No match found within 45 days window.");
             }
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

      // Read Excel
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
        const paraBirimi = String(row[6] || "TRY").trim().toUpperCase();
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

      console.log(`Parsed ${parsedVeriler.length} rows. First row example:`, parsedVeriler[0]);

      const inserted = await storage.insertGiderler(parsedVeriler);
      res.json({ success: true, count: inserted.length });

    } catch (error) {
      console.error("Giderler yüklenirken hata:", error);
      res.status(500).json({ error: "Dosya işlenirken hata oluştu: " + (error as Error).message });
    }
  });


  // Enhanced Excel Upload (Gümrük Sayfası İçin)
  app.post("/api/gumruk/yukle", upload.single("excel"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Dosya yüklenmedi" });
      }

      // Parametreleri doğrula
      const parseResult = uploadParamsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Geçersiz ay veya yıl değeri" });
      }
      const { ay, yil } = parseResult.data;

      // 1. FILE ARCHIVING
      // Klasör yapısını oluştur: uploads/gumruk/YIL/AY/
      const fs = await import("fs");
      const path = await import("path");
      
      const uploadDir = path.join(process.cwd(), "uploads", "gumruk", String(yil), ay);
      await fs.promises.mkdir(uploadDir, { recursive: true });

      const timestamp = new Date().getTime();
      const safeFilename = req.file.originalname.replace(/[^a-z0-9.]/gi, '_');
      const filename = `${timestamp}_${safeFilename}`;
      const filepath = path.join(uploadDir, filename);

      // Dosyayı diske yaz
      await fs.promises.writeFile(filepath, req.file.buffer);

      // Dosyayı veritabanına kaydet
      const md5Hash = createHash("md5").update(req.file.buffer).digest("hex");
      
      const dosyaKaydi = await storage.createGumrukDosya({
        filename: req.file.originalname,
        filepath: filepath,
        sizeBytes: req.file.size,
        recordCount: 0, // Güncellenecek
        md5Hash: md5Hash
      });

      // 2. DATA PARSING
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet) as any[]; // Row objects

      if (data.length === 0) {
        return res.status(400).json({ error: "Excel dosyası boş veya geçersiz" });
      }

      const veriler: InsertGumrukVerisi[] = [];

      for (const row of data) {
         // Skip empty-ish rows (must have basics)
         if (!row["FİRMA ÜNVAN"] && !row["FATURA NO"]) continue;

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

         // Row hash - using object values
         const rowHash = createRowHash(Object.values(row));
         

         // Tip Mapping
         let tipRaw = row["TİP"] ? String(row["TİP"]).trim() : "Diğer";
         let tip = "Diğer";
         const tr = tipRaw.toUpperCase();
         if (tr === "T" || tr === "İTHALAT") tip = "İthalat";
         else if (tr === "H" || tr === "İHRACAT") tip = "İhracat";
         else if (tr === "@" || tr === "TRANSİT") tip = "Transit";
         else if (tr === "A") tip = "Serbest B. Giriş";
         else if (tr === "B") tip = "Serbest B. Çıkış";
         else tip = "Diğer";

         const g = (key: string) => row[key] ? String(row[key]).trim() : null;

         // Serialize FULL row data for archival
         const rawData = JSON.stringify(row);

         const veri: InsertGumrukVerisi = {
           ay,
           yil,
           firmaUnvan: row["FİRMA ÜNVAN"],
           faturaNo: row["FATURA NO"],
           malBedeli: parseNumber(row["MAL BEDELİ"]),
           topKdvTutar: parseNumber(row["TOP KDV TUTAR"]),
           topFaturaTutar: parseNumber(row["TOP FATURA TUTAR"]),
           topIskonto: parseNumber(row["TOP İSKONTO"]),
           
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
           vd: g("V.D") || g("VERGİ DAİRESİ"),
           vn: g("V.N") || g("VERGİ NO"),
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
           cifKiymet: parseNumber(row["CİF KIYMET"]),
           istKiymet: parseNumber(row["İST. KIYMET"]),
           kur: parseNumber(row["KUR"]),
           
           // Raw Data Vault
           rawData: rawData,
           dosyaId: dosyaKaydi.id, // Link to file
           rowHash
         };
         
         veriler.push(veri);
      }

      if (veriler.length === 0) {
        return res.status(400).json({ error: "Geçerli veri bulunamadı" });
      }

      // Mevcut Fatura Numaralarını al (Daha güvenilir duplicate kontrolü için)
      const existingFaturas = await storage.getExistingFaturas(ay, yil);

      // Sadece yeni satırları filtrele (Fatura numarası eşleşmeyenleri al)
      const yeniVeriler = veriler.filter(v => {
        if (!v.faturaNo) return true; // Fatura numarası yoksa ekle (güvenli taraf)
        return !existingFaturas.has(v.faturaNo);
      });

      if (yeniVeriler.length === 0) {
        return res.json({
          success: true,
          message: "Tüm veriler zaten mevcut, yeni kayıt eklenmedi",
          eklenen: 0,
          atlanan: veriler.length,
          toplam: veriler.length
        });
      }

      const eklenenVeriler = await storage.insertGumrukVerileri(yeniVeriler);

      res.json({
        success: true,
        message: `${eklenenVeriler.length} yeni kayıt eklendi${veriler.length - yeniVeriler.length > 0 ? ` (${veriler.length - yeniVeriler.length} mevcut kayıt atlandı)` : ""} `,
        eklenen: eklenenVeriler.length,
        atlanan: veriler.length - yeniVeriler.length,
        toplam: veriler.length
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

  return httpServer;
}
