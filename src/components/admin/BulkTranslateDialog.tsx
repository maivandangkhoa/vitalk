import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Languages, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { db } from '@/lib/firebase';
import { translatePost } from '@/lib/aiTranslate';
import {
  DEFAULT_SOURCE,
  DEFAULT_TARGETS,
  pendingTranslations,
} from '@/lib/blogTranslation';
import { cn } from '@/lib/utils';
import type { BlogPost, Language } from '@/types';

interface BulkTranslateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  posts: BlogPost[];
  languages: { code: Language; label: string }[];
  /** Chạy xong thì nạp lại danh sách để dấu hiệu "đã dịch" khớp thực tế. */
  onDone: () => void;
}

interface RunResult {
  slug: string;
  ok: Language[];
  failed: { lang: Language; reason: string }[];
}

/** Gateway hết lượt trong cửa sổ 5 giờ — khác hẳn một bài dịch hỏng. */
function isQuotaExhausted(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? '';
  return code.includes('resource-exhausted');
}

/**
 * Dịch nốt những bài còn thiếu bản dịch, tuần tự từng bài một.
 *
 * Ba quyết định đáng nhớ:
 *
 * 1. **Ghi thẳng Firestore sau mỗi bài**, không gom cuối lượt. Cả mẻ mất khoảng
 *    90 phút; gom lại thì đóng tab giữa chừng là mất trắng công đã chạy.
 * 2. **Không lưu hàng đợi ở đâu cả.** Danh sách việc tính lại từ chính dữ liệu
 *    mỗi lần mở, nên đóng tab rồi bấm lại là chạy tiếp phần còn thiếu — không
 *    có trạng thái nào để lệch với thực tế.
 * 3. **Hết lượt model thì dừng cả mẻ**, không chạy tiếp. Cắm đầu chạy tiếp chỉ
 *    tạo ra 30 bài lỗi liên tiếp và che mất nguyên nhân thật.
 *
 * Ba ngôn ngữ đích đã chạy song song sẵn bên trong hàm phía server, nên ở đây
 * tuần tự theo bài là đúng — không phải chỗ để thêm song song nữa.
 */
export default function BulkTranslateDialog({
  open,
  onOpenChange,
  posts,
  languages,
  onDone,
}: BulkTranslateDialogProps) {
  const { t } = useTranslation('admin');

  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState('');
  const [results, setResults] = useState<RunResult[]>([]);
  const [stopped, setStopped] = useState<string | null>(null);
  const stopRef = useRef(false);

  /**
   * Chốt danh sách việc đúng một lần, lúc MỞ hộp thoại.
   *
   * `posts` đi qua ref chứ không qua mảng phụ thuộc: chạy xong là `onDone()`
   * nạp lại danh sách, mà mỗi lần `posts` đổi lại reset thì bản tổng kết vừa
   * hiện ra sẽ bị xoá ngay trước mắt người bấm. Cùng lý do đó, mỗi bài ghi xong
   * cũng không được tự rụng khỏi danh sách — thanh tiến độ phải đứng yên.
   */
  const postsRef = useRef(posts);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const [work, setWork] = useState<ReturnType<typeof pendingTranslations>>([]);
  useEffect(() => {
    if (!open) return;
    setWork(pendingTranslations(postsRef.current, DEFAULT_SOURCE, DEFAULT_TARGETS));
    setResults([]);
    setStopped(null);
    setCurrent('');
    stopRef.current = false;
  }, [open]);

  const calls = useMemo(() => work.reduce((n, w) => n + w.missing.length, 0), [work]);
  const label = (code: Language) => languages.find((l) => l.code === code)?.label ?? code;

  const run = async () => {
    setRunning(true);
    stopRef.current = false;
    const collected: RunResult[] = [];

    for (const { post, missing } of work) {
      if (stopRef.current) {
        setStopped(t('blog.bulk.stoppedByUser'));
        break;
      }
      setCurrent(post.slug);

      try {
        const result = await translatePost(
          {
            lang: DEFAULT_SOURCE,
            title: post.title[DEFAULT_SOURCE] ?? '',
            excerpt: post.excerpt?.[DEFAULT_SOURCE] ?? '',
            content: post.content[DEFAULT_SOURCE] ?? '',
          },
          missing
        );

        const ok = missing.filter((l) => (result.content[l] ?? '').trim().length > 0);
        if (ok.length) {
          // Merge, không ghi đè cả object: hàm chỉ trả về ngôn ngữ dịch được,
          // nên thứ tiếng hỏng và thứ tiếng không xin dịch giữ nguyên bản cũ.
          await updateDoc(doc(db, 'blogPosts', post.id), {
            title: { ...post.title, ...result.title },
            excerpt: { ...post.excerpt, ...result.excerpt },
            content: { ...post.content, ...result.content },
            updatedAt: serverTimestamp(),
          });
        }
        collected.push({ slug: post.slug, ok, failed: result.failed });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        collected.push({
          slug: post.slug,
          ok: [],
          failed: missing.map((lang) => ({ lang, reason })),
        });
        if (isQuotaExhausted(err)) {
          setStopped(t('blog.bulk.stoppedQuota'));
          setResults([...collected]);
          break;
        }
      }
      setResults([...collected]);
    }

    setCurrent('');
    setRunning(false);
    onDone();
  };

  const finished = results.length;
  const totalOk = results.reduce((n, r) => n + r.ok.length, 0);
  const problems = results.filter((r) => r.failed.length);

  return (
    <Dialog open={open} onOpenChange={running ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('blog.bulk.title')}</DialogTitle>
          <DialogDescription>
            {work.length
              ? t('blog.bulk.description', {
                  posts: work.length,
                  calls,
                  langs: DEFAULT_TARGETS.map(label).join(', '),
                })
              : t('blog.bulk.nothingToDo')}
          </DialogDescription>
        </DialogHeader>

        {work.length > 0 && (
          <div className="space-y-3">
            {!running && !finished && (
              <>
                <ul className="max-h-52 space-y-1 overflow-y-auto rounded-xl bg-muted/60 p-3 text-xs">
                  {work.map(({ post, missing }) => (
                    <li key={post.id} className="flex justify-between gap-3">
                      <span className="truncate text-muted-foreground">/{post.slug}</span>
                      <span className="shrink-0 font-medium">
                        {missing.map(label).join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{t('blog.bulk.timeHint')}</p>
              </>
            )}

            {(running || finished > 0) && (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      stopped ? 'bg-amber-500' : 'bg-indigo-500'
                    )}
                    style={{ width: `${Math.round((finished / work.length) * 100)}%` }}
                  />
                </div>
                {/* Thanh tiến độ đứng yên suốt ~2 phút mỗi bài, nên phải có
                    thứ gì đó động để nó không trông như treo. */}
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {running && <Loader2 className="h-3 w-3 animate-spin" />}
                  {t('blog.bulk.progress', { done: finished, total: work.length })}
                  {current && ` · /${current}`}
                </p>
              </>
            )}

            {stopped && (
              <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600">{stopped}</p>
            )}

            {problems.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                {problems.map((r) => (
                  <li key={r.slug}>
                    <span className="font-medium">/{r.slug}</span>{' '}
                    {r.failed.map((f) => `${label(f.lang)}: ${f.reason}`).join(' · ')}
                  </li>
                ))}
              </ul>
            )}

            {!running && finished > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('blog.bulk.summary', { count: totalOk })}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {running ? (
            <Button
              variant="outline"
              onClick={() => {
                stopRef.current = true;
              }}
            >
              <Square className="mr-2 h-4 w-4" />
              {t('blog.bulk.stop')}
            </Button>
          ) : finished > 0 ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('blog.bulk.close')}
            </Button>
          ) : (
            <Button disabled={!work.length} onClick={() => void run()}>
              <Languages className="mr-2 h-4 w-4" />
              {t('blog.bulk.start', { count: work.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
