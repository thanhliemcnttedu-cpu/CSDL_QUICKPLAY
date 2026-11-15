// Dải nhỏ ở trang chủ để giáo viên gửi lối vào cho học sinh: mã QR tới trang học sinh, chép link, tải mã QR.
// Cố ý làm gọn: trên điện thoại chỉ là hai nút nhỏ và một nút mở mã QR.
import { useEffect, useState } from 'react';
import { Check, Copy, Download, QrCode } from 'lucide-react';
import { Modal, useToast } from './ui';
import { downloadBlob } from '../lib/xlsx';

/** Link trang học sinh. Bản cài .exe (file://) dùng địa chỉ web công khai đặt khi build. */
export function joinLink(): string {
  const base = location.protocol.startsWith('http') ? location.origin : ((import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? '').replace(/\/+$/, '');
  return base ? `${base}/#/join` : '';
}

async function qrDataUrl(text: string, size: number): Promise<string> {
  const QR = (await import('qrcode')).default; // chỉ tải thư viện mã QR khi cần
  return QR.toDataURL(text, { width: size, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0a1730', light: '#ffffff' } });
}

/** Ảnh PNG để gửi vào nhóm lớp: tên phần mềm, mã QR lớn và link gõ tay. */
async function qrPoster(link: string): Promise<Blob> {
  const W = 900, H = 1140;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1668f2';
  g.fillRect(0, 0, W, 150);
  await document.fonts.load("800 60px 'Be Vietnam Pro'").catch(() => {});
  const font = (w: number, s: number) => `${w} ${s}px 'Be Vietnam Pro', system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = font(800, 62);
  g.fillText('Quickplay', W / 2, 98);
  g.fillStyle = '#0a1730';
  g.font = font(800, 44);
  g.fillText('Quét mã để vào phòng chơi', W / 2, 232);
  const img = new Image();
  img.src = await qrDataUrl(link, 700);
  await img.decode();
  g.drawImage(img, (W - 700) / 2, 262, 700, 700);
  g.font = font(600, 30);
  g.fillStyle = '#44546f';
  g.fillText('Hoặc mở trình duyệt và gõ địa chỉ:', W / 2, 1014);
  g.font = font(800, 34);
  g.fillStyle = '#0b4fd0';
  g.fillText(link.replace(/^https?:\/\//, ''), W / 2, 1064);
  g.font = font(500, 24);
  g.fillStyle = '#6b7a93';
  g.fillText('Sau đó nhập mã PIN thầy cô giao, tên và lớp của em.', W / 2, 1110);
  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh mã QR.'))), 'image/png'));
}

export function JoinShare() {
  const toast = useToast();
  const link = joinLink();
  const [qr, setQr] = useState('');
  const [big, setBig] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (link) qrDataUrl(link, 320).then(setQr).catch(() => {});
  }, [link]);
  if (!link) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) return toast(`Trình duyệt không cho sao chép. Link là: ${link}`, 'error');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('Đã chép link vào phòng chơi. Dán vào nhóm lớp để gửi cho học sinh.', 'ok');
  };
  const download = async () => {
    try {
      downloadBlob('quickplay-ma-qr-vao-phong.png', await qrPoster(link));
      toast('Đã tải ảnh mã QR. Gửi ảnh này vào nhóm lớp để học sinh quét.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="join-share">
      <button type="button" className="js-qr" onClick={() => setBig(true)} aria-label="Phóng to mã QR vào phòng chơi" title="Bấm để phóng to mã QR">
        {qr ? <img src={qr} alt="" width={72} height={72} /> : <QrCode size={28} />}
      </button>
      <div className="js-text">
        <b>Gửi lối vào cho học sinh</b>
        <span className="js-actions">
          <button type="button" className="js-chip" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} Chép link</button>
          <button type="button" className="js-chip" onClick={download}><Download size={14} /> Tải mã QR</button>
          <button type="button" className="js-chip js-only-phone" onClick={() => setBig(true)}><QrCode size={14} /> Xem mã QR</button>
        </span>
      </div>
      {big && (
        <Modal title="Mã QR vào phòng chơi" onClose={() => setBig(false)} footer={<button className="btn primary" onClick={download}><Download size={18} /> Tải mã QR về máy</button>}>
          <div className="stack center" style={{ alignItems: 'center' }}>
            {qr && <img src={qr} alt="Mã QR mở trang học sinh vào phòng chơi" style={{ width: 'min(320px, 70vw)', height: 'auto', borderRadius: 16, border: '1.5px solid var(--border)' }} />}
            <p style={{ margin: 0, overflowWrap: 'anywhere' }}>Học sinh quét mã này bằng camera điện thoại, hoặc mở <b>{link.replace(/^https?:\/\//, '')}</b>, rồi nhập mã PIN thầy cô giao.</p>
            <button type="button" className="btn sm" onClick={copy}><Copy size={16} /> Chép link</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
