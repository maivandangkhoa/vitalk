import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Loader2, Eye, EyeOff, Trash2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminReviews, toggleReviewVisibility, deleteReview } from '@/hooks/useReviews';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';

export default function AdminReviews() {
  const { t } = useTranslation('admin');
  const { reviews, loading, refetch } = useAdminReviews();

  const handleToggle = async (id: string, visible: boolean) => {
    try {
      await toggleReviewVisibility(id, !visible);
      toast.success(visible ? 'Review hidden' : 'Review visible');
      refetch();
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this review?')) return;
    try {
      await deleteReview(id);
      toast.success('Review deleted');
      refetch();
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div>
      <AnimatedSection>
        <h1 className="mb-6 text-2xl font-bold">{t('reviews.title')}</h1>
      </AnimatedSection>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : reviews.length > 0 ? (
        <StaggerContainer className="space-y-3">
          {reviews.map((review) => (
            <StaggerItem key={review.id}>
            <Card>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{review.studentName}</span>
                    <div className="flex">
                      {Array.from({ length: review.rating }).map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <Badge className={review.isVisible ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : ''} variant={review.isVisible ? 'default' : 'secondary'}>
                      {review.isVisible ? 'Visible' : 'Hidden'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground italic">
                    &ldquo;{review.content}&rdquo;
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {review.lessonType} · {review.language}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(review.id, review.isVisible)}
                  >
                    {review.isVisible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(review.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
              <MessageSquare className="h-8 w-8 text-indigo-300" />
            </div>
            <p className="text-muted-foreground">No reviews yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
