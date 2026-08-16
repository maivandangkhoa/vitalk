import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { Language } from '@/types';

/** Chỉ chứa những thứ tiếng hàm trả về, KHÔNG phải đủ 5 khóa. */
export type PartialLangText = Partial<Record<Language, string>>;

/** Một thứ tiếng dịch hỏng, kèm lý do nguyên văn từ hàm. */
export interface LangFailure {
  lang: Language;
  reason: string;
}

export interface TranslatedPost {
  title: PartialLangText;
  excerpt: PartialLangText;
  content: PartialLangText;
  /** Rỗng mới là thành công trọn vẹn — đừng chỉ kiểm tra promise resolve. */
  failed: LangFailure[];
}

/**
 * Dịch một bài phía server có thể mất nhiều phút, mà mặc định của
 * firebase-js-sdk là **70 giây** (`@firebase/functions` — `options.timeout ||
 * 70000`). Không đặt lại thì trình duyệt bỏ cuộc giữa chừng trong khi hàm vẫn
 * chạy tiếp: người dùng thấy "Dịch thất bại", còn hạn mức model thì đã tiêu.
 * Khớp với `timeoutSeconds: 540` phía hàm.
 */
const TIMEOUT_MS = 540_000;

/**
 * Dịch một bài sang những thứ tiếng người viết chọn.
 *
 * Hàm phía server chỉ trả về ngôn ngữ nguồn cộng những ngôn ngữ dịch được, nên
 * chỗ gọi cứ merge thẳng: thứ tiếng không chọn giữ nguyên bản dịch cũ. Thứ
 * tiếng dịch hỏng nằm ở `failed` chứ không làm hỏng cả lượt.
 */
export async function translatePost(
  source: { lang: Language; title: string; excerpt: string; content: string },
  targets: Language[]
): Promise<TranslatedPost> {
  const fn = httpsCallable<
    {
      title: string;
      excerpt: string;
      content: string;
      sourceLang: Language;
      targets: Language[];
    },
    TranslatedPost
  >(functions, 'translateBlogPost', { timeout: TIMEOUT_MS });

  const res = await fn({
    title: source.title,
    excerpt: source.excerpt,
    content: source.content,
    sourceLang: source.lang,
    targets,
  });
  // Hàm cũ chưa có khoá này; đừng để chỗ gọi phải tự phòng thân.
  return { ...res.data, failed: res.data.failed ?? [] };
}
