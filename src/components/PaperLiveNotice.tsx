// Điện thoại của giáo viên (đã đăng nhập cùng tài khoản với máy tính): tự phát hiện buổi học thẻ giấy đang chạy
// và hiện nút "Điều khiển trên điện thoại này" → mở thẳng máy quét, không cần quét mã QR hay vào Báo cáo tìm phiên.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './ui';
import '../paper.css';

type Row = Awaited<ReturnType<typeof api.listSessions>>[number];
const FRESH_MS = 12 * 60 * 60 * 1000; // chỉ báo buổi mở trong 12 giờ gần đây
const isPhone = () => window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;

export function PaperLiveNotice() {
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!isPhone()) return; // máy tính là màn chiếu, không cần báo
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
  }, []);

  const open = async (pin: string) => {
    setBusy(pin);
    try {
      const s = await api.hostState(pin);
      if (!s.paper?.scan_key) throw new Error('Buổi học này không dùng thẻ giấy.');
      nav(`/scan?pin=${pin}&k=${encodeURIComponent(s.paper.scan_key)}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setBusy('');
  };

  if (!rows.length) return null;
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
    </div>
  );
}
