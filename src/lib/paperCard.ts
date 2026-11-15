// Thẻ trả lời giấy của Quickplay: ô mã đen 6×6 (viền đen 1 ô + lõi 4×4 = 16 bit) và bộ thẻ PDF.
// Bảng mã CỐ ĐỊNH – đổi bảng này là mọi bộ thẻ đã in sẽ không còn đọc được.
// 100 mã, mỗi mã và mọi phép xoay của mã khác lệch nhau ≥ 4 bit → tự sửa được 1 ô đọc sai.
export const CARD_CODES: readonly number[] = [
  16669, 9955, 47319, 13755, 28266, 30344, 3918, 28424, 18995, 17571, 58263, 30227, 36971, 40176, 29456, 46940, 5778, 6234, 43616, 24235,
  10395, 33839, 55353, 28277, 44545, 36508, 38282, 25932, 18828, 63692, 65026, 42765, 5817, 38173, 21549, 14202, 23328, 23942, 44182, 54174,
  53756, 27900, 29486, 11192, 37462, 18206, 19112, 63928, 20406, 9873, 39405, 8787, 11210, 55046, 5667, 30783, 25859, 17855, 9510, 24349,
  48685, 24560, 23255, 1430, 48486, 27966, 46949, 29048, 59920, 18131, 38950, 23307, 56554, 32316, 19198, 42843, 55984, 22671, 58276, 30730,
  17222, 10205, 12897, 15180, 57363, 41350, 26798, 22439, 36222, 3174, 44431, 46030, 50923, 53037, 12053, 64390, 21498, 58906, 46644, 45472,
];
export const CARD_COUNT = CARD_CODES.length;
export const SIDE_LABELS = ['A', 'B', 'C', 'D'] as const; // cạnh trên, phải, dưới, trái của thẻ khi để thẳng

/** Ô (hàng r, cột c) của lõi 4×4 có màu đen không. */
export const cardBit = (code: number, r: number, c: number) => ((code >> (15 - (r * 4 + c))) & 1) === 1;

/** Xoay lõi 4×4 một góc 90° theo chiều kim đồng hồ. */
export function rotateCode(code: number): number {
  let out = 0;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) if (cardBit(code, r, c)) out |= 1 << (15 - (c * 4 + (3 - r)));
  return out;
}

const popcount = (x: number) => {
  let n = 0;
  for (; x; x &= x - 1) n++;
  return n;
};

// code (đã xoay) -> [số thẻ, số lần đã xoay theo chiều kim đồng hồ so với thẻ để thẳng]
const LOOKUP = new Map<number, [number, number]>();
CARD_CODES.forEach((code, i) => {
  let c = code;
  for (let k = 0; k < 4; k++) {
    LOOKUP.set(c, [i + 1, k]);
    c = rotateCode(c);
  }
});

/** Giải mã lõi đọc được (theo hướng nhìn trong ảnh). Chấp nhận sai tối đa 1 ô. */
export function decodeCard(seen: number): { card: number; turns: number } | null {
  const hit = LOOKUP.get(seen);
  if (hit) return { card: hit[0], turns: hit[1] };
  for (let b = 0; b < 16; b++) {
    const near = LOOKUP.get(seen ^ (1 << b));
    if (near) return { card: near[0], turns: near[1] };
  }
  return null;
}
export const _minDistance = () => {
  const all = [...LOOKUP.keys()];
  let d = 16;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) d = Math.min(d, popcount(all[i] ^ all[j]));
  return d;
};

// ---------------- PDF bộ thẻ (tự ghi PDF, không cần thư viện) ----------------
const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** Ảnh đen trắng 1 bit của tên học sinh (trình duyệt vẽ bằng canvas để giữ đúng dấu tiếng Việt). */
export interface NameImage { w: number; h: number; hex: string }
export interface CardsPdfOptions {
  from?: number;
  to?: number;
  perPage?: 1 | 2; // 2 thẻ/tờ cho lớp thường; 1 thẻ/tờ (mã to) cho phòng rộng
  nameImage?: (card: number) => NameImage | null; // in sẵn tên từng em
}

/** Chữ Helvetica-Bold xoay quanh tâm (cx, cy); turns = số lần xoay 90° theo chiều kim đồng hồ. */
function text(s: string, size: number, cx: number, cy: number, turns: number): string {
  const w = s.split('').reduce((t, ch) => t + (/[0-9#]/.test(ch) ? 0.556 : /[A-Z]/.test(ch) ? 0.722 : 0.6), 0) * size;
  const h = 0.718 * size;
  const a = (-turns * Math.PI) / 2; // PDF: góc dương là ngược chiều kim đồng hồ
  const cos = Math.round(Math.cos(a));
  const sin = Math.round(Math.sin(a));
  const x = cx - (cos * w) / 2 + (sin * h) / 2;
  const y = cy - (sin * w) / 2 - (cos * h) / 2;
  return `BT /F1 ${n(size)} Tf ${cos} ${sin} ${-sin} ${cos} ${n(x)} ${n(y)} Tm (${s}) Tj ET\n`;
}

/** Một thẻ trong vùng (0, oy, PAGE_W, H). `img` = tên XObject ảnh tên học sinh (nếu có). */
function frontCard(card: number, oy: number, H: number, big: boolean, img?: { id: string; w: number; h: number }): string {
  const code = CARD_CODES[card - 1];
  const mark = (big ? 150 : 96) * MM; // cạnh ô mã đen
  const letter = big ? 56 : 40;
  const cx = PAGE_W / 2;
  const cy = oy + H / 2;
  const cell = mark / 6;
  const x0 = cx - mark / 2;
  const yTop = cy + mark / 2;
  let s = `0 g ${n(x0)} ${n(cy - mark / 2)} ${n(mark)} ${n(mark)} re f\n1 g\n`;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (!cardBit(code, r, c)) s += `${n(x0 + (c + 1) * cell)} ${n(yTop - (r + 2) * cell)} ${n(cell)} ${n(cell)} re f\n`;
  s += '0 g\n';
  const d = mark / 2 + 9 * MM + letter * 0.36; // tâm chữ cách mép ô mã 9 mm (vùng trắng bắt buộc quanh mã)
  s += text('A', letter, cx, cy + d, 0) + text('B', letter, cx + d, cy, 1) + text('C', letter, cx, cy - d, 2) + text('D', letter, cx - d, cy, 3);
  // Số thẻ ở hai góc đối nhau, đọc được dù cầm xuôi hay ngược
  const kx = PAGE_W / 2 - 15 * MM;
  const ky = H / 2 - 11 * MM;
  const tag = `#${card}`;
  s += text(tag, 22, cx - kx, cy + ky, 0) + text(tag, 22, cx + kx, cy - ky, 2);
  if (img) {
    // Tên học sinh ở hai góc còn lại (cao 7 mm)
    const ih = 7 * MM;
    const iw = Math.min((img.w / img.h) * ih, 60 * MM);
    s += `q ${n(iw)} 0 0 ${n(ih)} ${n(cx + kx + 5 * MM - iw)} ${n(cy + ky - ih / 2)} cm /${img.id} Do Q\n`;
    s += `q ${n(-iw)} 0 0 ${n(-ih)} ${n(cx - kx - 5 * MM + iw)} ${n(cy - ky + ih / 2)} cm /${img.id} Do Q\n`;
  }
  s += '0.45 g\n' + text('Quickplay', 8, cx - kx + 10, cy + ky - 22, 0) + '0 g\n';
  return s;
}

function backCard(oy: number, H: number): string {
  const cx = PAGE_W / 2;
  const cy = oy + H / 2;
  const dy = H / 2 - 24 * MM;
  const dx = PAGE_W / 2 - 26 * MM;
  // Nhìn từ phía sau: cạnh phải của mặt trước (B) nằm bên trái
  let s = '0 g\n' + text('A', 96, cx, cy + dy, 0) + text('D', 96, cx + dx, cy, 1) + text('C', 96, cx, cy - dy, 2) + text('B', 96, cx - dx, cy, 3);
  s += '0.45 g\n' + text('Quickplay', 16, cx, cy, 0) + '0 g\n';
  return s;
}

const CUT = `q 0.6 G 0.5 w [6 5] 0 d ${n(10 * MM)} ${n(PAGE_H / 2)} m ${n(PAGE_W - 10 * MM)} ${n(PAGE_H / 2)} l S Q\n`;

function buildPdf(pages: string[], images: { id: string; img: NameImage }[] = []): Blob {
  const objs: string[] = [];
  const first = 4 + images.length; // đối tượng trang đầu tiên
  const kids = pages.map((_, i) => `${first + i * 2} 0 R`).join(' ');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  images.forEach(({ img }) =>
    objs.push(
      `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ImageMask true /BitsPerComponent 1 /Decode [1 0] /Filter /ASCIIHexDecode /Length ${img.hex.length + 1} >>\nstream\n${img.hex}>\nendstream`,
    ),
  );
  const xobj = images.length ? ` /XObject << ${images.map((x, i) => `/${x.id} ${4 + i} 0 R`).join(' ')} >>` : '';
  pages.forEach((content, i) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(PAGE_W)} ${n(PAGE_H)}] /Resources << /Font << /F1 3 0 R >>${xobj} >> /Contents ${first + 1 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([out], { type: 'application/pdf' }); // toàn ký tự ASCII nên độ dài chuỗi = số byte
}

/** PDF mặt trước của bộ thẻ. */
export function cardsPdf(opt: CardsPdfOptions = {}): Blob {
  const a = Math.max(1, Math.min(CARD_COUNT, Math.floor(opt.from ?? 1)));
  const b = Math.max(a, Math.min(CARD_COUNT, Math.floor(opt.to ?? CARD_COUNT)));
  const per = opt.perPage === 1 ? 1 : 2;
  const images: { id: string; img: NameImage }[] = [];
  const imgOf = (card: number) => {
    const img = opt.nameImage?.(card);
    if (!img) return undefined;
    const id = `N${card}`;
    images.push({ id, img });
    return { id, w: img.w, h: img.h };
  };
  const pages: string[] = [];
  if (per === 1) for (let c = a; c <= b; c++) pages.push(frontCard(c, 0, PAGE_H, true, imgOf(c)));
  else
    for (let c = a; c <= b; c += 2)
      pages.push(frontCard(c, PAGE_H / 2, PAGE_H / 2, false, imgOf(c)) + (c + 1 <= b ? frontCard(c + 1, 0, PAGE_H / 2, false, imgOf(c + 1)) : '') + CUT);
  return buildPdf(pages, images);
}

/** PDF mặt sau (một trang, dùng chung cho mọi tờ): chữ A, B, C, D thật to. */
export const cardsBackPdf = (perPage: 1 | 2 = 2): Blob =>
  buildPdf([perPage === 1 ? backCard(0, PAGE_H) : backCard(PAGE_H / 2, PAGE_H / 2) + backCard(0, PAGE_H / 2) + CUT]);
