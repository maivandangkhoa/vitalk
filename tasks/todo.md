# Dịch bài blog tiếng Hàn sẵn có sang en / zh / ja

## Bối cảnh (đo thật 2026-08-16, không phải phỏng đoán)

40 bài trong `blogPosts`. **39 bài có `content.ko`**, 37 bài chưa có bản dịch nào.
Hầu hết nhập từ Naver.

Ba con số quyết định thiết kế:

| | |
|---|---|
| Bài `ko` dài nhất | **32.116 ký tự** |
| Cũng bài đó, sau khi bóc rác + thay ảnh bằng chỗ giữ chỗ | **4.194 ký tự (13%)** |
| Tổng cả 39 bài | 541k → **121k ký tự (22%)** |
| Bài lớn nhất cần gửi đi | **6.437 ký tự** |
| Bài không có excerpt ở BẤT KỲ thứ tiếng nào | **37/39** |
| Bài có `title` giống hệt bị copy sang cả 5 khoá | 13 |

HTML Naver **chỉ 13–22% là chữ thật**. Bài lớn nhất có 478 thẻ `<p>` và **520 thẻ
`<span>`**, mỗi thẻ mở mang theo `style="" class="se-fs- se-ff-   "
id="SE-fe069d6b-5983-11f1-a25a-7de5d6ca6e51"` — riêng đống `id` vô nghĩa đó chiếm
khoảng hai phần ba dung lượng bài. Kèm theo là những thẻ `<a href="http://miền">`
do Naver tự động gắn nhầm vào chữ tiếng Việt: link hỏng, hiện tại vẫn bấm được
trên site thật vì `sanitizeHtml` dùng allowlist mặc định của DOMPurify.

**Bóc rác không phải để cho gọn — nó là điều kiện để tính năng chạy được.**
Đo từ trợ lý viết bài: ~46 ký tự/giây. Gửi nguyên 32k ký tự thì model phải chép
lại từng `id` một, mất ~600 giây → vượt `timeoutSeconds: 540` của chính hàm. Gửi
4,2k thì còn khoảng 90–120 giây. Đây là khác biệt giữa "chạy được" và "không".

## Đã có sẵn, không viết lại

`functions/src/translateBlog.ts` — callable `translateBlogPost` đã đúng hướng:
admin-only, envelope bằng thẻ, **một lượt gọi cho một ngôn ngữ** qua
`Promise.allSettled`, đủ 5 ngôn ngữ, cố ý không trả khoá rỗng để client merge vào
không xoá bản dịch cũ. Cloud Run service đã có binding `allUsers` từ 2026-08-12.

Thiếu đúng một thứ: **không có nút nào gọi được nó cho bài cũ.** Hàm chỉ mở ra
sau khi bấm "Áp dụng" trong `AiWriterPanel`, tức là chỉ dùng được cho bài do AI
vừa viết ra.

## Việc

### 1. `functions/src/naverHtml.ts` (mới, ~90 dòng) — dọn nguồn trước khi gửi
- [ ] `stripEditorCruft(html)`: bỏ `<span>`/`</span>`, mở gói `<a class="se-link">`
      lấy lại chữ bên trong, bỏ ký tự zero-width `​`, gộp `<p></p>` rỗng
- [ ] `extractMedia(html)` → `{ html, media[] }`: thay mỗi `<img …>` và mỗi
      `<div data-youtube-video>…</div>` bằng `[[MEDIA_0]]`, `[[MEDIA_1]]`…
- [ ] `restoreMedia(html, media)`: trả ảnh về chỗ cũ, **đếm lại và ném lỗi** nếu
      thiếu / thừa / lặp một chỗ giữ chỗ

> Đây chính là "chỉ dịch chữ, ảnh copy nguyên sang" của yêu cầu, làm bằng cách
> mạnh nhất: **model không bao giờ nhìn thấy một URL ảnh nào**, nên nó không thể
> làm hỏng URL, không thể bịa URL, không thể đổi thứ tự ảnh. Ảnh không được
> "dịch giống nguyên bản" — nó là đúng cùng một chuỗi ký tự, ghép lại sau.

### 2. Sửa `functions/src/translateBlog.ts`
- [ ] Chạy nguồn qua `stripEditorCruft` + `extractMedia`, ghép lại bằng
      `restoreMedia` trên từng bản dịch
- [ ] Prompt: chép `[[MEDIA_n]]` nguyên văn, đúng một lần, đúng thứ tự
- [ ] Excerpt rỗng → bảo model **viết mới 1–2 câu** bằng ngôn ngữ đích, thay vì
      dịch một chuỗi rỗng thành rỗng (37/39 bài rơi vào đây)
- [ ] Trả về trạng thái từng ngôn ngữ (`ok` / thông điệp lỗi) thay vì lặng lẽ bỏ
      qua ngôn ngữ hỏng — hiện tại hỏng 2 trong 3 thứ tiếng thì UI vẫn báo thành công
- [ ] **KHÔNG đụng vào `content.ko` đã lưu.** Bóc rác chỉ diễn ra trong bộ nhớ khi
      dịch. Bản `ko` phải giữ nguyên byte để `source.contentHash` của
      "Đồng bộ Naver" còn so sánh được

### 3. `src/lib/aiTranslate.ts` — sửa lỗi timeout (bắt buộc, không có là hỏng hết)
- [ ] `httpsCallable(functions, 'translateBlogPost', { timeout: 540_000 })`

> Mặc định của firebase-js-sdk là **70 giây** (`@firebase/functions/dist/index.cjs.js:624`).
> Không đặt lại thì trình duyệt tự bỏ cuộc lúc 70s trong khi hàm vẫn chạy tiếp —
> người dùng thấy "Dịch thất bại", còn hạn mức model thì đã tiêu. Đường đi hiện
> tại của trợ lý viết bài cũng đang dính lỗi này, chỉ là bài AI viết đủ ngắn để
> lọt qua.

### 4. Nút trong trang sửa bài
- [ ] `src/components/admin/TranslateDialog.tsx` (mới) — chọn ngôn ngữ nguồn
      (mặc định là tab đang mở), chip ngôn ngữ đích mặc định bật **en/zh/ja nào
      chưa có `content`**, chạy, báo kết quả từng thứ tiếng
- [ ] Gắn nút "Dịch bài này" vào `AdminBlogEdit` cạnh nút "Đồng bộ Naver", nối vào
      `applyTranslation` đã có sẵn → kết quả vào ô soạn thảo và **chờ bấm Lưu**,
      giống mọi thao tác khác trên trang

> Tách ra file riêng vì `AdminBlogEdit.tsx` đang 453 dòng — nhét dialog vào là vượt
> trần 500 dòng.

### 5. Chạy hàng loạt ở `/admin/blog`
- [ ] Nút "Dịch những bài còn thiếu" → dialog xem trước: liệt kê đúng những bài sẽ
      chạy và số lượt gọi, bấm xác nhận mới chạy
- [ ] Vòng lặp **tuần tự một bài một lượt** (ba ngôn ngữ đã chạy song song sẵn bên
      trong hàm), thanh tiến độ, nút Dừng
- [ ] **Tự tính lại danh sách việc mỗi lần chạy** = bài có `content.ko` và thiếu
      `content[đích]`. Không lưu hàng đợi ở đâu cả: đóng tab rồi bấm lại là chạy
      tiếp phần còn thiếu, không có trạng thái nào để lệch
- [ ] Gặp `resource-exhausted` (hết lượt Claude trong cửa sổ 5 giờ) thì **dừng cả
      mẻ** và nói rõ, không cắm đầu chạy tiếp cho hỏng 30 bài liên tiếp

> ~37 bài × ~2 phút ≈ **90 phút** mở tab. Đó là lý do phải chạy lại được: bạn cứ
> đóng tab lúc nào cũng được.

### 6. i18n `blog.translate.*` cho cả 5 ngôn ngữ

### 7. Kiểm chứng (theo chuẩn "phải chứng minh nó chạy")
- [ ] Script offline chạy `extractMedia`/`restoreMedia` trên **cả 39 bài**, khẳng
      định số thẻ ảnh khớp từng bài và ghép lại ra đúng chuỗi cũ
- [ ] Dịch thật **một** bài lớn nhất qua đường idToken + REST (không cần trình
      duyệt, cách làm ghi trong memory `ai-blog-writer`), rồi **diff từng thẻ
      `<img>` theo byte** giữa bản `ko` và bản `en`
- [ ] Mở bài vừa dịch trong Tiptap kiểm tra không mất thẻ, và xem `/blog/:slug` thật
- [ ] Chỉ khi một bài đã đúng mới chạy 36 bài còn lại

## Rủi ro đã biết

- **Hạn mức model.** 37 bài × 3 thứ tiếng = **111 lượt gọi**. Dưới trần `rpd:300`
  của key `havitalk`, nhưng cửa sổ 5 giờ của Claude mới là chỗ thắt. Có nút Dừng
  và chạy lại được chính là để sống chung với nó.
- **13 bài có `title` rác copy đều 5 khoá** (ví dụ `title.en` đang là
  `" Chủ đề 3: Ở sân bay / nhập cảnh (공항에서)"`). Dịch sẽ ghi đè lên chúng — đây
  là cải thiện, nhưng nói trước để không bất ngờ.
- **Dấu `*` trên tab ngôn ngữ** đang xét `content`, nên nó vẫn trung thực. Không
  dựa vào `title` để đánh dấu "đã dịch".

## Review — xong 2026-08-16, đã deploy, chưa chạy mẻ 39 bài

Mọi mục ở trên đã làm. Ba thứ chỉ lộ ra khi chạy thật, không có trong kế hoạch:

**1. Chuỗi chỗ giữ chỗ dính nhau làm model nuốt ảnh.** Bài `/troi-oi` có 4 ảnh nằm
liền nhau nên bản gửi đi thành `[[MEDIA_1]][[MEDIA_2]][[MEDIA_3]][[MEDIA_4]]`. Model
gộp bức tường token đó lại: bản 日本語 **mất 8/9 mẩu**, bản English mất 1/9 — trong
khi chính bài đó lượt trước dịch đủ 3 thứ tiếng không sao. Cổng chặn làm đúng việc
(bỏ ngôn ngữ hỏng, không lưu bài thiếu ảnh) nhưng hỏng 2/3 thì không dùng được.
Sửa tận gốc: `MEDIA_RE` gom cả CHUỖI media dính nhau vào một chỗ giữ chỗ →
`/troi-oi` còn 4 thay vì 9, không cái nào đứng cạnh cái nào. Toàn kho 137 → 126.
Thêm một lớp `MediaMismatchError` + thử lại đúng một lần cho riêng loại hỏng này.
Sau khi sửa: **9/9 ảnh khớp byte, 3/3 ngôn ngữ, hai lượt liên tiếp.**

**2. Model rò markdown.** Bản 中文 trả về `**"天空"**` — blog render HTML nên nó hiện
ra dấu sao thật. Sửa hai lớp: luật cấm markdown viết rõ trong prompt, và `unmarkBold`
đổi `**x**` → `<strong>x</strong>` (chỉ bắt cặp, dấu sao lẻ và `2 * 3` không bị đụng).

**3. Effect reset xoá mất kết quả ngay trước mắt người bấm.** Cả hai hộp thoại từng
để `content` trong mảng phụ thuộc của effect khởi tạo; dịch xong là `content` đổi →
effect chạy lại → xoá sạch `done`/`failed`. Người bấm thấy hộp thoại tự dọn kết quả,
không kịp biết thứ tiếng nào hỏng. Cả hai giờ đi qua ref, effect chỉ phụ thuộc `open`.

### Đã chứng minh
- `extractMedia`/`restoreMedia` trên **cả 39 bài**: ảnh khớp byte, không URL nào lọt
  sang model, bắt được cả hai kiểu hỏng (mất / lặp), **9 bài có emoji ZWJ đều nguyên**.
- Dịch thật bài lớn nhất (32.116 → gửi đi 4.194 ký tự): **46 giây**, 5/5 ảnh khớp byte,
  ví dụ tiếng Việt giữ nguyên 248 ký tự có dấu, excerpt tự viết ra.
- Chạy trọn luồng UI trên `/troi-oi` bằng Chrome CDP: 42 giây, 3 chip xanh, và
  **Tiptap giữ đủ 8 ảnh + 1 iframe YouTube**, 0 chỗ giữ chỗ sót, 0 dấu sao.
- Firestore **không bị ghi một chữ nào** trong suốt quá trình thử.

### Còn lại
- [ ] Bấm "Dịch 39 bài" ở `/admin/blog` — ~90 phút, 114 lượt gọi. Chưa chạy.
- Hàm đã deploy (`translateBlogPost`, us-central1). Client chưa deploy: push `main`
  là CI tự đẩy hosting.
- Ghi chú: `BlogEditor` cảnh báo `Duplicate extension names found: ['link']` —
  StarterKit v3 đã có Link sẵn mà file còn `Link.configure()` riêng. Lỗi có sẵn từ
  trước, không thuộc việc này.
