import { fromZonedTime } from 'date-fns-tz';
import { DEFAULT_TIMEZONE } from '@/lib/constants';
import { JOIN_WINDOW_AFTER_MS, JOIN_WINDOW_BEFORE_MS } from '@/types/call';
import type { Booking } from '@/types';

export type CallWindowState = 'early' | 'open' | 'over';

/**
 * The lesson's real start and end as absolute instants.
 *
 * A booking stores wall-clock strings plus the timezone they were written in,
 * so the two people — who may be in Seoul and Ho Chi Minh City — have to be
 * compared through UTC rather than against their own clocks.
 */
export function lessonBounds(booking: Booking): { start: Date; end: Date } {
  const tz = booking.timezone || DEFAULT_TIMEZONE;
  const start = fromZonedTime(`${booking.date}T${booking.startTime}:00`, tz);
  let end = fromZonedTime(`${booking.date}T${booking.endTime}:00`, tz);
  // A lesson that runs past midnight ends on the next calendar day.
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** When the classroom door opens and closes. */
export function joinWindow(booking: Booking): { opensAt: Date; closesAt: Date } {
  const { start, end } = lessonBounds(booking);
  return {
    opensAt: new Date(start.getTime() - JOIN_WINDOW_BEFORE_MS),
    closesAt: new Date(end.getTime() + JOIN_WINDOW_AFTER_MS),
  };
}

export function callWindowState(booking: Booking, now: Date = new Date()): CallWindowState {
  const { opensAt, closesAt } = joinWindow(booking);
  if (now < opensAt) return 'early';
  if (now > closesAt) return 'over';
  return 'open';
}

/**
 * Can this lesson be joined at all? Cancelled and unpaid lessons have no
 * classroom — the rules refuse to open a room for them either.
 */
export function isCallableBooking(booking: Booking): boolean {
  return (
    booking.format === 'online' &&
    (booking.status === 'confirmed' || booking.status === 'completed')
  );
}

/** "02:14:07" until the door opens — for the waiting screen's countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
