import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MonthlyAvailability } from '@/types';
import type { TeacherProfile } from '@/types';
import { convertTime } from '@/lib/timezone';
import { getUserTimezone } from '@/lib/timezone';

export interface AggregatedTeacher {
  id: string;
  name: string;
  profileImageUrl: string;
  rating: number;
  timezone: string;
  /** Original slot times in teacher's timezone */
  originalDate: string;
  originalStartTime: string;
  originalEndTime: string;
}

export interface AggregatedSlot {
  /** Time displayed in user timezone */
  startTime: string;
  endTime: string;
  teachers: AggregatedTeacher[];
}

export type AggregatedSlots = Record<string, AggregatedSlot[]>;

export function useAllTeachersAvailableSlots(
  teachers: TeacherProfile[],
  yearMonth: string,
) {
  const [slots, setSlots] = useState<AggregatedSlots>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teachers.length || !yearMonth) {
      setSlots({});
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      setLoading(true);
      try {
        const userTz = getUserTimezone();

        // Fetch availability for all teachers in parallel
        const results = await Promise.all(
          teachers.map(async (teacher) => {
            const snap = await getDoc(
              doc(db, 'teachers', teacher.id, 'availability', yearMonth),
            );
            if (!snap.exists()) return null;
            const data = snap.data() as MonthlyAvailability;
            return { teacher, data };
          }),
        );

        // Aggregate: group by (userTZ date + userTZ startTime)
        const aggregated: Record<string, Map<string, AggregatedSlot>> = {};

        for (const result of results) {
          if (!result) continue;
          const { teacher, data } = result;
          const teacherTz = teacher.timezone;

          for (const [date, daySlots] of Object.entries(data.slots)) {
            for (const slot of daySlots) {
              if (slot.isBooked) continue;

              // Convert to user timezone
              const converted = convertTime(slot.startTime, date, teacherTz, userTz);
              const convertedEnd = convertTime(slot.endTime, date, teacherTz, userTz);
              const userDate = converted.date;
              const userStartTime = converted.time;
              const userEndTime = convertedEnd.time;

              if (!aggregated[userDate]) {
                aggregated[userDate] = new Map();
              }

              const key = userStartTime;
              const existing = aggregated[userDate].get(key);

              const teacherInfo: AggregatedTeacher = {
                id: teacher.id,
                name: teacher.name,
                profileImageUrl: teacher.profileImageUrl,
                rating: teacher.rating,
                timezone: teacherTz,
                originalDate: date,
                originalStartTime: slot.startTime,
                originalEndTime: slot.endTime,
              };

              if (existing) {
                existing.teachers.push(teacherInfo);
              } else {
                aggregated[userDate].set(key, {
                  startTime: userStartTime,
                  endTime: userEndTime,
                  teachers: [teacherInfo],
                });
              }
            }
          }
        }

        // Convert Maps to sorted arrays, filter past dates
        const today = new Date(new Date().toDateString());
        const result: AggregatedSlots = {};

        for (const [date, slotMap] of Object.entries(aggregated)) {
          const dateObj = new Date(date + 'T00:00:00');
          if (dateObj < today) continue;

          const sorted = Array.from(slotMap.values()).sort((a, b) =>
            a.startTime.localeCompare(b.startTime),
          );
          if (sorted.length > 0) {
            result[date] = sorted;
          }
        }

        setSlots(result);
      } catch (err) {
        console.error('Failed to fetch aggregated availability:', err);
        setSlots({});
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [teachers, yearMonth]);

  return { slots, loading };
}
