import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { gatewayChat, readTag } from "./fechtinGateway";

/**
 * Nhận một lời nhắn kiểu "sáng hơn, bỏ cái ghế đi" rồi viết lại prompt ảnh.
 *
 * Tách khỏi `writeBlogPost` là có chủ ý: gọi lại trợ lý viết bài chỉ để sửa một
 * câu mô tả ảnh thì phải kéo theo cả system prompt viết blog, tốn 30-60 giây
 * của Opus và dễ nhận về nguyên một bản nháp mới không ai xin.
 */

/**
 * Gọi đích danh `claude-haiku`, KHÔNG gọi tier `fast`.
 *
 * Tier `fast` nghe hợp lý hơn — hơn trăm lane, có failover. Nhưng đo thật
 * 2026-08-13: mỗi lượt rơi vào một lane khác (`openai/gpt-oss-20b`,
 * `gemma-4-31b-it`, `gemma-4-26b-a4b-it`), và một lượt trả về đúng ba dấu chấm
 * `...` — tức là nhại lại chỗ giữ chỗ trong mẫu thay vì viết prompt. Thứ đó đi
 * thẳng xuống model sinh ảnh thì ra một tấm chẳng liên quan gì tới bài. Một
 * lane biết nghe lệnh đáng giá hơn trăm lane không.
 *
 * (`openai/gpt-oss-20b` còn trả về dấu gạch nối U+2011 thay vì `-`.)
 */
const MODEL = "claude-haiku";

const MAX_NOTE = 400;
/** Phải khớp MAX_PROMPT_LENGTH bên `generateImage.ts`. */
const MAX_PROMPT = 800;
/** Ngắn hơn thế này thì không phải prompt, là rác. */
const MIN_PROMPT = 25;

interface RefineRequest {
  prompt?: string;
  note?: string;
}

export const refineImagePrompt = onCall(
  {
    secrets: ["FECHTIN_GATEWAY_KEY"],
    timeoutSeconds: 120,
    memory: "256MiB",
    cors: true,
    invoker: "public",
  },
  async (request): Promise<{ prompt: string }> => {
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

    const key = process.env.FECHTIN_GATEWAY_KEY?.trim();
    if (!key) {
      throw new HttpsError(
        "failed-precondition",
        "FECHTIN_GATEWAY_KEY chưa được cấu hình"
      );
    }

    const { prompt, note } = (request.data ?? {}) as RefineRequest;
    if (!prompt?.trim() || !note?.trim()) {
      throw new HttpsError("invalid-argument", "prompt và note đều bắt buộc");
    }

    const { text } = await gatewayChat({
      key,
      model: MODEL,
      messages: [
        {
          role: "user",
          content: `You revise prompts for a text-to-image model.

CURRENT PROMPT
${prompt.trim().slice(0, MAX_PROMPT)}

WHAT THE WRITER WANTS CHANGED (may be written in Vietnamese)
${note.trim().slice(0, MAX_NOTE)}

Rewrite it into ONE English prompt describing ONE photographable scene, 25–50 words.
- Change only what was complained about. Everything the writer did not mention stays as it is —
  they are asking for a fix, not for a different picture.
- Keep it a photograph: say the light and the framing.
- No text, no signage, no logos, no letters or numbers anywhere in the scene.
- No collage, nothing symbolic or abstract.

Answer with the prompt inside a single tag and nothing else:
<prompt>the rewritten prompt</prompt>`,
        },
      ],
    });

    // Thẻ chứ không phải chữ trần: model hay kèm câu dẫn ("Sure, here's…") mà
    // đưa thẳng vào model sinh ảnh là nó vẽ luôn cả câu đó.
    const refined = (readTag(text, "prompt") || text.trim()).slice(0, MAX_PROMPT);

    // Cổng chặn: thà báo lỗi và giữ nguyên prompt cũ, còn hơn để một chuỗi rác
    // đi xuống model sinh ảnh rồi người viết ngồi đoán vì sao tấm ảnh lạc đề.
    if (refined.length < MIN_PROMPT || refined.includes("<prompt>")) {
      throw new HttpsError(
        "internal",
        "Model không viết lại được prompt. Thử nhắn cụ thể hơn."
      );
    }
    return { prompt: refined };
  }
);
