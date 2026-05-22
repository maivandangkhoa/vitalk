import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Loader2, Wand2, Globe, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { format, addMonths } from 'date-fns';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAvailability, useWeeklyTemplate, generateMonthSlots } from '@/hooks/useAvailability';
import { useTeacherSelector, TeacherSelector } from '@/components/admin/TeacherSelector';
import { AnimatedSection } from '@/components/shared/motion';
import AvailabilityGrid, { type AvailabilityColumn } from '@/components/availability/AvailabilityGrid';
import { SLOT_GRANULARITY_MINUTES } from '@/lib/constants';
import { addMinutes } from '@/lib/availability';
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
    if (bookedOnly ? s.isBooked : !s.isBooked) out.add(s.startTime);
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
      if (prev?.isBooked) return prev;
      return {
        startTime,
        endTime: addMinutes(startTime, SLOT_GRANULARITY_MINUTES),
        isBooked: false,
        bookingId: null,
      };
    });
}

export default function AdminAvailability() {
  const { t } = useTranslation('admin');
  const { teacherId, teachers, isAdmin, setTeacherId } = useTeacherSelector();
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now);
  const yearMonth = format(viewMonth, 'yyyy-MM');

  const { availability, loading, saveAvailability } = useAvailability(teacherId!, yearMonth);
  const { template: savedTemplate, loading: templateLoading, saveTemplate } = useWeeklyTemplate(teacherId!);
  const [saving, setSaving] = useState(false);
  const [templateInitialized, setTemplateInitialized] = useState(false);
  const [overrideInitialized, setOverrideInitialized] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [applyMonth, setApplyMonth] = useState<Date>(now);
  const [applying, setApplying] = useState(false);

  // Weekly template state — Record<dayName, Set<cellStartTime>>
  const [templateCells, setTemplateCells] = useState<Record<string, Set<string>>>({});

  // Override state per date — Record<dateStr, Set<cellStartTime>> (free cells only)
  const [overrideCells, setOverrideCells] = useState<Record<string, Set<string>>>({});

  // Dates the teacher has manually customized; preserved on save instead of
  // being regenerated from the template.
  const [customDates, setCustomDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!templateLoading && !templateInitialized) {
      setTemplateCells(templateToSets(savedTemplate));
      setTemplateInitialized(true);
    }
  }, [templateLoading, savedTemplate, templateInitialized]);

  useEffect(() => {
    if (!loading && !overrideInitialized) {
      const next: Record<string, Set<string>> = {};
      const slots = availability?.slots ?? {};
      for (const [date, daySlots] of Object.entries(slots)) {
        next[date] = slotsToCellSet(daySlots, false);
      }
      setOverrideCells(next);
      setCustomDates(new Set(availability?.customDates ?? []));
      setOverrideInitialized(true);
    }
  }, [loading, availability, overrideInitialized]);

  // Reset override init when month or teacher changes
  useEffect(() => {
    setOverrideInitialized(false);
    setOverrideCells({});
    setCustomDates(new Set());
  }, [yearMonth, teacherId]);

  // Reset template init when teacher changes (template is teacher-level, not month-level)
  useEffect(() => {
    setTemplateInitialized(false);
    setTemplateCells({});
  }, [teacherId]);

  const bookedByDate = useMemo(() => {
    const next: Record<string, Set<string>> = {};
    const slots = availability?.slots ?? {};
    for (const [date, daySlots] of Object.entries(slots)) {
      const bk = slotsToCellSet(daySlots, true);
      if (bk.size > 0) next[date] = bk;
    }
    return next;
  }, [availability]);

  const datesWithSlots = useMemo(() => {
    return Object.keys(overrideCells)
      .filter((d) => overrideCells[d].size > 0 || bookedByDate[d]?.size)
      .map((d) => new Date(d + 'T00:00:00'));
  }, [overrideCells, bookedByDate]);

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';

  /**
   * Save persists the current UI state: template doc + the viewMonth's
   * per-date doc with whatever customDates the user has edited. Non-custom
   * dates are left as whatever's already in Firestore (set there by an
   * earlier "Apply for month" run). Booked cells are always preserved.
   */
  const handleSave = async () => {
    setSaving(true);
    try {
      const tpl = setsToTemplate(templateCells);
      const slotsToSave: Record<string, TimeSlot[]> = {};
      const existing = availability?.slots ?? {};
      const dates = new Set<string>([...Object.keys(existing), ...customDates]);
      for (const date of dates) {
        const cells = customDates.has(date)
          ? (overrideCells[date] ?? new Set<string>())
          : new Set(
              (existing[date] ?? [])
                .filter((s) => !s.isBooked)
                .map((s) => s.startTime),
            );
        const booked = bookedByDate[date] ?? new Set<string>();
        const prev = existing[date] ?? [];
        const merged = cellSetToSlots(cells, booked, prev);
        if (merged.length > 0) slotsToSave[date] = merged;
      }

      const tz = getUserTimezone();
      await Promise.all([
        saveAvailability(slotsToSave, tz, Array.from(customDates)),
        saveTemplate(tpl),
      ]);
      toast.success(t('availability.saved'));
    } catch {
      toast.error(t('availability.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Apply the current template to every day of `applyMonth` and write the
   * per-date doc to Firestore right away. Resets that month's customDates
   * (this action is "blanket overwrite"); booked cells are still preserved.
   * The template doc is also saved so the UI and Firestore stay in sync.
   */
  const handleApplyForMonth = async () => {
    if (!teacherId) return;
    setApplying(true);
    try {
      const tpl = setsToTemplate(templateCells);
      const targetYM = format(applyMonth, 'yyyy-MM');
      const targetRef = doc(db, 'teachers', teacherId, 'availability', targetYM);

      // Read target month's existing data to preserve booked cells.
      const targetSnap = await getDoc(targetRef);
      const targetData = targetSnap.exists()
        ? (targetSnap.data() as MonthlyAvailability)
        : { slots: {} as Record<string, TimeSlot[]>, customDates: [], timezone: '' };
      const targetExisting = targetData.slots ?? {};
      const targetBooked: Record<string, Set<string>> = {};
      for (const [date, daySlots] of Object.entries(targetExisting)) {
        const bk = new Set(daySlots.filter((s) => s.isBooked).map((s) => s.startTime));
        if (bk.size > 0) targetBooked[date] = bk;
      }

      const generated = generateMonthSlots(applyMonth.getFullYear(), applyMonth.getMonth(), tpl);
      const slotsToSave: Record<string, TimeSlot[]> = {};
      const dates = new Set<string>([
        ...Object.keys(generated),
        ...Object.keys(targetBooked),
      ]);
      for (const date of dates) {
        const cells = new Set((generated[date] ?? []).map((s) => s.startTime));
        const booked = targetBooked[date] ?? new Set<string>();
        const prev = targetExisting[date] ?? [];
        const merged = cellSetToSlots(cells, booked, prev);
        if (merged.length > 0) slotsToSave[date] = merged;
      }

      const tz = getUserTimezone();
      await setDoc(targetRef, {
        slots: slotsToSave,
        customDates: [],
        timezone: tz,
        updatedAt: serverTimestamp(),
      });
      await saveTemplate(tpl);

      // If we just rewrote the viewMonth, sync local state so the UI matches.
      if (targetYM === yearMonth) {
        const nextOverride: Record<string, Set<string>> = {};
        for (const [date, slots] of Object.entries(slotsToSave)) {
          nextOverride[date] = new Set(slots.filter((s) => !s.isBooked).map((s) => s.startTime));
        }
        setOverrideCells(nextOverride);
        setCustomDates(new Set());
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
    // Replace this date's cells with the template-derived set so the user can
    // see what will be saved.
    const tpl = setsToTemplate(templateCells);
    const generated = generateMonthSlots(viewMonth.getFullYear(), viewMonth.getMonth(), tpl);
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

  const dateColumns: AvailabilityColumn[] = useMemo(() => {
    if (!selectedDateStr || !selectedDate) return [];
    return [
      {
        key: selectedDateStr,
        label: format(selectedDate, 'EEE'),
        sublabel: format(selectedDate, 'MMM d'),
      },
    ];
  }, [selectedDate, selectedDateStr]);

  const dateBooked = selectedDateStr && bookedByDate[selectedDateStr]
    ? { [selectedDateStr]: bookedByDate[selectedDateStr] }
    : undefined;

  if (!teacherId) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">{t('migration.noData', 'No teachers found.')}</p>
      </div>
    );
  }

  const userTz = getUserTimezone();
  const userTzLabel = getTimezoneLabel(userTz);
  const savedTz = availability?.timezone;
  const tzMismatch = !!savedTz && savedTz !== userTz;

  return (
    <div>
      <AnimatedSection className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t('availability.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {yearMonth} {loading && '(loading...)'}
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

      <Tabs defaultValue="weekly">
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
                  defaultValue:
                    'Click or drag to select 30-min cells you are available. This is the recurring template.',
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
          <div className="flex flex-col gap-6 md:flex-row">
            <div>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                month={viewMonth}
                onMonthChange={setViewMonth}
                modifiers={{ hasSlots: datesWithSlots }}
                modifiersClassNames={{ hasSlots: 'bg-indigo-50 text-indigo-600 font-semibold' }}
                className="rounded-xl border"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {t('availability.highlightedDates')}
              </p>
            </div>

            <Card className="flex-1">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">
                    {selectedDate
                      ? format(selectedDate, 'EEEE, MMM d, yyyy')
                      : t('availability.selectDate')}
                  </h3>
                  {selectedDateStr && customDates.has(selectedDateStr) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleResetDate(selectedDateStr)}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      {t('availability.resetToTemplate', 'Reset to template')}
                    </Button>
                  )}
                </div>
                {selectedDateStr && customDates.has(selectedDateStr) && (
                  <p className="mt-1 text-xs text-amber-600">
                    {t('availability.customMark', 'Customized — edits to the template will not affect this date.')}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {selectedDate ? (
                  <AvailabilityGrid
                    columns={dateColumns}
                    selected={overrideCells}
                    booked={dateBooked}
                    onChange={(next) => {
                      setOverrideCells(next);
                      if (selectedDateStr) {
                        setCustomDates((s) => {
                          if (s.has(selectedDateStr)) return s;
                          const updated = new Set(s);
                          updated.add(selectedDateStr);
                          return updated;
                        });
                      }
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t('availability.selectDateToManage')}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
