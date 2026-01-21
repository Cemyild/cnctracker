
import * as XLSX from 'xlsx';
import fs from 'fs';

const FILE_PATH = 'E:\\CEM APPS\\cnctracker\\cnc ray.xlsx';

try {
    const buffer = fs.readFileSync(FILE_PATH);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    console.log("Sheet Names:", workbook.SheetNames);
    
    workbook.SheetNames.forEach((sheetName, index) => {
        console.log(`\n--- Analyzing Sheet ${index}: ${sheetName} ---`);
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        console.log(`Total Rows: ${jsonData.length}`);
        
        if (jsonData.length > 0) {
             console.log("Header (Row 0):", JSON.stringify(jsonData[0]));
             if (jsonData.length > 1) {
                console.log("Row 1:", JSON.stringify(jsonData[1]));
             }
        }
    });

} catch (err) {
    console.error("Error:", err);
}
