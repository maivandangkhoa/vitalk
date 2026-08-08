/**
 * Timezone choices for the teacher profile forms.
 *
 * A teacher's timezone is not cosmetic: every availability slot is stored in it
 * and converted from it before a student sees a time. A blank or mistyped zone
 * silently shifts every lesson, which is why these forms pick from a list
 * instead of accepting free text.
 */

export interface TimezoneOption {
  /** IANA identifier, e.g. `Asia/Seoul`. */
  value: string;
  /** City name for display, e.g. `Seoul`. */
  city: string;
  /** Current UTC offset, e.g. `GMT+09:00`. */
  offset: string;
}

/**
 * Zones the platform actually serves — Vietnamese teachers at home or in Korea
 * and Japan, plus the markets the app is translated for. Offered first so the
 * common case is one glance rather than a scroll through 400 entries.
 */
const COMMON_ZONES = [
  'Asia/Ho_Chi_Minh',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Manila',
  'Asia/Kuala_Lumpur',
  'Asia/Jakarta',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'UTC',
];

/** Current UTC offset for a zone, or '' if the runtime rejects the id. */
export function timezoneOffset(zone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** `Asia/Ho_Chi_Minh` → `Ho Chi Minh`. */
function cityOf(zone: string): string {
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/g, ' ');
}

function toOption(zone: string, at: Date): TimezoneOption {
  return { value: zone, city: cityOf(zone), offset: timezoneOffset(zone, at) };
}

/**
 * Canonical id for a zone. Aliases are common enough to matter here:
 * `Asia/Ho_Chi_Minh` and `Asia/Saigon` are the same place, and only one of the
 * pair appears in the runtime's own list, so without this the picker offers
 * Vietnam twice under two names.
 */
function canonical(zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions()
      .timeZone;
  } catch {
    return zone;
  }
}

/** Every IANA zone the runtime knows, or [] on older engines. */
function supportedZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    return fn ? fn('timeZone') : [];
  } catch {
    return [];
  }
}

/**
 * Two groups: the zones above, then everything else the browser supports,
 * sorted by offset so neighbours sit together.
 *
 * `current` is included even when it is not a known zone, so opening a profile
 * that holds a legacy or hand-typed value never silently drops it.
 */
export function timezoneGroups(current?: string): {
  common: TimezoneOption[];
  others: TimezoneOption[];
} {
  const at = new Date();
  const common = COMMON_ZONES.map((z) => toOption(z, at));

  const seen = new Set(COMMON_ZONES.map(canonical));
  const others = supportedZones()
    .filter((z) => !seen.has(canonical(z)))
    .map((z) => toOption(z, at))
    .sort((a, b) => a.offset.localeCompare(b.offset) || a.city.localeCompare(b.city));

  if (
    current &&
    !seen.has(canonical(current)) &&
    !others.some((o) => o.value === current)
  ) {
    others.unshift(toOption(current, at));
  }

  return { common, others };
}
