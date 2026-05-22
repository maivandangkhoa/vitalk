import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync('public/favicon.svg', 'utf8');

const sizes = [
  { size: 192, out: 'public/icon-192.png' },
  { size: 512, out: 'public/icon-512.png' },
  { size: 180, out: 'public/apple-touch-icon.png' },
  // Maskable icon: same art with extra padding so safe area survives mask crop.
  { size: 512, out: 'public/icon-512-maskable.png', maskable: true },
];

for (const { size, out, maskable } of sizes) {
  let pipeline;
  if (maskable) {
    // Pad ~12% so the visual is inside the safe zone of Android adaptive masks.
    const inner = Math.round(size * 0.76);
    pipeline = sharp(Buffer.from(svg), { density: 600 })
      .resize(inner, inner)
      .extend({
        top: Math.floor((size - inner) / 2),
        bottom: Math.ceil((size - inner) / 2),
        left: Math.floor((size - inner) / 2),
        right: Math.ceil((size - inner) / 2),
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      });
  } else {
    pipeline = sharp(Buffer.from(svg), { density: 600 }).resize(size, size);
  }
  const buf = await pipeline.png().toBuffer();
  writeFileSync(out, buf);
  console.log(`✓ ${out} (${size}×${size}${maskable ? ' maskable' : ''})`);
}
