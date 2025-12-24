import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { type IStorage } from "./storage";
import * as XLSX from "xlsx";
import { insertGumrukVerisiSchema, insertAracSchema, type InsertGumrukVerisi, insertNakliyeVerisiSchema } from "@shared/schema";
import { createHash } from "crypto";
import { z } from "zod";

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

  // Excel yükle
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
