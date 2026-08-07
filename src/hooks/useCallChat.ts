import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { conversationIdFor, openConversation, unreadFor } from '@/lib/chat';
import type { Booking, Conversation, TeacherProfile } from '@/types';

interface Viewer {
  uid: string;
  displayName?: string | null;
  photoURL?: string | null;
}

/**
 * The chat that sits beside a lesson is simply the pair's ordinary conversation
 * at `conversations/{studentId}_{teacherId}` — not a thread owned by the call.
 *
 * That choice is what keeps this feature free of backend work: no new
 * collection, no rules, no index. It also means a link or a note typed during
 * the lesson is still in the inbox afterwards, which is where people look for
 * it.
 */
export function useCallChat(booking: Booking | null, viewer: Viewer | null) {
  const conversationId =
    booking ? conversationIdFor(booking.studentId, booking.teacherId) : undefined;
  const [conversation, setConversation] = useState<Conversation | null>(null);

  // Identity of `viewer` is not stable across renders; the uid is what the
  // subscription actually depends on.
  const viewerUid = viewer?.uid;

  useEffect(() => {
    if (!conversationId || !viewerUid) return;

    const unsub = onSnapshot(
      doc(db, 'conversations', conversationId),
      (snap) =>
        setConversation(
          snap.exists() ? ({ id: snap.id, ...snap.data() } as Conversation) : null
        ),
      // Reading a thread that does not exist yet is allowed by the rules, so an
      // error here is a real failure and must not be mistaken for "no thread".
      (err) => console.error('useCallChat snapshot error', err)
    );

    return () => unsub();
  }, [conversationId, viewerUid]);

  /**
   * Create the thread, but only at the moment someone actually says something.
   * Opening the panel is not enough — a silent lesson would otherwise leave an
   * empty conversation in both inboxes.
   */
  const ensure = useCallback(async () => {
    if (!booking || !viewer || conversation) return;

    // The teacher's display name and photo live on their profile, not on the
    // booking, and the inbox renders from what is denormalized here — so it is
    // worth one read to get them right the first (and only) time.
    const profile = await getDoc(doc(db, 'teachers', booking.teacherId));
    const teacher = profile.data() as TeacherProfile | undefined;

    const isStudent = viewer.uid === booking.studentId;
    await openConversation({
      studentId: booking.studentId,
      studentName: booking.studentName,
      studentPhoto: isStudent ? viewer.photoURL || '' : '',
      teacher: {
        id: booking.teacherId,
        name: teacher?.name || booking.teacherName,
        profileImageUrl: teacher?.profileImageUrl || (isStudent ? '' : viewer.photoURL || ''),
      },
    });
  }, [booking, viewer, conversation]);

  return {
    conversationId,
    conversation,
    unread: viewer && conversation ? unreadFor(conversation, viewer.uid) : 0,
    ensure,
  };
}
