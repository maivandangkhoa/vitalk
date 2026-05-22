import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Loader2, Wand2, Globe, RotateCcw, ChevronLeft, ChevronRight, CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import { format, addMonths, addDays, startOfWeek } from 'date-fns';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAvailability, useWeeklyTemplate, generateMonthSlots } from '@/hooks/useAvailability';
import { useTeacherSelector, TeacherSelector } from '@/components/admin/TeacherSelector';
import { AnimatedSection } from '@/components/shared/motion';
import AvailabilityGrid, { type AvailabilityColumn } from '@/components/availability/AvailabilityGrid';
import { getUserTimezone, getTimezoneLabel } from '@/lib/timezone';
import type { MonthlyAvailability, TimeSlot, WeeklyTemplate } from '@/types';

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function setsToTemplate(sets: Record<string, Set<string>>): WeeklyTemplate {
  const out: WeeklyTemplate = {};
  for (const [day, set] of Object.entries(sets)) {
    if (set.size > 0) out[day] = Array.from(set).sort();
  }
  return out;
}

function templateToSets(template: WeeklyTemplate | null): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  if (!template) return out;
  for (const [day, arr] of Object.entries(template)) {
    out[day] = new Set(arr);
  }
  return out;
}

function slotsToCellSet(slots: TimeSlot[] | undefined, bookedOnly: boolean): Set<string> {
  const out = new Set<string>();
  if (!slots) return out;
  for (const s of slots) {
    const booked = !!s.bookingId;
    if (bookedOnly ? booked : !booked) out.add(s.startTime);
  }
  return out;
}

function cellSetToSlots(cells: Set<string>, bookedCells: Set<string>, prevSlots: TimeSlot[]): TimeSlot[] {
  const prevByStart = new Map(prevSlots.map((s) => [s.startTime, s]));
  const all = new Set<string>([...cells, ...bookedCells]);
  return Array.from(all)
    .sort()
    .map((startTime) => {
      const prev = prevByStart.get(startTime);
      if (prev?.bookingId) return { startTime, bookingId: prev.bookingId };
      return { startTime, bookingId: null };
    });
}

export default function AdminAvailability() {
  const { t } = useTranslation('admin');
  const { teacherId, teachers, isAdmin, setTeacherId } = useTeacherSelector();
  const now = new Date();
  // The Calendar tab is a rolling 7-day window starting on Monday.
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(now, { weekStartsOn: 1 }));
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const primaryYM = format(weekStart, 'yyyy-MM');
  const endYM = format(weekEnd, 'yyyy-MM');
  const secondaryYM = endYM === primaryYM ? '' : endYM;

  const {
    availability: primaryAvail,
    loading: primaryLoading,
    saveAvailability: savePrimary,
  } = useAvailability(teacherId!, primaryYM);
  const {
    availability: secondaryAvail,
    loading: secondaryLoading,
    saveAvailability: saveSecondary,
  } = useAvailability(teacherId!, secondaryYM);
  const { template: savedTemplate, loading: templateLoading, saveTemplate } = useWeeklyTemplate(teacherId!);

  const loading = primaryLoading || (!!secondaryYM && secondaryLoading);

  const [saving, setSaving] = useState(false);
  const [templateInitialized, setTemplateInitialized] = useState(false);
  const [overrideInitialized, setOverrideInitialized] = useState(false);

  const [applyMonth, setApplyMonth] = useState<Date>(now);
  const [applying, setApplying] = useState(false);

  // Weekly template state — Record<dayName, Set<cellStartTime>>
  const [templateCells, setTemplateCells] = useState<Record<string, Set<string>>>({});

  // Override state per date — Record<dateStr, Set<cellStartTime>> (free cells only)
  const [overrideCells, setOverrideCells] = useState<Record<string, Set<string>>>({});

  // Dates the teacher has manually customized; preserved on save instead of
  // being regenerated from the template.
  const [customDates, setCustomDates] = useState<Set<string>>(new Set());

  // Merged slots from primary + secondary month docs.
  const combinedSlots = useMemo(() => {
    return {
      ...(primaryAvail?.slots ?? {}),
      ...(secondaryAvail?.slots ?? {}),
    };
  }, [primaryAvail, secondaryAvail]);

  useEffect(() => {
    if (!templateLoading && !templateInitialized) {
      setTemplateCells(templateToSets(savedTemplate));
      setTemplateInitialized(true);
    }
  }, [templateLoading, savedTemplate, templateInitialized]);

  useEffect(() => {
    if (!loading && !overrideInitialized) {
      const next: Record<string, Set<string>> = {};
      for (const [date, daySlots] of Object.entries(combinedSlots)) {
        next[date] = slotsToCellSet(daySlots, false);
      }
      setOverrideCells(next);
      setCustomDates(
        new Set([
          ...(primaryAvail?.customDates ?? []),
          ...(secondaryAvail?.customDates ?? []),
        ]),
      );
      setOverrideInitialized(true);
    }
  }, [loading, combinedSlots, primaryAvail, secondaryAvail, overrideInitialized]);

  // Reset overrides when the loaded months or teacher change.
  useEffect(() => {
    setOverrideInitialized(false);
    setOverrideCells({});
    setCustomDates(new Set());
  }, [primaryYM, secondaryYM, teacherId]);

  // Reset template init when teacher changes (template is teacher-level).
  useEffect(() => {
    setTemplateInitialized(false);
    setTemplateCells({});
  }, [teacherId]);

  const bookedByDate = useMemo(() => {
    const next: Record<string, Set<string>> = {};
    for (const [date, daySlots] of Object.entries(combinedSlots)) {
      const bk = slotsToCellSet(daySlots, true);
      if (bk.size > 0) next[date] = bk;
    }
    return next;
  }, [combinedSlots]);

  /**
   * Save persists the current UI state across however many months the visible
   * week (or any pre-existing data) spans. For each affected month: customDates
   * keep their UI cells; non-custom dates keep whatever was already in Firestore
   * (set by an earlier "Apply for month"). Booked cells are always preserved.
   */
  const handleSave = async () => {
    setSaving(true);
    try {
      const tpl = setsToTemplate(templateCells);
      const tz = getUserTimezone();

      // Group every relevant date by its YYYY-MM.
      const datesByMonth = new Map<string, Set<string>>();
      const collect = (date: string) => {
        const ym = date.slice(0, 7);
        if (!datesByMonth.has(ym)) datesByMonth.set(ym, new Set());
        datesByMonth.get(ym)!.add(date);
      };
      for (const d of customDates) collect(d);
      for (const d of Object.keys(overrideCells)) collect(d);
      for (const d of Object.keys(combinedSlots)) collect(d);

      const savesByMonth: Record<
        string,
        { slots: Record<string, TimeSlot[]>; custom: string[] }
      > = {};
      for (const [ym, dates] of datesByMonth) {
        const existingDoc = ym === primaryYM ? primaryAvail : ym === secondaryYM ? secondaryAvail : null;
        const existingSlots = existingDoc?.slots ?? {};
        const slotsToSave: Record<string, TimeSlot[]> = {};
        const customForMonth: string[] = [];

        for (const date of dates) {
          const isCustom = customDates.has(date);
          const cells = isCustom
            ? (overrideCells[date] ?? new Set<string>())
            : new Set(
                (existingSlots[date] ?? [])
                  .filter((s) => !s.bookingId)
                  .map((s) => s.startTime),
              );
          const booked = bookedByDate[date] ?? new Set<string>();
          const prev = existingSlots[date] ?? [];
          const merged = cellSetToSlots(cells, booked, prev);
          if (merged.length > 0) slotsToSave[date] = merged;
          if (isCustom) customForMonth.push(date);
        }

        savesByMonth[ym] = { slots: slotsToSave, custom: customForMonth };
      }

      const writes: Promise<void>[] = [];
      if (savesByMonth[primaryYM]) {
        writes.push(
          savePrimary(savesByMonth[primaryYM].slots, tz, savesByMonth[primaryYM].custom),
        );
      }
      if (secondaryYM && savesByMonth[secondaryYM]) {
        writes.push(
          saveSecondary(savesByMonth[secondaryYM].slots, tz, savesByMonth[secondaryYM].custom),
        );
      }
      // Any other months (rare — only if user has loaded ones somehow): fall
      // back to a direct setDoc.
      if (teacherId) {
        for (const [ym, payload] of Object.entries(savesByMonth)) {
          if (ym === primaryYM || ym === secondaryYM) continue;
          const ref = doc(db, 'teachers', teacherId, 'availability', ym);
          writes.push(
            setDoc(ref, {
              slots: payload.slots,
              customDates: payload.custom,
              timezone: tz,
              updatedAt: serverTimestamp(),
            }),
          );
        }
      }
      writes.push(saveTemplate(tpl));

      await Promise.all(writes);
      toast.success(t('availability.saved'));
    } catch {
      toast.error(t('availability.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Apply the current template to every day of `applyMonth` and write the
   * per-date doc to Firestore right away. Customized dates are preserved
   * (their existing cells stay; only non-custom dates get template-derived
   * cells). Booked cells are always preserved. The template doc is also
   * saved so UI and Firestore stay in sync.
   *
   * If applyMonth is currently loaded, in-UI customDates take precedence
   * over what's in Firestore (so unsaved customs aren't clobbered).
   */
  const handleApplyForMonth = async () => {
    if (!teacherId) return;
    setApplying(true);
    try {
      const tpl = setsToTemplate(templateCells);
      const targetYM = format(applyMonth, 'yyyy-MM');
      const targetRef = doc(db, 'teachers', teacherId, 'availability', targetYM);

      // Read target month's existing data so we can preserve customs + booked.
      const targetSnap = await getDoc(targetRef);
      const targetData = targetSnap.exists()
        ? (targetSnap.data() as MonthlyAvailability)
        : { slots: {} as Record<string, TimeSlot[]>, customDates: [], timezone: '' };
      const targetExisting = targetData.slots ?? {};
      const targetBooked: Record<string, Set<string>> = {};
      for (const [date, daySlots] of Object.entries(targetExisting)) {
        const bk = new Set(daySlots.filter((s) => !!s.bookingId).map((s) => s.startTime));
        if (bk.size > 0) targetBooked[date] = bk;
      }

      // Customs come from UI state if the target month is loaded, otherwise
      // from Firestore. Same for the "current free cells" per custom date.
      const isLoaded = targetYM === primaryYM || targetYM === secondaryYM;
      const customForMonth = new Set<string>(
        isLoaded
          ? Array.from(customDates).filter((d) => d.startsWith(targetYM))
          : (targetData.customDates ?? []),
      );
      const customCellsByDate = (date: string): Set<string> => {
        if (isLoaded && overrideCells[date]) return overrideCells[date];
        const prev = targetExisting[date] ?? [];
        return new Set(prev.filter((s) => !s.bookingId).map((s) => s.startTime));
      };

      const generated = generateMonthSlots(applyMonth.getFullYear(), applyMonth.getMonth(), tpl);
      const slotsToSave: Record<string, TimeSlot[]> = {};
      const dates = new Set<string>([
        ...Object.keys(generated),
        ...Object.keys(targetBooked),
        ...customForMonth,
      ]);
      for (const date of dates) {
        const cells = customForMonth.has(date)
          ? customCellsByDate(date)
          : new Set((generated[date] ?? []).map((s) => s.startTime));
        const booked = targetBooked[date] ?? new Set<string>();
        const prev = targetExisting[date] ?? [];
        const merged = cellSetToSlots(cells, booked, prev);
        if (merged.length > 0) slotsToSave[date] = merged;
      }

      const tz = getUserTimezone();
      await setDoc(targetRef, {
        slots: slotsToSave,
        customDates: Array.from(customForMonth),
        timezone: tz,
        updatedAt: serverTimestamp(),
      });
      await saveTemplate(tpl);

      // If the target month is loaded, sync local state with what was saved.
      if (isLoaded) {
        const nextOverride: Record<string, Set<string>> = { ...overrideCells };
        for (const date of Object.keys(nextOverride)) {
          if (date.startsWith(targetYM)) delete nextOverride[date];
        }
        for (const [date, slots] of Object.entries(slotsToSave)) {
          if (!date.startsWith(targetYM)) continue;
          nextOverride[date] = new Set(slots.filter((s) => !s.bookingId).map((s) => s.startTime));
        }
        setOverrideCells(nextOverride);
        // customForMonth already reflects what got saved; keep customDates
        // for the unaffected month + customForMonth for the target.
        const nextCustom = new Set(
          Array.from(customDates).filter((d) => !d.startsWith(targetYM)),
        );
        for (const d of customForMonth) nextCustom.add(d);
        setCustomDates(nextCustom);
      }
      toast.success(t('availability.appliedForMonth', { yearMonth: targetYM }));
    } catch {
      toast.error(t('availability.applyFailed'));
    } finally {
      setApplying(false);
    }
  };

  const handleResetDate = (dateStr: string) => {
    setCustomDates((s) => {
      const next = new Set(s);
      next.delete(dateStr);
      return next;
    });
    const tpl = setsToTemplate(templateCells);
    const [y, m] = dateStr.split('-').slice(0, 2).map(Number);
    const generated = generateMonthSlots(y, m - 1, tpl);
    setOverrideCells((prev) => {
      const next = { ...prev };
      next[dateStr] = new Set((generated[dateStr] ?? []).map((s) => s.startTime));
      return next;
    });
  };

  const weeklyColumns: AvailabilityColumn[] = useMemo(
    () => DAYS.map((day, idx) => ({ key: day, label: t(`availability.${DAY_KEYS[idx]}`) })),
    [t],
  );

  const weekColumns: AvailabilityColumn[] = useMemo(
    () =>
      weekDates.map((d) => {
        const key = format(d, 'yyyy-MM-dd');
        return {
          key,
          label: format(d, 'EEE').toUpperCase(),
          sublabel: format(d, 'd'),
        };
      }),
    [weekDates],
  );

  const weekCustomCount = useMemo(
    () => weekColumns.filter((c) => customDates.has(c.key)).length,
    [weekColumns, customDates],
  );

  /**
   * Handle changes coming from the week-view grid: detect which dates changed
   * (so we can mark them as custom) and update overrideCells + customDates.
   */
  const handleWeekChange = (next: Record<string, Set<string>>) => {
    const changed: string[] = [];
    const allKeys = new Set([...Object.keys(next), ...Object.keys(overrideCells)]);
    for (const key of allKeys) {
      const before = overrideCells[key] ?? new Set();
      const after = next[key] ?? new Set();
      if (before.size !== after.size || [...after].some((t) => !before.has(t))) {
        // Only mark dates that are part of the visible week (which is what the
        // grid edits in the first place).
        if (weekColumns.some((c) => c.key === key)) changed.push(key);
      }
    }
    setOverrideCells(next);
    if (changed.length > 0) {
      setCustomDates((s) => {
        const updated = new Set(s);
        for (const d of changed) updated.add(d);
        return updated;
      });
    }
  };

  if (!teacherId) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">{t('migration.noData', 'No teachers found.')}</p>
      </div>
    );
  }

  const userTz = getUserTimezone();
  const userTzLabel = getTimezoneLabel(userTz);
  const savedTz = primaryAvail?.timezone ?? secondaryAvail?.timezone;
  const tzMismatch = !!savedTz && savedTz !== userTz;

  return (
    <div>
      <AnimatedSection className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t('availability.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {format(weekStart, 'MMM d, yyyy')} – {format(weekEnd, 'MMM d, yyyy')}{' '}
              {loading && '(loading...)'}
            </p>
          </div>
          {isAdmin && (
            <TeacherSelector teacherId={teacherId} teachers={teachers} onChange={setTeacherId} />
          )}
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t('availability.saveChanges')}
        </Button>
      </AnimatedSection>

      <div
        className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
          tzMismatch
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-indigo-100 bg-indigo-50 text-indigo-800'
        }`}
      >
        <Globe className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p>
            {t('availability.tzNotice', {
              defaultValue: 'Times below are in your timezone: {{tz}} ({{label}}). Students see them converted to their own timezone.',
              tz: userTz,
              label: userTzLabel,
            })}
          </p>
          {tzMismatch && (
            <p className="mt-1 text-xs">
              {t('availability.tzMismatch', {
                defaultValue: 'Previously saved in {{savedTz}}. Saving now will store as {{userTz}} — make sure that matches where you actually teach.',
                savedTz,
                userTz,
              })}
            </p>
          )}
        </div>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="weekly">{t('availability.weeklyTemplate')}</TabsTrigger>
          <TabsTrigger value="calendar">{t('availability.calendarOverride')}</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly" className="mt-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button onClick={handleApplyForMonth} disabled={applying} variant="outline">
              {applying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              {t('availability.applyForMonth', { defaultValue: 'Apply for month' })}
            </Button>
            <select
              value={format(applyMonth, 'yyyy-MM')}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                setApplyMonth(new Date(y, m - 1, 1));
              }}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const d = addMonths(now, i);
                const ym = format(d, 'yyyy-MM');
                const label = format(d, 'MMM yyyy');
                return (
                  <option key={ym} value={ym}>
                    {label}
                  </option>
                );
              })}
            </select>
            <p className="ml-2 text-xs text-muted-foreground">
              {t('availability.applyHint', {
                defaultValue: 'Writes the template to every day of the selected month. Booked slots are preserved; per-date customizations for that month are reset.',
              })}
            </p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm text-muted-foreground">
                {t('availability.gridHint', {
                  defaultValue: 'Click or drag to select 30-min cells you are available. This is the recurring template.',
                })}
              </p>
              <AvailabilityGrid
                columns={weeklyColumns}
                selected={templateCells}
                onChange={setTemplateCells}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {/* Week navigation */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekStart(startOfWeek(now, { weekStartsOn: 1 }))}
                >
                  <CalendarCheck className="mr-1 h-3.5 w-3.5" />
                  {t('availability.today', { defaultValue: 'Today' })}
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setWeekStart((d) => addDays(d, -7))}
                  aria-label={t('availability.prevWeek', { defaultValue: 'Previous week' })}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-mono text-sm text-zinc-700">
                  {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setWeekStart((d) => addDays(d, 7))}
                  aria-label={t('availability.nextWeek', { defaultValue: 'Next week' })}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {weekCustomCount > 0 && (
                  <span className="ml-2 text-xs text-amber-600">
                    {t('availability.weekHasCustom', {
                      defaultValue: '{{count}} customized day(s) — they ignore template changes.',
                      count: weekCustomCount,
                    })}
                  </span>
                )}
              </div>

              {/* Quick reset row */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {t('availability.calendarHint', {
                    defaultValue: 'Click or drag cells to mark a date as a custom day (sick, holiday, …). Booked cells are read-only.',
                  })}
                </p>
                {weekColumns.map(
                  (c) =>
                    customDates.has(c.key) && (
                      <Button
                        key={c.key}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetDate(c.key)}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        {format(new Date(c.key + 'T00:00:00'), 'EEE d')}
                      </Button>
                    ),
                )}
              </div>

              <AvailabilityGrid
                columns={weekColumns}
                selected={overrideCells}
                booked={bookedByDate}
                onChange={handleWeekChange}
              />

              {/* Legend */}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded bg-emerald-400" />
                  {t('availability.legendAvailable', { defaultValue: 'Available' })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded bg-zinc-200 bg-[repeating-linear-gradient(45deg,_transparent,_transparent_2px,_rgba(0,0,0,0.18)_2px,_rgba(0,0,0,0.18)_4px)]" />
                  {t('availability.legendBooked', { defaultValue: 'Booked' })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded border border-zinc-300 bg-white" />
                  {t('availability.legendNotAvailable', { defaultValue: 'Not available' })}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
