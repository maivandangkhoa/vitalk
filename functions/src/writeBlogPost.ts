import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {
  buildOpeningContext,
  buildSystemPrompt,
  POST_KINDS,
  LANG_NAMES,
  type PostKind,
} from "./blogWriterPrompt";
import { gatewayChat, type GatewayMessage } from "./fechtinGateway";

/**
 * Trợ lý viết bài blog: một lượt chat với Claude Opus qua Fechtin AI Gateway.
 *
 * Đi qua gateway để tiêu hạn mức subscription Claude Code thay vì tiêu tiền
 * theo token, bằng key riêng của HaviTalk (`client: havitalk`) nên hạn mức
 * không lẫn với các app khác cắm vào cùng gateway. `translateBlogPost` đi cùng
 * đường này kể từ khi `ANTHROPIC_API_KEY` chết.
 */

/**
 * Gọi ĐÍCH DANH `claude-opus` chứ không gọi tier `smart`.
 *
 * Gọi tier thì có failover khi lane cạn, nhưng lane thay thế viết ra giọng văn
 * khác hẳn — hai bài liền nhau trên cùng một blog mà lệch giọng thì tệ hơn là
 * một bài phải chờ. Đổi lại, 429 ở đây là 429 thật và phải nói cho người viết
 * biết chứ không nuốt.
 */
const MODEL = "claude-opus";

/** Chặn prompt phình: ý tưởng dán vào + lịch sử chat. */
const MAX_IDEAS = 8_000;
const MAX_MESSAGE = 4_000;
const MAX_TURNS = 24;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface WriteRequest {
  kind?: string;
  lang?: string;
  message?: string;
  history?: ChatTurn[];
  ideas?: string;
  title?: string;
  tags?: string;
}

interface WriteResult {
  /** Nguyên văn envelope thẻ; client tự cắt ra reply/draft. */
  raw: string;
  /** Lane thật đã trả lời, để soi khi bài viết ra dở. */
  model: string;
}

/**
 * Bản nháp cũ trong lịch sử chỉ còn giữ dấu vết, không giữ nguyên văn.
 *
 * Mỗi lượt phải gửi lại toàn bộ hội thoại (shim spawn tiến trình CLI mới, không
 * có session phía server). Bài dài 8-10k ký tự mà giữ cả năm bản nháp thì lượt
 * thứ tư đã vượt cửa sổ. Chỉ bản nháp MỚI NHẤT còn nguyên vẹn — đó là bản đang
 * được sửa; các bản trước nó đã bị chính nó thay thế rồi.
 */
function compactHistory(history: ChatTurn[]): ChatTurn[] {
  const trimmed = history.slice(-MAX_TURNS);
  const lastDraft = trimmed.map((t) => t.role).lastIndexOf("assistant");
  return trimmed.map((turn, i) => {
    if (turn.role !== "assistant" || i === lastDraft) return turn;
    const reply = /<reply>([\s\S]*?)<\/reply>/.exec(turn.content)?.[1]?.trim();
    return {
      role: "assistant" as const,
      content: `<reply>${reply || "(đã trả lời)"}</reply>\n(bản nháp của lượt này đã bị bản mới thay thế)`,
    };
  });
}

export const writeBlogPost = onCall(
  {
    secrets: ["FECHTIN_GATEWAY_KEY"],
    timeoutSeconds: 540,
    memory: "512MiB",
    cors: true,
    invoker: "public",
  },
  async (request, response): Promise<WriteResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }
    const userDoc = await admin
      .firestore()
      .doc(`users/${request.auth.uid}`)
      .get();
    if (userDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only");
    }

    // Trailing newline trong secret sẽ làm hỏng header Authorization mà lỗi trả
    // về chỉ là 401 chung chung — cắt ở đây rẻ hơn nhiều so với đi tìm.
    const key = process.env.FECHTIN_GATEWAY_KEY?.trim();
    if (!key) {
      throw new HttpsError(
        "failed-precondition",
        "FECHTIN_GATEWAY_KEY chưa được cấu hình"
      );
    }

    const data = (request.data ?? {}) as WriteRequest;
    const message = (data.message ?? "").trim();
    if (!message) {
      throw new HttpsError("invalid-argument", "message is required");
    }
    if (message.length > MAX_MESSAGE) {
      throw new HttpsError(
        "invalid-argument",
        `Tin nhắn tối đa ${MAX_MESSAGE} ký tự`
      );
    }
    const kind = (POST_KINDS as readonly string[]).includes(data.kind ?? "")
      ? (data.kind as PostKind)
      : "free";
    const lang = LANG_NAMES[data.lang ?? ""] ? data.lang! : "en";

    const history = compactHistory(
      Array.isArray(data.history) ? data.history : []
    );

    // Ngữ cảnh trang chỉ ghép vào LƯỢT ĐẦU. Nhắc lại ở mọi lượt thì model cứ
    // quay về ý tưởng gốc mỗi lần người viết bảo nó đổi hướng.
    const opening =
      history.length === 0
        ? buildOpeningContext({
            ideas: data.ideas?.slice(0, MAX_IDEAS),
            title: data.title,
            tags: data.tags,
          })
        : "";

    const messages: GatewayMessage[] = [
      { role: "system", content: buildSystemPrompt({ kind, lang }) },
      ...history,
      {
        role: "user",
        content: opening ? `${opening}\n\n---\n\n${message}` : message,
      },
    ];

    const { text: raw, model, lane } = await gatewayChat({
      key,
      model: MODEL,
      messages,
      // `response` chỉ có khi client gọi bằng `.stream()`; gọi thường vẫn chạy,
      // chỉ là phải đợi tới lúc xong.
      onDelta: (delta) => response?.sendChunk({ delta }),
    });

    logger.info("writeBlogPost", {
      model,
      lane,
      kind,
      lang,
      turns: history.length,
      chars: raw.length,
    });

    return { raw, model };
  }
);
