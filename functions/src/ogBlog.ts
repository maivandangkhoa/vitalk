import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/**
 * Per-post link previews for /blog/<slug>.
 *
 * The app is a client-rendered SPA, so index.html carries one set of Open
 * Graph tags for the whole site. Crawlers — KakaoTalk, Facebook, Zalo — never
 * run the bundle, which is why every shared post used to preview with the
 * site's generic banner. Hosting rewrites /blog/<slug> here so the tags can be
 * filled in server-side before the HTML leaves.
 *
 * Everything below degrades to the untouched shell: a preview is worth less
 * than the page itself, so no failure here may cost a reader the article.
 */

const SITE_ORIGIN = "https://havitalk.com";

/**
 * The shell is read back from Hosting rather than bundled, because hosting and
 * functions deploy separately — a bundled copy would keep naming the asset
 * hashes of whichever build happened to be current when the function last went
 * out. `/index.html` is a real static file, so it is served directly and does
 * not loop back through this rewrite.
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

/** Blog prefers Korean — mirrors BLOG_FALLBACK in src/lib/blog.ts. */
const FALLBACK_ORDER = ["ko", "en", "vi", "zh", "ja"] as const;

type MultiLang = Partial<Record<(typeof FALLBACK_ORDER)[number], string>>;

/** Mirrors isRichTextEmpty in src/lib/richText.ts: Tiptap writes `<p></p>`. */
function isEmpty(value: string | undefined): boolean {
  if (!value) return true;
  return !value.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
}

function pickLang(text: MultiLang | undefined): string {
  if (!text) return "";
  for (const code of FALLBACK_ORDER) {
    if (!isEmpty(text[code])) return text[code] as string;
  }
  return "";
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

/** Rich-text HTML → one line of prose, short enough for a preview card. */
function toDescription(html: string): string {
  const text = html
    .replace(/<\/(p|li|ul|ol|div|h[1-6])>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= MAX_DESCRIPTION) return text;
  return `${text.slice(0, MAX_DESCRIPTION).replace(/\s+\S*$/, "")}…`;
}

/** Escape for an HTML attribute. Post titles do contain `&` and quotes. */
function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface PostMeta {
  title: string;
  description: string;
  image: string;
  url: string;
  publishedAt: string;
}

function renderMeta({ title, description, image, url, publishedAt }: PostMeta): string {
  const tags = [
    `<title>${attr(title)} — HaviTalk</title>`,
    `<meta name="description" content="${attr(description)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="HaviTalk" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
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

/** `/blog/troi-oi` → `troi-oi`. Empty for anything that is not a post URL. */
function slugFrom(path: string): string {
  const raw = path.replace(/^\/blog\/?/, "").replace(/\/+$/, "");
  if (!raw || raw.includes("/")) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding — an old shared link, most likely.
    return raw;
  }
}

async function findPost(slug: string) {
  const snapshot = await admin
    .firestore()
    .collection("blogPosts")
    .where("slug", "==", slug)
    .where("isPublished", "==", true)
    .limit(1)
    .get();
  return snapshot.empty ? null : snapshot.docs[0].data();
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

    try {
      const slug = slugFrom(req.path);
      const post = slug ? await findPost(slug) : null;
      if (post) {
        const title = pickLang(post.title);
        const published = post.publishedAt?.toDate?.();
        // A function replacement, not a string: `$&` in a post title would
        // otherwise splice the matched block back into its own replacement.
        html = html.replace(META_BLOCK, () =>
          renderMeta({
            title,
            description: toDescription(pickLang(post.excerpt) || pickLang(post.content)),
            image: post.coverImageUrl || `${SITE_ORIGIN}/og_image.png`,
            url: `${SITE_ORIGIN}/blog/${encodeURIComponent(slug)}`,
            publishedAt: published ? published.toISOString() : "",
          })
        );
      }
    } catch (error) {
      logger.error("blogMeta: falling back to default tags", error);
    }

    res.set("Content-Type", "text/html; charset=utf-8");
    // Matches the `**` header rule in firebase.json: the shell must never be
    // cached, or a deploy leaves clients asking for asset hashes that are gone.
    res.set("Cache-Control", "no-cache");
    res.status(200).send(html);
  }
);
