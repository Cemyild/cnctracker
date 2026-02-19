
import "dotenv/config";
import { db } from "../server/db";
import { gumrukVerileri, gumrukDosyalar } from "../shared/schema";
import { sql, eq, and, desc, not } from "drizzle-orm";

async function profileStaleData() {
  console.log("Profiling stale records...");

  const files = await db.select({ id: gumrukDosyalar.id }).from(gumrukDosyalar)
      .leftJoin(gumrukVerileri, eq(gumrukDosyalar.id, gumrukVerileri.dosyaId))
      .where(eq(gumrukVerileri.yil, 2026))
      .orderBy(desc(gumrukDosyalar.uploadDate))
      .limit(1);
  const latestFileId = files.length > 0 ? files[0].id : "";

  const staleRecords = await db.select()
      .from(gumrukVerileri)
      .where(and(
          eq(gumrukVerileri.yil, 2026),
          not(eq(gumrukVerileri.dosyaId, latestFileId))
      ))
      .orderBy(desc(gumrukVerileri.malBedeli));

  // 1. Group by Firm
  const byFirm: Record<string, { count: number, sum: number, avg: number }> = {};
  staleRecords.forEach(r => {
      const f = r.firmaUnvan || "Unknown";
      if (!byFirm[f]) byFirm[f] = { count: 0, sum: 0, avg: 0 };
      const val = parseFloat(r.malBedeli || "0");
      byFirm[f].count++;
      byFirm[f].sum += val;
  });

  console.log("\nTop Firms in Stale Data (by Sum):");
  Object.entries(byFirm)
      .sort((a, b) => b[1].sum - a[1].sum)
      .slice(0, 10)
      .forEach(([firm, stats]) => {
          console.log(`${firm}: ${stats.count} records, Sum: ${stats.sum.toLocaleString()}`);
      });

  // 2. Check for suspicious exact matches to partial discrepancy?
  // 113,045
  
  // 3. List top single invoices
  console.log("\nTop 10 Largest Stale Invoices:");
  staleRecords.slice(0, 10).forEach(r => {
      console.log(`- ${r.faturaNo}: ${r.malBedeli} (${r.firmaUnvan}) [Date: ${r.faturaTarihi}]`);
  });

  process.exit(0);
}

profileStaleData().catch(console.error);
