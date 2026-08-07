# Chat trong lớp học (in-call chat panel)

Cho phép nhắn tin ở cột phải của `/call/:bookingId` trong lúc đang gọi video.

## Quyết định thiết kế
- **Dùng lại conversation sẵn có** `conversations/{studentId}_{teacherId}`, không tạo
  thread riêng cho cuộc gọi. Hệ quả: những gì gõ trong giờ học vẫn nằm trong hộp thư
  sau khi tan lớp, và **không cần thêm rules / index / function nào**.
- **Tạo thread lười (lazy)**: chỉ tạo khi có người thực sự gửi tin đầu tiên, để một
  buổi học im lặng không để lại thread rỗng trong hộp thư của cả hai.
- Rules hiện tại đã cho phép đọc một conversation **chưa tồn tại** (`resource == null`
  → `isNamedInId()`), nên subscribe trước khi tạo là hợp lệ.

## Việc
- [x] `src/hooks/useCallChat.ts` — subscribe doc conversation, đếm unread, `ensure()` tạo lười
- [x] `src/components/call/CallChatPanel.tsx` — header + MessageThread + MessageComposer
- [x] `src/components/chat/MessageComposer.tsx` — thêm prop `onBeforeSend` (tạo lười)
- [x] `src/components/call/CallControls.tsx` — nút bật/tắt chat + badge số tin chưa đọc
- [x] `src/pages/CallPage.tsx` — layout 2 cột, state `chatOpen`
- [x] i18n `call.json` cho 5 ngôn ngữ (en, vi, ko, zh, ja)
- [x] `npx tsc --noEmit` + `npm run build`

## Review
- Không đụng tới backend: rules, indexes, functions giữ nguyên → không cần deploy lại
  cái gì ngoài hosting.
- Panel chỉ render khi đang trong cuộc gọi (`inCall`), không hiện ở phòng chờ.
- Mobile: chat nằm dưới video (cột dọc); từ `lg` trở lên mới sang bên phải.
