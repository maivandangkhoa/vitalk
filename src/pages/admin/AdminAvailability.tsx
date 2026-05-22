import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAvailability, useWeeklyTemplate, generateMonthSlots } from '@/hooks/useAvailability';
import { useTeacherSelector, TeacherSelector } from '@/components/admin/TeacherSelector';
import { AnimatedSection } from '@/components/shared/motion';
import AvailabilityGrid, { type AvailabilityColumn } from '@/components/availability/AvailabilityGrid';
import { SLOT_GRANULARITY_MINUTES } from '@/lib/constants';
import { addMinutes } from '@/lib/availability';
import type { TimeSlot, WeeklyTemplate } from '@/types';

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

  // Weekly template state — Record<dayName, Set<cellStartTime>>
  const [templateCells, setTemplateCells] = useState<Record<string, Set<string>>>({});

  // Override state per date — Record<dateStr, Set<cellStartTime>> (free cells only)
  const [overrideCells, setOverrideCells] = useState<Record<string, Set<string>>>({});

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
      setOverrideInitialized(true);
    }
  }, [loading, availability, overrideInitialized]);

  // Reset override init when month or teacher changes
  useEffect(() => {
    setOverrideInitialized(false);
    setOverrideCells({});
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

  const handleGenerateFromTemplate = () => {
    const tpl = setsToTemplate(templateCells);
    const generated = generateMonthSlots(viewMonth.getFullYear(), viewMonth.getMonth(), tpl);
    const next: Record<string, Set<string>> = { ...overrideCells };
    for (const [date, daySlots] of Object.entries(generated)) {
      const cells = new Set(daySlots.map((s) => s.startTime));
      // preserve any existing booked cells (they live in bookedByDate, not selection)
      next[date] = cells;
    }
    setOverrideCells(next);
    toast.success(t('availability.generatedSlots', { yearMonth }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const tpl = setsToTemplate(templateCells);

      // Template is the source of truth: always regenerate the current month's
      // per-date docs from the template. Booked cells are preserved. The
      // Calendar Override tab is read-only for now.
      const generated = generateMonthSlots(viewMonth.getFullYear(), viewMonth.getMonth(), tpl);

      const slotsToSave: Record<string, TimeSlot[]> = {};
      const existing = availability?.slots ?? {};
      const dates = new Set<string>([...Object.keys(generated), ...Object.keys(existing)]);
      for (const date of dates) {
        const generatedCells = new Set((generated[date] ?? []).map((s) => s.startTime));
        const booked = bookedByDate[date] ?? new Set<string>();
        const prev = existing[date] ?? [];
        const merged = cellSetToSlots(generatedCells, booked, prev);
        if (merged.length > 0) slotsToSave[date] = merged;
      }

      await Promise.all([saveAvailability(slotsToSave), saveTemplate(tpl)]);
      // Sync the override UI state with what was just saved.
      const nextOverride: Record<string, Set<string>> = {};
      for (const [date, slots] of Object.entries(slotsToSave)) {
        nextOverride[date] = new Set(slots.filter((s) => !s.isBooked).map((s) => s.startTime));
      }
      setOverrideCells(nextOverride);
      toast.success(t('availability.saved'));
    } catch {
      toast.error(t('availability.saveFailed'));
    } finally {
      setSaving(false);
    }
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

      <Tabs defaultValue="weekly">
        <TabsList>
          <TabsTrigger value="weekly">{t('availability.weeklyTemplate')}</TabsTrigger>
          <TabsTrigger value="calendar">{t('availability.calendarOverride')}</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly" className="mt-4">
          <div className="mb-4">
            <Button onClick={handleGenerateFromTemplate} variant="outline">
              <Wand2 className="mr-2 h-4 w-4" />
              {t('availability.generateSlots')} ({yearMonth})
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm text-muted-foreground">
                {t('availability.gridHint', 'Click hoặc kéo để chọn các khung 30 phút khả dụng. Sau đó bấm "Generate Slots" để áp template lên tháng đang xem.')}
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
                <h3 className="font-medium">
                  {selectedDate
                    ? format(selectedDate, 'EEEE, MMM d, yyyy')
                    : t('availability.selectDate')}
                </h3>
              </CardHeader>
              <CardContent>
                {selectedDate ? (
                  <AvailabilityGrid
                    columns={dateColumns}
                    selected={overrideCells}
                    booked={dateBooked}
                    onChange={setOverrideCells}
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
