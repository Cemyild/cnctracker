
import 'dotenv/config';
import { storage } from "../server/storage";

async function runDebug() {
    console.log("--- DEBUG START: HMMU2071981 ---");

    try {
        // 1. Get Customs Data
        const allGumruk = await storage.getAllGumrukVerileri();
        console.log(`Total Customs Records: ${allGumruk.length}`);

        const candidates = allGumruk.filter(g => 
            g.houseNo && g.houseNo.replace(/[^A-Z0-9]/g, '').toUpperCase().includes("HMMU2071981")
        );

        console.log(`\nFound ${candidates.length} candidates in Gumruk for HMMU2071981:`);
        candidates.forEach((c, i) => {
            console.log(`\nCandidate #${i+1}:`);
            console.log(`  ID: ${c.id}`);
            console.log(`  Firma: ${c.firmaUnvan}`);
            console.log(`  HouseNo (Raw): '${c.houseNo}'`);
            console.log(`  TescilTarihi: ${c.tescilTarihi}`);
            console.log(`  FaturaTarihi: ${c.faturaTarihi}`);
            console.log(`  Full Data: `, JSON.stringify(c)); // Check if fields are actually populated
        });

        // 2. Get Logistics Data
        const allNakliye = await storage.getNakliyeVerileri();
        console.log(`Total Nakliye Records: ${allNakliye.length}`);
        
        // Search by Invoice No ...011 (Correct one for HMMU2071981 based on screenshot)
        let targetInvoice = allNakliye.find(n => n.faturaNo && n.faturaNo.includes("GIB2026000000011"));

        if (targetInvoice) {
            console.log("\nFound Nakliye by Fatura No '...011':");
        } else {
             targetInvoice = allNakliye.find(n => n.konteynerler && n.konteynerler.toUpperCase().includes("HMMU2071981"));
        }
        
        // ... (rest is same)

        if (!targetInvoice) {
             console.log("Could not find invoice. Listing first 3 invoices:");
             allNakliye.slice(0, 3).forEach(n => console.log(`  ${n.faturaNo} - ${n.konteynerler}`));
             return;
        }

        console.log(`\nTarget Logistics Invoice Found:`);
        console.log(`  ID: ${targetInvoice.id}`);
        console.log(`  Fatura No: ${targetInvoice.faturaNo}`);
        console.log(`  Fatura Tarihi: ${targetInvoice.faturaTarihi}`);
        console.log(`  Konteynerler (Raw): '${targetInvoice.konteynerler}'`);
        console.log(`  Mal/Hizmet: '${targetInvoice.malHizmet}'`);

        // Test Extraction Logic (Relaxed Regex)
        // Removed leading \b to handle "TaşimaHMMU..."
        const containerRegex = /([A-Z]{4})\s*(\d{6,7})\b/g; 
        const extracted = (targetInvoice.malHizmet || "").match(containerRegex);
        const extractedStr = extracted ? Array.from(new Set(extracted)).join(", ") : "NONE";
        
        console.log(`\n--- DYNAMIC EXTRACTION TEST ---`);
        console.log(`  Regex Result: ${extractedStr}`);
        console.log(`  Current DB Value: '${targetInvoice.konteynerler}'`);
        
        const activeContainer = extractedStr !== "NONE" ? extractedStr : targetInvoice.konteynerler;
        console.log(`  Active Container for Matching: '${activeContainer}'`);

        // 3. Simulate Logic
        console.log("\n--- SIMULATING MATCH LOGIC ---");
        
        // Parse Invoice Date
        let invoiceDate = null;
        if (targetInvoice.faturaTarihi) {
             const parts = targetInvoice.faturaTarihi.split('.');
             if (parts.length === 3) {
                 invoiceDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
             } else {
                 invoiceDate = new Date(targetInvoice.faturaTarihi);
             }
        }
        console.log(`  Parsed Invoice Date: ${invoiceDate}`);

        // Check Candidates
        for (const cand of candidates) {
            console.log(`\n  Checking Candidate #${cand.id}:`);
            
            let tescilDate = null;
            if (cand.tescilTarihi) {
                const tParts = cand.tescilTarihi.split('.');
                if (tParts.length === 3) {
                    tescilDate = new Date(parseInt(tParts[2]), parseInt(tParts[1]) - 1, parseInt(tParts[0]));
                }
            }
            if (!tescilDate && cand.faturaTarihi) {
                 console.log("    No TescilTarihi, trying FaturaTarihi...");
                 const fParts = cand.faturaTarihi.split('.');
                 if (fParts.length === 3) {
                     tescilDate = new Date(parseInt(fParts[2]), parseInt(fParts[1]) - 1, parseInt(fParts[0]));
                 }
            }

            console.log(`    Parsed Custom Date: ${tescilDate}`);

            if (invoiceDate && tescilDate) {
                const diffTime = Math.abs(tescilDate.getTime() - invoiceDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                console.log(`    Diff Days: ${diffDays}`);
                if (diffDays <= 45) {
                    console.log("    Result: MATCH OK (Within 45 days)");
                } else {
                    console.log("    Result: FAIL (Outside 45 days)");
                }
            } else {
                console.log("    Result: FAIL (Date parsing failed)");
            }
        }

    } catch (e) {
        console.error("Script Error:", e);
    }
}

runDebug();
