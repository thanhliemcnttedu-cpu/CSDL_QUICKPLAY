import { useMemo } from 'react';
import { ShieldAlert, ShieldCheck, Unlock, UserX } from 'lucide-react';
import type { Session } from '../lib/types';
import { VIOLATION_LABELS } from '../lib/anticheat';
import { isInfoKind } from '../lib/sessionLogic';
import { Avatar } from './Avatar';

const time = (ms: number) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Tab giám sát gian lận trực tuyến của giáo viên. */
export function CheatMonitor({ s, onUnlock, onKick, busy, newSince }: {
  s: Session;
  onUnlock: (playerId: string) => void;
  onKick: (playerId: string, name: string) => void;
  busy: boolean;
  newSince: number; // mốc thời gian để tô sáng vi phạm mới
}) {
  const ac = s.settings.anti_cheat;
  const feed = useMemo(() => [...(s.violations ?? [])].reverse(), [s.violations]);
  const offenders = s.players
    .filter((p) => !p.kicked && ((p.violations ?? 0) > 0 || p.locked))
    .sort((a, b) => Number(!!b.locked) - Number(!!a.locked) || (b.violations ?? 0) - (a.violations ?? 0));
  const clean = s.players.filter((p) => !p.kicked && !p.superseded && !(p.violations ?? 0)).length;

  if (!ac?.enabled)
    return (
      <div className="card" style={{ color: 'var(--fg)' }}>
        <h3 className="row" style={{ gap: 8 }}><ShieldCheck size={22} /> Chưa bật chống gian lận</h3>
        <p className="muted" style={{ margin: 0 }}>Phiên này được tạo khi chưa bật "Chế độ thi nghiêm túc". Hãy bật trong hộp thiết lập ở lần tổ chức sau.</p>
      </div>
    );

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', alignItems: 'start' }}>
      <div className="card stack" style={{ color: 'var(--fg)' }}>
        <h3 className="row" style={{ gap: 8, margin: 0 }}><ShieldAlert size={22} color="#dc2626" /> Học sinh có vi phạm</h3>
        <div className="row small">
          <span className="badge red">{offenders.length} học sinh vi phạm</span>
          <span className="badge green">{clean} học sinh nghiêm túc</span>
          <span className="badge">{ac.max_violations ? `Ngưỡng ${ac.max_violations} lần · khóa ở lần ${ac.max_violations + 1}` : 'Chỉ cảnh báo'}</span>
        </div>
        {offenders.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Chưa phát hiện vi phạm nào.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Học sinh</th><th>Số lần</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {offenders.map((p) => (
                  <tr key={p.player_id}>
                    <td><span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><Avatar value={p.avatar} size={28} /> <b>{p.name}</b></span></td>
                    <td><span className="badge red">{p.violations ?? 0}</span></td>
                    <td>{p.locked ? <span className="badge red">Đã khóa bài</span> : <span className="badge amber">Đã cảnh báo</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        {p.locked && (
                          <button className="btn sm success" disabled={busy} onClick={() => onUnlock(p.player_id)}><Unlock size={16} /> Mở khóa</button>
                        )}
                        <button className="btn icon sm danger" disabled={busy} onClick={() => onKick(p.player_id, p.name)} aria-label={`Mời ${p.name} ra`} title="Mời ra khỏi phòng"><UserX size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="stack">
        <h3 style={{ margin: 0 }}>Nhật ký trực tiếp ({feed.length})</h3>
        <div className="vfeed" aria-live="polite">
          {feed.length === 0 && <p className="muted">Nhật ký trống.</p>}
          {feed.map((v, i) => (
            <div key={`${v.at}-${v.player_id}-${i}`} className={`vitem ${isInfoKind(v.kind) ? 'info' : ''} ${v.at > newSince ? 'new' : ''}`}>
              <small className="muted">{time(v.at)}</small>
              <div>
                <b>{v.name}</b> – {VIOLATION_LABELS[v.kind] ?? v.kind}
                {v.q_index !== undefined && v.q_index !== null && <span className="muted small"> · câu {v.q_index + 1}</span>}
                {v.detail && <div className="small muted">{v.detail}</div>}
              </div>
              {!isInfoKind(v.kind) && <ShieldAlert size={18} color="#dc2626" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Bộ lọc Top 5 / 10 / 15 / Tất cả cho bảng xếp hạng. */
export function TopFilter({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="lb-filter" role="radiogroup" aria-label="Số bạn hiển thị">
      {[3, 5, 10, 15, 0].map((n) => (
        <button key={n} role="radio" aria-checked={value === n} className={value === n ? 'on' : ''} onClick={() => onChange(n)}>
          {n ? `Top ${n}` : 'Tất cả'}
        </button>
      ))}
    </div>
  );
}
