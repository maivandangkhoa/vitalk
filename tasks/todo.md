# Giáo viên share hai luồng (màn hình + camera thu nhỏ)

Nhánh: `feat/teacher-dual-share`. **Không làm trên `main`** vì `main` tự deploy
production, mà thay đổi này đụng vào phần negotiation đang chạy đúng.

## Quyết định
- **Giáo viên**: share *thêm* một luồng video thứ hai (màn hình), camera vẫn gửi
  nhưng thu nhỏ lại. Cần renegotiate — và giáo viên đúng là bên duy nhất
  `firestore.rules` cho phép ghi `offer`, nên **bất biến chống glare giữ nguyên**,
  không cần perfect negotiation, không sửa rules.
- **Học sinh**: giữ nguyên kiểu thay-thế (`replaceTrack`) như hiện nay — không phát
  offer, không renegotiate, nên không đụng gì tới rules.

## Việc
- [x] `useCallMedia` — thêm chế độ `additiveShare`: màn hình thành `screenStream`
      riêng, camera giữ nguyên trong `stream`. Chế độ thay-thế giữ y nguyên cho học sinh.
- [x] `usePeerConnection` — bỏ tra sender theo `kind` (hiện đang sai khi có 2 luồng
      video: cả hai sender nhận cùng một track), thay bằng ref riêng cho
      audio / camera / screen.
- [x] `usePeerConnection` — thêm/bớt screen track + yêu cầu renegotiate; hạ encoding
      camera khi đang share (`scaleResolutionDownBy`, `maxBitrate`, `maxFramerate`).
- [x] `usePeerConnection` — `ontrack` phân biệt luồng chính và luồng màn hình, dọn
      khi luồng màn hình kết thúc.
- [x] `useCall` — `renegotiate()` cho giáo viên + hàng đợi in-flight dùng chung với
      `restartIce()` (hiện `restartIce` không chặn việc bị gọi chồng).
- [x] `VideoStage` — bố cục khi có màn hình: màn hình là khung lớn (`object-contain`,
      không được crop), camera đối phương thành ô nhỏ bên cạnh self-view.
- [x] `CallPage` + i18n 5 ngôn ngữ.
- [x] `tsc --noEmit`, `lint`, `build`.

## Review
- `main` **không đổi**: học sinh vẫn share kiểu thay-thế y như cũ, đường code đó
  không bị đụng tới. Rules, indexes, functions giữ nguyên.
- Lỗi tra sender theo `kind` được sửa **độc lập** với tính năng — nó sai sẵn từ
  trước, chỉ là chưa có ai tạo ra hai video sender để lộ ra.
- Luồng nhận được phân biệt bằng identity của stream: cái đầu tiên là camera+mic,
  cái thứ hai khác id là màn hình. Đúng vì phía gửi luôn `addTrack` màn hình sau cùng.
- `create()` mang theo màn hình đang share sang connection mới, nên re-dial giữa
  chừng không làm mất share.

## Chưa làm được
Không tự kiểm chứng runtime được — cần hai máy trong một buổi học thật. Phải test tay:
giáo viên bật/tắt share nhiều lần, share lúc mạng chập chờn (đụng ICE restart),
học sinh vẫn share được kiểu cũ, và cuộc gọi không rớt khi renegotiate.
