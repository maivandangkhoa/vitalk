/**
 * Language metadata shared by the teacher language display and the admin editor.
 *
 * Lives in lib/ rather than beside TeacherLanguages.tsx so that component file
 * exports only components, which is what Fast Refresh needs.
 */
export const LANG_INFO: Record<string, { name: string; flag: string }> = {
  vietnamese: { name: 'Vietnamese', flag: '🇻🇳' },
  english:    { name: 'English',    flag: '🇬🇧' },
  korean:     { name: 'Korean',     flag: '🇰🇷' },
  french:     { name: 'French',     flag: '🇫🇷' },
  japanese:   { name: 'Japanese',   flag: '🇯🇵' },
  chinese:    { name: 'Chinese',    flag: '🇨🇳' },
  spanish:    { name: 'Spanish',    flag: '🇪🇸' },
  german:     { name: 'German',     flag: '🇩🇪' },
  thai:       { name: 'Thai',       flag: '🇹🇭' },
  portuguese: { name: 'Portuguese', flag: '🇵🇹' },
  russian:    { name: 'Russian',    flag: '🇷🇺' },
  italian:    { name: 'Italian',    flag: '🇮🇹' },
};

const SHORT_CODE_MAP: Record<string, string> = {
  vi: 'vietnamese', en: 'english', ko: 'korean', fr: 'french',
  ja: 'japanese', zh: 'chinese', es: 'spanish', de: 'german', th: 'thai',
  pt: 'portuguese', ru: 'russian', it: 'italian',
};

/** Canonical key for a raw language code (strips `lang_` prefix, maps short codes). */
export function normalizeLangKey(code: string): string {
  const lower = code.toLowerCase().replace(/^lang_/, '');
  return SHORT_CODE_MAP[lower] ?? lower;
}

/** Display name and flag for a raw language code, falling back to the code itself. */
export function langInfo(code: string): { name: string; flag: string } {
  return LANG_INFO[normalizeLangKey(code)] ?? { name: code, flag: '' };
}
