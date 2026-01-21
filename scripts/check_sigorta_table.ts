import "dotenv/config";
import { db } from "../server/db";
import { sigortaPoliceleri } from "../shared/schema";
import { sql } from "drizzle-orm";

async function check() {
  try {
    console.log("Checking DB connection...");
    // Check if table exists
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'sigorta_policeleri'
      );
    `);
    console.log("Table 'sigorta_policeleri' exists:", result.rows[0]);

    // Try a simple select
    const count = await db.select({ count: sql`count(*)` }).from(sigortaPoliceleri);
    console.log("Row count:", count);

    process.exit(0);
  } catch (error) {
    console.error("DB Check Failed:", error);
    process.exit(1);
  }
}

check();
