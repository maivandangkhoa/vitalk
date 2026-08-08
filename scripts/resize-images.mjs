/**
 * Downscales images uploaded before src/lib/imageUpload.ts started resizing them.
 *
 * Writes each resized image to a NEW object (`<same path>.webp`) rather than
 * overwriting. That is not merely caution: the originals now carry
 * `cache-control: public, max-age=31536000, immutable`, so an in-place rewrite
 * would leave browsers and Google's edge serving the old bytes for up to a year.
 * A new path is the only correct way to change an immutable object.
 *
 * Originals are left in place, which makes the failure mode safe: any reference
 * this script fails to rewrite keeps pointing at a URL that still works.
 *
 * Usage:
 *   node scripts/resize-images.mjs            # dry run, prints the plan
 *   node scripts/resize-images.mjs --apply    # actually writes
 */
import { readFileSync } from 'node:fs';
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'firebase-auth.json';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'vietalky';
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'havitalk';
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Longest edge and WebP quality per kind of image, mirroring MAX_DIM in
 * src/lib/imageUpload.ts. Order matters: the first matching rule wins, so the
 * `bio-` rule has to precede the plain avatar rule.
 */
const RULES = [
  { match: /^teacher-profiles\/bio-/, maxDim: 1600, quality: 85 },
  { match: /^teacher-profiles\//, maxDim: 512, quality: 85 },
  { match: /^teacher-qr\//, maxDim: 1024, quality: 95 },
  { match: /^blog-images\//, maxDim: 1600, quality: 85 },
  { match: /^blog-covers\//, maxDim: 1600, quality: 85 },
];

/** Anything sharp would rasterise badly, or that is already a lost cause. */
const RESIZABLE = /\.(jpe?g|png|webp)$/i;

/** Not worth a second object unless the rewrite actually saves something. */
const MIN_SAVING = 0.9;

const apply = process.argv.includes('--apply');
const label = apply ? 'APPLY' : 'DRY RUN';

const credentials = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
const storage = new Storage({ credentials, projectId: PROJECT_ID });
initializeApp({ credential: cert(credentials), projectId: PROJECT_ID });
const db = getFirestore();
const bucket = storage.bucket(BUCKET);

const publicUrl = (path) =>
  `https://storage.googleapis.com/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

// ---------------------------------------------------------------- resizing ---

/** old public URL → new public URL, for the Firestore pass below. */
const rewrites = new Map();
let savedBytes = 0;
let skipped = 0;

for (const rule of RULES) {
  const prefix = rule.match.source.replace(/^\^/, '').replace(/\\\//g, '/');
  const [files] = await bucket.getFiles({ prefix: prefix.split('/')[0] + '/' });

  for (const file of files) {
    if (!rule.match.test(file.name)) continue;
    if (rewrites.has(publicUrl(file.name))) continue; // already matched a rule
    if (!RESIZABLE.test(file.name)) {
      skipped++;
      continue;
    }

    const target = `${file.name.replace(/\.[^./]+$/, '')}.webp`;
    if (target === file.name) {
      // Already WebP: re-encoding in place would need the same object name.
      skipped++;
      continue;
    }

    const [original] = await file.download();
    const resized = await sharp(original)
      .rotate() // honour EXIF orientation before the resize drops the tag
      .resize({
        width: rule.maxDim,
        height: rule.maxDim,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: rule.quality })
      .toBuffer();

    if (resized.length >= original.length * MIN_SAVING) {
      skipped++;
      continue;
    }

    const pct = Math.round((1 - resized.length / original.length) * 100);
    console.log(
      `  ${(original.length / 1024).toFixed(0).padStart(5)} KB → ` +
        `${(resized.length / 1024).toFixed(0).padStart(5)} KB (-${String(pct).padStart(2)}%)  ${target}`
    );
    savedBytes += original.length - resized.length;
    rewrites.set(publicUrl(file.name), publicUrl(target));

    if (apply) {
      const [exists] = await bucket.file(target).exists();
      if (exists) {
        // The target is immutable too — never replace it, just reuse it.
        continue;
      }
      await bucket.file(target).save(resized, {
        contentType: 'image/webp',
        metadata: { cacheControl: CACHE_CONTROL },
      });
      await bucket.file(target).makePublic();
    }
  }
}

console.log(
  `\n[${label}] ${rewrites.size} images to resize, ${skipped} left alone, ` +
    `${(savedBytes / 1048576).toFixed(2)} MB saved\n`
);

// -------------------------------------------------------------- documents ---

/** Replaces any resized image's URL wherever it appears, however deeply nested. */
function rewrite(value) {
  if (typeof value === 'string') {
    let next = value;
    for (const [from, to] of rewrites) next = next.split(from).join(to);
    return next === value ? value : next;
  }
  if (Array.isArray(value)) {
    const next = value.map(rewrite);
    return next.some((item, i) => item !== value[i]) ? next : value;
  }
  if (value && typeof value === 'object' && value.constructor === Object) {
    const next = {};
    let changed = false;
    for (const [key, item] of Object.entries(value)) {
      next[key] = rewrite(item);
      if (next[key] !== item) changed = true;
    }
    return changed ? next : value;
  }
  return value;
}

let docsChanged = 0;

// Every top-level collection, so a reference from somewhere unexpected (policy
// HTML, site config) is not missed.
for (const collection of await db.listCollections()) {
  const snap = await collection.get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const next = rewrite(data);
    if (next === data) continue;

    docsChanged++;
    const fields = Object.keys(next).filter((key) => next[key] !== data[key]);
    console.log(`  ${collection.id}/${doc.id} → ${fields.join(', ')}`);
    if (apply) await doc.ref.set(next, { merge: true });
  }
}

console.log(`\n[${label}] documents: ${docsChanged} to rewrite`);
if (!apply) console.log('\nNothing was written. Re-run with --apply.');
