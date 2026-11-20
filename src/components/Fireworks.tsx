// Pháo hoa chúc mừng: gọi `celebrate(key)` để bắn đúng một lần cho mỗi `key` trong một phiên trình duyệt (tải lại trang không bắn lại).
// Canvas tự gắn vào trang, không chặn thao tác, tự gỡ khi hết giờ.

const COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#facc15', '#ffffff'];
const DEFAULT_MS = 5000;

interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number }
interface Rocket { x: number; y: number; vy: number; target: number; color: string; exploded: boolean }

/** Bắn pháo hoa một lần cho `key`. Lần thứ hai cùng `key` trong phiên trình duyệt sẽ bị bỏ qua. */
export function celebrate(key: string, duration = DEFAULT_MS) {
  const k = `quickplay-fw-${key}`;
  try {
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, '1');
  } catch { /* trình duyệt chặn bộ nhớ: vẫn bắn, chỉ có thể bắn lại khi tải lại */ }
  launchFireworks(duration);
}

/** Bắn pháo hoa ngay (không kiểm tra đã bắn chưa). */
export function launchFireworks(duration = DEFAULT_MS) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return; // người dùng tắt hiệu ứng chuyển động
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:95';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) { cv.remove(); return; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const sparks: Spark[] = [];
  const rockets: Rocket[] = [];
  const explode = (x: number, y: number, color: string) => {
    const n = 46 + Math.round(Math.random() * 20);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.15;
      const sp = 2 + Math.random() * 4.5;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color: Math.random() < 0.2 ? COLORS[Math.floor(Math.random() * COLORS.length)] : color, r: 1.6 + Math.random() * 1.6 });
    }
  };
  const launch = () => {
    rockets.push({ x: W * (0.15 + Math.random() * 0.7), y: H, vy: -(9 + Math.random() * 4), target: H * (0.18 + Math.random() * 0.3), color: COLORS[Math.floor(Math.random() * COLORS.length)], exploded: false });
  };

  const start = performance.now();
  let last = start;
  let nextLaunch = start;
  const frame = (now: number) => {
    const t = now - start;
    const dt = Math.min(2, (now - last) / 16.7); // chuẩn hóa theo nhịp 60 khung/giây
    last = now;
    if (t < duration - 900 && now >= nextLaunch) {
      launch();
      nextLaunch = now + 350 + Math.random() * 450;
    }
    const fade = t > duration - 900 ? Math.max(0, (duration - t) / 900) : 1;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = fade;

    for (const r of rockets) {
      if (r.exploded) continue;
      r.y += r.vy * dt;
      r.vy += 0.12 * dt;
      ctx.fillStyle = r.color;
      ctx.beginPath(); ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2); ctx.fill();
      if (r.vy >= 0 || r.y <= r.target) {
        r.exploded = true;
        explode(r.x, r.y, r.color);
      }
    }
    for (let i = rockets.length - 1; i >= 0; i--) if (rockets[i].exploded) rockets.splice(i, 1);

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 0.06 * dt; // trọng lực nhẹ
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= 0.012 * dt;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = fade * p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + p.life * 0.4), 0, Math.PI * 2); ctx.fill();
    }

    if (t < duration) requestAnimationFrame(frame);
    else cv.remove();
  };
  launch();
  requestAnimationFrame(frame);
}
