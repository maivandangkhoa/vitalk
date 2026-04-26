import type { Timestamp } from 'firebase/firestore';
import type { MultiLangText } from './common';

export type NotificationType = 'booking_created';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  bookingId: string;
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
  };
}
