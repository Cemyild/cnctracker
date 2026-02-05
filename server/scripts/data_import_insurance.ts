
import { db } from "../db";
import { araclar } from "@shared/schema";
import { eq } from "drizzle-orm";

const updates = [
  { plaka: "16 ASE 545", t_date: "2026-12-10", t_price: "15963.65", t_comp: "Ray Sigorta", k_date: "2026-01-21", k_price: "9254.41", k_comp: "Magdeburger" },
  { plaka: "16 CNC 56", t_date: "2026-12-03", t_price: "10179.32", t_comp: "Mapfre", k_date: "2026-01-21", k_price: "8120.41", k_comp: "Magdeburger" },
  { plaka: "16 CNC 60", t_date: "2026-12-13", t_price: "19156.37", t_comp: "Ray Sigorta", k_date: "2026-01-21", k_price: "16177.27", k_comp: "Allianz" },
  { plaka: "16 CNC 43", t_date: "2026-12-17", t_price: "15963.65", t_comp: "Ray Sigorta", k_date: "2026-01-21", k_price: "8120.41", k_comp: "Magdeburger" },
  { plaka: "16 CNC 47", t_date: "2026-12-16", t_price: "19156.37", t_comp: "Ray Sigorta", k_date: "2026-01-21", k_price: "15006.47", k_comp: "Allianz" },
  { plaka: "16 NC 764", t_date: "2026-12-17", t_price: "15963.65", t_comp: "Ray Sigorta", k_date: null, k_price: null, k_comp: null },
  { plaka: "16 CNC 27", t_date: "2026-12-16", t_price: "19156.37", t_comp: "Ray Sigorta", k_date: "2026-01-21", k_price: "12328.10", k_comp: "Unico" },
  { plaka: "16 BNB 745", t_date: "2026-11-06", t_price: "19398.34", t_comp: "Mapfre", k_date: "2026-11-06", k_price: "30377.97", k_comp: "Mapfre" },
  { plaka: "16 BNB 744", t_date: "2026-11-06", t_price: "19392.34", t_comp: "Mapfre", k_date: "2026-11-06", k_price: "30377.97", k_comp: "Mapfre" },
  { plaka: "16 BNB 747", t_date: "2026-11-06", t_price: "20482.33", t_comp: "Mapfre", k_date: "2026-11-06", k_price: "26909.42", k_comp: "Mapfre" },
  { plaka: "16 BNB 746", t_date: "2026-11-06", t_price: "19398.34", t_comp: "Mapfre", k_date: "2026-11-06", k_price: "30377.97", k_comp: "Mapfre" },
  { plaka: "16 BNB 748", t_date: "2026-11-06", t_price: "10697.84", t_comp: "Mapfre", k_date: "2026-11-06", "k_price": "24456.01", k_comp: "Mapfre" },
  { plaka: "16 CNC 13", t_date: "2026-11-19", t_price: "10663.86", t_comp: "Mapfre", k_date: null, k_price: null, k_comp: null },
  { plaka: "16 NY 176", t_date: "2026-02-20", t_price: "11627.60", t_comp: "Mapfre", k_date: "2026-02-18", k_price: "10465.00", k_comp: "Magdeburger" },
  { plaka: "16 NC 686", t_date: "2026-02-20", t_price: "11552.28", t_comp: "Mapfre", k_date: "2026-02-20", k_price: "16704.18", k_comp: "Türkiye Sigorta" },
  { plaka: "16 CNC 28", t_date: null, t_price: null, t_comp: null, k_date: "2026-01-21", k_price: "16341.10", k_comp: "Allianz" }
];

async function run() {
  console.log("Starting bulk update...");
  
  for (const item of updates) {
    try {
      // Clean whitespace
      const plaka = item.plaka.trim();
      
      const updateData: any = {};
      
      if (item.t_date) {
        updateData.trafikBitisTarihi = item.t_date;
        updateData.trafikSigortaFiyat = item.t_price;
        updateData.trafikSigortaSirketi = item.t_comp;
      }
      
      if (item.k_date) {
        updateData.kaskoBitisTarihi = item.k_date;
        updateData.kaskoSigortaFiyat = item.k_price;
        updateData.kaskoSigortaSirketi = item.k_comp;
      }

      const result = await db
        .update(araclar)
        .set(updateData)
        .where(eq(araclar.plaka, plaka))
        .returning({ updatedId: araclar.id });

      if (result.length > 0) {
        console.log(`✅ Updated ${plaka}`);
      } else {
        console.warn(`⚠️ Vehicle not found: ${plaka}`);
        // Optionally create user if needed, but safer to warn first
      }

    } catch (error) {
      console.error(`❌ Error updating ${item.plaka}:`, error);
    }
  }
  
  console.log("Bulk update completed.");
  process.exit(0);
}

run();
