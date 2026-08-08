# Deploy tính năng chat — chạy tay

CI (`.github/workflows/deploy.yml`) **chỉ deploy hosting**. Ba phần dưới đây
phải đẩy tay, trên máy có `firebase-auth.json` ở thư mục gốc dự án.

Chạy tất cả từ `/Users/Shared/projects/vitalk`.

## 0. Điều kiện

```sh
ls firebase-auth.json          # phải tồn tại, KHÔNG commit
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/firebase-auth.json"
```

Login `firebase-tools` đã lưu trên máy có thể đã hết hạn. Nếu CLI đòi đăng
nhập, ép nó dùng service account bằng cách trỏ config sang thư mục rỗng:

```sh
export XDG_CONFIG_HOME="$(mktemp -d)"
```

## 1. Firestore rules + indexes

```sh
npx firebase-tools deploy --only firestore --project vietalky --non-interactive
```

Index `conversations` (participants array-contains + updatedAt desc) mất vài
phút để build. Inbox sẽ báo lỗi "requires an index" cho tới khi xong — vào
Firebase Console → Firestore → Indexes để xem trạng thái.

## 2. Storage rules

Không dùng CLI được: bucket tên tuỳ biến (`havitalk`, không phải
`<project>.appspot.com`) nên lệnh storage của CLI không trỏ đúng — cũng là lý
do `firebase.json` cố ý không có khối `"storage"`. Dùng script REST:

```sh
node scripts/deploy-storage-rules.mjs
```

Thiếu bước này thì gửi ảnh sẽ fail ở tầng upload (rule mặc định deny all).

## 3. Cloud Functions

```sh
npx firebase-tools deploy \
  --only functions:onChatMessageCreated,functions:sweepUnreadMessageEmails \
  --project vietalky --non-interactive
```

`sweepUnreadMessageEmails` cần 4 secret Gmail (`GMAIL_CLIENT_ID`,
`GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `TEACHER_EMAIL`) — đã khai trong
`secrets: [...]` của function và các secret này đã tồn tại sẵn cho luồng email
booking.

**Bẫy:** gõ sai tên export thì CLI vẫn in "Deploy complete" mà **không deploy
gì cả**. Tên đúng nằm ở `functions/src/index.ts`. Kiểm tra lại sau khi chạy:

```sh
npx firebase-tools functions:list --project vietalky | grep -i chat
```

## 4. Hosting

Push lên `main` là đủ (CI tự làm). Hoặc: `npm run deploy:hosting`.

## 5. Kiểm thử tay sau khi deploy

- [ ] Hai tab (học sinh + giáo viên): gửi tin, tin hiện realtime hai chiều.
- [ ] Badge unread lên ở phía người nhận, về 0 khi mở thread.
- [ ] Gửi ảnh: upload được, hiện thumbnail, bấm vào mở lightbox.
- [ ] Chuông: đợt tin đầu tiên tạo 1 thông báo, tin thứ 2–3 **không** tạo thêm.
- [ ] Push FCM tới đúng người nhận, bấm vào mở đúng hội thoại.
- [ ] Admin (không phải participant): xem được hội thoại người khác, **không**
      có ô soạn tin; thử ghi trực tiếp phải bị rules chặn.
- [ ] Admin kiêm giáo viên: vẫn trả lời được trong thread của chính mình.
- [ ] Throttle: gửi 20 tin không đọc → tin thứ 21 bị chặn, hiện cảnh báo.
- [ ] Email fallback: để tin chưa đọc > 15 phút, sweep gửi đúng 1 email.
