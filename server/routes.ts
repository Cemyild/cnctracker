import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import * as XLSX from "xlsx";
import type { InsertGumrukVerisi } from "@shared/schema";
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
  
  // Gümrük verilerini getir
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

  // Yüklü ayları getir
  app.get("/api/gumruk/aylar", async (req, res) => {
    try {
      const aylar = await storage.getGumrukAylari();
      res.json(aylar);
    } catch (error) {
      console.error("Aylar getirme hatası:", error);
      res.status(500).json({ error: "Aylar alınamadı" });
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

        veriler.push({
          ay,
          yil,
          tip: row[0] ? String(row[0]).trim() : null,
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
        message: `${eklenenVeriler.length} yeni kayıt eklendi${veriler.length - yeniVeriler.length > 0 ? ` (${veriler.length - yeniVeriler.length} mevcut kayıt atlandı)` : ""}`,
        eklenen: eklenenVeriler.length,
        atlanan: veriler.length - yeniVeriler.length,
        toplam: veriler.length
      });
    } catch (error) {
      console.error("Excel yükleme hatası:", error);
      const errorMessage = error instanceof Error ? error.message : "Bilinmeyen hata";
      res.status(500).json({ error: `Excel yüklenirken bir hata oluştu: ${errorMessage}` });
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
