// Máy quét thẻ giấy: tìm mọi ô mã đen trong một khung hình và đọc số thẻ + cạnh đang hướng lên.
// Thuật toán tự viết, chạy thuần trên trình duyệt (không thư viện):
//   ảnh xám → ngưỡng thích nghi → vùng đen liền nhau → 4 góc → nắn phối cảnh → đọc lưới 6×6 → giải mã.
import { decodeCard } from './paperCard';

export interface Pt { x: number; y: number }
export interface CardHit {
  card: number; // 1..100
  side: number; // 0..3 = A..D: cạnh của thẻ đang hướng lên trên
  corners: [Pt, Pt, Pt, Pt]; // theo chiều kim đồng hồ trong ảnh
}

let buf: { w: number; h: number; integral: Uint32Array; bin: Uint8Array; queue: Int32Array } | null = null;
function buffers(w: number, h: number) {
  // Cấp lại khi khung hình đổi kích thước HOẶC đổi chiều (xoay điện thoại): hàng/cột đầu của ảnh tích phân phải là 0
  if (!buf || buf.w !== w || buf.h !== h) buf = { w, h, integral: new Uint32Array((w + 1) * (h + 1)), bin: new Uint8Array(w * h), queue: new Int32Array(w * h) };
  return buf;
}

/** Chuyển ImageData RGBA sang ảnh xám. */
export function toGray(rgba: Uint8ClampedArray, out?: Uint8Array): Uint8Array {
  const n = rgba.length >> 2;
  const g = out && out.length === n ? out : new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return g;
}

/** Ánh xạ phối cảnh từ hình vuông đơn vị sang tứ giác p0..p3 (Heckbert). */
function squareToQuad(p: Pt[]) {
  const [p0, p1, p2, p3] = p;
  const dx1 = p1.x - p2.x, dy1 = p1.y - p2.y, dx2 = p3.x - p2.x, dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (sx * dy2 - dx2 * sy) / den : 0;
  const hh = den ? (dx1 * sy - sx * dy1) / den : 0;
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + hh * p3.x, c = p0.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + hh * p3.y, f = p0.y;
  return (u: number, v: number): Pt => {
    const k = g * u + hh * v + 1;
    return { x: (a * u + b * v + c) / k, y: (d * u + e * v + f) / k };
  };
}

export function detectCards(gray: Uint8Array, w: number, h: number, debug?: string[]): CardHit[] {
  const { integral, bin, queue } = buffers(w, h);
  const W1 = w + 1;
  // Ảnh tích phân
  let total = 0;
  for (let y = 0; y < h; y++) {
    let row = 0;
    const o = y * w, io = (y + 1) * W1;
    for (let x = 0; x < w; x++) {
      row += gray[o + x];
      integral[io + x + 1] = integral[io - W1 + x + 1] + row;
    }
    total += row;
  }
  const dark = (total / (w * h)) * 0.42; // rất tối so với cả khung hình → chắc chắn là đen
  // Ngưỡng thích nghi: đen nếu tối hơn 82% trung bình vùng lân cận (cửa sổ ~1/5 khung hình)
  const r = Math.max(8, Math.round(Math.max(w, h) / 10));
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * W1 + x1] - integral[y0 * W1 + x1] - integral[y1 * W1 + x0] + integral[y0 * W1 + x0];
      const g = gray[y * w + x];
      bin[y * w + x] = g * (x1 - x0) * (y1 - y0) * 100 < sum * 82 || g < dark ? 1 : 0;
    }
  }

  const hits: CardHit[] = [];
  const minSide = 14, maxSide = Math.min(w, h) * 0.95;
  for (let start = 0; start < w * h; start++) {
    if (bin[start] !== 1) continue;
    // Loang vùng đen liền nhau (4 hướng); queue giữ luôn danh sách điểm của vùng
    let head = 0, tail = 0;
    queue[tail++] = start;
    bin[start] = 2;
    let minX = w, maxX = 0, minY = h, maxY = 0, sx = 0, sy = 0;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w, y = (i - x) / w;
      sx += x; sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && bin[i - 1] === 1) { bin[i - 1] = 2; queue[tail++] = i - 1; }
      if (x < w - 1 && bin[i + 1] === 1) { bin[i + 1] = 2; queue[tail++] = i + 1; }
      if (y > 0 && bin[i - w] === 1) { bin[i - w] = 2; queue[tail++] = i - w; }
      if (y < h - 1 && bin[i + w] === 1) { bin[i + w] = 2; queue[tail++] = i + w; }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (tail < 120 || bw < minSide || bh < minSide || bw > maxSide || bh > maxSide || bw > bh * 3 || bh > bw * 3) continue;
    if (minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1) continue; // bị cắt ở mép ảnh

    // Bốn góc: điểm xa tâm nhất, điểm xa nó nhất, và hai điểm xa đường chéo đó nhất ở mỗi phía
    const cx = sx / tail, cy = sy / tail;
    let a = 0, best = -1;
    for (let k = 0; k < tail; k++) {
      const i = queue[k], x = i % w, y = (i - x) / w, d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d > best) { best = d; a = i; }
    }
    const ax = a % w, ay = (a - ax) / w;
    let b = 0;
    best = -1;
    for (let k = 0; k < tail; k++) {
      const i = queue[k], x = i % w, y = (i - x) / w, d = (x - ax) * (x - ax) + (y - ay) * (y - ay);
      if (d > best) { best = d; b = i; }
    }
    const bx = b % w, by = (b - bx) / w;
    let c = 0, dd = 0, hi = 0, lo = 0;
    for (let k = 0; k < tail; k++) {
      const i = queue[k], x = i % w, y = (i - x) / w;
      const cr = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (cr > hi) { hi = cr; c = i; }
      if (cr < lo) { lo = cr; dd = i; }
    }
    const why = (m: string) => { if (debug && bw > 40) debug.push(`${minX},${minY} ${bw}x${bh} n=${tail}: ${m}`); };
    if (!hi || !lo) { why('no-corners'); continue; }
    const pc = { x: c % w, y: Math.floor(c / w) }, pd = { x: dd % w, y: Math.floor(dd / w) };
    // Sắp theo góc quanh tâm: với trục y hướng xuống, góc tăng dần = chiều kim đồng hồ trong ảnh
    const raw: Pt[] = [{ x: ax, y: ay }, pd, { x: bx, y: by }, pc];
    const ox = (raw[0].x + raw[1].x + raw[2].x + raw[3].x) / 4, oy = (raw[0].y + raw[1].y + raw[2].y + raw[3].y) / 4;
    const quad = raw.sort((p1, p2) => Math.atan2(p1.y - oy, p1.x - ox) - Math.atan2(p2.y - oy, p2.x - ox));
    const area = Math.abs(quad.reduce((t, p, k) => t + p.x * quad[(k + 1) % 4].y - quad[(k + 1) % 4].x * p.y, 0)) / 2;
    if (area < minSide * minSide) continue;
    const fill = tail / area;
    if (fill < 0.42 || fill > 1.08) { why('fill ' + fill.toFixed(2) + ' quad ' + JSON.stringify(quad)); continue; }
    const len = quad.map((p, k) => Math.hypot(p.x - quad[(k + 1) % 4].x, p.y - quad[(k + 1) % 4].y));
    if (Math.min(...len) < Math.max(...len) * 0.45) { why('sides'); continue; }

    // Nới các góc ra nửa điểm ảnh (góc tìm được nằm ở tâm điểm ảnh mép)
    const mx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4, my = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
    const q = quad.map((p) => {
      const l = Math.hypot(p.x - mx, p.y - my) || 1;
      return { x: p.x + 0.5 + ((p.x - mx) / l) * 0.7, y: p.y + 0.5 + ((p.y - my) / l) * 0.7 };
    });
    const map = squareToQuad(q);
    const cellBlack = (row: number, col: number) => {
      let n = 0;
      for (const [du, dv] of SAMPLES) {
        const p = map((col + 0.5 + du) / 6, (row + 0.5 + dv) / 6);
        const xi = p.x | 0, yi = p.y | 0;
        if (xi >= 0 && yi >= 0 && xi < w && yi < h && bin[yi * w + xi]) n++;
      }
      return n >= 3;
    };
    let borderWhite = 0;
    for (let k = 0; k < 6; k++) {
      if (!cellBlack(0, k)) borderWhite++;
      if (!cellBlack(5, k)) borderWhite++;
      if (k > 0 && k < 5) {
        if (!cellBlack(k, 0)) borderWhite++;
        if (!cellBlack(k, 5)) borderWhite++;
      }
    }
    if (borderWhite > 2) { why('border ' + borderWhite); continue; }
    let seen = 0;
    for (let rr = 0; rr < 4; rr++) for (let cc = 0; cc < 4; cc++) if (cellBlack(rr + 1, cc + 1)) seen |= 1 << (15 - (rr * 4 + cc));
    const dec = decodeCard(seen);
    if (!dec) { why('decode ' + seen.toString(2)); continue; }
    // Thẻ đã xoay `turns` lần theo chiều kim đồng hồ: góc trên-trái gốc của thẻ nằm ở q[turns]
    let side = 0, top = Infinity;
    for (let s = 0; s < 4; s++) {
      const p1 = q[(dec.turns + s) % 4], p2 = q[(dec.turns + s + 1) % 4];
      const y = (p1.y + p2.y) / 2;
      if (y < top) { top = y; side = s; }
    }
    hits.push({ card: dec.card, side, corners: q as [Pt, Pt, Pt, Pt] });
  }
  return hits;
}
const SAMPLES: [number, number][] = [[0, 0], [-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]];
