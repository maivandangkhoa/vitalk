import { useMemo, useState } from 'react';
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
  /** First row's time. Default "00:00". */
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

interface CellPos {
  col: string;
  time: string;
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

  const colIndex = useMemo(() => {
    const m = new Map<string, number>();
    columns.forEach((c, i) => m.set(c.key, i));
    return m;
  }, [columns]);

  const rowIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((t, i) => m.set(t, i));
    return m;
  }, [rows]);

  const [dragAnchor, setDragAnchor] = useState<CellPos | null>(null);
  const [dragCurrent, setDragCurrent] = useState<CellPos | null>(null);
  const [dragMode, setDragMode] = useState<'add' | 'remove' | null>(null);

  const dragRect = useMemo(() => {
    if (!dragAnchor || !dragCurrent) return null;
    const c1 = colIndex.get(dragAnchor.col);
    const c2 = colIndex.get(dragCurrent.col);
    const r1 = rowIndex.get(dragAnchor.time);
    const r2 = rowIndex.get(dragCurrent.time);
    if (c1 == null || c2 == null || r1 == null || r2 == null) return null;
    return {
      minCol: Math.min(c1, c2),
      maxCol: Math.max(c1, c2),
      minRow: Math.min(r1, r2),
      maxRow: Math.max(r1, r2),
    };
  }, [dragAnchor, dragCurrent, colIndex, rowIndex]);

  const handleDown = (col: string, time: string) => {
    if (booked?.[col]?.has(time)) return;
    setDragAnchor({ col, time });
    setDragCurrent({ col, time });
    setDragMode(selected[col]?.has(time) ? 'remove' : 'add');
  };

  const handleEnter = (col: string, time: string) => {
    if (!dragAnchor) return;
    setDragCurrent({ col, time });
  };

  const commitDrag = () => {
    if (!dragRect || !dragMode) {
      setDragAnchor(null);
      setDragCurrent(null);
      setDragMode(null);
      return;
    }
    const next = { ...selected };
    for (let ci = dragRect.minCol; ci <= dragRect.maxCol; ci++) {
      const colKey = columns[ci].key;
      const set = new Set(next[colKey] ?? []);
      for (let ri = dragRect.minRow; ri <= dragRect.maxRow; ri++) {
        const time = rows[ri];
        if (booked?.[colKey]?.has(time)) continue;
        if (dragMode === 'add') set.add(time);
        else set.delete(time);
      }
      next[colKey] = set;
    }
    onChange(next);
    setDragAnchor(null);
    setDragCurrent(null);
    setDragMode(null);
  };

  const isInDragRect = (col: string, time: string): boolean => {
    if (!dragRect) return false;
    const ci = colIndex.get(col);
    const ri = rowIndex.get(time);
    if (ci == null || ri == null) return false;
    return (
      ci >= dragRect.minCol &&
      ci <= dragRect.maxCol &&
      ri >= dragRect.minRow &&
      ri <= dragRect.maxRow
    );
  };

  return (
    <div
      className="select-none overflow-x-auto"
      onMouseUp={commitDrag}
      onMouseLeave={commitDrag}
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
                const inPreview = isInDragRect(c.key, time);
                // Effective state during drag: preview overrides actual selection
                const effective = inPreview && dragMode ? dragMode === 'add' : sel;
                return (
                  <td
                    key={c.key}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleDown(c.key, time);
                    }}
                    onMouseEnter={() => handleEnter(c.key, time)}
                    className={`h-7 cursor-pointer border border-zinc-200 transition-colors ${
                      bk
                        ? 'bg-zinc-200 bg-[repeating-linear-gradient(45deg,_transparent,_transparent_4px,_rgba(0,0,0,0.08)_4px,_rgba(0,0,0,0.08)_8px)] cursor-not-allowed'
                        : inPreview
                          ? effective
                            ? 'bg-emerald-300 ring-1 ring-emerald-500'
                            : 'bg-white ring-1 ring-emerald-500/40'
                          : effective
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
