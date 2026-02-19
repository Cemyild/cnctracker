
import "dotenv/config";
import { db } from "../server/db";
import { gumrukDosyalar, gumrukVerileri } from "../shared/schema";
import { sql, eq, and, desc } from "drizzle-orm";

async function analyzeFiles() {
  console.log("Analyzing uploaded files for 2026...");

  const files = await db.select({
      id: gumrukDosyalar.id,
      filename: gumrukDosyalar.filename,
      uploadDate: gumrukDosyalar.uploadDate,
      recordCount: sql<number>`count(${gumrukVerileri.id})`
  })
  .from(gumrukDosyalar)
  .leftJoin(gumrukVerileri, eq(gumrukDosyalar.id, gumrukVerileri.dosyaId))
  .where(eq(gumrukVerileri.yil, 2026))
  .groupBy(gumrukDosyalar.id, gumrukDosyalar.filename, gumrukDosyalar.uploadDate)
  .orderBy(desc(gumrukDosyalar.uploadDate));

  console.log(`Found ${files.length} files with data for 2026:`);
  
  files.forEach((f, i) => {
      console.log(`${i+1}. [${f.uploadDate ? new Date(f.uploadDate).toLocaleString() : 'No Date'}] ${f.filename} (ID: ${f.id}) - ${f.recordCount} records`);
  });

  // Calculate total records in DB vs latest file
  const totalRecords = files.reduce((sum, f) => sum + Number(f.recordCount), 0);
  console.log(`\nTotal records in DB for 2026 files: ${totalRecords}`);

  if (files.length > 1) {
      const latestFile = files[0];
      const otherFilesCount = totalRecords - Number(latestFile.recordCount);
      console.log(`\nPotential Discrepancy:`);
      console.log(`Latest file (${latestFile.filename}) has ${latestFile.recordCount} records.`);
      console.log(`Other files correspond to ${otherFilesCount} records.`);
      console.log(`If "Other files" contain obsolete data, deleting them might fix the ${otherFilesCount} record difference (or value difference).`);
      
      // Calculate value sum of other files
      const obsoleteIds = files.slice(1).map(f => f.id);
      
      // Need a separate query for value
      // ...
  }
  
  process.exit(0);
}

analyzeFiles().catch(console.error);
