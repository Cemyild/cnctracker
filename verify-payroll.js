import fs from 'fs';
import { PDFParse } from 'pdf-parse';

const pdfPath = 'e:/CEM APPS/cnctracker/CNC GÜMRÜK EYLÜL BORDRO.pdf';

async function calculate() {
    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const parser = new PDFParse({ data: dataBuffer });
        const textResult = await parser.getText();
        const text = textResult.text;
        const pages = text.split(/-- \d+ of \d+ --/);

        const parseMoney = (s) => parseFloat(s.replace(/\./g, '').replace(',', '.'));
        const employees = [];

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
                const stopWords = ["TOPLAM", "Firma Ünvanı", "İmza", "Sıra No"];
                for (const word of stopWords) {
                    const stopIndex = block.indexOf(word);
                    if (stopIndex !== -1) block = block.substring(0, stopIndex);
                }

                const moneyRegex = /[\d.]+,\d{2}/g;
                const amounts = block.match(moneyRegex) || [];
                if (amounts.length < 12) continue;

                const gross = parseMoney(amounts[1]);
                const matrah = parseMoney(amounts[7]);
                const incomeTax = parseMoney(amounts[8]);
                const stampTax = parseMoney(amounts[9]);
                const empSSK = parseMoney(amounts[10]);
                const empUnempl = parseMoney(amounts[11]);
                const net = parseMoney(amounts[amounts.length - 3]);

                const kanun = block.includes("05510") ? "05510" : "00000";
                const isRetired = (empUnempl === 0 && empSSK > 0);

                employees.push({ name: current.name, gross, matrah, incomeTax, stampTax, empSSK, empUnempl, net, kanun, isRetired });
            }
        }

        // Verification
        let totalEmpSSK = 0;
        let totalEmpUnempl = 0;
        let totalIsvSSK = 0;
        let totalIsvUnempl = 0;
        let totalIncentive = 0;

        for (const e of employees) {
            totalEmpSSK += e.empSSK;
            totalEmpUnempl += e.empUnempl;
            if (e.isRetired) {
                // Retired: emp is 7.5%, isv is 24.5%
                totalIsvSSK += e.matrah * 0.245;
                totalIsvUnempl += 0;
            } else {
                // Normal
                totalIsvSSK += e.matrah * 0.205;
                totalIsvUnempl += e.matrah * 0.02;
                if (e.kanun === "05510") {
                    totalIncentive += e.matrah * 0.05;
                }
            }
        }

        console.log("Calculated Total Primi (Emp + Isv):", totalEmpSSK + totalEmpUnempl + totalIsvSSK + totalIsvUnempl);
        console.log("Calculated Total Incentive:", totalIncentive);
        console.log("Target Primi:", 367355.32);
        console.log("Target Incentive:", 31905.69);

        // If incentive mismatch, find the real factor
        // 31905.69 / totalMatrah05510...
        const totalMatrah05510 = employees.filter(e => e.kanun === "05510" && !e.isRetired).reduce((s, e) => s + e.matrah, 0);
        console.log("Total Matrah 05510 (Normal):", totalMatrah05510);
        console.log("Real Incentive Factor:", 31905.69 / totalMatrah05510);

        await parser.destroy();
    } catch (e) {
        console.error(e);
    }
}

calculate();
