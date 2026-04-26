import { useEffect, useState, useCallback } from 'react';
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

export function useNotifications() {
  const { user, role } = useAuthStore();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const eligible = !!user && (role === 'admin' || role === 'teacher');

  useEffect(() => {
    if (!eligible || !user) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as AppNotification
          )
        );
        setLoading(false);
      },
      (err) => {
        console.error('useNotifications snapshot error', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, eligible]);

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
