import "dotenv/config";
import { db } from "../server/db";
import { sigortaPoliceleri } from "../shared/schema";
import { sql } from "drizzle-orm";

async function resetSigorta() {
  try {
    console.log("Truncating sigorta_policeleri table...");
    await db.execute(sql`TRUNCATE TABLE sigorta_policeleri;`);
    console.log("Table truncated successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Failed to truncate table:", error);
    process.exit(1);
  }
}

resetSigorta();
