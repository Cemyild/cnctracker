
import { db } from "../server/db";
import { calisanlar } from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

async function main() {
    console.log("Testing manager query with inArray...");

    const yil = 2024;
    const managerNames = ["CEM YILDIRIM", "ENİS ÜNER", "NEŞE YILDIRIM", "COŞKUN YILDIRIM", "CENGİZ ÜNER"];

    console.log("Running query for Year:", yil);

    try {
        const managementData = await db
            .select({
                ay: calisanlar.ay,
                yonetimNet: sql<string>`sum(${calisanlar.netUcret})`,
            })
            .from(calisanlar)
            .where(
                and(
                    eq(calisanlar.yil, yil),
                    inArray(calisanlar.adSoyad, managerNames)
                )
            )
            .groupBy(calisanlar.ay);

        console.log("Query Results:", managementData);
    } catch (e) {
        console.error("Query Failed:", e);
    }
}

main().catch(console.error).then(() => process.exit(0));
