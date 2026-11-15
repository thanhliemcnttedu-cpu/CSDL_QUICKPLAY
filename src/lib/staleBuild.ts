// Trang đang mở là BẢN CŨ (mở trước khi Quickplay phát hành bản mới lên Vercel): các tệp mã tách nhỏ đã đổi tên,
// nên lúc bấm một chức năng tải mã theo nhu cầu (đọc Word, tải file mẫu, PDF…) trình duyệt báo
// "Failed to fetch dynamically imported module". Cách sửa: tải lại trang để nhận bản mới.
// - Đang soạn đề (có thể chưa lưu): KHÔNG tự tải lại, hiện thanh báo có nút "Tải lại trang".
// - Chỗ khác: tự tải lại một lần, sau đó báo thầy cô bấm lại thao tác vừa rồi.
const FLAG = 'quickplay.reloadedForNewBuild';

function banner(text: string, withButton: boolean, hideAfterMs = 0) {
  document.getElementById('qp-new-build')?.remove();
  const box = document.createElement('div');
  box.id = 'qp-new-build';
  box.setAttribute('role', 'alert');
  box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;max-width:min(560px,calc(100vw - 32px));' +
    'display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-radius:16px;background:#0a1730;color:#fff;' +
    "font:600 15px/1.45 'Be Vietnam Pro',system-ui,sans-serif;box-shadow:0 14px 32px -12px rgba(10,23,48,.55)";
  const span = document.createElement('span');
  span.style.flex = '1 1 220px';
  span.textContent = text;
  box.append(span);
  if (withButton) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Tải lại trang';
    b.style.cssText = 'min-height:44px;padding:8px 20px;border-radius:999px;border:0;cursor:pointer;font:inherit;font-weight:800;color:#fff;background:linear-gradient(180deg,#2f80ff,#1262f0)';
    b.onclick = () => location.reload();
    box.append(b);
  }
  document.body.append(box);
  if (hideAfterMs) setTimeout(() => box.remove(), hideAfterMs);
}

export function installStaleBuildGuard() {
  // Vừa tự tải lại vì có bản mới: nhắc bấm lại thao tác
  try {
    const at = Number(sessionStorage.getItem(FLAG) || 0);
    if (at && Date.now() - at < 60_000) {
      window.addEventListener('load', () => banner('Quickplay vừa cập nhật lên bản mới. Thầy cô bấm lại thao tác vừa rồi nhé.', false, 7000));
    }
  } catch { /* bỏ qua */ }

  window.addEventListener('vite:preloadError', (e) => {
    const editing = /^#\/teacher\/edit\//.test(location.hash);
    let recent = false;
    try { recent = Date.now() - Number(sessionStorage.getItem(FLAG) || 0) < 30_000; } catch { /* bỏ qua */ }
    if (editing || recent) {
      // Không tự tải lại: tránh mất bài đang soạn, tránh tải lại liên tục khi mạng hỏng
      banner(editing
        ? 'Quickplay vừa có bản mới nên chức năng này chưa mở được. Thầy cô bấm Lưu bộ đề trước, rồi bấm Tải lại trang.'
        : 'Chưa tải được một phần của phần mềm. Kiểm tra mạng rồi bấm Tải lại trang.', true);
      return; // để lỗi đi tiếp, chỗ gọi tự báo lỗi như cũ
    }
    e.preventDefault();
    try { sessionStorage.setItem(FLAG, String(Date.now())); } catch { /* bỏ qua */ }
    location.reload();
  });
}
