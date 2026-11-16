// Chọn bộ đề cho buổi "Dạy học trên lớp": 3 kho (Của tôi / Đề thi / Thư viện công cộng),
// lọc theo cây danh mục Lớp → Môn → Chủ đề → Bài và tìm theo tên, để kho có hàng nghìn bộ đề vẫn tìm nhanh.
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, ClipboardList, Globe2, Search, X } from 'lucide-react';
import type { Catalog, QuizSummary } from '../lib/types';
import { ALL, NONE, gradeId, gradesOf, inNode, pathOf, subjectsOfGrade, type Placement } from '../lib/catalog';
import { BUILTIN_QUIZZES } from '../lib/factory';
import { buildPublicCatalog } from '../lib/publicCatalog';

export type PickTab = 'mine' | 'papers' | 'public';
export interface PickItem { id: string; title: string; count: number; place: Placement; code?: string; updated?: string; builtin?: boolean }

const KEY = 'quickplay.paperPick'; // nhớ kho và bộ lọc đã chọn lần trước (trên máy này)
interface Filters { tab: PickTab; grade: string; subject: string; chapter: string; lesson: string }
const EMPTY: Filters = { tab: 'mine', grade: '', subject: '', chapter: '', lesson: '' };
const readFilters = (): Filters => {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return EMPTY; }
};
const SHOW = 60; // số bộ đề hiện một lần; nhiều hơn thì bấm "Hiện thêm" hoặc lọc / tìm

export function QuizPicker({ mine, pub, catalog, value, onChange }: {
  mine: QuizSummary[];
  pub: QuizSummary[];
  catalog: Catalog;
  value: string;
  onChange: (id: string, item: PickItem | null) => void;
}) {
  const [f, setF] = useState<Filters>(readFilters);
  const [text, setText] = useState('');
  const [limit, setLimit] = useState(SHOW);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* bỏ qua */ }
    setLimit(SHOW);
  }, [f]);
  const set = (p: Partial<Filters>) => setF((o) => ({ ...o, ...p }));

  const pubView = useMemo(() => buildPublicCatalog(pub), [pub]);
  const sources = useMemo(() => {
    const own = (q: QuizSummary): PickItem => ({ id: q.id, title: q.title, count: q.question_count, place: q, code: q.paper_code, updated: q.updated_at });
    return {
      mine: mine.map(own),
      papers: mine.filter((q) => q.paper_period).map(own),
      public: [
        ...BUILTIN_QUIZZES.map((b): PickItem => ({ id: b.id, title: b.title, count: 10, place: pubView.place.get(b.id) ?? {}, builtin: true })),
        ...pub.map((q): PickItem => ({ id: q.id, title: q.title, count: q.question_count, place: pubView.place.get(q.id) ?? {}, code: q.paper_code, updated: q.updated_at })),
      ],
    };
  }, [mine, pub, pubView]);
  const cat = f.tab === 'public' ? pubView.cat : catalog;
  const all = sources[f.tab];

  // Lựa chọn của bộ lọc phải còn trong cây (đổi kho / danh mục đổi) — không còn thì coi như "Tất cả"
  const grades = gradesOf(cat).filter((g) => cat.subjects.some((s) => s.grade === g));
  const hasUngraded = cat.subjects.some((s) => !s.grade);
  const grade = f.grade === NONE || grades.includes(f.grade) || (f.grade === '-' && hasUngraded) ? f.grade : '';
  const subjects = grade === NONE ? [] : grade ? subjectsOfGrade(cat, grade === '-' ? '' : grade) : cat.subjects;
  const subject = subjects.find((s) => s.id === f.subject);
  const chapter = subject?.chapters.find((c) => c.id === f.chapter);
  const lesson = chapter?.lessons.find((l) => l.id === f.lesson);
  const node = lesson?.id ?? chapter?.id ?? subject?.id ?? (grade === NONE ? NONE : grade ? gradeId(grade === '-' ? '' : grade) : ALL);

  const needle = text.trim().toLocaleLowerCase('vi');
  const list = useMemo(
    () => all
      .filter((q) => inNode(cat, q.place, node))
      .filter((q) => !needle || q.title.toLocaleLowerCase('vi').includes(needle) || (q.code ?? '').toLocaleLowerCase('vi').includes(needle))
      .sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '')),
    [all, cat, node, needle],
  );
  const chosen = [...sources.mine, ...sources.public].find((q) => q.id === value) ?? null;
  const filtered = node !== ALL || !!needle;

  const tabs: { id: PickTab; label: string; icon: JSX.Element; n: number }[] = [
    { id: 'mine', label: 'Kho đề của tôi', icon: <BookOpen size={16} />, n: sources.mine.length },
    { id: 'papers', label: 'Kho đề thi', icon: <ClipboardList size={16} />, n: sources.papers.length },
    { id: 'public', label: 'Thư viện công cộng', icon: <Globe2 size={16} />, n: sources.public.length },
  ];

  return (
    <div className="qpk">
      <div className="tabs qpk-tabs" role="tablist" aria-label="Lấy câu từ kho nào">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={f.tab === t.id} className={`tab ${f.tab === t.id ? 'on' : ''}`} onClick={() => set({ tab: t.id, subject: '', chapter: '', lesson: '' })}>
            {t.icon} {t.label} ({t.n})
          </button>
        ))}
      </div>

      <div className="qpk-filters" role="group" aria-label="Lọc theo danh mục">
        <label className="field"><span>Lớp</span>
          <select className="input" value={grade} onChange={(e) => set({ grade: e.target.value, subject: '', chapter: '', lesson: '' })}>
            <option value="">Tất cả lớp</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
            {hasUngraded && <option value="-">Môn chưa xếp lớp</option>}
            <option value={NONE}>Chưa phân loại</option>
          </select>
        </label>
        <label className="field"><span>Môn học</span>
          <select className="input" value={subject?.id ?? ''} disabled={!subjects.length} onChange={(e) => set({ subject: e.target.value, chapter: '', lesson: '' })}>
            <option value="">Tất cả môn</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}{!grade && s.grade ? ` (${s.grade})` : ''}</option>)}
          </select>
        </label>
        <label className="field"><span>Chương / Chủ đề</span>
          <select className="input" value={chapter?.id ?? ''} disabled={!subject?.chapters.length} onChange={(e) => set({ chapter: e.target.value, lesson: '' })}>
            <option value="">{subject ? 'Tất cả chủ đề' : 'Chọn môn trước'}</option>
            {subject?.chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Bài</span>
          <select className="input" value={lesson?.id ?? ''} disabled={!chapter?.lessons.length} onChange={(e) => set({ lesson: e.target.value })}>
            <option value="">{chapter ? 'Tất cả bài' : 'Chọn chủ đề trước'}</option>
            {chapter?.lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="field qpk-search"><span>Tìm theo tên hoặc mã đề</span>
          <span className="qpk-search-box">
            <Search size={16} aria-hidden />
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="VD: Bài 6, TIN3-TX…" aria-label="Tìm bộ đề theo tên hoặc mã đề" />
            {text && <button type="button" className="btn icon sm ghost" onClick={() => setText('')} aria-label="Xóa ô tìm"><X size={14} /></button>}
          </span>
        </label>
      </div>

      <div className="qpk-head">
        <span className="small muted">{list.length} bộ đề{filtered ? ' phù hợp' : ''}</span>
        {filtered && <button type="button" className="btn sm ghost" onClick={() => { setF({ ...EMPTY, tab: f.tab }); setText(''); }}>Bỏ lọc</button>}
      </div>
      <div className="qpk-list" role="radiogroup" aria-label="Bộ đề">
        {list.length === 0 && (
          <p className="muted small qpk-empty">
            {all.length === 0
              ? f.tab === 'papers' ? 'Chưa có đề thi nào. Tạo đề thi ở Thư viện → Đề thi.' : f.tab === 'public' ? 'Thư viện công cộng chưa có bộ đề nào.' : 'Chưa có bộ đề nào. Tạo bộ đề ở Thư viện.'
              : 'Không có bộ đề nào khớp bộ lọc. Thử chọn rộng hơn hoặc bấm Bỏ lọc.'}
          </p>
        )}
        {list.slice(0, limit).map((q) => {
          const on = q.id === value;
          const where = pathOf(cat, q.place);
          return (
            <button key={q.id} type="button" role="radio" aria-checked={on} className={`qpk-item ${on ? 'on' : ''}`} onClick={() => onChange(q.id, q)}>
              <span className="qpk-dot" aria-hidden>{on && <CheckCircle2 size={20} />}</span>
              <span className="qpk-main">
                <b>{q.title}</b>
                <small>{where || 'Chưa phân loại'}</small>
              </span>
              <span className="qpk-meta">
                {q.code && <span className="badge amber">{q.code}</span>}
                {q.builtin && <span className="badge green">Mẫu Quickplay</span>}
                <span className="badge blue">{q.count} câu</span>
              </span>
            </button>
          );
        })}
        {list.length > limit && (
          <button type="button" className="btn sm ghost qpk-more" onClick={() => setLimit((n) => n + SHOW)}>
            Hiện thêm ({list.length - limit} bộ đề nữa) – hoặc lọc / tìm để thu gọn
          </button>
        )}
      </div>
      {chosen && !list.some((q) => q.id === value) && (
        <p className="small qpk-chosen"><CheckCircle2 size={16} /> Đang chọn: <b>{chosen.title}</b> (không nằm trong bộ lọc hiện tại)</p>
      )}
    </div>
  );
}
