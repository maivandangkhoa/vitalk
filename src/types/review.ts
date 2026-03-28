import type { Language } from './common';

export interface Review {
  id: string;
  teacherId: string;
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
  rating: number;
  content: string;
  lessonType: string;
  language: Language;
  bookingId?: string;
  isVisible: boolean;
  createdAt: Date;
  source?: 'italki' | 'user';
  externalId?: string;
}
