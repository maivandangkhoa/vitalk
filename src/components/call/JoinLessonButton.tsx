import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { callWindowState, formatCountdown, isCallableBooking, joinWindow } from '@/lib/callWindow';
import { roleOf } from '@/lib/webrtc';
import { useAuthStore } from '@/stores/authStore';
import type { Booking } from '@/types';

interface JoinLessonButtonProps {
  booking: Booking;
  className?: string;
}

/**
 * The way into a lesson's classroom, shown only while there is one to enter.
 *
 * It ticks: a button that says "starts in 4:31" and turns into "Join" on its
 * own is the difference between showing up on time and refreshing a page
 * wondering whether the link is broken.
 */
export function JoinLessonButton({ booking, className }: JoinLessonButtonProps) {
  const { t } = useTranslation('call');
  const { user } = useAuthStore();
  const [now, setNow] = useState(() => new Date());

  // An admin browsing every booking is not in the lesson and cannot enter its
  // room — offering them a button that leads to a locked door is worse than
  // offering nothing.
  const callable =
    isCallableBooking(booking) &&
    booking.platform === 'havitalk' &&
    !!user &&
    roleOf(booking, user.uid) !== null;

  useEffect(() => {
    if (!callable) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [callable]);

  if (!callable) return null;

  const state = callWindowState(booking, now);
  if (state === 'over') return null;

  if (state === 'early') {
    const { opensAt } = joinWindow(booking);
    const remaining = opensAt.getTime() - now.getTime();
    // Beyond an hour out the countdown is noise; the lesson's own date already
    // says everything useful.
    if (remaining > 60 * 60_000) return null;
    return (
      <Button size="sm" variant="outline" disabled className={className}>
        <Video data-icon="inline-start" />
        {t('join.countdown', { countdown: formatCountdown(remaining) })}
      </Button>
    );
  }

  return (
    <Button size="sm" className={className} render={<Link to={`/call/${booking.id}`} />}>
      <Video data-icon="inline-start" />
      {t('join.enter')}
    </Button>
  );
}
