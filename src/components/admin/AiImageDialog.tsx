import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MAX_DIM, uploadPublicImage } from '@/lib/imageUpload';
import {
  AI_ASPECTS,
  aiImagePreviewSrc,
  aiImageToFile,
  generateAiImages,
  type AiAspect,
} from '@/lib/aiImage';
import { cn } from '@/lib/utils';

interface AiImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Thư mục trong bucket: `blog-covers` cho ảnh bìa, `blog-images/inline` cho ảnh trong bài. */
  dir: string;
  /** Tiêu đề bài, hiện làm ngữ cảnh phía trên ô mô tả. */
  postTitle?: string;
  /** Nhận URL công khai của tấm được chọn. */
  onPicked: (url: string) => void;
}

/**
 * Sinh vài tấm ảnh minh hoạ rồi để người viết chọn một.
 *
 * Bố cục ép đúng thứ tự đó — sinh, xem, rồi mới chọn — vì tự động lấy tấm đầu
 * tiên là cách chắc chắn nhất để một bàn tay sáu ngón lên trang chủ. Dòng nhắc
 * dưới lưới ảnh nói thẳng cần soi cái gì, đó là hai lỗi thật đã lọt qua vòng
 * duyệt hồi thay ảnh bìa loạt "Chủ đề N".
 */
export default function AiImageDialog({
  open,
  onOpenChange,
  dir,
  postTitle,
  onPicked,
}: AiImageDialogProps) {
  const { t } = useTranslation('admin');
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<AiAspect>('16:9');
  const [generating, setGenerating] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);

  const busy = generating || pickingIndex !== null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setImages([]);
    try {
      setImages(await generateAiImages(prompt.trim(), aspect));
    } catch (err) {
      // Hết hạn mức là chuyện thường ngày chứ không phải hỏng hóc, nên đưa
      // nguyên thông điệp của hàm ra thay vì nuốt thành "lỗi hệ thống".
      const message = err instanceof Error ? err.message : '';
      toast.error(message || t('blog.ai.generateFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handlePick = async (b64: string, index: number) => {
    setPickingIndex(index);
    try {
      const file = aiImageToFile(b64, `ai-${Date.now()}.jpg`);
      const url = await uploadPublicImage({
        dir,
        file,
        maxDim: MAX_DIM.article,
        namePrefix: 'ai',
      });
      onPicked(url);
      onOpenChange(false);
      setImages([]);
      toast.success(t('blog.ai.picked'));
    } catch {
      toast.error(t('blog.ai.uploadFailed'));
    } finally {
      setPickingIndex(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('blog.ai.title')}</DialogTitle>
          <DialogDescription>{t('blog.ai.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {postTitle && (
            <p className="truncate text-xs text-muted-foreground">
              {t('blog.ai.forPost')}: <span className="font-medium">{postTitle}</span>
            </p>
          )}

          <div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              maxLength={800}
              disabled={busy}
              placeholder={t('blog.ai.promptPlaceholder')}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('blog.ai.promptHint')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-xl border border-input p-1">
              {AI_ASPECTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={busy}
                  onClick={() => setAspect(value)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
                    aspect === value
                      ? 'bg-indigo-500 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {value}
                </button>
              ))}
            </div>

            <Button onClick={handleGenerate} disabled={busy || !prompt.trim()}>
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {generating ? t('blog.ai.generating') : t('blog.ai.generate')}
            </Button>
          </div>

          {generating && (
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-[16/9] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          )}

          {images.length > 0 && (
            <div className="space-y-2">
              <div className="grid gap-3 sm:grid-cols-3">
                {images.map((b64, index) => (
                  <button
                    key={index}
                    type="button"
                    disabled={busy}
                    onClick={() => handlePick(b64, index)}
                    className="group relative overflow-hidden rounded-xl border border-border transition-all hover:border-indigo-500 hover:shadow-md disabled:opacity-60"
                  >
                    <img
                      src={aiImagePreviewSrc(b64)}
                      alt=""
                      className="aspect-[16/9] w-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-zinc-950/55 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900">
                        {pickingIndex === index ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        {t('blog.ai.useThis')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {t('blog.ai.reviewHint')}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
