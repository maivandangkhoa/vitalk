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

export function useAdminBookings(statusFilter?: BookingStatus) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      let q;
      if (statusFilter) {
        q = query(
          collection(db, 'bookings'),
          where('status', '==', statusFilter),
          orderBy('date', 'asc')
        );
      } else {
        q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
      }
      const snap = await getDocs(q);
      setBookings(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking)
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  return { bookings, loading, refetch: fetchBookings };
}

interface CreateBookingData {
  lessonTypeId: string;
  lessonTypeName: Booking['lessonTypeName'];
  date: string;
  startTime: string;
  endTime: string;
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
        const yearMonth = data.date.substring(0, 7); // "2026-03"
        const availRef = doc(db, 'availability', yearMonth);
        const bookingRef = doc(collection(db, 'bookings'));

        await runTransaction(db, async (transaction) => {
          const availSnap = await transaction.get(availRef);
          if (!availSnap.exists()) {
            throw new Error('No availability for this month');
          }

          const availData = availSnap.data();
          const daySlots: TimeSlot[] = availData.slots[data.date] || [];
          const slotIndex = daySlots.findIndex(
            (s) => s.startTime === data.startTime && !s.isBooked
          );

          if (slotIndex === -1) {
            throw new Error('This time slot is no longer available');
          }

          // Mark slot as booked
          daySlots[slotIndex] = {
            ...daySlots[slotIndex],
            isBooked: true,
            bookingId: bookingRef.id,
          };

          transaction.update(availRef, {
            [`slots.${data.date}`]: daySlots,
            updatedAt: serverTimestamp(),
          });

          const booking: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'> & {
            createdAt: ReturnType<typeof serverTimestamp>;
            updatedAt: ReturnType<typeof serverTimestamp>;
          } = {
            studentId: user.uid,
            studentName: user.displayName || '',
            studentEmail: user.email || '',
            lessonTypeId: data.lessonTypeId,
            lessonTypeName: data.lessonTypeName,
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            timezone: 'Asia/Seoul',
            format: data.format,
            platform: data.platform,
            meetingLink: null,
            offlineLocation: data.offlineLocation,
            paymentMethod: data.paymentMethod,
            paymentStatus: data.paymentMethod === 'bank_transfer' ? 'pending' : 'pending',
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
    const availRef = doc(db, 'availability', yearMonth);
    const availSnap = await transaction.get(availRef);

    if (availSnap.exists()) {
      const availData = availSnap.data();
      const daySlots: TimeSlot[] = availData.slots[booking.date] || [];
      const slotIndex = daySlots.findIndex(
        (s) => s.bookingId === bookingId
      );

      if (slotIndex !== -1) {
        daySlots[slotIndex] = {
          ...daySlots[slotIndex],
          isBooked: false,
          bookingId: null,
        };
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
