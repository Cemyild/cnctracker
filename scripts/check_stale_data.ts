
import "dotenv/config";
import { db } from "../server/db";
import { gumrukVerileri, gumrukDosyalar } from "../shared/schema";
import { sql, eq, and, desc, not } from "drizzle-orm";

async function checkStaleData() {
  console.log("Checking value of stale data for 2026...");

  // 1. Identify the latest file ID
  const files = await db.select({
      id: gumrukDosyalar.id,
      uploadDate: gumrukDosyalar.uploadDate
  })
  .from(gumrukDosyalar)
  .leftJoin(gumrukVerileri, eq(gumrukDosyalar.id, gumrukVerileri.dosyaId))
  .where(eq(gumrukVerileri.yil, 2026)) // Only files that actually have data in 2026
  .groupBy(gumrukDosyalar.id, gumrukDosyalar.uploadDate)
  .orderBy(desc(gumrukDosyalar.uploadDate))
  .limit(1);

  if (files.length === 0) {
      console.log("No files found.");
      process.exit(0);
  }

  const latestFileId = files[0].id;
  console.log(`Latest File ID: ${latestFileId}`);

  // 2. Sum MalBedeli of records NOT in the latest file
  const staleStats = await db.select({
      count: sql<number>`count(*)`,
      totalMalBedeli: sql<string>`sum(${gumrukVerileri.malBedeli})`,
      totalFaturaTutar: sql<string>`sum(${gumrukVerileri.topFaturaTutar})`
  })
  .from(gumrukVerileri)
  .where(and(
      eq(gumrukVerileri.yil, 2026),
      not(eq(gumrukVerileri.dosyaId, latestFileId))
  ));

  const stats = staleStats[0];
  console.log(`\nStale Records (not in latest file):`);
  console.log(`Count: ${stats.count}`);
  console.log(`Total MalBedeli: ${stats.totalMalBedeli}`);
  console.log(`Total TopFaturaTutar: ${stats.totalFaturaTutar}`);

  // 3. Drill down: List specific invalid records if count is small, or grouped findings
  if (Number(stats.count) > 0) {
      console.log(`\nFound ${stats.count} stale records. Comparing with discrepancy...`);
  }

  process.exit(0);
}

checkStaleData().catch(console.error);
