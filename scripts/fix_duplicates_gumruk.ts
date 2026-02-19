
import "dotenv/config";
import { db } from "../server/db";
import { gumrukVerileri, gumrukDosyalar } from "../shared/schema";
import { sql, eq, and, desc, inArray } from "drizzle-orm";

async function fixDuplicates() {
  console.log("Analyzing and fixing duplicates for 2026...");

  // 1. Find FaturaNo's that appear more than once for 2026
  const duplicates = await db.select({
    faturaNo: gumrukVerileri.faturaNo,
    count: sql<number>`count(*)`
  })
  .from(gumrukVerileri)
  .where(and(eq(gumrukVerileri.yil, 2026)))
  .groupBy(gumrukVerileri.faturaNo)
  .having(sql`count(*) > 1`);

  console.log(`Found ${duplicates.length} duplicate groups.`);

  if (duplicates.length === 0) {
      console.log("No duplicates found.");
      process.exit(0);
  }

  let deletedCount = 0;
  let keptCount = 0;

  for (const dup of duplicates) {
      if (!dup.faturaNo) continue;

      // Get all rows for this faturaNo
      const rows = await db.select({
          id: gumrukVerileri.id,
          dosyaId: gumrukVerileri.dosyaId,
          uploadDate: gumrukDosyalar.uploadDate
      })
      .from(gumrukVerileri)
      .leftJoin(gumrukDosyalar, eq(gumrukVerileri.dosyaId, gumrukDosyalar.id))
      .where(and(
          eq(gumrukVerileri.faturaNo, dup.faturaNo),
          eq(gumrukVerileri.yil, 2026)
      ))
      .orderBy(desc(gumrukDosyalar.uploadDate)); // Newest upload first

      if (rows.length <= 1) continue;

      // Keep the first one (newest upload)
      const toKeep = rows[0];
      const toDelete = rows.slice(1);

      const deleteIds = toDelete.map(r => r.id);
      
      console.log(`Fatura ${dup.faturaNo}: Keeping ID ${toKeep.id} (Date: ${toKeep.uploadDate}), Deleting ${deleteIds.length} older rows.`);

      if (deleteIds.length > 0) {
          await db.delete(gumrukVerileri)
              .where(inArray(gumrukVerileri.id, deleteIds));
          deletedCount += deleteIds.length;
      }
      keptCount++;
  }

  console.log(`\nCleanup Complete.`);
  console.log(`Kept ${keptCount} unique records.`);
  console.log(`Deleted ${deletedCount} duplicate records.`);

  process.exit(0);
}

fixDuplicates().catch(console.error);
