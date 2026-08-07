# Bỏ auto-decline 30s trên popup "học sinh đang chờ"

## Bối cảnh

Popup mời giáo viên bắt đầu buổi học tự từ chối sau 30 giây. Tín hiệu đó
**câm** (không ringtone, không notification), nên ở thứ tự "giáo viên vào
trước, học sinh vào sau" nó phạt giáo viên vì không phản hồi thứ họ không thể
nghe thấy: giáo viên bị đá khỏi phòng, `teacherReadyAt` bị xoá, và lobby của
học sinh lật sang "Giáo viên chưa vào lớp" — sai sự thật.

Timeout này còn **thừa**: việc "đừng rung chuông cho người đã đi" đã được
presence-expiry (60s) làm rồi, và giới hạn trên thật sự là khung giờ buổi học
(`open` → `leave()`).

## Việc

### Đợt 1 — gỡ hình phạt (thuần xoá)
- [x] `types/call.ts`: xoá `RING_TIMEOUT_MS`, ghi chú `rejected` là legacy
- [x] `useCall.ts`: xoá effect auto-decline, ref `ringTimeout`, hàm `decline`
- [x] `IncomingCallDialog.tsx`: xoá `RingCountdown`; `onOpenChange` không còn
      huỷ phòng (Esc/click ngoài giờ chỉ ẩn dialog)
- [x] "Để sau" → thu dialog thành banner trong lobby, không ghi `rejected`
- [x] `CallPage.tsx`: state `promptDismissed`, tự reset khi `incoming` tắt

### Đợt 1b — bỏ luôn cú xác nhận thừa
- [x] `join()`: giáo viên bấm "Vào lớp" khi học sinh **đã** ở trong đó thì dial
      luôn, không hỏi lại. Popup chỉ còn dành cho học sinh đến **sau** — đúng
      trường hợp mà trigger là từ xa và giáo viên có thể không nhìn màn hình.

### Đợt 2 — làm tín hiệu nghe được
- [x] `useIncomingAlert.ts` mới: chuông WebAudio (unlock bằng click `join`),
      nháy tiêu đề tab, Notification khi quyền đã được cấp sẵn
- [x] Chuông giới hạn 6 nhịp rồi im; nháy tiêu đề chạy đến khi popup đóng
- [x] Nối tiêu đề nháy qua Helmet (không ghi thẳng `document.title` — Helmet
      sẽ ghi đè)

### Chốt
- [x] Chuỗi dịch ×5 (`incoming.later`, `incoming.banner`, `meta.titleAlert`)
- [x] `tsc --noEmit` sạch, build sạch
- [ ] Verify tay 2 máy, cả hai thứ tự vào phòng
- [ ] Verify chuông trên Safari/iOS (rủi ro đã biết: tab nền có thể bị suspend)

## Review

Ròng: **-63 dòng ở `useCall.ts` + `IncomingCallDialog.tsx`**, +118 dòng cho
hook cảnh báo mới. Không đụng vào presence / generation / session.

Giới hạn đã biết, cố ý không làm trong đợt này:
- Không xử lý "giáo viên mở tab rồi bỏ đi hẳn" — cần luồng sản phẩm (báo học
  sinh / dời lịch), không phải luồng call.
- Không chủ động xin quyền Notification, nên nhánh đó chỉ chạy với người đã
  cấp quyền cho site từ trước.
- Kịch bản giáo viên no-show giờ heartbeat tới hết giờ học thay vì dừng sau
  30s → chi phí Firestore nhỉnh hơn ở đúng kịch bản lỗi đó.
