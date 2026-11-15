# Quickplay – Phần mềm kiểm tra đánh giá tương tác (miễn phí)

Phần mềm trắc nghiệm kiểu Quizizz dành cho giáo viên tiểu học và THCS. Không có máy chủ trả phí:
**dữ liệu là các tệp `.json` trên Google Drive của thầy cô**, được đọc/ghi qua Google Apps Script.
Quickplay chạy hoàn toàn trên trình duyệt (triển khai bằng Vercel); dữ liệu của mỗi giáo viên nằm trên Google Drive của chính họ.

## Tính năng (theo SRS v2.0)

| Nhóm | Đã có |
|---|---|
| 7 dạng câu hỏi | Một đáp án · Nhiều đáp án (chấm toàn phần/từng phần) · Đúng/Sai · Điền khuyết (nhiều biến thể, bỏ qua hoa/thường) · Kéo thả vào ô trống (có thẻ nhiễu, hỗ trợ chạm‑chạm trên cảm ứng) · Sắp xếp thứ tự · Nối cột (có phương án nhiễu) |
| Nhập liệu đa phương tiện | Soạn thảo định dạng (đậm, nghiêng, gạch chân, chỉ số trên/dưới, danh sách, liên kết) · **Nhập bằng giọng nói** tiếng Việt cho câu hỏi và từng ô đáp án (tự dừng sau 5 giây im lặng) · **Ctrl+V dán ảnh** chụp màn hình vào câu hỏi và từng đáp án · Tải/kéo thả ảnh (≤ 10 MB, xoay ảnh, mô tả alt) · Âm thanh (tải lên ≤ 20 MB hoặc ghi âm) · Video YouTube/Vimeo (giây bắt đầu/kết thúc, kiểm tra quyền nhúng) · Tải video ngắn (**< 60 giây và < 300 MB**, đọc thời lượng ngay tại trình duyệt) |
| Tổ chức | Trực tiếp tự do · Giáo viên điều khiển nhịp (khóa câu, thống kê đáp án) · Giao bài về nhà (giờ mở, hạn nộp, tự lưu nháp và làm tiếp) · Mã PIN 6 số + link + mã QR · Mời học sinh ra · Tạm dừng toàn lớp · Xáo trộn câu hỏi/đáp án · Bảng xếp hạng · Thưởng chuỗi đúng · Nhạc nền |
| Học sinh | Chọn nhân vật · Đếm ngược 3‑2‑1 · Phóng to ảnh (cả ảnh trong đáp án) · Xem video/nghe âm thanh/mở link · Tự vào lại khi mất kết nối |
| Báo cáo | Bục vinh danh Top 3 · Phân tích tỉ lệ đúng từng câu · Kết quả từng học sinh · **Xuất CSV mở bằng Excel** (đúng tiếng Việt) |
| Nhập đề & AI | Đọc `.docx` `.pdf` `.pptx` `.xlsx` `.csv` `.txt` · Tự sửa lỗi định dạng (phương án cùng dòng, thiếu dấu chấm, đáp án in đậm/gạch chân/dấu *, bảng đáp án cuối tệp, dòng bị ngắt) · **AI Gemini**: Sinh câu hỏi mới theo mức độ nhận thức hoặc Trích nguyên văn · Xem trước, tô vàng câu thiếu đáp án |

## Chạy thử ngay (không cần Google)

```bash
npm install
```

```bash
npm run dev
```

Hai đường dẫn chạy thử:

| Vai trò | Đường dẫn |
|---|---|
| Giáo viên (soạn đề, tổ chức, giám sát) | http://localhost:5180/teacher |
| Học sinh (nhập mã PIN) | http://localhost:5180/join |
| Học sinh vào thẳng phòng | http://localhost:5180/join?pin=123456 |

Ở chế độ "Chỉ máy này", học sinh mở link ở một tab/cửa sổ khác **của cùng trình duyệt**. Muốn thử bằng
trình duyệt khác hoặc điện thoại thì cần kết nối Google Drive.

## Chống gian lận (chế độ thi nghiêm túc)

Bật trong hộp **Tổ chức**. Học sinh được báo nội quy ở phòng chờ; mỗi vi phạm hiện cảnh báo đỏ trên máy học sinh
và xuất hiện ngay ở tab **Giám sát gian lận** của giáo viên (kèm chuông và đếm số). Có thể chọn chỉ cảnh báo
hoặc **khóa bài** sau 1/3/5 lần; giáo viên mở khóa bằng một cú bấm.

| Chặn được | Phát hiện và báo cáo |
|---|---|
| Chuột phải (kể cả Google Lens / "Tìm bằng hình ảnh") · Sao chép, dán, bôi đen, kéo ảnh · Ctrl+C/V/X/P/S, F12, Ctrl+Shift+I/J/C, Ctrl+U | Chuyển tab, thu nhỏ trình duyệt · Chuyển sang ứng dụng khác (Snipping Tool/Win+Shift+S, ChatGPT, Zalo…) · Phím Print Screen · Thoát toàn màn hình · Thu nhỏ/chia đôi cửa sổ |

Giới hạn thật của trình duyệt: không thể ngăn học sinh dùng **điện thoại khác** chụp màn hình, hay thấy ứng
dụng nào đang mở trên máy. Phần mềm phát hiện *dấu hiệu rời khỏi bài*, giáo viên vẫn nên quan sát lớp.

## Dạy học trên lớp – Thẻ trả lời (chế độ giấy)

Cả lớp cùng trả lời mà không em nào cần điện thoại: mỗi em một thẻ giấy, thầy cô quét bằng camera điện thoại.

1. **In thẻ** – menu *Dạy học trên lớp* → khối *In thẻ* → *Tải PDF bộ thẻ*. Chọn 2 thẻ/tờ (lớp thường) hoặc 1 thẻ/tờ mã to (phòng rộng);
   in bộ chung số 1–100 hoặc in theo lớp có sẵn tên từng em. Giấy A4 trắng, in đen trắng, tỷ lệ 100%.
2. **Lớp học** – *Thêm lớp*, dán danh sách mỗi dòng một tên. Số thẻ = số thứ tự trong danh sách, nên một bộ thẻ dùng cho mọi lớp.
3. **Tạo buổi học** – chọn lớp và bộ câu hỏi (máy tự lấy các câu một đáp án, 2–4 phương án). Màn chiếu hiện mã QR; quét bằng camera
   điện thoại là vào thẳng máy quét (`/quet`), không cài ứng dụng, không đăng nhập. Học sinh xoay cạnh ghi đáp án lên trên rồi giơ thẻ.

Thẻ đã nhận sáng lên trên màn chiếu; đủ cả lớp (hoặc bấm *Hiện kết quả*) thì hiện biểu đồ 4 đáp án và đúng/sai từng em. *Nhắc* hiện tên các em
chưa giơ thẻ. Hết bài có bảng tổng kết, câu nhiều em sai và nút *Xuất Excel*. Quét bằng điện thoại cần chạy trên https (Vercel) và đã kết nối
Google Drive; ở chế độ "Máy này" máy quét chỉ mở được trên cùng trình duyệt.

## Nhập câu hỏi: file Word mẫu và Google Form

- **File Word mẫu** – trong hộp *Tạo câu hỏi từ tài liệu* bấm *Tải file Word mẫu*. Soạn đúng mẫu (đủ 7 dạng, có thời gian, điểm, giải thích,
  hình/video/âm thanh) rồi tải lên với cách *Giữ nguyên tài liệu*: nhập ngay, không dùng AI. Cuối file có lời nhắc mẫu để nhờ ChatGPT/Gemini
  trình bày lại bộ câu hỏi sẵn có theo đúng mẫu. Ảnh chèn trong tệp .docx (ngay dưới câu hỏi hoặc phương án) được lấy theo.
- **Google Form** – chọn *Từ Google Form*, dán link. Với link chỉnh sửa (`…/edit`) của form do chính thầy cô tạo, phần mềm lấy cả đáp án đúng và
  điểm (form dạng bài kiểm tra); với link công khai chỉ lấy được câu hỏi và phương án. Cần đã kết nối Google Drive. Sau khi cập nhật `Code.gs`
  và `appsscript.json` (thêm quyền `forms`), phải chạy lại một hàm trong trình soạn thảo Apps Script để **cấp quyền lại** rồi triển khai phiên bản mới.

## Quản lý theo Môn học › Chương/Chủ đề › Bài

Trong **Thư viện**, cây danh mục bên trái cho giáo viên thêm, đổi tên, xóa môn học; trong mỗi môn thêm chương hoặc chủ đề; trong mỗi chương thêm bài.
Bấm một mục để lọc bộ đề; đang chọn mục nào thì "Tạo bộ đề" tạo ngay trong mục đó; nút "Chuyển tới…" trên thẻ bộ đề để đổi chỗ. Xóa một mục không
xóa bộ đề: các bộ đề bên trong trở về "Chưa phân loại". Nút **Thêm dữ liệu mẫu (Tiếng Việt, Tiếng Anh)** tạo hai môn mẫu kèm hai bộ đề đủ mọi dạng câu hỏi.

## Tài khoản giáo viên (do quản trị cấp)

- Quản trị cài **máy chủ tài khoản** một lần (`apps-script-admin/`, xem `apps-script-admin/HUONG_DAN_QUAN_TRI.md`), đặt `VITE_ADMIN_URL` trên Vercel
  và cấp tài khoản ở trang `/adminquantri`. Khi có biến này, khu giáo viên bắt buộc đăng nhập; học sinh không cần tài khoản.
- Mỗi giáo viên tự cài Apps Script riêng **một lần**, rồi dán link thư mục Drive + link Apps Script + khóa giáo viên trong Cài đặt. Cấu hình được
  mã hóa bằng mật khẩu của giáo viên và cất theo tài khoản, nên đăng nhập ở máy nào phần mềm cũng tự nhớ. Đăng xuất thì phải đăng nhập lại.
- Dữ liệu (bộ câu hỏi, kết quả) nằm hoàn toàn trong Drive của từng giáo viên; máy chủ tài khoản không lưu và quản trị không xem được.

## Kết nối Google Drive (dùng thật trên lớp)

1. Làm theo [apps-script/HUONG_DAN_CAI_DAT.md](apps-script/HUONG_DAN_CAI_DAT.md): tạo dự án Apps Script,
   dán `Code.gs`, chạy `setup()`, đặt `TEACHER_KEY` (và `GEMINI_API_KEY` nếu dùng AI), triển khai Web App.
2. Trong ứng dụng: **Cài đặt** → Google Drive → dán URL `/exec` và khóa giáo viên → **Kiểm tra kết nối**.
3. (Tùy chọn) **Chép đề từ máy này lên Drive** để chuyển các bộ đề đã soạn thử.

## Đưa lên web (GitHub + Vercel)

1. Tạo kho trên GitHub, đẩy mã nguồn lên.
2. Vào vercel.com → **Add New Project** → chọn kho → Vercel tự nhận `vercel.json` (Vite, thư mục `dist`).
3. (Tùy chọn) khai báo biến `VITE_SCRIPT_URL` để giáo viên khỏi phải dán URL ở trang Cài đặt.
4. Mỗi lần đẩy mã lên nhánh chính, Vercel tự build và cập nhật.

## Cấu trúc mã nguồn

```
src/lib/types.ts        Lược đồ JSON chuẩn (Question, Quiz, Session…) – mục 5 SRS
src/lib/api.ts          Lớp dữ liệu: Apps Script (Drive) hoặc cục bộ (IndexedDB)
src/lib/sessionLogic.ts Máy trạng thái phiên LOBBY_WAITING → IN_PROGRESS ⇄ PAUSED → COMPLETED
src/lib/grading.ts      Chấm điểm 7 dạng + điểm tốc độ + kiểm tra hợp lệ
src/lib/importer.ts     Bóc tách đề từ tệp, tự phục hồi lỗi định dạng
src/lib/ai.ts           Gemini: sinh đề / trích nguyên văn
src/lib/media.ts        Kiểm tra & tải ảnh/âm thanh/video, nhận diện YouTube/Vimeo
src/components/         Trình soạn thảo, công cụ media, màn làm bài 7 dạng
src/pages/              Thư viện, Soạn đề, Điều khiển phiên, Học sinh, Báo cáo, Cài đặt
apps-script/            Backend Google Apps Script + hướng dẫn cài đặt
docs/API.md             Hợp đồng API giữa giao diện và Apps Script
```

Kiểm thử: `npm test` (chấm điểm 7 dạng, bộ tách đề, chuyển đổi AI, máy trạng thái phiên).

## Giới hạn cần biết

- **Thời gian thực bằng thăm dò** (2 giây/lần) vì Apps Script không hỗ trợ WebSocket. Tài khoản Gmail miễn
  phí chịu được khoảng 30 yêu cầu đồng thời → phù hợp lớp **≤ 50 học sinh**.
- **Chấm điểm tại máy học sinh** (đề gửi kèm đáp án). Đủ cho luyện tập/kiểm tra thường xuyên; không nên dùng
  cho kỳ thi quan trọng.
- Tệp tải lên qua Apps Script tối đa khoảng **35 MB** (giới hạn gói tin của Google). Video lớn hơn: tải lên
  YouTube/Drive rồi dán link.
- Nhập giọng nói cần **Chrome hoặc Edge**.
- Tài khoản Google Workspace của trường có thể chặn chia sẻ "Bất kỳ ai" → dùng Gmail cá nhân để triển khai.
