# Quickplay – Hướng dẫn nhanh cho giáo viên (1 trang)

## Lần đầu (làm một lần, khoảng 15 phút)

1. Mở trang Quickplay (`/teacher`) → đăng nhập bằng tài khoản quản trị cấp.
2. Trang **Cài đặt** tự mở. Tạo một thư mục riêng trên Google Drive rồi làm lần lượt **5 bước của Trình cài đặt Apps Script**
   (dán link thư mục → Sao chép mã → dán vào Apps Script mới → Triển khai → dán link `/exec` và bấm Kiểm tra).
3. Vào **Cài đặt → Tài khoản → Email khôi phục**, điền email cá nhân để sau này tự lấy lại mật khẩu khi quên.

Từ lần sau, đăng nhập ở máy nào phần mềm cũng tự kết nối lại Google Drive của thầy cô. Mọi dữ liệu nằm trên Google Drive nên dùng được trên mọi máy.
Muốn giữ một bản dự phòng: **Cài đặt → Sao lưu và khôi phục → Tải file sao lưu toàn bộ** (một tệp `.json` duy nhất).

## Cập nhật Apps Script khi có bản mới

**Cách thông thường: 5 bước cập nhật tay.** Khi Quickplay có bản Apps Script mới, đầu trang giáo viên hiện lời nhắc màu vàng. Bấm **Xem 5 bước cập nhật**
(Cài đặt → Nơi lưu dữ liệu), rồi làm 5 bước: sao chép mã mới → dán đè vào `Mã.gs` của dự án đang dùng → Triển khai **Phiên bản mới** → dán link và bấm Kiểm tra.
Mất khoảng 3 phút; link, khóa và dữ liệu giữ nguyên. Chỉ dán vào `Mã.gs`, không phải sửa tệp nào khác.

**Nâng cao, không bắt buộc: tự cập nhật** (Cài đặt → mục gập *Nâng cao: tự cập nhật (cần Google Cloud)*).
- Làm đủ các việc dưới đây thì khi có bản mới, Apps Script tự cập nhật lúc thầy cô mở trang giáo viên, rồi hiện "Apps Script đã tự cập nhật lên phiên bản …".
- Phần mềm không tự cập nhật khi đang có buổi học trực tiếp.
- Từ 10/2026, Google Cloud bắt buộc Gmail có **xác thực hai bước**, nên phần này chỉ dành cho thầy cô quen thao tác với tài khoản Google.

Mỗi việc làm **một lần**:
1. Bật **xác thực hai bước** cho Gmail chạy Apps Script.
2. Bật **Google Apps Script API** trong cài đặt Apps Script của Gmail.
3. Dán tệp cấu hình vào **tệp `appsscript.json`** của dự án, không dán vào `Mã.gs`. Muốn thấy tệp này: ⚙ Cài đặt dự án → mục Chung → tích "Hiển thị tệp kê khai…".
4. Trong `Mã.gs`, ô chọn hàm chọn `kiemTraTuCapNhat`, bấm ▷ Chạy. Khi Google hỏi quyền, **tích "Chọn tất cả"** rồi Tiếp tục.
5. Nhật ký báo cần bật API cho **dự án Google Cloud**:
   - Mở link trong nhật ký.
   - Chấp nhận điều khoản Google Cloud, bấm **Bật (Enable)**.
   - Đợi 2–3 phút rồi chạy lại hàm.
   - Nhật ký báo "ĐỦ ĐIỀU KIỆN TỰ CẬP NHẬT" là xong. Triển khai Phiên bản mới như mọi lần.

**Báo "chưa được cấp 2 quyền tự cập nhật":** nguyên nhân thường là lúc cấp quyền đã bỏ trống ô quyền "quản lý dự án / bản triển khai Apps Script".
Google coi như từ chối và không hỏi lại.
- **Cách 1:** chạy `kiemTraTuCapNhat` như việc 4 ở trên, tích "Chọn tất cả".
- **Cách 2, chỉ khi Google vẫn không hỏi:**
  1. Mở https://myaccount.google.com/connections bằng Gmail chạy Apps Script.
  2. Tìm đúng tên dự án Apps Script của mình, chọn **Xóa mọi quyền truy cập**.
  3. Chạy lại `kiemTraTuCapNhat` và tích "Chọn tất cả".
  - Từ lúc xóa tới lúc cấp lại (khoảng 1 phút), link Apps Script ngừng chạy, học sinh không vào phòng được. Chỉ làm khi không có lớp.

Trong mục gập Nâng cao có nút **Cập nhật ngay** và **Kiểm tra điều kiện**. Bấm Kiểm tra điều kiện sẽ hiện lý do kèm lỗi gốc của Google,
và nút mở đúng trang cần bật. Không tự cập nhật được thì vẫn dùng **5 bước cập nhật tay** như trên.

## Sao lưu, khôi phục và chuyển sang Google Drive mới

**Cài đặt → Sao lưu và khôi phục → Tải file sao lưu toàn bộ** tạo MỘT tệp `quickplay-saoluu_<tên đăng nhập>_<ngày>_<tháng>_<năm>_<giờ>h<phút>.json` gồm:
thông tin tài khoản (tên đăng nhập, họ tên, email), môn học – chương – bài, lớp và học sinh, tất cả bộ câu hỏi, kết quả các buổi đã tổ chức,
và **ảnh, âm thanh trong câu hỏi** (đóng gói ngay trong tệp, nên tệp dùng được kể cả khi Drive cũ không còn).

- **Khi Google Drive đầy**, phần mềm hiện cảnh báo đỏ ở mọi trang kèm nút **Tải file sao lưu toàn bộ** (vẫn tải được khi Drive đã đầy). Từ 90% dung lượng trở lên, phần mềm nhắc trước.
- **Chuyển sang Drive mới:** tải file sao lưu → tạo thư mục ở Google Drive mới → chạy lại Trình cài đặt (Cài đặt → Nơi lưu dữ liệu) bằng Gmail mới →
  **Khôi phục từ file sao lưu** → chọn **Google Drive đang kết nối**. Ảnh, âm thanh được tải lên Drive mới, link trong câu hỏi tự đổi theo.

**Tiết kiệm dung lượng (Gmail miễn phí chỉ có 15 GB):** ảnh tự đổi sang WebP (cạnh dài tối đa 1280 điểm ảnh), âm thanh tự đổi sang Opus 24 kbit/s một kênh
(1 phút khoảng 180 KB) trước khi tải lên; ảnh trùng chỉ lưu một lần. Video nên nhúng link YouTube: không tốn dung lượng Drive, phát mượt trên điện thoại.

## Kho đề thi và tổ chức thi nhiều đề

1. **Ra đề:** Thư viện → thẻ **Đề thi** → **Tạo đề thi từ ngân hàng câu hỏi**. Chọn Khối lớp, Môn, **Thời điểm kiểm tra**
   (thường xuyên, giữa kì I, cuối kì I, giữa kì II, cuối kì II); **mã đề** tự gợi ý (VD `TIN3-CK1-01`) và sửa được. Tích chọn câu hỏi
   (từng câu, nhiều câu hoặc cả bộ đề) rồi bấm **Tạo đề thi**; trình soạn mở ra để thêm câu mới, sửa, sắp xếp. Bộ đề có sẵn cũng chuyển thành
   đề thi được: mở bộ đề, tích **Đây là đề thi**. Đề thi luôn để riêng tư.
2. **Nhiều đề cho một kì:** trong nhóm kì kiểm tra (VD *Tin học · Lớp 3 · Cuối học kì I*) bấm **Thêm đề**, mã đề tự tăng (…-02, …-03).
   Các đề cùng kì nên **cùng số câu** (phần mềm không cho tổ chức thi chung các đề khác số câu).
3. **Tổ chức thi:** tích các đề muốn dùng → **Tổ chức thi** → chọn **Bốc ngẫu nhiên 1 đề** (cả lớp chung một đề), **Bốc ngẫu nhiên 2 đề**
   hoặc **Dùng cả các đề**. Phần mềm bốc đề lúc bấm Mở phòng kiểm tra (thầy cô không biết trước đề nào). Có từ 2 đề, mỗi em vào phòng được giao
   đề đang có ít bạn nhất, nên số em mỗi đề chênh nhau nhiều nhất 1 em.
4. Em thấy **Mã đề** của mình trên màn hình làm bài và màn kết quả; màn giáo viên hiện số em mỗi đề, mã đề của từng em; bảng điểm Excel có cột **Mã đề**.
   Cần Apps Script 1.5.7 trở lên.

## Bài kiểm tra theo danh sách lớp

1. **Đặt mã số học sinh:** Dạy học trên lớp → Lớp học → **Mã học sinh**. Gõ mã vào từng ô, hoặc điền chữ đứng đầu (ví dụ `HS`) và số bắt đầu rồi bấm
   **Tạo mã tự động** (HS1, HS2…), hoặc bấm **Dán mã có sẵn** để dán số căn cước, mã định danh hay tên đăng nhập từ Excel
   (mỗi dòng một mã theo thứ tự danh sách, hoặc chép hai cột Họ tên + Mã). Mã dài tối đa 32 ký tự, không phân biệt hoa thường.
   Bấm **Lưu mã**, rồi **Xuất Excel** để in hoặc gửi danh sách (lớp, họ tên, mã số) cho học sinh.
2. **Giao bài:** Thư viện → **Tổ chức** trên bộ câu hỏi → chọn **Bài kiểm tra** → chọn lớp, điền thời gian làm bài (phút), chọn **cách làm bài**:
   - **Từng câu một, như trò chơi:** trả lời xong em bấm **Câu tiếp theo** hoặc bấm số câu trong bảng số câu;
   - **Cả bài trên một trang:** cuộn xuống làm lần lượt, có thanh "đã trả lời x/y câu" và bảng số câu để nhảy tới câu chưa làm;
   - **Đề giấy, như bài kiểm tra trên lớp:** cả bài trên một trang trình bày như tờ đề in: đầu đề có Trường / Họ và tên / Lớp, ngày làm bài,
     tên kì kiểm tra, năm học, mã đề, môn và thời gian; ô **Điểm | Lời phê**; câu hỏi chia phần theo dạng câu (I. Trắc nghiệm, II. Đúng hay Sai,
     III. Điền vào chỗ trống…), mỗi câu ghi số điểm (thang 10, các câu bằng điểm nhau), phương án A–D xếp 2 cột. Nộp bài xong, tờ đề hiện điểm,
     lời phê tự động và điểm từng phần. Cần Apps Script 1.6.0 trở lên; máy chủ cũ hơn thì học sinh làm theo kiểu "Cả bài trên một trang".

     **Tên trường** và **năm học** in ở đầu đề do thầy cô điền khi tạo đề thi (hộp **Tạo đề thi từ ngân hàng câu hỏi**, hoặc tích **Đây là đề thi**
     trong màn soạn đề). Tên trường được nhớ cho lần tạo đề sau; năm học mặc định theo ngày hiện tại (từ tháng 8 sang năm học mới).

   Chọn **xem lại bài làm** sau khi nộp: *Khi thầy cô thu bài* (nên dùng), *Ngay khi nộp* hoặc *Không cho xem*. Xem lại gồm đúng/sai từng câu, đáp án em chọn,
   đáp án đúng và lời giải. Bật / chỉnh **Chống gian lận** (mặc định nhắc nhở 3 lần, lần thứ 4 khóa bài) → **Mở phòng kiểm tra**.
   Hai lựa chọn mới cần Apps Script 1.5.5 trở lên (Cài đặt → Xem 5 bước cập nhật).
3. **Học sinh vào làm:** mở link hoặc quét mã QR thầy cô gửi, gõ **mã số học sinh**: họ tên và lớp tự điền theo danh sách lớp để em kiểm tra
   rồi bấm **Tham gia** (em vẫn có thể tự gõ cả ba ô). Chỉ mã có trong lớp mới vào được; mỗi mã làm một lần.
4. Thầy cô bấm **Bắt đầu**: đồng hồ chạy, hết giờ phần mềm tự thu bài. Trong lúc làm, học sinh không được báo đúng hay sai.
   Chưa bấm **Nộp bài kiểm tra** và còn giờ thì em được bấm **Chọn lại đáp án** ở câu đã làm, như khoanh lại trên đề giấy.
   Tra mã và chọn lại đáp án cần Apps Script 1.5.6 trở lên.
   Làm xong em bấm **Nộp bài kiểm tra** và thấy số câu đúng, số câu sai, điểm thang 10 và mức đánh giá; nộp rồi không làm lại được.
   **Mạng lỗi, câu hỏi hoặc hình không hiện:** em bấm phím **F5** hoặc nút **Tải lại** cạnh mã đề (máy tính bảng, điện thoại không có F5).
   - Trang tải lại, bài đã làm vẫn giữ nguyên, và **không bị tính vi phạm**.
   - Thẻ Giám sát ghi một dòng thông tin "Tải lại trang, vắng N giây" để thầy cô theo dõi.
   - Ảnh lỗi do mạng thì phần mềm tự tải lại ảnh đó vài lần trước.
   - Cần Apps Script 1.5.8.
5. **Giám sát:** màn hình của thầy cô hiện số em đã vào, đã nộp, chưa vào; thẻ **Bảng điểm** có hạng, họ tên, lớp, mã số HS, trạng thái, điểm/10,
   số câu đúng, sai, bỏ trống và mức đánh giá; thẻ **Giám sát gian lận** hiện từng lần vi phạm và nút **Mở khóa** cho bài bị khóa.
6. **Xuất bảng điểm Excel:** trang tính đầu tiên "Bảng điểm" có đủ các cột trên (cả em chưa vào thi), cuối bảng có sĩ số, số em đã nộp, điểm trung bình
   và số em ở từng mức: Hoàn thành xuất sắc (từ 9 điểm), Hoàn thành tốt (từ 7), Hoàn thành (từ 5), Chưa đạt (dưới 5).

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

**Trực tiếp tự do** và **Giao bài về nhà** không giới hạn số lần làm:
- Em vào lại với cùng tên bao nhiêu lần cũng được, phần mềm không hỏi lại.
- Mỗi lần vào là một lượt mới (lần 1, lần 2…) có giờ vào riêng, nên kết quả các lượt trước không bị ghi đè.
- Bảng xếp hạng hiện lượt mới nhất; báo cáo và tệp Excel có đủ mọi lượt.
- Cần Apps Script 1.5.8.

Các lựa chọn hay dùng trong hộp Tổ chức: số **lượt làm lại câu sai**, **làm lần lượt / tự do chọn câu**,
**tự sang câu sau / học sinh bấm "Câu tiếp theo"**, **chống gian lận** (toàn màn hình, số lần vi phạm cho phép),
số bạn hiện trên **bảng xếp hạng** (3/5/10/15/tất cả).

## Điểm và điểm thưởng

- **Điểm** = điểm của câu × phần làm đúng. Trả lời chậm không bị trừ.
- **Điểm thưởng** (cộng riêng): +20% khi đúng trong nửa đầu thời gian; +50% mỗi 3 câu đúng liên tiếp.
- **Xếp hạng** theo điểm + điểm thưởng. **Mức đánh giá** chỉ theo điểm:
  Hoàn thành xuất sắc ≥ 90% · Hoàn thành tốt ≥ 70% · Hoàn thành ≥ 50% · Chưa đạt < 50%.

## Trong và sau buổi học

- Màn hình giáo viên có 4 thẻ: **Bảng điều khiển · Thống kê · Giám sát gian lận · Bảng xếp hạng**.
- Câu **trả lời miệng**: chấm ở thẻ "Chấm trả lời miệng" (từng em hoặc "Tất cả đúng"). Từ bản 1.5.0, em có thể **ghi âm** (tối đa 90 giây) hoặc **gõ chữ**; thầy cô nghe bản ghi và đọc chữ ngay dưới tên em trước khi chấm. Em vẫn có thể bấm "Em đã giơ tay trả lời trực tiếp" khi trả lời trên lớp.
- Học sinh vào bằng **Zalo / Facebook** (quét mã QR trong ứng dụng): bấm "Tải phiếu kết quả" sẽ hiện ảnh phiếu để em **nhấn giữ → Lưu hình ảnh**, kèm hướng dẫn "⋯ → Mở bằng trình duyệt" (trình duyệt mở đúng phiếu của em, tải được bình thường). Micro trong Zalo có thể bị chặn: em gõ chữ thay thế.
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
