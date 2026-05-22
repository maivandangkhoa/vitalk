import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync('public/wordmark.svg', 'utf8');

// Render at multiple raster sizes. Heights chosen for common use cases.
const variants = [
  { height: 56, out: 'public/wordmark.png' },
  { height: 112, out: 'public/wordmark@2x.png' },
  { height: 168, out: 'public/wordmark@3x.png' },
];

for (const { height, out } of variants) {
  const buf = await sharp(Buffer.from(svg), { density: 600 })
    .resize({ height, withoutEnlargement: false })
    .png()
    .toBuffer();
  writeFileSync(out, buf);
  console.log(`✓ ${out} (height ${height})`);
}
