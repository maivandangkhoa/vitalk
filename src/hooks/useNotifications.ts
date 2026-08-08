import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import type { AppNotification } from '@/types';

const PAGE_SIZE = 30;

/** A snapshot, tagged with the account it belongs to. */
interface Feed {
  uid: string;
  items: AppNotification[];
}

export function useNotifications() {
  const { user } = useAuthStore();
  const [feed, setFeed] = useState<Feed | null>(null);

  // Everyone signed in now has a feed — students receive chat notifications
  // even though bookings only ever notify teachers and admins.
  const eligible = !!user;

  useEffect(() => {
    if (!eligible || !user) return;
    const uid = user.uid;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setFeed({
          uid,
          items: snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as AppNotification
          ),
        });
      },
      (err) => {
        console.error('useNotifications snapshot error', err);
        setFeed({ uid, items: [] });
      }
    );

    return () => unsub();
  }, [user, eligible]);

  // Tagging the feed with its uid means "loading" and "empty" are derived from
  // whose data we are holding, rather than written back by the effect. Signing
  // out or switching account therefore cannot leak the previous user's feed.
  const current = user && feed?.uid === user.uid ? feed : null;
  const items = useMemo(() => current?.items ?? [], [current]);
  const loading = eligible && !current;

  const unreadCount = items.filter((n) => !n.read).length;

  const markAsRead = useCallback(async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  }, []);

  const markAllAsRead = useCallback(async () => {
    const unread = items.filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true }));
    await batch.commit();
  }, [items]);

  return { items, loading, unreadCount, markAsRead, markAllAsRead, eligible };
}
