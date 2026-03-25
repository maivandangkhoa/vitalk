import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';
import { TEACHER_TIMEZONE } from '@/lib/constants';

/**
 * Get the user's IANA timezone string (e.g., "Asia/Ho_Chi_Minh", "America/New_York")
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return TEACHER_TIMEZONE;
  }
}

/**
 * Convert a "HH:mm" time from one timezone to another for a specific date.
 * Returns both converted time and (possibly shifted) date.
 */
export function convertTime(
  time: string,
  date: string,
  fromTz: string,
  toTz: string,
): { time: string; date: string } {
  if (fromTz === toTz) return { time, date };

  const dateTimeStr = `${date}T${time}:00`;
  const utcDate = fromZonedTime(dateTimeStr, fromTz);
  const zonedDate = toZonedTime(utcDate, toTz);

  return {
    time: format(zonedDate, 'HH:mm'),
    date: format(zonedDate, 'yyyy-MM-dd'),
  };
}

/**
 * Convert a time slot (start + end) from teacher TZ to user TZ.
 */
export function convertSlotToUserTz(
  startTime: string,
  endTime: string,
  date: string,
  userTz: string,
): { startTime: string; endTime: string; date: string } {
  const start = convertTime(startTime, date, TEACHER_TIMEZONE, userTz);
  const end = convertTime(endTime, date, TEACHER_TIMEZONE, userTz);
  return {
    startTime: start.time,
    endTime: end.time,
    date: start.date,
  };
}

/**
 * Get a short timezone label (e.g., "KST", "JST", "ICT", "PST")
 */
export function getTimezoneLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || tz;
  } catch {
    return tz;
  }
}
