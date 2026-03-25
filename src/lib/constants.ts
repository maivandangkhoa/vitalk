import type { Language } from '@/types';

export const SUPPORTED_LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
];

export const TEACHER_TIMEZONE = 'Asia/Seoul';

export const LESSON_DURATION_MINUTES = 50;
export const BREAK_DURATION_MINUTES = 10;

export const ONLINE_PLATFORMS = ['zoom', 'google_meet', 'teams'] as const;
