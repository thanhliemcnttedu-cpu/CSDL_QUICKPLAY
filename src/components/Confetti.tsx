// Tung hoa giấy toàn màn hình (vẽ trên canvas, không chặn thao tác). Đổi `burst` (số mới) để tung một đợt.
import { useEffect, useRef } from 'react';

const COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#facc15'];

interface Piece { x: number; y: number; vx: number; vy: number; r: number; w: number; h: number; vr: number; color: string; shape: 0 | 1 | 2 }

export function Confetti({ burst, duration = 4200 }: { burst: number; duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!burst) return;
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.scale(dpr, dpr);
    const n = reduce ? 40 : Math.min(260, Math.round(W / 5));
    const pieces: Piece[] = [];
    for (let i = 0; i < n; i++) {
      // hai "pháo" ở hai góc dưới bắn chéo lên, cộng một lớp rơi từ trên xuống
      const side = i % 3;
      const fromTop = side === 2;
      const x = fromTop ? Math.random() * W : side === 0 ? -10 : W + 10;
      const y = fromTop ? -20 - Math.random() * H * 0.3 : H * (0.55 + Math.random() * 0.3);
      const ang = side === 0 ? -Math.PI / 3 - Math.random() * 0.5 : -Math.PI * 2 / 3 + Math.random() * 0.5;
      const sp = fromTop ? 0 : 9 + Math.random() * 9;
      pieces.push({
        x, y,
        vx: fromTop ? (Math.random() - 0.5) * 2 : Math.cos(ang) * sp,
        vy: fromTop ? 1 + Math.random() * 2 : Math.sin(ang) * sp,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        w: 7 + Math.random() * 7, h: 4 + Math.random() * 6,
        color: COLORS[i % COLORS.length], shape: (i % 3) as 0 | 1 | 2,
      });
    }
    const start = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      const fade = t > duration - 800 ? Math.max(0, (duration - t) / 800) : 1;
      ctx.globalAlpha = fade;
      for (const p of pieces) {
        p.vy += 0.22; // trọng lực
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.x += p.vx + Math.sin((t + p.w * 100) / 300) * 0.6; // lắc lư khi rơi
        p.y += Math.min(p.vy, 6);
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        if (p.shape === 0) ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.h / 1.6, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.scale(1, Math.abs(Math.cos(p.r * 2)) + 0.2); ctx.fillRect(-p.w / 2, -2, p.w, 4); } // dải ruy băng lật
        ctx.restore();
      }
      if (t < duration) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); };
  }, [burst, duration]);
  return <canvas ref={ref} className="confetti-layer" aria-hidden />;
}
