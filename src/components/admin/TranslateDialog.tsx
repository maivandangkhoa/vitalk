import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Languages, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { translatePost, type TranslatedPost } from '@/lib/aiTranslate';
import { DEFAULT_SOURCE, DEFAULT_TARGETS, hasText } from '@/lib/blogTranslation';
import { cn } from '@/lib/utils';
import type { Language, MultiLangText } from '@/types';

interface TranslateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  languages: { code: Language; label: string }[];
  /** Tab đang mở — gợi ý ngôn ngữ nguồn, nhưng chỉ khi tab đó có chữ. */
  activeLang: Language;
  title: MultiLangText;
  excerpt: MultiLangText;
  content: MultiLangText;
  onTranslated: (result: TranslatedPost) => void;
}

/**
 * Dịch bài đang mở sang những thứ tiếng còn thiếu.
 *
 * Kết quả chỉ đi vào ô soạn thảo rồi **chờ bấm Lưu**, giống mọi thao tác khác
 * trên trang. Không ghi thẳng Firestore — bản dịch máy là thứ đáng liếc qua
 * trước khi nó thành nội dung công khai.
 */
export default function TranslateDialog({
  open,
  onOpenChange,
  languages,
  activeLang,
  title,
  excerpt,
  content,
  onTranslated,
}: TranslateDialogProps) {
  const { t } = useTranslation('admin');

  /** Chỉ thứ tiếng ĐÃ có nội dung mới dịch đi được. */
  const sources = useMemo(
    () => languages.filter((l) => hasText(content, l.code)),
    [languages, content]
  );

  const [source, setSource] = useState<Language>(DEFAULT_SOURCE);
  const [targets, setTargets] = useState<Language[]>([]);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<{ lang: Language; reason: string }[]>([]);
  const [done, setDone] = useState<Language[]>([]);

  /**
   * Tính lại lúc MỞ, và chỉ lúc mở.
   *
   * `content` đi qua ref chứ không qua mảng phụ thuộc: dịch xong là
   * `onTranslated` đổi `content` ngay, mà nếu effect này chạy theo `content`
   * thì nó lập tức xoá `done`/`failed` — người bấm thấy hộp thoại tự dọn sạch
   * kết quả trước mắt mình, không kịp biết thứ tiếng nào hỏng vì sao.
   */
  const stateRef = useRef({ content, activeLang, sources });
  useEffect(() => {
    stateRef.current = { content, activeLang, sources };
  }, [content, activeLang, sources]);

  useEffect(() => {
    if (!open) return;
    const { content: c, activeLang: active, sources: srcs } = stateRef.current;
    const pick = hasText(c, active)
      ? active
      : hasText(c, DEFAULT_SOURCE)
        ? DEFAULT_SOURCE
        : (srcs[0]?.code ?? DEFAULT_SOURCE);
    setSource(pick);
    setTargets(DEFAULT_TARGETS.filter((l) => l !== pick && !hasText(c, l)));
    setFailed([]);
    setDone([]);
  }, [open]);

  const others = languages.filter((l) => l.code !== source);
  const label = (code: Language) => languages.find((l) => l.code === code)?.label ?? code;

  const run = async () => {
    if (!targets.length || running) return;
    setRunning(true);
    setFailed([]);
    try {
      const result = await translatePost(
        {
          lang: source,
          title: title[source] ?? '',
          excerpt: excerpt[source] ?? '',
          content: content[source] ?? '',
        },
        targets
      );
      onTranslated(result);
      setFailed(result.failed);
      setDone(targets.filter((code) => (result.content[code] ?? '').trim().length > 0));

      if (!result.failed.length) {
        toast.success(t('blog.translateSuccess'));
      } else if (result.failed.length < targets.length) {
        toast.warning(
          t('blog.translate.partial', {
            langs: result.failed.map((f) => label(f.lang)).join(', '),
          })
        );
      } else {
        toast.error(t('blog.translateFailed'));
      }
    } catch (err) {
      // Hết lượt Claude là chuyện thường ngày chứ không phải hỏng hóc — đưa
      // nguyên văn thông điệp của hàm ra thay vì nuốt thành "lỗi hệ thống".
      const message = err instanceof Error ? err.message : '';
      toast.error(message || t('blog.translateFailed'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={running ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('blog.translate.title')}</DialogTitle>
          <DialogDescription>{t('blog.translate.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium">{t('blog.translate.from')}</p>
            {sources.length ? (
              <div className="flex flex-wrap gap-1">
                {sources.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    disabled={running}
                    onClick={() => {
                      setSource(l.code);
                      setTargets((prev) => prev.filter((c) => c !== l.code));
                    }}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                      source === l.code
                        ? 'bg-indigo-500 text-white'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('blog.translate.noSource')}</p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">{t('blog.translate.to')}</p>
            <div className="flex flex-wrap gap-1">
              {others.map((l) => {
                const on = targets.includes(l.code);
                const ok = done.includes(l.code);
                const bad = failed.find((f) => f.lang === l.code);
                return (
                  <button
                    key={l.code}
                    type="button"
                    disabled={running}
                    title={bad?.reason}
                    onClick={() =>
                      setTargets((prev) =>
                        on ? prev.filter((c) => c !== l.code) : [...prev, l.code]
                      )
                    }
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                      bad
                        ? 'bg-destructive text-white'
                        : ok
                          ? 'bg-emerald-500 text-white'
                          : on
                            ? 'bg-indigo-500 text-white'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {ok && '✓ '}
                    {bad && '✕ '}
                    {l.label}
                    {/* Thứ tiếng đã có chữ sẵn: nói rõ bấm vào là GHI ĐÈ. */}
                    {!ok && !bad && hasText(content, l.code) && (
                      <span className="ml-1 opacity-60">
                        {t('blog.translate.overwrite')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {failed.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
              {failed.map((f) => (
                <li key={f.lang}>
                  <span className="font-medium">{label(f.lang)}</span>: {f.reason}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">{t('blog.translate.reviewHint')}</p>
        </div>

        <DialogFooter>
          <Button disabled={running || !targets.length} onClick={() => void run()}>
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Languages className="mr-2 h-4 w-4" />
            )}
            {running
              ? t('blog.translating')
              : t('blog.writer.translateTo', { count: targets.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
