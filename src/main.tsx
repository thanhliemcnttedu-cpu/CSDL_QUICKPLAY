import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { installStaleBuildGuard } from './lib/staleBuild';
import { installAudioUnlock } from './lib/sound';

// Trang mở từ trước khi có bản mới: tự tải lại khi không tìm thấy tệp mã cũ (lỗi "Failed to fetch dynamically imported module")
installStaleBuildGuard();
// Điện thoại (kể cả mở link trong Zalo): mở khóa âm thanh ở lần chạm đầu tiên để có nhạc và tiếng đúng / sai
installAudioUnlock();

// Đường dẫn ngắn dễ nhớ: /giao-vien và /hoc-sinh(?pin=123456) → chuyển sang trang tương ứng trong ứng dụng.
const SHORT_LINKS: Record<string, string> = {
  // Giáo viên
  '/teacher': '/teacher',
  '/giao-vien': '/teacher',
  '/giaovien': '/teacher',
  // Quản trị cao nhất của toàn hệ thống (cấp, khóa tài khoản giáo viên)
  '/adminquantri': '/admin',
  // Học sinh tham gia trò chơi
  '/join': '/join',
  '/jon': '/join',
  '/hoc-sinh': '/join',
  '/hocsinh': '/join',
  '/quet': '/scan', // máy quét thẻ giấy trên điện thoại (mở từ mã QR trên màn chiếu)
};
const short = SHORT_LINKS[location.pathname.replace(/\/+$/, '').toLowerCase()];
if (short && location.protocol.startsWith('http')) {
  history.replaceState(null, '', `/#${short}${location.search}`);
}

// Bộ đệm ngoại tuyến: chỉ bật ở bản đã phát hành trên web (https), không bật khi lập trình
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
