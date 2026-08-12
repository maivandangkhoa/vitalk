import { HttpsError } from "firebase-functions/v2/https";

/**
 * Một chỗ duy nhất gọi Fechtin AI Gateway cho các lane CHỮ.
 *
 * Gateway nói giao thức OpenAI, nên phần khó không nằm ở việc gửi đi mà ở ba
 * chỗ dễ sai giống hệt nhau ở mọi nơi gọi: phải stream, phải đọc `error.type`
 * chứ không đọc `message`, và phải bỏ qua `reasoning_content`. Gom vào đây để
 * mỗi hàm khỏi tự nhớ lại.
 *
 * (Lane sinh ẢNH đi đường khác — `/v1/images/generations`, xem `generateImage.ts`.)
 */

const CHAT_URL = "https://gw.fechtin.com/v1/chat/completions";

export interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  key: string;
  /**
   * Tên model đích danh (`claude-opus`, `claude-sonnet`) chứ không phải tier.
   * Tier thì có failover khi lane cạn, nhưng lane thay thế viết ra giọng khác
   * hẳn — với blog thì lệch giọng giữa hai bài tệ hơn là phải chờ.
   */
  model: string;
  messages: GatewayMessage[];
  /** Nhận từng mẩu chữ khi nó về; bỏ trống thì chỉ gom rồi trả một lần. */
  onDelta?: (delta: string) => void;
}

export interface ChatResult {
  text: string;
  /** Lane THẬT đã trả lời — ghi log để biết bài dở là do đâu. */
  model: string;
  lane: string | null;
}

/**
 * Gọi chat và trả về nguyên văn câu trả lời.
 *
 * LUÔN dùng `stream: true`. Gateway áp deadline 90 giây cho cả vòng failover,
 * nhưng đồng hồ đó dừng khi header phản hồi về — không stream thì mọi câu trả
 * lời dài hơn 90 giây đều chết 504, mà một bài blog thì thường lâu hơn thế.
 */
export async function gatewayChat({
  key,
  model,
  messages,
  onDelta,
}: ChatOptions): Promise<ChatResult> {
  let res: Response;
  try {
    res = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      // Cố ý KHÔNG gửi `max_tokens`: lane biết nghĩ sẽ tiêu hết trần vào phần
      // suy nghĩ rồi trả `content: null`, mà độ dài bài thì không đoán trước được.
      body: JSON.stringify({ model, messages, stream: true }),
    });
  } catch (err) {
    throw new HttpsError(
      "unavailable",
      err instanceof Error ? err.message : "Không gọi được gateway"
    );
  }

  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string; type?: string };
    } | null;
    // Đọc `type`, đừng đọc `message`: hết lượt thì gateway mô tả bằng câu nghe
    // như mất cấu hình ("chưa cắm CLOUDFLARE_ACCOUNT_ID…"), còn `type` luôn
    // đúng bệnh.
    if (body?.error?.type === "quota_exceeded" || res.status === 429) {
      throw new HttpsError(
        "resource-exhausted",
        "Hết lượt gọi model trong cửa sổ hiện tại. Chờ rồi thử lại."
      );
    }
    throw new HttpsError(
      "internal",
      body?.error?.message || `Gateway trả ${res.status}`
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Một mẩu mạng có thể cắt ngang dòng, nên chỉ xử lý phần đã đủ "\n".
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        // `reasoning_content` cũng chảy qua kênh này; cố ý chỉ lấy `content` —
        // trả suy nghĩ nội bộ ra cho người dùng là lỗi hiển thị lẫn lỗi nội dung.
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          onDelta?.(delta);
        }
      } catch {
        // Một dòng SSE hỏng không đáng làm chết cả lượt.
      }
    }
  }

  if (!text.trim()) {
    throw new HttpsError("internal", "Model không trả về nội dung nào");
  }

  return {
    text,
    model: res.headers.get("x-fechtin-model") || model,
    lane: res.headers.get("x-fechtin-lane"),
  };
}

/**
 * Cắt một thẻ ra khỏi câu trả lời.
 *
 * Cả hai hàm dùng envelope bằng thẻ chứ không bằng JSON: lane claude chạy qua
 * shim `claude -p` nên không dịch `response_format`, mà nhét cả bài HTML vào
 * một chuỗi JSON thì chỉ cần một dấu nháy lạc là hỏng nguyên lượt.
 */
export function readTag(raw: string, name: string): string {
  const open = `<${name}>`;
  const start = raw.indexOf(open);
  if (start === -1) return "";
  const from = start + open.length;
  const end = raw.indexOf(`</${name}>`, from);
  return (end === -1 ? raw.slice(from) : raw.slice(from, end)).trim();
}
