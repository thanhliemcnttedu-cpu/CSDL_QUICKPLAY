// Trang đang mở là BẢN CŨ (mở trước khi Quickplay phát hành bản mới lên Vercel): các tệp mã tách nhỏ đã đổi tên
// và tệp cũ bị xóa, nên lúc mở một trang / chức năng tải mã theo nhu cầu, trình duyệt báo
// "Failed to fetch dynamically imported module". Cách sửa: tải lại trang để nhận bản mới.
// 1) Đón trước: định kỳ (và khi quay lại tab) hỏi xem đã có bản mới chưa; có thì lần chuyển trang kế tiếp tải lại luôn
//    (trừ khi đang soạn đề, đang chơi / làm bài, đang điều khiển buổi học).
// 2) Gặp lỗi tải mã: tự tải lại (tối đa 3 lần trong 2 phút, phòng mạng hỏng tải lại mãi); đang soạn đề thì không tự tải lại.
const FLAG = 'quickplay.reloadedForNewBuild';
const TRIES = 'quickplay.newBuildReloads';
const MAX_TRIES = 3;
const WINDOW_MS = 120_000;
const CHECK_EVERY = 5 * 60_000;

function banner(text: string, withButton: boolean, hideAfterMs = 0, urls: string[] = []) {
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
    // Bấm nút: dọn sạch bộ đệm ngoại tuyến (không chỉ tệp lỗi) để chắc chắn nhận bản mới
    b.onclick = () => { b.disabled = true; b.textContent = 'Đang tải lại…'; reloading = false; void hardReload(urls, true); };
    box.append(b);
  }
  document.body.append(box);
  if (hideAfterMs) setTimeout(() => box.remove(), hideAfterMs);
}

/** Số lần đã tự tải lại vì bản mới trong 2 phút gần nhất. */
export function recentReloads(list: number[], now = Date.now()): number[] {
  return list.filter((t) => now - t < WINDOW_MS);
}
function readTries(): number[] {
  try { return recentReloads(JSON.parse(sessionStorage.getItem(TRIES) || '[]')); } catch { return []; }
}

/** Các tệp mã (/assets/…js|css) được nhắc tới trong thông báo lỗi tải mã. */
export function assetUrlsOf(message: string): string[] {
  return [...new Set((message.match(/\/assets\/[\w.-]+\.(?:js|css)/g) ?? []))];
}

/**
 * Xóa bản lỗi trong bộ nhớ đệm của trình duyệt cho các tệp mã không tải được:
 * - tải lại từng tệp thẳng từ máy chủ (cache: 'reload' ghi đè cả lỗi 404 trình duyệt đã nhớ);
 * - xóa các tệp đó khỏi bộ đệm ngoại tuyến (sw.js); không biết tệp nào thì xóa cả bộ đệm ngoại tuyến.
 * Nhờ vậy thầy cô không phải mở trình duyệt ẩn danh hay tự xóa bộ nhớ đệm khi Quickplay lên bản mới.
 */
export async function repairCache(urls: string[]): Promise<void> {
  const work = (async () => {
    await Promise.all(urls.map((u) => fetch(u, { cache: 'reload', credentials: 'same-origin' }).catch(() => null)));
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    if (!urls.length) { await Promise.all(keys.map((k) => caches.delete(k))); return; }
    await Promise.all(keys.map(async (k) => { const c = await caches.open(k); await Promise.all(urls.map((u) => c.delete(u))); }));
  })().catch(() => {});
  await Promise.race([work, new Promise((ok) => setTimeout(ok, 5000))]);
}

let reloading = false;
/** Sửa bộ nhớ đệm của các tệp lỗi rồi tải lại (để chắc chắn nhận mã mới). */
async function hardReload(urls: string[] = [], all = false) {
  if (reloading) return;
  reloading = true;
  try {
    sessionStorage.setItem(FLAG, String(Date.now()));
    sessionStorage.setItem(TRIES, JSON.stringify([...readTries(), Date.now()]));
  } catch { /* bỏ qua */ }
  await repairCache(urls);
  if (all && urls.length) await repairCache([]); // nút "Tải lại trang": dọn cả bộ đệm ngoại tuyến
  location.reload();
}

/** Tên tệp mã chính (index-<mã băm>.js) trong một trang index.html. */
export function entryOf(html: string): string | null {
  return html.match(/assets\/(index-[\w-]+\.js)/)?.[1] ?? null;
}
const currentEntry = () => entryOf(document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')?.getAttribute('src') ?? '');

/** Màn không được tự tải lại giữa chừng: đang soạn đề, đang chơi / làm bài, đang điều khiển buổi học, máy quét thẻ. */
export const busyRoute = (hash: string) => /^#\/(teacher\/edit\/|teacher\/host\/|teacher\/paper\/\d|play\/|scan|demo|teacher\/preview\/)/.test(hash);

let newer = false;
async function checkForNewBuild() {
  const mine = currentEntry();
  if (!mine || newer || !location.protocol.startsWith('http')) return;
  try {
    const res = await fetch('/', { cache: 'no-store' });
    const theirs = entryOf(await res.text());
    if (theirs && theirs !== mine) newer = true;
  } catch { /* mất mạng: lần sau hỏi lại */ }
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
    if (reloading) { e.preventDefault(); return; } // đã đang tải lại sang bản mới
    const err = (e as Event & { payload?: unknown }).payload;
    const urls = assetUrlsOf(String((err as Error | undefined)?.message ?? err ?? ''));
    const editing = /^#\/teacher\/edit\//.test(location.hash);
    const tooMany = readTries().length >= MAX_TRIES;
    if (editing || tooMany) {
      // Không tự tải lại: tránh mất bài đang soạn, tránh tải lại liên tục khi mạng hỏng.
      // Vẫn dọn ngay bản lỗi trong bộ nhớ đệm, để lần bấm Tải lại trang chắc chắn nhận mã mới.
      void repairCache(urls);
      banner(editing
        ? 'Quickplay vừa có bản mới nên chức năng này chưa mở được. Thầy cô bấm Lưu bộ đề trước, rồi bấm Tải lại trang.'
        : 'Chưa tải được một phần của phần mềm. Kiểm tra mạng rồi bấm Tải lại trang.', true, 0, urls);
      return; // để lỗi đi tiếp, chỗ gọi tự báo lỗi như cũ
    }
    e.preventDefault();
    void hardReload(urls, readTries().length >= 1); // lần thứ hai trở đi: dọn cả bộ đệm ngoại tuyến
  });

  // Đón trước bản mới: hỏi khi mở trang được một lúc, khi quay lại tab, và 5 phút một lần
  if (import.meta.env.PROD) {
    window.setTimeout(checkForNewBuild, 20_000);
    window.setInterval(checkForNewBuild, CHECK_EVERY);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForNewBuild(); });
  }
  // Đã biết có bản mới: chuyển sang trang khác (bấm menu, nút) thì tải lại luôn bằng địa chỉ mới, trước khi kịp lỗi.
  // Menu trong phần mềm đổi trang bằng history.pushState (không phát sự kiện hashchange) nên bắt cả hai.
  const onRoute = (from: string) => {
    if (!newer || reloading || from === location.hash) return;
    if (busyRoute(from) || busyRoute(location.hash)) return;
    hardReload();
  };
  window.addEventListener('hashchange', (ev) => onRoute('#' + (ev.oldURL.split('#')[1] ?? '')));
  for (const m of ['pushState', 'replaceState'] as const) {
    const orig = history[m].bind(history);
    history[m] = (...args: Parameters<History['pushState']>) => {
      const from = location.hash;
      orig(...args);
      onRoute(from);
    };
  }
}
