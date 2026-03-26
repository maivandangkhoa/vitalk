import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Save, Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAvailability, useWeeklyTemplate, generateMonthSlots } from '@/hooks/useAvailability';
import { AnimatedSection } from '@/components/shared/motion';
import type { TimeSlot } from '@/types';

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface TimeRange {
  from: string;
  to: string;
}

export default function AdminAvailability() {
  const { t } = useTranslation('admin');
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now);
  const yearMonth = format(viewMonth, 'yyyy-MM');

  const { availability, loading, saveAvailability } = useAvailability(yearMonth);
  const { template: savedTemplate, loading: templateLoading, saveTemplate } = useWeeklyTemplate();
  const [saving, setSaving] = useState(false);
  const [templateInitialized, setTemplateInitialized] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [weeklySlots, setWeeklySlots] = useState<Record<string, TimeRange[]>>({});

  // Initialize weeklySlots from Firestore template once loaded
  useEffect(() => {
    if (!templateLoading && !templateInitialized) {
      if (savedTemplate && Object.keys(savedTemplate).length > 0) {
        setWeeklySlots(savedTemplate);
      }
      setTemplateInitialized(true);
    }
  }, [templateLoading, savedTemplate, templateInitialized]);

  // Editable override slots for the currently loaded month
  const [overrideSlots, setOverrideSlots] = useState<Record<string, TimeSlot[]>>({});

  // Merge Firestore data into override when availability loads
  const currentSlots = useMemo(() => {
    if (Object.keys(overrideSlots).length > 0) return overrideSlots;
    return availability?.slots || {};
  }, [availability, overrideSlots]);

  // Dates that have slots
  const datesWithSlots = useMemo(() => {
    return Object.keys(currentSlots).map((d) => new Date(d + 'T00:00:00'));
  }, [currentSlots]);

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
  const selectedDaySlots = selectedDateStr ? (currentSlots[selectedDateStr] || []) : [];

  const addSlot = (day: string) => {
    setWeeklySlots((prev) => {
      const existing = prev[day] || [];
      // Find the next available time that doesn't overlap
      let fromMinutes = 9 * 60; // default 09:00
      if (existing.length > 0) {
        const lastSlot = existing[existing.length - 1];
        const [h, m] = lastSlot.to.split(':').map(Number);
        fromMinutes = h * 60 + m;
      }
      if (fromMinutes >= 23 * 60) fromMinutes = 9 * 60; // wrap if too late
      const toMinutes = fromMinutes + 60;
      const from = `${String(Math.floor(fromMinutes / 60)).padStart(2, '0')}:${String(fromMinutes % 60).padStart(2, '0')}`;
      const to = `${String(Math.floor(toMinutes / 60)).padStart(2, '0')}:${String(toMinutes % 60).padStart(2, '0')}`;
      return { ...prev, [day]: [...existing, { from, to }] };
    });
  };

  const removeSlot = (day: string, index: number) => {
    setWeeklySlots((prev) => ({
      ...prev,
      [day]: (prev[day] || []).filter((_, i) => i !== index),
    }));
  };

  const updateSlot = (day: string, index: number, field: 'from' | 'to', value: string) => {
    setWeeklySlots((prev) => ({
      ...prev,
      [day]: (prev[day] || []).map((slot, i) =>
        i === index ? { ...slot, [field]: value } : slot
      ),
    }));
  };

  const handleGenerateSlots = () => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const generated = generateMonthSlots(year, month, weeklySlots);

    // Preserve already-booked slots from Firestore
    const existingSlots = availability?.slots || {};
    for (const [date, daySlots] of Object.entries(existingSlots)) {
      const bookedSlots = daySlots.filter((s) => s.isBooked);
      if (bookedSlots.length > 0 && generated[date]) {
        // Remove slots that conflict with booked ones, then add booked back
        generated[date] = generated[date].filter(
          (g) => !bookedSlots.some((b) => b.startTime === g.startTime)
        );
        generated[date].push(...bookedSlots);
        generated[date].sort((a, b) => a.startTime.localeCompare(b.startTime));
      }
    }

    setOverrideSlots(generated);
    toast.success(t('availability.generatedSlots', { yearMonth }));
  };

  const handleSave = async () => {
    // Auto-generate slots if template has data but no override slots yet
    let slotsToSave = Object.keys(overrideSlots).length > 0 ? overrideSlots : currentSlots;
    const hasTemplate = Object.values(weeklySlots).some((ranges) => ranges.length > 0);
    if (Object.keys(slotsToSave).length === 0 && hasTemplate) {
      const year = viewMonth.getFullYear();
      const month = viewMonth.getMonth();
      slotsToSave = generateMonthSlots(year, month, weeklySlots);
    }
    if (Object.keys(slotsToSave).length === 0) {
      toast.error(t('availability.noSlotsToSave'));
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        saveAvailability(slotsToSave),
        saveTemplate(weeklySlots),
      ]);
      setOverrideSlots({});
      toast.success(t('availability.saved'));
    } catch {
      toast.error(t('availability.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const removeOverrideSlot = (dateStr: string, index: number) => {
    setOverrideSlots((prev) => {
      const updated = { ...prev };
      const daySlots = [...(updated[dateStr] || currentSlots[dateStr] || [])];
      daySlots.splice(index, 1);
      if (daySlots.length === 0) {
        delete updated[dateStr];
      } else {
        updated[dateStr] = daySlots;
      }
      return updated;
    });
  };

  const addOverrideSlot = (dateStr: string) => {
    setOverrideSlots((prev) => {
      const updated = { ...prev };
      const daySlots = [...(updated[dateStr] || currentSlots[dateStr] || [])];
      daySlots.push({
        startTime: '09:00',
        endTime: '09:50',
        isBooked: false,
        bookingId: null,
      });
      updated[dateStr] = daySlots;
      return updated;
    });
  };

  return (
    <div>
      <AnimatedSection className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('availability.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {yearMonth} {loading && '(loading...)'}
          </p>
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
            <Button onClick={handleGenerateSlots} variant="outline">
              <Wand2 className="mr-2 h-4 w-4" />
              {t('availability.generateSlots')} ({yearMonth})
            </Button>
          </div>

          <div className="space-y-4">
            {DAYS.map((day, idx) => (
              <Card key={day}>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{t(`availability.${DAY_KEYS[idx]}`)}</h3>
                    <Button variant="outline" size="sm" onClick={() => addSlot(day)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t('availability.addSlot')}
                    </Button>
                  </div>
                </CardHeader>
                {(weeklySlots[day] || []).length > 0 && (
                  <CardContent className="space-y-2 pt-0">
                    {(weeklySlots[day] || []).map((slot, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={slot.from}
                          onChange={(e) => updateSlot(day, i, 'from', e.target.value)}
                          className="rounded-xl border border-input bg-background px-2 py-1 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <span className="text-sm text-muted-foreground">-</span>
                        <input
                          type="time"
                          value={slot.to}
                          onChange={(e) => updateSlot(day, i, 'to', e.target.value)}
                          className="rounded-xl border border-input bg-background px-2 py-1 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <Button variant="ghost" size="icon-sm" onClick={() => removeSlot(day, i)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
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
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">
                    {selectedDate
                      ? format(selectedDate, 'EEEE, MMM d, yyyy')
                      : t('availability.selectDate')}
                  </h3>
                  {selectedDateStr && (
                    <Button variant="outline" size="sm" onClick={() => addOverrideSlot(selectedDateStr)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t('availability.addSlot')}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {selectedDaySlots.length > 0 ? (
                  <div className="space-y-2">
                    {selectedDaySlots.map((slot, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2 transition-all duration-200 hover:bg-zinc-50">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {slot.startTime} - {slot.endTime}
                          </span>
                          {slot.isBooked && (
                            <Badge variant="secondary" className="text-xs">{t('availability.booked')}</Badge>
                          )}
                        </div>
                        {!slot.isBooked && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeOverrideSlot(selectedDateStr, i)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {selectedDate ? t('availability.noSlotsForDate') : t('availability.selectDateToManage')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
