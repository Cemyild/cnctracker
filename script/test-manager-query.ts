
import { db } from "../server/db";
import { calisanlar } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

async function main() {
    console.log("Testing manager query...");

    const yil = 2024; // Test with a year that definitely has data
    const managerNames = ["CEM YILDIRIM", "ENİS ÜNER", "NEŞE YILDIRIM", "COŞKUN YILDIRIM", "CENGİZ ÜNER"];

    // Try the Exact Logic from storage.ts
    const nameConditions = managerNames.map(name => sql`UPPER(${calisanlar.adSoyad}) LIKE ${'%' + name + '%'}`);

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
                    sql`(${sql.join(nameConditions, sql` OR `)})`
                )
            )
            .groupBy(calisanlar.ay);

        console.log("Query Results:", managementData);
    } catch (e) {
        console.error("Query Failed:", e);
    }
}

main().catch(console.error).then(() => process.exit(0));
