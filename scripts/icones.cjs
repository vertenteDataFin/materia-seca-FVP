// Gera os ícones PNG do PWA a partir de public/icon.svg (Android exige PNG 192/512).
// Uso: node scripts/icones.cjs
const sharp = require('sharp');
const path = require('path');

const svg = path.join(__dirname, '..', 'public', 'icon.svg');
(async () => {
  for (const tam of [192, 512]) {
    const destino = path.join(__dirname, '..', 'public', `icon-${tam}.png`);
    await sharp(svg, { density: 384 }).resize(tam, tam).png().toFile(destino);
    console.log('ok', destino);
  }
})();
