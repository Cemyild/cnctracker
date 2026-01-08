import fs from 'fs';
const path = 'e:\\CEM APPS\\cnctracker\\client\\src\\pages\\Gumruk.tsx';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Fix Agustus
    content = content.replace(/{ value: "8", label: ".*?ustos" }/, '{ value: "8", label: "Ağustos" }');

    // Fix headers with corrupt characters
    // Using broad regex to catch "Brüt S cret", "Brüt S cret", etc.
    content = content.replace(/Brüt.*?cret/g, 'Brüt Ücret');
    content = content.replace(/Net.*?cret/g, 'Net Ücret');
    content = content.replace(/"İ.*?çi SGK/g, '"İşçi SGK');
    content = content.replace(/"İ.*?veren SGK/g, '"İşveren SGK');
    content = content.replace(/Şube Bazlı.*?ılım/g, 'Şube Bazlı Dağılım');
    content = content.replace(/İ.*?çi SGK Payı/g, 'İşçi SGK Payı');
    content = content.replace(/İ.*?veren SGK Payı/g, 'İşveren SGK Payı');

    fs.writeFileSync(path, content, 'utf8');
    console.log('Fixed encoding issues via Regex.');
} catch (e) {
    console.error(e);
}
