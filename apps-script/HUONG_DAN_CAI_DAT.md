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

**Sao lưu:** phần mềm không còn tự ghi tệp gộp. Muốn giữ bản dự phòng, thầy cô vào **Cài đặt → Sao lưu và khôi phục → Tải file sao lưu toàn bộ**
(một tệp `.json` duy nhất); sang máy khác hoặc đổi Google Drive thì **Khôi phục từ file .json**. Tệp gộp cũ (tên `<tên đăng nhập>_<ngày giờ>.json`)
còn trong thư mục Drive có thể xóa đi.

**Bản 1.5.6:** bài kiểm tra cho học sinh **chọn lại đáp án** khi chưa nộp bài và còn giờ (`submitAnswer` nhận `change: true` thì thay câu trả lời cũ);
thêm hành động `examStudent` (mã PIN + mã số học sinh → họ tên, lớp, đã nộp chưa) để trang vào phòng tự điền tên và lớp; mã số học sinh dài tối đa 32 ký tự
(đủ cho số căn cước, tên đăng nhập). Cập nhật tay bằng 5 bước ở trang Cài đặt.

**Bản 1.5.5:** bài kiểm tra có thêm hai lựa chọn của giáo viên: `exam_layout` (`one` = làm từng câu như trò chơi, bấm Câu tiếp theo hoặc chọn số câu;
`page` = cả bài trên một trang cuộn như đề giấy) và `exam_review` (`none` / `end` = xem lại bài khi giáo viên thu bài / `submit` = xem ngay khi nộp).
Bản cũ bỏ qua hai lựa chọn này nên cần cập nhật tay bằng 5 bước ở trang Cài đặt.

**Bản 1.5.4:** bài kiểm tra theo danh sách lớp. Mỗi lớp (`classes.json`) có thêm `codes`: mã số học sinh do giáo viên đặt, cùng thứ tự với danh sách tên.
Chế độ tổ chức mới `exam`: phòng lưu danh sách mã được phép vào (`exam.roster`, không gửi cho học sinh); học sinh vào bằng mã PIN + mã số học sinh, mỗi mã làm một lần;
giờ thu bài = lúc giáo viên bấm Bắt đầu + số phút đã đặt (tạm dừng thì cộng bù), hết giờ phòng tự kết thúc; đã nộp thì không vào lại và không trả lời thêm được.
Cập nhật tay bằng 5 bước ở trang Cài đặt.

**Bản 1.5.3:** tên tệp bộ đề dễ hiểu. Trong thư mục `quizzes`, mỗi bộ đề mang tên `<Khối lớp> - <Môn> - <Tên bộ đề> (<mã bộ đề>).json`,
ví dụ `Lớp 1 - Tiếng Việt - Bài 2 Ôn tập (quiz_mwhxf6se95s36v).json`. Tệp cũ tên `<mã>.json` được đổi tên một lần khi thầy cô mở Thư viện sau khi cập nhật;
về sau tên tệp đổi theo mỗi lần lưu bộ đề (đổi tên bộ đề, chuyển lớp, chuyển môn). Phần mềm tìm tệp theo mã tệp Drive ghi trong `_index.json`,
nên thầy cô đổi tên tệp trên Drive cũng không sao; đừng xóa phần `(mã bộ đề).json` ở cuối tên. Cập nhật tay bằng 5 bước ở trang Cài đặt.

**Bản 1.5.2:** xóa báo cáo. Trang Báo cáo cho chọn các phiên để xóa, hoặc xóa toàn bộ. Apps Script chuyển tệp kết quả của phiên
(`sessions/<pin>.json`, `<pin>.quiz.json`) và bản ghi âm trả lời miệng của phiên đó vào Thùng rác của Drive (khôi phục được trong 30 ngày), rồi bỏ phiên khỏi chỉ mục.
Cập nhật tay bằng 5 bước ở trang Cài đặt.

**Bản 1.5.1:** danh mục có thêm tầng **Khối lớp** (Lớp → Môn → Chủ đề → Bài). Apps Script lưu tên lớp của từng môn và thứ tự các lớp trong `catalog.json`. Cập nhật tay bằng 5 bước ở trang Cài đặt.

**Bản 1.5.0:** học sinh ghi âm câu trả lời miệng. Bản ghi (đã nén, khoảng 180 KB mỗi phút) lưu vào
`QUICKPLAY_DATA/media/tra_loi_mieng/`, tên tệp `<mã phòng>_<mã học sinh>_cau<số câu>`. Chỉ em đang có trong phòng đang chạy
mới gửi được; tối đa khoảng 90 giây mỗi bản; em ghi lại thì bản cũ vào Thùng rác. Không cần cấp quyền mới.

**Cập nhật khi có bản mới:** phần mềm nhắc ở đầu trang giáo viên; thầy cô vào **Cài đặt → Nơi lưu dữ liệu → Xem 5 bước cập nhật**
(sao chép mã mới, dán đè vào dự án đang dùng, triển khai **Phiên bản mới**, bấm Kiểm tra). Link, khóa giáo viên và dữ liệu giữ nguyên.
Chức năng tự cập nhật đã được gỡ khỏi giao diện vì không chạy ổn định; phần mã `selfUpdate` trong Code.gs còn đó nhưng phần mềm không gọi nữa.

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

1. Mở ứng dụng Quickplay → màn hình **Cài đặt**.
2. Dán **URL /exec** vào ô địa chỉ máy chủ.
3. Nhập **khóa giáo viên** (`TEACHER_KEY`) → bấm lưu/kiểm tra kết nối.

Mọi máy đăng nhập cùng tài khoản dùng chung URL này nên luôn thấy chung một kho bộ đề.

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
