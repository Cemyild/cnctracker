
import "dotenv/config";
import { db } from "../server/db";
import { gumrukVerileri, gumrukDosyalar } from "../shared/schema";
import { sql, eq, and } from "drizzle-orm";

async function resetMonth() {
  const ay = "ocak";
  const yil = 2026;

  console.log(`RESETTING Gumruk Data for ${ay.toUpperCase()} ${yil}...`);
  console.log("This will delete ALL data for this month, allowing a clean re-upload.");

  // 1. Delete Veriler
  const deleted = await db.delete(gumrukVerileri)
      .where(and(eq(gumrukVerileri.ay, ay), eq(gumrukVerileri.yil, yil)))
      .returning({ id: gumrukVerileri.id });

  console.log(`Deleted ${deleted.length} records.`);

  // 2. Optional: Delete File records? 
  // Maybe keep them for audit, but usually cleaning them avoids confusion.
  // Let's keep them but maybe iterate to delete them if I can link them purely to this month.
  // The constraint is on gumrukVerileri.dosyaId. Since veriler are gone, files are just metadata.
  
  console.log("Reset Complete. Please re-upload the Excel file.");
  process.exit(0);
}

resetMonth().catch(console.error);
