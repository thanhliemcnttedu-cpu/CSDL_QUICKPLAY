// Hộp thoại chia sẻ: xuất bộ đề / câu hỏi thành tệp .json để gửi cho giáo viên khác, và nhập tệp của người khác.
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Download, FileJson, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { gradesOf, subjectsOfGrade, DEFAULT_GRADES } from '../lib/catalog';
import { autoTargets, buildShare, importShare, parseShare, shareFileName, type PlaceTarget, type ShareFile } from '../lib/share';
import type { Catalog, QuizSummary, Quiz } from '../lib/types';
import { downloadBlob } from '../lib/xlsx';
import { pickFile } from './MediaTools';
import { Modal, useToast } from './ui';

const plainStem = (text: string) => text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const NO_GRADE = '__none__';

/** Xuất: lọc theo nguồn (bộ câu hỏi / đề thi), rồi theo lớp và môn, rồi mới tích bài và câu. */
export function ShareExportDialog({ items, onClose }: { items: QuizSummary[]; onClose: () => void }) {
  const toast = useToast();
  const [source, setSource] = useState<'mine' | 'papers'>('mine');
  const [grade, setGrade] = useState<string>(''); // '' = tất cả lớp
  const [subject, setSubject] = useState<string>(''); // '' = tất cả môn của lớp đã chọn
  const [picked, setPicked] = useState<Map<string, QuizSummary>>(new Map());
  const [open, setOpen] = useState<string | null>(null);
  const [full, setFull] = useState<Record<string, Quiz>>({});
  // qSel[quizId]: các câu được chọn; không có khóa = lấy tất cả câu của bộ đề
  const [qSel, setQSel] = useState<Record<string, Set<string>>>({});
  const [withMedia, setWithMedia] = useState(true);
  const [title, setTitle] = useState('Bộ đề chia sẻ');
  const [busy, setBusy] = useState<string | null>(null);

  // 1. nguồn: bộ câu hỏi của tôi hoặc đề thi
  const bySource = useMemo(() => items.filter((x) => (source === 'papers' ? !!x.paper_period : !x.paper_period)), [items, source]);
  // 2. lớp (rỗng = chưa xếp lớp)
  const grades = useMemo(() => {
    const set = new Set(bySource.map((x) => x.grade || NO_GRADE));
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [bySource]);
  const inGrade = useMemo(() => bySource.filter((x) => !grade || (x.grade || NO_GRADE) === grade), [bySource, grade]);
  // 3. môn trong lớp đã chọn
  const subjects = useMemo(() => [...new Set(inGrade.map((x) => x.subject || ''))].sort((a, b) => a.localeCompare(b, 'vi')), [inGrade]);
  // danh sách bài sau khi lọc
  const shown = useMemo(() => inGrade.filter((x) => subject === '' || (x.subject || '') === subject), [inGrade, subject]);
  const allShownPicked = shown.length > 0 && shown.every((x) => picked.has(x.id));

  const loadFull = async (id: string) => {
    if (full[id]) return full[id];
    const q = await api.getQuiz(id);
    setFull((m) => ({ ...m, [id]: q }));
    return q;
  };

  const toggle = (x: QuizSummary) => setPicked((m) => {
    const n = new Map(m);
    if (n.has(x.id)) n.delete(x.id); else n.set(x.id, x);
    return n;
  });

  const toggleAllShown = () => setPicked((m) => {
    const n = new Map(m);
    if (allShownPicked) shown.forEach((x) => n.delete(x.id));
    else shown.forEach((x) => n.set(x.id, x));
    return n;
  });

  const expand = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    try {
      const q = await loadFull(id);
      setQSel((m) => (m[id] ? m : { ...m, [id]: new Set(q.questions.map((x) => x.id)) }));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const toggleQ = (quizId: string, qid: string) =>
    setQSel((m) => {
      const cur = new Set(m[quizId] ?? []);
      if (cur.has(qid)) cur.delete(qid); else cur.add(qid);
      return { ...m, [quizId]: cur };
    });

  const exportNow = async () => {
    const ids = [...picked.keys()];
    if (!ids.length) return toast('Hãy chọn ít nhất một bài.', 'error');
    try {
      setBusy('Đang chuẩn bị tệp…');
      const sel = [];
      for (const id of ids) {
        const q = await loadFull(id);
        const chosen = qSel[id];
        // bài đã mở để chọn câu thì chỉ lấy các câu được tích; chưa mở thì lấy tất cả
        const questionIds = chosen && chosen.size !== q.questions.length ? [...chosen] : undefined;
        if (questionIds && !questionIds.length) continue;
        sel.push({ quiz: q, questionIds });
      }
      const cat: Catalog = (await api.getCatalog().catch(() => null)) ?? { subjects: [] };
      const file = await buildShare(sel, cat, title.trim() || 'Bộ đề chia sẻ', { media: withMedia, onProgress: (t) => setBusy(t) });
      downloadBlob(shareFileName(), new Blob([JSON.stringify(file)], { type: 'application/json' }));
      toast(`Đã xuất ${file.quizzes.length} bài. Gửi tệp này cho giáo viên khác để họ nhập.`, 'ok');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const tab = (on: boolean) => ({ className: `btn sm ${on ? 'primary' : 'ghost'}`, 'aria-pressed': on });

  return (
    <Modal title="Chia sẻ bộ đề hoặc câu hỏi" onClose={onClose} wide footer={
      <button className="btn primary" onClick={exportNow} disabled={!picked.size || !!busy}><Download size={18} /> {busy ?? `Xuất tệp chia sẻ (${picked.size} bài)`}</button>
    }>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>Bước 1: chọn nguồn. Bước 2: lọc theo lớp và môn. Bước 3: tích các bài muốn chia sẻ, bấm <b>Chọn câu</b> để tích riêng từng câu.</p>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" {...tab(source === 'mine')} onClick={() => { setSource('mine'); setGrade(''); setSubject(''); }}>Bộ câu hỏi của tôi ({items.filter((x) => !x.paper_period).length})</button>
          <button type="button" {...tab(source === 'papers')} onClick={() => { setSource('papers'); setGrade(''); setSubject(''); }}>Đề thi ({items.filter((x) => x.paper_period).length})</button>
        </div>

        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: 180 }}><span>Lớp</span>
            <select className="input" value={grade} onChange={(e) => { setGrade(e.target.value); setSubject(''); }}>
              <option value="">Tất cả lớp</option>
              {grades.map((g) => <option key={g} value={g}>{g === NO_GRADE ? 'Chưa xếp lớp' : g}</option>)}
            </select>
          </label>
          <label className="field" style={{ minWidth: 220 }}><span>Môn</span>
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">Tất cả môn</option>
              {subjects.map((s) => <option key={s || 'none'} value={s}>{s || 'Chưa phân loại'}</option>)}
            </select>
          </label>
          <button type="button" className="btn sm ghost" onClick={toggleAllShown} disabled={!shown.length} style={{ alignSelf: 'flex-end' }}>
            {allShownPicked ? 'Bỏ chọn danh sách này' : `Chọn tất cả ${shown.length} bài đang hiện`}
          </button>
        </div>

        <label className="field"><span>Tên tệp chia sẻ (ghi trong tệp)</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} /></label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={withMedia} onChange={(e) => setWithMedia(e.target.checked)} /> Kèm ảnh và âm thanh trong câu hỏi (tệp lớn hơn nhưng người nhận không mất hình)</label>

        <div className="stack" style={{ gap: 6, maxHeight: '45vh', overflow: 'auto' }}>
          {!shown.length && <span className="muted">Không có bài nào trong mục này.</span>}
          {shown.map((q) => {
            const isOpen = open === q.id;
            const f = full[q.id];
            const chosen = qSel[q.id];
            return (
              <div key={q.id} className="card" style={{ padding: 10 }}>
                <div className="row between" style={{ gap: 8 }}>
                  <label className="row" style={{ gap: 8, minWidth: 0 }}>
                    <input type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q)} aria-label={`Chia sẻ ${q.title}`} />
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><b>{q.title}</b> <span className="muted small">· {q.subject || 'Chưa phân loại'} · {q.question_count} câu</span></span>
                  </label>
                  <button className="btn sm ghost" onClick={() => expand(q.id)} aria-expanded={isOpen}>{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Chọn câu</button>
                </div>
                {isOpen && (
                  <div className="stack" style={{ gap: 4, marginTop: 8 }}>
                    {!f && <span className="muted small">Đang tải câu hỏi…</span>}
                    {f?.questions.map((x, i) => (
                      <label key={x.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                        <input type="checkbox" checked={!!chosen?.has(x.id)} onChange={() => toggleQ(q.id, x.id)} aria-label={`Câu ${i + 1}`} />
                        <span className="small" style={{ overflowWrap: 'anywhere' }}><b>Câu {i + 1}.</b> {plainStem(x.stem?.text ?? '') || '(không có chữ)'}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/** Nhập: chọn tệp, rồi chọn cách đặt vào: tự động theo tệp, hoặc chọn lớp / môn / chương / bài. */
export function ShareImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (ids: string[]) => void }) {
  const toast = useToast();
  const [file, setFile] = useState<ShareFile | null>(null);
  const [name, setName] = useState('');
  const [catalog, setCatalog] = useState<Catalog>({ subjects: [] });
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [lesson, setLesson] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.getCatalog().then((c) => setCatalog(c ?? { subjects: [] })).catch(() => setCatalog({ subjects: [] }));
  }, []);

  const grades = useMemo(() => {
    const g = gradesOf(catalog);
    return g.length ? g : DEFAULT_GRADES;
  }, [catalog]);
  // gợi ý theo cây hiện có: môn trong lớp, chương trong môn, bài trong chương
  const subjectObjs = useMemo(() => subjectsOfGrade(catalog, grade), [catalog, grade]);
  const chapterObjs = useMemo(() => subjectObjs.find((s) => s.name.toLocaleLowerCase('vi') === subject.trim().toLocaleLowerCase('vi'))?.chapters ?? [], [subjectObjs, subject]);
  const lessonObjs = useMemo(() => chapterObjs.find((c) => c.name.toLocaleLowerCase('vi') === chapter.trim().toLocaleLowerCase('vi'))?.lessons ?? [], [chapterObjs, chapter]);

  const choose = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const parsed = parseShare(await f.text());
      setFile(parsed);
      setName(f.name);
      const first = parsed.quizzes[0];
      setGrade(first.grade && grades.includes(first.grade) ? first.grade : grades[0]);
      setSubject(first.subject || '');
      setChapter(first.chapter || '');
      setLesson(first.lesson || '');
    } catch (e) {
      setFile(null);
      toast((e as Error).message, 'error');
    }
  };

  // mọi bộ đề phải có môn để tự động đặt; chế độ chọn vị trí thì cần lớp và môn
  const missingSubject = !!file && mode === 'auto' && file.quizzes.some((q) => !q.subject.trim());
  const ready = !!file && (mode === 'auto' ? !missingSubject : (!!subject.trim() && !!grade));

  const targets = (): PlaceTarget[] => {
    if (!file) return [];
    return mode === 'auto' ? autoTargets(file) : file.quizzes.map(() => ({ grade, subject, chapter, lesson }));
  };

  const run = async () => {
    if (!file) return;
    try {
      setBusy('Đang nhập…');
      const ids = await importShare(file, targets(), { onProgress: (t) => setBusy(t) });
      toast(`Đã nhập ${ids.length} bài.`, 'ok');
      onDone(ids);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const place = (q: { grade: string; subject: string; chapter: string; lesson: string }) =>
    [q.grade || 'Chưa xếp lớp', q.subject || '(không có môn)', q.chapter, q.lesson].filter(Boolean).join(' › ');

  return (
    <Modal title="Nhập bộ đề chia sẻ" onClose={onClose} wide footer={
      <button className="btn primary" onClick={run} disabled={!ready || !!busy}><Check size={18} /> {busy ?? (file ? `Nhập ${file.quizzes.length} bài` : 'Nhập')}</button>
    }>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>Chọn tệp .json do giáo viên khác chia sẻ, rồi chọn cách đặt các bài vào tài khoản của bạn.</p>
        <button className="btn" onClick={choose} disabled={!!busy}><Upload size={18} /> {file ? 'Chọn tệp khác' : 'Chọn tệp chia sẻ (.json)'}</button>
        {file && (
          <>
            <div className="row" style={{ gap: 8 }}><FileJson size={18} /> <span className="small" style={{ overflowWrap: 'anywhere' }}>{name} · {file.title} · {file.quizzes.length} bài</span></div>

            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px' }}>
              <legend className="small"><b>Cách đặt vào tài khoản</b></legend>
              <label className="row" style={{ gap: 8 }}>
                <input type="radio" name="share-mode" checked={mode === 'auto'} onChange={() => setMode('auto')} />
                <span>Tự động theo tệp: tạo lớp, môn, chương, bài còn thiếu đúng như trong tệp</span>
              </label>
              <label className="row" style={{ gap: 8 }}>
                <input type="radio" name="share-mode" checked={mode === 'manual'} onChange={() => setMode('manual')} />
                <span>Chọn vị trí: nhập tất cả bài vào lớp, môn, chương, bài tôi chọn</span>
              </label>
            </fieldset>

            {mode === 'auto' ? (
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {file.quizzes.map((q, i) => <li key={i}>{q.title} <span className="muted">→ {place(q)}</span></li>)}
              </ul>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <label className="field" style={{ minWidth: 160 }}><span>Lớp</span>
                    <select className="input" value={grade} onChange={(e) => { setGrade(e.target.value); setSubject(''); setChapter(''); setLesson(''); }}>
                      {grades.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ minWidth: 200 }}><span>Môn học</span>
                    <input className="input" list="share-subjects" value={subject} onChange={(e) => { setSubject(e.target.value); setChapter(''); setLesson(''); }} placeholder="VD: Tiếng Anh" maxLength={80} />
                    <datalist id="share-subjects">{subjectObjs.map((s) => <option key={s.id} value={s.name} />)}</datalist>
                  </label>
                </div>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <label className="field" style={{ minWidth: 200 }}><span>Chương / chủ đề (không bắt buộc)</span>
                    <input className="input" list="share-chapters" value={chapter} onChange={(e) => { setChapter(e.target.value); setLesson(''); }} placeholder="Để trống = không vào chương" maxLength={80} />
                    <datalist id="share-chapters">{chapterObjs.map((c) => <option key={c.id} value={c.name} />)}</datalist>
                  </label>
                  <label className="field" style={{ minWidth: 200 }}><span>Bài (không bắt buộc)</span>
                    <input className="input" list="share-lessons" value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="Để trống = không vào bài" maxLength={80} />
                    <datalist id="share-lessons">{lessonObjs.map((l) => <option key={l.id} value={l.name} />)}</datalist>
                  </label>
                </div>
                <p className="muted small" style={{ margin: 0 }}>Tên mới sẽ được tạo nếu chưa có. Chọn lớp, môn, chương, bài rồi mới bấm nhập; các bài trong tệp sẽ vào đúng vị trí này.</p>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {file.quizzes.map((q, i) => <li key={i}>{q.title} <span className="muted">→ {place({ grade, subject, chapter, lesson })}</span></li>)}
                </ul>
              </div>
            )}
            {missingSubject && <p className="small" style={{ color: 'var(--danger, #b42318)', margin: 0 }}>Có bài trong tệp không ghi môn. Hãy chọn “Chọn vị trí” và nhập môn.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
