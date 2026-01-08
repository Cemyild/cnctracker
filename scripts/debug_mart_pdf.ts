
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Match routes.ts usage
const { PDFParse } = require('pdf-parse');

const filePath = './mart.pdf';

if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const dataBuffer = fs.readFileSync(filePath);

async function run() {
    try {
        console.log('Attempting to parse with new PDFParse style...');
        // routes.ts: const parser = new PDFParse({ data: req.file.buffer });
        const parser = new PDFParse({ data: dataBuffer });
        const pdfData = await parser.getText();

        console.log('--- RAW TEXT START ---');
        console.log(pdfData.text);
        console.log('--- RAW TEXT END ---');
    } catch (err) {
        console.error('Error with new style:', err);

        // Fallback to standard style if the above fails (just in case routes.ts is actually using a different lib under the hood or I misread)
        try {
            console.log('Attempting standard pdf-parse style...');
            const pdf = require('pdf-parse');
            const data = await pdf(dataBuffer);
            console.log('--- RAW TEXT START (Standard) ---');
            console.log(data.text);
            console.log('--- RAW TEXT END (Standard) ---');
        } catch (e) {
            console.error('Standard style also failed:', e);
        }
    }
}

run();
