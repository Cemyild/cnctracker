import fs from 'fs';
const path = 'e:\\CEM APPS\\cnctracker\\client\\src\\pages\\Gumruk.tsx';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Fix summary card titles (within div tags)
    // The pattern is likely: >İx çi SGK</div>
    content = content.replace(/>\s*İ.*?çi SGK/gi, '>İşçi SGK');
    content = content.replace(/>\s*İ.*?veren SGK/gi, '>İşveren SGK');

    // Just in case, catch any remaining "x çi" or "x veren" patterns in text content
    content = content.replace(/İx\s*çi/gi, 'İşçi');
    content = content.replace(/İx\s*veren/gi, 'İşveren');

    // Also catch any "S cret" or similar left over if any
    content = content.replace(/S\s*cret/g, 'Ücret');

    fs.writeFileSync(path, content, 'utf8');
    console.log('Fixed remaining encoding issues.');
} catch (e) {
    console.error(e);
}
