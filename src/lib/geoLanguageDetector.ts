import type { Language } from '@/types';

const COUNTRY_TO_LANGUAGE: Record<string, Language> = {
  VN: 'vi',
  KR: 'ko',
  CN: 'zh',
  TW: 'zh',
  HK: 'zh',
  JP: 'ja',
};

const LANG_STORAGE_KEY = 'havitalk-lang';

interface GeoResponse {
  country_code?: string; // ipapi.co
  countryCode?: string;  // ip-api.com
}

async function fetchCountryCode(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch('https://ipapi.co/json/', { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error('fail');
    const data: GeoResponse = await res.json();
    return data.country_code || null;
  } catch {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch('https://ip-api.com/json/?fields=countryCode', { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) return null;
      const data: GeoResponse = await res.json();
      return data.countryCode || null;
    } catch {
      return null;
    }
  }
}

/**
 * Detect language from IP geolocation. Only runs on first visit (no localStorage).
 * Returns detected language or null if skipped/failed.
 */
export async function detectLanguageByIP(): Promise<Language | null> {
  if (localStorage.getItem(LANG_STORAGE_KEY)) return null;

  const countryCode = await fetchCountryCode();
  if (!countryCode) return null;

  return COUNTRY_TO_LANGUAGE[countryCode.toUpperCase()] || 'en';
}
