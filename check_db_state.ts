
import "dotenv/config";
import { db } from "./server/db";
import { gumrukVerileri, gumrukDosyalar } from "./shared/schema";
import { eq, and, isNotNull, desc } from "drizzle-orm";

async function checkState() {
  console.log("Checking DB State...");
  
  // 1. Check Files
  const files = await db.select().from(gumrukDosyalar).orderBy(desc(gumrukDosyalar.uploadDate));
  console.log("UPLOADED FILES:", JSON.stringify(files, null, 2));

  // 2. Check if ANY row has houseNo
  const anyHouse = await db.select({ houseNo: gumrukVerileri.houseNo })
    .from(gumrukVerileri)
    .where(isNotNull(gumrukVerileri.houseNo))
    .limit(5);

  console.log("Any rows with HouseNo?", anyHouse.length > 0 ? "YES" : "NO");
  if (anyHouse.length > 0) {
      console.log("Sample:", anyHouse[0]);
  }

  // 3. Count rows for JAN 2026
  const janRows = await db.select({ count: gumrukVerileri.id }).from(gumrukVerileri)
    .where(and(eq(gumrukVerileri.ay, 'ocak'), eq(gumrukVerileri.yil, 2026)));
    
  console.log("JAN 2026 Row Count:", janRows.length);

  process.exit(0);
}

checkState();
