// Mục "Đề thi" của thư viện: kho đề xếp theo Khối lớp › Môn › Thời điểm kiểm tra.
// Mỗi nhóm (VD Tin học lớp 3 – Cuối học kì I) có nhiều đề (mã đề khác nhau); giáo viên tích chọn đề rồi Tổ chức thi:
// bốc ngẫu nhiên 1 đề, 2 đề hoặc dùng tất cả đề đã chọn, học sinh được chia đều cho các đề.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckSquare, ClipboardList, Eye, FileStack, Pencil, Play, Plus, Square } from 'lucide-react';
import type { ExamPeriod, QuizSummary } from '../lib/types';
import { PERIODS, PERIOD_LABEL, groupPapers, type PaperGroup } from '../lib/examPaper';
import { formatDate } from '../lib/util';

export function ExamPapers({ items, filter, onCreate, onHost }: {
  items: QuizSummary[];
  filter: string;
  onCreate: (preset: { grade?: string; subject?: string; period?: ExamPeriod }) => void;
  onHost: (papers: QuizSummary[]) => void;
}) {
  const [grade, setGrade] = useState('');
  const [period, setPeriod] = useState<ExamPeriod | ''>('');
  const needle = filter.trim().toLocaleLowerCase('vi');
  const groups = useMemo(() => groupPapers(items), [items]);
  const grades = [...new Set(groups.map((g) => g.grade))];
  const shown = groups
    .filter((g) => (!grade || g.grade === grade) && (!period || g.period === period))
    .map((g) => ({ ...g, papers: g.papers.filter((q) => !needle || `${q.title} ${q.paper_code ?? ''} ${g.subject}`.toLocaleLowerCase('vi').includes(needle)) }))
    .filter((g) => g.papers.length);
  const total = groups.reduce((t, g) => t + g.papers.length, 0);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card paper-intro">
        <ClipboardList size={28} color="var(--primary)" />
        <div className="grow stack" style={{ gap: 4 }}>
          <b>Kho đề thi: {total} đề trong {groups.length} kì kiểm tra</b>
          <span className="small muted">
            Mỗi đề có Khối lớp, Môn, Thời điểm kiểm tra và Mã đề. Tích chọn các đề của một kì rồi bấm <b>Tổ chức thi</b>: phần mềm bốc ngẫu nhiên 1 hoặc 2 đề (hoặc dùng tất cả đề đã chọn) và chia đều học sinh cho các đề.
          </span>
        </div>
        <button className="btn primary" onClick={() => onCreate({})}><Plus size={18} /> Tạo đề thi từ ngân hàng câu hỏi</button>
      </div>
      {groups.length > 0 && (
        <div className="row" style={{ gap: 8 }}>
          <select className="input" style={{ maxWidth: 200 }} value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Lọc theo khối lớp">
            <option value="">Tất cả khối lớp</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 260 }} value={period} onChange={(e) => setPeriod(e.target.value as ExamPeriod | '')} aria-label="Lọc theo thời điểm kiểm tra">
            <option value="">Mọi thời điểm kiểm tra</option>
            {PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
          </select>
        </div>
      )}
      {!groups.length && (
        <div className="card center stack" style={{ alignItems: 'center', padding: 28 }}>
          <FileStack size={40} color="var(--primary)" />
          <h3 style={{ margin: 0 }}>Chưa có đề thi nào</h3>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
            Bấm <b>Tạo đề thi từ ngân hàng câu hỏi</b>, tích chọn câu hỏi từ các bộ đề có sẵn, chọn Khối lớp, Môn, Thời điểm kiểm tra và Mã đề.
            Bộ đề đang có cũng chuyển thành đề thi được: mở bộ đề, phần <b>Đề thi</b> chọn thời điểm và mã đề.
          </p>
        </div>
      )}
      {shown.map((g) => <Group key={g.key} g={g} onCreate={onCreate} onHost={onHost} />)}
      {groups.length > 0 && !shown.length && <p className="muted">Không có đề thi nào khớp bộ lọc.</p>}
    </div>
  );
}

function Group({ g, onCreate, onHost }: { g: PaperGroup; onCreate: (p: { grade?: string; subject?: string; period?: ExamPeriod }) => void; onHost: (papers: QuizSummary[]) => void }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(g.papers.map((q) => q.id)));
  const picked = g.papers.filter((q) => sel.has(q.id));
  const counts = [...new Set(picked.map((q) => q.question_count))];
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const all = picked.length === g.papers.length;
  return (
    <section className="card paper-group">
      <header className="row between" style={{ gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>{g.subject} · {g.grade}</h3>
          <span className="badge amber">{PERIOD_LABEL[g.period]}</span> <span className="small muted">{g.papers.length} đề</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => onCreate({ grade: g.grade, subject: g.subject, period: g.period })}><Plus size={16} /> Thêm đề</button>
          <button className="btn sm success" disabled={!picked.length || counts.length > 1} onClick={() => onHost(picked)}><Play size={16} /> Tổ chức thi ({picked.length} đề)</button>
        </div>
      </header>
      <ul className="paper-list">
        <li className="paper-row head">
          <button type="button" className="qb-check" onClick={() => setSel(all ? new Set() : new Set(g.papers.map((q) => q.id)))} aria-label={all ? 'Bỏ chọn tất cả đề' : 'Chọn tất cả đề'}>
            {all ? <CheckSquare size={20} /> : <Square size={20} />}
          </button>
          <span className="small muted">Chọn đề để tổ chức thi</span>
        </li>
        {g.papers.map((q) => (
          <li key={q.id} className={`paper-row ${sel.has(q.id) ? 'on' : ''}`}>
            <button type="button" className="qb-check" onClick={() => toggle(q.id)} aria-pressed={sel.has(q.id)} aria-label={`Chọn đề ${q.paper_code ?? q.title}`}>
              {sel.has(q.id) ? <CheckSquare size={20} /> : <Square size={20} />}
            </button>
            <span className="paper-code">{q.paper_code || '—'}</span>
            <span className="grow paper-name"><b>{q.title}</b><small>{q.question_count} câu · cập nhật {formatDate(q.updated_at)}</small></span>
            <Link className="btn icon sm ghost" to={`/teacher/preview/${q.id}`} title="Làm thử như học sinh" aria-label={`Làm thử đề ${q.paper_code ?? q.title}`}><Eye size={16} /></Link>
            <Link className="btn icon sm ghost" to={`/teacher/edit/${q.id}`} title="Sửa đề" aria-label={`Sửa đề ${q.paper_code ?? q.title}`}><Pencil size={16} /></Link>
          </li>
        ))}
      </ul>
      {counts.length > 1 && (
        <div className="alert warn" role="status"><div><AlertTriangle size={16} /> Các đề đã chọn có số câu khác nhau ({counts.sort((a, b) => a - b).join(', ')} câu). Để chấm điểm công bằng, các đề thi cùng kì cần cùng số câu: sửa lại đề hoặc chỉ chọn các đề cùng số câu.</div></div>
      )}
    </section>
  );
}
