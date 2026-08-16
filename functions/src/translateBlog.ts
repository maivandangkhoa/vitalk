import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { gatewayChat, readTag } from "./fechtinGateway";
import { MediaMismatchError, prepareForTranslation, restoreMedia } from "./naverHtml";

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

/** Một thứ tiếng dịch hỏng, kèm lý do đọc được. */
interface LangFailure {
  lang: string;
  reason: string;
}

interface TranslateResult {
  title: LangMap;
  excerpt: LangMap;
  content: LangMap;
  /**
   * Ngôn ngữ KHÔNG dịch được. Hàm cố ý trả về thay vì ném lỗi: hỏng một thứ
   * tiếng không nên xoá sổ hai thứ tiếng đã dịch xong trong cùng lượt bấm. Chỗ
   * gọi phải đọc mảng này — mảng rỗng mới là thành công trọn vẹn.
   */
  failed: LangFailure[];
}

/**
 * Bộ tag phải khớp `blogWriterPrompt.ts`: Tiptap chỉ giữ ngần này, thẻ ngoài
 * danh sách bị `setContent` nuốt IM LẶNG cùng với chữ bên trong.
 */
const TAG_RULES = `<p> <h2> <h3> <ul> <ol> <li> <blockquote> <strong> <em> <s> <code> <pre> <hr> <a> <br>`;

/**
 * Đổi `**đậm**` sót lại thành `<strong>`.
 *
 * Prompt đã cấm markdown, nhưng đo thật 2026-08-16: bản 中文 vẫn trả về
 * `**"天空"**`, và thứ đó hiện nguyên dấu sao trên trang vì blog render HTML.
 * Lời dặn trong prompt không phải là bảo đảm, nên có thêm một lớp không phụ
 * thuộc vào model. Cố ý CHỈ bắt cặp `**`: một dấu sao đơn xuất hiện trong chữ
 * bình thường, đụng vào là hỏng bài.
 */
function unmarkBold(html: string): string {
  return html.replace(/\*\*(?=\S)([^*\n]{1,200}?)\*\*/g, "<strong>$1</strong>");
}

function buildPrompt(opts: {
  sourceName: string;
  targetName: string;
  title: string;
  excerpt: string;
  content: string;
  mediaCount: number;
}): string {
  const { sourceName, targetName, title, excerpt, content, mediaCount } = opts;

  /**
   * 37/39 bài không có excerpt ở bất kỳ thứ tiếng nào. Bảo model "dịch" một
   * chuỗi rỗng thì nó trả về rỗng, và thẻ bài ở /blog cùng thẻ OG khi chia sẻ
   * tiếp tục trống. Rỗng thì viết mới, không tốn thêm lượt gọi nào.
   */
  const excerptRule = excerpt.trim()
    ? `<excerpt>: translate the excerpt below.`
    : `<excerpt>: the post has no excerpt yet. WRITE a fresh one in ${targetName} — one or
  two sentences that say what the reader will learn. Not a translation of the title.`;

  const mediaRule = mediaCount
    ? `
PLACEHOLDERS — ${mediaCount} of them
The post contains ${mediaCount} images, each replaced by a marker like [[MEDIA_0]].
Copy every marker through EXACTLY as written, exactly once, in the same order and the
same position in the text. Never translate one, renumber one, drop one, or invent one.
They are put back verbatim after you answer, and a marker that went missing costs the
post an image.`
    : "";

  return `You are a professional translator for a Vietnamese language learning blog.
The blog is written by a Vietnamese teacher based in Seoul who teaches Vietnamese to foreigners.

Translate the post below from ${sourceName} into ${targetName}.

RULES
- Keep the teacher's warm first-person voice. This is a blog post, not a manual.
- Vietnamese example words and sentences inside the post STAY IN VIETNAMESE, with every
  diacritic intact. Translate only the explanation around them. This is a post that
  TEACHES Vietnamese — replacing the examples destroys the point of it.
- Natural ${targetName}, the way a native teacher would write it, not a literal gloss.
- Preserve the HTML: same tags, same order, same nesting. Translate only the text
  between the tags. Do not add, drop or rename a tag.
- Only these tags exist and no others: ${TAG_RULES}
  Never add class, style or id attributes.
- NO MARKDOWN, anywhere. "**bold**" renders on the page as literal asterisks, and a
  leading "## " as literal hashes. Emphasis is <strong>, a heading is <h2>. The source
  has no markdown in it, so there is none to carry over — do not introduce any.
- ${excerptRule}
${mediaRule}

Answer with exactly these three tags and nothing else. No preamble, no markdown fence.
<title>the translated title</title>
<excerpt>the excerpt in ${targetName}</excerpt>
<content>the translated HTML</content>

---
TITLE: ${title}

EXCERPT: ${excerpt || "(none — write one)"}

CONTENT:
${content}`;
}

/**
 * Dịch một bài blog sang những thứ tiếng người viết chọn, qua Fechtin AI
 * Gateway. Chỉ admin gọi được.
 *
 * Nguồn được bóc rác trình soạn thảo Naver và tách hết ảnh ra trước khi gửi đi
 * (`naverHtml.ts`) — xem file đó để biết vì sao đó là điều kiện để hàm này chạy
 * nổi, chứ không phải một bước làm đẹp.
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

    // Bóc rác + nhấc ảnh ra MỘT LẦN, dùng chung cho mọi ngôn ngữ đích: cùng một
    // bản nguồn thì cùng một danh sách ảnh, và mọi bản dịch ghép lại từ đúng
    // danh sách đó.
    const source = prepareForTranslation(content);

    /**
     * MỘT lượt gọi cho MỘT ngôn ngữ, không gộp tất cả vào một lượt.
     *
     * Gộp thì câu trả lời phải chứa cả bốn bản dịch của một bài — chạm trần
     * token, bị cắt giữa chừng, và người viết mất trắng cả lượt. Tách ra thì một
     * ngôn ngữ hỏng không kéo theo ba ngôn ngữ kia.
     */
    const translateTo = async (lang: string) => {
      const prompt = buildPrompt({
        sourceName: LANG_NAMES[sourceLang] || sourceLang,
        targetName: LANG_NAMES[lang],
        title,
        excerpt: excerpt || "",
        content: source.html,
        mediaCount: source.media.length,
      });

      const { text, model } = await gatewayChat({
        key,
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
      });

      const body = readTag(text, "content");
      // Thiếu <content> nghĩa là model trả về thứ gì đó khác envelope. Ném ra
      // để `allSettled` bỏ riêng ngôn ngữ này, thay vì ghi một tab rỗng đè lên
      // bản dịch cũ.
      if (!body) {
        throw new Error("Câu trả lời không có thẻ <content>");
      }

      return {
        lang,
        title: readTag(text, "title"),
        excerpt: readTag(text, "excerpt"),
        // Ném lỗi nếu model làm mất hoặc lặp một chỗ giữ chỗ. Thà mất bản dịch
        // của một thứ tiếng còn hơn lưu một bài thiếu ảnh mà không ai biết.
        // `unmarkBold` chạy TRƯỚC khi ghép ảnh vào: nó chỉ được phép sửa chữ do
        // model viết ra, không được chạm tới thẻ ảnh nguyên bản.
        content: restoreMedia(unmarkBold(body), source.media),
        model,
      };
    };

    /**
     * Thử lại ĐÚNG MỘT lần, và chỉ khi model làm hỏng bộ chỗ giữ chỗ.
     *
     * Loại hỏng đó theo xác suất — cùng bài, cùng prompt, lượt trước giữ đủ mà
     * lượt sau làm mất. Mọi lỗi khác (hết hạn mức, sai cấu hình, thiếu thẻ
     * <content>) thử lại chỉ tốn thêm một lượt gọi mà kết quả y hệt, nên để
     * chúng hỏng luôn.
     */
    const translateWithRetry = async (lang: string) => {
      try {
        return await translateTo(lang);
      } catch (err) {
        if (!(err instanceof MediaMismatchError)) throw err;
        logger.warn("translateBlogPost: thử lại vì lệch media", {
          lang,
          reason: err.message,
        });
        return translateTo(lang);
      }
    };

    const settled = await Promise.allSettled(targetLangs.map(translateWithRetry));

    // Chỉ trả ngôn ngữ nguồn + ngôn ngữ vừa dịch được. Trả cả khóa rỗng cho
    // những thứ tiếng không được chọn thì phía client merge vào là XOÁ SẠCH bản
    // dịch cũ của chúng.
    //
    // `content` của ngôn ngữ nguồn trả về NGUYÊN VĂN như lúc nhận, không phải
    // bản đã bóc rác: bản `ko` đã lưu phải giữ nguyên byte để
    // `source.contentHash` của nút "Đồng bộ Naver" còn so sánh được.
    const result: TranslateResult = {
      title: { [sourceLang]: title },
      excerpt: { [sourceLang]: excerpt || "" },
      content: { [sourceLang]: content },
      failed: [],
    };

    settled.forEach((outcome, i) => {
      const lang = targetLangs[i];
      if (outcome.status === "fulfilled") {
        result.title[lang] = outcome.value.title;
        result.excerpt[lang] = outcome.value.excerpt;
        result.content[lang] = outcome.value.content;
        return;
      }
      const reason = outcome.reason;
      result.failed.push({
        lang,
        reason: reason instanceof Error ? reason.message : String(reason),
      });
    });

    logger.info("translateBlogPost", {
      sourceLang,
      asked: targetLangs,
      done: targetLangs.filter((l) => !result.failed.some((f) => f.lang === l)),
      failed: result.failed,
      media: source.media.length,
      sentChars: source.html.length,
      rawChars: content.length,
    });

    return result;
  }
);
