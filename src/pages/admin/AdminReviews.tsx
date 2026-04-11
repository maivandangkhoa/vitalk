import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Loader2, Eye, EyeOff, Trash2, MessageSquare, RefreshCw, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { useAdminReviews, toggleReviewVisibility, deleteReview, updateReview } from '@/hooks/useReviews';
import { useTeacherSelector } from '@/components/admin/TeacherSelector';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';

export default function AdminReviews() {
  const { t } = useTranslation('admin');
  const { teacherId, teachers, isAdmin } = useTeacherSelector();
  const [filterTeacherId, setFilterTeacherId] = useState<string>('all');
  const { reviews, loading, refetch } = useAdminReviews(filterTeacherId === 'all' ? undefined : filterTeacherId);
  const [syncing, setSyncing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ studentName: '', content: '', rating: 5 });

  const startEdit = (review: { id: string; studentName: string; content: string; rating: number }) => {
    setEditingId(review.id);
    setEditForm({ studentName: review.studentName, content: review.content, rating: review.rating });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      await updateReview(editingId, editForm);
      toast.success(t('reviews.reviewVisible'));
      setEditingId(null);
      refetch();
    } catch {
      toast.error(t('reviews.updateFailed'));
    }
  };

  const handleSync = async () => {
    const syncId = filterTeacherId !== 'all' ? filterTeacherId : teacherId;
    if (!syncId) {
      toast.error('No teacher selected for sync.');
      return;
    }
    setSyncing(true);
    try {
      const fn = httpsCallable<{ teacherId: string }, { imported: number; skipped: number; total: number }>(
        functions,
        'syncItalkiReviews'
      );
      const result = await fn({ teacherId: syncId });
      const { imported, skipped } = result.data;
      toast.success(t('reviews.syncSuccess', { imported, skipped }));
      refetch();
    } catch {
      toast.error(t('reviews.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  const handleToggle = async (id: string, visible: boolean) => {
    try {
      await toggleReviewVisibility(id, !visible);
      toast.success(visible ? t('reviews.reviewHidden') : t('reviews.reviewVisible'));
      refetch();
    } catch {
      toast.error(t('reviews.updateFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('reviews.deleteConfirm'))) return;
    try {
      await deleteReview(id);
      toast.success(t('reviews.reviewDeleted'));
      refetch();
    } catch {
      toast.error(t('reviews.deleteFailed'));
    }
  };

  return (
    <div>
      <AnimatedSection className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">{t('reviews.title')}</h1>
          {isAdmin && teachers.length > 0 && (
            <select
              value={filterTeacherId}
              onChange={(e) => setFilterTeacherId(e.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">{t('bookings.all')}</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name} ({teacher.slug})
                </option>
              ))}
            </select>
          )}
        </div>
        <Button onClick={handleSync} disabled={syncing} variant="outline">
          {syncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {syncing ? t('reviews.syncing') : t('reviews.syncItalki')}
        </Button>
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
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  {editingId === review.id ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          value={editForm.studentName}
                          onChange={(e) => setEditForm({ ...editForm, studentName: e.target.value })}
                          className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                          placeholder="Student name"
                        />
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button key={s} onClick={() => setEditForm({ ...editForm, rating: s })}>
                              <Star className={`h-4 w-4 ${s <= editForm.rating ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-300'}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        value={editForm.content}
                        onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                        className="min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveEdit}>
                          <Check className="mr-1 h-3.5 w-3.5" /> {t('reviews.show')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="mr-1 h-3.5 w-3.5" /> {t('reviews.hide')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-semibold">{review.studentName}</span>
                        <div className="flex">
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          ))}
                        </div>
                        <Badge className={review.isVisible ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : ''} variant={review.isVisible ? 'default' : 'secondary'}>
                          {review.isVisible ? t('reviews.visible') : t('reviews.hidden')}
                        </Badge>
                        {review.source === 'italki' && (
                          <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-600">
                            italki
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground italic">
                        &ldquo;{review.content}&rdquo;
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {review.lessonType} · {review.language}
                      </p>
                    </>
                  )}
                </div>
                {editingId !== review.id && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(review)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
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
                )}
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
            <p className="text-muted-foreground">{t('reviews.noReviews')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
