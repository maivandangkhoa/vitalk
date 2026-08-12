/**
 * Migration: rewrite every blog slug to ASCII.
 *
 * Run with:
 *   GOOGLE_APPLICATION_CREDENTIALS=./firebase-auth.json npx tsx scripts/migrate-blog-slugs.ts [--dry-run]
 *
 * Slugs were built straight from the title, so a Korean or accented Vietnamese
 * one survived into the URL and every shared link arrived percent-encoded:
 * `/blog/tr%E1%BB%9Di-%C6%A1i-%EB%B2%A0…`. This recomputes each slug through
 * toAsciiSlug — the same function the editor now uses for new posts.
 *
 * Old URLs are NOT kept working: this was a deliberate call, the blog is young
 * enough that few links are out in the wild.
 *
 * Idempotent: a post whose slug already matches is skipped.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
// Relative, not the `@/` alias — the other scripts here run under plain tsx.
import { toAsciiSlug } from '../src/lib/slug';

const DRY_RUN = process.argv.includes('--dry-run');

const serviceAccount = JSON.parse(
  readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || '', 'utf8'),
) as ServiceAccount;

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

/** Seconds since epoch, for ordering. Unpublished posts sort last. */
function publishedRank(doc: QueryDocumentSnapshot): number {
  const value = doc.data().publishedAt;
  if (!doc.data().isPublished) return Number.MAX_SAFE_INTEGER;
  return typeof value?.seconds === 'number' ? value.seconds : 0;
}

async function migrate() {
  const snap = await db.collection('blogPosts').get();
  console.log(`Found ${snap.size} posts.`);

  // Published first, oldest first. Three drafts here are copies of a live post
  // and would otherwise take the clean slug and push the live one to `-2`.
  const docs = [...snap.docs].sort((a, b) => publishedRank(a) - publishedRank(b));

  const taken = new Set<string>();
  let changed = 0;

  for (const doc of docs) {
    const data = doc.data();
    const source = (data.title?.en || data.title?.ko || data.title?.vi || '').trim();
    const base = toAsciiSlug(source) || `post-${doc.id.slice(0, 8).toLowerCase()}`;

    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);

    const state = data.isPublished ? '' : ' (draft)';
    if (slug === data.slug) {
      console.log(`  = ${slug}${state}`);
      continue;
    }

    changed++;
    if (DRY_RUN) {
      console.log(`  [dry] ${data.slug} → ${slug}${state}`);
    } else {
      await doc.ref.update({ slug });
      console.log(`  ✓ ${data.slug} → ${slug}${state}`);
    }
  }

  console.log(
    DRY_RUN
      ? `\nDry run: ${changed} of ${snap.size} posts would change. Re-run without --dry-run to apply.`
      : `\nDone: ${changed} of ${snap.size} posts updated.`,
  );
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
