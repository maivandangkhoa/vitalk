import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { toast } from 'sonner';
import { app, db } from './firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

let cachedSwReg: ServiceWorkerRegistration | null = null;

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (cachedSwReg) return cachedSwReg;
  if (!('serviceWorker' in navigator)) return null;
  cachedSwReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/',
  });
  return cachedSwReg;
}

export async function isPushSupported(): Promise<boolean> {
  if (!VAPID_KEY) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestPushPermission(uid: string): Promise<{
  ok: boolean;
  reason?: 'unsupported' | 'denied' | 'no-token' | 'error';
}> {
  if (!(await isPushSupported())) return { ok: false, reason: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const swReg = await registerServiceWorker();
    if (!swReg) return { ok: false, reason: 'unsupported' };

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) return { ok: false, reason: 'no-token' };

    await setDoc(
      doc(db, 'users', uid),
      { fcmTokens: arrayUnion(token) },
      { merge: true }
    );
    return { ok: true };
  } catch (err) {
    console.error('requestPushPermission error', err);
    return { ok: false, reason: 'error' };
  }
}

export async function removeCurrentPushToken(uid: string): Promise<void> {
  if (!(await isPushSupported())) return;
  try {
    const swReg = await registerServiceWorker();
    if (!swReg) return;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) return;
    await setDoc(
      doc(db, 'users', uid),
      { fcmTokens: arrayRemove(token) },
      { merge: true }
    );
  } catch (err) {
    console.error('removeCurrentPushToken error', err);
  }
}

export async function listenForegroundMessages(): Promise<() => void> {
  if (!(await isPushSupported())) return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title;
    const body = payload.notification?.body;
    if (title) toast(title, { description: body });
  });
}
