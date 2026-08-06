import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { unreadFor } from '@/lib/chat';
import { useAuthStore } from '@/stores/authStore';
import type { Conversation } from '@/types';

const PAGE_SIZE = 100;

interface Options {
  /** Admins monitor every conversation instead of their own (read-only). */
  all?: boolean;
}

/**
 * Realtime inbox. `all` is for the admin monitor — anyone else only ever sees
 * threads they are a participant of, which is also what the rules allow.
 */
export function useConversations({ all = false }: Options = {}) {
  const { user } = useAuthStore();
  const [snapshotItems, setSnapshotItems] = useState<Conversation[]>([]);
  const [subscribed, setSubscribed] = useState(false);

  // Derived rather than reset inside the effect: signing out must not leave the
  // previous account's inbox on screen for a render.
  const items = useMemo(() => (user ? snapshotItems : []), [user, snapshotItems]);
  const loading = !!user && !subscribed;

  useEffect(() => {
    if (!user) return;

    const base = collection(db, 'conversations');
    const q = all
      ? query(base, orderBy('updatedAt', 'desc'), limit(PAGE_SIZE))
      : query(
          base,
          where('participants', 'array-contains', user.uid),
          orderBy('updatedAt', 'desc'),
          limit(PAGE_SIZE)
        );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setSnapshotItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Conversation));
        setSubscribed(true);
      },
      (err) => {
        console.error('useConversations snapshot error', err);
        setSubscribed(true);
      }
    );

    return () => unsub();
  }, [user, all]);

  const totalUnread = useMemo(() => {
    if (!user || all) return 0;
    return items.reduce((sum, c) => sum + unreadFor(c, user.uid), 0);
  }, [items, user, all]);

  const byId = useCallback(
    (id: string | undefined) => items.find((c) => c.id === id) ?? null,
    [items]
  );

  return { items, loading, totalUnread, byId };
}

/** Just the badge number, for the header. */
export function useUnreadMessageCount(): number {
  return useConversations().totalUnread;
}
