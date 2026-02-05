
const XLSX = require('xlsx');

const filePath = "e:\\CEM APPS\\cnctracker\\uploads\\gumruk\\2026\\ocak\\1770218689021_OCAK_Sat____lar.xlsx";

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Read specific row (2970). Note: Excel is 1-based, sheet_to_json array is 0-based.
    // Row 2970 in Excel is likely index 2968 or 2969 (depending on header).
    
    const jsonData = XLSX.utils.sheet_to_json(sheet);
    
    // Check around index 2965-2975 to be safe
    console.log("Total JSON Rows:", jsonData.length);
    
    const target = jsonData.find(j => JSON.stringify(j).includes("HMMU2071981"));
    if (target) {
        console.log("FOUND ROW:", JSON.stringify(target, null, 2));
    } else {
        console.log("HMMU2071981 NOT FOUND in JSON parsing");
        console.log("Row 2970 (Index 2969):", JSON.stringify(jsonData[2969], null, 2));
    }

} catch (e) {
    console.error("Error:", e.message);
}
