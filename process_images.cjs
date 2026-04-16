const sharp = require('sharp');

async function processImages() {
  const logo = 'client/public/CNC_tranparanLOGO.png';

  // 1. Create a 1200x630 og-image padded with white
  await sharp(logo)
    .resize(1000, 500, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .extend({
      top: 65, bottom: 65, left: 100, right: 100,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .toFile('client/public/og-image.png');

  // 2. Create favicon.png (square, padded, transparent bg)
  await sharp(logo)
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toFile('client/public/favicon.png');

  console.log('Images generated successfully!');
}

processImages().catch(console.error);
