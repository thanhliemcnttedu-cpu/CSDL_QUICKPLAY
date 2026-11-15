# Quickplay – Đưa lên web (GitHub + Vercel) và thử trên Google thật

Dành cho tác giả/quản trị. Làm theo đúng thứ tự; mỗi phần khoảng 5–10 phút.

## A. Đưa mã nguồn lên GitHub

1. Vào <https://github.com/new>, đặt tên kho (ví dụ `quickplay`), chọn **Private** (riêng tư) hoặc **Public**, **không** tích
   "Add a README". Bấm **Create repository**.
2. Mở cửa sổ lệnh tại thư mục dự án, chạy lần lượt (kho hiện tại: `thanhliemcnttedu-cpu/CSDL_QUICKPLAY`, đã đẩy lên lần đầu):

```bash
git remote add origin https://github.com/thanhliemcnttedu-cpu/CSDL_QUICKPLAY.git
```

```bash
git push -u origin main
```

Lần đầu, cửa sổ đăng nhập GitHub sẽ hiện ra.

## B. Đưa lên Vercel

1. Vào <https://vercel.com/new>, đăng nhập bằng GitHub, chọn kho `CSDL_QUICKPLAY` → **Import**.
2. Vercel tự nhận cấu hình từ `vercel.json` (Vite, thư mục `dist`). Bấm **Deploy**.
3. Sau khi xong, chép địa chỉ trang (ví dụ `https://quickplay-abc.vercel.app`).
4. Vào **Settings → Environment Variables**, thêm các biến cần dùng rồi **Redeploy**:

| Biến | Bắt buộc? | Ý nghĩa |
|---|---|---|
| `VITE_PUBLIC_URL` | Nên có | Địa chỉ trang ở bước 3. Bản .exe dùng để tạo link/QR cho học sinh |
| `VITE_ADMIN_URL` | Khi muốn bắt buộc đăng nhập | Địa chỉ `/exec` của máy chủ tài khoản (phần C) |
| `VITE_SCRIPT_URL` | Không | Chỉ dùng khi cả trang dùng chung một Apps Script (không khuyến nghị: mỗi giáo viên nên tự cài) |

Từ đây, mỗi lần `git push` Vercel tự dựng lại trang.

## C. Máy chủ tài khoản (quản trị cài một lần)

Làm theo `apps-script-admin/HUONG_DAN_QUAN_TRI.md`, lấy địa chỉ `/exec` và `ADMIN_KEY`, đặt `VITE_ADMIN_URL` ở phần B rồi
mở `<địa chỉ trang>/#/admin` để cấp tài khoản.

## D. Máy chủ dữ liệu của giáo viên (mỗi giáo viên cài một lần)

Làm theo `apps-script/HUONG_DAN_CAI_DAT.md`. Sau đó đăng nhập trang web → **Cài đặt** → dán link thư mục, link Apps Script,
khóa giáo viên → **Lưu cài đặt**.

## E. Danh sách thử trên Google thật

Đánh dấu từng mục sau khi thử; mục nào lỗi thì chụp màn hình gửi lại.

**Kết nối và lưu trữ**
- [ ] `…/exec?action=ping` trả về `{"ok":true,…}`
- [ ] Trang Cài đặt báo kết nối thành công; thư mục dữ liệu xuất hiện trong Drive
- [ ] Tạo một bộ đề, tải lại trang, bộ đề vẫn còn; mở trên máy khác thấy cùng bộ đề
- [ ] Tạo môn học → chương → bài, tải lại trang vẫn còn (tệp `catalog.json`)
- [ ] Tải một ảnh lên hai lần: lần hai nhanh hơn hẳn và trong thư mục `media` chỉ có **một** tệp
- [ ] Nhập thử một Google Form

**Tổ chức với thiết bị thật**
- [ ] Giáo viên điều khiển: 3–5 điện thoại cùng vào bằng mã QR, chuyển câu, khóa câu, bảng xếp hạng nhảy hạng
- [ ] Trực tiếp tự do: làm hết bài, làm lại câu sai, tải ảnh vinh danh
- [ ] Bài về nhà: thoát ra vào lại vẫn tiếp tục đúng câu; hết hạn thì không nộp được
- [ ] Chống gian lận: tự vào toàn màn hình, thoát ra bị nhắc, quá số lần thì bị khóa
- [ ] Thẻ giấy: in thẻ, quét bằng camera điện thoại, màn chiếu sáng tên học sinh
- [ ] Xuất Excel, xuất PDF A4 ngang mở được và đúng tiếng Việt

**Lớp đông**
- [ ] 40–50 thiết bị vào cùng một phòng (có thể mở nhiều thẻ trên vài máy): không ai bị rớt, không báo "máy chủ đang bận" kéo dài
- [ ] Tắt wifi một máy 10 giây giữa lúc trả lời rồi bật lại: câu trả lời vẫn được ghi

**Trình duyệt và thiết bị**
- [ ] Chrome và Cốc Cốc trên máy tính; Safari trên iPhone/iPad; Chrome trên Android
- [ ] Mở trang lần hai gần như tức thì (bộ đệm ngoại tuyến)

## F. Bản cài đặt Windows

Xem `docs/BAN_CAI_DAT_WINDOWS.md`. Tệp cài nằm ở `release\Quickplay-Setup-<phiên bản>.exe`.
