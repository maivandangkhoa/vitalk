import type { BlogPost, Language, MultiLangText } from '@/types';

/**
 * Thứ tiếng nhắm tới khi dịch kho bài tiếng Hàn nhập từ Naver.
 *
 * Cố ý KHÔNG có `vi`: bài dạy tiếng Việt cho người nước ngoài, ví dụ trong bài
 * vốn đã là tiếng Việt, nên bản `vi` gần như chỉ dịch phần giải thích cho chính
 * người đã biết tiếng Việt. Ai cần vẫn bật tay được trong hộp thoại dịch.
 */
export const DEFAULT_TARGETS: Language[] = ['en', 'zh', 'ja'];

/** Ngôn ngữ nguồn của kho bài cũ. */
export const DEFAULT_SOURCE: Language = 'ko';

export const hasText = (text: MultiLangText | undefined, lang: Language): boolean =>
  Boolean(text?.[lang]?.trim());

/**
 * Thứ tiếng trong `targets` mà bài này còn thiếu bản dịch.
 *
 * Xét `content` chứ không xét `title`: trình nhập Naver copy cùng một tiêu đề
 * sang cả 5 khoá ngôn ngữ trên 13 bài, nên `title` báo "đã có" cho những thứ
 * tiếng chưa hề được dịch.
 */
export function missingTargets(
  post: Pick<BlogPost, 'content'>,
  source: Language = DEFAULT_SOURCE,
  targets: Language[] = DEFAULT_TARGETS
): Language[] {
  return targets.filter((lang) => lang !== source && !hasText(post.content, lang));
}

export interface PendingTranslation {
  post: BlogPost;
  missing: Language[];
}

/**
 * Danh sách việc cho lượt chạy hàng loạt: bài có chữ ở ngôn ngữ nguồn và còn
 * thiếu ít nhất một ngôn ngữ đích.
 *
 * Tính lại từ dữ liệu mỗi lần chạy, cố ý không lưu hàng đợi ở đâu cả. Đóng tab
 * giữa chừng rồi bấm lại là chạy tiếp đúng phần còn thiếu, và không có trạng
 * thái nào để lệch với thực tế.
 */
export function pendingTranslations(
  posts: BlogPost[],
  source: Language = DEFAULT_SOURCE,
  targets: Language[] = DEFAULT_TARGETS
): PendingTranslation[] {
  return posts
    .filter((post) => hasText(post.content, source))
    .map((post) => ({ post, missing: missingTargets(post, source, targets) }))
    .filter((item) => item.missing.length > 0);
}
