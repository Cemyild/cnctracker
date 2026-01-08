import "dotenv/config";
import { db } from "../server/db";
import { calisanlar } from "@shared/schema";
import { sql } from "drizzle-orm";

async function main() {
    console.log("Cleaning up calisanlar table...");
    try {
        await db.delete(calisanlar);
        console.log("Successfully deleted all records from calisanlar table.");
    } catch (error) {
        console.error("Error cleaning up calisanlar table:", error);
        process.exit(1);
    }
    process.exit(0);
}

main();
