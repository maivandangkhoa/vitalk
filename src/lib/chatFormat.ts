import type { Timestamp } from 'firebase/firestore';

/** A server timestamp reads back as null until the write lands. */
function toDate(ts: Timestamp | null | undefined): Date | null {
  return ts ? ts.toDate() : null;
}

/** Inbox column: time today, weekday this week, date beyond that. */
export function formatChatTime(
  ts: Timestamp | null | undefined,
  locale: string
): string {
  const date = toDate(ts);
  if (!date) return '';

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  const daysAgo = (now.getTime() - date.getTime()) / 86_400_000;
  if (daysAgo < 7) return date.toLocaleDateString(locale, { weekday: 'short' });

  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/** Clock next to a bubble. */
export function formatMessageTime(
  ts: Timestamp | null | undefined,
  locale: string
): string {
  const date = toDate(ts);
  if (!date) return '';
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** Day separator inside a thread. */
export function formatDayLabel(
  ts: Timestamp | null | undefined,
  locale: string
): string {
  const date = toDate(ts);
  if (!date) return '';
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Group key for the day separator; pending messages join the last real day. */
export function dayKey(ts: Timestamp | null | undefined): string {
  const date = toDate(ts);
  return date ? date.toDateString() : '';
}
