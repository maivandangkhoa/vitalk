import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { getUserTimezone } from '@/lib/timezone';
import { slotKeysForBooking } from '@/lib/availability';
import type { Booking, BookingStatus, TimeSlot } from '@/types';

export function useMyBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) {
      setBookings([]);
      setLoading(false);
      return;
    }

    const fetchBookings = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'bookings'),
          where('studentId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setBookings(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking)
        );
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, [user]);

  return { bookings, loading };
}

export function useAdminBookings(statusFilter?: BookingStatus, teacherId?: string) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const constraints: Parameters<typeof query>[1][] = [];

      if (teacherId) {
        constraints.push(where('teacherId', '==', teacherId));
      }
      if (statusFilter) {
        constraints.push(where('status', '==', statusFilter));
        constraints.push(orderBy('date', 'asc'));
      } else {
        constraints.push(orderBy('createdAt', 'desc'));
      }

      const q = query(collection(db, 'bookings'), ...constraints);
      const snap = await getDocs(q);
      setBookings(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking)
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter, teacherId]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  return { bookings, loading, refetch: fetchBookings };
}

interface CreateBookingData {
  teacherId: string;
  teacherName: string;
  lessonTypeId: string;
  lessonTypeName: Booking['lessonTypeName'];
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  format: Booking['format'];
  platform: Booking['platform'];
  offlineLocation: Booking['offlineLocation'];
  paymentMethod: Booking['paymentMethod'];
  notes: string;
  amount: number;
  currency: string;
}

export function useCreateBooking() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();

  const createBooking = useCallback(
    async (data: CreateBookingData): Promise<string> => {
      if (!user) throw new Error('Not authenticated');

      setLoading(true);
      try {
        const yearMonth = data.date.substring(0, 7);
        const availRef = doc(db, 'teachers', data.teacherId, 'availability', yearMonth);
        const bookingRef = doc(collection(db, 'bookings'));

        await runTransaction(db, async (transaction) => {
          const availSnap = await transaction.get(availRef);
          if (!availSnap.exists()) {
            throw new Error('No availability for this month');
          }

          const availData = availSnap.data();
          const daySlots: TimeSlot[] = availData.slots[data.date] || [];

          const cellKeys = slotKeysForBooking(data.startTime, data.durationMinutes);
          const indicesToBook: number[] = [];
          for (const key of cellKeys) {
            const idx = daySlots.findIndex((s) => s.startTime === key);
            if (idx === -1 || daySlots[idx].bookingId) {
              throw new Error('This time slot is no longer available');
            }
            indicesToBook.push(idx);
          }

          for (const idx of indicesToBook) {
            daySlots[idx] = { startTime: daySlots[idx].startTime, bookingId: bookingRef.id };
          }

          transaction.update(availRef, {
            [`slots.${data.date}`]: daySlots,
            updatedAt: serverTimestamp(),
          });

          const booking: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'> & {
            createdAt: ReturnType<typeof serverTimestamp>;
            updatedAt: ReturnType<typeof serverTimestamp>;
          } = {
            teacherId: data.teacherId,
            teacherName: data.teacherName,
            studentId: user.uid,
            studentName: user.displayName || '',
            studentEmail: user.email || '',
            lessonTypeId: data.lessonTypeId,
            lessonTypeName: data.lessonTypeName,
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            durationMinutes: data.durationMinutes,
            timezone: getUserTimezone(),
            format: data.format,
            platform: data.platform,
            meetingLink: null,
            offlineLocation: data.offlineLocation,
            paymentMethod: data.paymentMethod,
            paymentStatus: 'pending',
            paymentReference: '',
            amount: data.amount,
            currency: data.currency,
            status: 'pending',
            notes: data.notes,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          transaction.set(bookingRef, booking);
        });

        return bookingRef.id;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  return { createBooking, loading };
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus
) {
  await updateDoc(doc(db, 'bookings', bookingId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function confirmBookingPayment(bookingId: string) {
  await updateDoc(doc(db, 'bookings', bookingId), {
    paymentStatus: 'confirmed',
    status: 'confirmed',
    updatedAt: serverTimestamp(),
  });
}

export async function addMeetingLink(bookingId: string, meetingLink: string) {
  await updateDoc(doc(db, 'bookings', bookingId), {
    meetingLink,
    updatedAt: serverTimestamp(),
  });
}

export async function cancelBooking(bookingId: string) {
  const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
  if (!bookingSnap.exists()) return;

  const booking = bookingSnap.data() as Booking;
  const yearMonth = booking.date.substring(0, 7);

  await runTransaction(db, async (transaction) => {
    const availRef = doc(db, 'teachers', booking.teacherId, 'availability', yearMonth);
    const availSnap = await transaction.get(availRef);

    if (availSnap.exists()) {
      const availData = availSnap.data();
      const daySlots: TimeSlot[] = availData.slots[booking.date] || [];
      let changed = false;
      for (let i = 0; i < daySlots.length; i++) {
        if (daySlots[i].bookingId === bookingId) {
          daySlots[i] = { startTime: daySlots[i].startTime, bookingId: null };
          changed = true;
        }
      }
      if (changed) {
        transaction.update(availRef, {
          [`slots.${booking.date}`]: daySlots,
          updatedAt: serverTimestamp(),
        });
      }
    }

    transaction.update(doc(db, 'bookings', bookingId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  });
}
