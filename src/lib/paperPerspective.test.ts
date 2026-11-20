import { describe, expect, it } from 'vitest';
import { CARD_CODES, cardBit } from './paperCard';
import { detectCards } from './paperScan';

/**
 * Dựng ảnh thẻ bị XOAY và NGHIÊNG theo phối cảnh (cầm thẻ nghiêng so với máy ảnh).
 * Thẻ: lưới 6×6 đơn vị, tâm (3,3); mép thẻ mở rộng ra tờ giấy (-1.6..7.6).
 * Phép chiếu: xoay quanh tâm rồi chia cho (1 + kx·dx + ky·dy) — mô phỏng độ nghiêng.
 */
function renderPerspective(w: number, h: number, cards: { card: number; cx: number; cy: number; size: number; deg: number; kx: number; ky: number }[]) {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = 120 + (x / w) * 50;
  const paint = (X: number, Y: number, v: number) => {
    const xi = Math.round(X), yi = Math.round(Y);
    if (xi >= 0 && yi >= 0 && xi < w && yi < h) g[yi * w + xi] = v;
  };
  for (const c of cards) {
    const a = (-c.deg * Math.PI) / 180;
    const s = c.size / 6;
    const project = (u: number, t: number) => {
      const dx = (u - 3) * s, dy = (t - 3) * s;
      const X0 = dx * Math.cos(a) - dy * Math.sin(a), Y0 = dx * Math.sin(a) + dy * Math.cos(a);
      const k = 1 + c.kx * X0 + c.ky * Y0;
      return { x: c.cx + X0 / k, y: c.cy + Y0 / k };
    };
    const step = 0.02;
    for (let u = -1.6; u <= 7.6; u += step)
      for (let t = -1.6; t <= 7.6; t += step) {
        const p = project(u, t);
        const inCard = u >= 0 && t >= 0 && u < 6 && t < 6;
        if (!inCard) { paint(p.x, p.y, 235); continue; }
        const col = Math.floor(u), row = Math.floor(t);
        const border = col === 0 || row === 0 || col === 5 || row === 5;
        const black = border || cardBit(CARD_CODES[c.card - 1], row - 1, col - 1);
        paint(p.x, p.y, black ? 35 : 235);
      }
  }
  return g;
}

describe('thẻ nghiêng theo phối cảnh', () => {
  // Hàm dựng ảnh xoay thẻ NGƯỢC chiều kim đồng hồ k·90° (deg dương): cạnh đang hướng lên là (A=0,B=1,C=2,D=3)[k]
  const expectSide = [0, 1, 2, 3];
  it('đọc đúng cạnh trên khi thẻ nghiêng mạnh theo nhiều hướng', () => {
    const tilts: { kx: number; ky: number }[] = [
      { kx: 0.0012, ky: 0 }, // nghiêng trái-phải
      { kx: 0, ky: 0.0012 }, // nghiêng trước-sau
      { kx: 0.0009, ky: -0.0007 },
    ];
    const fails: string[] = [];
    for (const tilt of tilts) for (const turn of [0, 0, 0, 0]) for (const extra of [-18, 0, 18]) {
      const cards = [0, 1, 2, 3].map((k) => ({ card: 10 + k * 23, cx: 110 + k * 190, cy: 130, size: 90, deg: k * 90 + extra + turn, kx: tilt.kx, ky: tilt.ky }));
      const hits = detectCards(renderPerspective(800, 260, cards), 800, 260);
      cards.forEach((c, k) => {
        const hit = hits.find((x) => x.card === c.card);
        if (!hit) fails.push(`thẻ ${c.card} không nhận ra (nghiêng ${JSON.stringify(tilt)}, xoay ${c.deg}°)`);
        else if (hit.side !== expectSide[k] && expectSide[k] !== undefined) fails.push(`thẻ ${c.card}: cạnh ${hit.side} thay vì ${expectSide[k]} (nghiêng ${JSON.stringify(tilt)}, xoay ${c.deg}°)`);
      });
    }
    expect(fails).toEqual([]);
  });
});
