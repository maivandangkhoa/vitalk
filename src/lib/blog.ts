/**
 * Tiện ích dùng chung cho blog (trang danh sách + trang bài viết).
 *
 * Ba việc trước đây bị copy trong từng trang: chọn bản dịch, đổi
 * `publishedAt` của Firestore về `Date`, và ước lượng thời gian đọc.
 */
import { pickLang } from '@/lib/multiLang';
import type { Language, MultiLangText } from '@/types';

/**
 * Blog dự phòng theo `ko` trước, khác với `en → vi` của phần còn lại trong
 * trang — giữ nguyên thứ tự mà hai trang blog vẫn dùng từ trước.
 */
const BLOG_FALLBACK: Language[] = ['ko', 'en', 'vi', 'zh', 'ja'];

/**
 * Bản dịch để hiển thị của một trường trong bài viết.
 *
 * Đi qua `pickLang` chung nên được hưởng hai thứ mà hai trang blog trước đây
 * tự viết tay và bỏ sót: cắt hậu tố vùng của `i18n.language` ("en-US"), và coi
 * `<p></p>` — trường Tiptap rỗng — là rỗng thay vì là nội dung.
 */
export function pickPostLang(text: MultiLangText | undefined, lang: Language): string {
  return pickLang(text, lang, BLOG_FALLBACK);
}

/**
 * Gom mọi dạng mốc thời gian về `Date`.
 *
 * `publishedAt` khai kiểu `Date` nhưng thực tế đọc từ Firestore ra là
 * `Timestamp` (`{ seconds }`) — bài viết cũ còn có thể là số ms.
 */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const ts = value as { seconds?: number };
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    return null;
  }
  if (typeof value === 'number' || typeof value === 'string') return new Date(value);
  return null;
}

/** Mã ngôn ngữ i18n → locale tag cho `toLocaleDateString`. */
const DATE_LOCALES: Record<Language, string> = {
  en: 'en-US',
  vi: 'vi-VN',
  ko: 'ko-KR',
  zh: 'zh-CN',
  ja: 'ja-JP',
};

export function formatDate(value: unknown, lang: Language): string {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleDateString(DATE_LOCALES[lang] ?? 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const WORDS_PER_MINUTE = 220;
/** Chữ Hán/Kana không cách nhau bằng khoảng trắng nên đọc theo ký tự, nhanh hơn. */
const CJK_PER_MINUTE = 500;
const CJK_CHARS = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;

/**
 * Ước lượng số phút đọc từ HTML của bài.
 *
 * Đếm riêng hai loại chữ: tách theo khoảng trắng thì `zh`/`ja` ra 1-2 "từ" cho
 * cả bài dài, còn Hangul vẫn có khoảng trắng nên nằm ở nhánh từ như en/vi.
 */
export function estimateReadTime(html: string): number {
  const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/&[#\w]+;/g, ' ');
  const cjk = text.match(CJK_CHARS)?.length ?? 0;
  const words = text.replace(CJK_CHARS, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE + cjk / CJK_PER_MINUTE));
}
