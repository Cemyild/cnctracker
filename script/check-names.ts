
import { db } from "../server/db";
import { calisanlar } from "@shared/schema";

async function main() {
  const names = await db.selectDistinct({ name: calisanlar.adSoyad }).from(calisanlar);
  console.log("All Names:", names.map(n => n.name).sort());
  
  const managers = ["CEM YILDIRIM", "ENİS ÜNER", "NEŞE YILDIRIM", "COŞKUN YILDIRIM", "CENGİZ ÜNER"];
  console.log("Looking for managers:", managers);

  const matched = names.filter(n => {
      const dbName = n.name?.toUpperCase() || "";
      return managers.some(m => dbName.includes(m));
  });
  console.log("Direct JS Matches:", matched);
}

main().catch(console.error).then(() => process.exit(0));
