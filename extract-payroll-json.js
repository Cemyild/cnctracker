import 'dotenv/config';
import fs from 'fs';
import { PDFParse } from 'pdf-parse';

const pdfPath = 'e:/CEM APPS/cnctracker/CNC GÜMRÜK EYLÜL BORDRO.pdf';

async function processPdf() {
    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const parser = new PDFParse({ data: dataBuffer });
        const textResult = await parser.getText();
        const text = textResult.text;

        const pages = text.split(/-- \d+ of \d+ --/);
        const results = [];

        const parseMoney = (s) => {
            if (!s) return 0;
            return parseFloat(s.replace(/\./g, '').replace(',', '.'));
        };

        for (let page of pages) {
            const recordStartRegex = /(\d{2}\.\d{2}\.\d{4})\s+\d+\s+\d+\s+([\d.,]+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+([A-ZÇĞİÖŞÜ ]+)/g;

            let match;
            const pageMatches = [];
            while ((match = recordStartRegex.exec(page)) !== null) {
                pageMatches.push({
                    index: match.index,
                    adSoyad: match[3].trim()
                });
            }

            for (let i = 0; i < pageMatches.length; i++) {
                const currentMatch = pageMatches[i];
                const nextIndex = pageMatches[i + 1] ? pageMatches[i + 1].index : page.length;
                let block = page.substring(currentMatch.index, nextIndex);

                const stopWords = ["TOPLAM", "Firma Ünvanı", "İmza", "Sıra No"];
                for (const word of stopWords) {
                    const stopIndex = block.indexOf(word);
                    if (stopIndex !== -1) block = block.substring(0, stopIndex);
                }

                const moneyRegex = /[\d.]+,\d{2}/g;
                const amounts = block.match(moneyRegex) || [];

                if (amounts.length >= 10 && currentMatch.adSoyad.length > 2) {
                    const name = currentMatch.adSoyad;
                    const gross = parseMoney(amounts[1] || amounts[0]);

                    const income_tax = parseMoney(amounts[8]);
                    const stamp_tax = parseMoney(amounts[9]);
                    const employee_ssk = parseMoney(amounts[10]);
                    const employee_unemployment = parseMoney(amounts[11]);

                    const net_salary = parseMoney(amounts[amounts.length - 3]);

                    // Decide if retired
                    const isRetired = block.includes("SGDP") || employee_unemployment === 0;

                    let employer_ssk = 0;
                    let employer_unemployment = 0;

                    const matrah = gross;

                    if (isRetired) {
                        employer_ssk = parseFloat((matrah * 0.245).toFixed(2));
                        employer_unemployment = 0;
                    } else {
                        employer_ssk = parseFloat((matrah * 0.205).toFixed(2));
                        employer_unemployment = parseFloat((matrah * 0.02).toFixed(2));
                    }

                    results.push({
                        name,
                        gross_salary: gross,
                        net_salary: net_salary,
                        income_tax: income_tax,
                        stamp_tax: stamp_tax,
                        employee_ssk: employee_ssk,
                        employee_unemployment: employee_unemployment,
                        employer_ssk: employer_ssk,
                        employer_unemployment: employer_unemployment,
                        total_employer_cost: parseFloat((gross + employer_ssk + employer_unemployment).toFixed(2))
                    });
                }
            }
        }

        fs.writeFileSync('final_payroll.json', JSON.stringify(results, null, 2), 'utf8');
        await parser.destroy();
    } catch (error) {
        // ...
    }
}

processPdf();
