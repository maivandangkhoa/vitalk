import { SLOT_GRANULARITY_MINUTES } from './constants';
import type { TimeSlot } from '@/types/booking';

/** Convert "HH:mm" → minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Convert minutes since midnight → "HH:mm" (wraps with mod 1440). */
export function minutesToTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** "09:00" + 90 → "10:30". */
export function addMinutes(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

/**
 * For a booking starting at `startTime` lasting `durationMinutes`, return the
 * list of 30-min cell start times it consumes.
 * e.g. ("09:00", 90) → ["09:00", "09:30", "10:00"]
 */
export function slotKeysForBooking(startTime: string, durationMinutes: number): string[] {
  const cellCount = Math.ceil(durationMinutes / SLOT_GRANULARITY_MINUTES);
  const startMin = timeToMinutes(startTime);
  return Array.from({ length: cellCount }, (_, i) =>
    minutesToTime(startMin + i * SLOT_GRANULARITY_MINUTES),
  );
}

/**
 * Given an array of TimeSlots (30-min cells, possibly out of order),
 * return all `startTime` values that have enough consecutive free cells
 * to fit `durationMinutes`.
 */
export function findValidStartTimes(
  daySlots: TimeSlot[],
  durationMinutes: number,
): string[] {
  const freeByStart = new Map<string, TimeSlot>();
  for (const s of daySlots) {
    if (!s.bookingId) freeByStart.set(s.startTime, s);
  }
  const result: string[] = [];
  for (const slot of daySlots) {
    if (slot.bookingId) continue;
    const keys = slotKeysForBooking(slot.startTime, durationMinutes);
    if (keys.every((k) => freeByStart.has(k))) {
      result.push(slot.startTime);
    }
  }
  return result.sort();
}
