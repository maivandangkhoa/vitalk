import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_DIM, uploadPublicImage } from '@/lib/imageUpload';
import {
  aiImagePreviewSrc,
  aiImageToFile,
  generateAiImages,
  refineAiImagePrompt,
} from '@/lib/aiImage';
import { cn } from '@/lib/utils';

interface AiCoverStepProps {
  /** Prompt tiếng Anh do trợ lý viết kèm bản nháp. Đổi giá trị = bắt đầu lại. */
  seedPrompt: string;
  onCover: (url: string) => void;
}

/**
 * Chặng ảnh bìa: sinh MỘT tấm mỗi lượt, chê bằng tiếng Việt rồi sinh tiếp.
 *
 * Sinh từng tấm chứ không sinh một lô: mỗi tấm là một lần tiêu hạn mức
 * Cloudflare (trần cứng ~115 ảnh/ngày, cửa sổ trượt 24h), và phần lớn ảnh sinh
 * ra là để loại. Tấm nào cũng phải được bấm nhận thủ công — ~1/3 ảnh Flux ra
 * lỗi (chữ bịa, tay thừa ngón), tự lấy tấm đầu là cách hai ảnh bìa hỏng đã lọt
 * lên trang hồi 2026-08-11.
 */
export default function AiCoverStep({ seedPrompt, onCover }: AiCoverStepProps) {
  const { t } = useTranslation('admin');
  const [prompt, setPrompt] = useState(seedPrompt);
  const [note, setNote] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  /**
   * Đã tự sinh cho prompt nào rồi. StrictMode gọi effect hai lần trong dev, mà
   * mỗi lần là một tấm ảnh thật bị đốt — nên phải nhớ, không thể dựa vào effect
   * chạy đúng một lần.
   */
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!seedPrompt || startedFor.current === seedPrompt) return;
    startedFor.current = seedPrompt;
    setPrompt(seedPrompt);
    setNote('');
    setCandidates([]);
    setPicked(null);
    void generate(seedPrompt);
    // `generate` đọc `busy` qua closure nhưng chỉ để chặn bấm trùng; thêm nó vào
    // deps sẽ khiến effect chạy lại giữa lượt sinh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPrompt]);

  const generate = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const [image] = await generateAiImages(text.trim(), '16:9', 1);
      if (image) setCandidates((prev) => [...prev, image]);
    } catch (err) {
      // Hết hạn mức là chuyện thường ngày chứ không phải hỏng hóc — đưa nguyên
      // văn thông điệp của hàm ra thay vì nuốt thành "lỗi hệ thống".
      const message = err instanceof Error ? err.message : '';
      toast.error(message || t('blog.ai.generateFailed'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Sinh tấm tiếp theo. Có lời nhắn thì viết lại prompt trước rồi mới vẽ.
   *
   * Prompt mới ghi đè vào ô cho người viết ĐỌC ĐƯỢC nó đổi chỗ nào — sửa ngầm
   * thì lần sau chê tiếp là chê vào một câu mình chưa từng thấy.
   */
  const regenerate = async () => {
    if (busy || !prompt.trim()) return;
    let next = prompt.trim();
    if (note.trim()) {
      setBusy(true);
      try {
        next = await refineAiImagePrompt(next, note.trim());
        setPrompt(next);
        setNote('');
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        toast.error(message || t('blog.ai.generateFailed'));
        return;
      } finally {
        setBusy(false);
      }
    }
    await generate(next);
  };

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

  if (!seedPrompt) return null;

  return (
    <div className="space-y-2 rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-3">
      <p className="text-xs font-semibold">{t('blog.writer.coverStep')}</p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        maxLength={800}
        disabled={busy}
        className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-indigo-500 disabled:opacity-60"
      />

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
          <img src={aiImagePreviewSrc(b64)} alt="" className="aspect-[16/9] w-full object-cover" />
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

      {busy && <div className="aspect-[16/9] w-full animate-pulse rounded-lg bg-muted" />}

      {/* Chê bằng tiếng Việt, khỏi tự nghĩ câu tiếng Anh. Chỉ hiện khi đã có
          tấm để mà chê. */}
      {candidates.length > 0 && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void regenerate();
            }
          }}
          maxLength={400}
          disabled={busy}
          placeholder={t('blog.writer.imageNotePlaceholder')}
          className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-indigo-500 disabled:opacity-60"
        />
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={busy || !prompt.trim()}
        onClick={() => void regenerate()}
      >
        {busy ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
        )}
        {!candidates.length
          ? t('blog.ai.generate')
          : note.trim()
            ? t('blog.writer.applyNote')
            : t('blog.writer.anotherImage')}
      </Button>

      {candidates.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-500">{t('blog.ai.reviewHint')}</p>
      )}
    </div>
  );
}
