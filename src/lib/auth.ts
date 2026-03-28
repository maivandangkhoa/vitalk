import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInWithCustomToken,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { AppUser, Language, UserRole } from '@/types';

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureUserDoc(result.user, 'google');
  return result.user;
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserDoc(result.user, 'email');
  return result.user;
}

export async function signUpWithEmail(email: string, password: string) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserDoc(result.user, 'email');
  return result.user;
}

export async function signInWithKakaoToken(customToken: string) {
  const result = await signInWithCustomToken(auth, customToken);
  await ensureUserDoc(result.user, 'kakao');
  return result.user;
}

export async function signOut() {
  await firebaseSignOut(auth);
}

export async function getUserRole(user: User): Promise<{ role: UserRole; teacherId: string | null }> {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  const data = userSnap.data();
  return {
    role: (data?.role as UserRole) || 'user',
    teacherId: data?.teacherId || null,
  };
}

async function ensureUserDoc(
  user: User,
  provider: 'google' | 'kakao' | 'email'
) {
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
  } else {
    await setDoc(userRef, { lastLoginAt: serverTimestamp() }, { merge: true });
  }
}
