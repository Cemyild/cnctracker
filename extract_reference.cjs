
const XLSX = require('xlsx');
const workbook = XLSX.readFile('E:\\CEM APPS\\cnctracker\\Ucretler_1-Ocak-2026-web hesaplamalı.xlsm');
const sheetName = workbook.SheetNames[0]; 
const worksheet = workbook.Sheets[sheetName];

// Function to get cell value
function getVal(cell) {
    return worksheet[cell] ? worksheet[cell].v : 'N/A';
}

console.log("--- REFERENCE VALUES FOR JAN-DEC (50,000 TL NET) ---");
// Columns E to P are Jan to Dec.
const months = ['E','F','G','H','I','J','K','L','M','N','O','P'];

months.forEach((col, i) => {
    console.log(`Month ${i+1}:`);
    console.log(`  Net: ${getVal(col+'29')}`); // ÖDENECEK NET ÜCRET
    console.log(`  Gross: ${getVal(col+'24')}`); // BRÜT ÜCRET
    console.log(`  SGK Worker: ${getVal(col+'20')}`); // SGK İşçi
    console.log(`  Unemployment: ${getVal(col+'21')}`); // İşsizlik İşçi
    console.log(`  Income Tax Base (Matrah): ${getVal(col+'35')}`); // Cari ayın GV Matrahı
    console.log(`  Cumul Tax Base: ${getVal(col+'36')}`); // Birikmiş GV Matrahı
    console.log(`  Calc Income Tax: ${getVal(col+'45')}`); // Hesaplanan GV
    console.log(`  Ming Wage Tax Exemption: ${getVal(col+'47')}`); // Asgari Ücret GV (İstisna) -- Tahmin satır
    console.log(`  Payable Tax: ${getVal(col+'48')}`); // Ödenecek GV
    console.log(`  Stamp Tax: ${getVal(col+'22')}`); // Damga
    console.log(`  Employer Cost: ${getVal(col+'27')}`); // İşveren Maliyeti
    console.log("------------------------------------------------");
});

console.log("Global Params:");
console.log(`  Min Wage Net: ${getVal('F41')}`); // Check for hidden min wage constants if visible
