import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface IncomingCallDialogProps {
  open: boolean;
  studentName: string;
  onAccept: () => void;
  /** Put the prompt aside. Presentation only — the room is left untouched. */
  onDismiss: () => void;
}

/**
 * Asks the teacher to start the lesson once the student is waiting.
 *
 * Nothing in here can end a call. Dismissing used to hang up — the same
 * destructive path the thirty-second timer took — which meant a stray Escape
 * key threw the teacher out of the room and told the student they had never
 * arrived. Now the only outward-facing action is accepting; putting the prompt
 * aside is a local decision the page turns into a banner.
 */
export function IncomingCallDialog({
  open,
  studentName,
  onAccept,
  onDismiss,
}: IncomingCallDialogProps) {
  const { t } = useTranslation('call');

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('incoming.title', { name: studentName })}</DialogTitle>
          <DialogDescription>{t('incoming.body')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onDismiss}>
            {t('incoming.later')}
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
