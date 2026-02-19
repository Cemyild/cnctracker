
import "dotenv/config";
import { db } from "../server/db";
import { gumrukVerileri, gumrukDosyalar } from "../shared/schema";
import { sql, eq, and, desc, ne, not } from "drizzle-orm";

async function findSubsetSum() {
  const target = 113045.00;
  console.log(`Searching for subset summing to ${target}...`);

  // 1. Get Latest File ID (to prioritize/check)
  const files = await db.select({ id: gumrukDosyalar.id }).from(gumrukDosyalar)
      .leftJoin(gumrukVerileri, eq(gumrukDosyalar.id, gumrukVerileri.dosyaId))
      .where(eq(gumrukVerileri.yil, 2026))
      .orderBy(desc(gumrukDosyalar.uploadDate))
      .limit(1);
  const latestFileId = files.length > 0 ? files[0].id : "";

  // 2. Fetch all candidates (exclude records from latest file? No, ghosts are from OLD files)
  // Actually, we must ONLY look at records from OLD files.
  // Records from Latest file are definitely valid (user just uploaded them).
  // The discrepancy comes from OLD files.
  const records = await db.select({
      id: gumrukVerileri.id,
      amount: gumrukVerileri.malBedeli, // Assuming user meant MalBedeli ("Toplam Satis")
      fatura: gumrukVerileri.faturaNo,
      firma: gumrukVerileri.firmaUnvan,
      dosyaId: gumrukVerileri.dosyaId, // Check if this is NOT latest
      tip: gumrukVerileri.tip
  })
  .from(gumrukVerileri)
  .where(and(
      eq(gumrukVerileri.yil, 2026),
      not(eq(gumrukVerileri.dosyaId, latestFileId)) // Optimization: Only look at old files
  ));

  console.log(`Analyzing ${records.length} records from older files...`);

  // Filter valid amounts
  const items = records
      .map(r => ({ ...r, val: parseFloat(r.amount || "0") }))
      .filter(r => r.val > 0 && r.val <= target); // Optimization

  console.log(`Filtered to ${items.length} candidate items <= ${target}`);

  // 3. Subset Sum (Recursive with pruning or DP?)
  // DP is too heavy for floats (unless scaled). Scaled to pennies: 11,304,500. Array size 11M is doable (11MB).
  // Let's try scaled DP.
  
  const scale = 100;
  const targetInt = Math.round(target * scale);
  
  // Try finding strict match
  // Since we want specific combination, and items might be many...
  // Let's assume the number of items in the subset is small (e.g. < 10).
  
  function findCombination(remaining: number, startIdx: number, currentPath: any[]): any[] | null {
      if (remaining === 0) return currentPath;
      if (remaining < 0) return null;
      if (startIdx >= items.length) return null;

      // Try including
      const res1 = findCombination(remaining - Math.round(items[startIdx].val * scale), startIdx + 1, [...currentPath, items[startIdx]]);
      if (res1) return res1;

      // Try excluding
      // Optimization: if remaining is smaller than smallest item? (need sort)
      const res2 = findCombination(remaining, startIdx + 1, currentPath);
      if (res2) return res2;

      return null;
  }

  // Sorting helps pruning
  items.sort((a, b) => b.val - a.val); // Descending

  console.log("Starting search (Randomized/Heuristic or just simple recursive?)...");
  
  // Since recursion depth 2000 is impossible, we can't use simple recursion.
  // Use Meet-in-the-middle or just check small combinations.
  // Assume it's composed of 1-5 invoices.
  
  for (let size = 1; size <= 5; size++) {
      console.log(`Checking combinations of size ${size}...`);
      const res = findComboOfSize(target, items, size);
      if (res) {
          console.log("\nFOUND MATCH!");
          let total = 0;
          res.forEach(r => {
              console.log(`${r.val.toFixed(2)} - ${r.firma} (${r.fatura}) [ID: ${r.id}]`);
              total += r.val;
          });
          console.log(`Total: ${total.toFixed(2)}`);
          process.exit(0);
      }
  }

  console.log("No small combination found. The discrepancy might be complex or involve KDV differences.");
  process.exit(0);
}

function findComboOfSize(target: number, items: any[], k: number): any[] | null {
    if (k === 0) return Math.abs(target) < 0.01 ? [] : null;
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.val > target + 0.01) continue; // Prune
        
        // Recursive (k is small, so depth is small)
        // Optimization: slice array to avoid reuse?
        const subResult = findComboOfSize(target - item.val, items.slice(i + 1), k - 1);
        if (subResult) {
            return [item, ...subResult];
        }
    }
    return null;
}

findSubsetSum().catch(console.error);
