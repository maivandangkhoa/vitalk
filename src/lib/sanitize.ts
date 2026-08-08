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

let teacherPurifier: typeof DOMPurify | null = null;

function getTeacherPurifier(): typeof DOMPurify {
  if (teacherPurifier) return teacherPurifier;
  // A private instance: the hook below must not leak into sanitizeHtml().
  const instance = DOMPurify();
  instance.addHook('afterSanitizeAttributes', (node) => {
    // DOMPurify always permits data: URIs on <img> (its DATA_URI_TAGS set can
    // be added to but not trimmed), so ALLOWED_URI_REGEXP alone won't stop a
    // pasted base64 blob from landing in the Firestore doc.
    if (node.nodeName === 'IMG' && !/^https:\/\//i.test(node.getAttribute('src') || '')) {
      node.removeAttribute('src');
    }
  });
  teacherPurifier = instance;
  return instance;
}

/**
 * Sanitize teacher-authored rich text (bio, teaching style). Teachers can write
 * their own `teachers/{id}` doc, so this is a lower trust tier than the blog:
 * an allowlist, not a blocklist — anything not named here is dropped.
 */
export function sanitizeTeacherHtml(html: string): string {
  return getTeacherPurifier().sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'img'],
    ALLOWED_ATTR: ['src', 'alt', 'loading'],
    // Custom ALLOWED_URI_REGEXP makes DOMPurify URI-check every attribute that
    // isn't already marked URI-safe, which would eat loading="lazy".
    ADD_URI_SAFE_ATTR: ['loading'],
    ALLOWED_URI_REGEXP: /^https:\/\//i,
  });
}
