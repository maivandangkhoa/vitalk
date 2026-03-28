import { useState, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
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
} from 'lucide-react';
import { format } from 'date-fns';
import { useAvailableSlots } from '@/hooks/useAvailability';
import { useCreateBooking } from '@/hooks/useBookings';
import { useAuthStore } from '@/stores/authStore';
import { useUserTimezone } from '@/hooks/useTimezone';
import { useTeacherBySlug } from '@/hooks/useTeachers';
import { useCurrencySettings } from '@/hooks/useCurrency';
import { convertSlotToUserTz } from '@/lib/timezone';
import { AnimatedSection } from '@/components/shared/motion';
import { useLocations } from '@/hooks/useLocations';
import type { OnlinePlatform, PaymentMethod } from '@/types';
import { toast } from 'sonner';

const PaypalCheckout = lazy(() => import('@/components/booking/PaypalCheckout'));
const TossCheckout = lazy(() => import('@/components/booking/TossCheckout'));
const BankTransferInfo = lazy(() => import('@/components/booking/BankTransferInfo'));
const TossRedirectHandler = lazy(() => import('@/components/booking/TossRedirectHandler'));

const STEPS = ['lessonType', 'dateTime', 'details', 'payment'] as const;
type Step = (typeof STEPS)[number];

const LESSON_OPTIONS = [
  { id: 'beginner', level: 'beginner', price: 14, duration: 50 },
  { id: 'intermediate', level: 'intermediate', price: 14, duration: 50 },
  { id: 'conversation', level: 'conversation', price: 14, duration: 50 },
] as const;

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
  const { t: tl } = useTranslation('lessons');
  const { t: tc } = useTranslation('common');
  const { formatLesson, format: formatCurrency } = useCurrencySettings();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const { slug } = useParams<{ slug: string }>();
  const { teacher, loading: teacherLoading } = useTeacherBySlug(slug);

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [selectedLesson, setSelectedLesson] = useState<string>('');
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [lessonFormat, setLessonFormat] = useState<'online' | 'offline'>('online');
  const [platform, setPlatform] = useState('zoom');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('paypal');
  const [bookingComplete, setBookingComplete] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string>('');
  const [showPaymentUI, setShowPaymentUI] = useState(false);

  const yearMonth = format(viewMonth, 'yyyy-MM');
  const { slots: availableSlots, loading: slotsLoading } = useAvailableSlots(teacher?.id || '', yearMonth);
  const { createBooking, loading: bookingLoading } = useCreateBooking();
  const { userTz, userTzLabel, teacherTzLabel, isSameAsTeacher } = useUserTimezone(teacher?.timezone);
  const { locations: offlineLocations } = useLocations();

  const step: Step = STEPS[currentStep];
  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
  const daySlots = selectedDateStr ? (availableSlots[selectedDateStr] || []) : [];

  const convertedDaySlots = useMemo(() => {
    if (!selectedDateStr || isSameAsTeacher) return null;
    return daySlots.map((slot) => convertSlotToUserTz(slot.startTime, slot.endTime, selectedDateStr, userTz, teacher?.timezone));
  }, [daySlots, selectedDateStr, userTz, isSameAsTeacher, teacher?.timezone]);

  const datesWithSlots = useMemo(() => {
    return Object.keys(availableSlots)
      .filter((d) => {
        const date = new Date(d + 'T00:00:00');
        return date >= new Date(new Date().toDateString());
      })
      .map((d) => new Date(d + 'T00:00:00'));
  }, [availableSlots]);

  const selectedLessonData = LESSON_OPTIONS.find((o) => o.id === selectedLesson);
  const selectedSlot = daySlots.find((s) => s.startTime === selectedTime);
  const selectedLocationData = offlineLocations.find((l) => l.id === selectedLocationId);

  // Backward compat: if accessed via old /book route (no slug), prompt to select a teacher
  if (!slug) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md text-center">
          <CardContent className="px-8 py-10">
            <h2 className="text-xl font-bold">{t('title')}</h2>
            <p className="mt-3 text-muted-foreground">
              {t('selectTeacherFirst', 'Please select a teacher to book a lesson with.')}
            </p>
            <Button className="mt-6 h-12" asChild>
              <Link to="/teachers">{t('browseTeachers', 'Browse Teachers')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading while teacher profile is being fetched
  if (teacherLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // Teacher not found
  if (!teacher) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md text-center">
          <CardContent className="px-8 py-10">
            <h2 className="text-xl font-bold">{t('teacherNotFound', 'Teacher Not Found')}</h2>
            <p className="mt-3 text-muted-foreground">
              {t('teacherNotFoundDesc', 'The teacher you are looking for does not exist or is no longer active.')}
            </p>
            <Button className="mt-6 h-12" asChild>
              <Link to="/teachers">{t('browseTeachers', 'Browse Teachers')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle Toss payment redirect
  const tossRedirect = searchParams.get('toss');
  if (tossRedirect) {
    return (
      <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>}>
        <TossRedirectHandler />
      </Suspense>
    );
  }

  const canProceed = () => {
    switch (step) {
      case 'lessonType': return !!selectedLesson;
      case 'dateTime': return !!selectedDate && !!selectedTime && !!selectedSlot;
      case 'details': return lessonFormat === 'online' || !!selectedLocationId;
      case 'payment': return true;
    }
  };

  const handleConfirmBooking = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!selectedLessonData || !selectedDate || !selectedSlot) return;

    try {
      const bookingId = await createBooking({
        teacherId: teacher!.id,
        teacherName: teacher!.name,
        lessonTypeId: selectedLessonData.id,
        lessonTypeName: {
          en: i18n.getFixedT('en', 'lessons')(`${selectedLessonData.level}.name`),
          vi: i18n.getFixedT('vi', 'lessons')(`${selectedLessonData.level}.name`),
          ko: i18n.getFixedT('ko', 'lessons')(`${selectedLessonData.level}.name`),
          ja: i18n.getFixedT('ja', 'lessons')(`${selectedLessonData.level}.name`),
        },
        date: selectedDateStr,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        format: lessonFormat,
        platform: lessonFormat === 'online' ? PLATFORM_MAP[platform] : null,
        offlineLocation: lessonFormat === 'offline' && selectedLocationData
          ? { name: selectedLocationData.name, address: selectedLocationData.address }
          : null,
        paymentMethod,
        notes,
        amount: selectedLessonData.price,
        currency: 'USD',
      });

      setCreatedBookingId(bookingId);

      if (paymentMethod === 'bank_transfer') {
        setShowPaymentUI(true);
      } else {
        setShowPaymentUI(true);
      }
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
          <div className="mb-4 flex items-center justify-center gap-3">
            <img
              src={teacher.profileImageUrl}
              alt={teacher.name}
              className="h-10 w-10 rounded-full object-cover"
            />
            <span className="text-lg font-medium text-muted-foreground">{teacher.name}</span>
          </div>
          <h1 className="mb-2 text-center text-3xl font-bold">{t('title')}</h1>
        </AnimatedSection>

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
            <div className="grid gap-6 md:grid-cols-3">
              {LESSON_OPTIONS.map((opt) => (
                <Card
                  key={opt.id}
                  className={`cursor-pointer transition-all ${
                    selectedLesson === opt.id ? 'ring-2 ring-indigo-500 shadow-md' : ''
                  }`}
                  onClick={() => setSelectedLesson(opt.id)}
                >
                  <CardContent className="p-8">
                    <Badge className={`mb-3 ${LEVEL_COLORS[opt.level]}`}>{opt.level}</Badge>
                    <h3 className="font-semibold">{tl(`${opt.level}.name`)}</h3>
                    <div className="mt-5 flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {opt.duration}{tc('common.minutes')}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono">{formatLesson({ price: opt.price })}</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Date & Time */}
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
                  }}
                  month={viewMonth}
                  onMonthChange={setViewMonth}
                  disabled={(date) => date < new Date(new Date().toDateString())}
                  modifiers={{ hasSlots: datesWithSlots }}
                  modifiersClassNames={{ hasSlots: 'bg-emerald-50 font-semibold text-emerald-600' }}
                />
              </Card>
              <div className="w-full max-w-xs">
                <p className="mb-3 text-sm font-medium">{t('selectTime')}</p>
                {slotsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tc('common.loading')}
                  </div>
                ) : selectedDate ? (
                  daySlots.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {daySlots.map((slot, index) => {
                        const display = convertedDaySlots?.[index];
                        const displayStart = display?.startTime ?? slot.startTime;
                        const displayEnd = display?.endTime ?? slot.endTime;
                        return (
                          <Button
                            key={slot.startTime}
                            variant={selectedTime === slot.startTime ? 'default' : 'outline'}
                            className="h-12 rounded-xl"
                            onClick={() => setSelectedTime(slot.startTime)}
                          >
                            <span className="font-mono text-xs">{displayStart} - {displayEnd}</span>
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('noSlots')}</p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">{t('selectDate')}</p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  {isSameAsTeacher
                    ? `${t('yourTimezone')}: ${userTzLabel}`
                    : `${t('yourTimezone')}: ${userTzLabel} · ${t('teacherTimezone')}: ${teacherTzLabel}`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Details */}
        {step === 'details' && (
          <div className="mx-auto max-w-lg space-y-8">
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
                {offlineLocations.length > 0 ? (
                  <div className="space-y-3">
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
                ) : (
                  <Card className="border-dashed">
                    <CardContent className="py-4 text-center text-sm text-muted-foreground">
                      {t('format.noLocations')}
                    </CardContent>
                  </Card>
                )}
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
                  <span>{selectedLesson && tl(`${selectedLesson}.name`)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{t('summary.date')}</span>
                  <span>{selectedDate && format(selectedDate, 'EEE, MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{t('summary.time')}</span>
                  <span className="font-mono">
                    {(() => {
                      if (!selectedSlot || !selectedDateStr) return '';
                      const c = convertSlotToUserTz(selectedSlot.startTime, selectedSlot.endTime, selectedDateStr, userTz, teacher?.timezone);
                      return `${c.startTime} - ${c.endTime} ${userTzLabel}`;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{t('summary.format')}</span>
                  <span>
                    {lessonFormat === 'online'
                      ? `${t('format.online')} (${t(`format.${platform}`)})`
                      : selectedLocationData
                        ? `${t('format.offline')} — ${selectedLocationData.name}`
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
                  {(['paypal', 'toss', 'bank_transfer'] as const).map((method) => (
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
                    orderName={`haviTalk - ${selectedLesson} lesson`}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                  />
                )}

                {paymentMethod === 'bank_transfer' && (
                  <div>
                    <BankTransferInfo
                      bookingId={createdBookingId}
                      amount={selectedLessonData?.price || 14}
                      currency="USD"
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
              disabled={bookingLoading || !user}
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
