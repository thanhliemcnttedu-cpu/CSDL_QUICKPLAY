// Ảnh mã QR để gửi học sinh / phụ huynh (Zalo, email, in dán bảng): QR lớn kèm tên bài, mã tham gia, hạn nộp và địa chỉ vào.
import QRCode from 'qrcode';

export interface QrCardInfo {
  link: string;
  pin: string;
  title: string;
  /** Dòng nhỏ dưới tên bài, ví dụ "Bài tập về nhà" */
  kind: string;
  /** Ví dụ "Hạn nộp: 23:46 17/11/2026" */
  note?: string;
}

/** Tên tệp ảnh: ma-qr-553721.png */
export const qrFileName = (pin: string) => `ma-qr-${pin.replace(/\D/g, '') || 'quickplay'}.png`;

/** Địa chỉ ngắn để gõ tay: quickplay-delta.vercel.app/join (link đầy đủ có mã phòng và máy chủ, quá dài để in). */
export function shortJoin(link: string): string {
  try { return `${new URL(link).host}/join`; } catch { return link.replace(/^https?:\/\//, ''); }
}

/** Cắt dòng chữ cho vừa chiều rộng (thêm "…"). */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

export async function qrCardBlob(info: QrCardInfo): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const W = 900, QR = 640, PAD = 60;
  const font = "'Be Vietnam Pro', system-ui, sans-serif";
  const qrImg = new Image();
  qrImg.src = await QRCode.toDataURL(info.link, { margin: 1, width: QR, errorCorrectionLevel: 'M' });
  await qrImg.decode();

  const H = 1300;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#eef5ff'; ctx.fillRect(0, 0, W, H);
  // thẻ trắng bo góc
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.roundRect(30, 30, W - 60, H - 60, 40); ctx.fill();
  ctx.strokeStyle = '#cfe0fb'; ctx.lineWidth = 3; ctx.stroke();

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1262f0'; ctx.font = `800 34px ${font}`;
  ctx.fillText(fit(ctx, info.kind, W - PAD * 2), W / 2, 112);
  ctx.fillStyle = '#0a1730'; ctx.font = `800 44px ${font}`;
  ctx.fillText(fit(ctx, info.title, W - PAD * 2), W / 2, 172);

  ctx.drawImage(qrImg, (W - QR) / 2, 210, QR, QR);

  ctx.fillStyle = '#334155'; ctx.font = `600 30px ${font}`;
  ctx.fillText('Quét mã QR hoặc vào trang và nhập mã:', W / 2, 912);
  ctx.fillStyle = '#0b4fd0'; ctx.font = `900 120px ${font}`;
  ctx.fillText(`${info.pin.slice(0, 3)} ${info.pin.slice(3)}`, W / 2, 1040);
  ctx.fillStyle = '#0a1730'; ctx.font = `700 30px ${font}`;
  ctx.fillText(fit(ctx, `Trang vào: ${shortJoin(info.link)}`, W - PAD * 2), W / 2, 1100);
  if (info.note) {
    ctx.fillStyle = '#b45309'; ctx.font = `700 30px ${font}`;
    ctx.fillText(fit(ctx, info.note, W - PAD * 2), W / 2, 1160);
  }
  ctx.fillStyle = '#64748b'; ctx.font = `500 22px ${font}`;
  ctx.fillText('Quickplay', W / 2, 1220);

  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('Không tạo được ảnh mã QR.'))), 'image/png'));
}

/** Tải ảnh mã QR về máy. */
export async function downloadQrCard(info: QrCardInfo): Promise<void> {
  const blob = await qrCardBlob(info);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = qrFileName(info.pin);
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Thư gửi học sinh / phụ huynh (mở chương trình email của máy, thầy cô tự chọn người nhận rồi bấm Gửi). */
export function homeworkMailto(info: QrCardInfo): string {
  const subject = `Bài tập về nhà: ${info.title}`;
  const body = [
    'Chào các em,',
    '',
    `Thầy/Cô giao bài tập về nhà "${info.title}".`,
    `Bấm vào link để làm bài: ${info.link}`,
    `Hoặc vào trang Quickplay và nhập mã: ${info.pin}`,
    info.note ?? '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
