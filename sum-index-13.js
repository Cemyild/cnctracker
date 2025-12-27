import fs from 'fs';
import { PDFParse } from 'pdf-parse';

const pdfPath = 'e:/CEM APPS/cnctracker/CNC GÜMRÜK EYLÜL BORDRO.pdf';

async function sumIncentive() {
    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const parser = new PDFParse({ data: dataBuffer });
        const textResult = await parser.getText();
        const text = textResult.text;
        const pages = text.split(/-- \d+ of \d+ --/);

        const parseMoney = (s) => parseFloat(s.replace(/\./g, '').replace(',', '.'));
        let total = 0;

        for (let page of pages) {
            const moneyRegex = /[\d.]+,\d{2}/g;
            const recordStartRegex = /(\d{2}\.\d{2}\.\d{4})\s+\d+\s+\d+\s+([\d.,]+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+([A-ZÇĞİÖŞÜ ]+)/g;
            let match;
            const pageMatches = [];
            while ((match = recordStartRegex.exec(page)) !== null) {
                pageMatches.push({ index: match.index });
            }
            for (let i = 0; i < pageMatches.length; i++) {
                const nextIndex = pageMatches[i + 1] ? pageMatches[i + 1].index : page.length;
                let block = page.substring(pageMatches[i].index, nextIndex);
                if (block.indexOf("TOPLAM") !== -1) block = block.substring(0, block.indexOf("TOPLAM"));
                const amounts = block.match(moneyRegex) || [];
                if (amounts.length >= 14) {
                    total += parseMoney(amounts[13]);
                }
            }
        }
        console.log("Sum of index 13 (İşv.SGK İst.):", total);
        await parser.destroy();
    } catch (e) { console.error(e); }
}

sumIncentive();
