// Điện thoại của giáo viên (đã đăng nhập cùng tài khoản với máy tính): ba cách vào điều khiển buổi học thẻ giấy
//  1. Tự phát hiện buổi đang chạy → nút "Điều khiển trên điện thoại này".
//  2. Nhập mã PIN 6 số hiện trên màn chiếu.
//  3. Quét mã QR trên màn chiếu ngay trong trang (trình duyệt có sẵn bộ đọc mã: Chrome trên Android).
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, ScanLine, X } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './ui';
import '../paper.css';

type Row = Awaited<ReturnType<typeof api.listSessions>>[number];
const FRESH_MS = 12 * 60 * 60 * 1000; // chỉ báo buổi mở trong 12 giờ gần đây
const isPhone = () => window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
const makeDetector = (): Detector | null => {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  try { return BD ? new BD({ formats: ['qr_code'] }) : null; } catch { return null; }
};

/** Lấy mã phòng và khóa quét từ nội dung mã QR của màn chiếu (…/quet?pin=…&k=… hoặc …/#/scan?pin=…&k=…). */
export function parseScanLink(text: string): { pin: string; key: string } | null {
  const m = text.match(/[?&]pin=(\d{6})\b/);
  const k = text.match(/[?&]k=([^&#\s]+)/);
  return m && k ? { pin: m[1], key: decodeURIComponent(k[1]) } : null;
}

export function PaperLiveNotice() {
  const nav = useNavigate();
  const toast = useToast();
  const [phone] = useState(isPhone);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');
  const [pin, setPin] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const canQr = useRef(!!makeDetector()).current;

  useEffect(() => {
    if (!phone) return; // máy tính là màn chiếu, không cần báo
    let stop = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const all = await api.listSessions();
        if (!stop) setRows(all.filter((r) => r.mode === 'paper' && r.state === 'IN_PROGRESS' && Date.now() - r.created_at < FRESH_MS));
      } catch { /* mất mạng: thử lại ở nhịp sau */ }
    };
    load();
    const id = window.setInterval(load, 8000);
    document.addEventListener('visibilitychange', load);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', load);
    };
  }, [phone]);

  const open = async (p: string) => {
    if (!/^\d{6}$/.test(p)) return toast('Mã PIN gồm 6 chữ số, hiện trên màn chiếu.', 'error');
    setBusy(p);
    try {
      const s = await api.hostState(p);
      if (!s.paper?.scan_key) throw new Error('Buổi học này không dùng thẻ giấy.');
      nav(`/scan?pin=${p}&k=${encodeURIComponent(s.paper.scan_key)}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setBusy('');
  };

  if (!phone) return null;
  return (
    <div className="stack" style={{ gap: 8, marginBottom: 16 }}>
      {rows.map((r) => (
        <div key={r.pin} className="paper-live" role="status">
          <div>
            <b>Buổi học thẻ giấy đang chạy</b>
            <span>{r.quiz_title} · {r.player_count} học sinh · mở lúc {new Date(r.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <button className="btn primary" onClick={() => open(r.pin)} disabled={!!busy}><ScanLine size={18} /> {busy === r.pin ? 'Đang mở…' : 'Điều khiển trên điện thoại này'}</button>
        </div>
      ))}
      <form className="paper-join" onSubmit={(e) => { e.preventDefault(); open(pin); }}>
        <b>Điều khiển buổi học thẻ giấy</b>
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <input className="input" inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="Mã PIN 6 số trên màn chiếu" aria-label="Mã PIN của buổi học" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} style={{ minWidth: 0 }} />
          <button className="btn primary" disabled={pin.length !== 6 || !!busy}>Vào</button>
        </div>
        {canQr && <button type="button" className="btn ghost" onClick={() => setQrOpen(true)}><QrCode size={18} /> Quét mã QR trên màn chiếu</button>}
      </form>
      {qrOpen && <QrDialog onClose={() => setQrOpen(false)} onFound={(l) => { setQrOpen(false); nav(`/scan?pin=${l.pin}&k=${encodeURIComponent(l.key)}`); }} />}
    </div>
  );
}

/** Khung quét mã QR: hình camera vẽ vào khung trong trang (ô video ẩn), đọc bằng bộ đọc mã của trình duyệt. */
function QrDialog({ onClose, onFound }: { onClose: () => void; onFound: (l: { pin: string; key: string }) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const det = makeDetector();
    const v = document.createElement('video');
    v.setAttribute('playsinline', '');
    v.muted = true;
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1';
    document.body.appendChild(v);
    let stream: MediaStream | null = null;
    let raf = 0, last = 0, done = false, working = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (done) return stream.getTracks().forEach((t) => t.stop());
        v.srcObject = stream;
        await v.play();
      } catch {
        setErr('Không mở được camera. Hãy cho phép trang này dùng camera, hoặc nhập mã PIN 6 số trên màn chiếu.');
      }
    })();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const c = canvas.current;
      if (!c || !v.videoWidth) return;
      if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
      c.getContext('2d')!.drawImage(v, 0, 0);
      if (!det || working || t - last < 200) return;
      last = t;
      working = true;
      det.detect(c).then((codes) => {
        for (const code of codes) {
          const link = parseScanLink(code.rawValue);
          if (link && !done) { done = true; onFound(link); return; }
        }
        if (codes.length && !done) setErr('Mã này không phải mã QR điều khiển của Quickplay. Hãy quét mã trên màn chiếu.');
      }).catch(() => {}).finally(() => { working = false; });
    };
    raf = requestAnimationFrame(loop);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      v.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal stack" role="dialog" aria-label="Quét mã QR trên màn chiếu" style={{ maxWidth: 420 }}>
        <div className="row between">
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Quét mã QR trên màn chiếu</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        </div>
        <div className="qr-cam"><canvas ref={canvas} /></div>
        {err ? <div className="alert warn" role="alert"><div>{err}</div></div> : <p className="muted small" style={{ margin: 0 }}>Đưa mã QR trên màn chiếu vào giữa khung. Đọc được là vào thẳng máy quét thẻ.</p>}
      </div>
    </div>
  );
}
