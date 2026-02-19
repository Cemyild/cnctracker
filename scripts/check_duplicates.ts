import "dotenv/config";
import { db } from "../server/db";
import { gumrukVerileri } from "../shared/schema";
import { sql, eq, and, desc } from "drizzle-orm";

async function analyze() {
  console.log("Analyzing duplicates for 2026...");

  // 1. Find FaturaNo's that appear more than once
  const duplicates = await db.select({
    faturaNo: gumrukVerileri.faturaNo,
    count: sql<number>`count(*)`
  })
  .from(gumrukVerileri)
  .where(eq(gumrukVerileri.yil, 2026))
  .groupBy(gumrukVerileri.faturaNo)
  .having(sql`count(*) > 1`)
  .limit(5);

  console.log(`Found ${duplicates.length} duplicate groups (showing top 5).`);

  if (duplicates.length === 0) {
      console.log("No duplicates found by FaturaNo.");
      process.exit(0);
  }

  // 2. Analyze the first duplicate group
  const sampleFatura = duplicates[0].faturaNo;
  if (!sampleFatura) {
      console.log("FaturaNo is null for duplicate group?");
      process.exit(0);
  }

  console.log(`\nAnalyzing FaturaNo: ${sampleFatura}`);
  const rows = await db.select().from(gumrukVerileri).where(and(eq(gumrukVerileri.faturaNo, sampleFatura), eq(gumrukVerileri.yil, 2026)));

  rows.forEach((r, i) => {
      console.log(`\nRow ${i+1}:`);
      console.log(`  ID: ${r.id}`);
      console.log(`  DosyaID: ${r.dosyaId}`);
      console.log(`  RowHash: ${r.rowHash}`);
      console.log(`  MalBedeli: ${r.malBedeli}`);
      console.log(`  Firma: ${r.firmaUnvan}`);
  });

  process.exit(0);
}

analyze().catch(console.error);
