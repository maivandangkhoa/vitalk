import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * A teacher account needs TWO links to work:
 *   - `teachers/{teacherId}.uid`  → Firestore rules allow the teacher to write
 *     their own profile (`isTeacherOwner`).
 *   - `users/{uid}.teacherId`     → the admin UI knows which profile to edit
 *     (`useTeacherSelector` reads it via the auth store).
 *
 * Only the first one is set by the teacher editor, so this module keeps the
 * reverse link in sync. Both sides are admin-only writes per firestore.rules.
 */

/** Point a user doc at a teacher profile and promote them to `teacher`. */
async function linkUser(uid: string, teacherId: string): Promise<void> {
  // merge so a teacher who has not signed in yet gets a stub doc that
  // `ensureUserDoc` will later fill in with their identity fields.
  await setDoc(
    doc(db, 'users', uid),
    { uid, teacherId, role: 'teacher', updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Drop the reverse link, but only if it still points at `teacherId`. */
async function unlinkUser(uid: string, teacherId: string): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().teacherId !== teacherId) return;
  await updateDoc(ref, {
    teacherId: deleteField(),
    role: 'user',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Sync `users/{uid}.teacherId` after a teacher profile is saved.
 * Returns whether the teacher is now linked to a real account.
 */
export async function syncTeacherUserLink({
  teacherId,
  uid,
  prevUid,
}: {
  teacherId: string;
  uid: string;
  prevUid?: string;
}): Promise<boolean> {
  const next = uid.trim();
  const prev = (prevUid || '').trim();

  if (prev && prev !== next) await unlinkUser(prev, teacherId);
  if (next) await linkUser(next, teacherId);

  return Boolean(next);
}

/**
 * One-shot repair for teachers created before the link was kept in sync:
 * walks every teacher that has a `uid` and rewrites the reverse link.
 * Safe to re-run — writes are idempotent.
 */
export async function backfillTeacherUserLinks(): Promise<{
  linked: number;
  skipped: number;
}> {
  const snap = await getDocs(collection(db, 'teachers'));
  let linked = 0;
  let skipped = 0;

  for (const d of snap.docs) {
    const uid = (d.data().uid || '').trim();
    if (!uid) {
      skipped++;
      continue;
    }
    await linkUser(uid, d.id);
    linked++;
  }

  return { linked, skipped };
}

/**
 * Sync the link after a user's role is changed from the Users page.
 * Promoting to `teacher` resolves the profile by matching `teachers.uid`.
 * Returns the linked teacherId, or null if no profile matched.
 */
export async function syncUserRoleLink(
  uid: string,
  role: string
): Promise<string | null> {
  if (role !== 'teacher') {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists() && snap.data().teacherId) {
      await updateDoc(doc(db, 'users', uid), { teacherId: deleteField() });
    }
    return null;
  }

  const match = await getDocs(
    query(collection(db, 'teachers'), where('uid', '==', uid))
  );
  const teacherId = match.docs[0]?.id ?? null;
  if (teacherId) {
    await updateDoc(doc(db, 'users', uid), { teacherId });
  }
  return teacherId;
}
