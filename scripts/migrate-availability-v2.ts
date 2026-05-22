/**
 * Migration: italki-style availability + variable lesson duration.
 *
 * Run with:
 *   GOOGLE_APPLICATION_CREDENTIALS=./firebase-auth.json npx tsx scripts/migrate-availability-v2.ts [--dry-run]
 *
 * What this script does (idempotent):
 * 1. For each teacher: backfill `hourlyRate` (from existing `lessonPrice` or default $14).
 *    Then DELETE all docs in teachers/{id}/availability/* so the new grid can rebuild fresh.
 * 2. For each lessonType: backfill `allowedDurations = [45, 60, 90, 120]` if absent.
 *    (Old `duration`/`price`/`prices` fields are left in place; code no longer reads them.)
 *
 * Bookings already in Firestore are NOT modified. They lack `durationMinutes`; the UI
 * tolerates missing values when rendering history.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_HOURLY_RATE_USD = 14;
const ALLOWED_DURATIONS = [45, 60, 90, 120];
const DRY_RUN = process.argv.includes('--dry-run');

const serviceAccount = JSON.parse(
  readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || '', 'utf8'),
) as ServiceAccount;

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function backfillTeachers() {
  const snap = await db.collection('teachers').get();
  console.log(`Found ${snap.size} teachers.`);

  for (const teacherDoc of snap.docs) {
    const data = teacherDoc.data();
    const existingRate =
      typeof data.hourlyRate === 'number'
        ? data.hourlyRate
        : typeof data.lessonPrice === 'number' && data.lessonPrice > 0
          ? data.lessonPrice
          : DEFAULT_HOURLY_RATE_USD;

    if (DRY_RUN) {
      console.log(`  [dry] teacher ${teacherDoc.id}: would set hourlyRate=$${existingRate} (current hourlyRate=${data.hourlyRate}, lessonPrice=${data.lessonPrice})`);
    } else {
      await teacherDoc.ref.set({ hourlyRate: existingRate }, { merge: true });
      console.log(`  ✓ teacher ${teacherDoc.id} → hourlyRate $${existingRate}`);
    }

    const availSnap = await teacherDoc.ref.collection('availability').get();
    if (availSnap.size > 0) {
      if (DRY_RUN) {
        console.log(`    [dry] would delete ${availSnap.size} availability doc(s): ${availSnap.docs.map((d) => d.id).join(', ')}`);
      } else {
        const batch = db.batch();
        for (const doc of availSnap.docs) batch.delete(doc.ref);
        await batch.commit();
        console.log(`    deleted ${availSnap.size} availability docs`);
      }
    }
  }
}

async function backfillLessonTypes() {
  const snap = await db.collection('lessonTypes').get();
  console.log(`Found ${snap.size} lesson types.`);

  for (const doc of snap.docs) {
    const data = doc.data();
    if (Array.isArray(data.allowedDurations) && data.allowedDurations.length > 0) {
      console.log(`  • lessonType ${doc.id} already has allowedDurations, skipping`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  [dry] lessonType ${doc.id}: would set allowedDurations=[45,60,90,120]`);
    } else {
      await doc.ref.set({ allowedDurations: ALLOWED_DURATIONS }, { merge: true });
      console.log(`  ✓ lessonType ${doc.id} → allowedDurations [45,60,90,120]`);
    }
  }
}

async function main() {
  console.log(`=== Availability v2 migration ${DRY_RUN ? '(DRY RUN — no writes)' : '(LIVE)'} ===\n`);
  await backfillTeachers();
  console.log('');
  await backfillLessonTypes();
  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run without --dry-run to apply.');
  } else {
    console.log('\nDone. Teachers may now re-enter availability via /admin/availability.');
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
