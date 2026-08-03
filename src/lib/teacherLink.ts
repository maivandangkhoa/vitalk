import {
  collection,
  doc,
  addDoc,
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
import { DEFAULT_HOURLY_RATE_USD } from './constants';

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
export async function unlinkUser(uid: string, teacherId: string): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().teacherId !== teacherId) return;
  await updateDoc(ref, {
    teacherId: deleteField(),
    // Never touch an admin's role here — an admin who also has a teacher
    // profile would otherwise demote themselves by editing that profile.
    ...(snap.data().role === 'teacher' ? { role: 'user' } : {}),
    updatedAt: serverTimestamp(),
  });
}

export interface LinkableAccount {
  uid: string;
  email: string;
  displayName: string;
  /** id of the teacher profile already claiming this account, if any */
  linkedTo?: string;
}

/**
 * Accounts an admin can attach a teacher profile to. A person only shows up
 * here after signing in at least once — that is what creates their user doc.
 */
export async function listLinkableAccounts(): Promise<LinkableAccount[]> {
  const [users, teachers] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'teachers')),
  ]);

  const claimed = new Map<string, string>();
  teachers.docs.forEach((d) => {
    const uid = (d.data().uid || '').trim();
    if (uid) claimed.set(uid, d.id);
  });

  return users.docs
    .map((d) => ({
      uid: d.id,
      email: d.data().email || '',
      displayName: d.data().displayName || '',
      linkedTo: claimed.get(d.id),
    }))
    .sort((a, b) => (a.email || a.uid).localeCompare(b.email || b.uid));
}

/** Thrown when an account is already claimed by a different teacher profile. */
export class AccountAlreadyLinkedError extends Error {
  otherTeacherId: string;

  constructor(otherTeacherId: string) {
    super(`Account already linked to teacher ${otherTeacherId}`);
    this.name = 'AccountAlreadyLinkedError';
    this.otherTeacherId = otherTeacherId;
  }
}

/**
 * Sync `users/{uid}.teacherId` after a teacher profile is saved.
 * Returns whether the teacher is now linked to a real account.
 * Throws `AccountAlreadyLinkedError` if another profile claims the account —
 * two profiles sharing a uid makes "which profile do I edit?" ambiguous.
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

  if (next) {
    const claimed = await getDocs(
      query(collection(db, 'teachers'), where('uid', '==', next))
    );
    const other = claimed.docs.find((d) => d.id !== teacherId);
    if (other) throw new AccountAlreadyLinkedError(other.id);
  }

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

/** Build a URL-safe slug, falling back to the email local part. */
function toSlug(name: string, email: string): string {
  const base = (name || email.split('@')[0] || 'teacher')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'teacher';
}

/** Append `-2`, `-3`, … until the slug is free. */
async function uniqueSlug(base: string): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await getDocs(
      query(collection(db, 'teachers'), where('slug', '==', candidate))
    );
    if (taken.empty) return candidate;
  }
  return `${base}-${Math.floor(performance.now())}`;
}

/**
 * Create a blank teacher profile for a freshly promoted user.
 * Left `isActive: false` on purpose — an empty profile must not appear on the
 * public teachers list until an admin fills it in and flips the toggle.
 */
async function createBlankTeacher(
  uid: string,
  name: string,
  email: string
): Promise<string> {
  const count = (await getDocs(collection(db, 'teachers'))).size;
  const empty = { en: '', vi: '', ko: '', zh: '', ja: '' };

  const ref = await addDoc(collection(db, 'teachers'), {
    uid,
    name: name || email.split('@')[0] || 'New teacher',
    slug: await uniqueSlug(toSlug(name, email)),
    email,
    timezone: '',
    isActive: false,
    sortOrder: count,
    age: 0,
    location: '',
    locationSince: 0,
    origin: '',
    languages: {},
    education: '',
    previousLocations: [],
    interests: [],
    hourlyRate: DEFAULT_HOURLY_RATE_USD,
    currency: 'USD',
    rating: 0,
    totalReviews: 0,
    bio: empty,
    teachingStyle: empty,
    profileImageUrl: '',
    videoIntroUrl: '',
    socialLinks: {},
    contactIds: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Sync the link after a user's role is changed from the Users page.
 * Promoting to `teacher` resolves the profile by matching `teachers.uid`,
 * creating a blank one when the user has none yet.
 */
export async function syncUserRoleLink(
  uid: string,
  role: string,
  profile?: { name?: string; email?: string }
): Promise<{ teacherId: string | null; created: boolean }> {
  if (role !== 'teacher') {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists() && snap.data().teacherId) {
      await updateDoc(doc(db, 'users', uid), { teacherId: deleteField() });
    }
    return { teacherId: null, created: false };
  }

  const match = await getDocs(
    query(collection(db, 'teachers'), where('uid', '==', uid))
  );
  const existing = match.docs[0]?.id;
  const created = !existing;
  const teacherId =
    existing ??
    (await createBlankTeacher(uid, profile?.name || '', profile?.email || ''));

  await updateDoc(doc(db, 'users', uid), { teacherId });
  return { teacherId, created };
}
