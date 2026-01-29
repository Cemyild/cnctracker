
const XLSX = require('xlsx');
const workbook = XLSX.readFile('E:\\CEM APPS\\cnctracker\\Ucretler_1-Ocak-2026-web.xlsm');
const sheetName = workbook.SheetNames[0]; // Assuming first sheet is the main one
const worksheet = workbook.Sheets[sheetName];

// Get range of data
const range = XLSX.utils.decode_range(worksheet['!ref']);

console.log(`Analyzing Sheet: ${sheetName}`);
console.log(`Range: ${worksheet['!ref']}`);

const cells = [];
for(let R = range.s.r; R <= Math.min(range.e.r, 50); ++R) { // Read first 50 rows
  let rowText = [];
  for(let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = {c:C, r:R};
    const cellRef = XLSX.utils.encode_cell(cellAddress);
    const cell = worksheet[cellRef];
    if(cell && cell.v) {
        rowText.push(`[${cellRef}]: ${cell.v}`);
    }
  }
  if(rowText.length > 0) {
      console.log(rowText.join(" | "));
  }
}
