# Hướng dẫn cài đặt máy chủ Quickplay (Google Apps Script)

Máy chủ Quickplay chạy miễn phí trên tài khoản Google của chính thầy/cô. Mọi bộ đề, kết quả và tệp
ảnh/âm thanh được lưu trong thư mục **QUICKPLAY_DATA** trên Google Drive của thầy/cô. Không cần biết
lập trình, chỉ cần làm theo từng bước dưới đây (khoảng 10 phút).

> **Nên dùng tài khoản Gmail cá nhân.** Tài khoản trường (Google Workspace) thường bị quản trị viên
> chặn tùy chọn "Bất kỳ ai", khi đó học sinh không vào được phòng thi.

---

## Cách nhanh (khuyên dùng): Trình cài đặt ngay trong phần mềm

Đăng nhập Quickplay → **Cài đặt** → chọn **Google Drive** → làm lần lượt **5 bước của Trình cài đặt Apps Script**:

1. Dán link thư mục Google Drive sẽ lưu dữ liệu.
2. Bấm **Sao chép mã** (mã đã điền sẵn thư mục và khóa giáo viên, không phải chạy `setup()`).
3. Bấm **Mở Apps Script mới**, xóa mã mẫu, dán mã, lưu.
4. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**: Thực thi với tư cách **Tôi**, quyền truy cập **Bất kỳ ai**, rồi cấp quyền.
5. Dán link `/exec` vào phần mềm, bấm **Kiểm tra**. Phần mềm tự lưu kết nối vào tài khoản của thầy cô.

Bấm **Kiểm tra** xong, phần mềm đánh tích xanh từng điều kiện, hiện phiên bản và thời gian liên kết, và cho **Tải tệp kết nối (.json)**.
Ở máy tính khác, bấm **Nạp tệp kết nối (.json)** ở đầu Trình cài đặt là nối lại ngay. Tệp của giáo viên có khóa giáo viên, hãy giữ kín.
(Đăng nhập bằng tài khoản được cấp thì phần mềm cũng tự nhớ kết nối, tệp này là cách dự phòng.)

**Tệp gộp tự lưu (từ bản 1.2.0):** mỗi khi thầy cô thêm, sửa, xóa bộ câu hỏi, môn học – chương – bài, lớp, hay tổ chức một buổi,
Apps Script ghi một tệp `.json` duy nhất vào thư mục lưu trữ, tên theo tên đăng nhập và thời điểm lưu, ví dụ `035091005725_15_11_2026_12h45.json`.
Tệp gộp cũ của cùng tài khoản được chuyển vào Thùng rác. Nếu đã chọn thư mục trên máy tính (Cài đặt → Sao lưu và khôi phục), tệp này cũng được ghi vào đó.

**Tự cập nhật (từ bản 1.4.0):** khi Quickplay phát hành bản mới, Apps Script tự tải mã mới từ trang Quickplay
(`https://quickplay-delta.vercel.app/apps-script/`), kiểm tra mã băm SHA-256, ghi đè mã của chính nó, tạo phiên bản mới
và chuyển link `/exec` đang dùng sang phiên bản đó. Link, khóa giáo viên và dữ liệu giữ nguyên; không cập nhật khi đang có buổi học trực tiếp.
Cần làm **một lần**:
1. Dán tệp cấu hình `appsscript.json` (nút **Sao chép tệp cấu hình** trong Trình cài đặt): **⚙ Cài đặt dự án** → tích *Hiển thị tệp kê khai "appsscript.json"* →
   mở tệp đó trong Trình chỉnh sửa, xóa hết, dán, lưu → triển khai phiên bản mới, Google hỏi quyền thì **Cho phép** (thêm quyền "quản lý dự án Apps Script").
2. Bật **Google Apps Script API** tại https://script.google.com/home/usersettings bằng Gmail đang chạy Apps Script.
Bản mới nào cần thêm quyền Google mới thì không tự cập nhật được (Google bắt chủ dự án tự cấp quyền): phần mềm sẽ báo cập nhật tay.

**Sao lưu toàn bộ và chuyển Drive (từ bản 1.3.0):** Apps Script đọc hàng loạt bộ câu hỏi, kết quả buổi học, ảnh và âm thanh để phần mềm đóng gói
một tệp sao lưu toàn bộ (đọc được cả khi Drive đã đầy), báo dung lượng Drive để cảnh báo khi sắp đầy, nhận khôi phục hàng loạt lên Drive mới,
và nén lại ảnh/âm thanh cũ để tiết kiệm dung lượng. Khi Drive đầy, mọi lỗi ghi được báo rõ "Google Drive đã đầy".

Khi phần mềm báo "Apps Script đang chạy mã cũ": chọn thẻ **Cập nhật bản mới** trong Trình cài đặt và làm lại 5 bước; link và dữ liệu giữ nguyên.

Phần dưới đây là cách cài **thủ công**, chỉ cần khi không dùng được Trình cài đặt.

---

## Bước 1. Tạo dự án Apps Script

1. Mở trình duyệt, đăng nhập Google, vào **https://script.google.com**.
2. Bấm **Dự án mới** (New project) ở góc trên bên trái.
3. Bấm vào chữ **Dự án không có tiêu đề** ở trên cùng, đổi tên thành `Quickplay May chu`, bấm **Đổi tên**.

## Bước 2. Dán mã nguồn `Code.gs`

1. Trong khung bên trái, bấm vào tệp **Code.gs**.
2. Xóa toàn bộ nội dung có sẵn (`function myFunction() {...}`): bấm `Ctrl + A` rồi `Delete`.
3. Mở tệp `Code.gs` đi kèm hướng dẫn này, chọn tất cả (`Ctrl + A`), sao chép (`Ctrl + C`), quay lại
   trang Apps Script và dán vào (`Ctrl + V`).
4. Bấm biểu tượng **đĩa mềm (Lưu)** hoặc `Ctrl + S`.

## Bước 3 (khuyến nghị). Dán tệp cấu hình `appsscript.json`

Tệp này đặt múi giờ Việt Nam và các quyền cần thiết.

1. Bấm biểu tượng **bánh răng ⚙ (Cài đặt dự án)** ở thanh bên trái.
2. Tích ô **Hiển thị tệp kê khai "appsscript.json" trong trình chỉnh sửa**.
3. Quay lại **Trình chỉnh sửa** (biểu tượng `< >`), bấm tệp **appsscript.json** vừa hiện ra.
4. Xóa nội dung cũ, dán toàn bộ nội dung tệp `appsscript.json` đi kèm, bấm **Lưu**.

> Bỏ qua bước này vẫn chạy được, nhưng nên làm để giờ hiển thị đúng giờ Việt Nam.

## Bước 4. Chạy hàm `setup()` một lần để cấp quyền

1. Ở thanh công cụ phía trên khung mã, chọn hàm **setup** trong ô danh sách hàm.
2. Bấm **▶ Chạy**.
3. Hộp thoại **Cần cấp quyền** hiện ra → bấm **Xem xét quyền** → chọn tài khoản Google của thầy/cô.
4. Nếu thấy cảnh báo **"Google chưa xác minh ứng dụng này"**: bấm **Nâng cao** → **Đi tới Quickplay May chu
   (không an toàn)**. Đây là mã của chính thầy/cô nên an toàn; cảnh báo xuất hiện vì mã chưa gửi Google kiểm duyệt.
5. Bấm **Cho phép**.
6. Xem khung **Nhật ký thực thi** phía dưới. Thầy/cô sẽ thấy dòng:
   `Đã tạo TEACHER_KEY mới: xxxxxxxxxxxxxxxx` — đây là **khóa giáo viên**, hãy ghi lại.

Hàm `setup()` đã tự tạo thư mục **QUICKPLAY_DATA** (gồm `quizzes`, `sessions`, `media`) trong Google Drive.

> Quên khóa giáo viên? Chọn hàm **showTeacherKey** rồi bấm **Chạy**, khóa sẽ hiện trong nhật ký.

## Bước 5. Kiểm tra / đặt các Thuộc tính tập lệnh (Script Properties)

1. Bấm **bánh răng ⚙ (Cài đặt dự án)** → kéo xuống mục **Thuộc tính tập lệnh** (Script Properties).
2. Thầy/cô sẽ thấy các thuộc tính `setup()` đã tạo. Có thể thêm/sửa bằng **Thêm thuộc tính tập lệnh**
   hoặc **Chỉnh sửa thuộc tính tập lệnh**:

| Thuộc tính | Bắt buộc? | Ý nghĩa |
|---|---|---|
| `TEACHER_KEY` | Có (đã tự tạo) | Khóa giáo viên. Có thể đổi thành mật khẩu riêng, **ít nhất 12 ký tự**, không chia sẻ cho học sinh. |
| `GEMINI_API_KEY` | Không | Khóa AI Gemini để tạo/tách câu hỏi tự động. |
| `GEMINI_MODEL` | Không | Tên mô hình AI, mặc định `gemini-2.0-flash`. Chỉ đổi khi Google ngừng mô hình này (ví dụ `gemini-2.5-flash`). |
| `ROOT_FOLDER_ID`, `QUIZZES_FOLDER_ID`, `SESSIONS_FOLDER_ID`, `MEDIA_FOLDER_ID` | Tự tạo | Mã thư mục dữ liệu. **Không sửa.** |

3. Bấm **Lưu thuộc tính tập lệnh**. Thay đổi thuộc tính có hiệu lực ngay, **không cần triển khai lại**.

### Lấy `GEMINI_API_KEY` miễn phí (không bắt buộc)

1. Vào **https://aistudio.google.com** và đăng nhập cùng tài khoản Google.
2. Bấm **Get API key** (Lấy khóa API) → **Create API key** (Tạo khóa API).
3. Sao chép khóa (bắt đầu bằng `AIza...`), dán vào thuộc tính `GEMINI_API_KEY` ở trên.

Gói miễn phí giới hạn số lượt gọi mỗi phút/mỗi ngày; nếu ứng dụng báo "vượt hạn mức", chờ vài phút rồi thử lại.

## Bước 6. Triển khai thành Ứng dụng web

1. Bấm nút **Triển khai** (Deploy) màu xanh ở góc trên bên phải → **Tùy chọn triển khai mới** (New deployment).
2. Bấm **bánh răng** cạnh chữ "Chọn loại" → chọn **Ứng dụng web** (Web app).
3. Điền:
   - **Mô tả**: `Phien ban 1`
   - **Thực thi dưới dạng** (Execute as): **Tôi** (Me — email của thầy/cô)
   - **Người có quyền truy cập** (Who has access): **Bất kỳ ai** (Anyone)
4. Bấm **Triển khai**. Nếu được hỏi cấp quyền lần nữa, làm như Bước 4.
5. Sao chép **URL ứng dụng web** — địa chỉ có dạng
   `https://script.google.com/macros/s/AKfy..../exec` (kết thúc bằng **/exec**).

## Bước 7. Kiểm tra máy chủ

Dán URL vừa sao chép vào thanh địa chỉ trình duyệt, thêm `?action=ping` vào cuối, ví dụ:

```
https://script.google.com/macros/s/AKfy..../exec?action=ping
```

Nếu thấy `{"ok":true,"data":{"name":"Quickplay","version":"1.0.0"}}` là máy chủ đã chạy.

## Bước 8. Kết nối ứng dụng Quickplay

1. Mở ứng dụng Quickplay (bản web hoặc bản cài đặt trên máy tính) → màn hình **Cài đặt**.
2. Dán **URL /exec** vào ô địa chỉ máy chủ.
3. Nhập **khóa giáo viên** (`TEACHER_KEY`) → bấm lưu/kiểm tra kết nối.

Bản web và bản cài đặt dùng cùng URL này nên luôn thấy chung một kho bộ đề.

---

## Cập nhật khi có phiên bản `Code.gs` mới

1. Mở dự án ở script.google.com, dán đè `Code.gs` mới (như Bước 2), bấm **Lưu**.
2. Bấm **Triển khai** → **Quản lý các bản triển khai** (Manage deployments).
3. Chọn bản triển khai đang dùng → bấm **biểu tượng bút chì (Chỉnh sửa)**.
4. Ở ô **Phiên bản**, chọn **Phiên bản mới** (New version) → bấm **Triển khai**.

URL **giữ nguyên**, không phải sửa trong ứng dụng.

> ⚠ Không dùng **Tùy chọn triển khai mới** khi cập nhật — cách đó tạo ra URL **khác** và thầy/cô sẽ phải
> dán lại URL vào ứng dụng. Nếu chỉ lưu mã mà không tạo "Phiên bản mới", ứng dụng vẫn chạy mã cũ.

## (Tùy chọn) Dọn dẹp tự động theo lịch

Hàm `cleanupOldSessions()` ghi bù dữ liệu phiên còn chưa lưu xuống Drive, tự kết thúc bài về nhà quá
hạn và phiên bị bỏ quên quá 12 giờ, đồng thời xóa phiên cũ khỏi bộ nhớ đệm (**tệp kết quả trên Drive
vẫn được giữ nguyên**).

**Cách nhanh:** chọn hàm **installCleanupTrigger** → bấm **▶ Chạy** (một lần). Hàm sẽ được chạy mỗi giờ.

**Cách thủ công:**
1. Bấm biểu tượng **đồng hồ (Trình kích hoạt / Triggers)** ở thanh bên trái → **Thêm trình kích hoạt**.
2. Chọn hàm `cleanupOldSessions`, nguồn sự kiện **Theo thời gian**, loại **Bộ hẹn giờ theo giờ**
   (mỗi giờ — khuyến nghị khi giao bài về nhà) hoặc **Bộ hẹn giờ theo ngày** (mỗi ngày một lần).
3. Bấm **Lưu**.

Muốn tắt: chạy hàm `removeCleanupTriggers` hoặc xóa trình kích hoạt trong màn hình đồng hồ.

---

## Hạn mức miễn phí của Google cần biết

| Hạng mục | Giới hạn (tài khoản Gmail miễn phí, có thể thay đổi) | Ảnh hưởng |
|---|---|---|
| Số yêu cầu chạy đồng thời | khoảng 30 | Lớp quá đông thăm dò dồn dập có thể bị chậm/báo "máy chủ đang bận". Phù hợp lớp ≤ 50 học sinh, ứng dụng tự giãn nhịp thăm dò (2–5 giây khi làm bài trên lớp, 20 giây với bài về nhà). |
| Thời gian chạy mỗi yêu cầu | 6 phút | Không ảnh hưởng thao tác thường; AI tách đề dài có thể lâu. |
| Kích thước tải tệp | ~50 MB mỗi yêu cầu (máy chủ từ chối tệp > 45 MB) | Mã hóa base64 làm tệp to thêm ~33%, nên thực tế nên giữ tệp ≤ 35 MB. Video lớn hãy dùng YouTube. |
| Gọi dịch vụ ngoài (UrlFetch – AI) | 20.000 lượt/ngày | Thừa cho nhu cầu tạo câu hỏi. |
| Bộ nhớ đệm (Cache) | 100 KB mỗi giá trị, lưu tối đa 6 giờ | Máy chủ đã tự chia nhỏ dữ liệu; phiên rất lớn sẽ tự đọc từ Drive. |
| Thời gian chạy trình kích hoạt | 90 phút/ngày | Dọn dẹp mỗi giờ chỉ tốn vài giây. |
| Dung lượng Google Drive | 15 GB (dùng chung Gmail, Ảnh) | Ảnh/âm thanh/video tải lên chiếm dung lượng này. |

## Xử lý sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Ứng dụng báo **"Khóa giáo viên không đúng"** | Kiểm tra lại `TEACHER_KEY` (chạy `showTeacherKey`), chú ý chữ hoa/thường. |
| **"Máy chủ chưa có TEACHER_KEY"** | Chạy lại hàm `setup()`. |
| Học sinh mở link bị yêu cầu đăng nhập Google | Bản triển khai chưa đặt **Bất kỳ ai** — sửa lại ở **Quản lý các bản triển khai**. Tài khoản trường có thể không cho chọn mục này: dùng Gmail cá nhân. |
| Sửa mã nhưng ứng dụng không đổi | Chưa tạo **Phiên bản mới** khi triển khai (xem mục Cập nhật). |
| **"Máy chủ đang bận"** | Quá nhiều yêu cầu cùng lúc; ứng dụng sẽ thử lại. Nếu lặp lại thường xuyên, giảm tần suất thăm dò. |
| **"Vượt hạn mức của Gemini"** | Chờ vài phút; gói miễn phí giới hạn số lượt mỗi phút. |
| Ảnh tải lên không hiển thị | Kiểm tra tài khoản có cho chia sẻ "Bất kỳ ai có đường liên kết" không. |
| Lỡ xóa bộ đề | Bộ đề được chuyển vào **Thùng rác Google Drive**, khôi phục được trong 30 ngày (rồi chạy hàm `rebuildQuizIndex`). |

## Sao lưu & bảo mật

- Sao lưu: trong phần mềm, **Cài đặt → Sao lưu và khôi phục → Tải file sao lưu toàn bộ** (một tệp gồm cả ảnh, âm thanh và kết quả). Cách thủ công: tải cả thư mục **QUICKPLAY_DATA** từ Google Drive về máy (chuột phải → Tải xuống).
- Không chia sẻ `TEACHER_KEY` và `GEMINI_API_KEY` cho người khác. Nếu nghi bị lộ, đổi giá trị trong
  **Thuộc tính tập lệnh** (có hiệu lực ngay) và nhập lại khóa mới trong ứng dụng.
- Không sửa tay các tệp trong `QUICKPLAY_DATA` khi đang có phòng thi diễn ra.
