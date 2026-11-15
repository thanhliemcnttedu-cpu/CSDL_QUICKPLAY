import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/util';
import { Spinner } from '../components/ui';

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
  useEffect(() => {
    api.listSessions().then(setRows).catch((e) => {
      setErr((e as Error).message);
      setRows([]);
    });
  }, []);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <h1 style={{ margin: 0 }}>Báo cáo các phiên</h1>
      {err && <div className="alert error">{err}</div>}
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="card empty"><BarChart3 size={48} color="var(--primary)" /><h2>Chưa có phiên nào</h2><p className="muted">Tổ chức một bộ đề để xem báo cáo ở đây.</p></div>
      ) : (
        <div className="card table-wrap">
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
                    <td><Link className="btn sm" to={r.mode === 'paper' ? `/teacher/paper/${r.pin}` : `/teacher/host/${r.pin}`}><ExternalLink size={16} /> {r.state === 'COMPLETED' ? 'Xem báo cáo' : 'Mở bảng điều khiển'}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
