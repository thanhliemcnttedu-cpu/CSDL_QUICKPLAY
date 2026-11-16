// Mục "Đề thi" của thư viện: kho đề xếp theo Khối lớp › Môn › Thời điểm kiểm tra.
// Mỗi nhóm (VD Tin học lớp 3 – Cuối học kì I) có nhiều đề (mã đề khác nhau); giáo viên tích chọn đề rồi Tổ chức thi:
// bốc ngẫu nhiên 1 đề, 2 đề hoặc dùng tất cả đề đã chọn, học sinh được chia đều cho các đề.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckSquare, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, ClipboardList, Eye, FileStack, Pencil, Play, Plus, Square, X } from 'lucide-react';

const GROUPS_STEP = 20; // số kì kiểm tra hiện một lần
const PAPERS_STEP = 20; // số đề hiện một lần trong một kì
import type { ExamPeriod, QuizSummary } from '../lib/types';
import { PERIODS, PERIOD_LABEL, groupPapers, type PaperGroup } from '../lib/examPaper';
import { formatDate } from '../lib/util';

export function ExamPapers({ items, filter, onCreate, onHost }: {
  items: QuizSummary[];
  filter: string;
  onCreate: (preset: { grade?: string; subject?: string; period?: ExamPeriod }) => void;
  onHost: (papers: QuizSummary[]) => void;
}) {
  // Lọc nhanh bằng 3 hàng tab: Lớp → Môn → Thời điểm kiểm tra; mỗi tab ghi số đề (tính theo các lựa chọn ở hàng khác)
  const [f, setF] = useState<{ grade: string; subject: string; period: ExamPeriod | '' }>(() => {
    try { return { grade: '', subject: '', period: '', ...JSON.parse(sessionStorage.getItem('quickplay.paperTabs') || '{}') }; } catch { return { grade: '', subject: '', period: '' }; }
  });
  const pick = (p: Partial<typeof f>) => setF((o) => {
    const n = { ...o, ...p };
    try { sessionStorage.setItem('quickplay.paperTabs', JSON.stringify(n)); } catch { /* bỏ qua */ }
    return n;
  });
  const needle = filter.trim().toLocaleLowerCase('vi');
  const groups = useMemo(
    () => groupPapers(items)
      .map((g) => ({ ...g, papers: g.papers.filter((q) => !needle || `${q.title} ${q.paper_code ?? ''} ${g.subject}`.toLocaleLowerCase('vi').includes(needle)) }))
      .filter((g) => g.papers.length),
    [items, needle],
  );
  const n = (gs: PaperGroup[]) => gs.reduce((t, g) => t + g.papers.length, 0);
  const total = n(groups);
  const grades = [...new Set(groups.map((g) => g.grade))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  const grade = grades.includes(f.grade) ? f.grade : '';
  const inGrade = groups.filter((g) => !grade || g.grade === grade);
  const subjects = [...new Set(inGrade.map((g) => g.subject))].sort((a, b) => a.localeCompare(b, 'vi'));
  const subject = subjects.includes(f.subject) ? f.subject : '';
  const inSubject = inGrade.filter((g) => !subject || g.subject === subject);
  const period = f.period;
  const shown = inSubject.filter((g) => !period || g.period === period);
  // số đề của từng tab: tab Lớp đếm theo Môn + Thời điểm đang chọn, v.v.
  const byPeriod = (gs: PaperGroup[]) => gs.filter((g) => !period || g.period === period);
  const gradeCount = (gr: string) => n(byPeriod(groups.filter((g) => (!gr || g.grade === gr) && (!subject || g.subject === subject))));
  const subjectCount = (s: string) => n(byPeriod(inGrade.filter((g) => !s || g.subject === s)));
  const periodCount = (p: ExamPeriod | '') => n(inSubject.filter((g) => !p || g.period === p));
  // Nhóm (kì kiểm tra) thu gọn thành một dòng; ít nhóm (đã lọc hẹp) thì tự mở. Nhiều nhóm thì chia trang.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [groupLimit, setGroupLimit] = useState(GROUPS_STEP);
  const autoOpen = shown.length <= 3;
  const fkey = `${grade}|${subject}|${period}|${needle}`;
  useEffect(() => setGroupLimit(GROUPS_STEP), [fkey]);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card paper-intro">
        <ClipboardList size={28} color="var(--primary)" />
        <div className="grow stack" style={{ gap: 4 }}>
          <b>Kho đề thi: {total} đề trong {groups.length} kì kiểm tra{shown.length !== groups.length ? ` · đang xem ${n(shown)} đề` : ''}</b>
          <span className="small muted">
            Mỗi đề có Khối lớp, Môn, Thời điểm kiểm tra và Mã đề. Tích chọn các đề của một kì rồi bấm <b>Tổ chức thi</b>: phần mềm bốc ngẫu nhiên 1 hoặc 2 đề (hoặc dùng tất cả đề đã chọn) và chia đều học sinh cho các đề.
          </span>
        </div>
        <button className="btn primary" onClick={() => onCreate({})}><Plus size={18} /> Tạo đề thi từ ngân hàng câu hỏi</button>
      </div>
      {groups.length > 0 && (
        <div className="card paper-filter" role="group" aria-label="Lọc kho đề thi">
          <Drop label="Lớp" value={grade} onPick={(v) => pick({ grade: v, subject: '' })}
            options={[{ v: '', t: 'Tất cả lớp', c: gradeCount('') }, ...grades.map((g) => ({ v: g, t: g, c: gradeCount(g) }))]} />
          <Drop label="Môn" value={subject} onPick={(v) => pick({ subject: v })}
            options={[{ v: '', t: 'Tất cả môn', c: subjectCount('') }, ...subjects.map((s) => ({ v: s, t: s, c: subjectCount(s) }))]} />
          <Drop label="Thời điểm kiểm tra" value={period} onPick={(v) => pick({ period: v as ExamPeriod | '' })}
            options={[{ v: '', t: 'Mọi thời điểm', c: periodCount('') }, ...PERIODS.map((p) => ({ v: p, t: PERIOD_LABEL[p].replace(/^Kiểm tra (.)/, (_, c: string) => c.toLocaleUpperCase('vi')), c: periodCount(p) }))]} />
          <div className="paper-filter-sum">
            <b>{n(shown)}</b> đề · <b>{shown.length}</b> kì kiểm tra
            {(grade || subject || period) && <button type="button" className="btn sm ghost" onClick={() => pick({ grade: '', subject: '', period: '' })}><X size={14} /> Bỏ lọc</button>}
          </div>
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
      {shown.length > 1 && (
        <div className="row between paper-list-head">
          <span className="small muted">Bấm vào một kì kiểm tra để mở danh sách đề.</span>
          <span className="row" style={{ gap: 6 }}>
            <button type="button" className="btn sm ghost" onClick={() => setOpen(new Set(shown.slice(0, groupLimit).map((g) => g.key)))}><ChevronsUpDown size={14} /> Mở hết</button>
            <button type="button" className="btn sm ghost" onClick={() => setOpen(new Set())}><ChevronsDownUp size={14} /> Thu gọn hết</button>
          </span>
        </div>
      )}
      {shown.slice(0, groupLimit).map((g) => (
        <Group key={g.key} g={g} open={autoOpen || open.has(g.key)} onToggle={() => setOpen((s) => { const x = new Set(s); if (x.has(g.key)) x.delete(g.key); else x.add(g.key); return x; })} onCreate={onCreate} onHost={onHost} />
      ))}
      {shown.length > groupLimit && (
        <button type="button" className="btn ghost" style={{ alignSelf: 'center' }} onClick={() => setGroupLimit((k) => k + GROUPS_STEP)}>
          Hiện thêm {Math.min(GROUPS_STEP, shown.length - groupLimit)} kì kiểm tra (còn {shown.length - groupLimit}) – hoặc chọn Lớp / Môn để thu gọn
        </button>
      )}
      {groups.length > 0 && !shown.length && <p className="muted">Không có đề thi nào khớp bộ lọc.</p>}
    </div>
  );
}

/** Nút sổ lọc (Lớp / Môn / Thời điểm): mỗi lựa chọn ghi số đề; 60 lớp vẫn gọn trong một ô. Đang lọc thì ô sáng màu. */
function Drop({ label, value, options, onPick }: { label: string; value: string; options: { v: string; t: string; c: number }[]; onPick: (v: string) => void }) {
  return (
    <label className={`field paper-drop ${value ? 'on' : ''}`}>
      <span>{label}</span>
      <select className="input" value={value} onChange={(e) => onPick(e.target.value)}>
        {options.map((o) => <option key={o.v || 'all'} value={o.v} disabled={!o.c && o.v !== value && !!o.v}>{o.t} ({o.c} đề)</option>)}
      </select>
    </label>
  );
}

function Group({ g, open, onToggle, onCreate, onHost }: { g: PaperGroup; open: boolean; onToggle: () => void; onCreate: (p: { grade?: string; subject?: string; period?: ExamPeriod }) => void; onHost: (papers: QuizSummary[]) => void }) {
  const [limit, setLimit] = useState(PAPERS_STEP);
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
    <section className={`card paper-group ${open ? 'open' : 'closed'}`}>
      <header className="paper-group-head">
        <button type="button" className="paper-group-toggle" onClick={onToggle} aria-expanded={open}>
          {open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          <span className="paper-group-title">
            <b>{g.subject} · {g.grade}</b>
            <span><span className="badge amber">{PERIOD_LABEL[g.period]}</span> <span className="small muted">{g.papers.length} đề{open && picked.length !== g.papers.length ? ` · đã chọn ${picked.length}` : ''}</span></span>
          </span>
        </button>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => onCreate({ grade: g.grade, subject: g.subject, period: g.period })}><Plus size={16} /> Thêm đề</button>
          <button className="btn sm success" disabled={!picked.length || counts.length > 1} onClick={() => onHost(picked)} title={open ? undefined : 'Tổ chức với tất cả đề của kì này (mở ra để chọn bớt)'}><Play size={16} /> Tổ chức thi ({picked.length} đề)</button>
        </div>
      </header>
      {open && <>
      <ul className="paper-list">
        <li className="paper-row head">
          <button type="button" className="qb-check" onClick={() => setSel(all ? new Set() : new Set(g.papers.map((q) => q.id)))} aria-label={all ? 'Bỏ chọn tất cả đề' : 'Chọn tất cả đề'}>
            {all ? <CheckSquare size={20} /> : <Square size={20} />}
          </button>
          <span className="small muted">Chọn đề để tổ chức thi</span>
        </li>
        {g.papers.slice(0, limit).map((q) => (
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
        {g.papers.length > limit && (
          <li className="paper-row more"><button type="button" className="btn sm ghost" onClick={() => setLimit((k) => k + PAPERS_STEP)}>Hiện thêm đề (còn {g.papers.length - limit})</button></li>
        )}
      </ul>
      </>}
      {counts.length > 1 && (
        <div className="alert warn" role="status"><div><AlertTriangle size={16} /> Các đề đã chọn có số câu khác nhau ({counts.sort((a, b) => a - b).join(', ')} câu). Để chấm điểm công bằng, các đề thi cùng kì cần cùng số câu: sửa lại đề hoặc chỉ chọn các đề cùng số câu.</div></div>
      )}
    </section>
  );
}
