
const XLSX = require('xlsx');

const filePath = "e:\\CEM APPS\\cnctracker\\uploads\\gumruk\\2026\\ocak\\1770218689021_OCAK_Sat____lar.xlsx";

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Read first row specifically to see headers
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (jsonData.length > 0) {
        console.log("HEADERS:", JSON.stringify(jsonData[0], null, 2));
    } else {
        console.log("File empty or cannot read headers");
    }
} catch (e) {
    console.error("Error:", e.message);
}
