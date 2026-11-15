import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ExternalLink, Square, Trash2 } from 'lucide-react';
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
type Row = Awaited<ReturnType<typeof api.listSessions>>[number];
const idOf = (r: Row) => r.session_id || r.pin + ':' + r.created_at;

export default function Reports() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [ending, setEnding] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const load = () =>
    api.listSessions().then((r) => {
      setRows(r);
      // bỏ dấu chọn của những phiên không còn trong danh sách
      setPicked((p) => new Set(r.map(idOf).filter((id) => p.has(id))));
    }).catch((e) => {
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

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = !!rows?.length && picked.size === rows.length;
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set((rows ?? []).map(idOf)));

  // Xóa báo cáo đã chọn, hoặc toàn bộ. Trên Google Drive tệp vào Thùng rác (khôi phục được trong 30 ngày).
  const remove = async (all: boolean) => {
    if (!rows) return;
    const targets = all ? rows : rows.filter((r) => picked.has(idOf(r)));
    if (!targets.length) return;
    const running = targets.filter((r) => live(r.state)).length;
    const text = (all
      ? `Xóa TOÀN BỘ ${targets.length} báo cáo?`
      : targets.length === 1 ? `Xóa báo cáo phiên ${targets[0].pin} (${targets[0].quiz_title})?` : `Xóa ${targets.length} báo cáo đã chọn?`)
      + '\n\nKết quả làm bài của học sinh trong các phiên này sẽ không còn trong phần mềm. Bộ câu hỏi, lớp và học sinh giữ nguyên.'
      + (running ? `\n\nLưu ý: có ${running} phiên chưa kết thúc; xóa thì học sinh đang ở trong phòng sẽ bị ngắt.` : '')
      + '\n\nNếu lưu trên Google Drive, tệp được chuyển vào Thùng rác của Drive và còn khôi phục được trong 30 ngày.';
    if (!(await askConfirm(text, { okLabel: all ? 'Xóa toàn bộ' : 'Xóa' }))) return;
    setDeleting(true);
    try {
      const r = await api.deleteSessions(all ? [] : targets.map((t) => t.session_id).filter(Boolean), all);
      toast(`Đã xóa ${r.removed} báo cáo${r.audio ? ` và ${r.audio} bản ghi âm` : ''}.`, 'ok');
      setPicked(new Set());
      await load();
    } catch (e) {
      const m = (e as Error).message;
      toast(/không hợp lệ|Hành động/.test(m) ? 'Apps Script của thầy cô đang chạy bản cũ, chưa có chức năng xóa báo cáo. Vào Cài đặt → Xem 5 bước cập nhật, làm xong rồi xóa lại.' : m, 'error');
    }
    setDeleting(false);
  };

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
        <div className="rep-bar">
          <label className="rep-check"><input type="checkbox" checked={allPicked} onChange={toggleAll} /> Chọn tất cả</label>
          <span className="muted grow" role="status">{picked.size ? `Đã chọn ${picked.size}/${rows.length} báo cáo` : `${rows.length} báo cáo`}</span>
          <button className="btn danger" onClick={() => remove(false)} disabled={deleting || !picked.size}><Trash2 size={18} /> {deleting ? 'Đang xóa…' : `Xóa đã chọn${picked.size ? ` (${picked.size})` : ''}`}</button>
          <button className="btn ghost" onClick={() => remove(true)} disabled={deleting}><Trash2 size={18} /> Xóa toàn bộ</button>
        </div>
        {/* Điện thoại: mỗi buổi một thẻ, nút xem báo cáo luôn nhìn thấy (bảng nhiều cột thì nút bị đẩy ra ngoài màn hình) */}
        <div className="rep-cards">
          {rows.map((r) => {
            const [label, tone] = STATE_LABEL[r.state] ?? [r.state, ''];
            const id = idOf(r);
            return (
              <div key={id} className={`card rep-card ${picked.has(id) ? 'sel' : ''}`}>
                <div className="row between" style={{ flexWrap: 'nowrap' }}>
                  <label className="rep-check"><input type="checkbox" checked={picked.has(id)} onChange={() => toggle(id)} aria-label={`Chọn báo cáo phiên ${r.pin}`} /> <b>{r.quiz_title}</b></label>
                  <span className={`badge ${tone}`}>{label}</span>
                </div>
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
            <thead><tr><th><input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Chọn tất cả báo cáo" /></th><th>Mã PIN</th><th>Bộ đề</th><th>Chế độ</th><th>Trạng thái</th><th>Học sinh</th><th>Ngày tạo</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const [label, tone] = STATE_LABEL[r.state] ?? [r.state, ''];
                const id = idOf(r);
                return (
                  <tr key={id} className={picked.has(id) ? 'sel' : ''}>
                    <td><input type="checkbox" checked={picked.has(id)} onChange={() => toggle(id)} aria-label={`Chọn báo cáo phiên ${r.pin}`} /></td>
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
