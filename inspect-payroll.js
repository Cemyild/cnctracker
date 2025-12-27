import fs from 'fs';
import { PDFParse } from 'pdf-parse';

const pdfPath = 'e:/CEM APPS/cnctracker/CNC GÜMRÜK EYLÜL BORDRO.pdf';

async function inspectPdf() {
    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const parser = new PDFParse({ data: dataBuffer });
        const textResult = await parser.getText();
        const text = textResult.text;

        const pages = text.split(/-- \d+ of \d+ --/);
        // Show first 2000 characters of the first page to find structures
        console.log(pages[0].substring(0, 5000));
        await parser.destroy();
    } catch (error) {
        console.error(error);
    }
}

inspectPdf();
