import fs from 'fs';
import { PDFParse } from 'pdf-parse';

const pdfPath = 'e:/CEM APPS/cnctracker/CNC GÜMRÜK EYLÜL BORDRO.pdf';

async function scan() {
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
                if (block.indexOf("TOPLAM") !== -1) block = block.substring(0, block.indexOf("TOPLAM"));

                const moneyRegex = /[\d.]+,\d{2}/g;
                const amounts = block.match(moneyRegex) || [];
                const matrah = amounts[7] ? parseMoney(amounts[7]) : 0;
                const kanun = block.includes("05510") ? "05510" : "00000";
                const isRetired = block.includes("AYLIK") && amounts[11] === "0,00"; // simplistic retired check

                employees.push({ name: current.name, matrah, kanun, amounts });
            }
        }

        const totalMatrah05510 = employees.filter(e => e.kanun === "05510").reduce((s, e) => s + e.matrah, 0);
        console.log("Total Matrah 05510:", totalMatrah05510);
        console.log("5% of Total Matrah 05510:", totalMatrah05510 * 0.05);
        console.log("Target Incentive Total:", 31905.69);

        await parser.destroy();
    } catch (e) { console.error(e); }
}

scan();
