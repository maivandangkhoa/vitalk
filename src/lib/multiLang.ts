import { isRichTextEmpty } from '@/lib/richText';
import type { Language, MultiLangText } from '@/types/common';

/**
 * Fallback order once the requested language has no content:
 * English first, then Vietnamese, then whatever else was filled in.
 */
const FALLBACK_ORDER: Language[] = ['en', 'vi', 'ko', 'zh', 'ja'];

/**
 * Read a multilingual field for `lang`, falling back down FALLBACK_ORDER
 * so a half-translated field still shows something instead of disappearing.
 * Returns '' only when every language is empty.
 */
export function pickLang(
  text: Partial<MultiLangText> | undefined | null,
  lang: string,
  /** Override for a content area with its own preference (blog prefers `ko`). */
  fallbackOrder: Language[] = FALLBACK_ORDER,
): string {
  if (!text) return '';
  // i18n.language can carry a region suffix ("en-US"); the data never does.
  const requested = (lang || '').split('-')[0] as Language;
  for (const code of [requested, ...fallbackOrder]) {
    const value = text[code];
    // isRichTextEmpty, not a bare trim: an empty Tiptap field is '<p></p>'.
    if (value && !isRichTextEmpty(value)) return value;
  }
  return '';
}
