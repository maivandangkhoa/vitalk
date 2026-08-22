/**
 * Phần dùng chung của SEO blog: `ogBlog.ts` (từng trang) và `sitemap.ts`.
 *
 * Mỗi bản dịch một URL — `/ko/blog/<slug>`. Một URL cho cả năm bản thì với
 * Google đó là MỘT trang: nó chọn một bản dịch để index và bốn bản còn lại coi
 * như không tồn tại. Đối chiếu `src/lib/localeRoutes.ts` ở phía client.
 */

export const SITE_ORIGIN = "https://havitalk.com";

/**
 * Thứ tự dự phòng khi bài thiếu bản dịch — khớp `BLOG_FALLBACK` trong
 * `src/lib/blog.ts`. `ko` đứng đầu vì kho bài gốc là tiếng Hàn.
 */
export const LANGS = ["ko", "en", "vi", "zh", "ja"] as const;
export type Lang = (typeof LANGS)[number];

/** Bản mặc định của một bài: đích của x-default, và canonical của URL trần. */
export const DEFAULT_LANG: Lang = "ko";

export const OG_LOCALES: Record<Lang, string> = {
  ko: "ko_KR",
  en: "en_US",
  vi: "vi_VN",
  zh: "zh_CN",
  ja: "ja_JP",
};

export type MultiLang = Partial<Record<Lang, string>>;

function isLang(value: string | undefined): value is Lang {
  return (LANGS as readonly string[]).includes(value ?? "");
}

/** Mirrors isRichTextEmpty in src/lib/richText.ts: Tiptap writes `<p></p>`. */
export function isEmpty(value: string | undefined): boolean {
  if (!value) return true;
  return !value.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
}

/**
 * Bản dịch cần đọc, ưu tiên ngôn ngữ URL yêu cầu rồi mới đến thứ tự dự phòng.
 *
 * Bài thiếu bản dịch nào thì URL của bản đó rơi về bản khác — thà đọc được
 * bằng thứ tiếng gần nhất còn hơn một trang trống, và `sitemap.ts` cũng không
 * khai báo những URL rỗng như thế.
 */
export function pickLang(text: MultiLang | undefined, preferred: Lang | null): string {
  if (!text) return "";
  const order = preferred ? [preferred, ...LANGS.filter((l) => l !== preferred)] : [...LANGS];
  for (const code of order) {
    if (!isEmpty(text[code])) return text[code] as string;
  }
  return "";
}

/**
 * Những ngôn ngữ bài này THẬT SỰ có, không tính bản rơi về ngôn ngữ khác.
 *
 * Bài chỉ có tiếng Hàn thì `/ja/blog/<slug>` vẫn mở được — nó rơi về tiếng Hàn
 * cho người đọc — nhưng không được khai vào hreflang hay sitemap, và canonical
 * của nó phải trỏ về bản thật. Khai một URL rơi-về-bản-khác là tự tay dựng ra
 * đúng thứ trùng lặp mà tiền tố ngôn ngữ sinh ra để dẹp.
 */
export function availableLangs(post: { title?: MultiLang; content?: MultiLang }): Lang[] {
  const langs = LANGS.filter((l) => !isEmpty(post.title?.[l]) && !isEmpty(post.content?.[l]));
  return langs.length ? langs : [DEFAULT_LANG];
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // Percent-encoding hỏng — nhiều khả năng là một link cũ bị cắt xén.
    return segment;
  }
}

export interface BlogPath {
  /** `null` khi URL không có tiền tố ngôn ngữ — link đã chia sẻ trước đây. */
  lang: Lang | null;
  /** Rỗng nghĩa là trang danh sách. */
  slug: string;
}

/** `/ko/blog/xin-chao` → `{ lang: 'ko', slug: 'xin-chao' }`. `null` nếu không phải blog. */
export function parseBlogPath(path: string): BlogPath | null {
  const parts = path.split("/").filter(Boolean).map(decodeSegment);
  const lang = isLang(parts[0]) ? (parts.shift() as Lang) : null;
  if (parts[0] !== "blog" || parts.length > 2) return null;
  return { lang, slug: parts[1] ?? "" };
}

export function blogPath(lang: Lang, slug: string): string {
  return slug ? `/${lang}/blog/${encodeURIComponent(slug)}` : `/${lang}/blog`;
}

export function blogUrl(lang: Lang, slug: string): string {
  return `${SITE_ORIGIN}${blogPath(lang, slug)}`;
}

/**
 * Cụm hreflang: năm bản dịch cộng x-default.
 *
 * Phải khai báo đủ hai chiều — mỗi URL liệt kê cả năm, kể cả chính nó. Thiếu
 * chiều ngược lại thì Google bỏ qua cả cụm chứ không dùng một nửa.
 */
export function alternateLinks(slug: string, langs: readonly Lang[] = LANGS): string[] {
  const fallback = langs.includes(DEFAULT_LANG) ? DEFAULT_LANG : langs[0];
  return [
    ...langs.map((l) => `<link rel="alternate" hreflang="${l}" href="${blogUrl(l, slug)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${blogUrl(fallback, slug)}" />`,
  ];
}

/** Escape cho một thuộc tính HTML. Tiêu đề bài có `&` và dấu nháy thật. */
export function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeXml(value: string): string {
  return attr(value).replace(/'/g, "&apos;");
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

const MAX_DESCRIPTION = 200;

/** Rich-text HTML → một dòng văn xuôi, đủ ngắn cho card preview. */
export function toDescription(html: string): string {
  const text = html
    .replace(/<\/(p|li|ul|ol|div|h[1-6])>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= MAX_DESCRIPTION) return text;
  return `${text.slice(0, MAX_DESCRIPTION).replace(/\s+\S*$/, "")}…`;
}

/* ── Lọc HTML trước khi chèn vào shell ─────────────────────────────────────
 * Nội dung bài do admin soạn và client đã lọc qua DOMPurify trước khi hiện.
 * Bản chèn sẵn vào HTML không đi qua đường đó, nên phải tự lọc: React chỉ xoá
 * nó khi mount xong, mà một thẻ `<script>` thì chạy ngay từ lúc trình duyệt
 * đọc tới. Ở đây dùng danh sách cho phép, không dùng danh sách cấm.
 *
 * Mục tiêu là "không còn gì chạy được", không phải dựng lại y nguyên bài viết:
 * iframe YouTube bị bóc khỏi bản chèn sẵn (React gắn lại sau khi mount), và
 * giá trị thuộc tính có dấu `>` sẽ để lại một mẩu chữ thừa. Tiptap không bao
 * giờ sinh ra dấu `>` chưa escape trong thuộc tính, nên đổi lấy một bộ phân
 * tích HTML đầy đủ là không đáng.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "mark", "small", "sub", "sup",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "pre", "code",
  "a", "img", "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
]);

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href"],
  img: ["src", "alt"],
};

/** Thẻ có nội dung nguy hiểm: xoá cả phần bên trong, không chỉ cặp thẻ. */
const DANGEROUS_BLOCKS = /<(script|style|iframe|object|embed|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi;

const SAFE_URL = /^(https?:\/\/|\/|#|mailto:)/i;

function keepAttrs(tag: string, raw: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";
  const kept: string[] = [];
  const pattern = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const [, name, value] = match;
    if (!allowed.includes(name.toLowerCase())) continue;
    if ((name === "href" || name === "src") && !SAFE_URL.test(value.trim())) continue;
    kept.push(`${name}="${attr(value)}"`);
  }
  return kept.length ? ` ${kept.join(" ")}` : "";
}

export function sanitizeForShell(html: string): string {
  return html
    .replace(DANGEROUS_BLOCKS, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_full, closing: string, rawName: string, rawAttrs: string) => {
      const tag = rawName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      return closing ? `</${tag}>` : `<${tag}${keepAttrs(tag, rawAttrs)}>`;
    });
}
