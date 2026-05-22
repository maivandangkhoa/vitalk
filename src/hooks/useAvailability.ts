import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MonthlyAvailability, TimeSlot, WeeklyTemplate } from '@/types';
import { DEFAULT_TIMEZONE, SLOT_GRANULARITY_MINUTES } from '@/lib/constants';
import { addMinutes } from '@/lib/availability';
import { format } from 'date-fns';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * Generate monthly TimeSlots from a weekly template of cell start times.
 * Each entry in `template[dayName]` is the start of a 30-min cell.
 */
export function generateMonthSlots(
  year: number,
  month: number,
  weeklyTemplate: WeeklyTemplate,
): Record<string, TimeSlot[]> {
  const slots: Record<string, TimeSlot[]> = {};
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayName = DAY_NAMES[date.getDay()];
    const dateStr = format(date, 'yyyy-MM-dd');

    const cellStarts = weeklyTemplate[dayName];
    if (cellStarts && cellStarts.length > 0) {
      const daySlots: TimeSlot[] = cellStarts
        .slice()
        .sort()
        .map((startTime) => ({
          startTime,
          endTime: addMinutes(startTime, SLOT_GRANULARITY_MINUTES),
          isBooked: false,
          bookingId: null,
        }));
      if (daySlots.length > 0) {
        slots[dateStr] = daySlots;
      }
    }
  }

  return slots;
}

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

  const saveTemplate = useCallback(
    async (newTemplate: WeeklyTemplate) => {
      await setDoc(availabilityDocPath(teacherId, 'weeklyTemplate'), {
        template: newTemplate,
        updatedAt: serverTimestamp(),
      });
      setTemplate(newTemplate);
    },
    [teacherId],
  );

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
    async (
      slots: Record<string, TimeSlot[]>,
      timezone: string = DEFAULT_TIMEZONE,
      customDates: string[] = [],
    ) => {
      const data: Omit<MonthlyAvailability, 'updatedAt'> & { updatedAt: ReturnType<typeof serverTimestamp> } = {
        slots,
        customDates,
        timezone,
        updatedAt: serverTimestamp(),
      };
      await setDoc(availabilityDocPath(teacherId, yearMonth), data);
      setAvailability({ ...data, updatedAt: new Date() } as MonthlyAvailability);
    },
    [teacherId, yearMonth],
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
