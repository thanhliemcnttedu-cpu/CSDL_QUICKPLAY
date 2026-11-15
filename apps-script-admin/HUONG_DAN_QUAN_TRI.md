# Hướng dẫn cho quản trị: máy chủ tài khoản Quickplay

Máy chủ này chỉ làm một việc: **cấp, khóa và kiểm tra tài khoản giáo viên**. Nó không lưu bộ câu hỏi hay kết quả học sinh.
Chỉ tác giả/quản trị cài, và chỉ cài **một lần**.

## 1. Cài máy chủ tài khoản (khoảng 5 phút)

1. Vào <https://script.google.com> bằng tài khoản Google của quản trị → **Dự án mới**.
2. Xóa mã mẫu, dán toàn bộ nội dung tệp `apps-script-admin/Code.gs`. Đặt tên dự án, ví dụ "Quickplay – Tài khoản".
3. Chọn hàm `setup` → **Chạy** → cấp quyền. Mở **Nhật ký thực thi** để lấy dòng `ADMIN_KEY`. Giữ bí mật khóa này.
4. **Triển khai → Triển khai mới → Ứng dụng web**: *Thực thi dưới danh nghĩa* = Tôi; *Ai có quyền truy cập* = Bất kỳ ai. Chép địa chỉ kết thúc bằng `/exec`.

## 2. Bật bắt buộc đăng nhập cho bản web

Trên Vercel, vào **Settings → Environment Variables**, thêm:

```
VITE_ADMIN_URL = <địa chỉ /exec ở bước 1>
```

rồi triển khai lại. Từ đó, khu giáo viên của trang web yêu cầu đăng nhập. Học sinh vào phòng chơi không cần tài khoản.
Nếu không đặt biến này, phần mềm chạy ở chế độ dùng thử: không cần đăng nhập.

## 3. Đăng nhập quản trị và cấp tài khoản cho giáo viên

Ba địa chỉ theo vai trò:

| Vai trò | Địa chỉ |
|---|---|
| Quản trị cao nhất của toàn hệ thống | `<địa chỉ trang web>/adminquantri` |
| Giáo viên | `<địa chỉ trang web>/teacher` |
| Học sinh tham gia | `<địa chỉ trang web>/join` (gõ `/jon` cũng vào được) |

**Lần đầu (một lần):** mở `/adminquantri`. Nếu chưa đặt biến `VITE_ADMIN_URL` thì dán địa chỉ `/exec` của máy chủ tài khoản.
Trang hiện mục **Thiết lập tài khoản quản trị**: nhập `ADMIN_KEY`, tên tài khoản (mặc định `adminquantri`) và mật khẩu do quản trị tự đặt
(8–72 ký tự) → **Lưu tài khoản quản trị**.

**Từ lần sau:** mở `/adminquantri`, nhập tên tài khoản và mật khẩu → **Đăng nhập**. Phiên đăng nhập hết hạn sau 12 giờ hoặc khi đóng thẻ.

> Mật khẩu quản trị **không nằm trong mã nguồn** (mã của trang web ai cũng đọc được). Máy chủ chỉ lưu bản băm có muối.
> Quên mật khẩu: bấm **Quên mật khẩu? Đặt lại bằng ADMIN_KEY**. Nhập sai quá 8 lần thì bị tạm khóa 15 phút.
> Đổi mật khẩu: nút **Đổi mật khẩu quản trị** sau khi đăng nhập.

**Cấp tài khoản**: bấm **Cấp tài khoản**, nhập tên tài khoản, họ tên, mật khẩu ban đầu → gửi cho giáo viên (nút *Chép để gửi*).

Tại đây quản trị cũng **khóa / mở khóa**, **đặt lại mật khẩu** và **xóa** tài khoản. Khóa tài khoản làm giáo viên bị đăng xuất ở mọi thiết bị.

## 4. Giáo viên làm gì ở lần đầu (một lần duy nhất)

1. Cài Apps Script lưu dữ liệu vào Drive của chính mình theo `apps-script/HUONG_DAN_CAI_DAT.md`.
2. Tạo một thư mục riêng trên Google Drive, chép link thư mục.
3. Đăng nhập Quickplay → trang Cài đặt tự mở → dán **link thư mục**, **link Apps Script**, **khóa giáo viên** → **Lưu cài đặt**.

Từ lần sau, đăng nhập trên máy nào phần mềm cũng tự nhớ. Nếu giáo viên bấm **Đăng xuất**, lần sau phải nhập lại tài khoản và mật khẩu.

## Máy chủ này lưu gì

| Lưu | Không lưu |
|---|---|
| Tên tài khoản, họ tên | Mật khẩu dạng rõ (chỉ lưu bản băm có muối) |
| Trạng thái khóa, lần đăng nhập gần nhất | Bộ câu hỏi, kết quả học sinh |
| "Két cấu hình" của giáo viên, **đã mã hóa bằng mật khẩu của giáo viên** | Nội dung két dạng đọc được |

Vì két được mã hóa bằng mật khẩu của giáo viên, khi quản trị **đặt lại mật khẩu** thì két cũ không mở được nữa: giáo viên dán lại
ba thông tin ở bước 4. Dữ liệu trên Drive của giáo viên không bị ảnh hưởng.

## Giới hạn cần biết

- Việc bắt buộc đăng nhập được kiểm tra ở giao diện web. Quickplay là ứng dụng chạy trên trình duyệt và mã nguồn công khai, nên người rành kỹ thuật
  vẫn có thể tự dựng một bản không cần đăng nhập. Tài khoản dùng để **quản lý ai được dùng bản chính thức**, không phải để bảo vệ dữ liệu:
  dữ liệu của mỗi giáo viên được bảo vệ bằng khóa giáo viên của Apps Script riêng.
- Mỗi tài khoản một phiên: đăng nhập ở máy mới thì máy cũ bị đăng xuất ở lần kiểm tra kế tiếp.
- Tối đa 400 tài khoản (giới hạn dung lượng Script Properties).
- Thử trên máy lập trình mà chưa cần Google: `node apps-script-admin/mock-server.cjs` (địa chỉ `http://localhost:5181`, khóa `dev-admin-key`).
