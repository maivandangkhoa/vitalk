/**
 * Đường dẫn blog có tiền tố ngôn ngữ: `/ko/blog/<slug>`.
 *
 * Một URL cho cả năm bản dịch thì Google chỉ index được một bản — bốn bản còn
 * lại bị gộp vào làm một vì với nó đó là cùng một trang. Tiền tố ngôn ngữ cho
 * mỗi bản dịch một URL riêng, và cũng là thứ khiến link chia sẻ ra ngoài mở
 * đúng thứ tiếng người gửi đang đọc thay vì thứ tiếng máy người nhận đoán ra.
 *
 * `/blog/<slug>` trần vẫn sống: mọi link đã chia sẻ trước đây đều ở dạng đó.
 * Nó giữ nguyên hành vi cũ (ngôn ngữ do máy người đọc quyết định), còn phần
 * canonical trỏ về bản `ko` do `functions/src/blogSeo.ts` lo.
 */
import { SUPPORTED_LANGUAGES } from '@/lib/constants';
import type { Language } from '@/types';

const LANG_CODES: string[] = SUPPORTED_LANGUAGES.map((lang) => lang.code);

/** Ngôn ngữ ở đoạn đầu đường dẫn, `null` nếu đoạn đó không phải mã ngôn ngữ. */
export function langFromPath(pathname: string): Language | null {
  const first = pathname.split('/')[1];
  return LANG_CODES.includes(first) ? (first as Language) : null;
}

/**
 * `i18n.language` có thể là `en-US`, và `/en-US/blog` thì không khớp route nào.
 * Chuẩn hoá tại đây một lần thay vì bắt từng chỗ gọi tự nhớ cắt đuôi vùng.
 */
function normalize(lang: string): Language {
  const base = (lang || '').split('-')[0];
  return (LANG_CODES.includes(base) ? base : 'en') as Language;
}

export function blogListPath(lang: string): string {
  return `/${normalize(lang)}/blog`;
}

export function blogPostPath(slug: string, lang: string): string {
  return `/${normalize(lang)}/blog/${slug}`;
}

/**
 * Cùng trang đó ở ngôn ngữ khác, hoặc chính nó nếu trang không có bản dịch
 * theo URL. Chỉ blog mới có: đổi ngôn ngữ ở `/teachers` thì URL không đổi.
 */
export function withLang(pathname: string, lang: string): string {
  const current = langFromPath(pathname);
  const rest = current ? pathname.slice(current.length + 1) : pathname;
  if (rest !== '/blog' && !rest.startsWith('/blog/')) return pathname;
  return `/${normalize(lang)}${rest}`;
}
