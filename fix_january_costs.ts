// Fix script to recalculate toplamIsverenMaliyeti for January 2025
// This script updates employee records where the total cost is 0 but should be brut + employer SGK

import { db } from './server/db';
import { calisanlar } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

async function fixJanuaryCosts() {
    console.log('Starting to fix January 2025 employee costs...');

    try {
        // Get all January 2025 employees with 0 total cost
        const employees = await db
            .select()
            .from(calisanlar)
            .where(and(
                eq(calisanlar.ay, '1'),
                eq(calisanlar.yil, 2025),
                eq(calisanlar.toplamIsverenMaliyeti, 0)
            ));

        console.log(`Found ${employees.length} employees with 0 total cost in January 2025`);

        let fixed = 0;
        for (const emp of employees) {
            // Calculate correct total: brutUcret + isverenSgkPayi
            const correctTotal = Number(emp.brutUcret || 0) + Number(emp.isverenSgkPayi || 0);

            if (correctTotal > 0) {
                await db
                    .update(calisanlar)
                    .set({ toplamIsverenMaliyeti: correctTotal })
                    .where(eq(calisanlar.id, emp.id));

                fixed++;
                console.log(`Fixed ${emp.adSoyad}: ₺${emp.brutUcret} + ₺${emp.isverenSgkPayi} = ₺${correctTotal}`);
            }
        }

        console.log(`\nSuccessfully fixed ${fixed} employee records!`);
    } catch (error) {
        console.error('Error fixing January costs:', error);
        process.exit(1);
    }

    process.exit(0);
}

fixJanuaryCosts();
