# Quickplay – Hướng dẫn nhanh cho giáo viên (1 trang)

## Lần đầu (làm một lần, khoảng 15 phút)

1. Mở trang Quickplay (`/teacher`) → đăng nhập bằng tài khoản quản trị cấp.
2. Trang **Cài đặt** tự mở. Tạo một thư mục riêng trên Google Drive rồi làm lần lượt **5 bước của Trình cài đặt Apps Script**
   (dán link thư mục → Sao chép mã → dán vào Apps Script mới → Triển khai → dán link `/exec` và bấm Kiểm tra).
3. Vào **Cài đặt → Tài khoản → Email khôi phục**, điền email cá nhân để sau này tự lấy lại mật khẩu khi quên.

Từ lần sau, đăng nhập ở máy nào phần mềm cũng tự kết nối lại Google Drive của thầy cô. Muốn cất dự phòng: **Cài đặt → Sao lưu và khôi phục**.

Chưa cài Apps Script vẫn dùng thử được ở chế độ **"Chỉ máy này"** (dữ liệu nằm trong trình duyệt của máy đang dùng,
học sinh chỉ vào được từ cùng máy).

## Soạn bộ câu hỏi

- **Thư viện → Tạo bộ đề**, hoặc **Nhập từ tệp** (Word, PDF, Excel, Google Form), hoặc **AI sinh đề**.
  Tải **mẫu Word chuẩn** ngay trong hộp Nhập từ tệp.
- Xếp bộ đề vào **Môn học → Chương/Chủ đề → Bài** ở cột bên trái thư viện.
- Trong trang soạn: đặt **ảnh bìa** (dán, tải lên, dán link, hoặc dùng lại ảnh đã có); đặt **điểm** từng câu hoặc
  chia đều tổng điểm; đặt **thời gian** cho tất cả câu hoặc chọn ngay trên từng câu.
- Bấm **Chơi thử như học sinh** để xem đúng những gì học sinh sẽ thấy.
- Hai bộ mẫu **Tiếng Việt 1** và **Tiếng Anh 1** (đủ mọi dạng câu) có sẵn trong **Thư viện công cộng**.

## Tổ chức cho học sinh làm

Bấm **Tổ chức** trên bộ đề rồi chọn một trong bốn cách:

| Cách | Dùng khi | Học sinh cần |
|---|---|---|
| **Giáo viên điều khiển** | Cả lớp cùng làm từng câu, thầy cô chuyển câu | Điện thoại / máy tính |
| **Trực tiếp tự do** | Mỗi em tự làm theo tốc độ của mình trong giờ học | Điện thoại / máy tính |
| **Bài về nhà** | Giao bài có hạn nộp (1–3 ngày, 1–2 tuần hoặc tự đặt) | Điện thoại / máy tính |
| **Thẻ trả lời (giấy)** | Lớp không có thiết bị: em giơ thẻ, thầy cô quét bằng điện thoại | Chỉ cần thẻ giấy đã in |

Học sinh vào bằng **link, mã PIN 6 số hoặc mã QR**, nhập **mã PIN – tên – lớp**.

Các lựa chọn hay dùng trong hộp Tổ chức: số **lượt làm lại câu sai**, **làm lần lượt / tự do chọn câu**,
**tự sang câu sau / học sinh bấm "Câu tiếp theo"**, **chống gian lận** (toàn màn hình, số lần vi phạm cho phép),
số bạn hiện trên **bảng xếp hạng** (3/5/10/15/tất cả).

## Điểm và điểm thưởng

- **Điểm** = điểm của câu × phần làm đúng. Trả lời chậm không bị trừ.
- **Điểm thưởng** (cộng riêng): +20% khi đúng trong nửa đầu thời gian; +50% mỗi 3 câu đúng liên tiếp.
- **Xếp hạng** theo điểm + điểm thưởng. **Mức đánh giá** chỉ theo điểm:
  Hoàn thành xuất sắc ≥ 90% · Hoàn thành tốt ≥ 70% · Đạt yêu cầu ≥ 50% · Chưa đạt yêu cầu < 50%.

## Trong và sau buổi học

- Màn hình giáo viên có 4 thẻ: **Bảng điều khiển · Thống kê · Giám sát gian lận · Bảng xếp hạng**.
- Câu **trả lời miệng**: chấm ở thẻ "Chấm trả lời miệng" (từng em hoặc "Tất cả đúng").
- Bấm **Kết thúc** bất cứ lúc nào để xem bục vinh danh và báo cáo; **Xuất PDF (A4 ngang)** hoặc **Excel chi tiết**.
- Xem lại các buổi cũ ở mục **Báo cáo**.

## Khi gặp trục trặc

| Hiện tượng | Cách xử lý |
|---|---|
| Học sinh báo "Mất mạng" | Phần mềm tự gửi lại câu trả lời khi có mạng; em cứ để nguyên trang |
| "Máy chủ đang bận" | Lớp đông gửi cùng lúc; phần mềm tự thử lại sau vài giây |
| Học sinh mở link bị đòi đăng nhập Google | Apps Script chưa đặt quyền **Bất kỳ ai** (xem hướng dẫn cài đặt) |
| Vừa cập nhật phần mềm mà tính năng mới không chạy | Dán lại `Code.gs` mới và triển khai **Phiên bản mới** |

Tác giả: Nguyễn Thanh Liêm – Zalo: 0888358363
