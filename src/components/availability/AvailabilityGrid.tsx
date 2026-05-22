import { useMemo, useRef, useState, useCallback } from 'react';
import { SLOT_GRANULARITY_MINUTES } from '@/lib/constants';
import { minutesToTime, timeToMinutes } from '@/lib/availability';

export interface AvailabilityColumn {
  /** Stable key (e.g., "Monday" or "2026-05-23") */
  key: string;
  /** Display label, 1-2 lines */
  label: string;
  sublabel?: string;
}

interface Props {
  columns: AvailabilityColumn[];
  /** Selected cells keyed by columnKey → set of "HH:mm" cell start times */
  selected: Record<string, Set<string>>;
  /** Read-only booked cells (rendered as hatched). Same shape as `selected`. */
  booked?: Record<string, Set<string>>;
  onChange: (next: Record<string, Set<string>>) => void;
  /** First row's time. Default "06:00". */
  startTime?: string;
  /** Last row's time (exclusive). Default "24:00". */
  endTime?: string;
}

const DEFAULT_START = '00:00';
const DEFAULT_END = '24:00';

function generateRowTimes(startTime: string, endTime: string): string[] {
  const out: string[] = [];
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime === '24:00' ? '00:00' : endTime) || 24 * 60;
  for (let m = start; m < end; m += SLOT_GRANULARITY_MINUTES) {
    out.push(minutesToTime(m));
  }
  return out;
}

export default function AvailabilityGrid({
  columns,
  selected,
  booked,
  onChange,
  startTime = DEFAULT_START,
  endTime = DEFAULT_END,
}: Props) {
  const rows = useMemo(() => generateRowTimes(startTime, endTime), [startTime, endTime]);
  const dragModeRef = useRef<'add' | 'remove' | null>(null);
  const visitedRef = useRef<Set<string>>(new Set());
  const [, force] = useState(0);

  const applyCell = useCallback(
    (col: string, time: string) => {
      if (booked?.[col]?.has(time)) return;
      const cellId = `${col}|${time}`;
      if (visitedRef.current.has(cellId)) return;
      visitedRef.current.add(cellId);

      const next = { ...selected };
      const set = new Set(next[col] ?? []);
      if (dragModeRef.current === 'add') set.add(time);
      else if (dragModeRef.current === 'remove') set.delete(time);
      next[col] = set;
      onChange(next);
      force((n) => n + 1);
    },
    [selected, onChange, booked],
  );

  const handleDown = (col: string, time: string) => {
    if (booked?.[col]?.has(time)) return;
    dragModeRef.current = selected[col]?.has(time) ? 'remove' : 'add';
    visitedRef.current = new Set();
    applyCell(col, time);
  };

  const handleEnter = (col: string, time: string) => {
    if (!dragModeRef.current) return;
    applyCell(col, time);
  };

  const handleUp = () => {
    dragModeRef.current = null;
    visitedRef.current = new Set();
  };

  return (
    <div
      className="select-none overflow-x-auto"
      onMouseUp={handleUp}
      onMouseLeave={handleUp}
    >
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-16 bg-white" />
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-2 py-2 text-center font-semibold text-zinc-700"
              >
                <div>{c.label}</div>
                {c.sublabel && (
                  <div className="text-[10px] font-normal text-zinc-400">{c.sublabel}</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((time) => (
            <tr key={time}>
              <td className="sticky left-0 z-10 bg-white px-2 py-1 text-right font-mono text-[11px] text-zinc-500">
                {time.endsWith(':00') ? time : ''}
              </td>
              {columns.map((c) => {
                const sel = !!selected[c.key]?.has(time);
                const bk = !!booked?.[c.key]?.has(time);
                return (
                  <td
                    key={c.key}
                    onMouseDown={() => handleDown(c.key, time)}
                    onMouseEnter={() => handleEnter(c.key, time)}
                    className={`h-7 cursor-pointer border border-zinc-200 transition-colors ${
                      bk
                        ? 'bg-zinc-200 bg-[repeating-linear-gradient(45deg,_transparent,_transparent_4px,_rgba(0,0,0,0.08)_4px,_rgba(0,0,0,0.08)_8px)] cursor-not-allowed'
                        : sel
                          ? 'bg-emerald-400 hover:bg-emerald-500'
                          : 'bg-white hover:bg-emerald-100'
                    }`}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
