import { useMemo } from 'react';
import { sanitizeTeacherHtml } from '@/lib/sanitize';
import { toRichHtml, IMAGE_DISPLAY_CLASSES } from '@/lib/richText';

/**
 * Render a teacher-authored bio / teaching style. The author is only a teacher,
 * not an admin, so the HTML goes through the allowlist sanitizer on every read
 * — never render these fields with dangerouslySetInnerHTML directly.
 */
export function TeacherRichText({ html, className = '' }: { html: string; className?: string }) {
  const safeHtml = useMemo(() => sanitizeTeacherHtml(toRichHtml(html)), [html]);

  return (
    <div
      className={`prose prose-zinc max-w-none
        prose-p:leading-relaxed prose-p:text-muted-foreground
        prose-strong:text-foreground
        prose-ul:my-4 prose-ol:my-4 prose-li:my-1.5 prose-li:text-muted-foreground
        prose-li:marker:text-indigo-400
        prose-img:rounded-xl ${IMAGE_DISPLAY_CLASSES} ${className}`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
