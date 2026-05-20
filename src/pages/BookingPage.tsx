import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Link } from 'react-router-dom';
import {
  Check,
  Clock,
  Monitor,
  MapPin,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle,
  ExternalLink,
  Star,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';
import { useTeachers } from '@/hooks/useTeachers';
import { useAllTeachersAvailableSlots } from '@/hooks/useAllTeachersAvailability';
import type { AggregatedSlot, AggregatedSlots, AggregatedTeacher } from '@/hooks/useAllTeachersAvailability';
import { useCreateBooking } from '@/hooks/useBookings';
import { useLessonTypes } from '@/hooks/useLessonTypes';
import { useAuthStore } from '@/stores/authStore';
import { useUserTimezone } from '@/hooks/useTimezone';
import { useCurrencySettings } from '@/hooks/useCurrency';
import { getLessonPrice } from '@/lib/currency';
import { AnimatedSection } from '@/components/shared/motion';
import { useLocations } from '@/hooks/useLocations';
import type { OnlinePlatform, PaymentMethod, Language } from '@/types';
import { toast } from 'sonner';

const PaypalCheckout = lazy(() => import('@/components/booking/PaypalCheckout'));
const TossCheckout = lazy(() => import('@/components/booking/TossCheckout'));
const BankTransferInfo = lazy(() => import('@/components/booking/BankTransferInfo'));
const TossRedirectHandler = lazy(() => import('@/components/booking/TossRedirectHandler'));

const STEPS = ['lessonType', 'dateTime', 'details', 'payment'] as const;
type Step = (typeof STEPS)[number];

const BOOKING_DRAFT_KEY = 'booking-draft';

const LEVEL_COLORS: Record<string, string> = {
  beginner: 'bg-emerald-50 text-emerald-600',
  intermediate: 'bg-sky-50 text-sky-600',
  conversation: 'bg-purple-50 text-purple-600',
};

const PLATFORM_MAP: Record<string, OnlinePlatform> = {
  zoom: 'zoom',
  googleMeet: 'google_meet',
  teams: 'teams',
};

export default function BookingPage() {
  const { t, i18n } = useTranslation('booking');
  const { t: tc } = useTranslation('common');
  const lang = i18n.language as Language;
  const { formatLesson, currency, config } = useCurrencySettings();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();

  const { teachers, loading: teachersLoading } = useTeachers();
  const { lessonTypes, loading: lessonTypesLoading } = useLessonTypes();

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [selectedLesson, setSelectedLesson] = useState<string>('');
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [lessonFormat, setLessonFormat] = useState<'online' | 'offline'>('online');
  const [platform, setPlatform] = useState('zoom');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [customLocationAddress, setCustomLocationAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [bookingComplete, setBookingComplete] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string>('');
  const [showPaymentUI, setShowPaymentUI] = useState(false);

  const yearMonth = format(viewMonth, 'yyyy-MM');
  const { slots: aggregatedSlotsRaw, loading: slotsLoading } = useAllTeachersAvailableSlots(teachers, yearMonth);
  const { createBooking, loading: bookingLoading } = useCreateBooking();
  const { locations: offlineLocations } = useLocations();

  // Locked teacher mode: when ?teacherId= is present, restrict the flow to
  // that one teacher (hide picker, filter availability to their slots only).
  const lockedTeacherId = searchParams.get('teacherId') || '';
  const isTeacherLocked = !!lockedTeacherId && teachers.some((t) => t.id === lockedTeacherId);

  // Filter aggregated slots down to just the locked teacher when applicable.
  const aggregatedSlots: AggregatedSlots = useMemo(() => {
    if (!isTeacherLocked) return aggregatedSlotsRaw;
    const result: AggregatedSlots = {};
    for (const [date, daySlots] of Object.entries(aggregatedSlotsRaw)) {
      const filtered = daySlots
        .map((slot) => ({ ...slot, teachers: slot.teachers.filter((t) => t.id === lockedTeacherId) }))
        .filter((slot) => slot.teachers.length > 0);
      if (filtered.length > 0) result[date] = filtered;
    }
    return result;
  }, [aggregatedSlotsRaw, isTeacherLocked, lockedTeacherId]);

  // Selected teacher object
  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === selectedTeacherId) ?? null,
    [teachers, selectedTeacherId],
  );

  const { userTzLabel } = useUserTimezone(selectedTeacher?.timezone);

  const step: Step = STEPS[currentStep];
  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
  const daySlots: AggregatedSlot[] = selectedDateStr ? (aggregatedSlots[selectedDateStr] || []) : [];

  // Find the selected aggregated slot
  const selectedSlot = useMemo(
    () => daySlots.find((s) => s.startTime === selectedTime),
    [daySlots, selectedTime],
  );

  // Available teachers for the selected time slot
  const availableTeachersForSlot = useMemo(
    () => selectedSlot?.teachers ?? [],
    [selectedSlot],
  );

  // Find the selected teacher's slot info (for booking creation with original times)
  const selectedTeacherSlotInfo = useMemo(
    () => availableTeachersForSlot.find((t) => t.id === selectedTeacherId),
    [availableTeachersForSlot, selectedTeacherId],
  );

  // Dates that have any available slots
  const datesWithSlots = useMemo(() => {
    return Object.keys(aggregatedSlots)
      .filter((d) => {
        const date = new Date(d + 'T00:00:00');
        return date >= new Date(new Date().toDateString());
      })
      .map((d) => new Date(d + 'T00:00:00'));
  }, [aggregatedSlots]);

  const selectedLessonData = lessonTypes.find((o) => o.id === selectedLesson);

  // Auto-select a random teacher when time slot changes
  useEffect(() => {
    if (availableTeachersForSlot.length > 0 && !availableTeachersForSlot.some((t) => t.id === selectedTeacherId)) {
      const randomIndex = Math.floor(Math.random() * availableTeachersForSlot.length);
      setSelectedTeacherId(availableTeachersForSlot[randomIndex].id);
    }
  }, [availableTeachersForSlot, selectedTeacherId]);

  // Pre-fill the locked teacher on mount so the "Booking with" banner shows
  // immediately, before any time slot is picked.
  useEffect(() => {
    if (isTeacherLocked && selectedTeacherId !== lockedTeacherId) {
      setSelectedTeacherId(lockedTeacherId);
    }
  }, [isTeacherLocked, lockedTeacherId, selectedTeacherId]);

  // Restore a booking draft saved before the user was bounced to /login,
  // then clear it so a fresh visit starts clean.
  useEffect(() => {
    const raw = sessionStorage.getItem(BOOKING_DRAFT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(BOOKING_DRAFT_KEY);
    try {
      const draft = JSON.parse(raw);
      if (draft.selectedLesson) setSelectedLesson(draft.selectedLesson);
      if (draft.selectedDate) {
        const d = new Date(draft.selectedDate);
        setSelectedDate(d);
        setViewMonth(d);
      }
      if (draft.selectedTime) setSelectedTime(draft.selectedTime);
      if (draft.selectedTeacherId) setSelectedTeacherId(draft.selectedTeacherId);
      if (draft.lessonFormat) setLessonFormat(draft.lessonFormat);
      if (draft.platform) setPlatform(draft.platform);
      if (draft.selectedLocationId) setSelectedLocationId(draft.selectedLocationId);
      if (draft.customLocationAddress) setCustomLocationAddress(draft.customLocationAddress);
      if (draft.notes) setNotes(draft.notes);
      if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
      if (typeof draft.currentStep === 'number') setCurrentStep(draft.currentStep);
    } catch {
      // ignore corrupted draft
    }
  }, []);

  // Handle Toss payment redirect
  const tossRedirect = searchParams.get('toss');
  if (tossRedirect) {
    return (
      <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>}>
        <TossRedirectHandler />
      </Suspense>
    );
  }

  // Loading teachers or lesson types
  if (teachersLoading || lessonTypesLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const canProceed = () => {
    switch (step) {
      case 'lessonType': return !!selectedLesson;
      case 'dateTime': return !!selectedDate && !!selectedTime && !!selectedSlot && !!selectedTeacherId;
      case 'details': return lessonFormat === 'online' || !!selectedLocationId || (selectedLocationId === 'custom' && !!customLocationAddress.trim());
      case 'payment': return true;
    }
  };

  const handleConfirmBooking = async () => {
    if (!user) {
      // Save draft so we can resume at the same step after login
      const draft = {
        selectedLesson,
        selectedDate: selectedDate?.toISOString(),
        selectedTime,
        selectedTeacherId,
        lessonFormat,
        platform,
        selectedLocationId,
        customLocationAddress,
        notes,
        paymentMethod,
        currentStep,
      };
      sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft));
      const returnTo = `${window.location.pathname}${window.location.search}`;
      navigate(`/login?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (!selectedLessonData || !selectedDate || !selectedTeacherSlotInfo || !selectedTeacher) return;

    try {
      const selectedLocation = offlineLocations.find((l) => l.id === selectedLocationId);
      const offlineLocation = lessonFormat === 'offline'
        ? selectedLocationId === 'custom'
          ? { name: t('format.customLocation'), address: customLocationAddress.trim(), isCustom: true }
          : selectedLocation
            ? { name: selectedLocation.name, address: selectedLocation.address }
            : null
        : null;
      const bookingId = await createBooking({
        teacherId: selectedTeacher.id,
        teacherName: selectedTeacher.name,
        lessonTypeId: selectedLessonData.id,
        lessonTypeName: selectedLessonData.title,
        date: selectedTeacherSlotInfo.originalDate,
        startTime: selectedTeacherSlotInfo.originalStartTime,
        endTime: selectedTeacherSlotInfo.originalEndTime,
        format: lessonFormat,
        platform: lessonFormat === 'online' ? PLATFORM_MAP[platform] : null,
        offlineLocation,
        paymentMethod,
        notes,
        amount: selectedLessonData.price,
        currency: 'USD',
      });

      setCreatedBookingId(bookingId);
      setShowPaymentUI(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('bookingFailed'));
    }
  };

  const handlePaymentSuccess = () => {
    setBookingComplete(true);
    setShowPaymentUI(false);
  };

  const handlePaymentError = (error: string) => {
    toast.error(error);
  };

  const resetBooking = () => {
    setBookingComplete(false);
    setShowPaymentUI(false);
    setCreatedBookingId('');
    setCurrentStep(0);
    setSelectedLesson('');
    setSelectedDate(undefined);
    setSelectedTime('');
    setSelectedTeacherId('');
    setSelectedLocationId('');
    setNotes('');
  };

  // Success screen
  if (bookingComplete) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <AnimatedSection>
          <Card className="w-full max-w-lg text-center">
            <CardContent className="px-8 py-10">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold">{t('confirmation.title')}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{t('confirmation.subtitle')}</p>
              {paymentMethod === 'bank_transfer' && (
                <p className="mt-2 text-sm text-amber-600">{t('confirmation.pendingPayment')}</p>
              )}
              <div className="mt-8 flex flex-col gap-3">
                <Button className="h-12" onClick={() => navigate('/my-bookings')}>
                  {t('confirmation.viewBookings')}
                </Button>
                <Button className="h-12" variant="outline" onClick={resetBooking}>
                  {t('confirmation.bookAnother')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </AnimatedSection>
      </div>
    );
  }

  return (
    <div className="px-4 py-16">
      <div className="container mx-auto max-w-3xl">
        <AnimatedSection>
          <h1 className="mb-2 text-center text-3xl font-bold">{t('title')}</h1>
        </AnimatedSection>

        {/* Locked-teacher banner */}
        {isTeacherLocked && selectedTeacher && (
          <AnimatedSection>
            <div className="mx-auto mt-6 flex max-w-md items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {selectedTeacher.profileImageUrl ? (
                  <img
                    src={selectedTeacher.profileImageUrl}
                    alt={selectedTeacher.name}
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-200 text-sm font-bold text-indigo-700">
                    {selectedTeacher.name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs text-indigo-600/80">{t('lockedTeacher.label')}</p>
                  <p className="truncate text-sm font-semibold text-indigo-900">{selectedTeacher.name}</p>
                </div>
              </div>
              <Link to="/teachers" className="shrink-0 text-xs font-medium text-indigo-600 hover:underline">
                {t('lockedTeacher.change')}
              </Link>
            </div>
          </AnimatedSection>
        )}

        {/* Stepper */}
        <div className="mb-8 mt-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all duration-200 ${
                  i < currentStep
                    ? 'bg-emerald-500 text-white'
                    : i === currentStep
                      ? 'bg-indigo-500 text-white shadow-md'
                      : 'bg-zinc-100 text-muted-foreground'
                }`}
              >
                {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`ml-2 hidden text-sm sm:inline ${
                i === currentStep ? 'font-medium' : 'text-muted-foreground'
              }`}>
                {t(`steps.${s}`)}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`mx-3 h-0.5 w-6 rounded-full ${i < currentStep ? 'bg-emerald-500' : 'bg-zinc-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Lesson Type */}
        {step === 'lessonType' && (
          <div className="space-y-6">
            <p className="text-center text-muted-foreground">{t('selectLesson')}</p>
            {lessonTypesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-3">
                {lessonTypes.map((opt) => {
                  const description = opt.description?.[lang] || opt.description?.en || '';
                  return (
                    <Card
                      key={opt.id}
                      className={`cursor-pointer transition-all ${
                        selectedLesson === opt.id ? 'ring-2 ring-indigo-500 shadow-md' : ''
                      }`}
                      onClick={() => setSelectedLesson(opt.id)}
                    >
                      <CardContent className="p-8">
                        <Badge className={`mb-3 ${LEVEL_COLORS[opt.level] ?? 'bg-zinc-50 text-zinc-600'}`}>
                          {opt.level.charAt(0).toUpperCase() + opt.level.slice(1)}
                        </Badge>
                        <h3 className="font-semibold">{opt.title[lang] || opt.title.en}</h3>
                        {description && (
                          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
                        )}
                        <div className="mt-5 flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {i18n.t('lessons:duration', { minutes: opt.duration })}
                          </span>
                          <span className="font-mono">
                            {formatLesson({ price: opt.price })} {tc('common.perLesson')}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Date & Time + Teacher */}
        {step === 'dateTime' && (
          <div className="space-y-6">
            <p className="text-center text-muted-foreground">{t('selectDate')}</p>
            <div className="flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-center">
              <Card className="p-4">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    setSelectedDate(d);
                    setSelectedTime('');
                    if (!isTeacherLocked) setSelectedTeacherId('');
                  }}
                  month={viewMonth}
                  onMonthChange={setViewMonth}
                  disabled={(date) => date < new Date(new Date().toDateString())}
                  modifiers={{ hasSlots: datesWithSlots }}
                  modifiersClassNames={{ hasSlots: 'bg-emerald-50 font-semibold text-emerald-600' }}
                />
              </Card>
              <div className="w-full max-w-xs space-y-5">
                <div>
                  <p className="mb-3 text-sm font-medium">{t('selectTime')}</p>
                  {slotsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {tc('common.loading')}
                    </div>
                  ) : selectedDate ? (
                    daySlots.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {daySlots.map((slot) => (
                          <Button
                            key={slot.startTime}
                            variant={selectedTime === slot.startTime ? 'default' : 'outline'}
                            className="h-auto rounded-xl px-3 py-2.5"
                            onClick={() => setSelectedTime(slot.startTime)}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-mono text-xs">{slot.startTime} - {slot.endTime}</span>
                              {!isTeacherLocked && (
                                <span className={`flex items-center gap-1 text-[10px] ${selectedTime === slot.startTime ? 'text-white/70' : 'text-muted-foreground'}`}>
                                  <Users className="h-3 w-3" />
                                  {t('teachersAvailable', { count: slot.teachers.length })}
                                </span>
                              )}
                            </div>
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('noSlots')}</p>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('selectDate')}</p>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t('yourTimezone')}: {userTzLabel}
                  </p>
                </div>

                {/* Available teachers for selected time — hidden when a
                    teacher is locked via ?teacherId= */}
                {!isTeacherLocked && selectedTime && availableTeachersForSlot.length > 0 && (
                  <div>
                    <p className="mb-3 text-sm font-medium">{t('selectTeacher')}</p>
                    <div className="grid gap-2">
                      {availableTeachersForSlot.map((teacher) => (
                        <TeacherCard
                          key={teacher.id}
                          teacher={teacher}
                          selected={selectedTeacherId === teacher.id}
                          onClick={() => setSelectedTeacherId(teacher.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Details */}
        {step === 'details' && (
          <div className="mx-auto max-w-lg space-y-8">
            {/* Lesson Format */}
            <div>
              <p className="mb-4 font-medium">{t('format.title')}</p>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant={lessonFormat === 'online' ? 'default' : 'outline'}
                  onClick={() => setLessonFormat('online')}
                  className="h-auto rounded-xl py-5"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${lessonFormat === 'online' ? 'bg-white/20' : 'bg-indigo-50'}`}>
                      <Monitor className={`h-5 w-5 ${lessonFormat === 'online' ? 'text-white' : 'text-indigo-500'}`} />
                    </div>
                    <span>{t('format.online')}</span>
                  </div>
                </Button>
                <Button
                  variant={lessonFormat === 'offline' ? 'default' : 'outline'}
                  onClick={() => setLessonFormat('offline')}
                  className="h-auto rounded-xl py-5"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${lessonFormat === 'offline' ? 'bg-white/20' : 'bg-amber-50'}`}>
                      <MapPin className={`h-5 w-5 ${lessonFormat === 'offline' ? 'text-white' : 'text-amber-500'}`} />
                    </div>
                    <span>{t('format.offline')}</span>
                  </div>
                </Button>
              </div>
            </div>

            {lessonFormat === 'online' && (
              <div>
                <p className="mb-3 text-sm font-medium">{t('format.selectPlatform')}</p>
                <div className="grid grid-cols-3 gap-3">
                  {['zoom', 'googleMeet', 'teams'].map((p) => (
                    <Button
                      key={p}
                      variant={platform === p ? 'default' : 'outline'}
                      className="h-12 rounded-xl"
                      onClick={() => setPlatform(p)}
                    >
                      {t(`format.${p}`)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {lessonFormat === 'offline' && (
              <div>
                <p className="mb-3 text-sm font-medium">{t('format.selectLocation')}</p>
                <div className="space-y-3">
                  {/* Custom location option */}
                  <Button
                    variant={selectedLocationId === 'custom' ? 'default' : 'outline'}
                    className="h-auto w-full justify-start rounded-xl border-dashed px-5 py-4 text-left"
                    onClick={() => setSelectedLocationId('custom')}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="font-medium">{t('format.customLocation')}</span>
                    </div>
                  </Button>

                  {selectedLocationId === 'custom' && (
                    <div className="ml-1">
                      <label className="mb-1.5 block text-sm text-muted-foreground">
                        {t('format.customLocationHint')}
                      </label>
                      <textarea
                        value={customLocationAddress}
                        onChange={(e) => setCustomLocationAddress(e.target.value)}
                        placeholder={t('format.customLocationPlaceholder')}
                        rows={2}
                        className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  )}

                  {offlineLocations.map((loc) => (
                    <Button
                      key={loc.id}
                      variant={selectedLocationId === loc.id ? 'default' : 'outline'}
                      className="h-auto w-full justify-start rounded-xl px-5 py-4 text-left"
                      onClick={() => setSelectedLocationId(loc.id)}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="font-medium">{loc.name}</span>
                        </div>
                        <span className={`ml-6 text-xs ${selectedLocationId === loc.id ? 'text-white/70' : 'text-muted-foreground'}`}>
                          {loc.address}
                        </span>
                        <div className="ml-6 mt-1 flex gap-3">
                          {loc.googleMapsUrl && (
                            <a
                              href={loc.googleMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={`flex items-center gap-1 text-xs font-medium ${selectedLocationId === loc.id ? 'text-white/80 hover:text-white' : 'text-indigo-500 hover:underline'}`}
                            >
                              <ExternalLink className="h-3 w-3" />
                              {t('format.viewOnGoogleMaps')}
                            </a>
                          )}
                          {loc.naverMapUrl && (
                            <a
                              href={loc.naverMapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={`flex items-center gap-1 text-xs font-medium ${selectedLocationId === loc.id ? 'text-white/80 hover:text-white' : 'text-emerald-600 hover:underline'}`}
                            >
                              <ExternalLink className="h-3 w-3" />
                              {t('format.viewOnNaverMap')}
                            </a>
                          )}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium">{t('notes.label')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('notes.placeholder')}
                rows={3}
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        )}

        {/* Step 4: Payment */}
        {step === 'payment' && (
          <div className="mx-auto max-w-lg space-y-8">
            {/* Booking summary */}
            <Card>
              <CardHeader className="px-8 pt-8">
                <h3 className="font-semibold">{t('confirmation.details')}</h3>
              </CardHeader>
              <CardContent className="space-y-3 px-8 pb-8 text-sm">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{t('summary.lesson')}</span>
                  <span>{selectedLessonData && (selectedLessonData.title[lang] || selectedLessonData.title.en)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{t('summary.teacher')}</span>
                  <span>{selectedTeacher?.name}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{t('summary.date')}</span>
                  <span>{selectedDate && format(selectedDate, 'EEE, MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{t('summary.time')}</span>
                  <span className="font-mono">
                    {selectedSlot ? `${selectedSlot.startTime} - ${selectedSlot.endTime} ${userTzLabel}` : ''}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{t('summary.format')}</span>
                  <span>
                    {lessonFormat === 'online'
                      ? `${t('format.online')} (${t(`format.${platform}`)})`
                      : offlineLocations.find((l) => l.id === selectedLocationId)
                        ? `${t('format.offline')} — ${offlineLocations.find((l) => l.id === selectedLocationId)!.name}`
                        : t('format.offline')}
                  </span>
                </div>
                <div className="mt-4 flex justify-between border-t pt-4 font-semibold">
                  <span>{t('payment.total')}</span>
                  <span className="font-mono">{formatLesson({ price: selectedLessonData?.price ?? 14 })}</span>
                </div>
              </CardContent>
            </Card>

            {/* Payment method selection */}
            {!showPaymentUI && (
              <div>
                <p className="mb-4 font-medium">{t('payment.title')}</p>
                <div className="space-y-3">
                  {(['bank_transfer', 'paypal'] as const).map((method) => (
                    <Button
                      key={method}
                      variant={paymentMethod === method ? 'default' : 'outline'}
                      className="h-12 w-full justify-start rounded-xl"
                      onClick={() => setPaymentMethod(method)}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      {t(`payment.${method === 'bank_transfer' ? 'bankTransfer' : method}`)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Payment UI */}
            {showPaymentUI && createdBookingId && (
              <Suspense fallback={<div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>}>
                {paymentMethod === 'paypal' && (
                  <PaypalCheckout
                    bookingId={createdBookingId}
                    amount={selectedLessonData?.price || 14}
                    currency="USD"
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                  />
                )}

                {paymentMethod === 'toss' && user && (
                  <TossCheckout
                    bookingId={createdBookingId}
                    amount={selectedLessonData?.price || 14}
                    customerName={user.displayName || ''}
                    customerEmail={user.email || ''}
                    orderName={`HaviTalk - ${selectedLessonData?.title?.en ?? 'Lesson'}`}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                  />
                )}

                {paymentMethod === 'bank_transfer' && (
                  <div>
                    <BankTransferInfo
                      bookingId={createdBookingId}
                      amount={selectedLessonData ? getLessonPrice(selectedLessonData, currency, config) : 14}
                      currency={currency}
                    />
                    <Button
                      className="mt-4 h-12 w-full"
                      onClick={handlePaymentSuccess}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      {t('payment.confirmTransfer')}
                    </Button>
                  </div>
                )}
              </Suspense>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-10 flex justify-between">
          <Button
            variant="outline"
            className="h-12"
            onClick={() => {
              if (showPaymentUI) {
                setShowPaymentUI(false);
              } else {
                setCurrentStep((s) => s - 1);
              }
            }}
            disabled={currentStep === 0 && !showPaymentUI}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {tc('common.back')}
          </Button>
          {currentStep < STEPS.length - 1 ? (
            <Button
              className="h-12"
              onClick={() => setCurrentStep((s) => s + 1)}
              disabled={!canProceed()}
            >
              {tc('common.next')}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : !showPaymentUI ? (
            <Button
              className="h-12"
              onClick={handleConfirmBooking}
              disabled={bookingLoading}
            >
              {bookingLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!user ? tc('nav.login') : tc('common.confirm')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Teacher card for step 3 */
function TeacherCard({
  teacher,
  selected,
  onClick,
}: {
  teacher: AggregatedTeacher;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all ${
        selected
          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500'
          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
      }`}
    >
      {teacher.profileImageUrl ? (
        <img
          src={teacher.profileImageUrl}
          alt={teacher.name}
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
          {teacher.name.split(' ').map((n) => n[0]).join('').toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{teacher.name}</div>
        {teacher.rating > 0 && (
          <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span>{teacher.rating.toFixed(1)}</span>
          </div>
        )}
      </div>
      {selected && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500">
          <Check className="h-3.5 w-3.5 text-white" />
        </div>
      )}
    </button>
  );
}
