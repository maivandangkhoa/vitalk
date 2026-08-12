import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Sinh ảnh minh hoạ cho bài blog qua Fechtin AI Gateway.
 *
 * Gateway (`gw.fechtin.com`) đứng trước Workers AI của Cloudflare bằng một tài
 * khoản riêng, nên hạn mức ảnh ở đây KHÔNG tranh với job ảnh của FechTin. Key
 * phải nằm server-side: nó mở luôn cả lane chat của gateway, lộ ra trình duyệt
 * là ai cũng tiêu được hạn mức.
 *
 * Hàm này CỐ Ý không upload gì lên Storage. Nó trả ảnh về cho người viết xem
 * rồi chọn — xem `MIN_CANDIDATES` bên dưới.
 */

const GATEWAY_URL = "https://gw.fechtin.com/v1/images/generations";

/**
 * Gọi ĐÍCH DANH model, không gọi tier `fast`: tier có thể rơi vào SDXL hay
 * dreamshaper, ra phong cách khác hẳn giữa hai lần sinh của cùng một bài.
 */
const MODEL = "@cf/black-forest-labs/flux-1-schnell";

/**
 * Ràng buộc âm áp cho MỌI ảnh, đặt ở server chứ không để người viết tự nhớ.
 *
 * Flux không bị cấm sẽ TỰ BỊA biển hiệu: trong lô 30 ảnh sinh ngày 2026-08-11
 * có hộ chiếu in "PA5SPORT", biển cửa hàng ký tự vô nghĩa, poster dán tường chữ
 * loạn. Mệnh đề này giảm mạnh chứ không diệt hẳn — nên vẫn phải cho người chọn.
 */
const NEGATIVE_CLAUSE =
  " — no text, no letters, no numbers, no signage, no logo, no watermark, " +
  "no captions, photorealistic editorial photography, natural light";

/**
 * Cloudflare trả 400 `height and width have to be divisible by 8` nếu lệch, nên
 * đây là danh sách đóng chứ không phải người gọi tự truyền số.
 * `1536x864` là ảnh 16:9 chuẩn lớn nhất thoả điều kiện đó.
 */
const SIZES: Record<string, string> = {
  "16:9": "1536x864",
  "4:3": "1280x960",
  "1:1": "1024x1024",
};

/**
 * Sinh ít nhất 1 tấm.
 *
 * Trần này từng là 2, vì khoảng 1/3 ảnh ra lỗi (chữ bịa, tay thừa ngón) và lỗi
 * đó lộ rõ nhất khi có tấm khác đặt cạnh để so. Hạ xuống 1 khi trợ lý viết bài
 * ra đời: ở đó ảnh sinh từng tấm một và tấm nào cũng phải được bấm nhận thủ
 * công, nên cửa soát vẫn còn — chỉ là soi tuần tự thay vì soi cạnh nhau. Hộp
 * thoại sinh ảnh trong thanh soạn thảo vẫn xin 3 tấm như cũ.
 *
 * Cái KHÔNG được phép quay lại là tự động lấy tấm đầu mà không ai nhìn: đúng
 * cách hai ảnh bìa hỏng lọt lên trang hôm 2026-08-11.
 */
const MIN_CANDIDATES = 1;
const MAX_CANDIDATES = 3;

const MAX_PROMPT_LENGTH = 800;

interface GenerateRequest {
  prompt?: string;
  aspect?: string;
  count?: number;
}

interface GenerateResult {
  images: string[];
  size: string;
}

/** Một lần gọi gateway. Trả base64 JPEG, hoặc ném HttpsError đã phân loại. */
async function generateOne(
  key: string,
  prompt: string,
  size: string
): Promise<string> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, model: MODEL, size }),
  });

  const body = (await res.json().catch(() => null)) as {
    data?: { b64_json?: string }[];
    error?: { message?: string; type?: string };
  } | null;

  if (!res.ok) {
    // Gateway phân loại sẵn trong `type`. ĐỌC `type`, đừng đọc `message`: khi
    // hết hạn mức nó nói "Chưa có lane sinh ảnh nào, cắm CLOUDFLARE_ACCOUNT_ID
    // vào .env" — nghe như mất cấu hình, thực ra chỉ là hết lượt trong ngày.
    if (body?.error?.type === "quota_exceeded" || res.status === 429) {
      throw new HttpsError(
        "resource-exhausted",
        "Hết hạn mức sinh ảnh trong ngày. Thử lại sau."
      );
    }
    throw new HttpsError(
      "internal",
      body?.error?.message || `Gateway trả ${res.status}`
    );
  }

  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) {
    throw new HttpsError("internal", "Gateway không trả về ảnh");
  }
  return b64;
}

export const generateBlogImage = onCall(
  {
    secrets: ["FECHTIN_GATEWAY_KEY"],
    timeoutSeconds: 120,
    memory: "512MiB",
    cors: true,
    invoker: "public",
  },
  async (request): Promise<GenerateResult> => {
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

    const key = process.env.FECHTIN_GATEWAY_KEY;
    if (!key) {
      throw new HttpsError(
        "failed-precondition",
        "FECHTIN_GATEWAY_KEY chưa được cấu hình"
      );
    }

    const { prompt, aspect, count } = (request.data ?? {}) as GenerateRequest;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw new HttpsError("invalid-argument", "prompt is required");
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `prompt tối đa ${MAX_PROMPT_LENGTH} ký tự`
      );
    }

    const size = SIZES[aspect ?? "16:9"];
    if (!size) {
      throw new HttpsError(
        "invalid-argument",
        `aspect phải là một trong ${Object.keys(SIZES).join(", ")}`
      );
    }

    const n = Math.min(
      MAX_CANDIDATES,
      Math.max(MIN_CANDIDATES, Math.round(count ?? MAX_CANDIDATES))
    );
    const fullPrompt = prompt.trim() + NEGATIVE_CLAUSE;

    // Song song: mỗi tấm mất ~5-15s, chạy tuần tự thì 3 tấm chạm trần 45s và
    // người viết ngồi nhìn spinner. allSettled chứ không all — một tấm lỗi
    // không được kéo cả lượt xuống, hai tấm còn lại vẫn dùng được.
    const settled = await Promise.allSettled(
      Array.from({ length: n }, () => generateOne(key, fullPrompt, size))
    );

    const images = settled
      .filter(
        (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled"
      )
      .map((r) => r.value);

    if (!images.length) {
      const first = settled.find((r) => r.status === "rejected");
      const reason = (first as PromiseRejectedResult | undefined)?.reason;
      throw reason instanceof HttpsError
        ? reason
        : new HttpsError("internal", "Sinh ảnh thất bại");
    }

    return { images, size };
  }
);
