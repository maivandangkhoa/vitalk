import type { Timestamp } from 'firebase/firestore';
import type { MultiLangText } from './common';

export type NotificationType = 'booking_created' | 'new_message';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  /** Set on booking notifications. */
  bookingId?: string;
  /** Set on chat notifications. */
  conversationId?: string;
  /**
   * Where clicking should land. Written by Cloud Functions for chat; booking
   * notifications predate it and fall back to /admin/bookings.
   */
  link?: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Timestamp | null;
  meta: {
    studentName?: string;
    lessonName?: MultiLangText;
    date?: string;
    startTime?: string;
    teacherId?: string;
    senderName?: string;
  };
}
