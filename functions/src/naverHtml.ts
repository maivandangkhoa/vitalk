/**
 * Dọn HTML nhập từ Naver trước khi đưa cho model dịch.
 *
 * Bài nhập từ Naver **chỉ 13–22% là chữ thật** (đo 39 bài, 2026-08-16). Phần còn
 * lại là rác của trình soạn thảo: bài dài nhất có 478 thẻ `<p>` và 520 thẻ
 * `<span>`, mỗi thẻ mở mang theo `style="" class="se-fs- se-ff-   "
 * id="SE-fe069d6b-5983-11f1-a25a-7de5d6ca6e51"`. Riêng đống `id` vô nghĩa đó
 * chiếm khoảng hai phần ba dung lượng bài.
 *
 * Bóc rác ở đây KHÔNG phải để cho gọn mắt — nó là điều kiện để dịch được. Đo từ
 * trợ lý viết bài: ~46 ký tự/giây. Bắt model chép lại từng `id` của bài 32k ký
 * tự mất ~600 giây, vượt luôn `timeoutSeconds: 540` của chính hàm gọi. Sau khi
 * bóc, bài đó còn 4.194 ký tự — khoảng 90–120 giây.
 *
 * Không hàm nào ở đây ghi ngược vào Firestore. Bản `ko` đã lưu phải giữ nguyên
 * từng byte, nếu không `source.contentHash` của nút "Đồng bộ Naver" hết so sánh
 * được.
 */

/**
 * Chỗ giữ chỗ cho một mẩu media. Cố ý không phải HTML: model không thể tưởng
 * mình đang sửa một thẻ, và không regex dọn dẹp nào bên dưới chạm được vào nó.
 */
const mediaToken = (i: number) => `[[MEDIA_${i}]]`;

/** Bắt lại chỗ giữ chỗ kể cả khi model chèn thêm khoảng trắng vào giữa. */
const MEDIA_TOKEN_RE = /\[\[\s*MEDIA_(\d+)\s*\]\]/g;

/** Một mẩu media: ảnh, hoặc khối player YouTube do Tiptap sinh ra. */
const ONE_MEDIA = String.raw`<img\b[^>]*>|<div\b[^>]*\bdata-youtube-video\b[\s\S]*?<\/div>`;

/**
 * Một CHUỖI media dính nhau, gom thành một chỗ giữ chỗ duy nhất.
 *
 * Đo thật 2026-08-16 trên bài `/troi-oi`: bài có 9 ảnh, trong đó 4 ảnh nằm liền
 * nhau. Bản gửi đi thành `[[MEDIA_1]][[MEDIA_2]][[MEDIA_3]][[MEDIA_4]]` — một
 * bức tường token gần như giống hệt nhau, và model gộp chúng lại đúng như mọi
 * lần gặp mẫu đó: bản 日本語 làm mất 8/9 mẩu, bản English mất 1/9. Cùng bài đó
 * lúc chỉ dịch một thứ tiếng thì không sao, nên đây là thứ hỏng theo xác suất
 * chứ không phải hỏng hẳn — loại hỏng tệ nhất để đi dò.
 *
 * Gom cả chuỗi vào một chỗ giữ chỗ thì mẫu đó biến mất: bài trên còn 4 chỗ giữ
 * chỗ thay vì 9, không chỗ nào đứng cạnh chỗ nào. Cái được ghép lại vẫn là đúng
 * từng byte của cả chuỗi, thứ tự nguyên vẹn.
 */
const MEDIA_RE = new RegExp(`(?:${ONE_MEDIA})(?:\\s*(?:${ONE_MEDIA}))*`, "gi");

export interface ExtractedMedia {
  /** HTML với mỗi mẩu media thay bằng `[[MEDIA_n]]`. */
  html: string;
  /** Nguyên văn từng mẩu, theo đúng thứ tự xuất hiện. */
  media: string[];
}

/**
 * Nhấc mọi ảnh và khối YouTube ra khỏi bài, để lại chỗ giữ chỗ.
 *
 * Đây là chỗ bảo đảm lời hứa "ảnh copy nguyên sang": model **không bao giờ nhìn
 * thấy một URL ảnh nào**, nên nó không thể sửa URL, không thể bịa URL, không thể
 * đổi thứ tự ảnh. Ảnh không được dịch cho giống bản gốc — nó là đúng cùng một
 * chuỗi ký tự, ghép lại sau.
 */
export function extractMedia(html: string): ExtractedMedia {
  const media: string[] = [];
  const out = html.replace(MEDIA_RE, (match) => {
    media.push(match);
    return mediaToken(media.length - 1);
  });
  return { html: out, media };
}

/**
 * Model không giữ đúng bộ chỗ giữ chỗ.
 *
 * Có kiểu riêng vì đây là loại hỏng ĐÁNG THỬ LẠI: cùng một bài, cùng một prompt,
 * lượt trước giữ đủ mà lượt sau làm mất. Khác hẳn lỗi hết hạn mức hay lỗi cấu
 * hình, thử lại chỉ tốn thêm lượt gọi mà không đổi kết quả.
 */
export class MediaMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaMismatchError";
  }
}

/**
 * Trả media về đúng chỗ của nó trong bản dịch.
 *
 * Ném lỗi thay vì vá víu khi model làm mất, làm lặp hoặc bịa thêm một chỗ giữ
 * chỗ. Chỗ gọi chạy `Promise.allSettled` nên hỏng một thứ tiếng chỉ mất thứ
 * tiếng đó — tốt hơn hẳn việc lưu đè một bài thiếu ảnh mà không ai biết.
 */
export function restoreMedia(html: string, media: string[]): string {
  const seen = new Map<number, number>();

  const out = html.replace(MEDIA_TOKEN_RE, (token, raw: string) => {
    const i = Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= media.length) {
      throw new MediaMismatchError(`Bản dịch bịa ra chỗ giữ chỗ ${token}`);
    }
    seen.set(i, (seen.get(i) ?? 0) + 1);
    return media[i];
  });

  const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([i]) => i);
  if (duplicated.length) {
    throw new MediaMismatchError(`Bản dịch lặp lại media ${duplicated.join(", ")}`);
  }
  const missing = media.map((_, i) => i).filter((i) => !seen.has(i));
  if (missing.length) {
    throw new MediaMismatchError(
      `Bản dịch làm mất ${missing.length}/${media.length} mẩu media (${missing.join(", ")})`
    );
  }
  return out;
}

/**
 * Một `<a>` do Naver tự động gắn nhầm vào chữ thường, chứ không phải link thật.
 *
 * Naver linkify hộ mọi từ nó tưởng là tên miền, nên bài tiếng Việt đầy những
 * `<a href="http://mời">mời</a>` — bấm vào là lỗi. Đo trên dữ liệu thật: mọi
 * link hỏng đều có host KHÔNG có dấu chấm (`mời`, `Mục`, `máy`…), còn mọi link
 * thật đều có (`havitalk.com`, `youtu.be`, `naver.me`). Đừng thử `new URL()`:
 * nó punycode hoá `mời` thành `xn--mi-uia` rồi báo hợp lệ.
 *
 * `tel:` không có host nên không lọt vào đây — số điện thoại giữ nguyên.
 */
function isNaverAutoLink(href: string): boolean {
  const m = /^https?:\/\/([^/?#]*)/i.exec(href);
  return m ? !m[1].includes(".") : false;
}

/**
 * Bóc rác trình soạn thảo, giữ lại đúng phần mang nghĩa.
 *
 * Bỏ hết `<span>`: 11 kiểu thuộc tính đếm được trên dữ liệu thật đều là cỡ chữ
 * / phông / màu mặc định của Naver (`se-fs-`, `se-ff-`, xám #666666, xanh link
 * #387cbb), không phải nhấn mạnh của người viết — nhấn mạnh thật nằm ở
 * `<strong>`/`<b>`/`<em>`, và những thẻ đó được giữ.
 */
export function stripEditorCruft(html: string): string {
  return (
    html
      // Mở gói link tự động hỏng, giữ lại chữ. Link thật không bị đụng.
      .replace(
        /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
        (whole, href: string, text: string) => (isNaverAutoLink(href) ? text : whole)
      )
      .replace(/<\/?span\b[^>]*>/gi, "")
      // CHỈ U+200B và U+FEFF. U+200D là ZWJ — nó dán các emoji ghép lại với
      // nhau (👨‍👩‍👧), bóc đi là vỡ emoji. Dữ liệu thật có 31 chỗ dùng nó.
      .replace(/[\u200B\uFEFF]/g, "")
      .replace(/<p>\s*<\/p>/gi, "")
      .replace(/\n{2,}/g, "\n")
      .trim()
  );
}

/** Dọn xong rồi tách media — một bước cho chỗ gọi khỏi nhớ thứ tự. */
export function prepareForTranslation(html: string): ExtractedMedia {
  return extractMedia(stripEditorCruft(html));
}
