import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Đường dẫn ngắn dễ nhớ: /giao-vien và /hoc-sinh(?pin=123456) → chuyển sang trang tương ứng trong ứng dụng.
const SHORT_LINKS: Record<string, string> = {
  '/giao-vien': '/teacher',
  '/giaovien': '/teacher',
  '/hoc-sinh': '/join',
  '/hocsinh': '/join',
  '/quet': '/scan', // máy quét thẻ giấy trên điện thoại (mở từ mã QR trên màn chiếu)
};
const short = SHORT_LINKS[location.pathname.replace(/\/+$/, '').toLowerCase()];
if (short && location.protocol.startsWith('http')) {
  history.replaceState(null, '', `/#${short}${location.search}`);
}

// Bộ đệm ngoại tuyến: chỉ bật ở bản đã phát hành trên web (https), không bật khi lập trình và trong bản .exe
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
