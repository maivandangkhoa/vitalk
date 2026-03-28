import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { submitReview } from '@/hooks/useReviews';
import { useAuthStore } from '@/stores/authStore';
import type { Booking } from '@/types';

interface ReviewDialogProps {
  booking: Booking;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ReviewDialog({ booking, open, onOpenChange, onSuccess }: ReviewDialogProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const lang = i18n.language as 'en' | 'vi' | 'ko' | 'ja';
  const lessonName = booking.lessonTypeName[lang] || booking.lessonTypeName.en;

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error(t('reviews.ratingRequired'));
      return;
    }
    if (content.trim().length < 10) {
      toast.error(t('reviews.contentMin'));
      return;
    }

    setSubmitting(true);
    try {
      await submitReview({
        studentId: user!.uid,
        studentName: user!.displayName || user!.email || 'Student',
        studentAvatarUrl: user!.photoURL || null,
        rating,
        content: content.trim(),
        lessonType: booking.lessonTypeName.en,
        language: lang,
        bookingId: booking.id,
        teacherId: booking.teacherId,
      });
      toast.success(t('reviews.thankYou'));
      onOpenChange(false);
      onSuccess();
      setRating(0);
      setContent('');
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('reviews.writeReview')}</DialogTitle>
          <DialogDescription>{lessonName} - {booking.date}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">{t('reviews.yourRating')}</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-7 w-7 ${
                      star <= (hoveredRating || rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-zinc-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">{t('reviews.yourReview')}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('reviews.placeholder')}
              rows={4}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('reviews.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
