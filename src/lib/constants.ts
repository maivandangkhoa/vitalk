import type { Language } from '@/types';

export const SUPPORTED_LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
];

export const DEFAULT_TIMEZONE = 'Asia/Seoul';

export const SLOT_GRANULARITY_MINUTES = 30;
export const ALLOWED_DURATIONS = [45, 60, 90, 120] as const;
export type AllowedDuration = (typeof ALLOWED_DURATIONS)[number];
export const DURATION_MULTIPLIERS: Record<AllowedDuration, number> = {
  45: 0.75,
  60: 1.0,
  90: 1.4,
  120: 1.75,
};
export const DEFAULT_HOURLY_RATE_USD = 14;

export const ONLINE_PLATFORMS = ['zoom', 'google_meet', 'teams'] as const;
