import fs from 'fs';
import { PDFParse } from 'pdf-parse';

const pdfPath = 'e:/CEM APPS/cnctracker/CNC GÜMRÜK EYLÜL BORDRO.pdf';

async function generate() {
    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const parser = new PDFParse({ data: dataBuffer });
        const textResult = await parser.getText();
        const text = textResult.text;
        const pages = text.split(/-- \d+ of \d+ --/);

        const parseMoney = (s) => {
            if (!s) return 0;
            return parseFloat(s.replace(/\./g, '').replace(',', '.'));
        };

        const results = [];

        for (let page of pages) {
            const recordStartRegex = /(\d{2}\.\d{2}\.\d{4})\s+\d+\s+\d+\s+([\d.,]+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+([A-ZÇĞİÖŞÜ ]+)/g;
            let match;
            const pageMatches = [];
            while ((match = recordStartRegex.exec(page)) !== null) {
                pageMatches.push({ index: match.index, name: match[3].trim() });
            }

            for (let i = 0; i < pageMatches.length; i++) {
                const current = pageMatches[i];
                const nextIndex = pageMatches[i + 1] ? pageMatches[i + 1].index : page.length;
                let block = page.substring(current.index, nextIndex);
                if (block.indexOf("TOPLAM") !== -1) block = block.substring(0, block.indexOf("TOPLAM"));

                const moneyRegex = /[\d.]+,\d{2}/g;
                const amounts = block.match(moneyRegex) || [];
                if (amounts.length < 12) continue;

                const gross = parseMoney(amounts[1]);
                const matrah = parseMoney(amounts[7]);
                const incomeTax = parseMoney(amounts[8]);
                const stampTax = parseMoney(amounts[9]);
                const employeeSsk = parseMoney(amounts[10]);
                const employeeUnemp = parseMoney(amounts[11]);
                const net = parseMoney(amounts[amounts.length - 3]);

                // Kanun No search
                const kanunMatch = block.match(/\s(05510|00000)\s/) || [null, "00000"];
                const kanun = kanunMatch[1] || "00000";

                const isRetired = (employeeUnemp === 0 && employeeSsk > 0);

                let employerSsk = 0;
                let employerUnemp = 0;
                let incentive = 0;

                if (isRetired) {
                    employerSsk = matrah * 0.245;
                    employerUnemp = 0;
                    incentive = 0;
                } else {
                    employerSsk = matrah * 0.205;
                    employerUnemp = matrah * 0.02;
                    if (kanun === "05510") {
                        incentive = matrah * 0.05;
                    }
                }

                results.push({
                    name: current.name,
                    gross_salary: gross,
                    net_salary: net,
                    employee_ssk: employeeSsk,
                    employee_unemployment: employeeUnemp,
                    income_tax: incomeTax,
                    stamp_tax: stampTax,
                    employer_ssk: parseFloat(employerSsk.toFixed(2)),
                    employer_unemployment: parseFloat(employerUnemp.toFixed(2)),
                    incentive_discount: parseFloat(incentive.toFixed(2)),
                    employer_total_after_incentive: parseFloat((employerSsk + employerUnemp - incentive).toFixed(2))
                });
            }
        }

        fs.writeFileSync('final_payroll_v2.json', JSON.stringify(results, null, 2), 'utf8');
        console.log(`Saved ${results.length} records.`);
        await parser.destroy();
    } catch (e) { console.error(e); }
}

generate();
