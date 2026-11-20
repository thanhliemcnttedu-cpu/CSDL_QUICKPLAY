# Bản cài đặt Quickplay cho Windows

Quickplay có thể chạy như một phần mềm cài trên máy tính Windows (đóng gói bằng Electron), bên cạnh bản web chạy trên trình duyệt. Hai bản dùng chung dữ liệu trên Google Drive.

## 1. Tạo bộ cài đặt (dành cho người phát triển)

Yêu cầu: Windows 10/11 64-bit, Node.js 18 trở lên, có kết nối Internet ở lần build đầu tiên (để tải Electron và NSIS).

Mở PowerShell tại thư mục dự án và chạy:

```powershell
npm install
npm run dist:win
```

Lệnh `dist:win` sẽ:

1. Build bản web vào thư mục `dist/` (`vite build --base=./`).
2. Đóng gói bằng electron-builder theo cấu hình `electron-builder.yml`.

Kết quả nằm ở:

```
release\Quickplay-Setup-<phiên bản>.exe
```

Ví dụ: `release\Quickplay-Setup-1.0.0.exe`. Phiên bản lấy từ trường `version` trong `package.json`.

Chạy thử không cần đóng gói: `npm run electron:dev`.

**Nên đặt địa chỉ bản web trước khi build** để mã QR/link vào phòng trên bản máy tính trỏ tới Vercel
(bản máy tính chạy từ `file://` nên không tự có địa chỉ web):

```powershell
$env:VITE_PUBLIC_URL = "https://ten-du-an.vercel.app/"; npm run dist:win
```

### Lỗi "Cannot create symbolic link : A required privilege is not held by the client"

electron-builder tải gói `winCodeSign` có chứa liên kết tượng trưng của macOS; Windows không cho tài khoản
thường tạo liên kết này. Cách xử lý (chỉ làm một lần, không cần quyền quản trị):

```powershell
cd $env:LOCALAPPDATA\electron-builder\Cache\winCodeSign
& "<thư mục dự án>\node_modules\7zip-bin\win\x64\7za.exe" x -y (Get-ChildItem *.7z | Select-Object -First 1).Name -owinCodeSign-2.6.0
```

Lệnh báo 2 lỗi với tệp `.dylib` của macOS là bình thường. Sau đó chạy lại `npm run dist:win`.
Cách khác: bật **Developer Mode** trong Windows Settings, hoặc chạy PowerShell bằng quyền Administrator.

## 2. Cài đặt trên máy giáo viên

1. Chép tệp `Quickplay-Setup-<phiên bản>.exe` sang máy cần cài và nhấp đúp.
2. Chọn thư mục cài đặt (có thể giữ mặc định) và bấm **Cài đặt**.
3. Sau khi cài xong sẽ có lối tắt **Quickplay** trên màn hình nền và trong menu Start.

### Cảnh báo Windows SmartScreen

Bộ cài đặt hiện **chưa được ký số** (code signing), nên Windows có thể hiện hộp thoại “Windows đã bảo vệ PC của bạn”. Nếu tệp được lấy từ nguồn tin cậy (do nhà trường/người phát triển cung cấp):

1. Bấm **Thông tin thêm** (More info).
2. Bấm **Vẫn chạy** (Run anyway).

Chỉ làm như vậy với bộ cài lấy từ nguồn bạn tin tưởng. Nếu phát hành rộng rãi, nên mua chứng chỉ ký mã để bỏ cảnh báo này.

## 3. Dùng chung dữ liệu Google Drive với bản web

Bản cài đặt không lưu dữ liệu riêng: mọi đề kiểm tra, câu hỏi và kết quả vẫn nằm trên Google Drive thông qua Google Apps Script.

Để bản cài đặt thấy đúng dữ liệu như bản web:

1. Mở Quickplay (bản cài đặt), vào **Cài đặt**.
2. Dán **cùng một URL Apps Script** (dạng `https://script.google.com/macros/s/.../exec`) mà bạn đang dùng ở bản web.
3. Lưu lại. Dữ liệu sẽ được tải từ cùng thư mục Drive.

Lưu ý: cài đặt (URL Apps Script…) được lưu riêng trên từng máy, nên mỗi máy mới cần nhập URL một lần. Gỡ cài đặt sẽ không xóa các cài đặt này.

### Làm việc khi mất mạng (tại các điểm trường không có Internet liên tục)

- Khi đã đăng nhập tài khoản giáo viên ít nhất một lần trên máy này, có thể mở phần mềm và soạn đề, ngân hàng câu hỏi, lớp học **ngay cả khi không có mạng**.
- Mọi thay đổi được lưu trên máy trước. Thanh trạng thái trên đầu hiện **Ngoại tuyến** hoặc **Chờ đẩy N**.
- Khi có mạng trở lại, phần mềm tự đẩy các thay đổi lên Google Drive của giáo viên và kéo bản mới về máy. Không cần thao tác gì.
- Nếu cùng một đề bị sửa cả trên máy lẫn trên Drive: bản mới hơn được giữ ở vị trí chính, bản còn lại được lưu thành bản sao có ghi chú "(xung đột …)". Không mất dữ liệu.
- Lưu ý: buổi học trực tiếp (mở phòng, học sinh nộp bài, thẻ giấy) và kết quả cần kết nối mạng như trước.
- Nên sao lưu ra tệp `.json` định kỳ (mục Sao lưu trong Cài đặt) để có thêm một bản dự phòng.

## 4. Những điểm khác biệt so với bản web

| Tính năng | Bản web (Chrome/Edge) | Bản cài đặt Windows |
|---|---|---|
| Nhập giọng nói thành chữ (voice-to-text) | Có | **Không** – Quickplay sẽ hiện thông báo |
| Ghi âm câu trả lời (micro) | Có | Có (Windows sẽ hỏi quyền micro lần đầu) |
| Dán ảnh từ clipboard | Có | Có |
| Video YouTube/Vimeo, ảnh Google Drive | Có | Có |
| Liên kết ngoài | Mở tab mới | Mở bằng trình duyệt mặc định |

Nhập giọng nói thành chữ dùng dịch vụ nhận dạng giọng nói của Google tích hợp trong Chrome/Edge, dịch vụ này không có trong bản cài đặt. Khi cần dùng tính năng này, hãy mở Quickplay bản web bằng Chrome hoặc Edge.

Nếu ghi âm không hoạt động, kiểm tra **Cài đặt Windows > Quyền riêng tư > Micro** và bật “Cho phép ứng dụng trên máy tính truy cập micro”.

## 5. Gỡ cài đặt

Vào **Cài đặt Windows > Ứng dụng**, tìm **Quickplay** và chọn **Gỡ cài đặt**. Dữ liệu trên Google Drive không bị ảnh hưởng.
