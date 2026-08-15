/**
 * Re-attaches imported posts to the Naver post they came from.
 *
 * The importer used to drop blogId/logNo as soon as it had the content, so
 * posts imported before that was fixed have no way back and the editor's "Sync
 * from Naver" button has to ask for a URL. This matches them up again by their
 * Korean title against the blog's RSS feed, which carries the logNo in each
 * item's guid.
 *
 * Only exact title matches are written. Anything ambiguous is reported instead
 * of guessed at — a wrong link would make Sync overwrite a post with somebody
 * else's article.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/relinkNaverSources.mjs
 *   node scripts/relinkNaverSources.mjs --apply
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const serviceAccount = require('../firebase-auth.json');

const APPLY = process.argv.includes('--apply');
const BLOG_IDS = ['loptiengviet'];

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'havitalk',
});

const db = admin.firestore();

/** Titles vary by punctuation and spacing between the feed and what we stored. */
const normalize = (value) =>
  (value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();

async function feedItems(blogId) {
  const res = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`RSS for ${blogId}: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)]
    .map((match) => ({
      blogId,
      title: (match[0].match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || [, ''])[1].trim(),
      logNo: (match[0].match(/<guid>[^<]*\/(\d+)<\/guid>/) || [, ''])[1],
    }))
    .filter((item) => item.logNo && item.title);
}

async function main() {
  const items = (await Promise.all(BLOG_IDS.map(feedItems))).flat();

  // Two feed items with the same normalized title can't be told apart.
  const byTitle = new Map();
  for (const item of items) {
    const key = normalize(item.title);
    byTitle.set(key, byTitle.has(key) ? 'ambiguous' : item);
  }

  const snap = await db.collection('blogPosts').get();
  console.log(`RSS items: ${items.length} | posts: ${snap.size}`);
  console.log(APPLY ? 'MODE: apply\n' : 'MODE: dry run (pass --apply to write)\n');

  const skipped = [];
  const claimed = new Map(); // logNo -> slug, to catch two posts wanting one source
  const matches = [];

  for (const doc of snap.docs) {
    const post = doc.data();
    if (post.source?.logNo) {
      skipped.push(`${post.slug} (already linked)`);
      continue;
    }
    const key = normalize(post.title?.ko);
    if (!key) {
      skipped.push(`${post.slug} (no Korean title)`);
      continue;
    }
    const hit = byTitle.get(key);
    if (!hit) {
      skipped.push(`${post.slug} (no feed item)`);
      continue;
    }
    if (hit === 'ambiguous') {
      skipped.push(`${post.slug} (two feed items share this title)`);
      continue;
    }
    if (claimed.has(hit.logNo)) {
      skipped.push(`${post.slug} (same source as ${claimed.get(hit.logNo)})`);
      continue;
    }
    claimed.set(hit.logNo, post.slug);
    matches.push({ ref: doc.ref, slug: post.slug, ...hit });
  }

  for (const match of matches) {
    console.log(`  link  ${match.blogId}/${match.logNo}  <-  ${match.slug}`);
    if (!APPLY) continue;
    await match.ref.update({
      source: {
        platform: 'naver',
        blogId: match.blogId,
        logNo: match.logNo,
        // Left empty on purpose: the fingerprint has to come from the scraper
        // itself, so guessing one here would make the first Sync either lie
        // about being up to date or compare against a hash we invented. Empty
        // simply means "unknown", and the first Sync fills it in.
        contentHash: '',
        syncedAt: null,
      },
    });
  }

  console.log(`\nlinked ${matches.length}, skipped ${skipped.length}`);
  for (const reason of skipped) console.log(`  skip  ${reason}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
