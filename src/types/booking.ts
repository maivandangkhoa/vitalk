import type { MultiLangText } from './common';

export type BookingFormat = 'online' | 'offline';
export type OnlinePlatform = 'zoom' | 'google_meet' | 'teams';
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
  timezone: string;
  updatedAt: Date;
}

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
