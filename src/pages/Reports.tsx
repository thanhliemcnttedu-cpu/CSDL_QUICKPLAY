import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ExternalLink, Square } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/util';
import { Spinner, askConfirm, useToast } from '../components/ui';

const STATE_LABEL: Record<string, [string, string]> = {
  LOBBY_WAITING: ['Phòng chờ', 'blue'],
  IN_PROGRESS: ['Đang diễn ra', 'green'],
  PAUSED: ['Tạm dừng', 'amber'],
  COMPLETED: ['Đã kết thúc', ''],
};
const MODE_LABEL: Record<string, string> = { classic_live: 'Trực tiếp tự do', instructor_paced: 'GV điều khiển', homework: 'Bài về nhà', paper: 'Thẻ trả lời (giấy)' };

export default function Reports() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.listSessions>> | null>(null);
  const [err, setErr] = useState('');
  const [ending, setEnding] = useState('');
  const toast = useToast();
  const load = () =>
    api.listSessions().then(setRows).catch((e) => {
      setErr((e as Error).message);
      setRows([]);
    });
  useEffect(() => { load(); }, []);
  // Kết thúc nhanh một phiên còn treo "đang diễn ra" ngay tại danh sách, không phải mở bảng điều khiển
  const endSession = async (r: { pin: string; mode: string; quiz_title: string }) => {
    if (!(await askConfirm(`Kết thúc phiên ${r.pin} (${r.quiz_title})? Kết quả đã có vẫn được giữ trong báo cáo.`))) return;
    setEnding(r.pin);
    try {
      if (r.mode === 'paper') {
        const s = await api.hostState(r.pin);
        await api.paperAction(r.pin, s.paper?.scan_key ?? '', 'end');
      } else {
        await api.hostAction(r.pin, 'end');
      }
      toast('Đã kết thúc phiên.', 'ok');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setEnding('');
  };
  const live = (state: string) => state !== 'COMPLETED';
  return (
    <div className="stack" style={{ gap: 18 }}>
      <h1 style={{ margin: 0 }}>Báo cáo các phiên</h1>
      {err && <div className="alert error">{err}</div>}
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="card empty"><BarChart3 size={48} color="var(--primary)" /><h2>Chưa có phiên nào</h2><p className="muted">Tổ chức một bộ đề để xem báo cáo ở đây.</p></div>
      ) : (
        <>
        {/* Điện thoại: mỗi buổi một thẻ, nút xem báo cáo luôn nhìn thấy (bảng nhiều cột thì nút bị đẩy ra ngoài màn hình) */}
        <div className="rep-cards">
          {rows.map((r) => {
            const [label, tone] = STATE_LABEL[r.state] ?? [r.state, ''];
            return (
              <div key={r.pin + r.created_at} className="card rep-card">
                <div className="row between"><b>{r.quiz_title}</b><span className={`badge ${tone}`}>{label}</span></div>
                <span className="muted small">{MODE_LABEL[r.mode] ?? r.mode} · {r.player_count} học sinh · PIN {r.pin} · {formatDate(r.created_at)}</span>
                <div className="row" style={{ gap: 8 }}>
                  <Link className="btn sm primary" to={r.mode === 'paper' ? `/teacher/paper/${r.pin}` : `/teacher/host/${r.pin}`}><ExternalLink size={16} /> {r.state === 'COMPLETED' ? 'Xem báo cáo chi tiết' : 'Mở bảng điều khiển'}</Link>
                  {live(r.state) && <button className="btn sm danger" onClick={() => endSession(r)} disabled={ending === r.pin}><Square size={14} /> {ending === r.pin ? 'Đang kết thúc…' : 'Kết thúc phiên'}</button>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="card table-wrap rep-table">
          <table className="table">
            <thead><tr><th>Mã PIN</th><th>Bộ đề</th><th>Chế độ</th><th>Trạng thái</th><th>Học sinh</th><th>Ngày tạo</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const [label, tone] = STATE_LABEL[r.state] ?? [r.state, ''];
                return (
                  <tr key={r.pin + r.created_at}>
                    <td><b>{r.pin}</b></td>
                    <td>{r.quiz_title}</td>
                    <td>{MODE_LABEL[r.mode] ?? r.mode}</td>
                    <td><span className={`badge ${tone}`}>{label}</span></td>
                    <td>{r.player_count}</td>
                    <td>{formatDate(r.created_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <Link className="btn sm" to={r.mode === 'paper' ? `/teacher/paper/${r.pin}` : `/teacher/host/${r.pin}`}><ExternalLink size={16} /> {r.state === 'COMPLETED' ? 'Xem báo cáo' : 'Mở bảng điều khiển'}</Link>
                        {live(r.state) && <button className="btn sm danger" onClick={() => endSession(r)} disabled={ending === r.pin}><Square size={14} /> {ending === r.pin ? 'Đang kết thúc…' : 'Kết thúc phiên'}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
