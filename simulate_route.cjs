
const XLSX = require('xlsx');

const filePath = "e:\\CEM APPS\\cnctracker\\uploads\\gumruk\\2026\\ocak\\1770218689021_OCAK_Sat____lar.xlsx";

function parseNumber(val) {
    if (!val) return null;
    if (typeof val === 'number') return val;
    // Replace dots with nothing, commas with dots (TR format)
    // BUT check if it's already generic number format
    let s = String(val).trim();
    if (s === '') return null;
    
    // Simple heuristic: if it has ',' assume TR decimal separator
    if (s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    const g = (row, key) => row[key] ? String(row[key]).trim() : null;

    console.log("Processing " + data.length + " rows...");

    const targetRow = data.find(row => {
        // match exact logic
        return JSON.stringify(row).includes("HMMU2071981");
    });

    if (targetRow) {
        console.log("--- FOUND IN RAW READ ---");
        // Apply mapping logic
        const mapped = {
           firmaUnvan: targetRow["FİRMA ÜNVAN"],
           houseNo: g(targetRow, "HOUSE NO"), // THE CRITICAL CHECK
           rawData: JSON.stringify(targetRow)
        };
        console.log("Mapped HouseNo:", mapped.houseNo);
        console.log("Mapped Data:", JSON.stringify(mapped, null, 2));
    } else {
        console.log("STILL NOT FOUND IN RAW READ");
    }

} catch (e) {
    console.error("Error:", e.message);
}
