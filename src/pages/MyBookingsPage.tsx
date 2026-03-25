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
} from 'lucide-react';
import { useMyBookings } from '@/hooks/useBookings';
import { useAuthStore } from '@/stores/authStore';
import { statusColors } from '@/lib/utils';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import type { Booking } from '@/types';

function BookingCard({ booking }: { booking: Booking }) {
  const { i18n } = useTranslation();
  const lang = i18n.language as 'en' | 'vi' | 'ko' | 'ja';
  const lessonName = booking.lessonTypeName[lang] || booking.lessonTypeName.en;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="truncate font-semibold">{lessonName}</h3>
              <Badge className={statusColors[booking.status] || ''}>
                {booking.status}
              </Badge>
            </div>

            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span>{booking.date}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{booking.startTime} - {booking.endTime} KST</span>
              </div>
              <div className="flex items-center gap-2">
                {booking.format === 'online' ? (
                  <Monitor className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>
                  {booking.format === 'online'
                    ? `Online${booking.platform ? ` (${booking.platform.replace('_', ' ')})` : ''}`
                    : 'In-person'}
                </span>
              </div>
            </div>

            {booking.paymentStatus === 'pending' && (
              <p className="mt-2 text-xs text-amber-600">Payment pending</p>
            )}
          </div>

          <div className="text-right text-sm">
            <p className="font-mono font-semibold">${booking.amount} {booking.currency}</p>
            {booking.meetingLink && booking.status === 'confirmed' && (
              <a
                href={booking.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-500 hover:underline"
              >
                Join <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MyBookingsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { bookings, loading } = useMyBookings();

  if (!user) {
    return (
      <div className="px-4 py-16">
        <AnimatedSection className="container mx-auto max-w-3xl text-center">
          <p className="mb-4 text-muted-foreground">Please log in to view your bookings.</p>
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
                <BookingCard booking={booking} />
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
                  You don&apos;t have any bookings yet.
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
