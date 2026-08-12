import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sanitizeHtml } from '@/lib/sanitize';
import type { AiDraft } from '@/lib/aiWriter';

interface AiDraftCardProps {
  draft: AiDraft;
  /** Đang chảy chữ về thì chưa cho áp dụng. */
  busy: boolean;
  onApply: (draft: AiDraft) => void;
}

/**
 * Thẻ xem trước một bản nháp trong khung chat.
 *
 * Nội dung đi qua `sanitizeHtml` đúng như lúc bài lên trang: xem trước mà lỏng
 * hơn trang thật thì cái nhìn thấy ở đây không chứng minh được gì về cái sẽ đăng.
 */
export default function AiDraftCard({ draft, busy, onApply }: AiDraftCardProps) {
  const { t } = useTranslation('admin');
  const chars = draft.content.replace(/<[^>]+>/g, ' ').trim().length;

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-sm font-semibold">{draft.title}</p>
      <p className="text-xs text-muted-foreground">{draft.excerpt}</p>
      {draft.tags.length > 0 && (
        <p className="text-xs text-indigo-500">{draft.tags.join(' · ')}</p>
      )}
      <div
        className="prose prose-sm max-h-52 max-w-none overflow-y-auto rounded-lg bg-muted/50 p-2 dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(draft.content) }}
      />
      <p className="text-xs text-muted-foreground">{t('blog.writer.chars', { count: chars })}</p>
      {/* `complete` false = luồng còn chảy hoặc model bị cắt giữa chừng; áp dụng
          lúc đó là ghi một bài cụt vào editor. */}
      {draft.complete && !busy && (
        <Button size="sm" className="w-full" onClick={() => onApply(draft)}>
          <Check className="mr-1.5 h-3.5 w-3.5" />
          {t('blog.writer.apply')}
        </Button>
      )}
    </div>
  );
}
