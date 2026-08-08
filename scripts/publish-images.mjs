/**
 * One-off migration for images uploaded before publishUpload existed.
 *
 * Two things are wrong with those objects:
 *   1. No public ACL, so the storage.googleapis.com URL 403s. Only the
 *      firebasestorage.googleapis.com download endpoint serves them, and that
 *      endpoint is not edge-cached — measured 0.8-2.4s TTFB.
 *   2. No cacheControl, so it defaults to `private, max-age=0` and the browser
 *      re-downloads every image on every page view.
 *
 * This fixes both on the objects, then rewrites the Firestore documents that
 * still point at the slow URL. `chat-images/` is never touched: those are
 * private and must stay that way.
 *
 * Usage:
 *   node scripts/publish-images.mjs              # dry run, prints the plan
 *   node scripts/publish-images.mjs --apply      # actually writes
 */
import { readFileSync } from 'node:fs';
import { Storage } from '@google-cloud/storage';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'firebase-auth.json';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'vietalky';
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'havitalk';

/** Must stay in sync with PUBLIC_PREFIXES in functions/src/publishUpload.ts. */
const PUBLIC_PREFIXES = [
  'teacher-profiles/',
  'teacher-qr/',
  'blog-images/',
  'blog-covers/',
];
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Collections whose documents may embed a download URL, directly or in HTML. */
const COLLECTIONS = ['teachers', 'blogPosts'];

const apply = process.argv.includes('--apply');
const label = apply ? 'APPLY' : 'DRY RUN';

const credentials = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
const storage = new Storage({ credentials, projectId: PROJECT_ID });
initializeApp({ credential: cert(credentials), projectId: PROJECT_ID });
const db = getFirestore();

// ---------------------------------------------------------------- objects ---

let published = 0;
let cached = 0;
let skipped = 0;

for (const prefix of PUBLIC_PREFIXES) {
  const [files] = await storage.bucket(BUCKET).getFiles({ prefix });
  for (const file of files) {
    const [acl] = await file.acl.get().catch(() => [[]]);
    const isPublic = (Array.isArray(acl) ? acl : [acl]).some(
      (entry) => entry?.entity === 'allUsers'
    );
    const hasCache = file.metadata.cacheControl === CACHE_CONTROL;

    if (isPublic && hasCache) {
      skipped++;
      continue;
    }
    console.log(
      `  ${isPublic ? '' : '+public '}${hasCache ? '' : '+cache '}${file.name}`
    );
    if (apply) {
      if (!hasCache) await file.setMetadata({ cacheControl: CACHE_CONTROL });
      if (!isPublic) await file.makePublic();
    }
    if (!isPublic) published++;
    if (!hasCache) cached++;
  }
}

console.log(
  `\n[${label}] objects: ${published} to publish, ${cached} to re-cache, ${skipped} already correct\n`
);

// -------------------------------------------------------------- documents ---

/**
 * Matches a Firebase download URL for this bucket. The object path arrives
 * percent-encoded (`teacher-profiles%2F123.jpg`) and the token query string is
 * optional, since some stored URLs were hand-trimmed.
 */
const DOWNLOAD_URL = new RegExp(
  `https://firebasestorage\\.googleapis\\.com/v0/b/${BUCKET}/o/([^"'\\s?)]+)(\\?[^"'\\s)]*)?`,
  'g'
);

function toPublicUrl(encodedPath) {
  const path = decodeURIComponent(encodedPath);
  // Belt and braces: this script never reads a chat document, but a rewrite
  // here would silently expose a private image if that ever changed.
  if (!PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  const safe = path.split('/').map(encodeURIComponent).join('/');
  return `https://storage.googleapis.com/${BUCKET}/${safe}`;
}

/** Rewrites every download URL inside a value, however deeply nested. */
function rewrite(value) {
  if (typeof value === 'string') {
    let changed = false;
    const next = value.replace(DOWNLOAD_URL, (match, encodedPath) => {
      const url = toPublicUrl(encodedPath);
      if (!url) return match;
      changed = true;
      return url;
    });
    return changed ? next : value;
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

for (const name of COLLECTIONS) {
  const snap = await db.collection(name).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const next = rewrite(data);
    if (next === data) continue;

    docsChanged++;
    const fields = Object.keys(next).filter((key) => next[key] !== data[key]);
    console.log(`  ${name}/${doc.id} → ${fields.join(', ')}`);
    if (apply) await doc.ref.set(next, { merge: true });
  }
}

console.log(`\n[${label}] documents: ${docsChanged} to rewrite`);
if (!apply) console.log('\nNothing was written. Re-run with --apply.');
