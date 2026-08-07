# Tính năng: Video call dạy học trực tiếp (WebRTC)

Tham khảo: `/Users/Shared/projects/sysplat` — `apps/web/src/hooks/useWebRTC.ts`,
`apps/api/app/websockets/signaling.py`, `infrastructure/coturn/turnserver.conf`.

## 1. Khác biệt then chốt so với sysplat

sysplat có backend FastAPI chạy 24/7 → signaling qua **WebSocket** (`/ws/signal/{room}`)
và coturn tự host trong docker-compose. HaviTalk là **Firebase-only**: hosting tĩnh +
Cloud Functions stateless → **không có chỗ giữ WebSocket**.

Vì vậy:

| Thành phần | sysplat | HaviTalk |
|---|---|---|
| Signaling (SDP/ICE) | WebSocket relay | **Firestore `onSnapshot`** trên `calls/{callId}` |
| Room / auth | room row + JWT ngắn hạn | **`callId = bookingId`**, phân quyền bằng chính booking |
| ICE config | endpoint `/ice-config` trả TURN tĩnh | **callable `getIceServers`** trả credential HMAC ngắn hạn |
| TURN | coturn self-host | TURN hosted (Metered/Twilio) — interface giữ nguyên để đổi sang coturn sau |
| Media | P2P 1:1 | P2P 1:1 (giữ nguyên, không cần SFU) |

Phần **giữ lại nguyên vẹn** từ sysplat: vòng đời `RTCPeerConnection`, hàng đợi ICE
candidate trước khi `setRemoteDescription` (`iceCandidateQueue` + `remoteDescSet`),
state machine `idle → ringing → connecting → active → ended`, ring timeout 30s,
re-attach `srcObject` khi layout đổi (bug đã gặp ở `join/[roomId]/page.tsx`).

## 2. Mô hình dữ liệu

### `calls/{bookingId}`
```ts
{
  bookingId: string,
  participants: [teacherUid, studentUid],   // để rules & query
  teacherId, studentId,
  offer:  { type: 'offer',  sdp: string } | null,   // caller ghi
  answer: { type: 'answer', sdp: string } | null,   // callee ghi
  status: 'idle' | 'ringing' | 'active' | 'ended' | 'rejected',
  callerId: string | null,        // ai bấm gọi trước
  startedAt, endedAt, updatedAt,
}
```
Subcollection: `calls/{bookingId}/candidates/{autoId}` = `{ from: uid, candidate: {...}, createdAt }`
(một collection chung, mỗi bên lọc `from != myUid` — đơn giản hơn hai collection).

Không tạo collection `rooms` riêng: **một booking = một phòng**, id tất định giống
cách `conversationId = "{studentId}_{teacherId}"` ở chat. Gọi lại lần 2 thì reset
document (`offer/answer = null`, xóa candidates) thay vì tạo doc mới.

### Bổ sung `Booking`
- `OnlinePlatform` thêm giá trị `'havitalk'` (`src/types/booking.ts`).
- Khi `platform === 'havitalk'` thì `meetingLink` = `/call/{bookingId}` (dùng cho email
  nhắc lịch trong `functions/src/reminders.ts` + `bookingTriggers.ts`).

## 3. Firestore rules (`firestore.rules`)

```
match /calls/{callId} {
  function booking() { return get(/…/bookings/$(callId)).data; }
  function isPeer()  { return isAuthenticated() &&
      request.auth.uid in [booking().teacherId, booking().studentId]; }

  allow read:   if isAdmin() || isPeer();
  allow create: if isPeer()
                && callId == request.resource.data.bookingId
                && booking().status in ['confirmed', 'completed']
                && request.resource.data.participants
                     == [booking().teacherId, booking().studentId];
  // chỉ được đổi các field của signaling, không đụng participants
  allow update: if isPeer() && request.resource.data.diff(resource.data)
      .affectedKeys().hasOnly(['offer','answer','status','callerId',
                               'startedAt','endedAt','updatedAt']);
  allow delete: if false;

  match /candidates/{cid} {
    allow read:   if isPeer();
    allow create: if isPeer() && request.resource.data.from == request.auth.uid;
    allow update: if false;
    allow delete: if isPeer();   // dọn khi gọi lại
  }
}
```
Ghi chú: mỗi phép `get()` trên booking tốn 1 read nội bộ — chấp nhận được vì
signaling chỉ vài chục thao tác/cuộc gọi.

## 4. TURN / ICE

Callable `getIceServers(bookingId)` trong `functions/src/ice.ts`:
1. Xác thực caller là teacher/student của booking đó.
2. Trả `{ iceServers: [ {urls:'stun:stun.l.google.com:19302'}, {urls: TURN_URLS, username, credential} ] }`
   với credential **ephemeral** (`username = <expiry>:<uid>`, `credential = base64(HMAC-SHA1(secret, username))` —
   chuẩn `use-auth-secret` của coturn, hosted provider cũng dùng cùng scheme), TTL 2 giờ.
3. Secret lưu bằng Secret Manager (`TURN_SECRET`, `TURN_URLS`) — nhớ `secrets: [...]`
   trong định nghĩa function (gotcha đã ghi ở `memory/gcp-billing.md`).

**Không** hard-code credential vào client như sysplat (`consultation:consultation123`) —
TURN lộ credential là bị dùng chùa băng thông.

Chọn nhà cung cấp: bắt đầu bằng **Metered** (gói free 50GB/tháng, đủ cho ~5–10% cuộc
gọi phải relay) hoặc Twilio NTS (trả theo GB). Nếu sau này chi phí tăng → dựng coturn
trên 1 VM e2-micro, copy `turnserver.conf` từ sysplat, bật `use-auth-secret` thay cho
`lt-cred-mech`. Interface callable không đổi.

## 5. Frontend

```
src/types/call.ts                          ~60   Call, CallStatus, SignalPayload
src/lib/webrtc.ts                          ~120  tạo RTCPeerConnection, ghi/đọc signaling Firestore
src/hooks/useIceServers.ts                 ~40   gọi callable, cache theo phiên
src/hooks/useCall.ts                       ~220  state machine + ICE queue (cốt lõi, port từ useWebRTC.ts)
src/hooks/useCallMedia.ts                  ~110  getUserMedia, toggle mic/cam, đổi thiết bị, screen share
src/pages/CallPage.tsx                     ~150  route /call/:bookingId — guard + layout
src/components/call/VideoStage.tsx         ~120  remote lớn + local PiP, tên, trạng thái mạng
src/components/call/CallControls.tsx       ~110  mic / cam / share màn hình / rời phòng
src/components/call/CallLobby.tsx          ~120  preview camera, chọn thiết bị, nút "Vào lớp"
src/components/call/IncomingCallDialog.tsx ~90   chuông + accept/reject (ring timeout 30s)
src/components/call/JoinLessonButton.tsx   ~70   hiện ở MyBookings/AdminBookings trong khung giờ
```
Tất cả đều dưới trần 500 LOC/file. Sửa thêm: `src/router/index.tsx` (route mới),
`src/pages/MyBookingsPage.tsx`, `src/pages/admin/AdminBookings.tsx`,
`src/pages/BookingPage.tsx` (chọn platform "HaviTalk video"),
`src/types/booking.ts`, `public/locales/{en,vi,ko,zh,ja}/call.json` (namespace mới).

Guard vào phòng: chỉ teacher/student của booking, `status === 'confirmed'`,
và trong khoảng **[startTime − 10 phút, endTime + 15 phút]**. Ngoài khung giờ →
màn hình "Chưa tới giờ học" kèm đếm ngược.

## 6. Backend (Cloud Functions)

```
functions/src/ice.ts        ~80   getIceServers (callable)
functions/src/callTriggers.ts ~120 onCallWritten: gửi FCM "đang gọi" cho bên kia,
                                  ghi notification, set booking.status='completed'
                                  khi call kết thúc và đã quá endTime
functions/src/callCleanup.ts  ~60  scheduled hằng ngày: xoá calls + candidates > 7 ngày
```
Export trong `functions/src/index.ts`.

## 7. Kế hoạch thực thi

- [ ] **P0 — Nền tảng** `src/types/call.ts`, `firestore.rules` cho `calls/*`, callable
      `getIceServers` + secrets, deploy rules/functions. Kiểm chứng: gọi callable từ
      console trả về iceServers hợp lệ; `trickle-ice` test TURN thật sự relay được.
- [ ] **P1 — Signaling + media** `src/lib/webrtc.ts`, `useIceServers`, `useCallMedia`,
      `useCall`. Kiểm chứng: hai tab (student + teacher) nối được P2P, log `ontrack`.
- [ ] **P2 — Giao diện phòng học** `CallPage` + `VideoStage` + `CallControls` +
      `CallLobby` + route + guard theo khung giờ. Kiểm chứng: video 2 chiều, tắt/bật
      mic-cam, rời phòng dọn sạch track và peer connection.
- [ ] **P3 — Vào lớp & chuông** `JoinLessonButton` ở MyBookings/AdminBookings,
      `IncomingCallDialog`, `onCallWritten` bắn FCM/notification, `platform: 'havitalk'`
      trong BookingPage + link trong email nhắc lịch.
- [ ] **P4 — Hoàn thiện** chia sẻ màn hình, chỉ báo chất lượng mạng
      (`pc.getStats()` → packet loss / RTT), tự kết nối lại khi `iceConnectionState`
      = `disconnected` (ICE restart), i18n 5 ngôn ngữ, cleanup job.

## 8. Rủi ro & cách xử lý

1. **TURN là bắt buộc, không phải tuỳ chọn.** ~10–20% cặp người dùng (NAT đối xứng,
   4G, mạng công ty) không nối P2P trực tiếp được. Không có TURN thì call im lặng
   fail — đúng lỗi khó debug nhất. Phải test bằng `iceTransportPolicy: 'relay'`.
2. **Safari/iOS**: bắt buộc `playsInline` trên `<video>`, `getUserMedia` phải nằm
   trong cùng một user gesture, và autoplay có tiếng chỉ chạy sau khi user chạm.
3. **Hai bên cùng bấm gọi (glare)**: quy ước **giáo viên luôn là caller**, học sinh
   luôn là callee — bỏ hẳn perfect-negotiation cho v1.
4. **Rò tài nguyên**: quên `track.stop()` khi rời trang → đèn camera vẫn sáng. Dọn
   trong cleanup của `useCallMedia`, kèm `beforeunload`.
5. **Chi phí Firestore**: mỗi cuộc gọi ~20–40 write (candidates). Không đáng kể, nhưng
   cleanup job giữ collection khỏi phình.
6. **Ghi hình buổi học**: nằm ngoài phạm vi v1 — P2P không có chỗ để ghi phía server;
   muốn ghi thì phải chuyển sang SFU (LiveKit/mediasoup). Ghi rõ để không bị hiểu nhầm.

---

# Phụ lục A — Phương án hạ tầng VM riêng (giống sysplat)

## A.1. Tách bạch: cái gì *thật sự* cần VM

| Thành phần | Cần VM? | Lý do |
|---|---|---|
| Signaling (SDP/ICE) | **Không** | Firestore `onSnapshot` làm đúng việc này, realtime, có sẵn auth |
| STUN | Không | Google STUN public, miễn phí |
| **TURN (relay)** | **Có** | Cần IP public + dải UDP rộng — Cloud Functions/Hosting không làm được |
| SFU (recording, >2 người) | Có | Chỉ cần khi mở rộng ngoài phạm vi 1:1 |

Nên có 3 mức, không phải chỉ "VM hay không VM":

- **A. VM chỉ chạy coturn** — signaling vẫn Firestore. VM stateless, không DB,
  không backup, chết thì dựng lại 10 phút. *Khuyến nghị.*
- **B. VM chạy coturn + signaling WebSocket** — port `signaling.py` của sysplat.
- **C. VM chạy LiveKit** — thay cả TURN lẫn signaling, kèm **recording**.

## A.2. Phương án A — VM chỉ chạy coturn

Chi phí thực tế (ước tính): 1 cuộc gọi 1:1 720p relay qua TURN tốn
~3 Mbps hai chiều ≈ **~1.4 GB egress mỗi giờ học**. Chỉ ~10–20% cuộc gọi phải relay.

| Lượng buổi học / tháng | Giờ relay | Egress | GCP ($0.12/GB) | Oracle A1 free (10 TB) |
|---|---|---|---|---|
| 100 | ~15 | ~21 GB | ~$2.5 | $0 |
| 1.000 | ~150 | ~210 GB | ~$25 | $0 |

→ **Oracle Ampere A1.Flex free tier** (README sysplat đã ghi: tới 24 GB RAM, 10 TB
egress/tháng) chạy coturn gần như miễn phí. coturn cực nhẹ về CPU/RAM — nó chỉ
chuyển tiếp gói tin, không giải mã media. 1 GB RAM dư sức.

Cấu hình khác `infrastructure/coturn/turnserver.conf` của sysplat ở 3 điểm:

```conf
# 1. Đổi lt-cred-mech (user/pass tĩnh) → credential ngắn hạn ký HMAC
use-auth-secret
static-auth-secret=<TURN_SECRET, trùng với Secret Manager của Functions>
realm=turn.havitalk.com

# 2. TLS thật (Let's Encrypt) — bắt buộc, vì trang chạy HTTPS
cert=/etc/letsencrypt/live/turn.havitalk.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.havitalk.com/privkey.pem
listening-port=3478
tls-listening-port=443        # 443/TCP để xuyên firewall công ty

# 3. IP: VM sau NAT của cloud thì phải khai báo cả hai
external-ip=<PUBLIC_IP>/<PRIVATE_IP>
min-port=49160
max-port=49200                # thu hẹp dải để security list dễ khai
denied-peer-ip=…              # giữ nguyên như sysplat, chặn SSRF vào mạng nội bộ
```

Firewall cần mở: **3478 TCP+UDP, 443 TCP+UDP, 49160–49200 UDP**.
Cả ở cloud security list *lẫn* iptables trên VM (gotcha đã ghi trong README sysplat:
script không tự mở được security list).

**Không đặt sau Cloudflare proxy** — Cloudflare không proxy được UDP của TURN, DNS
record phải để grey-cloud (lộ IP VM). Đây là khác biệt so với backend sysplat.

Callable `getIceServers` giữ nguyên như mục 4, chỉ đổi `TURN_URLS` sang domain của
mình. Nghĩa là: **làm phương án hosted trước, đổi sang VM sau chỉ là sửa 2 secret**
— không phải chọn ngay bây giờ.

## A.3. Phương án B — thêm signaling WebSocket lên VM

Port `apps/api/app/websockets/signaling.py` (44 dòng, rất gọn) sang Node/Fastify
hoặc giữ FastAPI. Nhưng phải thêm phần sysplat không có:
xác thực **Firebase ID token** ở handshake WS (`firebase-admin.verifyIdToken`) rồi
đối chiếu uid với `booking.teacherId/studentId` — vì HaviTalk auth nằm ở Firebase
chứ không phải JWT tự phát như sysplat.

Đổi lại được gì so với Firestore signaling: độ trễ thiết lập cuộc gọi thấp hơn
~100–300ms, và tiết kiệm ~30 write Firestore mỗi cuộc gọi (không đáng kể về tiền).

Đánh đổi: VM trở thành **điểm chết đơn** — VM sập thì không ai gọi được, trong khi
với phương án A, VM sập chỉ làm hỏng ~15% cuộc gọi cần relay. Với 1 buổi học đã trả
tiền thì đây là khác biệt lớn. **Không khuyến nghị** — lợi ích không xứng rủi ro.

## A.4. Phương án C — LiveKit self-host (nếu cần ghi hình)

Nếu **ghi hình buổi học** là yêu cầu thật (học viên xem lại, admin xử lý khiếu nại,
kiểm tra chất lượng giảng dạy) thì P2P không làm được, và lúc đó VM riêng không còn
là "tuỳ chọn" mà là bắt buộc — nên tính từ đầu thay vì viết P2P rồi đập đi.

LiveKit thay thế cả 3 lớp: SFU + TURN nhúng + signaling. Client dùng
`livekit-client` SDK, Cloud Function mint access token bằng `livekit-server-sdk`
(quyền theo room = bookingId). Recording qua LiveKit Egress → ghi thẳng lên
GCS/Firebase Storage.

Cái mất: ~800 LOC WebRTC thủ công ở mục 5 rút còn ~300 (SDK lo hết ICE/reconnect/
device switching — vốn là phần dễ sai nhất), nhưng thêm một service **có state**
phải vận hành: LiveKit + Redis, cần ~4 GB RAM, egress cao hơn TURN vì *mọi* cuộc gọi
đều đi qua server chứ không chỉ 15% (≈1.4 GB/giờ × 100% số buổi học).
Với 1.000 buổi/tháng ≈ 1,4 TB — vẫn nằm trong 10 TB free của Oracle.

## A.5. Quyết định (đã chốt với user)

> **Không cần ghi hình buổi học** → loại phương án C. **Chốt phương án A**:
> coturn trên 1 VM riêng, signaling để Firestore, media P2P 1:1.

B bỏ qua ở mọi trường hợp.

`getIceServers` ở P0 đã che phần TURN lại, nên **P0/P1/P2 viết được ngay với TURN
hosted, dựng VM song song** — không chặn nhau, đổi sang VM chỉ là sửa 2 secret.

## A.6. Cấu hình VM cần bao nhiêu?

**Rất nhẹ.** coturn chỉ chuyển tiếp gói UDP: media đã được mã hoá SRTP đầu-cuối,
nó *không* giải mã, *không* transcode, *không* ghi đĩa. Đây là bộ chuyển tiếp gói tin,
không phải máy chủ xử lý media — khác hẳn LiveKit/mediasoup.

### Định mức thật (1 cuộc gọi 1:1 720p được relay)

| Tài nguyên | Mức tiêu thụ |
|---|---|
| Băng thông qua NIC | ~3 Mbps vào + ~3 Mbps ra |
| CPU | không đáng kể (~1.000 phiên đồng thời / 1 core) |
| RAM | vài trăm KB / phiên |
| Đĩa | 0 (chỉ log) |

Nhớ: chỉ **10–20%** cuộc gọi phải relay, phần còn lại đi thẳng P2P không đụng VM.
20 buổi học diễn ra cùng lúc → ~3 cuộc relay → **~18 Mbps**. Một VM nhỏ nhất cũng dư.

### Cấu hình đề xuất

**1 vCPU / 1 GB RAM là đủ.** Cụ thể:
- **Oracle Ampere A1.Flex** (free tier: 1–4 OCPU, tới 24 GB RAM, 10 TB egress/tháng) — tốt nhất, egress miễn phí là thứ đáng giá nhất.
- Hoặc GCP `e2-micro` / AWS `t4g.nano` — thừa CPU, nhưng phải trả tiền egress.

**Đừng chọn theo vCPU/RAM — chọn theo 2 thứ này:**

1. **Giới hạn băng thông của shape**, không phải CPU. Nhiều shape nhỏ bị bóp egress
   (AWS t-class dùng burst credit, hết credit là tụt). Cần shape cho **egress ổn định
   ≥100 Mbps** (≈33 cuộc relay đồng thời). Oracle A1 cho ~1 Gbps/OCPU.
2. **Vị trí địa lý — quan trọng hơn cấu hình máy.** TURN nằm trên đường đi của media,
   mỗi ms RTT thêm vào là độ trễ thật của buổi học. Người dùng HaviTalk ở
   **Hàn Quốc + Việt Nam** → đặt ở **Seoul** (`asia-northeast3` / Oracle Seoul), hoặc
   **Singapore** nếu muốn cân bằng hai đầu. Đặt ở US/EU thì cuộc gọi relay sẽ trễ
   rõ rệt dù CPU rảnh 99%.

### Tinh chỉnh hệ điều hành (phần dễ quên hơn cấu hình phần cứng)

```conf
# turnserver.conf
relay-threads=0            # 0 = tự đặt bằng số core
no-cli                     # tắt cổng telnet quản trị 5766
no-tlsv1
no-tlsv1_1
```
```bash
ulimit -n 65535                                   # mỗi phiên relay tốn nhiều fd
sysctl -w net.netfilter.nf_conntrack_max=131072   # UDP flow ăn bảng conntrack
# hoặc NOTRACK cho dải 49160-49200 để khỏi qua conntrack
```
Nghẽn thực tế của coturn hầu như luôn là **file descriptor / conntrack**, chứ không
phải CPU. Thêm 2 GB swap như `provision-remote.sh` của sysplat cho chắc, dù gần như
không dùng tới.

## Review — đã hiện thực (P0→P4, code xong)

### File mới
| File | LOC | Vai trò |
|---|---|---|
| `src/types/call.ts` | 129 | `CallDoc`, `CallStatus`, hằng số presence/ring/join-window |
| `src/lib/webrtc.ts` | 238 | Signaling qua Firestore + `getConnectionRoute()` |
| `src/lib/callWindow.ts` | 61 | Khung giờ vào lớp, đếm ngược |
| `src/hooks/useCall.ts` | 402 | State machine WebRTC (file lớn nhất, vẫn dưới 500) |
| `src/hooks/useCallMedia.ts` | 238 | Camera/mic, đổi thiết bị, chia sẻ màn hình |
| `src/hooks/useIceServers.ts` | 45 | Gọi callable, cache theo TTL |
| `src/pages/CallPage.tsx` | 164 | Route `/call/:bookingId` + các cổng chặn |
| `src/components/call/*.tsx` | 68–163 | VideoStage, CallControls, CallLobby, IncomingCallDialog, JoinLessonButton |
| `functions/src/ice.ts` | 103 | `getIceServers` — credential HMAC ngắn hạn |
| `functions/src/callTriggers.ts` | 62 | Push cho bên vắng mặt |
| `functions/src/callCleanup.ts` | 43 | Xoá phòng + candidates sau 7 ngày |
| `public/locales/{en,vi,ko,zh,ja}/call.json` | — | i18n đủ 5 ngôn ngữ |

### Khác so với kế hoạch ban đầu
1. **Không dùng cờ `studentReady` boolean** mà dùng `teacherReadyAt`/`studentReadyAt` là
   timestamp + heartbeat 20s, coi là vắng mặt nếu cũ hơn 60s. Firestore không có
   `onDisconnect`, nên tab đóng đột ngột sẽ để lại presence rác — chỉ tuổi của
   heartbeat mới là tín hiệu thật.
2. **Thêm `session` (generation counter)** vào call doc, mỗi ICE candidate mang số
   generation của nó. Gọi lại lần 2 chỉ cần tăng số này thay vì phải xoá candidates
   cũ — candidate của lần thử bỏ dở không bao giờ lọt vào kết nối kế tiếp.
3. **Vai trò cố định trong rules**, không chỉ trong client: chỉ giáo viên ghi được
   `offer`, chỉ học sinh ghi được `answer`, mỗi bên chỉ khai được presence của mình.
   Glare bị chặn ở tầng dữ liệu chứ không phải bằng quy ước.
4. **`getConnectionRoute()` chạy thật** ngay khi kết nối lên: đọc `pc.getStats()`,
   lấy candidate pair đã thắng, phân loại `host`/`srflx`/`relay` và hiện badge trong
   thanh điều khiển. Đây là câu trả lời cho câu hỏi "TURN dùng cho bao nhiêu %".
   *Chưa ghi số này vào Firestore* — xem mục còn thiếu.
5. **`platform: 'havitalk'` là mặc định** ở BookingPage (đứng đầu danh sách), và
   email nhắc lịch tự trỏ tới `/call/{bookingId}` cho loại này.
6. **Admin không thấy nút vào lớp.** `JoinLessonButton` kiểm tra uid có phải
   teacher/student của booking không — admin xem mọi booking nhưng không vào được
   phòng, đưa nút dẫn tới cửa khoá còn tệ hơn không đưa gì.

### Đã kiểm chứng
- `npm run build` (tsc -b + vite) — pass.
- `tsc --noEmit` trong `functions/` — pass.
- `eslint` trên toàn bộ file mới — 0 lỗi, 0 cảnh báo.
- **`firestore.rules` biên dịch được**: tạo ruleset tạm qua Firebase Rules API rồi xoá
  (không release, rules đang chạy không bị đụng) → compile OK.
- **Chưa chạy thử cuộc gọi thật giữa hai máy** — cần deploy rules + functions trước.

### Bổ sung sau lượt đầu
7. **Ghi `route` vào Firestore** (`recordRoute()` trong `webrtc.ts`, gọi từ
   `onconnectionstatechange`). Tỉ lệ relay giờ đo được bằng một truy vấn:
   `calls` where `route == 'relay'` chia cho tổng số call có `route`. Cả hai bên
   cùng ghi một giá trị giống nhau — write thứ hai vô hại.
8. **Tự kết nối lại bằng ICE restart.** `iceConnectionState` chuyển `disconnected`
   → chờ 4 giây (phần lớn tự lành) rồi giáo viên `createOffer({iceRestart: true})`
   trên **chính connection đang sống**, mở generation mới. Học sinh nhận offer thì
   `adopt()` connection cũ thay vì dựng lại — giữ nguyên track, chớp 1–2 giây thay
   vì phải vào lại phòng. `failed` thì restart ngay, không chờ.
   Có banner "Đang kết nối lại…" trên khung video (i18n đủ 5 thứ tiếng).
9. **Tách `usePeerConnection.ts`** khỏi `useCall.ts`: `useCall` chạm trần 500 LOC
   sau khi thêm ICE restart. Giờ `useCall` (353) lo signaling — ai offer, ai đang
   ở lobby, khi nào rung chuông; `usePeerConnection` (253) lo API trình duyệt.

### Còn thiếu / bước tiếp theo
1. **Deploy**: `firebase deploy --only firestore:rules,functions`. Trước đó set
   secret nếu đã có TURN: `firebase functions:secrets:set TURN_URLS` và `TURN_SECRET`.
   Chưa set thì `getIceServers` trả STUN-only và log cảnh báo — chạy được nhưng
   ~20–35% cặp sẽ không kết nối nổi.
2. **Dựng VM coturn** theo Phụ lục A.2 (Oracle A1 free tier, đặt ở Seoul).
3. **Chạy thử cuộc gọi thật** giữa hai máy/hai mạng khác nhau — chưa làm được vì
   cần rules + functions đã deploy.
4. **Test trên Safari/iOS** — `playsInline` đã có, nhưng autoplay có tiếng và
   `getUserMedia` trong user gesture cần thử trên máy thật.
5. **Ép đường relay để test TURN**: tạm đặt `iceTransportPolicy: 'relay'` trong
   `usePeerConnection.ts` khi dựng `RTCPeerConnection` — nếu cuộc gọi vẫn lên thì
   TURN thật sự hoạt động. Không có bước này thì TURN hỏng vẫn "trông như" chạy tốt,
   vì đa số cặp đi thẳng P2P.
