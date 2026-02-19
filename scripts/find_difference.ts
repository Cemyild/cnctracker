
import "dotenv/config";
import { db } from "../server/db";
import { gumrukVerileri } from "../shared/schema";
import { sql, eq, and, like, or } from "drizzle-orm";

async function findDifference() {
  const targetAmount = 113045.00;
  console.log(`Searching for records with amount: ${targetAmount}`);

  // 1. Search by exact amount in MalBedeli or TopFaturaTutar
  const exactMatches = await db.select()
    .from(gumrukVerileri)
    .where(and(
        eq(gumrukVerileri.yil, 2026),
        or(
            eq(gumrukVerileri.malBedeli, targetAmount.toString()),
            eq(gumrukVerileri.topFaturaTutar, targetAmount.toString())
        )
    ));

  console.log(`Found ${exactMatches.length} exact matches.`);
  exactMatches.forEach(r => {
      console.log(`ID: ${r.id}, Fatura: ${r.faturaNo}, Firma: ${r.firmaUnvan}, MalBedeli: ${r.malBedeli}, TopFatura: ${r.topFaturaTutar}, Tarih: ${r.faturaTarihi}`);
  });

  // 2. Search for duplicates by (Firma + MalBedeli + Tarih) but DIFFERENT FaturaNo
  console.log("\nChecking for potential duplicates (Same Firma, Amount, Date but different Invoice No)...");
  
  const potentialDupes = await db.execute(sql`
    SELECT 
        firma_unvan, 
        mal_bedeli, 
        fatura_tarihi,
        COUNT(*) as count,
        string_agg(fatura_no, ', ') as faturalar,
        string_agg(id::text, ', ') as ids
    FROM gumruk_verileri
    WHERE yil = 2026
    GROUP BY firma_unvan, mal_bedeli, fatura_tarihi
    HAVING COUNT(*) > 1
  `);

  // Filter and show significant ones (e.g. amounts > 1000)
  for (const row of potentialDupes.rows) {
      const amount = parseFloat(row.mal_bedeli as string);
      if (amount > 10000 && amount < 150000) { // Narrow down to range of interest
          console.log(`\nPotential Duplicate Group: ${row.count} records`);
          console.log(`  Firma: ${row.firma_unvan}`);
          console.log(`  Amount: ${row.mal_bedeli}`);
          console.log(`  Date: ${row.fatura_tarihi}`);
          console.log(`  Invoices: ${row.faturalar}`);
      }
  }

  process.exit(0);
}

findDifference().catch(console.error);
