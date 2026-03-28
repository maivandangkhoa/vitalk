import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MonthlyAvailability, TimeSlot } from '@/types';
import { LESSON_DURATION_MINUTES, BREAK_DURATION_MINUTES, DEFAULT_TIMEZONE } from '@/lib/constants';
import { format } from 'date-fns';

export type WeeklyTemplate = Record<string, { from: string; to: string }[]>;

function generateSlotsFromRange(from: string, to: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const [fromH, fromM] = from.split(':').map(Number);
  const [toH, toM] = to.split(':').map(Number);
  let currentMinutes = fromH * 60 + fromM;
  const endMinutes = toH * 60 + toM;

  while (currentMinutes + LESSON_DURATION_MINUTES <= endMinutes) {
    const startH = Math.floor(currentMinutes / 60);
    const startM = currentMinutes % 60;
    const endTotal = currentMinutes + LESSON_DURATION_MINUTES;
    const endH = Math.floor(endTotal / 60);
    const endM = endTotal % 60;

    slots.push({
      startTime: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
      endTime: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
      isBooked: false,
      bookingId: null,
    });

    currentMinutes = endTotal + BREAK_DURATION_MINUTES;
  }

  return slots;
}

export function generateMonthSlots(
  year: number,
  month: number,
  weeklyTemplate: Record<string, { from: string; to: string }[]>
): Record<string, TimeSlot[]> {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const slots: Record<string, TimeSlot[]> = {};

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayName = dayNames[date.getDay()];
    const dateStr = format(date, 'yyyy-MM-dd');

    const dayRanges = weeklyTemplate[dayName];
    if (dayRanges && dayRanges.length > 0) {
      const daySlots: TimeSlot[] = [];
      for (const range of dayRanges) {
        daySlots.push(...generateSlotsFromRange(range.from, range.to));
      }
      if (daySlots.length > 0) {
        slots[dateStr] = daySlots;
      }
    }
  }

  return slots;
}

/** Helper to get the availability doc path for a teacher */
function availabilityDocPath(teacherId: string, docId: string) {
  return doc(db, 'teachers', teacherId, 'availability', docId);
}

export function useWeeklyTemplate(teacherId: string) {
  const [template, setTemplate] = useState<WeeklyTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) return;
    const fetchTemplate = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(availabilityDocPath(teacherId, 'weeklyTemplate'));
        if (snap.exists()) {
          setTemplate(snap.data().template as WeeklyTemplate);
        } else {
          setTemplate(null);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchTemplate();
  }, [teacherId]);

  const saveTemplate = useCallback(async (newTemplate: WeeklyTemplate) => {
    await setDoc(availabilityDocPath(teacherId, 'weeklyTemplate'), {
      template: newTemplate,
      updatedAt: serverTimestamp(),
    });
    setTemplate(newTemplate);
  }, [teacherId]);

  return { template, loading, saveTemplate };
}

export function useAvailability(teacherId: string, yearMonth: string) {
  const [availability, setAvailability] = useState<MonthlyAvailability | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId || !yearMonth) return;

    const fetchAvailability = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(availabilityDocPath(teacherId, yearMonth));
        if (snap.exists()) {
          setAvailability(snap.data() as MonthlyAvailability);
        } else {
          setAvailability(null);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAvailability();
  }, [teacherId, yearMonth]);

  const saveAvailability = useCallback(
    async (slots: Record<string, TimeSlot[]>, timezone: string = DEFAULT_TIMEZONE) => {
      const data: Omit<MonthlyAvailability, 'updatedAt'> & { updatedAt: ReturnType<typeof serverTimestamp> } = {
        slots,
        timezone,
        updatedAt: serverTimestamp(),
      };
      await setDoc(availabilityDocPath(teacherId, yearMonth), data);
      setAvailability({ ...data, updatedAt: new Date() } as MonthlyAvailability);
    },
    [teacherId, yearMonth]
  );

  return { availability, loading, saveAvailability };
}

export function useAvailableSlots(teacherId: string, yearMonth: string) {
  const [slots, setSlots] = useState<Record<string, TimeSlot[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId || !yearMonth) return;

    const fetch = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(availabilityDocPath(teacherId, yearMonth));
        if (snap.exists()) {
          const data = snap.data() as MonthlyAvailability;
          const available: Record<string, TimeSlot[]> = {};
          for (const [date, daySlots] of Object.entries(data.slots)) {
            const free = daySlots.filter((s) => !s.isBooked);
            if (free.length > 0) {
              available[date] = free;
            }
          }
          setSlots(available);
        } else {
          setSlots({});
        }
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [teacherId, yearMonth]);

  return { slots, loading };
}
