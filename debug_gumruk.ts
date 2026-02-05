
import "dotenv/config";
import { db } from "./server/db";
import { gumrukVerileri } from "./shared/schema";
import { eq, and, sql } from "drizzle-orm";

async function checkData() {
  console.log("Checking DB for HMMU2071981...");
  
  // 1. Search in formatted column
  const results = await db.select().from(gumrukVerileri)
    .where(and(
      eq(gumrukVerileri.yil, 2026),
      eq(gumrukVerileri.ay, 'ocak')
    ))
    .limit(10); // Sample 10 to check keys

  console.log(`Total sample rows: ${results.length}`);
  
  if (results.length > 0) {
    const raw = JSON.parse(results[0].rawData || "{}");
    console.log("Sample Raw Keys:", Object.keys(raw));
    console.log("Sample HouseNo Column:", results[0].houseNo);
  }

  // 2. Search in Raw Data specifically for the container
  const rawMatch = await db.select({
      id: gumrukVerileri.id,
      houseNo: gumrukVerileri.houseNo,
      rawData: gumrukVerileri.rawData
  }).from(gumrukVerileri)
    .where(sql`raw_data LIKE '%HMMU2071981%'`);

  console.log("Raw Match Count:", rawMatch.length);
  if (rawMatch.length > 0) {
      console.log("Matched Row HouseNo:", rawMatch[0].houseNo);
      console.log("Matched Row RawData:", rawMatch[0].rawData);
  }

  process.exit(0);
}

checkData();
