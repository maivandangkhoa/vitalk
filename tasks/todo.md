# Sinh ảnh AI trong trình soạn bài blog

## Bối cảnh
Ngày 2026-08-11 đã thay 11 ảnh bìa "Chủ đề N" bằng ảnh sinh qua Fechtin AI Gateway,
làm hoàn toàn thủ công bằng curl + script. Việc này lặp lại mỗi lần viết bài mới,
nên đưa thẳng vào `/admin/blog`.

Bài học từ lần làm tay, phải mã hoá vào tính năng chứ không để trong đầu:
- **Sinh 1 ảnh rồi đăng thẳng là sai.** ~1/3 ảnh hỏng (chữ bịa trên biển hiệu, tay
  thừa ngón). Phải sinh nhiều tấm rồi người chọn.
- Ràng buộc âm "no text / no signage / no logo" giảm hẳn chữ bịa → đặt ở server,
  không để người viết tự nhớ.
- `size` phải chia hết cho 8 cả hai chiều, nếu không Cloudflare trả 400.
- Hết quota thì gateway trả 503 `type: quota_exceeded` — phải báo đúng bệnh cho
  người dùng, không nuốt thành "lỗi hệ thống".

## Việc
- [x] `functions/src/generateImage.ts` — callable `generateBlogImage`, admin-only,
      key gateway giữ trong Secret Manager, KHÔNG lộ ra trình duyệt
- [x] Export trong `functions/src/index.ts`
- [x] `src/lib/aiImage.ts` — gọi callable, đổi base64 → File
- [x] `src/components/admin/AiImageDialog.tsx` — nhập mô tả, chọn khung, sinh 3 tấm,
      bấm chọn 1 tấm mới upload
- [x] Gắn vào ảnh bìa (`AdminBlogEdit`) và ảnh trong bài (`BlogEditor`)
- [x] Khoá i18n `blog.ai.*` cho 5 ngôn ngữ
- [x] Đặt secret `FECHTIN_GATEWAY_KEY` + deploy function
- [x] Kiểm chứng: gọi thật, ảnh ra, upload lên Storage, URL công khai

## Review
Xong 2026-08-12. Chi tiết + cạm bẫy: memory `ai-image-generation.md`.
