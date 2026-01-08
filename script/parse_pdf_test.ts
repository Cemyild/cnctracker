
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

async function main() {
    try {
        console.log("Reading file...");
        const dataBuffer = fs.readFileSync('Cilt1.pdf');

        console.log("Parsing PDF...");
        const parser = new PDFParse({ data: dataBuffer });
        const result = await parser.getText();
        const text = result.text;

        const lines = text.split('\n');

        console.log("--- SEARCHING FOR FOOTER ---");
        for (let k = 0; k < lines.length; k++) {
            if (lines[k].includes("Toplam") || lines[k].includes("TOPLAM")) {
                console.log(`FOOTER FOUND at [${k}]: "${lines[k]}"`);
            }
            if (lines[k].includes("YUSUF") || lines[k].includes("yusuf")) {
                console.log(`YUSUF FOUND at [${k}]: "${lines[k]}"`);
            }
        }
        console.log("--- END SEARCH ---");

        console.log("--- SEARCHING FOR OFFICES ---");
        const offices = ["Merkez", "Yönetim", "Gemlik", "İstanbul"];
        for (let k = 0; k < lines.length; k++) {
            offices.forEach(off => {
                // Determine if line is JUST the office name or contains it significantly
                if (lines[k].trim() === off || lines[k].includes(off)) {
                    console.log(`OFFICE CANDIDATE [${off}] at [${k}]: "${lines[k]}"`);
                }
            });
        }
        console.log("--- END OFFICE SEARCH ---");

        const employees: any[] = [];
        let currentEmployee: any = null;

        const parseMoney = (str: string) => {
            if (!str) return 0;
            return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check for footer
            if (line.includes("Genel Toplam") || line.includes("GENEL TOPLAM")) {
                console.log(`Hit Footer at line ${i}, stopping employee parsing.`);
                break;
            }

            // Corrected Regex: Match ANY digit followed by NAME at the end of the line
            // e.g. "0 1 NAME" or "0 0 NAME"
            const nameMatch = line.match(/\s+\d+\s+([A-ZĞÜŞİÖÇ\s]{2,})$/);

            // Additional check: Line must Start with a Date to be a valid Employee Entry
            const startsWithDate = /^\d{2}\.\d{2}\.\d{4}/.test(line);

            if (nameMatch && startsWithDate) {
                const namePart = nameMatch[1].trim();
                if (currentEmployee) empPush(employees, currentEmployee);

                currentEmployee = {
                    adSoyad: namePart,
                    rawLines: []
                };

                const dateMatch = line.match(/(\d{2}\.\d{2}\.\d{4})\s+/);
                if (dateMatch) currentEmployee.isGirisTarihi = dateMatch[1];
            }

            if (currentEmployee) {
                currentEmployee.rawLines.push(line);
                if (!currentEmployee.tcNo) {
                    // Exact 11 digits
                    if (/^\d{11}$/.test(line)) {
                        currentEmployee.tcNo = line;
                    }
                }
            }
        }
        if (currentEmployee) empPush(employees, currentEmployee);

        function empPush(list: any[], emp: any) {
            const allMoney: number[] = [];
            emp.rawLines.forEach((l: string) => {
                const matches = l.match(/\d{1,3}(\.\d{3})*,\d{2}/g);
                if (matches) matches.forEach(m => allMoney.push(parseMoney(m)));
            });

            // Heuristic Validation
            const maxVal = Math.max(...allMoney);
            const brut = maxVal;

            // Net is the LAST value that is > 30% of Brut
            let net = 0;
            for (let i = allMoney.length - 1; i >= 0; i--) {
                if (allMoney[i] > brut * 0.30) {
                    net = allMoney[i];
                    break;
                }
            }

            //  console.log(`Debug ${emp.adSoyad}: Brut ${brut}, Net ${net}`);
            // If Net > Brut (can happen if logic fails), swap? No.

            // Status Logic
            const managers = [
                "NEŞE YILDIRIM", "CENGİZ ÜNER", "COŞKUN YILDIRIM",
                "ÖZCAN EREN", "ÖZGÜR KÖSE", "CEM YILDIRIM", "ENİS ÜNER"
            ];

            let statu = "NORMAL";

            // 1. Check Manager List
            if (managers.some(m => emp.adSoyad.includes(m))) {
                statu = "YÖNETİCİ";
            } else {
                // 2. Check Kanun No in raw lines
                // Look for 05510 or 00000
                const hasNormalCode = emp.rawLines.some((l: string) => l.includes("05510"));
                const hasRetiredCode = emp.rawLines.some((l: string) => l.includes("00000"));

                if (hasRetiredCode) statu = "EMEKLİ";
                else if (hasNormalCode) statu = "NORMAL";

                // If both or neither, defaulting to NORMAL is safer or check precedence
            }

            console.log(`  > Statu: ${statu}`);

            emp.brutUcret = brut;
            emp.netUcret = net;
            emp.statu = statu;
            list.push(emp);
        }

        console.log("Parsed " + employees.length + " employees");
        // Print the last 2 employees to check Kaan
        console.log(JSON.stringify(employees.slice(-2), null, 2));

    } catch (e) {
        console.error(e);
    }
}
main();
