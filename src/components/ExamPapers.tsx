// Mục "Đề thi" của thư viện: kho đề xếp theo Khối lớp › Môn › Thời điểm kiểm tra.
// Mỗi nhóm (VD Tin học lớp 3 – Cuối học kì I) có nhiều đề (mã đề khác nhau); giáo viên tích chọn đề rồi Tổ chức thi:
// bốc ngẫu nhiên 1 đề, 2 đề hoặc dùng tất cả đề đã chọn, học sinh được chia đều cho các đề.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, ClipboardList, Eye, FileStack, Pencil, Play, Plus, Search, Shuffle, Square, X } from 'lucide-react';

const GROUPS_STEP = 20; // số kì kiểm tra hiện một lần
const PAPERS_STEP = 30; // số đề mỗi trang trong một kì (chia hết cho 2 và 3 cột)
const BIG_GROUP = 8; // kì có hơn chừng này đề thì hiện thanh tìm / sắp xếp / chọn nhanh và danh sách 2 cột

/** Số trang hiện trên thanh chia trang: 1 … 4 5 6 … 10 (-1 là dấu …). */
export function pageList(cur: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const set = new Set([0, pages - 1, cur - 1, cur, cur + 1].filter((p) => p >= 0 && p < pages));
  const s = [...set].sort((a, b) => a - b);
  const out: number[] = [];
  s.forEach((p, i) => { if (i && p - s[i - 1] > 1) out.push(-1); out.push(p); });
  return out;
}
import type { ExamPeriod, QuizSummary } from '../lib/types';
import { PERIODS, PERIOD_LABEL, drawPapers, groupPapers, paperTitle, type PaperGroup } from '../lib/examPaper';
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
  // Kì ít đề: chọn sẵn tất cả. Kì nhiều đề: chưa chọn đề nào, thầy cô tự chọn (hoặc bốc ngẫu nhiên vài đề)
  const [sel, setSel] = useState<Set<string>>(() => new Set(g.papers.length > BIG_GROUP ? [] : g.papers.map((q) => q.id)));
  const picked = g.papers.filter((q) => sel.has(q.id));
  const counts = [...new Set(picked.map((q) => q.question_count))];
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  // Kì có nhiều đề (VD 100 đề Tin học lớp 3 thường xuyên): tìm mã đề, sắp xếp, chọn nhanh, 2 cột, chia trang
  const big = g.papers.length > BIG_GROUP;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'code' | 'new' | 'count'>('code');
  const [page, setPage] = useState(0);
  const [rnd, setRnd] = useState(2);
  const needle = q.trim().toLocaleLowerCase('vi');
  const list = useMemo(() => {
    const l = g.papers.filter((x) => !needle || `${x.paper_code ?? ''} ${x.title}`.toLocaleLowerCase('vi').includes(needle));
    if (sort === 'new') return [...l].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
    if (sort === 'count') return [...l].sort((a, b) => a.question_count - b.question_count || (a.paper_code ?? '').localeCompare(b.paper_code ?? '', 'vi', { numeric: true }));
    return l; // groupPapers đã xếp theo mã đề
  }, [g.papers, needle, sort]);
  const pages = Math.max(1, Math.ceil(list.length / PAPERS_STEP));
  const cur = Math.min(page, pages - 1);
  const rows = list.slice(cur * PAPERS_STEP, (cur + 1) * PAPERS_STEP);
  const allInList = list.length > 0 && list.every((x) => sel.has(x.id));
  const pickList = (on: boolean) => setSel((s) => { const n = new Set(s); list.forEach((x) => (on ? n.add(x.id) : n.delete(x.id))); return n; });
  const pickRandom = () => setSel(new Set(drawPapers(list, Math.max(1, Math.min(rnd, list.length))).map((x) => x.id)));
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
          {picked.length || !big
            ? <button className="btn sm success" disabled={!picked.length || counts.length > 1} onClick={() => onHost(picked)} title={counts.length > 1 ? 'Các đề đã chọn có số câu khác nhau' : open ? undefined : 'Tổ chức với các đề đã chọn (mở ra để chọn lại)'}><Play size={16} /> Tổ chức thi ({picked.length} đề)</button>
            : <button className="btn sm" onClick={() => { if (!open) onToggle(); }} title="Mở kì này, tích chọn đề hoặc bấm Chọn ngẫu nhiên"><CheckSquare size={16} /> Chọn đề để tổ chức</button>}
        </div>
      </header>
      {open && <>
      {big && (
        <div className="paper-tools" role="group" aria-label="Tìm, sắp xếp và chọn nhanh đề trong kì">
          <span className="paper-tools-search">
            <Search size={16} aria-hidden />
            <input className="input" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Tìm mã đề hoặc tên đề…" aria-label="Tìm đề trong kì này" />
          </span>
          <select className="input paper-tools-sort" value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(0); }} aria-label="Sắp xếp đề">
            <option value="code">Xếp theo mã đề</option>
            <option value="new">Mới sửa trước</option>
            <option value="count">Theo số câu</option>
          </select>
          <span className="paper-tools-pick">
            <button type="button" className="btn sm ghost" onClick={() => pickList(!allInList)}>{allInList ? <Square size={16} /> : <CheckSquare size={16} />} {allInList ? 'Bỏ chọn' : 'Chọn'} {needle ? `${list.length} đề tìm được` : 'tất cả'}</button>
            <span className="paper-tools-rnd">
              <button type="button" className="btn sm ghost" onClick={pickRandom} title="Bỏ các đề đang chọn, bốc ngẫu nhiên số đề này"><Shuffle size={16} /> Chọn ngẫu nhiên</button>
              <input className="input" type="number" min={1} max={list.length || 1} value={rnd} onChange={(e) => setRnd(Math.max(1, Number(e.target.value) || 1))} aria-label="Số đề chọn ngẫu nhiên" />
              <span className="small muted">đề</span>
            </span>
          </span>
          <span className="paper-tools-count"><b>{picked.length}</b>/{g.papers.length} đề đã chọn</span>
        </div>
      )}
      {big && picked.length > 0 && (
        <div className="paper-picked" aria-label="Các đề đã chọn">
          <span className="small muted">Đã chọn:</span>
          {picked.slice(0, 12).map((x) => (
            <button key={x.id} type="button" className="paper-picked-chip" onClick={() => toggle(x.id)} title={`Bỏ chọn ${x.paper_code ?? x.title}`}>
              {x.paper_code || x.title} <X size={12} />
            </button>
          ))}
          {picked.length > 12 && <span className="small muted">và {picked.length - 12} đề nữa</span>}
          <button type="button" className="btn sm ghost" onClick={() => setSel(new Set())}>Bỏ chọn hết</button>
        </div>
      )}
      {big && counts.length > 1 && (
        <div className="alert warn" role="status"><div><AlertTriangle size={16} /> Các đề đã chọn có số câu khác nhau ({[...counts].sort((a, b) => a - b).join(', ')} câu). Chọn các đề cùng số câu (sắp xếp "Theo số câu" để dễ chọn) rồi mới tổ chức thi được.</div></div>
      )}
      <ul className={`paper-list ${big ? 'dense' : ''}`}>
        {!big && <li className="paper-row head">
          <button type="button" className="qb-check" onClick={() => setSel(all ? new Set() : new Set(g.papers.map((x) => x.id)))} aria-label={all ? 'Bỏ chọn tất cả đề' : 'Chọn tất cả đề'}>
            {all ? <CheckSquare size={20} /> : <Square size={20} />}
          </button>
          <span className="small muted">Chọn đề để tổ chức thi</span>
        </li>}
        {big && !rows.length && <li className="paper-row more"><span className="small muted">Không có đề nào khớp "{q}".</span></li>}
        {rows.map((q) => (
          <li key={q.id} className={`paper-row ${sel.has(q.id) ? 'on' : ''}`}>
            <button type="button" className="qb-check" onClick={() => toggle(q.id)} aria-pressed={sel.has(q.id)} aria-label={`Chọn đề ${q.paper_code ?? q.title}`}>
              {sel.has(q.id) ? <CheckSquare size={20} /> : <Square size={20} />}
            </button>
            <span className="paper-code">{q.paper_code || '—'}</span>
            {big && q.title === paperTitle(g.subject, g.grade, g.period, q.paper_code ?? '')
              ? <span className="grow paper-name" title={`${q.title} · sửa lần cuối ${formatDate(q.updated_at)}`}><small><b className="paper-qn">{q.question_count} câu</b></small></span>
              : <span className="grow paper-name" title={q.title}><b>{q.title}</b><small>{q.question_count} câu · cập nhật {formatDate(q.updated_at)}</small></span>}
            <Link className="btn icon sm ghost" to={`/teacher/preview/${q.id}`} title="Làm thử như học sinh" aria-label={`Làm thử đề ${q.paper_code ?? q.title}`}><Eye size={16} /></Link>
            <Link className="btn icon sm ghost" to={`/teacher/edit/${q.id}`} title="Sửa đề" aria-label={`Sửa đề ${q.paper_code ?? q.title}`}><Pencil size={16} /></Link>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav className="pager" aria-label="Trang danh sách đề">
          <button type="button" className="btn sm ghost" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Trang trước"><ChevronLeft size={16} /></button>
          {pageList(cur, pages).map((p, i) => p < 0
            ? <span key={`gap${i}`} className="muted">…</span>
            : <button key={p} type="button" className={`btn sm ${p === cur ? 'primary' : 'ghost'}`} aria-current={p === cur ? 'page' : undefined} onClick={() => setPage(p)}>{p + 1}</button>)}
          <button type="button" className="btn sm ghost" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Trang sau"><ChevronRight size={16} /></button>
          <span className="small muted">Đề {cur * PAPERS_STEP + 1}–{Math.min(list.length, (cur + 1) * PAPERS_STEP)} / {list.length}</span>
        </nav>
      )}
      </>}
      {!big && counts.length > 1 && (
        <div className="alert warn" role="status"><div><AlertTriangle size={16} /> Các đề đã chọn có số câu khác nhau ({counts.sort((a, b) => a - b).join(', ')} câu). Để chấm điểm công bằng, các đề thi cùng kì cần cùng số câu: sửa lại đề hoặc chỉ chọn các đề cùng số câu.</div></div>
      )}
    </section>
  );
}
