import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { Language } from '@/types';

/** Khuôn bài — phải khớp POST_KINDS trong functions/src/blogWriterPrompt.ts. */
export const POST_KINDS = ['expression', 'situation', 'free'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export interface ChatTurn {
  role: 'user' | 'assistant';
  /** Với assistant đây là nguyên văn envelope thẻ, không phải chữ đã cắt. */
  content: string;
}

export interface AiDraft {
  title: string;
  excerpt: string;
  tags: string[];
  imagePrompt: string;
  content: string;
  /** `false` khi luồng còn đang chảy hoặc model bị cắt giữa chừng. */
  complete: boolean;
}

export interface AiTurn {
  /** Câu trợ lý nói với người viết. Luôn có, kể cả khi không kèm bản nháp. */
  reply: string;
  /** Chỉ có khi lượt này giao một bản nháp. */
  draft?: AiDraft;
}

interface WriteRequest {
  kind: PostKind;
  lang: Language;
  message: string;
  history: ChatTurn[];
  ideas?: string;
  title?: string;
  tags?: string;
}

interface WriteResponse {
  raw: string;
  model: string;
}

/**
 * Cắt một thẻ ra khỏi envelope, chấp nhận thẻ CHƯA ĐÓNG.
 *
 * Đây là điểm chính khiến envelope dùng thẻ chứ không dùng JSON: lúc chữ còn
 * đang chảy về thì `<reply>` mới mở đã hiện được ra màn hình, còn một object
 * JSON dở dang thì không parse nổi cho tới ký tự cuối cùng.
 */
function readTag(raw: string, name: string): { text: string; closed: boolean } | null {
  const open = `<${name}>`;
  const start = raw.indexOf(open);
  if (start === -1) return null;
  const from = start + open.length;
  const end = raw.indexOf(`</${name}>`, from);
  return end === -1
    ? { text: raw.slice(from), closed: false }
    : { text: raw.slice(from, end), closed: true };
}

/** Envelope (đầy đủ hoặc đang chảy dở) → thứ hiển thị được. */
export function parseEnvelope(raw: string): AiTurn {
  const reply = readTag(raw, 'reply');
  const content = readTag(raw, 'content');

  // Không có <content> thì đây là lượt trò chuyện thuần, không phải bản nháp.
  if (!content) {
    return { reply: reply?.text.trim() ?? (reply === null ? raw.trim() : '') };
  }

  const tags = readTag(raw, 'tags')?.text ?? '';
  return {
    reply: reply?.text.trim() ?? '',
    draft: {
      title: readTag(raw, 'title')?.text.trim() ?? '',
      excerpt: readTag(raw, 'excerpt')?.text.trim() ?? '',
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      imagePrompt: readTag(raw, 'image_prompt')?.text.trim() ?? '',
      content: content.text.trim(),
      complete: content.closed,
    },
  };
}

/**
 * Gọi trợ lý viết bài, đẩy từng mẩu chữ ra `onProgress` khi nó về.
 *
 * Dùng `.stream()` chứ không gọi callable thường: một bài dài mất 45–90 giây,
 * và bắt người viết nhìn spinner suốt chừng đó là cách nhanh nhất để họ bấm
 * tải lại trang giữa lượt.
 */
export async function streamBlogPost(
  req: WriteRequest,
  onProgress: (turn: AiTurn) => void
): Promise<{ raw: string; turn: AiTurn }> {
  const fn = httpsCallable<WriteRequest, WriteResponse, { delta: string }>(
    functions,
    'writeBlogPost'
  );

  const { stream, data } = await fn.stream(req);

  let raw = '';
  for await (const chunk of stream) {
    raw += chunk.delta;
    onProgress(parseEnvelope(raw));
  }

  // `data` là nguồn sự thật: nếu client không xin được stream thì vòng lặp trên
  // chạy 0 lần và toàn bộ chữ chỉ về ở đây.
  const final = await data;
  const full = final.raw || raw;
  return { raw: full, turn: parseEnvelope(full) };
}
