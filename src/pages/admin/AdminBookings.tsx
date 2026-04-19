import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CalendarDays,
  Clock,
  Monitor,
  MapPin,
  Loader2,
  CheckCircle,
  XCircle,
  Link2,
  Mail,
  DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useAdminBookings,
  confirmBookingPayment,
  cancelBooking,
  addMeetingLink,
  updateBookingStatus,
} from '@/hooks/useBookings';
import { useAuthStore } from '@/stores/authStore';
import { useTeacherSelector, TeacherSelector } from '@/components/admin/TeacherSelector';
import { statusColors, paymentStatusColors } from '@/lib/utils';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import type { Booking, BookingStatus } from '@/types';
import { formatPrice, type SupportedCurrency } from '@/lib/currency';

const STATUSES = ['all', 'pending', 'confirmed', 'completed', 'cancelled'] as const;

function AdminBookingCard({
  booking,
  onRefresh,
}: {
  booking: Booking;
  onRefresh: () => void;
}) {
  const { t } = useTranslation('admin');
  const { i18n } = useTranslation();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [meetingLinkInput, setMeetingLinkInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const lang = i18n.language as 'en' | 'vi' | 'ko' | 'ja';
  const lessonName = booking.lessonTypeName[lang] || booking.lessonTypeName.ko || booking.lessonTypeName.en;

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action);
    try {
      await fn();
      toast.success(t('bookings.actionSuccess'));
      onRefresh();
    } catch {
      toast.error(t('bookings.actionFailed'));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2.5">
              <h3 className="font-semibold">{lessonName}</h3>
              <Badge className={statusColors[booking.status] || ''}>
                {t(`bookings.${booking.status}`)}
              </Badge>
              <Badge className={paymentStatusColors[booking.paymentStatus] || ''}>
                <DollarSign className="mr-0.5 h-3 w-3" />
                {t(`bookings.${booking.paymentStatus}`)}
              </Badge>
            </div>

            <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <div className="flex items-center gap-2.5">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{booking.studentName} ({booking.studentEmail})</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span>{booking.date}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{booking.startTime} - {booking.endTime} KST</span>
              </div>
              <div className="flex items-center gap-2.5">
                {booking.format === 'online' ? (
                  <Monitor className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>
                  {booking.format === 'online'
                    ? `${t('bookings.online')}${booking.platform ? ` (${booking.platform.replace('_', ' ')})` : ''}`
                    : booking.offlineLocation
                      ? `${booking.offlineLocation.name} — ${booking.offlineLocation.address}`
                      : t('bookings.inPerson')}
                </span>
                {booking.offlineLocation?.isCustom && (
                  <Badge className="bg-amber-50 text-amber-600 border-amber-200 text-xs">
                    {t('bookings.customLocation')}
                  </Badge>
                )}
              </div>
            </div>

            {booking.notes && (
              <p className="mt-3 text-sm leading-relaxed italic text-muted-foreground">
                &quot;{booking.notes}&quot;
              </p>
            )}

            <div className="mt-2 text-sm font-medium">
              <span className="font-mono">{formatPrice(booking.amount, (booking.currency || 'USD') as SupportedCurrency)}</span> · {booking.paymentMethod.replace('_', ' ')}
            </div>

            {booking.meetingLink && (
              <p className="mt-2 text-xs text-indigo-500">
                Meeting: {booking.meetingLink}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 sm:flex-col">
            {booking.status === 'pending' && booking.paymentStatus === 'pending' && (
              <Button
                size="sm"
                onClick={() =>
                  handleAction('Confirm payment', () =>
                    confirmBookingPayment(booking.id)
                  )
                }
                disabled={actionLoading !== null}
              >
                {actionLoading === 'Confirm payment' ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="mr-1 h-3.5 w-3.5" />
                )}
                {t('bookings.confirmPayment')}
              </Button>
            )}

            {booking.status === 'confirmed' && booking.format === 'online' && !booking.meetingLink && (
              <>
                {showLinkInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="url"
                      value={meetingLinkInput}
                      onChange={(e) => setMeetingLinkInput(e.target.value)}
                      placeholder="https://zoom.us/..."
                      className="w-48 rounded-xl border border-input bg-background px-2 py-1 text-xs outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!meetingLinkInput.trim()) return;
                        handleAction('Add meeting link', () =>
                          addMeetingLink(booking.id, meetingLinkInput.trim())
                        );
                        setShowLinkInput(false);
                        setMeetingLinkInput('');
                      }}
                      disabled={actionLoading !== null}
                    >
                      {t('bookings.save')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowLinkInput(true)}
                  >
                    <Link2 className="mr-1 h-3.5 w-3.5" />
                    {t('bookings.addMeetingLink')}
                  </Button>
                )}
              </>
            )}

            {booking.status === 'confirmed' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  handleAction('Complete', () =>
                    updateBookingStatus(booking.id, 'completed')
                  )
                }
                disabled={actionLoading !== null}
              >
                {actionLoading === 'Complete' ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="mr-1 h-3.5 w-3.5" />
                )}
                {t('bookings.markCompleted')}
              </Button>
            )}

            {(booking.status === 'pending' || booking.status === 'confirmed') && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() =>
                  handleAction('Cancel', () => cancelBooking(booking.id))
                }
                disabled={actionLoading !== null}
              >
                {actionLoading === 'Cancel' ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle className="mr-1 h-3.5 w-3.5" />
                )}
                {t('bookings.cancelBooking')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminBookings() {
  const { t } = useTranslation('admin');
  const { role } = useAuthStore();
  const { teacherId, teachers, isAdmin, setTeacherId } = useTeacherSelector();
  const [activeStatus, setActiveStatus] = useState<string>('all');

  const statusFilter = activeStatus === 'all' ? undefined : (activeStatus as BookingStatus);
  const { bookings, loading, refetch } = useAdminBookings(statusFilter, role === 'teacher' ? teacherId || undefined : undefined);

  return (
    <div>
      <AnimatedSection className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('bookings.title')}</h1>
        {isAdmin && (
          <TeacherSelector teacherId={teacherId} teachers={teachers} onChange={setTeacherId} />
        )}
      </AnimatedSection>

      <Tabs value={activeStatus} onValueChange={setActiveStatus}>
        <TabsList className="flex w-full flex-wrap gap-1">
          {STATUSES.map((status) => (
            <TabsTrigger key={status} value={status} className="flex-1 min-w-0 text-xs sm:text-sm">
              {t(`bookings.${status}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : bookings.length > 0 ? (
          <StaggerContainer className="space-y-3">
            {bookings.map((booking) => (
              <StaggerItem key={booking.id}>
                <AdminBookingCard
                  booking={booking}
                  onRefresh={refetch}
                />
              </StaggerItem>
            ))}
          </StaggerContainer>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
                <CalendarDays className="h-8 w-8 text-indigo-300" />
              </div>
              <p className="text-muted-foreground">{t('bookings.noBookings')}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
