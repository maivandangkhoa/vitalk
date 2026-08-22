/**
 * Chia sẻ một bài viết blog.
 *
 * Không cần đăng nhập: link đi ra ngoài đã có thẻ OG riêng cho từng bài do
 * `functions/src/ogBlog.ts` chèn vào, nên Facebook/KakaoTalk hiện đúng ảnh bìa
 * và tiêu đề mà không cần làm gì thêm ở đây.
 */
import { blogPostPath } from '@/lib/localeRoutes';

/**
 * Link chia sẻ mang theo ngôn ngữ đang đọc: `/ko/blog/<slug>`.
 *
 * Không có tiền tố thì người nhận mở ra sẽ thấy thứ tiếng máy họ đoán được,
 * chứ không phải thứ tiếng bài mà người gửi vừa đọc — và card preview cũng vậy.
 *
 * Luôn dựng lại từ `origin`: link chia sẻ không được mang theo `?preview=true`.
 */
export function postUrl(slug: string, lang: string): string {
  return `${window.location.origin}${blogPostPath(encodeURIComponent(slug), lang)}`;
}

export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Mở sheet chia sẻ của hệ điều hành.
 * Trả về `false` khi người dùng đóng sheet — đó không phải lỗi, đừng báo lỗi.
 */
export async function shareNative(title: string, url: string): Promise<boolean> {
  try {
    await navigator.share({ title, url });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}

export async function copyLink(url: string): Promise<void> {
  await navigator.clipboard.writeText(url);
}

export function openFacebookShare(url: string): void {
  window.open(
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    '_blank',
    'noopener,noreferrer,width=600,height=640'
  );
}

/* ── KakaoTalk ─────────────────────────────────────────────────────────────
 * `Kakao.Share` đòi **JavaScript key**, không phải REST API key mà
 * `VITE_KAKAO_CLIENT_ID` đang giữ cho luồng đăng nhập — hai key khác nhau của
 * cùng một app. Thiếu key thì `kakaoShareEnabled` là false và nút Kakao không
 * hiện, thay vì hiện ra rồi bấm không ăn.
 */

interface KakaoSdk {
  init(jsKey: string): void;
  isInitialized(): boolean;
  Share: {
    sendDefault(settings: Record<string, unknown>): void;
  };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.5/kakao.min.js';

export const kakaoShareEnabled = Boolean(KAKAO_JS_KEY);

let sdkLoader: Promise<KakaoSdk | null> | null = null;

/** Nạp SDK khi bấm nút, không phải khi mở trang: đọc bài thì không cần nó. */
function loadKakaoSdk(): Promise<KakaoSdk | null> {
  if (!KAKAO_JS_KEY) return Promise.resolve(null);
  if (window.Kakao) return Promise.resolve(window.Kakao);
  if (sdkLoader) return sdkLoader;

  sdkLoader = new Promise<KakaoSdk | null>((resolve) => {
    const script = document.createElement('script');
    script.src = KAKAO_SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.Kakao ?? null);
    script.onerror = () => {
      // Cho phép thử lại ở lần bấm sau: mạng hỏng một lần không nên khoá vĩnh viễn.
      sdkLoader = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return sdkLoader;
}

interface KakaoSharePayload {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
  buttonLabel: string;
}

/** Trả về `false` nếu không chia sẻ được (thiếu key, SDK không tải nổi). */
export async function shareKakao(payload: KakaoSharePayload): Promise<boolean> {
  const kakao = await loadKakaoSdk();
  if (!kakao || !KAKAO_JS_KEY) return false;

  if (!kakao.isInitialized()) kakao.init(KAKAO_JS_KEY);

  const link = { mobileWebUrl: payload.url, webUrl: payload.url };
  kakao.Share.sendDefault({
    objectType: 'feed',
    content: {
      title: payload.title,
      description: payload.description,
      imageUrl: payload.imageUrl,
      link,
    },
    buttons: [{ title: payload.buttonLabel, link }],
  });
  return true;
}
