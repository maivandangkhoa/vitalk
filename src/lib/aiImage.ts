import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { functions } from './firebase';

/** Khung ảnh cho phép — phải khớp SIZES trong functions/src/generateImage.ts. */
export const AI_ASPECTS = ['16:9', '4:3', '1:1'] as const;
export type AiAspect = (typeof AI_ASPECTS)[number];

interface GenerateResponse {
  /** JPEG đã mã hoá base64, chưa có tiền tố `data:`. */
  images: string[];
  size: string;
}

/**
 * Gọi hàm `generateBlogImage` và trả về các tấm ứng viên.
 *
 * Ảnh về dưới dạng base64 chứ không phải URL, và đó là chủ ý: chưa tấm nào được
 * upload cho tới khi người viết chọn. Sinh xong đẩy thẳng lên Storage thì mỗi
 * lần bấm lại bỏ lại rác trong bucket, mà phần lớn ảnh sinh ra là để loại.
 */
export async function generateAiImages(
  prompt: string,
  aspect: AiAspect,
  count = 3
): Promise<string[]> {
  const fn = httpsCallable<
    { prompt: string; aspect: AiAspect; count: number },
    GenerateResponse
  >(functions, 'generateBlogImage');

  const res: HttpsCallableResult<GenerateResponse> = await fn({ prompt, aspect, count });
  return res.data.images;
}

/**
 * base64 → File, để tấm được chọn đi qua đúng đường upload của mọi ảnh khác
 * (`uploadPublicImage`: hạ kích thước, chuyển WebP, đặt ACL công khai).
 *
 * `atob` trả chuỗi nhị phân, phải đọc từng byte — `new TextEncoder()` sẽ mã hoá
 * UTF-8 và làm hỏng mọi byte ≥ 0x80, tức hỏng gần như toàn bộ ảnh.
 */
export function aiImageToFile(b64: string, name: string): File {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: 'image/jpeg' });
}

/** Nguồn cho thẻ <img> xem trước, không cần chạm tới mạng. */
export function aiImagePreviewSrc(b64: string): string {
  return `data:image/jpeg;base64,${b64}`;
}
