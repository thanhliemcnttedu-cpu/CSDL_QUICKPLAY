# Hướng dẫn cho quản trị: máy chủ tài khoản Quickplay

Máy chủ này chỉ làm một việc: **cấp, khóa và kiểm tra tài khoản giáo viên**. Nó không lưu bộ câu hỏi hay kết quả học sinh.
Chỉ tác giả/quản trị cài, và chỉ cài **một lần**.

## Tài khoản giáo viên được lưu ở đâu?

- **Không lưu trên GitHub hay Vercel.** Hai nơi đó chỉ chứa mã của trang web; trang web không ghi được dữ liệu vào đó, và mọi thứ đặt ở đó
  ai cũng đọc được.
- **Lưu trong dự án Apps Script của quản trị**, ở kho riêng tên là *Thuộc tính tập lệnh* (Script Properties), thuộc tài khoản Google của quản trị.
  Chỉ quản trị mở được. Từ bản 1.4.0, mật khẩu của giáo viên được lưu ở đây để quản trị xem lại được.
- **Sao lưu vào thư mục Google Drive của quản trị.** Ở bước 1 của Trình cài đặt, quản trị dán link thư mục và bấm **Lưu link**. Mỗi khi tài khoản
  thay đổi, máy chủ ghi lại tệp `quickplay-tai-khoan.json` trong thư mục đó. Nếu sau này cài lại máy chủ (dự án Apps Script mới) vào **cùng thư mục**,
  máy chủ tự nạp lại toàn bộ tài khoản từ tệp này. Không chia sẻ thư mục này cho người khác.
- Mỗi giáo viên lại có **thư mục Google Drive và Apps Script riêng** để lưu bộ câu hỏi và kết quả. Thông tin kết nối (link thư mục, link Apps Script,
  khóa giáo viên) được **mã hóa bằng mật khẩu của giáo viên** rồi gửi kèm tài khoản, nên đăng nhập ở máy nào phần mềm cũng tự kết nối lại,
  còn quản trị thì không đọc được.

## 1. Cài máy chủ tài khoản (khoảng 5 phút)

**Cách nhanh:** mở `<địa chỉ trang web>/adminquantri` và làm theo **Trình cài đặt Apps Script** 5 bước ngay trên trang
(mã đã điền sẵn khóa quản trị, không phải chạy `setup()`). Xong bước 5 trang chuyển sang đặt mật khẩu quản trị.

**Cách thủ công:**


1. Vào <https://script.google.com> bằng tài khoản Google của quản trị → **Dự án mới**.
2. Xóa mã mẫu, dán toàn bộ nội dung tệp `apps-script-admin/Code.gs`. Đặt tên dự án, ví dụ "Quickplay – Tài khoản".
3. Chọn hàm `setup` → **Chạy** → cấp quyền. Mở **Nhật ký thực thi** để lấy dòng `ADMIN_KEY`. Giữ bí mật khóa này.
4. **Triển khai → Triển khai mới → Ứng dụng web**: *Thực thi dưới danh nghĩa* = Tôi; *Ai có quyền truy cập* = Bất kỳ ai. Chép địa chỉ kết thúc bằng `/exec`.

> Trang `/adminquantri` có sẵn **bảng hướng dẫn 6 bước**, tự đánh dấu bước đã xong và bước đang làm.

### Kiểm tra liên kết và tệp kết nối

Ở bước 5 của Trình cài đặt, nút **Kiểm tra** soát lần lượt bốn điều kiện và đánh tích xanh từng dòng: link đúng dạng `/exec`, máy chủ trả lời,
phiên bản mã máy chủ, quyền quản trị và thư mục Google Drive. Điều kiện nào hỏng thì dừng ở đó và ghi rõ lý do.

Liên kết xong, trang hiện **phiên bản máy chủ đã liên kết, phiên bản phần mềm hiện tại, thời gian liên kết, thư mục** và nút
**Tải tệp kết nối (.json)**. Tệp của quản trị chỉ có link máy chủ và thư mục, **không có khóa hay mật khẩu**.

**Đăng nhập ở máy tính khác:** trang chủ → **Dành cho giáo viên** → vai trò **Quản trị** → **Đã cài ở máy khác? Nạp tệp kết nối (.json)** →
chọn tệp → nhập tên đăng nhập và mật khẩu quản trị. Không phải dán lại link thư mục và link Apps Script.
(Nếu đã đặt biến `VITE_ADMIN_URL` trên Vercel thì máy nào cũng tự biết máy chủ, không cần tệp này.)

## 2. Bật đăng nhập cho giáo viên trên bản web (bắt buộc)

Nếu bỏ qua bước này, giáo viên ở máy khác **không đăng nhập được** vì trang web chưa biết máy chủ tài khoản ở đâu.

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

**Cửa sổ đăng nhập:** ở trang chủ bấm **Dành cho giáo viên** → chọn vai trò **Quản trị (admin)** hoặc **Giáo viên** → nhập tên đăng nhập và mật khẩu.

**Lần thiết lập đầu tiên:** chọn vai trò Quản trị, đăng nhập bằng tài khoản quản trị mặc định (`adminquantri` và mật khẩu mặc định do tác giả giữ).
Phần mềm mở Trình cài đặt để nối máy chủ tài khoản; xong bước 5, tài khoản mặc định trở thành tài khoản quản trị. Đổi mật khẩu là **tùy chọn**: có thể giữ nguyên mật khẩu hiện tại
(bấm **Giữ mật khẩu hiện tại**) hoặc bấm **Đổi mật khẩu quản trị** bất cứ lúc nào. Lưu ý: trong mã nguồn công khai có bản băm của mật khẩu mặc định,
nên nếu mật khẩu đó dễ đoán thì người khác có thể dò ra; đổi sang mật khẩu riêng thì hết rủi ro này.

**Cách cũ (vẫn dùng được):** mở `/adminquantri`. Nếu chưa đặt biến `VITE_ADMIN_URL` thì dán địa chỉ `/exec` của máy chủ tài khoản.
Trang hiện mục **Thiết lập tài khoản quản trị**: nhập `ADMIN_KEY`, tên tài khoản (mặc định `adminquantri`) và mật khẩu do quản trị tự đặt
(8–72 ký tự) → **Lưu tài khoản quản trị**.

**Từ lần sau:** mở `/adminquantri`, nhập tên tài khoản và mật khẩu → **Đăng nhập**. Phiên đăng nhập hết hạn sau 12 giờ hoặc khi đóng thẻ.

> Mật khẩu quản trị **không nằm trong mã nguồn** (mã của trang web ai cũng đọc được). Máy chủ chỉ lưu bản băm có muối.
> Nên khai báo **email khôi phục** ngay sau lần đăng nhập đầu (nút **Email khôi phục** phía trên danh sách tài khoản).
> Quên mật khẩu: bấm **Quên mật khẩu?** để nhận mã 6 số qua email khôi phục; chưa khai báo email thì bấm **Đặt lại bằng ADMIN_KEY**
> (khóa nằm trong dự án Apps Script: Cài đặt dự án → Thuộc tính tập lệnh → `ADMIN_KEY`). Nhập sai quá 8 lần thì bị tạm khóa 15 phút.
> Đổi mật khẩu: nút **Đổi mật khẩu quản trị** sau khi đăng nhập.

**Cấp tài khoản**: bấm **Cấp tài khoản**, nhập tên tài khoản, họ tên, mật khẩu ban đầu → gửi cho giáo viên (nút *Chép để gửi*).

Tại đây quản trị cũng **khóa / mở khóa**, **đặt lại mật khẩu** và **xóa** tài khoản. Khóa tài khoản làm giáo viên bị đăng xuất ở mọi thiết bị.

## 4. Giáo viên làm gì ở lần đầu (một lần duy nhất)

1. Cài Apps Script lưu dữ liệu vào Drive của chính mình theo `apps-script/HUONG_DAN_CAI_DAT.md`.
2. Tạo một thư mục riêng trên Google Drive, chép link thư mục.
3. Đăng nhập Quickplay → trang Cài đặt tự mở → dán **link thư mục**, **link Apps Script**, **khóa giáo viên** → **Lưu cài đặt**.

Từ lần sau, đăng nhập trên máy nào phần mềm cũng tự nhớ. Nếu giáo viên bấm **Đăng xuất**, lần sau phải nhập lại tài khoản và mật khẩu.

## Giáo viên quên mật khẩu

- Giáo viên đã khai báo **email khôi phục** (Cài đặt → Tài khoản → Email khôi phục): tự bấm **Quên mật khẩu?** ở màn đăng nhập, nhận mã 6 số
  qua email (hiệu lực 15 phút, sai quá 5 lần phải xin mã mới) và đặt mật khẩu mới.
- Chưa khai báo email: quản trị bấm **Đặt lại mật khẩu** ở trang quản trị rồi gửi mật khẩu mới cho giáo viên.
- Cả hai cách đều làm mất "két cấu hình" (vì két được mã hóa bằng mật khẩu cũ): giáo viên đăng nhập lại rồi kết nối lại Google Drive một lần.
  Dữ liệu trên Drive không mất.
- Thư do tài khoản Google của quản trị gửi (tối đa khoảng 100 thư mỗi ngày với Gmail miễn phí). Lần triển khai đầu Google sẽ hỏi thêm quyền gửi thư.

## Máy chủ này lưu gì

| Lưu | Không lưu |
|---|---|
| Tên tài khoản, họ tên, email | Mật khẩu của quản trị dạng rõ (chỉ lưu bản băm) |
| **Mật khẩu của giáo viên** (quản trị xem được bằng nút con mắt) | Mật khẩu giáo viên trong tệp sao lưu trên Drive (tệp chỉ có bản băm) |
| Trạng thái khóa, lần đăng nhập gần nhất | Bộ câu hỏi, kết quả học sinh |
| "Két cấu hình" của giáo viên, **đã mã hóa bằng mật khẩu của giáo viên** | Nội dung két dạng đọc được |

Vì két được mã hóa bằng mật khẩu của giáo viên, khi quản trị **đặt lại mật khẩu** thì két cũ không mở được nữa: giáo viên dán lại
ba thông tin ở bước 4. Dữ liệu trên Drive của giáo viên không bị ảnh hưởng.

## Tên tài khoản và mật khẩu của giáo viên (từ bản 1.4.0)

- **Tên tài khoản:** 3–32 ký tự, không có dấu cách. Dùng được toàn số (ví dụ số căn cước), chữ không dấu, chữ kết hợp số, và các ký tự
  `. _ - @ + ! # $ % & * = ? ~ ^`. Không phân biệt chữ hoa, chữ thường.
- **Mật khẩu:** từ 6 ký tự, đặt thế nào cũng được: toàn số, chữ, hoặc kết hợp chữ hoa, chữ thường, số, ký tự đặc biệt.
- Giáo viên **có thể giữ nguyên** mật khẩu được cấp, hoặc tự đổi ở **Cài đặt → Tài khoản**.
- Khi giáo viên đổi mật khẩu: **bắt buộc điền email**; mật khẩu mới được **gửi về email đó** và được **lưu ở máy chủ tài khoản**.
- Quản trị bấm **biểu tượng con mắt** ở cột Mật khẩu để xem mật khẩu hiện tại của giáo viên (tự ẩn sau 30 giây). Dưới mật khẩu có ghi chú nếu giáo viên đã tự đổi.

> **Hệ quả cần biết:** vì quản trị xem được mật khẩu, về kỹ thuật quản trị có thể đăng nhập thay giáo viên và thấy dữ liệu của giáo viên đó.
> Mật khẩu cũng đi qua email. Vì vậy hãy giữ kín tài khoản quản trị, và nhắc giáo viên không dùng lại mật khẩu của Gmail, ngân hàng hay tài khoản quan trọng khác.

## Giới hạn cần biết

- Việc bắt buộc đăng nhập được kiểm tra ở giao diện web. Quickplay là ứng dụng chạy trên trình duyệt và mã nguồn công khai, nên người rành kỹ thuật
  vẫn có thể tự dựng một bản không cần đăng nhập. Tài khoản dùng để **quản lý ai được dùng bản chính thức**, không phải để bảo vệ dữ liệu:
  dữ liệu của mỗi giáo viên được bảo vệ bằng khóa giáo viên của Apps Script riêng.
- Mỗi tài khoản một phiên: đăng nhập ở máy mới thì máy cũ bị đăng xuất ở lần kiểm tra kế tiếp.
- Tối đa 400 tài khoản (giới hạn dung lượng Script Properties).
- Thử trên máy lập trình mà chưa cần Google: `node apps-script-admin/mock-server.cjs` (địa chỉ `http://localhost:5181`, khóa `dev-admin-key`).
