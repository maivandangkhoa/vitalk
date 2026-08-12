import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { Language } from '@/types';

/** Chỉ chứa những thứ tiếng hàm trả về, KHÔNG phải đủ 5 khóa. */
export type PartialLangText = Partial<Record<Language, string>>;

export interface TranslatedPost {
  title: PartialLangText;
  excerpt: PartialLangText;
  content: PartialLangText;
}

/**
 * Dịch một bài sang những thứ tiếng người viết chọn.
 *
 * Hàm phía server chỉ trả về ngôn ngữ nguồn cộng những ngôn ngữ dịch được, nên
 * chỗ gọi cứ merge thẳng: thứ tiếng không chọn giữ nguyên bản dịch cũ.
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
  >(functions, 'translateBlogPost');

  const res = await fn({
    title: source.title,
    excerpt: source.excerpt,
    content: source.content,
    sourceLang: source.lang,
    targets,
  });
  return res.data;
}
