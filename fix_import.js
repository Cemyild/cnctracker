import fs from 'fs';
const path = 'e:\\CEM APPS\\cnctracker\\client\\src\\pages\\Gumruk.tsx';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Normalize newlines to \n to reliably match
    // content = content.replace(/\r\n/g, '\n'); 
    // Actually, let's just use the regex approach which is more robust.

    // Pattern: import { ... } from "@/components/ui/table";
    // We want to verify if TableFooter is missing and add it.

    const tableImportRegex = /import\s+\{([^}]*)\}\s+from\s+"@\/components\/ui\/table";/s;
    const match = content.match(tableImportRegex);

    if (match) {
        const imports = match[1];
        if (!imports.includes('TableFooter')) {
            console.log('TableFooter missing. Adding it...');
            const newImports = imports.trimEnd() + ',\n  TableFooter,\n';
            const newBlock = `import {${newImports}} from "@/components/ui/table";`;
            const newContent = content.replace(tableImportRegex, newBlock);
            fs.writeFileSync(path, newContent, 'utf8');
            console.log('Successfully added TableFooter.');
        } else {
            console.log('TableFooter already present.');
        }
    } else {
        console.error('Could not find table import block with regex.');
    }

} catch (e) {
    console.error('Error:', e);
    process.exit(1);
}
