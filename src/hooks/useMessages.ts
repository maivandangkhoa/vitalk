import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { markConversationRead } from '@/lib/chat';
import { useAuthStore } from '@/stores/authStore';
import type { ChatMessage, Conversation } from '@/types';

const PAGE_SIZE = 50;

/**
 * Realtime thread, newest `PAGE_SIZE` messages, returned oldest-first for
 * rendering. `loadMore` widens the same subscription rather than paging with
 * cursors — a chat window is small enough that one growing listener is simpler
 * and cheaper than stitching pages together.
 */
export function useMessages(conversation: Conversation | null) {
  const { user } = useAuthStore();
  const [loaded, setLoaded] = useState<{ id: string; messages: ChatMessage[] } | null>(null);
  // Keyed by conversation so switching threads resets the window without an
  // effect that would only exist to call setState.
  const [page, setPage] = useState<{ id: string; size: number } | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const conversationId = conversation?.id;
  const pageSize = page && page.id === conversationId ? page.size : PAGE_SIZE;

  // A snapshot from the previous thread must never render under the new one.
  const messages = loaded && loaded.id === conversationId ? loaded.messages : [];
  const loading = !!conversationId && loaded?.id !== conversationId;

  useEffect(() => {
    if (!conversationId) return;

    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
        setLoaded({ id: conversationId, messages: docs.reverse() });
        setHasMore(snap.size === pageSize);
      },
      (err) => {
        console.error('useMessages snapshot error', err);
        setLoaded({ id: conversationId, messages: [] });
      }
    );

    return () => unsub();
  }, [conversationId, pageSize]);

  // Opening a thread is what marks it read. Re-runs whenever a new message
  // lands while the thread is on screen, so the counter stays at zero.
  useEffect(() => {
    if (!conversation || !user) return;
    if (!conversation.participants.includes(user.uid)) return;
    markConversationRead(conversation, user.uid).catch((err) =>
      console.error('markConversationRead error', err)
    );
  }, [conversation, user, messages.length]);

  return {
    messages,
    loading,
    hasMore,
    loadMore: () =>
      conversationId && setPage({ id: conversationId, size: pageSize + PAGE_SIZE }),
  };
}
