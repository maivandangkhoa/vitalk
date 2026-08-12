import { useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, LogIn, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CommentItem } from '@/components/blog/CommentItem';
import { useAuthStore } from '@/stores/authStore';
import type { BlogComment } from '@/types';

/** Rules chặn ở đúng con số này; textarea chặn trước để không phải nhận lỗi từ server. */
const MAX_LENGTH = 2000;
/** Khoảng nghỉ giữa hai bình luận. Không phải chống spam thật, chỉ chặn bấm nhầm liên tục. */
const COOLDOWN_MS = 10_000;

interface CommentSectionProps {
  comments: BlogComment[];
  loading: boolean;
  addComment: (user: User, text: string) => Promise<void>;
  removeComment: (id: string) => Promise<void>;
}

export function CommentSection({ comments, loading, addComment, removeComment }: CommentSectionProps) {
  const { t } = useTranslation('blog');
  const { user, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const lastPostedAt = useRef(0);

  const handleSubmit = async () => {
    const body = text.trim();
    if (!user || !body || submitting) return;

    const since = Date.now() - lastPostedAt.current;
    if (since < COOLDOWN_MS) {
      toast.error(t('comments.tooFast', { seconds: Math.ceil((COOLDOWN_MS - since) / 1000) }));
      return;
    }

    setSubmitting(true);
    try {
      await addComment(user, body);
      lastPostedAt.current = Date.now();
      setText('');
    } catch {
      toast.error(t('comments.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeComment(id);
      toast.success(t('comments.deleted'));
    } catch {
      toast.error(t('comments.deleteFailed'));
    }
  };

  const admin = isAdmin();

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
        <MessageSquare className="h-5 w-5" />
        {t('comments.title')}
        {comments.length > 0 && (
          <span className="text-muted-foreground tabular-nums">{comments.length}</span>
        )}
      </h2>

      {user ? (
        <div className="mt-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('comments.placeholder')}
            rows={3}
            maxLength={MAX_LENGTH}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !text.trim()}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('comments.post')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-4">
          <p className="text-sm text-muted-foreground">{t('comments.loginPrompt')}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)}
          >
            <LogIn className="mr-2 h-4 w-4" />
            {t('comments.login')}
          </Button>
        </div>
      )}

      <div className="mt-4 divide-y divide-border">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('comments.empty')}</p>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              canDelete={admin || comment.authorId === user?.uid}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </section>
  );
}
