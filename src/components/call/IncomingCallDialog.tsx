import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, PhoneOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RING_TIMEOUT_MS } from '@/types/call';

/**
 * The visible half of `useCall`'s ring timeout. Without it the dialog would
 * simply vanish after thirty seconds, which reads as a bug.
 */
function RingCountdown() {
  const { t } = useTranslation('call');
  const [remaining, setRemaining] = useState(RING_TIMEOUT_MS);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setRemaining(Math.max(0, RING_TIMEOUT_MS - (Date.now() - startedAt)));
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return <>{t('incoming.body', { seconds: Math.ceil(remaining / 1000) })}</>;
}

interface IncomingCallDialogProps {
  open: boolean;
  studentName: string;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Asks the teacher to start the lesson once the student is waiting.
 */
export function IncomingCallDialog({
  open,
  studentName,
  onAccept,
  onDecline,
}: IncomingCallDialogProps) {
  const { t } = useTranslation('call');

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDecline()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('incoming.title', { name: studentName })}</DialogTitle>
          <DialogDescription>
            {/* Mounted only while ringing, so each ring starts its own clock
                without an effect that resets the previous one. */}
            {open && <RingCountdown />}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" onClick={onDecline}>
            <PhoneOff data-icon="inline-start" />
            {t('incoming.decline')}
          </Button>
          <Button onClick={onAccept}>
            <Phone data-icon="inline-start" />
            {t('incoming.accept')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
