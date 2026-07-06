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

function langInfo(code: string): { name: string; flag: string } {
  return LANG_INFO[normalizeLangKey(code)] ?? { name: code, flag: '' };
}

function levelToNumber(level: string): number | null {
  const m = level.match(/level[_\s]?(\d)/i);
  if (m) return Number(m[1]);
  return null;
}

const MAX_BARS = 5;

function ProficiencyBars({ filled, size = 'md' }: { filled: number; size?: 'sm' | 'md' }) {
  const barHeight = size === 'sm' ? 'h-2.5' : 'h-3';
  const barWidth = size === 'sm' ? 'w-1' : 'w-[5px]';
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: MAX_BARS }).map((_, i) => (
        <div
          key={i}
          className={`${barHeight} ${barWidth} rounded-sm ${i < filled ? 'bg-emerald-400' : 'bg-zinc-200'}`}
        />
      ))}
    </div>
  );
}

interface Props {
  languages: Record<string, string>;
  size?: 'sm' | 'md';
}

export function TeacherLanguages({ languages, size = 'md' }: Props) {
  const entries = Object.entries(languages);
  if (entries.length === 0) return null;

  const teaches = entries
    .filter(([, lvl]) => lvl === 'community' || lvl.toLowerCase() === 'native')
    .sort(([a], [b]) => langInfo(a).name.localeCompare(langInfo(b).name));
  const speaks = entries
    .filter(([, lvl]) => lvl !== 'community' && lvl.toLowerCase() !== 'native')
    .sort(([aCode, aLvl], [bCode, bLvl]) => {
      const byLevel = (levelToNumber(bLvl) ?? 3) - (levelToNumber(aLvl) ?? 3);
      if (byLevel !== 0) return byLevel;
      return langInfo(aCode).name.localeCompare(langInfo(bCode).name);
    });

  const labelClass = size === 'sm'
    ? 'w-16 shrink-0 text-xs font-medium text-muted-foreground'
    : 'w-20 shrink-0 text-sm font-medium text-muted-foreground';
  const nameClass = size === 'sm' ? 'text-sm font-semibold' : 'text-base font-semibold';
  const flagClass = size === 'sm' ? 'text-base' : 'text-lg';
  const nativeBadgeClass = size === 'sm'
    ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600'
    : 'rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-medium text-emerald-600';

  return (
    <div className="space-y-3">
      {teaches.length > 0 && (
        <div className="flex items-center gap-3">
          <span className={labelClass}>Teaches</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {teaches.map(([code]) => {
              const info = langInfo(code);
              return (
                <div key={code} className="flex items-center gap-2">
                  {info.flag && <span className={flagClass}>{info.flag}</span>}
                  <span className={nameClass}>{info.name}</span>
                  <span className={nativeBadgeClass}>Native</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {speaks.length > 0 && (
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 ${labelClass}`}>Speaks</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {speaks.map(([code, lvl]) => {
              const level = levelToNumber(lvl) ?? 3;
              const info = langInfo(code);
              return (
                <div key={code} className="flex items-center gap-2">
                  {info.flag && <span className={flagClass}>{info.flag}</span>}
                  <span className={nameClass}>{info.name}</span>
                  <ProficiencyBars filled={level} size={size} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
