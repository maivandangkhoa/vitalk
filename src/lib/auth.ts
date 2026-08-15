import {
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInWithCustomToken,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { trackEvent } from './analytics';
import type { AppUser, Language, UserRole } from '@/types';

const googleProvider = new GoogleAuthProvider();

// public_profile only, deliberately. Meta grants it without App Review, while
// the `email` scope needs Advanced Access — App Review plus Business
// Verification. The booking form collects an address instead, so we skip all
// of that; the cost is that a Facebook account can't be matched to an existing
// Google one by email.
const facebookProvider = new FacebookAuthProvider();
facebookProvider.addScope('public_profile');

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return finishSignIn(result.user, 'google');
}

export async function signInWithFacebook() {
  const result = await signInWithPopup(auth, facebookProvider);
  return finishSignIn(result.user, 'facebook');
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return finishSignIn(result.user, 'email');
}

export async function signUpWithEmail(email: string, password: string) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return finishSignIn(result.user, 'email');
}

export async function signInWithKakaoToken(customToken: string) {
  const result = await signInWithCustomToken(auth, customToken);
  return finishSignIn(result.user, 'kakao');
}

export async function signInWithNaverToken(customToken: string) {
  const result = await signInWithCustomToken(auth, customToken);
  return finishSignIn(result.user, 'naver');
}

/**
 * The one place every provider passes through, so analytics sees each sign-in
 * exactly once. Whether the user doc had to be created is the only honest
 * signal of a first-ever sign-in — social providers never tell us.
 */
async function finishSignIn(user: User, provider: AppUser['provider']) {
  const created = await ensureUserDoc(user, provider);
  trackEvent(created ? 'sign_up' : 'login', { method: provider });
  return user;
}

export async function signOut() {
  await firebaseSignOut(auth);
}

export async function getUserRole(user: User): Promise<{ role: UserRole; teacherId: string | null }> {
  const userSnap = await getDoc(doc(db, 'users', user.uid));
  const role = (userSnap.data()?.role as UserRole) || 'user';

  // A teacher profile is stored under its owner's uid, so the only question is
  // whether one exists. Plain students never need the extra read.
  if (role === 'user') return { role, teacherId: null };
  const profile = await getDoc(doc(db, 'teachers', user.uid));

  return { role, teacherId: profile.exists() ? user.uid : null };
}

/** Returns true when this sign-in created the user doc, i.e. a new account. */
async function ensureUserDoc(
  user: User,
  provider: AppUser['provider']
): Promise<boolean> {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const newUser: Omit<AppUser, 'createdAt' | 'lastLoginAt'> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      lastLoginAt: ReturnType<typeof serverTimestamp>;
    } = {
      uid: user.uid,
      displayName: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL,
      role: 'user',
      provider,
      preferredLanguage: 'en' as Language,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };
    await setDoc(userRef, newUser);
    return true;
  } else {
    // An admin may have pre-created this doc to link a teacher profile, so it
    // can be missing identity fields. Refresh them, never `role`/`teacherId`
    // (firestore.rules rejects a non-admin changing those).
    const existing = userSnap.data();
    await setDoc(
      userRef,
      {
        uid: user.uid,
        displayName: user.displayName || existing.displayName || '',
        email: user.email || existing.email || '',
        photoURL: user.photoURL ?? existing.photoURL ?? null,
        provider: existing.provider || provider,
        preferredLanguage: existing.preferredLanguage || ('en' as Language),
        ...(existing.createdAt ? {} : { createdAt: serverTimestamp() }),
        lastLoginAt: serverTimestamp(),
      },
      { merge: true }
    );
    return false;
  }
}
