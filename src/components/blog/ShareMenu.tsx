import { useTranslation } from 'react-i18next';
import { Copy, MessageCircle, Share2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  canNativeShare,
  copyLink,
  kakaoShareEnabled,
  openFacebookShare,
  shareKakao,
  shareNative,
} from '@/lib/blogShare';

/** lucide đã bỏ nhóm icon thương hiệu, nên chữ "f" của Facebook vẽ tại chỗ. */
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

interface ShareMenuProps {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
}

/**
 * Menu chia sẻ bài viết. Không cần đăng nhập.
 *
 * Mục "chia sẻ của máy" chỉ hiện khi trình duyệt có Web Share API (thực tế là
 * mobile), mục KakaoTalk chỉ hiện khi đã cấu hình `VITE_KAKAO_JS_KEY` — không
 * bày ra nút bấm vào không chạy.
 */
export function ShareMenu({ title, description, imageUrl, url }: ShareMenuProps) {
  const { t } = useTranslation('blog');

  const handleCopy = async () => {
    try {
      await copyLink(url);
      toast.success(t('share.linkCopied'));
    } catch {
      toast.error(t('share.copyFailed'));
    }
  };

  const handleNative = async () => {
    try {
      await shareNative(title, url);
    } catch {
      toast.error(t('share.failed'));
    }
  };

  const handleKakao = async () => {
    try {
      const sent = await shareKakao({
        title,
        description,
        imageUrl,
        url,
        buttonLabel: t('readPost'),
      });
      if (!sent) toast.error(t('share.failed'));
    } catch {
      toast.error(t('share.failed'));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
        <Share2 className="h-4 w-4" />
        {t('share.label')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-1.5">
        {canNativeShare() && (
          <DropdownMenuItem onClick={handleNative} className="cursor-pointer gap-2.5 px-2 py-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            {t('share.native')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleCopy} className="cursor-pointer gap-2.5 px-2 py-2">
          <Copy className="h-4 w-4 text-muted-foreground" />
          {t('share.copyLink')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => openFacebookShare(url)}
          className="cursor-pointer gap-2.5 px-2 py-2"
        >
          <FacebookIcon className="h-4 w-4 text-[#1877f2]" />
          Facebook
        </DropdownMenuItem>
        {kakaoShareEnabled && (
          <DropdownMenuItem onClick={handleKakao} className="cursor-pointer gap-2.5 px-2 py-2">
            <MessageCircle className="h-4 w-4 text-[#3c1e1e]" />
            KakaoTalk
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
