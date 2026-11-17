// Hộp thoại chia sẻ: xuất bộ đề / câu hỏi thành tệp .json để gửi cho giáo viên khác, và nhập tệp của người khác.
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Download, FileJson, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { gradesOf, subjectsOfGrade, DEFAULT_GRADES } from '../lib/catalog';
import { buildShare, importShare, parseShare, shareFileName, type ShareFile } from '../lib/share';
import type { Catalog, QuizSummary, Quiz } from '../lib/types';
import { downloadBlob } from '../lib/xlsx';
import { pickFile } from './MediaTools';
import { Modal, useToast } from './ui';

const plainStem = (text: string) => text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Xuất: chọn nhiều bộ đề, và có thể chọn từng câu trong mỗi bộ. */
export function ShareExportDialog({ items, onClose }: { items: QuizSummary[]; onClose: () => void }) {
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [full, setFull] = useState<Record<string, Quiz>>({});
  // qSel[quizId]: các câu được chọn; không có khóa = lấy tất cả câu của bộ đề
  const [qSel, setQSel] = useState<Record<string, Set<string>>>({});
  const [withMedia, setWithMedia] = useState(true);
  const [title, setTitle] = useState('Bộ đề chia sẻ');
  const [busy, setBusy] = useState<string | null>(null);

  const loadFull = async (id: string) => {
    if (full[id]) return full[id];
    const q = await api.getQuiz(id);
    setFull((m) => ({ ...m, [id]: q }));
    return q;
  };

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
      cur.has(qid) ? cur.delete(qid) : cur.add(qid);
      return { ...m, [quizId]: cur };
    });

  const exportNow = async () => {
    const ids = [...picked];
    if (!ids.length) return toast('Hãy chọn ít nhất một bộ đề.', 'error');
    try {
      setBusy('Đang chuẩn bị tệp…');
      const sel = [];
      for (const id of ids) {
        const q = await loadFull(id);
        const chosen = qSel[id];
        // bộ đề đã mở để chọn câu thì chỉ lấy các câu được tích; chưa mở thì lấy tất cả
        const questionIds = chosen && chosen.size !== q.questions.length ? [...chosen] : undefined;
        if (questionIds && !questionIds.length) continue;
        sel.push({ quiz: q, questionIds });
      }
      const cat: Catalog = (await api.getCatalog().catch(() => null)) ?? { subjects: [] };
      const file = await buildShare(sel, cat, title.trim() || 'Bộ đề chia sẻ', { media: withMedia, onProgress: (t) => setBusy(t) });
      downloadBlob(shareFileName(), new Blob([JSON.stringify(file)], { type: 'application/json' }));
      toast(`Đã xuất ${file.quizzes.length} bộ đề. Gửi tệp này cho giáo viên khác để họ nhập.`, 'ok');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Chia sẻ bộ đề hoặc câu hỏi" onClose={onClose} wide footer={
      <button className="btn primary" onClick={exportNow} disabled={!picked.size || !!busy}><Download size={18} /> {busy ?? `Xuất tệp chia sẻ (${picked.size} bộ đề)`}</button>
    }>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>Tích các bộ đề muốn chia sẻ. Bấm <b>Chọn câu</b> để tích riêng từng câu. Tệp .json tải về có thể gửi cho giáo viên khác để họ nhập vào lớp và môn của mình.</p>
        <label className="field"><span>Tên tệp chia sẻ (ghi trong tệp)</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} /></label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={withMedia} onChange={(e) => setWithMedia(e.target.checked)} /> Kèm ảnh và âm thanh trong câu hỏi (tệp lớn hơn nhưng người nhận không mất hình)</label>
        <div className="stack" style={{ gap: 6, maxHeight: '50vh', overflow: 'auto' }}>
          {items.map((q) => {
            const isOpen = open === q.id;
            const f = full[q.id];
            const chosen = qSel[q.id];
            return (
              <div key={q.id} className="card" style={{ padding: 10 }}>
                <div className="row between" style={{ gap: 8 }}>
                  <label className="row" style={{ gap: 8, minWidth: 0 }}>
                    <input type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q.id)} aria-label={`Chia sẻ ${q.title}`} />
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><b>{q.title}</b> <span className="muted small">· {q.question_count} câu{q.paper_period ? ' · đề thi' : ''}</span></span>
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

/** Nhập: chọn tệp chia sẻ, rồi chọn lớp và môn sẽ nhận các bộ đề. */
export function ShareImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (ids: string[]) => void }) {
  const toast = useToast();
  const [file, setFile] = useState<ShareFile | null>(null);
  const [name, setName] = useState('');
  const [catalog, setCatalog] = useState<Catalog>({ subjects: [] });
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.getCatalog().then((c) => setCatalog(c ?? { subjects: [] })).catch(() => setCatalog({ subjects: [] }));
  }, []);

  const grades = useMemo(() => {
    const g = gradesOf(catalog);
    return g.length ? g : DEFAULT_GRADES;
  }, [catalog]);
  const subjectNames = useMemo(() => subjectsOfGrade(catalog, grade).map((s) => s.name), [catalog, grade]);

  const choose = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const parsed = parseShare(await f.text());
      setFile(parsed);
      setName(f.name);
      // gợi ý lớp và môn theo bộ đề đầu tiên trong tệp
      const first = parsed.quizzes[0];
      const g = first.grade && grades.includes(first.grade) ? first.grade : grades[0];
      setGrade(g);
      setSubject(first.subject || '');
    } catch (e) {
      setFile(null);
      toast((e as Error).message, 'error');
    }
  };

  const run = async () => {
    if (!file) return;
    try {
      setBusy('Đang nhập…');
      const ids = await importShare(file, grade, subject, { onProgress: (t) => setBusy(t) });
      toast(`Đã nhập ${ids.length} bộ đề vào ${grade} · ${subject.trim()}.`, 'ok');
      onDone(ids);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const ready = !!file && !!grade && !!subject.trim();
  return (
    <Modal title="Nhập bộ đề chia sẻ" onClose={onClose} wide footer={
      <button className="btn primary" onClick={run} disabled={!ready || !!busy}><Check size={18} /> {busy ?? (file ? `Nhập ${file.quizzes.length} bộ đề` : 'Nhập')}</button>
    }>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>Chọn tệp .json do giáo viên khác chia sẻ, rồi chọn <b>lớp</b> và <b>môn</b> để đặt các bộ đề vào. Chương và bài trong tệp được giữ nguyên.</p>
        <button className="btn" onClick={choose} disabled={!!busy}><Upload size={18} /> {file ? 'Chọn tệp khác' : 'Chọn tệp chia sẻ (.json)'}</button>
        {file && (
          <>
            <div className="row" style={{ gap: 8 }}><FileJson size={18} /> <span className="small" style={{ overflowWrap: 'anywhere' }}>{name} · {file.title} · {file.quizzes.length} bộ đề</span></div>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {file.quizzes.map((q, i) => <li key={i}>{q.title} · {q.questions.length} câu{q.chapter ? ` · ${q.chapter}` : ''}{q.lesson ? ` › ${q.lesson}` : ''}</li>)}
            </ul>
            {file.media_missing?.length ? <p className="small" style={{ color: 'var(--danger, #b42318)', margin: 0 }}>Một số ảnh, âm thanh không được đóng gói vào tệp ({file.media_missing.length}). Các câu đó có thể thiếu hình.</p> : null}
            <label className="field"><span>Lớp nhận bộ đề</span>
              <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
                {grades.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="field"><span>Môn học</span>
              <input className="input" list="share-subjects" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="VD: Tin học" maxLength={80} />
              <datalist id="share-subjects">{subjectNames.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            <p className="muted small" style={{ margin: 0 }}>Môn đã có trong lớp này sẽ được dùng lại; chưa có thì phần mềm tạo môn mới.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
