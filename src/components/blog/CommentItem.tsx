import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatRelativeTime } from '@/lib/blog';
import type { BlogComment, Language } from '@/types';

interface CommentItemProps {
  comment: BlogComment;
  canDelete: boolean;
  onDelete: (id: string) => Promise<void>;
}

/**
 * Một bình luận.
 *
 * `text` render dưới dạng chữ thuần — React tự escape, nên không có đường nào
 * để HTML người dùng gõ vào chạy được, và cũng không cần `sanitizeHtml`.
 */
export function CommentItem({ comment, canDelete, onDelete }: CommentItemProps) {
  const { t, i18n } = useTranslation('blog');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(t('comments.deleteConfirm'))) return;
    setDeleting(true);
    try {
      await onDelete(comment.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex gap-3 py-4">
      <Avatar>
        {comment.authorPhoto && <AvatarImage src={comment.authorPhoto} alt="" />}
        <AvatarFallback>{comment.authorName.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{comment.authorName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(comment.createdAt, i18n.language as Language)}
          </span>
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              aria-label={t('comments.delete')}
              className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words">
          {comment.text}
        </p>
      </div>
    </div>
  );
}
