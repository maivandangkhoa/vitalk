import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MonthlyAvailability } from '@/types';
import type { TeacherProfile } from '@/types';
import { convertTime, getUserTimezone } from '@/lib/timezone';
import { addMinutes, findValidStartTimes } from '@/lib/availability';

export interface AggregatedTeacher {
  id: string;
  name: string;
  profileImageUrl: string;
  rating: number;
  timezone: string;
  /** Original slot times in teacher's timezone */
  originalDate: string;
  originalStartTime: string;
  /** End time = originalStartTime + duration, in teacher's timezone */
  originalEndTime: string;
}

export interface AggregatedSlot {
  /** Start time in the user's timezone */
  startTime: string;
  /** End time in the user's timezone (startTime + duration) */
  endTime: string;
  teachers: AggregatedTeacher[];
}

export type AggregatedSlots = Record<string, AggregatedSlot[]>;

/**
 * Aggregates available booking start times across all teachers for the given
 * lesson duration. A start time is valid only if the teacher has enough
 * consecutive 30-min cells free to fit `durationMinutes`.
 */
export function useAllTeachersAvailableSlots(
  teachers: TeacherProfile[],
  yearMonth: string,
  durationMinutes: number,
) {
  const [slots, setSlots] = useState<AggregatedSlots>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teachers.length || !yearMonth || !durationMinutes) {
      setSlots({});
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      setLoading(true);
      try {
        const userTz = getUserTimezone();

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

        const aggregated: Record<string, Map<string, AggregatedSlot>> = {};

        for (const result of results) {
          if (!result) continue;
          const { teacher, data } = result;
          const teacherTz = teacher.timezone;

          for (const [date, daySlots] of Object.entries(data.slots)) {
            const validStarts = findValidStartTimes(daySlots, durationMinutes);

            for (const teacherStartTime of validStarts) {
              const teacherEndTime = addMinutes(teacherStartTime, durationMinutes);
              const converted = convertTime(teacherStartTime, date, teacherTz, userTz);
              const userDate = converted.date;
              const userStartTime = converted.time;
              const userEndTime = addMinutes(userStartTime, durationMinutes);

              if (!aggregated[userDate]) {
                aggregated[userDate] = new Map();
              }

              const teacherInfo: AggregatedTeacher = {
                id: teacher.id,
                name: teacher.name,
                profileImageUrl: teacher.profileImageUrl,
                rating: teacher.rating,
                timezone: teacherTz,
                originalDate: date,
                originalStartTime: teacherStartTime,
                originalEndTime: teacherEndTime,
              };

              const existing = aggregated[userDate].get(userStartTime);
              if (existing) {
                existing.teachers.push(teacherInfo);
              } else {
                aggregated[userDate].set(userStartTime, {
                  startTime: userStartTime,
                  endTime: userEndTime,
                  teachers: [teacherInfo],
                });
              }
            }
          }
        }

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
  }, [teachers, yearMonth, durationMinutes]);

  return { slots, loading };
}
