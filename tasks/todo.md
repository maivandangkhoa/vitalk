# Video call — sửa toàn bộ findings từ đợt review 2026-08-08

Nguồn: review kiến trúc toàn bộ luồng video call. 17 mục, 5 nghiêm trọng.

## 🔴 Nghiêm trọng
- [x] 1. Snapshot `ended`/`rejected` cũ giết pc vừa tạo → guard bằng session
- [x] 2. `create()` không chống gọi chồng → rò rỉ RTCPeerConnection
- [x] 3. `restartIce` dùng `currentSession + 1`, lệch với hai chỗ còn lại
- [x] 4. Fallback STUN-only khoá cứng cả cuộc gọi (adopt không setConfiguration)
- [x] 5. Offer không được trả lời thì không có timeout

## 🟠 Trung bình
- [x] 6. `markCallActive` ghi đè `startedAt` mỗi lần reconnect
- [x] 7. `isPresent` so server timestamp với `Date.now()` của client
- [x] 8. `oniceconnectionstatechange` thiếu guard pc cũ
- [x] 9. Student không có hành động phục hồi nào
- [x] 10. `error` không bao giờ reset
- [x] 11. Effect trả lời offer gate bằng ref ngoài deps
- [x] 12. `isCallableBooking` không kiểm `platform === 'havitalk'`
- [x] 13. `getIceServers` cấp TURN cho booking ngoài giờ học
- [x] 14. `cleanupOldCalls` xoá tuần tự 300 phòng trong 60s timeout
- [x] 15. `CallPage` che biến global `window`
- [x] 16. `switchDevice` bỏ rơi camera track đang park
- [x] 17. `useCall.ts` 526 dòng > luật 500 LOC

## Hai lỗi tìm ra trong lúc tự review (không có trong danh sách gốc)
- **`sessionRef` bị `teardown()` xoá trước khi tính generation.** `startCall`
  chạy `teardown()` (đặt `sessionRef = -1`) *trước* dòng
  `Math.max(currentSession, sessionRef.current) + 1`, nên vế "không dùng lại
  generation trình duyệt này vừa dùng" luôn suy biến thành `currentSession + 1`
  — comment mô tả một bảo đảm mà code không hề thực hiện. Và fix #1 kế thừa
  đúng lỗ đó: trong cửa sổ chờ credential `sessionRef` là -1 nên mọi snapshot
  `rejected` cũ đều lọt guard. Nay generation được tính **trước** teardown và
  giữ (`sessionRef.current = session`) suốt cả lần quay số.
- **`serverTimestamp()` chưa ack đọc ra `null`.** Fix #7 lấy heartbeat của
  chính mình làm mốc, nhưng `snap.data()` mặc định trả `null` cho server
  timestamp đang pending → mỗi 20s lại rơi về `Date.now()`, đúng cái đồng hồ
  đang cần tránh. `watchCall` nay đọc với `{ serverTimestamps: 'previous' }`.

## Review
- Tách file: `useCall.ts` 526 → 313; thêm `useCallNegotiation.ts` (408),
  `useCallSenders.ts` (167), `lib/callDebug.ts` (39). `usePeerConnection.ts`
  589 → 458. Mọi file dưới 500 LOC.
- Kiểm chứng: `tsc` (app + functions), `eslint` (0 lỗi/0 cảnh báo trên các file
  đã sửa), `npm run build` xanh. `withinLessonDays` chạy 10 ca biên — pass hết.
- **Chưa chạy thật.** Repo không có test runner; các đường WebRTC cần hai máy.
  Danh sách test tay + việc deploy còn lại nằm trong memory `video-call.md`.
