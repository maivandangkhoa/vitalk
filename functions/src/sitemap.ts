import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import {
  DEFAULT_LANG,
  LANGS,
  Lang,
  MultiLang,
  SITE_ORIGIN,
  availableLangs,
  blogUrl,
  escapeXml,
} from "./blogSeo";

/**
 * sitemap.xml — danh mục URL nộp cho bộ máy tìm kiếm.
 *
 * Không có nó thì năm bản dịch của mỗi bài gần như không được crawl: link nội
 * bộ do JS sinh ra, và các URL có tiền tố ngôn ngữ chỉ xuất hiện trong thẻ
 * hreflang chứ không ở đâu khác. Sinh động thay vì tạo file lúc build để bài
 * mới đăng là có mặt ngay, không phải chờ lần deploy kế tiếp.
 *
 * Chỉ khai URL đúng chuẩn: bản dịch có thật (xem `availableLangs`), và không
 * có URL trần `/blog/<slug>` — URL đó đã nhường canonical cho bản mặc định.
 */

/** Trang tĩnh chỉ có một bản, ngôn ngữ do máy người đọc quyết định như cũ. */
const STATIC_PATHS = ["/", "/teachers", "/lessons", "/reviews", "/policy"];

interface PostDoc {
  slug: string;
  title?: MultiLang;
  content?: MultiLang;
  publishedAt?: { toDate?: () => Date };
  updatedAt?: { toDate?: () => Date };
}

function alternateXml(slug: string, langs: readonly Lang[]): string {
  const fallback = langs.includes(DEFAULT_LANG) ? DEFAULT_LANG : langs[0];
  return [
    ...langs.map(
      (l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${escapeXml(blogUrl(l, slug))}"/>`
    ),
    `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(blogUrl(fallback, slug))}"/>`,
  ].join("");
}

function urlEntry(loc: string, lastmod: string, alternates = ""): string {
  return `<url><loc>${escapeXml(loc)}</loc>${
    lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
  }${alternates}</url>`;
}

function isoDay(value: { toDate?: () => Date } | undefined): string {
  const date = value?.toDate?.();
  return date ? date.toISOString().slice(0, 10) : "";
}

async function listPosts(): Promise<PostDoc[]> {
  const snapshot = await admin
    .firestore()
    .collection("blogPosts")
    .where("isPublished", "==", true)
    .limit(1000)
    .get();
  return snapshot.docs.map((doc) => doc.data() as PostDoc);
}

export const sitemap = onRequest(
  { invoker: "public", memory: "256MiB", maxInstances: 5, timeoutSeconds: 60 },
  async (_req, res) => {
    let entries: string[];
    try {
      const posts = await listPosts();
      const listAlternates = alternateXml("", LANGS);

      entries = [
        ...STATIC_PATHS.map((path) => urlEntry(`${SITE_ORIGIN}${path}`, "")),
        ...LANGS.map((lang) => urlEntry(blogUrl(lang, ""), "", listAlternates)),
        ...posts.flatMap((post) => {
          if (!post.slug) return [];
          const langs = availableLangs(post);
          const lastmod = isoDay(post.updatedAt) || isoDay(post.publishedAt);
          const alternates = alternateXml(post.slug, langs);
          return langs.map((lang) => urlEntry(blogUrl(lang, post.slug), lastmod, alternates));
        }),
      ];
    } catch (error) {
      // Sitemap rỗng còn hơn 500: bộ máy tìm kiếm gặp lỗi sẽ hạ tần suất ghé lại.
      logger.error("sitemap: falling back to static paths", error);
      entries = STATIC_PATHS.map((path) => urlEntry(`${SITE_ORIGIN}${path}`, ""));
    }

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
        `xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`
    );
  }
);
