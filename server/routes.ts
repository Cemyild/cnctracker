import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { type IStorage } from "./storage";
import * as XLSX from "xlsx";

import { insertGumrukVerisiSchema, insertAracSchema, type InsertGumrukVerisi, insertNakliyeVerisiSchema, insertSigortaPoliceSchema, insertSigortaMuhasebeSchema } from "@shared/schema";
import { createHash } from "crypto";
import { z } from "zod";
import {
  aylikHesapla,
  yillikHesapla,
  belirliAyHesapla,
  PARAMETRELER_2025,
  type CalisanStatu,
  type MonthlyCalculation
} from "@shared/salaryCalculations";

import { PDFParse } from "pdf-parse";
import { getTCMBExchangeRate } from "./currency"; // Helper added


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
            // Calculate Worker SGK Share (User defined as Gross - Net)
            const workerSgkShare = Number((brut - net).toFixed(2));

            // Calculate Employer SGK Share
            // Calculate Employer SGK Share
            let employerSgkShare = 0;
            // Determine month from req.body (from formData) or default
            // Note: Multer middleware handling 'ay' field should ideally make it available in req.body
            // If not available, default to 1 (January rates)
            const monthVal = req.body.ay ? parseInt(req.body.ay) : 1;

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

      // String 'ay' değerini sayısal olarak kontrol etmemiz gerekebilir ama 
      // şemada 'text' olarak tutuluyor ("ocak" gibi değil, "1", "2" gibi string mi, yoksa ay ismi mi?)
      // Front-end "1", "2" gönderiyor. Şema "text". Uygun. 
      // Ancak eski verilerde "ocak", "subat" gibi de olabilir. 
      // Biz "1", "2" gibi tutacağız artık.

      // 1. O ay ve yıla ait eski kayıtları sil
      await storage.deleteCalisanlar(String(ay), parseInt(yil));

      // 2. Yeni kayıtları ekle
      const calisanlarVerisi = data.map((item: any) => ({
        ...item,
        ay: String(ay),
        yil: parseInt(yil),
        // Eksik alanlar için varsayılanlar veya hesaplamalar (basit toplama)
        // Eğer excel'den gelmeyen bir alan varsa hesaplamak yerine 0 veriyoruz 
        // çünkü artık otomatik hesaplama yok.
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

      // A: Tarih, B: Firma, C: Fatura No, D: Mal Bedeli, E: KDV, F: Toplam, G: Para Birimi
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


  // Excel yükle (Eski Gumruk)
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

      // Excel dosyasını oku
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (data.length < 2) {
        return res.status(400).json({ error: "Excel dosyası boş veya geçersiz" });
      }

      // İlk satır başlıklar, 2. satırdan itibaren veriler
      const veriler: InsertGumrukVerisi[] = [];

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        // Boş satırları atla
        if (!row[1] && !row[2]) continue;

        const parseNumber = (val: any): string | null => {
          if (val === undefined || val === null || val === "") return null;
          const num = parseFloat(String(val).replace(",", "."));
          return isNaN(num) ? null : num.toFixed(2);
        };

        // Row hash oluştur
        const rowHash = createRowHash(row);

        // Tip Mapping
        let tip = row[0] ? String(row[0]).trim() : "Diğer";
        if (tip === "T" || tip === "t") tip = "İthalat";
        else if (tip === "H") tip = "İhracat";
        else if (tip === "@") tip = "Transit";
        else if (tip === "A") tip = "Serbest B. Giriş";
        else if (tip === "B") tip = "Serbest B. Çıkış";
        else tip = "Diğer";

        veriler.push({
          ay,
          yil,
          tip,
          dosyaNo: row[1] ? String(row[1]).trim() : null,
          firmaUnvan: row[2] ? String(row[2]).trim() : null,
          rejim: row[3] ? String(row[3]).trim() : null,
          faturaNo: row[4] ? String(row[4]).trim() : null,
          faturaTarihi: row[5] ? String(row[5]).trim() : null,
          gumruk: row[6] ? String(row[6]).trim() : null,
          tescilTarihi: row[7] ? String(row[7]).trim() : null,
          tescilNo: row[8] ? String(row[8]).trim() : null,
          faturayiKesen: row[9] ? String(row[9]).trim() : null,
          dovizKiymeti: row[10] ? String(row[10]).trim() : null,
          doviz: row[11] ? String(row[11]).trim() : null,
          girisElemani: row[12] ? String(row[12]).trim() : null,
          malBedeli: parseNumber(row[13]),
          topIskonto: parseNumber(row[14]),
          topKdvTutar: parseNumber(row[15]),
          topFaturaTutar: parseNumber(row[16]),
          rowHash,
        });
      }

      if (veriler.length === 0) {
        return res.status(400).json({ error: "Geçerli veri bulunamadı" });
      }

      // Mevcut row hash'leri al
      const existingHashes = await storage.getExistingRowHashes(ay, yil);

      // Sadece yeni satırları filtrele
      const yeniVeriler = veriler.filter(v => !existingHashes.has(v.rowHash));

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

  return httpServer;
}
