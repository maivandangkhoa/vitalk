import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { gatewayChat, readTag } from "./fechtinGateway";

interface TranslateRequest {
  title: string;
  excerpt: string;
  content: string;
  sourceLang?: string;
  /** Ngôn ngữ đích người viết chọn; bỏ trống là dịch hết phần còn lại. */
  targets?: string[];
}

const LANG_NAMES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
  ko: "Korean",
  // Blog có tab 中文 nhưng hàm này từng bỏ sót nó, nên bấm dịch xong tab đó vẫn
  // trống mà không báo gì.
  zh: "Chinese (Simplified)",
  ja: "Japanese",
};

const ALL_LANGS = Object.keys(LANG_NAMES);

/**
 * Dịch bằng `claude-sonnet`, không phải `claude-opus`.
 *
 * Bài đã được Opus viết ra rồi; dịch là việc bám sát bản gốc chứ không phải
 * việc sáng tác, và cả hai lane dùng chung hạn mức subscription theo cửa sổ 5
 * giờ. Đốt Opus cho bốn bản dịch song song là cách chắc chắn để hết lượt đúng
 * lúc muốn viết bài tiếp theo.
 */
const MODEL = "claude-sonnet";

type LangMap = Record<string, string>;

interface TranslateResult {
  title: LangMap;
  excerpt: LangMap;
  content: LangMap;
}

/**
 * Dịch một bài blog sang những thứ tiếng người viết chọn, qua Fechtin AI
 * Gateway. Chỉ admin gọi được.
 *
 * Trước đây hàm này gọi thẳng Anthropic API bằng `ANTHROPIC_API_KEY`. Key đó
 * đã chết (`invalid x-api-key`, đo 2026-08-12) nên nút dịch hỏng âm thầm; giờ
 * đi chung một đường với trợ lý viết bài, dùng đúng một key `havitalk` của
 * gateway.
 */
export const translateBlogPost = onCall(
  {
    secrets: ["FECHTIN_GATEWAY_KEY"],
    timeoutSeconds: 540,
    memory: "512MiB",
    cors: true,
    invoker: "public",
  },
  async (request): Promise<TranslateResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }
    const userDoc = await admin.firestore().doc(`users/${request.auth.uid}`).get();
    if (userDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only");
    }

    const {
      title,
      excerpt,
      content,
      sourceLang = "en",
      targets,
    } = request.data as TranslateRequest;
    if (!title || !content) {
      throw new HttpsError("invalid-argument", "title and content are required");
    }

    const key = process.env.FECHTIN_GATEWAY_KEY?.trim();
    if (!key) {
      throw new HttpsError(
        "failed-precondition",
        "FECHTIN_GATEWAY_KEY chưa được cấu hình"
      );
    }

    const wanted = Array.isArray(targets) && targets.length ? targets : ALL_LANGS;
    const targetLangs = wanted.filter(
      (l) => l !== sourceLang && ALL_LANGS.includes(l)
    );
    if (!targetLangs.length) {
      throw new HttpsError("invalid-argument", "Không có ngôn ngữ đích nào hợp lệ");
    }

    /**
     * MỘT lượt gọi cho MỘT ngôn ngữ, không gộp tất cả vào một lượt.
     *
     * Gộp thì câu trả lời phải chứa cả bốn bản dịch của một bài có thể dài 30k
     * ký tự — chạm trần token, bị cắt giữa chừng, và người viết mất trắng cả
     * lượt. Tách ra thì một ngôn ngữ hỏng không kéo theo ba ngôn ngữ kia.
     */
    const translateTo = async (lang: string) => {
      const target = LANG_NAMES[lang];
      const prompt = `You are a professional translator for a Vietnamese language learning blog.
The blog is written by a Vietnamese teacher based in Seoul who teaches Vietnamese to foreigners.

Translate the post below from ${LANG_NAMES[sourceLang] || sourceLang} into ${target}.

Rules:
- Keep the teacher's warm first-person voice. This is a blog post, not a manual.
- Vietnamese example words and sentences inside the post STAY IN VIETNAMESE, with every
  diacritic intact. Translate only the explanation around them.
- Preserve the HTML exactly: same tags, same order, same nesting. Translate only the text
  between the tags. Do not add, drop or rename a single tag.
- Natural ${target}, the way a native teacher would write it — not a literal gloss.

Answer with exactly these three tags and nothing else:
<title>the translated title</title>
<excerpt>the translated excerpt</excerpt>
<content>the translated HTML</content>

---
TITLE: ${title}

EXCERPT: ${excerpt || ""}

CONTENT:
${content}`;

      const { text, model } = await gatewayChat({
        key,
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
      });

      const translated = {
        lang,
        title: readTag(text, "title"),
        excerpt: readTag(text, "excerpt"),
        content: readTag(text, "content"),
        model,
      };
      // Thiếu <content> nghĩa là model trả về thứ gì đó khác envelope. Ném ra
      // để `allSettled` bỏ riêng ngôn ngữ này, thay vì ghi một tab rỗng đè lên
      // bản dịch cũ.
      if (!translated.content) {
        throw new Error(`Bản dịch ${lang} không có <content>`);
      }
      return translated;
    };

    const settled = await Promise.allSettled(targetLangs.map(translateTo));
    const done = settled
      .filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof translateTo>>> =>
          r.status === "fulfilled"
      )
      .map((r) => r.value);

    if (!done.length) {
      const first = settled.find((r) => r.status === "rejected");
      const reason = (first as PromiseRejectedResult | undefined)?.reason;
      throw reason instanceof HttpsError
        ? reason
        : new HttpsError(
            "internal",
            reason instanceof Error ? reason.message : "Translation failed"
          );
    }

    logger.info("translateBlogPost", {
      sourceLang,
      asked: targetLangs,
      done: done.map((d) => d.lang),
      model: done[0]?.model,
    });

    // Chỉ trả ngôn ngữ nguồn + ngôn ngữ vừa dịch được. Trả cả khóa rỗng cho
    // những thứ tiếng không được chọn thì phía client merge vào là XOÁ SẠCH bản
    // dịch cũ của chúng.
    const result: TranslateResult = {
      title: { [sourceLang]: title },
      excerpt: { [sourceLang]: excerpt || "" },
      content: { [sourceLang]: content },
    };
    for (const t of done) {
      result.title[t.lang] = t.title;
      result.excerpt[t.lang] = t.excerpt;
      result.content[t.lang] = t.content;
    }
    return result;
  }
);
