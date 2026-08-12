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
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_HOURLY_RATE_USD } from './constants';
import { toAsciiSlug } from './slug';

/**
 * A teacher profile's document id IS the owner's auth uid. That single fact
 * replaces the pair of cross-references this used to keep in sync, and it is
 * what firestore.rules checks: `request.auth.uid == teacherId`.
 *
 * A profile whose id is not a uid is *unclaimed* — it exists (imported from
 * italki, or created before the person signed up) but nobody can self-edit it.
 * `claimProfile` moves such a doc onto an account, which is the only way a
 * profile ever changes owner.
 */

export interface LinkableAccount {
  uid: string;
  email: string;
  displayName: string;
  /** true when this account already owns a profile */
  hasProfile: boolean;
}

/**
 * Accounts an admin can hand a profile to. A person appears here only after
 * signing in at least once — that is what creates their user doc and uid.
 */
export async function listLinkableAccounts(): Promise<LinkableAccount[]> {
  const [users, teachers] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'teachers')),
  ]);
  const owned = new Set(teachers.docs.map((d) => d.id));

  return users.docs
    .map((d) => ({
      uid: d.id,
      email: d.data().email || '',
      displayName: d.data().displayName || '',
      hasProfile: owned.has(d.id),
    }))
    .sort((a, b) => (a.email || a.uid).localeCompare(b.email || b.uid));
}

/** Give the account the teacher role, unless it is an admin (a superset). */
export async function grantTeacherRole(uid: string): Promise<void> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists() && snap.data().role === 'admin') return;
  // merge so an account that has not signed in yet still gets a usable doc
  await setDoc(
    doc(db, 'users', uid),
    { uid, role: 'teacher', updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Drop the teacher role when their profile goes away. Admins keep theirs. */
export async function releaseTeacherRole(uid: string): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().role !== 'teacher') return;
  await updateDoc(ref, { role: 'user', updatedAt: serverTimestamp() });
}

/** Repoint every doc referencing `from` at `to`. */
async function rewriteReferences(from: string, to: string): Promise<number> {
  let n = 0;
  for (const name of ['bookings', 'reviews']) {
    const snap = await getDocs(
      query(collection(db, name), where('teacherId', '==', from))
    );
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => {
        batch.update(d.ref, { teacherId: to });
        n++;
      });
      await batch.commit();
    }
  }
  return n;
}

/**
 * Move an unclaimed profile onto an account: the doc is recreated under the
 * uid, its availability comes with it, and references are repointed.
 * Copy-then-delete, so a failure leaves the original intact.
 */
export async function claimProfile(
  teacherId: string,
  uid: string
): Promise<void> {
  if (teacherId === uid) return;

  const source = await getDoc(doc(db, 'teachers', teacherId));
  if (!source.exists()) throw new Error(`teachers/${teacherId} not found`);
  if ((await getDoc(doc(db, 'teachers', uid))).exists()) {
    throw new AccountAlreadyLinkedError(uid);
  }

  const availability = await getDocs(
    collection(db, 'teachers', teacherId, 'availability')
  );

  // `uid` is no longer part of the model — the document id carries it.
  const { uid: _legacy, ...data } = source.data();
  await setDoc(doc(db, 'teachers', uid), data);
  for (const a of availability.docs) {
    await setDoc(doc(db, 'teachers', uid, 'availability', a.id), a.data());
  }

  const copied = await getDocs(collection(db, 'teachers', uid, 'availability'));
  if (copied.size !== availability.size) {
    throw new Error(
      `availability copy incomplete (${copied.size}/${availability.size}) — original left untouched`
    );
  }

  await rewriteReferences(teacherId, uid);

  const batch = writeBatch(db);
  availability.docs.forEach((a) => batch.delete(a.ref));
  batch.delete(doc(db, 'teachers', teacherId));
  await batch.commit();

  await grantTeacherRole(uid);
}

/** Thrown when the target account already owns a profile. */
export class AccountAlreadyLinkedError extends Error {
  uid: string;

  constructor(uid: string) {
    super(`Account ${uid} already owns a teacher profile`);
    this.name = 'AccountAlreadyLinkedError';
    this.uid = uid;
  }
}

/** Build a URL-safe slug, falling back to the email local part. */
function toSlug(name: string, email: string): string {
  return (
    toAsciiSlug(name) ||
    toAsciiSlug(email.split('@')[0] || '') ||
    'teacher'
  );
}

/** Append `-2`, `-3`, … until the slug is free. */
export async function uniqueSlug(base: string): Promise<string> {
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
 * Ensure an account owns a profile, creating a blank one if not.
 * Left `isActive: false` on purpose — an empty profile must not reach the
 * public teachers list until an admin fills it in and flips the toggle.
 * Returns true when a profile was created.
 */
export async function ensureTeacherProfile(
  uid: string,
  profile?: { name?: string; email?: string }
): Promise<boolean> {
  const ref = doc(db, 'teachers', uid);
  if ((await getDoc(ref)).exists()) return false;

  const name = profile?.name || '';
  const email = profile?.email || '';
  const count = (await getDocs(collection(db, 'teachers'))).size;
  const empty = { en: '', vi: '', ko: '', zh: '', ja: '' };

  await setDoc(ref, {
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
  return true;
}

/**
 * Remove the `teacherId` pointer left on user docs by the old two-link model.
 * Safe to run repeatedly; returns how many docs were cleaned.
 */
export async function dropLegacyUserPointers(): Promise<number> {
  const users = await getDocs(collection(db, 'users'));
  const stale = users.docs.filter((d) => d.data().teacherId !== undefined);
  for (let i = 0; i < stale.length; i += 400) {
    const batch = writeBatch(db);
    stale.slice(i, i + 400).forEach((d) => {
      batch.update(d.ref, { teacherId: deleteField() });
    });
    await batch.commit();
  }
  return stale.length;
}
