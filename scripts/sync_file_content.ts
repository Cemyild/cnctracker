
import "dotenv/config";
import { db } from "../server/db";
import { gumrukDosyalar, gumrukVerileri } from "../shared/schema";
import { sql, eq, and, desc, inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

async function syncFile() {
  console.log("Syncing DB with latest Excel file...");

  // 1. Get latest file path
  const files = await db.select()
    .from(gumrukDosyalar)
    .leftJoin(gumrukVerileri, eq(gumrukDosyalar.id, gumrukVerileri.dosyaId))
    .where(eq(gumrukVerileri.yil, 2026))
    .orderBy(desc(gumrukDosyalar.uploadDate))
    .limit(1);

  if (files.length === 0) {
      console.log("No files found.");
      process.exit(0);
  }

  const fileRecord = files[0].gumruk_dosyalar;
  if (!fileRecord || !fileRecord.filepath) {
      console.log("File record invalid.");
      process.exit(0);
  }

  console.log(`Reading Excel file: ${fileRecord.filepath}`);

  if (!fs.existsSync(fileRecord.filepath)) {
      console.log("File not found on disk!");
      process.exit(0);
  }

  // 2. Read Excel
  const workbook = XLSX.readFile(fileRecord.filepath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet) as any[];

  // 3. Extract Invoice Numbers from Excel (Standardized)
  const excelFaturas = new Set<string>();
  data.forEach(row => {
      let fNo = row["FATURA NO"];
      if (fNo) excelFaturas.add(String(fNo).trim());
  });
  console.log(`Excel contains ${excelFaturas.size} unique invoices.`);

  // 4. Get DB Invoices for 2026
  const dbRows = await db.select({
      id: gumrukVerileri.id,
      faturaNo: gumrukVerileri.faturaNo,
      malBedeli: gumrukVerileri.malBedeli,
      topFaturaTutar: gumrukVerileri.topFaturaTutar
  })
  .from(gumrukVerileri)
  .where(eq(gumrukVerileri.yil, 2026));

  console.log(`DB contains ${dbRows.length} records.`);

  // 5. Find Ghost Records (In DB but not in Excel)
  const ghosts = dbRows.filter(r => !r.faturaNo || !excelFaturas.has(r.faturaNo.trim()));
  
  console.log(`Found ${ghosts.length} ghost records (in DB but not in Excel).`);

  // 6. Calculate Value
  let totalGhostValue = 0;
  let totalGhostFaturaTutar = 0;
  
  ghosts.forEach(r => {
      totalGhostValue += parseFloat(r.malBedeli || "0");
      totalGhostFaturaTutar += parseFloat(r.topFaturaTutar || "0");
  });

  console.log(`Total Ghost Value (MalBedeli): ${totalGhostValue.toLocaleString('tr-TR', {minimumFractionDigits: 2})}`);
  console.log(`Total Ghost Value (TopFatura): ${totalGhostFaturaTutar.toLocaleString('tr-TR', {minimumFractionDigits: 2})}`);
  
  // List first few ghosts
  if (ghosts.length > 0) {
      console.log("\nSample Ghost Records:");
      ghosts.slice(0, 5).forEach(r => console.log(`- ${r.faturaNo}: ${r.malBedeli}`));
  }

  // 7. Auto-fix option?
  // Ideally, valid difference should be 113,045.00
  const discrepancy = 113045.00;
  const diffMal = Math.abs(totalGhostValue - discrepancy);
  const diffFatura = Math.abs(totalGhostFaturaTutar - discrepancy); // Check if total invoice matches
  
  if (diffMal < 100 || diffFatura < 100) {
      console.log("\nSUCCESS: Ghost value matches discrepancy!");
      
      // Perform deletion
      if (ghosts.length > 0) {
          console.log(`Deleting ${ghosts.length} ghost records...`);
          const ids = ghosts.map(g => g.id);
          // Batch delete
             for (let i = 0; i < ids.length; i += 100) {
              const batch = ids.slice(i, i + 100);
              await db.delete(gumrukVerileri).where(inArray(gumrukVerileri.id, batch));
           }
          console.log("Deletion complete.");
      }
  } else {
      console.log("\nWARNING: Ghost value does NOT match 113,045 exactly.");
  }

  process.exit(0);
}

syncFile().catch(console.error);
