import DOMPurify from 'dompurify';

/**
 * Sanitize admin-authored rich-text HTML (blog posts, policy page) before
 * rendering it with dangerouslySetInnerHTML. Defense-in-depth: the source is
 * admin-only, but this blocks stored XSS if an admin account is ever abused.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    // Force links to open safely and strip javascript:/data: URIs.
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  });
}
