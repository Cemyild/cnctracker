import fs from 'fs';
const path = 'e:\\CEM APPS\\cnctracker\\client\\src\\pages\\Gumruk.tsx';
const buf = fs.readFileSync(path);
// Filter out null bytes (0x00)
const cleanBuf = Buffer.from(buf.filter(b => b !== 0));
fs.writeFileSync(path, cleanBuf);
console.log('Fixed Gumruk.tsx by removing null bytes');
