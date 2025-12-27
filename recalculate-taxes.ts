
import { db } from './server/db.ts';
import { calisanlar } from './shared/schema.ts';
import { eq } from 'drizzle-orm';
import { calculateTaxesFromGross } from './server/payroll-engine.ts';

async function recalculateAll() {
    console.log("Starting full tax recalculation...");
    const allRecords = await db.select().from(calisanlar);

    let updatedCount = 0;

    for (const record of allRecords) {
        if (!record.brutUcret) continue;

        const gross = parseFloat(record.brutUcret); // This is fixed and correct now
        const kumulatifBase = parseFloat(record.kumulatifVergiMatrahi || "0") - parseFloat(record.gelirVergisiMatrahi || "0"); // Deduced previous base
        // Wait, if we recalculate GVM, we should re-add it to Previous Base to get New Cumulative?
        // Or just trust the `kumulatifVergiMatrahi` in DB? 
        // Problem: If previous calc was wrong, `gelirVergisiMatrahi` might be wrong, so `kumulatifVergiMatrahi` might be wrong.
        // Ideally we need `devredenMatrah` (Previous Cumulative) which we had in the import script.
        // We can approximate Previous Cumulative = Current Cumulative - Current Tax Base (from DB).
        // Since Gross is fixed, the "True" Current Tax Base might differ slightly from DB if rules changed.

        // Let's rely on (Current Cumulative - DB's Current GVM) as the "Previous Cumulative Base".
        const prevBase = Math.max(0, parseFloat(record.kumulatifVergiMatrahi || "0") - parseFloat(record.gelirVergisiMatrahi || "0"));

        const result = calculateTaxesFromGross(gross, prevBase, record.statu || "NORMAL");

        // Prepare Update
        await db.update(calisanlar)
            .set({
                // Gross is already correct.
                // Update everything else:
                netUcret: result.net.toFixed(2),
                sgkMatrahi: result.sgkMatrah.toFixed(2),
                gelirVergisiMatrahi: result.gvm.toFixed(2),
                kumulatifVergiMatrahi: (prevBase + result.gvm).toFixed(2),
                gelirVergisi: result.odenecekGV.toFixed(2),
                damgaVergisi: result.odenecekDV.toFixed(2),
                sigortaKesintisi: result.sgkIsci.toFixed(2),
                issizlikSigortasiKesintisi: result.issizlikIsci.toFixed(2),
                isverenSgkPayi: (result.isverenSgk - result.tesvik5510).toFixed(2), // Net cost after incentive? 
                // Wait, schema has `isverenSgkPayi`? Usually `isverenSgkPayi` is the raw amount, or net?
                // In import script we did: (result.isverenSgk - result.tesvik5510).toFixed(2)
                // Let's stick to that convention: Cost to Employer for SGK part.
                isverenIssizlikPayi: result.isverenIssizlik.toFixed(2),
                toplamIsverenMaliyeti: result.toplamIsveren.toFixed(2)
            })
            .where(eq(calisanlar.id, record.id));

        updatedCount++;
    }

    console.log(`Recalculated taxes for ${updatedCount} employees.`);
    process.exit(0);
}

recalculateAll();
