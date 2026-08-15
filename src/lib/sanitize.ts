import DOMPurify from 'dompurify';

/** The only iframe src an article is allowed to carry: a YouTube player. */
const YOUTUBE_EMBED = /^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[\w-]+/i;

let contentPurifier: typeof DOMPurify | null = null;

function getContentPurifier(): typeof DOMPurify {
  if (contentPurifier) return contentPurifier;
  const instance = DOMPurify();
  instance.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName !== 'IFRAME') return;
    // iframes are allowed as a tag so YouTube embeds survive; everything that
    // isn't a YouTube player goes, frame and all.
    if (!YOUTUBE_EMBED.test(node.getAttribute('src') || '')) {
      node.remove();
      return;
    }
    // Tiptap serializes its player options onto the iframe. Pin the attributes
    // that matter instead of trusting whatever ended up in the stored HTML.
    node.setAttribute('loading', 'lazy');
    node.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    node.setAttribute('allowfullscreen', '');
    node.setAttribute(
      'allow',
      'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
    );
  });
  contentPurifier = instance;
  return instance;
}

/**
 * Sanitize admin-authored rich-text HTML (blog posts, policy page) before
 * rendering it with dangerouslySetInnerHTML. Defense-in-depth: the source is
 * admin-only, but this blocks stored XSS if an admin account is ever abused.
 */
export function sanitizeHtml(html: string): string {
  return getContentPurifier().sanitize(html, {
    // Force links to open safely and strip javascript:/data: URIs.
    // The iframe attrs are not in DOMPurify's default set; the hook above is
    // what keeps the tag itself from being a hole.
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['target', 'rel', 'allow', 'allowfullscreen', 'frameborder', 'referrerpolicy'],
    FORBID_TAGS: ['script', 'style', 'object', 'embed', 'form'],
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
