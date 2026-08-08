# Tối ưu tốc độ tải ảnh giáo viên

## Vấn đề (đo 2026-08-08 trên production)

| Ảnh | Dung lượng | TTFB | Tổng | Cache-Control |
|---|---|---|---|---|
| Nguyên - Win | 1.037 KB | 67ms | 161ms | `public, max-age=3600` (qua GCS) |
| Fiona Chan | 250 KB | 0,8–2,4s | 2,1–3,5s | `private, max-age=0` |
| Trang - Mia | 163 KB | 1,1s | 1,9s | `private, max-age=0` |

Hiển thị ở 80×80px. Bốn nguyên nhân:
1. `firebasestorage.googleapis.com` là API endpoint, không edge-cache → TTFB 0,8–2,4s
2. `cache-control: private, max-age=0` → trình duyệt không cache, tải lại mọi lần vào trang
3. Ảnh gốc không resize/nén (1 MB cho avatar 80px)
4. Request ảnh phát ra muộn (sau JS bundle → Firestore) + thiếu `width`/`height`

## Bug phát hiện thêm

`BlogEditor.tsx:91` và `AdminBlogEdit.tsx:70` dựng URL `storage.googleapis.com/havitalk/...`
sau khi upload từ client, nhưng **không có gì set ACL public** (toàn repo không có `makePublic`).
→ Ảnh blog upload từ admin UI trả về **403**. Đã xác minh:
`blog-images/inline/1777156761987-2r7m.jpeg` → 403. 43 file public còn lại được làm thủ công
bên ngoài repo.

## Hiện trạng bucket `havitalk` (US-EAST1, UBLA tắt, default ACL không public)

| Prefix | Files | Public | cacheControl | Rules |
|---|---|---|---|---|
| `teacher-profiles/` | 17 | 1 | none | `allow read` |
| `blog-images/` | 44 | 43 | none | `allow read` |
| `teacher-qr/` | 5 | 0 | none | `allow read` |
| `chat-images/` | 8 | 0 | none | `auth != null` — **giữ private** |

## Việc cần làm

- [x] 1. `functions/src/publishUpload.ts` — callable admin-only: `makePublic()` + set
      `cacheControl: public, max-age=31536000, immutable`. Chỉ cho phép 4 prefix public,
      chặn tuyệt đối `chat-images/`.
- [x] 2. Export trong `functions/src/index.ts`
- [x] 3. `src/lib/imageUpload.ts` — helper dùng chung: resize bằng canvas + upload kèm
      `cacheControl` + gọi callable + trả public URL
- [x] 4. Nối vào 5 chỗ upload:
      - `AdminTeachers.tsx` (QR Zalo/Kakao — file này không có upload avatar)
      - `AdminProfile.tsx` (avatar)
      - `RichTextField.tsx` (ảnh trong bio)
      - `BlogEditor.tsx` (ảnh inline) — sửa luôn bug 403
      - `AdminBlogEdit.tsx` (ảnh bìa) — sửa luôn bug 403
- [x] 5. `scripts/publish-images.mjs` — đã chạy `--apply`: 22 file set public, 66 file set
      cacheControl, 3 document rewrite URL (2 × `profileImageUrl`, 1 × `contactIds` chứa
      QR lồng bên trong). Chạy lại → 0 thay đổi, script idempotent.
- [x] 6. Thêm `width`/`height`/`loading`/`fetchPriority` cho `<img>` avatar
      (2 card đầu `eager`+`high`, còn lại `lazy`)
- [x] 7. Verify: tsc sạch (root + functions), build sạch, lint 31 problems = **đúng bằng
      baseline main**, đo lại TTFB

## Ràng buộc

- `AdminTeachers.tsx` đang 823 dòng (đã vượt mốc 500) → thay đổi phải **giảm** dòng
  bằng cách rút ra helper, không thêm.
- Không đụng `chat-images/` — ảnh riêng tư giữa học viên và giáo viên.

## Review

### Kết quả đo sau khi sửa

| Ảnh | TTFB trước | TTFB sau (cold) | Tổng sau (edge cache) |
|---|---|---|---|
| Nguyên | 67ms | 58ms | 148ms |
| Fiona | 800–2400ms | 346ms | **89ms** |
| Trang | 1100ms | 346ms | **85ms** |

Header xác nhận: `cache-control: public, max-age=31536000, immutable`, có `age:` → edge cache chạy.

### Kiểm chứng an toàn

- `chat-images/` vẫn trả **403** qua public URL → riêng tư nguyên vẹn
- Callable không đăng nhập → `{"error":{"message":"Login required","status":"UNAUTHENTICATED"}}`
- Bug blog 403 cũ (`blog-images/inline/1777156761987-2r7m.jpeg`) → nay **200**

### Đã deploy

`publishUpload` (us-central1, Node 22, 2nd gen) — `https://publishupload-de6vike2xq-uc.a.run.app`.
Deploy bằng `XDG_CONFIG_HOME=<thư mục rỗng> GOOGLE_APPLICATION_CREDENTIALS=firebase-auth.json`.

### Resize file cũ — ĐÃ XONG

`scripts/resize-images.mjs` (sharp → WebP, `fit: inside`, `withoutEnlargement`, `.rotate()`
để tôn trọng EXIF). Ngưỡng: avatar 512px, QR 1024px q95, ảnh bài viết 1600px q85. Bỏ qua
file không tiết kiệm nổi 10%.

**66 ảnh, giảm 28,62 MB / 31,51 MB (−91%)**, 42 document được rewrite URL.

Ghi ra path `.webp` mới, **không đè file gốc** — vì file gốc mang `immutable, max-age=1 năm`,
đè lên thì edge cache phục vụ bytes cũ tới một năm. Phụ phẩm: URL cũ vẫn 200, nên chỗ nào
rewrite sót cũng không gãy.

| Avatar | Trước | Sau | Tải (edge) |
|---|---|---|---|
| Nguyên | 1.013 KB | 28 KB | 68ms |
| Fiona | 244 KB | 14 KB | 59ms |
| Trang | 159 KB | 34 KB | 60ms |

### Lint — 31 → 0

| Nhóm | Số | Cách sửa |
|---|---|---|
| Build artifact bị lint | 1 | `globalIgnores(['dist', 'functions/lib'])` |
| `require()` trong functions | 2 | `readFileSync` + `JSON.parse`; thêm globals Node cho `functions/**` |
| `react-refresh/only-export-components` | 9 | Tách `button-variants.ts`, `lib/languages.ts`, `hooks/useTeacherSelector.ts`, `router/SuspenseWrapper.tsx`; bỏ export `badgeVariants`/`tabsListVariants` (0 nơi dùng) |
| `set-state-in-effect` | 9 | Chuyển sang derive-during-render, hoặc state gắn thẻ id/key |
| `exhaustive-deps` + `use-memo` | 9 | Deps trung thực, `useCallback`, memo hoá `daySlots` |
| `no-explicit-any`, `no-unused-vars` | 2 | `varsIgnorePattern: '^_'`; giữ `any` của React kèm lý do |

### ⚠️ Cần test tay trước khi deploy

Nhóm `set-state-in-effect` đụng vào code chạy tiền — không có test tự động nào trong repo.

- **`/book` wizard:** chọn lesson → duration bị giới hạn theo lesson → chọn ngày/giờ →
  giáo viên tự chọn ngẫu nhiên (giờ nằm trong onClick của slot, không phải effect nữa)
- **`/book?teacherId=…`** (locked mode) → banner "Booking with" hiện ngay
- **`/book?lessonId=…`** → lesson được chọn sẵn, vẫn ở bước 1
- **Draft sau khi bị đá sang /login** → quay lại phải khôi phục đủ 13 trường
- **Toss redirect** `?toss=success` và `?toss=fail` — đã thêm ref chặn confirm 2 lần
  (StrictMode dev trước đây gọi 2 lần, là bug thật)
- **Thông báo / đăng xuất** → feed không được rớt lại dữ liệu tài khoản cũ

**Thay đổi hành vi duy nhất:** trước đây nếu giáo viên đã chọn biến mất khỏi slot (slot
reload lại), effect tự chọn lại người khác. Giờ không còn — người dùng phải tự chọn lại từ
picker. Đổi lại không còn nguy cơ tự đổi giáo viên sau lưng người dùng.

### Bug: đặt lịch hôm nay chọn được giờ đã trôi qua — ĐÃ SỬA

`useAllTeachersAvailability.ts` chỉ lọc theo **ngày** (`dateObj < today`), nên với chính hôm
nay thì mọi slot đều được chào, kể cả giờ đã qua.

Bằng chứng dữ liệu thật (2026-08-08 14:47, Asia/Seoul): giáo viên Nguyên có 16 slot trống
hôm nay, **11 slot đã qua** (01:00 → 10:30) vẫn đặt được. Sau khi sửa còn đúng 5 slot.

Sửa: với `date === todayStr` thì lọc thêm `slot.startTime > nowTime`. So sánh chuỗi hợp lệ
vì "HH:mm" là 24h có đệm số 0. Slot đã ở múi giờ người dùng, mà `userTz` lấy từ chính trình
duyệt, nên `new Date()` local là mốc đúng.

Ngày sẽ tự biến mất khỏi lịch nếu hết slot, vì `availableDates` trong BookingPage suy ra từ
key của `aggregatedSlots`.

### Ba vấn đề phát hiện kèm theo — chưa xử lý

1. **Không có kiểm tra phía server.** `firestore.rules` cho `create` booking chỉ kiểm
   `studentId`, `status`, `paymentStatus` — không hề kiểm thời gian. UI là chốt chặn duy
   nhất. Rules **không thể** kiểm chính xác được: `date`/`startTime` lưu theo múi giờ giáo
   viên, mà rules không có bảng IANA để quy đổi. Muốn chặn thật thì phải validate trong
   Cloud Function, hoặc đặt một chặn thô theo ngày UTC trong rules.
2. ~~**`teachers.timezone` đang là chuỗi rỗng**~~ — **ĐÃ CÓ UI**. Nguyên nhân gốc: trang
   `/admin/profile` **không hề có field timezone**, còn `/admin/teachers` để ô text tự gõ.
   Nay cả hai dùng chung `TimezoneSelect` (`src/components/admin/TimezoneSelect.tsx`, danh
   sách ở `src/lib/timezones.ts`): 21 múi giờ thường dùng + 398 múi giờ còn lại, mỗi mục
   kèm offset thực tế (`Seoul (GMT+09:00)`). Hồ sơ mới mặc định `DEFAULT_TIMEZONE` thay vì
   rỗng. **Dữ liệu 3 giáo viên hiện tại vẫn cần vào chọn và bấm Save.**

   Bẫy gặp phải: `Asia/Ho_Chi_Minh` và `UTC` không nằm trong
   `Intl.supportedValuesOf('timeZone')` (bản canonical là `Asia/Saigon`, `Etc/UTC`), nên
   nếu gộp thẳng hai danh sách thì Việt Nam xuất hiện hai lần dưới hai tên. Đã khử trùng
   qua `Intl.DateTimeFormat(...).resolvedOptions().timeZone`.
3. ~~**`useAvailableSlots` trong `useAvailability.ts` là code chết**~~ — **ĐÃ XOÁ**. Kiểm
   toàn repo (trừ `node_modules`/`dist`/`lib`) chỉ thấy đúng dòng định nghĩa, không có
   barrel file re-export; nơi duy nhất import module này là `AdminAvailability.tsx` và nó
   chỉ lấy `useAvailability`, `useWeeklyTemplate`, `generateMonthSlots`. Bỏ 34 dòng.
   Nguy hiểm ở chỗ hàm này lọc slot **không hề** loại ngày/giờ quá khứ — ai copy làm mẫu
   là dựng lại đúng con bug vừa sửa.

**Hạn chế còn lại:** danh sách slot tính một lần lúc fetch. Nếu để trang mở qua mốc giờ của
một slot, slot đó vẫn bấm được cho tới khi refetch. Cần chặn thật thì phải làm ở mục 1.

### CHƯA làm

1. **Frontend chưa deploy.** Thay đổi nằm ở working tree, chưa commit.
2. **`AdminTeachers.tsx` vẫn 823 dòng**, `BookingPage.tsx` 1.084 dòng (mốc 500). Nên tách
   `TeacherFormDialog` và các step của wizard ra file riêng.
3. **Ảnh import từ italki** (`AdminTeachers.tsx`) vẫn trỏ vào
   `imagesavatar-static01.italki.com` — ngoài tầm kiểm soát, URL thử trả 403. 3 giáo viên
   đang active không dùng đường này.
