/**
 * Helpers for fields that hold rich-text HTML but may still contain older
 * plain-text values (teacher bio / teaching style were plain textareas before).
 */

const HTML_TAG = /<(p|br|ul|ol|li|strong|b|em|i|img)\b[^>]*>/i;

/**
 * Display rules for images inside rich text, keyed by the `data-size` and
 * `data-align` attributes the editor writes (centred when unset). Lives here
 * rather than next to the editor so the public pages can style images without
 * pulling Tiptap into their bundle.
 */
export const IMAGE_DISPLAY_CLASSES = [
  '[&_img]:block [&_img]:mx-auto',
  '[&_img[data-size=sm]]:max-w-[240px] [&_img[data-size=md]]:max-w-[480px]',
  '[&_img[data-align=left]]:ml-0 [&_img[data-align=left]]:mr-auto',
  '[&_img[data-align=right]]:ml-auto [&_img[data-align=right]]:mr-0',
].join(' ');

/** Older rows are plain text with newlines; new ones are Tiptap HTML. */
export function looksLikeHtml(value: string): boolean {
  return HTML_TAG.test(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Return `value` as HTML, converting a legacy plain-text value into paragraphs
 * so its line breaks survive now that the field renders as HTML.
 */
export function toRichHtml(value: string | undefined | null): string {
  if (!value) return '';
  if (looksLikeHtml(value)) return value;
  return value
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Flatten rich text to a single line — for excerpts, where HTML can't render. */
export function richTextToPlain(value: string | undefined | null): string {
  if (!value) return '';
  if (!looksLikeHtml(value)) return value;
  // Block ends become spaces first — textContent would glue "</li><li>" into
  // one word. A DOMParser document has no browsing context, so nothing here
  // loads or runs.
  const spaced = value.replace(/<\/(p|li|ul|ol|div|h[1-6])>|<br\s*\/?>/gi, ' ');
  const doc = new DOMParser().parseFromString(spaced, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * True when a value carries no content. Tiptap serialises an empty editor as
 * `<p></p>`, which is truthy — without this check the language fallback would
 * stop on it and render an empty box.
 */
export function isRichTextEmpty(value: string | undefined | null): boolean {
  if (!value) return true;
  if (/<img\b/i.test(value)) return false;
  return !value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}
