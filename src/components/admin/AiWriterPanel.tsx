import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, ImagePlus, Languages, Loader2, RotateCcw, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { MAX_DIM, uploadPublicImage } from '@/lib/imageUpload';
import { aiImagePreviewSrc, aiImageToFile, generateAiImages } from '@/lib/aiImage';
import {
  POST_KINDS,
  streamBlogPost,
  type AiDraft,
  type ChatTurn,
  type PostKind,
} from '@/lib/aiWriter';
import AiDraftCard from '@/components/admin/AiDraftCard';
import { translatePost, type TranslatedPost } from '@/lib/aiTranslate';
import { cn } from '@/lib/utils';
import type { Language } from '@/types';

interface AiWriterPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tab ngôn ngữ đang mở — bài viết ra bằng thứ tiếng này. */
  lang: Language;
  languages: { code: Language; label: string }[];
  /** Chữ người viết đã gõ vào ô nội dung của tab đó; hạt giống của bài. */
  ideas: string;
  title: string;
  tags: string;
  onApply: (draft: AiDraft) => void;
  onTranslated: (result: TranslatedPost) => void;
  onCover: (url: string) => void;
}

interface Bubble {
  role: 'user' | 'assistant';
  text: string;
  draft?: AiDraft;
}

/**
 * Trợ lý viết bài: chat để ra bản nháp, rồi sinh ảnh bìa cho chính bản nháp đó.
 *
 * Hai chặng cố ý nối tiếp chứ không chạy song song. Bản nháp thường còn sửa vài
 * lượt, mà mỗi tấm ảnh là một lần tiêu hạn mức Cloudflare (trần cứng ~115
 * ảnh/ngày, cửa sổ trượt 24h) — sinh ảnh cho bản nháp sắp bị thay là đốt không.
 * Nên chặng ảnh chỉ mở ra sau khi người viết bấm "Áp dụng vào bài".
 */
export default function AiWriterPanel({
  open,
  onOpenChange,
  lang,
  languages,
  ideas,
  title,
  tags,
  onApply,
  onTranslated,
  onCover,
}: AiWriterPanelProps) {
  const { t } = useTranslation('admin');
  const [kind, setKind] = useState<PostKind>('expression');
  const [input, setInput] = useState('');
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [live, setLive] = useState<Bubble | null>(null);

  // Chặng dịch — mở sau khi bản nháp đã vào bài
  const others = languages.filter((l) => l.code !== lang);
  const [applied, setApplied] = useState<AiDraft | null>(null);
  const [targets, setTargets] = useState<Language[]>([]);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState<Language[]>([]);

  // Chặng ảnh
  const [imagePrompt, setImagePrompt] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [imaging, setImaging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const started = history.length > 0 || streaming;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [bubbles, live, candidates]);

  const send = async (text: string) => {
    if (!text.trim() || streaming) return;
    setInput('');
    setBubbles((prev) => [...prev, { role: 'user', text: text.trim() }]);
    setLive({ role: 'assistant', text: '' });
    setStreaming(true);

    try {
      const { raw, turn } = await streamBlogPost(
        {
          kind,
          lang,
          message: text.trim(),
          history,
          // Ngữ cảnh trang chỉ có nghĩa ở lượt đầu; hàm phía server cũng chỉ
          // ghép nó vào khi lịch sử còn rỗng.
          ideas: history.length === 0 ? ideas : undefined,
          title: history.length === 0 ? title : undefined,
          tags: history.length === 0 ? tags : undefined,
        },
        (partial) => setLive({ role: 'assistant', text: partial.reply, draft: partial.draft })
      );

      setBubbles((prev) => [
        ...prev,
        { role: 'assistant', text: turn.reply, draft: turn.draft },
      ]);
      setHistory((prev) => [
        ...prev,
        { role: 'user', content: text.trim() },
        { role: 'assistant', content: raw },
      ]);
    } catch (err) {
      // Hết lượt Claude là chuyện thường ngày chứ không phải hỏng hóc — đưa
      // nguyên văn thông điệp của hàm ra thay vì nuốt thành "lỗi hệ thống".
      const message = err instanceof Error ? err.message : '';
      toast.error(message || t('blog.writer.failed'));
      setBubbles((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setStreaming(false);
      setLive(null);
    }
  };

  const apply = (draft: AiDraft) => {
    onApply(draft);
    toast.success(t('blog.writer.applied'));
    // Bản nháp vào bài rồi mới mở hai chặng sau: dịch và ảnh. Chạy sớm hơn là
    // dịch/vẽ cho một bản nháp còn sắp bị sửa.
    setApplied(draft);
    setTargets(others.map((l) => l.code));
    setTranslated([]);
    if (draft.imagePrompt && draft.imagePrompt !== imagePrompt) {
      setImagePrompt(draft.imagePrompt);
      setCandidates([]);
      setPicked(null);
      void generate(draft.imagePrompt);
    }
  };

  const translate = async () => {
    if (!applied || !targets.length || translating) return;
    setTranslating(true);
    try {
      const result = await translatePost(
        {
          lang,
          title: applied.title,
          excerpt: applied.excerpt,
          content: applied.content,
        },
        targets
      );
      onTranslated(result);
      // Chỉ đánh dấu thứ tiếng THẬT SỰ có chữ trả về: hàm phía server bỏ qua
      // ngôn ngữ nào dịch hỏng thay vì đánh đổ cả lượt.
      setTranslated(
        targets.filter((code) => (result.content[code] ?? '').trim().length > 0)
      );
      toast.success(t('blog.translateSuccess'));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(message || t('blog.translateFailed'));
    } finally {
      setTranslating(false);
    }
  };

  /** Mỗi lượt đúng MỘT tấm: chưa ưng thì bấm sinh tiếp, khỏi đốt hạn mức. */
  const generate = async (prompt: string) => {
    if (!prompt.trim() || imaging) return;
    setImaging(true);
    try {
      const [image] = await generateAiImages(prompt.trim(), '16:9', 1);
      if (image) setCandidates((prev) => [...prev, image]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error(message || t('blog.ai.generateFailed'));
    } finally {
      setImaging(false);
    }
  };

  // Không đặt tên bắt đầu bằng `use`: eslint sẽ coi đây là React hook.
  const setAsCover = async (b64: string, index: number) => {
    setUploading(true);
    setPicked(index);
    try {
      const file = aiImageToFile(b64, `ai-${Date.now()}.jpg`);
      onCover(
        await uploadPublicImage({
          dir: 'blog-covers',
          file,
          maxDim: MAX_DIM.article,
          namePrefix: 'ai',
        })
      );
      toast.success(t('blog.writer.coverSet'));
    } catch {
      setPicked(null);
      toast.error(t('blog.ai.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setBubbles([]);
    setHistory([]);
    setLive(null);
    setApplied(null);
    setTargets([]);
    setTranslated([]);
    setImagePrompt('');
    setCandidates([]);
    setPicked(null);
  };

  const shown = live ? [...bubbles, live] : bubbles;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            {t('blog.writer.title')}
          </SheetTitle>
          <SheetDescription>
            {t('blog.writer.description', {
              lang: languages.find((l) => l.code === lang)?.label ?? lang,
            })}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          {/* Khuôn bài chỉ chọn được trước lượt đầu: đổi giữa chừng thì system
              prompt của các lượt sau lệch với bản nháp đang có trên màn hình. */}
          <div className="flex flex-wrap gap-1 border-b border-border px-4 py-3">
            {POST_KINDS.map((value) => (
              <button
                key={value}
                type="button"
                disabled={started}
                onClick={() => setKind(value)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                  kind === value
                    ? 'bg-indigo-500 text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {t(`blog.writer.kind.${value}`)}
              </button>
            ))}
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {!shown.length && (
              <div className="space-y-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                <p>{t('blog.writer.emptyHint')}</p>
                {ideas.trim() && <p className="font-medium">{t('blog.writer.usingIdeas')}</p>}
              </div>
            )}

            {shown.map((b, i) => (
              <div key={i} className="space-y-2">
                <div
                  className={cn(
                    'w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                    b.role === 'user'
                      ? 'ml-auto bg-indigo-500 text-white'
                      : 'bg-muted text-foreground'
                  )}
                >
                  {b.text || (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {b.draft && <AiDraftCard draft={b.draft} busy={streaming} onApply={apply} />}
              </div>
            ))}

            {/* Chặng dịch — trợ lý hỏi, người viết chọn thứ tiếng. */}
            {applied && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-xs font-semibold">{t('blog.writer.translateStep')}</p>
                <div className="flex flex-wrap gap-1">
                  {others.map((l) => {
                    const on = targets.includes(l.code);
                    const done = translated.includes(l.code);
                    return (
                      <button
                        key={l.code}
                        type="button"
                        disabled={translating}
                        onClick={() =>
                          setTargets((prev) =>
                            on ? prev.filter((c) => c !== l.code) : [...prev, l.code]
                          )
                        }
                        className={cn(
                          'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                          done
                            ? 'bg-emerald-500 text-white'
                            : on
                              ? 'bg-indigo-500 text-white'
                              : 'bg-muted text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {done && '✓ '}
                        {l.label}
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={translating || !targets.length}
                  onClick={() => void translate()}
                >
                  {translating ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Languages className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {translating
                    ? t('blog.translating')
                    : t('blog.writer.translateTo', { count: targets.length })}
                </Button>
              </div>
            )}

            {/* Chặng ảnh — chỉ hiện sau khi một bản nháp đã được áp dụng. */}
            {imagePrompt && (
              <div className="space-y-2 rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-3">
                <p className="text-xs font-semibold">{t('blog.writer.coverStep')}</p>
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={3}
                  maxLength={800}
                  disabled={imaging}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-indigo-500 disabled:opacity-60"
                />

                {candidates.length > 0 && (
                  <div className="space-y-2">
                    {candidates.map((b64, index) => (
                      <button
                        key={index}
                        type="button"
                        disabled={uploading}
                        onClick={() => setAsCover(b64, index)}
                        className={cn(
                          'group relative block w-full overflow-hidden rounded-lg border transition-all disabled:opacity-60',
                          picked === index
                            ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                            : 'border-border hover:border-indigo-500'
                        )}
                      >
                        <img
                          src={aiImagePreviewSrc(b64)}
                          alt=""
                          className="aspect-[16/9] w-full object-cover"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-zinc-950/55 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900">
                            {uploading && picked === index ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            {t('blog.writer.useAsCover')}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {imaging && <div className="aspect-[16/9] w-full animate-pulse rounded-lg bg-muted" />}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={imaging || !imagePrompt.trim()}
                  onClick={() => generate(imagePrompt)}
                >
                  {imaging ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {candidates.length ? t('blog.writer.anotherImage') : t('blog.ai.generate')}
                </Button>
                {candidates.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    {t('blog.ai.reviewHint')}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-border p-4">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={2}
                maxLength={4000}
                disabled={streaming}
                placeholder={
                  started ? t('blog.writer.revisePlaceholder') : t('blog.writer.startPlaceholder')
                }
                className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
              />
              <Button
                size="sm"
                className="self-stretch"
                disabled={streaming || !input.trim()}
                onClick={() => void send(input)}
              >
                {streaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            {started && !streaming && (
              <Button variant="ghost" size="sm" className="w-full" onClick={reset}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {t('blog.writer.reset')}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
