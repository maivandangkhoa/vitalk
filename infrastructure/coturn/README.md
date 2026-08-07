# coturn — TURN relay cho lớp học video HaviTalk

Triển khai lên **VM "fechtin"** — `144.24.80.61`, Oracle `ap-chuncheon-1`
(Chuncheon, Hàn Quốc), 4 vCPU Ampere / 15 GB RAM.

> **Không phải** VM sysplat (`138.2.169.59`) — máy đó ở `eu-frankfurt-1`, relay
> media qua Frankfurt cho hai người ở Hàn Quốc là +250–300 ms, hỏng hẳn nhịp hội
> thoại của buổi học.

## Vì sao thiết kế như thế này

| Quyết định | Lý do |
|---|---|
| `network_mode: host` | Sau bridge NAT, coturn quảng bá `172.17.0.x` làm địa chỉ relay → candidate không ai tới được. Và publish dải relay theo kiểu `-p` sẽ sinh một `docker-proxy` cho **mỗi** cổng. |
| `external-ip=144.24.80.61/10.0.0.177` | VM nằm sau NAT của Oracle; thiếu dòng này coturn quảng bá IP nội bộ và relay chết **im lặng**. |
| `use-auth-secret` | Credential ký HMAC, hết hạn sau 4 giờ, do Cloud Function `getIceServers` cấp. Nhúng user/password tĩnh vào bundle frontend = TURN công cộng trong một tuần. |
| UDP 3478/5349 + **UDP 443**, không đụng TCP 443 | Caddy chỉ giữ `443/tcp`; `443/udp` trống. Chia sẻ TCP 443 sẽ cần lớp định tuyến SNI đặt trước **8 dịch vụ production** khác — rủi ro không tương xứng. |
| Dải relay hẹp `49160-49400` | Mặc định của coturn là 16k cổng, không khai nổi trong Security List. 240 allocation đồng thời đã vượt xa nhu cầu. |
| Copy cert thay vì mount chung | Caddy lưu cert `0600 root`, coturn thì drop privileges. Copy do mình sở hữu là mối nối ổn định giữa hai bên. |

## Triển khai

### 1. DNS (thủ công, Cloudflare)
Tạo A record **grey-cloud** (DNS only, mây xám):

```
turn.fechtin.com  A  144.24.80.61
```

Cloudflare không proxy được TURN. IP này vốn đã lộ qua `luna.fechtin.com` và
`origin-vm.fechtin.com` nên không phát sinh rủi ro mới.

### 2. Cert (Caddy cấp, coturn dùng)
Thêm block trong [`Caddyfile.snippet`](./Caddyfile.snippet) vào
`/home/ubuntu/proxy/Caddyfile`, rồi:

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Kiểm tra Caddy đã lấy được cert:

```bash
docker exec caddy ls /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/turn.fechtin.com/
```

### 3. Đẩy file lên VM

```bash
KEY=/Users/Shared/oracle/ssh-key-2026-06-05.key
rsync -av -e "ssh -i $KEY" infrastructure/coturn/ ubuntu@144.24.80.61:/home/ubuntu/coturn/
```

### 4. Cấu hình + secret

```bash
ssh -i $KEY ubuntu@144.24.80.61
cd /home/ubuntu/coturn
cp turnserver.conf.example turnserver.conf
openssl rand -hex 32                      # dán vào static-auth-secret
chmod 600 turnserver.conf
sudo chown 65534:65534 turnserver.conf    # BẮT BUỘC — xem "Cái bẫy" ở cuối
chmod +x sync-certs.sh setup-firewall.sh
sudo ./sync-certs.sh                      # kéo cert ra ./certs, chown 65534
```

Giữ lại giá trị secret — bước 7 cần nó.

### 5. Mở cổng

```bash
sudo ./setup-firewall.sh
```

Rồi **mở tay trong Oracle console → Security List** (ingress `0.0.0.0/0`) —
script không với tới tầng này được:

```
UDP  3478, 5349, 443, 49160-49400
TCP  3478, 5349
```

### 6. Chạy

```bash
docker compose up -d
docker logs -f coturn
```

Đặt cron gia hạn cert:

```bash
sudo crontab -e
# 17 4 * * * /home/ubuntu/coturn/sync-certs.sh >> /var/log/coturn-certs.log 2>&1
```

### 7. Trỏ HaviTalk sang

```bash
cd /Users/Shared/projects/vitalk
firebase functions:secrets:set TURN_URLS
# turn:turn.fechtin.com:3478?transport=udp,turn:turn.fechtin.com:443?transport=udp,turn:turn.fechtin.com:3478?transport=tcp,turns:turn.fechtin.com:5349?transport=tcp

firebase functions:secrets:set TURN_SECRET
# dán static-auth-secret ở bước 4

firebase deploy --only functions:getIceServers
```

## Kiểm chứng

**1. Cổng có mở thật không.** Đừng dùng `nc -zu` — UDP không bắt tay, không có
phản hồi trông y hệt cổng đang mở, nên nó luôn báo "succeeded". Phải gửi một gói
STUN thật và chờ trả lời:

```bash
# TLS (TCP) — cái này nc kiểm tra được
nc -zv turn.fechtin.com 5349

# UDP — dùng client của chính coturn
docker run --rm coturn/coturn turnutils_stunclient -p 3478 turn.fechtin.com
docker run --rm coturn/coturn turnutils_stunclient -p 443  turn.fechtin.com
```

Ra được dòng `MAPPED-ADDRESS` là cổng thông. Timeout nghĩa là còn kẹt ở Security
List hoặc iptables.

**2. Credential có hợp lệ không** — dán vào
[Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
một `iceServers` do `getIceServers` trả về. Phải thấy candidate `typ relay`.
Không có dòng `relay` nào nghĩa là TURN chưa chạy, dù STUN vẫn ra kết quả.

**3. Ép đi đường relay — bước quan trọng nhất.** Tạm sửa trong
`src/hooks/usePeerConnection.ts`:

```ts
const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: 'relay' });
```

Gọi thử một cuộc. Lên được nghĩa là TURN thật sự hoạt động. **Bỏ qua bước này
thì TURN hỏng vẫn trông như chạy tốt**, vì đa số cặp đi thẳng P2P và không bao
giờ chạm tới relay — đúng kiểu lỗi chỉ lộ ra khi gặp học viên dùng 4G.

**4. Số liệu thật.** `recordRoute()` ghi `host`/`srflx`/`relay` vào từng document
`calls`. Tỉ lệ phải relay đo được bằng một truy vấn, không cần đoán:

```
calls where route == 'relay'  ÷  tổng số calls có route
```

## Cái bẫy đã gặp khi triển khai — đọc trước khi debug

**coturn KHÔNG báo lỗi khi không đọc được config.** Image chạy bằng user
`nobody` (uid 65534). File `turnserver.conf` mode 600 thuộc `ubuntu` (uid 1000)
là không đọc được → coturn **âm thầm khởi động với cấu hình mặc định**, log ra
đúng một dòng `WARNING Certificate file not found: //turn_server_cert.pem` rồi
chạy tiếp như bình thường. Nhìn `docker ps` thấy `Up`, nhìn `ss` thấy đang nghe
cổng — mà không có realm, không có secret, không có TLS.

Cách nhận biết trong log là **dòng realm**:

```
INFO Default realm: turn.fechtin.com            ← config đã nạp
INFO Certificate file found: /etc/coturn/certs/turn.fechtin.com.crt
INFO   relay 10.0.0.177 initialization...       ← chỉ đúng một địa chỉ
```

Nếu thấy `Default realm:` trống, hoặc thấy nó liệt kê hàng loạt
`Listener address to use: 172.x.x.x` (các bridge của Docker) thì config **chưa**
được nạp. Chữa:

```bash
sudo chown 65534:65534 /home/ubuntu/coturn/turnserver.conf
sudo /home/ubuntu/coturn/sync-certs.sh   # tự chown cert về 65534
sudo docker restart coturn
```

Liên quan: nếu thiếu `listening-ip`/`relay-ip`, coturn dò ra **toàn bộ** địa chỉ
trên host — trên VM này là 11 gateway bridge của Docker — rồi quảng bá chúng làm
địa chỉ relay. Client nhận được một đống candidate `172.x` không đi tới đâu.

## Vận hành

- **Băng thông** là tài nguyên tốn tiền duy nhất: ~1,4 GB egress cho mỗi giờ học
  bị relay. Oracle free tier cho 10 TB/tháng — 1.000 buổi/tháng relay 100% mới
  hết ~1,4 TB.
- **CPU/RAM không đáng kể**: coturn chỉ chuyển tiếp gói, media đã mã hoá SRTP
  đầu-cuối nên nó không giải mã, không transcode.
- **Nghẽn thật của coturn** là file descriptor và bảng conntrack, không phải CPU.
  Nếu tải tăng: `ulimit -n 65535` và nâng `net.netfilter.nf_conntrack_max`.
- **Đổi nhà cung cấp TURN** chỉ là đổi hai secret — `getIceServers` che toàn bộ
  phần này khỏi frontend.

## sysplat cũng nên trỏ sang đây

`.env` production của sysplat đang để `TURN_SERVER=turn:localhost:3478` — trỏ
vào một service không tồn tại trên VM đó. Nghĩa là WebRTC của sysplat hiện chỉ
chạy với các cặp nối thẳng P2P được. Sau khi coturn chạy:

```
TURN_SERVER=turn:turn.fechtin.com:3478
```

Lưu ý sysplat cần đổi từ `lt-cred-mech` (user/password tĩnh
`consultation:consultation123`) sang lấy credential ngắn hạn như HaviTalk, hoặc
coturn phải bật thêm `lt-cred-mech` song song — nhưng credential tĩnh đó hiện
nằm trong repo, nên nên đổi hẳn. Ngoài ra người dùng sysplat có thể ở châu Âu;
nếu vậy cân nhắc dựng thêm một coturn gần họ.
