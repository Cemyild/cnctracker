
import { db } from "../server/db";
import { calisanlar } from "@shared/schema";
import { eq, like, sql } from "drizzle-orm";

async function main() {
    console.log("Deep debugging names...");
    
    // 1. Fetch 'CEM YILDIRIM' from DB and print its char codes
    const dbResults = await db.select({ name: calisanlar.adSoyad }).from(calisanlar).limit(100);
    
    const dbCem = dbResults.find(r => r.name?.includes("CEM"));
    if (dbCem) {
        console.log("Found in DB:", dbCem.name);
        console.log("Char codes:", dbCem.name?.split('').map(c => c.charCodeAt(0)));
    } else {
        console.log("Could not find CEM in first 100 rows");
    }

    const searchName = "CEM YILDIRIM";
    console.log("Search string:", searchName);
    console.log("Search char codes:", searchName.split('').map(c => c.charCodeAt(0)));

    // 2. Try LIKE query with wildcard
    const likeResult = await db.select().from(calisanlar).where(like(calisanlar.adSoyad, '%CEM YILDIRIM%')).limit(1);
    console.log("LIKE result count:", likeResult.length);
}

main().catch(console.error).then(() => process.exit(0));
