
import "dotenv/config";
import { db } from "../server/db";
import { araclar } from "../shared/schema";

const plates = [
    "16 AJJ 094",
    "16 ASE 545",
    "16 BNB 744",
    "16 BNB 745",
    "16 BNB 746",
    "16 BNB 747",
    "16 BNB 748",
    "16 CNC 13",
    "16 CNC 27",
    "16 CNC 28",
    "16 CNC 43",
    "16 CNC 47",
    "16 CNC 56",
    "16 CNC 60",
    "16 KC 725",
    "16 NC 686",
    "16 NC 764",
    "16 NCU 22",
    "16 NY 176"
];

async function seed() {
    console.log("Seeding vehicles...");
    try {
        for (const plate of plates) {
            await db.insert(araclar).values({
                plaka: plate,
                trafikPoliceNo: "", // Optional now, but providing empty string or null is fine. strict optional in schema means it can be null. 
                // effectively we can just omit optional fields if the type allows.
                // Let's rely on default behavior or explicit null if needed. 
                // Actually since I made them optional in schema (text(name)), they are nullable.
                // I will pass just plaka if possible, but typescript might want matches. 
                // InsertAracSchema is derived from createInsertSchema.
            } as any).onConflictDoNothing();
            console.log(`Added: ${plate}`);
        }
        console.log("Done seeding.");
        process.exit(0);
    } catch (e) {
        console.error("Error seeding:", e);
        process.exit(1);
    }
}

seed();
