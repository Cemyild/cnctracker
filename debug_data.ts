
import "dotenv/config";
import { db } from "./server/db";
import { gumrukVerileri } from "./shared/schema";
import { sql } from "drizzle-orm";

async function checkData() {
  try {
    const result = await db.select({
      firma_unvan: gumrukVerileri.firmaUnvan,
      fatura_no: gumrukVerileri.faturaNo,
      mal_bedeli: gumrukVerileri.malBedeli
    }).from(gumrukVerileri).limit(10);
    
    console.log("Sample Data from gumruk_verileri:");
    console.table(result);
  } catch (err) {
    console.error(err);
  }
}

checkData();
