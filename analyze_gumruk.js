import fs from 'fs';
const path = 'e:\\CEM APPS\\cnctracker\\client\\src\\pages\\Gumruk.tsx';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
const idx = 1067; // Line 1068
if (lines.length > idx) {
    console.log('Line 1068 codes:', lines[idx].split('').map(c => c.charCodeAt(0)));
    console.log('Line 1067 codes:', lines[idx - 1].split('').map(c => c.charCodeAt(0)));
    console.log('Line 1069 codes:', lines[idx + 1].split('').map(c => c.charCodeAt(0)));
}
