// Bộ đệm ngoại tuyến của Quickplay: lần mở sau tải gần như tức thì, mạng yếu vẫn vào được giao diện.
// - Tệp trong /assets/ có mã băm trong tên nên không bao giờ đổi nội dung: lấy từ bộ đệm trước.
// - Trang gốc (index.html): lấy từ mạng trước để luôn nhận bản mới; mất mạng thì dùng bản đã lưu.
// - Không đụng tới yêu cầu gửi dữ liệu (POST) và mọi địa chỉ ngoài trang này (Apps Script, Google Drive, YouTube…).
const CACHE = 'quickplay-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Trang gốc, biểu tượng, manifest: mạng trước, bộ đệm dự phòng
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? (await caches.match('/')) || Response.error() : Response.error())),
  );
});
