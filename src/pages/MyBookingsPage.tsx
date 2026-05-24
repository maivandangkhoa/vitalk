import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays,
  Clock,
  Monitor,
  MapPin,
  Loader2,
  ExternalLink,
  Star,
  CheckCircle2,
} from 'lucide-react';
import { useMyBookings } from '@/hooks/useBookings';
import { useBookingReviewStatus } from '@/hooks/useReviews';
import { useAuthStore } from '@/stores/authStore';
import { useUserTimezone } from '@/hooks/useTimezone';
import { convertSlotToUserTz } from '@/lib/timezone';
import { statusColors } from '@/lib/utils';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import { ReviewDialog } from '@/components/reviews/ReviewDialog';
import { formatPrice, getLessonPrice, type SupportedCurrency } from '@/lib/currency';
import { useCurrencySettings } from '@/hooks/useCurrency';
import type { Booking } from '@/types';

function BookingCard({ booking, isReviewed, onReviewSubmitted }: { booking: Booking; isReviewed: boolean; onReviewSubmitted: () => void }) {
  const { t, i18n } = useTranslation();
  const { t: tc } = useTranslation('common');
  const lang = i18n.language as 'en' | 'vi' | 'ko' | 'zh' | 'ja';
  const lessonName = booking.lessonTypeName[lang] || booking.lessonTypeName.en;
  const { userTz, userTzLabel } = useUserTimezone();
  const converted = convertSlotToUserTz(booking.startTime, booking.endTime, booking.date, userTz);
  const [reviewOpen, setReviewOpen] = useState(false);
  const { currency: displayCurrency, config } = useCurrencySettings();
  const storedCurrency = (booking.currency || 'USD') as SupportedCurrency;
  const displayAmount =
    storedCurrency === 'USD'
      ? getLessonPrice({ price: booking.amount }, displayCurrency, config)
      : booking.amount;
  const finalCurrency = storedCurrency === 'USD' ? displayCurrency : storedCurrency;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2.5">
              <h3 className="truncate font-semibold">{lessonName}</h3>
              <Badge className={statusColors[booking.status] || ''}>
                {booking.status}
              </Badge>
            </div>
            {booking.teacherName && (
              <p className="mb-1 text-sm text-muted-foreground">
                {booking.teacherName}
              </p>
            )}

            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span>{converted.date}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{converted.startTime} - {converted.endTime} {userTzLabel}</span>
              </div>
              <div className="flex items-center gap-2.5">
                {booking.format === 'online' ? (
                  <Monitor className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>
                  {booking.format === 'online'
                    ? `${tc('common.online')}${booking.platform ? ` (${booking.platform.replace('_', ' ')})` : ''}`
                    : tc('common.offline')}
                </span>
              </div>
            </div>

            {booking.paymentStatus === 'pending' && (
              <p className="mt-3 text-xs text-amber-600">{t('myBookings.paymentPending')}</p>
            )}

            {booking.status === 'completed' && (
              <div className="mt-3">
                {isReviewed ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t('reviews.reviewed')}
                  </span>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setReviewOpen(true)}>
                    <Star className="mr-1.5 h-3.5 w-3.5" />
                    {t('reviews.writeReview')}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="text-right text-sm">
            <p className="font-mono font-semibold">{formatPrice(displayAmount, finalCurrency)}</p>
            {booking.meetingLink && booking.status === 'confirmed' && (
              <a
                href={booking.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-500 hover:underline"
              >
                {t('myBookings.joinMeeting')} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </CardContent>

      <ReviewDialog
        booking={booking}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSuccess={onReviewSubmitted}
      />
    </Card>
  );
}

export default function MyBookingsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { bookings, loading } = useMyBookings();
  const bookingIds = useMemo(() => bookings.map((b) => b.id), [bookings]);
  const { reviewedIds, refetch: refetchReviews } = useBookingReviewStatus(bookingIds);

  if (!user) {
    return (
      <div className="px-4 py-16">
        <AnimatedSection className="container mx-auto max-w-3xl text-center">
          <p className="mb-4 text-muted-foreground">{t('myBookings.loginRequired')}</p>
          <Button render={<Link to="/login" />}>{t('nav.login')}</Button>
        </AnimatedSection>
      </div>
    );
  }

  return (
    <div className="px-4 py-16">
      <div className="container mx-auto max-w-3xl">
        <AnimatedSection className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">{t('nav.myBookings')}</h1>
          <Button render={<Link to="/book" />}>{t('nav.book')}</Button>
        </AnimatedSection>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : bookings.length > 0 ? (
          <StaggerContainer className="space-y-3">
            {bookings.map((booking) => (
              <StaggerItem key={booking.id}>
                <BookingCard
                  booking={booking}
                  isReviewed={reviewedIds.has(booking.id)}
                  onReviewSubmitted={refetchReviews}
                />
              </StaggerItem>
            ))}
          </StaggerContainer>
        ) : (
          <AnimatedSection>
            <Card>
              <CardContent className="flex flex-col items-center py-16">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100">
                  <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <p className="mb-4 text-muted-foreground">
                  {t('myBookings.noBookings')}
                </p>
                <Button render={<Link to="/book" />}>{t('nav.book')}</Button>
              </CardContent>
            </Card>
          </AnimatedSection>
        )}
      </div>
    </div>
  );
}
