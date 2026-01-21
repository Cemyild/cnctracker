
import * as dotenv from "dotenv";
dotenv.config();
import { db } from "../server/db";
import { sigortaMuhasebeKayitlari } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Deleting Mapfre accounting records...");
  try {
    await db.delete(sigortaMuhasebeKayitlari)
      .where(eq(sigortaMuhasebeKayitlari.sirket, "Mapfre"));
    console.log("Successfully deleted Mapfre accounting records.");
  } catch (error) {
    console.error("Error deleting records:", error);
  }
  process.exit(0);
}

main();
