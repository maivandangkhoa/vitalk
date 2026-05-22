import type { MultiLangText } from './common';

export type BookingFormat = 'online' | 'offline';
export type OnlinePlatform = 'teams' | 'google_meet' | 'zalo' | 'kakao_talk' | 'zoom';
export type PaymentMethod = 'paypal' | 'toss' | 'bank_transfer';
export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface TimeSlot {
  startTime: string;
  endTime: string;
  isBooked: boolean;
  bookingId: string | null;
}

export interface MonthlyAvailability {
  slots: Record<string, TimeSlot[]>;
  /**
   * Dates (in "YYYY-MM-DD" form) the teacher has manually customized via the
   * Calendar Override tab. Save will preserve these and only regenerate the
   * untouched dates from the weekly template.
   */
  customDates?: string[];
  timezone: string;
  updatedAt: Date;
}

/**
 * Weekly availability template: per weekday name (Monday..Sunday),
 * a list of 30-min cell start times ("09:00", "09:30", ...).
 */
export type WeeklyTemplate = Record<string, string[]>;

/** Stored on booking documents — minimal location info */
export interface OfflineLocation {
  name: string;
  address: string;
  isCustom?: boolean;
}

/** Full location document from the 'locations' collection */
export interface Location {
  id: string;
  name: string;
  address: string;
  googleMapsUrl: string;
  naverMapUrl: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface Booking {
  id: string;
  teacherId: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  lessonTypeId: string;
  lessonTypeName: MultiLangText;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  timezone: string;
  format: BookingFormat;
  platform: OnlinePlatform | null;
  meetingLink: string | null;
  offlineLocation: OfflineLocation | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference: string;
  amount: number;
  currency: string;
  status: BookingStatus;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}
