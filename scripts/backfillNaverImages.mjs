/**
 * Clones Naver-hosted images in existing blog posts onto our own bucket.
 *
 * Imports made before the scraper's `type=` fix kept Naver's lazy-load
 * placeholder URL (`?type=w80_blur`), which Naver refuses to serve to another
 * domain — those posts show every inline image broken. Swapping that parameter
 * for `w966` on the very same URL returns the real picture, so the repair needs
 * no re-scrape: fetch, store, rewrite the post.
 *
 * Dry run by default. Pass --apply to actually upload and write.
 *
 *   node scripts/backfillNaverImages.mjs
 *   node scripts/backfillNaverImages.mjs --apply
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const serviceAccount = require('../firebase-auth.json');

const APPLY = process.argv.includes('--apply');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Only Naver's own image CDN — other hosts are left alone deliberately. */
const NAVER_IMAGE_HOST = /(^|\.)pstatic\.net$/;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'havitalk',
});

const bucket = admin.storage().bucket();
const db = admin.firestore();

function isNaverImage(url) {
  try {
    return NAVER_IMAGE_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Spellings of one image, best first.
 *
 * w966 is the rendition Naver actually serves; w966_q90 — what the old scraper
 * asked for — is a 404, and the stored URL itself is usually the 80px blur.
 */
function candidates(url) {
  const out = [];
  try {
    const withWidth = new URL(url);
    withWidth.searchParams.set('type', 'w966');
    out.push(withWidth.toString());
  } catch {
    /* not a URL we can rewrite; the original below still gets a try */
  }
  out.push(url, url.split('?')[0]);
  return [...new Set(out)];
}

/** The largest of the candidates that answers — "200" is not "it is the image". */
async function fetchBest(url) {
  let best = null;
  for (const candidate of candidates(url)) {
    try {
      const res = await fetch(candidate, {
        headers: { 'User-Agent': UA, Referer: 'https://blog.naver.com/' },
      });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (best && buffer.length <= best.buffer.length) continue;
      best = { buffer, contentType: res.headers.get('content-type') || 'image/jpeg', candidate };
    } catch {
      /* try the next spelling */
    }
  }
  return best;
}

function extFor(contentType) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

async function main() {
  const snap = await db.collection('blogPosts').get();

  // One upload per distinct image, however many posts and languages use it.
  const wanted = new Map(); // original URL -> [{slug, lang}]
  snap.forEach((doc) => {
    const post = doc.data();
    for (const [lang, html] of Object.entries(post.content || {})) {
      if (typeof html !== 'string') continue;
      for (const match of html.matchAll(/<img[^>]+src="(https?:\/\/[^"]+)"/g)) {
        if (!isNaverImage(match[1])) continue;
        if (!wanted.has(match[1])) wanted.set(match[1], []);
        wanted.get(match[1]).push({ slug: post.slug, lang });
      }
    }
  });

  console.log(`${snap.size} posts, ${wanted.size} distinct Naver images to clone`);
  console.log(APPLY ? 'MODE: apply\n' : 'MODE: dry run (pass --apply to write)\n');

  const rewrites = new Map(); // original URL -> our URL
  let failed = 0;
  let bytes = 0;

  for (const [original] of wanted) {
    const best = await fetchBest(original);
    if (!best) {
      failed++;
      console.log(`  FAIL  ${original.slice(0, 90)}`);
      continue;
    }
    bytes += best.buffer.length;

    // Deterministic name, so re-running replaces rather than duplicates.
    const key = createHash('sha1').update(original.split('?')[0]).digest('hex').slice(0, 16);
    const path = `blog-images/naver/${key}.${extFor(best.contentType)}`;

    if (APPLY) {
      await bucket.file(path).save(best.buffer, {
        metadata: { contentType: best.contentType, cacheControl: PUBLIC_CACHE_CONTROL },
        public: true,
      });
    }
    rewrites.set(original, `https://storage.googleapis.com/havitalk/${path}`);
    console.log(`  ok    ${(best.buffer.length / 1024).toFixed(0).padStart(5)} KB  ${path}`);
  }

  // Rewrite every post that mentions any of them.
  let postsChanged = 0;
  for (const doc of snap.docs) {
    const post = doc.data();
    const content = { ...(post.content || {}) };
    let changed = false;

    for (const [lang, html] of Object.entries(content)) {
      if (typeof html !== 'string') continue;
      let updated = html;
      for (const [original, replacement] of rewrites) {
        if (updated.includes(original)) updated = updated.split(original).join(replacement);
      }
      if (updated !== html) {
        content[lang] = updated;
        changed = true;
      }
    }

    if (!changed) continue;
    postsChanged++;
    if (APPLY) await doc.ref.update({ content });
  }

  console.log(
    `\ncloned ${rewrites.size} images (${(bytes / 1e6).toFixed(1)} MB), ` +
      `${failed} failed, ${postsChanged} posts ${APPLY ? 'updated' : 'would change'}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
