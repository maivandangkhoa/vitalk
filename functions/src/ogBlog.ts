import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import {
  DEFAULT_LANG,
  LANGS,
  Lang,
  MultiLang,
  SITE_ORIGIN,
  alternateLinks,
  attr,
  availableLangs,
  blogPath,
  blogUrl,
  parseBlogPath,
  pickLang,
  sanitizeForShell,
  toDescription,
} from "./blogSeo";

/**
 * Server-side cho /blog: thẻ preview, canonical/hreflang, và nội dung bài.
 *
 * App là SPA render ở client, nên `index.html` chỉ có một bộ thẻ Open Graph
 * dùng chung cho cả trang. Crawler — KakaoTalk, Facebook, Zalo — không chạy
 * bundle, nên mọi bài chia sẻ ra đều hiện chung một banner. Hosting đẩy
 * /blog/... qua đây để điền thẻ trước khi HTML rời máy chủ.
 *
 * Từ khi blog có URL riêng cho từng ngôn ngữ (`/ko/blog/<slug>`), hàm này còn
 * chèn sẵn phần chữ ĐÃ DỊCH vào shell. Không có nó thì Googlebot phải tự chạy
 * JS mới thấy nội dung, mà lúc nó chạy thì ngôn ngữ lại do máy nó đoán — cả
 * năm URL cùng ra một thứ tiếng, Google thấy trùng nhau rồi gộp lại còn một,
 * đúng cái mà tiền tố ngôn ngữ sinh ra để tránh.
 *
 * Mọi thứ bên dưới đều rơi về shell nguyên bản khi hỏng: một cái preview không
 * đáng để đánh đổi lấy việc người đọc không mở được bài.
 */

/**
 * Shell đọc ngược từ Hosting chứ không đóng gói kèm, vì hosting và functions
 * deploy tách nhau — bản đóng gói sẽ mãi trỏ vào hash asset của lần build nào
 * đó khi function được deploy lần cuối. `/index.html` là file tĩnh thật nên
 * được phục vụ trực tiếp, không vòng lại qua rewrite này.
 */
const SHELL_URL = `${SITE_ORIGIN}/index.html`;
const SHELL_TTL_MS = 60_000;

let shell: { html: string; fetchedAt: number } | null = null;

async function loadShell(): Promise<string> {
  if (shell && Date.now() - shell.fetchedAt < SHELL_TTL_MS) return shell.html;
  try {
    const response = await fetch(SHELL_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    shell = { html, fetchedAt: Date.now() };
    return html;
  } catch (error) {
    // Any cached copy beats none: a stale shell renders, a 503 does not.
    if (!shell) throw error;
    logger.warn("blogMeta: serving stale shell", error);
    return shell.html;
  }
}

/** The region index.html reserves for us. */
const META_BLOCK = /<!-- og:start -->[\s\S]*?<!-- og:end -->/;
const ROOT_DIV = '<div id="root"></div>';

interface PageMeta {
  title: string;
  description: string;
  image: string;
  /** Rỗng cho trang danh sách. */
  slug: string;
  /** `null` cho URL trần: trang tự nhường canonical cho bản có ngôn ngữ. */
  lang: Lang | null;
  /** Các ngôn ngữ bài này thật sự có, để khai hreflang. */
  langs: Lang[];
  publishedAt?: string;
}

function renderMeta({ title, description, image, slug, lang, langs, publishedAt }: PageMeta): string {
  /*
   * URL trần (link đã chia sẻ từ trước) không tự đứng thành một trang được
   * index: canonical của nó trỏ về bản mặc định. Cũng vì thế mà nó không khai
   * hreflang — Google bỏ qua hreflang trên trang đã nhường canonical cho trang
   * khác, khai vào chỉ thêm tín hiệu mâu thuẫn.
   */
  const canonical = blogUrl(lang ?? langs[0], slug);
  const tags = [
    `<title>${attr(title)} — HaviTalk</title>`,
    `<meta name="description" content="${attr(description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    ...(lang ? alternateLinks(slug, langs) : []),
    `<meta property="og:type" content="${slug ? "article" : "website"}" />`,
    `<meta property="og:site_name" content="HaviTalk" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    `<meta property="og:image" content="${attr(image)}" />`,
    `<meta property="og:image:secure_url" content="${attr(image)}" />`,
    `<meta property="og:image:alt" content="${attr(title)}" />`,
    publishedAt ? `<meta property="article:published_time" content="${publishedAt}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${attr(title)}" />`,
    `<meta name="twitter:description" content="${attr(description)}" />`,
    `<meta name="twitter:image" content="${attr(image)}" />`,
    `<meta name="twitter:image:alt" content="${attr(title)}" />`,
  ];
  // No og:image:width/height: the covers are uploaded at whatever aspect ratio
  // they came in at, and a wrong pair of dimensions crops the preview.
  return `<!-- og:start -->\n    ${tags.filter(Boolean).join("\n    ")}\n    <!-- og:end -->`;
}

/*
 * Nội dung chèn sẵn chỉ sống đến khi React mount rồi bị thay — nhưng trong vài
 * trăm mili giây đó nó vẫn hiện ra, nên phải đọc được chứ không thể là chữ trần
 * dính sát lề. Vừa đủ để trông như trang đang tải, không cố bắt chước bản thật:
 * làm thế thì mỗi lần đổi giao diện lại phải sửa hai nơi.
 */
const SHELL_STYLE = `<style>
      .ssr{max-width:44rem;margin:0 auto;padding:3.5rem 1.25rem;color:#27272a;
        font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.75}
      .ssr h1{font-size:1.9rem;line-height:1.25;margin:0 0 .75rem;letter-spacing:-.02em}
      .ssr img{max-width:100%;height:auto;border-radius:1rem}
      .ssr a{color:#4f46e5}
      .ssr .lede{font-size:1.1rem;color:#52525b}
    </style>`;

function inShell(html: string): string {
  return `<div id="root">${SHELL_STYLE}<div class="ssr">${html}</div></div>`;
}

interface PostDoc {
  slug: string;
  title?: MultiLang;
  excerpt?: MultiLang;
  content?: MultiLang;
  coverImageUrl?: string;
  publishedAt?: { toDate?: () => Date };
}

function renderArticle(post: PostDoc, lang: Lang, title: string, excerpt: string): string {
  const cover = post.coverImageUrl
    ? `<img src="${attr(post.coverImageUrl)}" alt="${attr(title)}" />`
    : "";
  return inShell(
    `<article>
        <h1>${attr(title)}</h1>
        ${excerpt ? `<p class="lede">${attr(excerpt)}</p>` : ""}
        ${cover}
        ${sanitizeForShell(pickLang(post.content, lang))}
      </article>
      <p><a href="${blogPath(lang, "")}">HaviTalk Blog</a></p>`
  );
}

/**
 * Trang danh sách chèn sẵn link tới từng bài của đúng ngôn ngữ đó — đây là
 * đường để crawler đi tới cả năm bản dịch mà không phải chạy JS.
 */
function renderIndex(posts: PostDoc[], lang: Lang, heading: string): string {
  const items = posts
    .map((post) => {
      const title = pickLang(post.title, lang);
      return title ? `<li><a href="${blogPath(lang, post.slug)}">${attr(title)}</a></li>` : "";
    })
    .filter(Boolean)
    .join("\n        ");
  return inShell(`<h1>${attr(heading)}</h1>\n      <ul>\n        ${items}\n      </ul>`);
}

async function findPost(slug: string): Promise<PostDoc | null> {
  const snapshot = await admin
    .firestore()
    .collection("blogPosts")
    .where("slug", "==", slug)
    .where("isPublished", "==", true)
    .limit(1)
    .get();
  return snapshot.empty ? null : (snapshot.docs[0].data() as PostDoc);
}

/** Không `orderBy`: ghép với `where` là phải có composite index, mà ở đây thứ tự không đáng để đổi. */
async function listPosts(): Promise<PostDoc[]> {
  const snapshot = await admin
    .firestore()
    .collection("blogPosts")
    .where("isPublished", "==", true)
    .limit(200)
    .get();
  return snapshot.docs.map((doc) => doc.data() as PostDoc);
}

const BLOG_HEADING: Record<Lang, string> = {
  ko: "HaviTalk 블로그",
  en: "HaviTalk Blog",
  vi: "Blog HaviTalk",
  zh: "HaviTalk 博客",
  ja: "HaviTalk ブログ",
};

/**
 * `<html lang>` phải nói đúng thứ tiếng của phần chữ đang nằm trong trang.
 * Bài chưa có bản dịch thì `/ja/blog/<slug>` hiện nội dung tiếng Hàn — khai nó
 * là `ja` chỉ để khớp với URL là khai sai với cả trình đọc màn hình lẫn Google.
 */
function setHtmlLang(html: string, lang: Lang): string {
  return html.replace('<html lang="en">', `<html lang="${lang}">`);
}

/** Bài viết: thẻ theo ngôn ngữ, và nội dung đã dịch nếu URL có tiền tố. */
async function renderPostPage(html: string, lang: Lang | null, slug: string) {
  const post = await findPost(slug);
  // Slug không tồn tại thì phải nói thẳng là 404: để Google index một trang
  // "không tìm thấy bài viết" trả về 200 còn tệ hơn không index gì.
  if (!post) return { html, status: 404 };

  const title = pickLang(post.title, lang);
  const excerpt = pickLang(post.excerpt, lang);
  const published = post.publishedAt?.toDate?.();

  /*
   * Bài thiếu bản dịch của chính ngôn ngữ đang mở thì trang này là bản rơi về
   * ngôn ngữ khác — nó nhường canonical cho bản thật thay vì đòi được index
   * như một bản dịch riêng.
   */
  const langs = availableLangs(post);
  const canonicalLang = lang && langs.includes(lang) ? lang : null;

  let out = html.replace(META_BLOCK, () =>
    renderMeta({
      title,
      description: toDescription(excerpt || pickLang(post.content, lang)),
      image: post.coverImageUrl || `${SITE_ORIGIN}/og_image.png`,
      slug,
      lang: canonicalLang,
      langs,
      publishedAt: published ? published.toISOString() : "",
    })
  );

  // Chỉ URL có tiền tố mới chèn nội dung: URL trần hiển thị theo ngôn ngữ máy
  // người đọc, chèn sẵn một thứ tiếng vào đó chỉ tạo ra một cú nháy sai ngôn
  // ngữ ngay trước khi React kịp mount.
  if (lang) {
    out = out.replace(ROOT_DIV, () => renderArticle(post, lang, title, excerpt));
    out = setHtmlLang(out, canonicalLang ?? langs[0]);
  }
  return { html: out, status: 200 };
}

async function renderIndexPage(html: string, lang: Lang | null) {
  const heading = BLOG_HEADING[lang ?? DEFAULT_LANG];
  let out = html.replace(META_BLOCK, () =>
    renderMeta({
      title: heading,
      description: toDescription(""),
      image: `${SITE_ORIGIN}/og_image.png`,
      slug: "",
      lang,
      langs: [...LANGS],
    })
  );
  if (lang) {
    const posts = await listPosts();
    out = out.replace(ROOT_DIV, () => renderIndex(posts, lang, heading));
    out = setHtmlLang(out, lang);
  }
  return out;
}

export const blogMeta = onRequest(
  { invoker: "public", memory: "256MiB", maxInstances: 10, timeoutSeconds: 30 },
  async (req, res) => {
    let html: string;
    try {
      html = await loadShell();
    } catch (error) {
      // Hosting cannot serve its own index.html; the site is down regardless.
      logger.error("blogMeta: shell unavailable", error);
      res.status(503).send("Service unavailable");
      return;
    }

    let status = 200;
    try {
      const target = parseBlogPath(req.path);
      if (target) {
        const { lang, slug } = target;
        if (slug) {
          const rendered = await renderPostPage(html, lang, slug);
          html = rendered.html;
          status = rendered.status;
        } else {
          html = await renderIndexPage(html, lang);
        }
      }
    } catch (error) {
      logger.error("blogMeta: falling back to default tags", error);
    }

    res.set("Content-Type", "text/html; charset=utf-8");
    // Matches the `**` header rule in firebase.json: the shell must never be
    // cached, or a deploy leaves clients asking for asset hashes that are gone.
    res.set("Cache-Control", "no-cache");
    res.status(status).send(html);
  }
);
