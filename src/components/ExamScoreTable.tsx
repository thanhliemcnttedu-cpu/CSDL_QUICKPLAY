// Bảng điểm bài kiểm tra trên màn giáo viên: cùng cột và cùng cách tính với tệp Excel "Bảng điểm".
import { useMemo } from 'react';
import { Download } from 'lucide-react';
import type { Quiz, Session } from '../lib/types';
import { EXAM_STATUS, LEVEL_LABEL, analyticsSheets, analyze, examRows } from '../lib/analytics';
import { buildXlsx, downloadBlob } from '../lib/xlsx';
import '../report.css';

const STATUS_BADGE = { submitted: 'green', doing: 'blue', locked: 'red', collected: 'amber', absent: '' } as const;
const safe = (t: string) => t.replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 60);

export function examFileName(s: Session) {
  return `Bang-diem-lop-${safe(s.exam?.class_name ?? '')}-${safe(s.quiz_title)}.xlsx`;
}

export function ExamScoreTable({ s, quiz, onKick }: { s: Session; quiz: Quiz | null; onKick?: (playerId: string, name: string) => void }) {
  const a = useMemo(() => analyze(s, quiz), [s, quiz]);
  const rows = useMemo(() => examRows(s, a), [s, a]);
  const exportXlsx = async () => downloadBlob(examFileName(s), await buildXlsx(analyticsSheets(s, a)));
  const graded = rows.filter((r) => r.level);
  return (
    <div className="card rp" style={{ color: 'var(--fg)' }}>
      <div className="row between rp-tools" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>
          Bảng điểm lớp {s.exam?.class_name}
          <small className="muted" style={{ fontWeight: 500 }}> · {graded.length} em đã nộp / {rows.length} em</small>
        </h3>
        <button className="btn primary" onClick={exportXlsx}><Download size={18} /> Xuất bảng điểm Excel</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Hạng</th><th>Họ và tên</th><th>Lớp</th><th>Mã số HS</th><th>Trạng thái</th><th>Điểm/10</th><th>Đúng</th><th>Sai</th><th>Bỏ trống</th><th>Mức đánh giá</th>{onKick && <th />}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.player_id ?? 'a-' + r.student_code}>
                <td>{r.rank ?? '—'}</td>
                <td><b>{r.name}</b></td>
                <td>{r.class_name || '—'}</td>
                <td><code>{r.student_code || '—'}</code></td>
                <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{EXAM_STATUS[r.status]}</span></td>
                <td><b>{r.mark10 === null ? '—' : r.mark10.toLocaleString('vi-VN')}</b></td>
                <td>{r.correct === null ? '—' : `${r.correct}/${r.total}`}</td>
                <td>{r.wrong ?? '—'}</td>
                <td>{r.blank ?? '—'}</td>
                <td>{r.level ? <span className={`rp-grade ${r.level}`}>{LEVEL_LABEL[r.level]}</span> : <span className="muted">—</span>}</td>
                {onKick && <td>{r.player_id && r.status !== 'submitted' && <button className="btn sm ghost" onClick={() => onKick(r.player_id!, r.name)}>Mời ra</button>}</td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={11} className="muted">Chưa có học sinh nào.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="help" style={{ margin: '8px 0 0' }}>
        Điểm và mức đánh giá hiện khi em nộp bài hoặc khi hết giờ thu bài. Hoàn thành xuất sắc từ 9 điểm · Hoàn thành tốt từ 7 · Đạt yêu cầu từ 5 · Chưa đạt yêu cầu dưới 5. Số câu sai gồm cả câu chỉ đúng một phần.
      </p>
    </div>
  );
}
