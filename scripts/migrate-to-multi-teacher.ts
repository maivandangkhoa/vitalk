/**
 * Migration script: Single-teacher → Multi-teacher
 *
 * Run with: npx ts-node --esm scripts/migrate-to-multi-teacher.ts
 *
 * Before running:
 * 1. Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account key path
 * 2. Set the TEACHER_UID and TEACHER_EMAIL variables below
 * 3. Deploy the new Firestore rules first
 *
 * What this script does:
 * 1. Reads the old profile/teacher document
 * 2. Creates a new teachers/{id} document with additional fields
 * 3. Copies all availability/* docs to teachers/{id}/availability/*
 * 4. Adds teacherId + teacherName to all existing bookings
 * 5. Adds teacherId to all existing reviews
 * 6. Updates the teacher's user doc with teacherId field
 */

import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ============ CONFIGURE THESE ============
const TEACHER_UID = 'REPLACE_WITH_TEACHER_FIREBASE_UID';
const TEACHER_EMAIL = 'REPLACE_WITH_TEACHER_EMAIL';
const TEACHER_SLUG = 'win'; // URL slug for the teacher
// =========================================

const serviceAccount = JSON.parse(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('fs').readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || '', 'utf8')
) as ServiceAccount;

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function migrate() {
  console.log('Starting migration to multi-teacher...\n');

  // Step 1: Read old profile
  console.log('Step 1: Reading old profile/teacher document...');
  const profileSnap = await db.doc('profile/teacher').get();
  if (!profileSnap.exists) {
    console.error('No profile/teacher document found! Aborting.');
    process.exit(1);
  }
  const profileData = profileSnap.data()!;
  console.log(`  Found profile: ${profileData.name}`);

  // Step 2: Create teachers document
  console.log('\nStep 2: Creating teacher document...');
  const teacherRef = db.collection('teachers').doc();
  const teacherId = teacherRef.id;

  await teacherRef.set({
    ...profileData,
    slug: TEACHER_SLUG,
    uid: TEACHER_UID,
    email: TEACHER_EMAIL,
    timezone: 'Asia/Seoul',
    isActive: true,
    sortOrder: 0,
    createdAt: profileData.updatedAt || new Date(),
  });
  console.log(`  Created teacher ${teacherId} with slug "${TEACHER_SLUG}"`);

  // Step 3: Copy availability documents
  console.log('\nStep 3: Copying availability documents...');
  const availSnap = await db.collection('availability').get();
  let copiedCount = 0;
  for (const doc of availSnap.docs) {
    await db.doc(`teachers/${teacherId}/availability/${doc.id}`).set(doc.data());
    copiedCount++;
  }
  console.log(`  Copied ${copiedCount} availability documents`);

  // Step 4: Add teacherId to bookings
  console.log('\nStep 4: Adding teacherId to bookings...');
  const bookingsSnap = await db.collection('bookings').get();
  if (bookingsSnap.size > 0) {
    const batch = db.batch();
    for (const doc of bookingsSnap.docs) {
      batch.update(doc.ref, {
        teacherId: teacherId,
        teacherName: profileData.name || '',
      });
    }
    await batch.commit();
  }
  console.log(`  Updated ${bookingsSnap.size} bookings`);

  // Step 5: Add teacherId to reviews
  console.log('\nStep 5: Adding teacherId to reviews...');
  const reviewsSnap = await db.collection('reviews').get();
  if (reviewsSnap.size > 0) {
    const batch = db.batch();
    for (const doc of reviewsSnap.docs) {
      batch.update(doc.ref, { teacherId: teacherId });
    }
    await batch.commit();
  }
  console.log(`  Updated ${reviewsSnap.size} reviews`);

  // Step 6: Update user doc
  console.log('\nStep 6: Updating user document...');
  const userRef = db.doc(`users/${TEACHER_UID}`);
  const userSnap = await userRef.get();
  if (userSnap.exists) {
    await userRef.update({ teacherId: teacherId });
    console.log(`  Updated user ${TEACHER_UID} with teacherId`);
  } else {
    console.log(`  Warning: User ${TEACHER_UID} not found`);
  }

  // Summary
  console.log('\n========== Migration Complete ==========');
  console.log(`Teacher ID: ${teacherId}`);
  console.log(`Teacher slug: ${TEACHER_SLUG}`);
  console.log(`Teacher UID: ${TEACHER_UID}`);
  console.log(`Availability docs: ${copiedCount}`);
  console.log(`Bookings updated: ${bookingsSnap.size}`);
  console.log(`Reviews updated: ${reviewsSnap.size}`);
  console.log('\nNext steps:');
  console.log('1. Verify data in Firestore console');
  console.log('2. Set the teacher user role if needed');
  console.log('3. Deploy the updated application');
}

migrate().catch(console.error);
