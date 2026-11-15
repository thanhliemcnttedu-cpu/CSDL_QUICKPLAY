import { useState } from 'react';
import { FileUp, Sparkles, Wand2, AlertTriangle, Trash2, ClipboardPaste, FileCheck2, CircleDot, ListChecks, Eye, TextCursorInput, ListOrdered, Link2, MessageSquareText, FileDown, ClipboardList } from 'lucide-react';
import type { Question, QuestionType, Quiz } from '../lib/types';
import { extractText, hasImportedImages, parseQuestions, resolveImportedImages } from '../lib/importer';
import { buildWordTemplate } from '../lib/wordTemplate';
import { formToQuestions, isGoogleFormUrl } from '../lib/googleForm';
import { compressImage, uploadFile } from '../lib/media';
import { loadSettings, scriptUrlFromLink } from '../lib/settings';
import { downloadBlob } from '../lib/xlsx';
import { aiItemsToQuestions, buildPrompt, extractJsonArray, LEVEL_LABELS, runAi, type Level } from '../lib/ai';
import { api } from '../lib/api';
import { COMPOSER_TYPES, newQuiz, SUBJECTS, TYPE_LABELS } from '../lib/factory';
import { htmlToText } from '../lib/util';
import { Modal, useToast } from './ui';
import { pickFile } from './MediaTools';

const ACCEPT = '.docx,.pdf,.pptx,.xlsx,.csv,.txt,.doc,.xls,.ppt'; // .doc/.xls/.ppt: nhận để báo cách đổi sang kiểu mới, không âm thầm chặn
const TYPE_ICON: Record<string, typeof CircleDot> = {
  single_choice: CircleDot, multiple_select: ListChecks, true_false: Eye, fill_blank: TextCursorInput,
  reorder: ListOrdered, matching: Link2, oral: MessageSquareText,
};

/** exact: giữ nguyên tài liệu, không AI · exact_ai: giữ nguyên, AI bóc tách · generate: AI tự sinh câu hỏi mới */
type Way = 'exact' | 'exact_ai' | 'generate' | 'gform';
const WAYS: { id: Way; icon: typeof Wand2; title: string; desc: string }[] = [
  { id: 'exact', icon: FileCheck2, title: 'Giữ nguyên tài liệu', desc: 'Lấy đúng từng câu hỏi và đáp án có trong tệp. Không cần AI, chạy ngay trên máy.' },
  { id: 'exact_ai', icon: Wand2, title: 'Giữ nguyên – AI bóc tách', desc: 'Cho tệp trình bày lộn xộn: AI tách câu, phương án, đáp án nhưng giữ nguyên 100% câu chữ.' },
  { id: 'generate', icon: Sparkles, title: 'AI tự sinh câu hỏi', desc: 'Từ giáo án/bài học: AI soạn câu hỏi mới theo các dạng và mức độ thầy cô chọn.' },
  { id: 'gform', icon: ClipboardList, title: 'Từ Google Form', desc: 'Dán link Google Form thầy cô đã soạn: lấy lại câu hỏi, phương án và đáp án để dùng trong Quickplay.' },
];

interface Props {
  mode: 'file' | 'ai';
  onClose: () => void;
  onDone?: (quizId: string) => void; // tạo bộ đề mới
  onQuestions?: (qs: Question[]) => void; // thêm vào bộ đề đang mở
  /** Môn, bài của bộ đề đang mở (hoặc mục đang chọn trong thư viện) để điền sẵn, không tự gán môn khác */
  defaults?: { subject?: string; lesson?: string };
  /** Vị trí trong danh mục cho bộ đề mới (mục đang chọn ở cây thư mục) */
  place?: Partial<Quiz>;
}

export function ImportDialog({ mode, onClose, onDone, onQuestions, defaults, place }: Props) {
  const toast = useToast();
  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<{ questions: Question[]; warnings: string[] } | null>(null);
  const [way, setWay] = useState<Way>(mode === 'ai' ? 'generate' : 'exact');
  const [count, setCount] = useState(10);
  const [level, setLevel] = useState<Level>('thong_hieu');
  const [grade, setGrade] = useState('');
  // Không tự gán môn: để trống tới khi thầy cô chọn (trước đây mặc định "Toán học" nên bộ đề nào cũng bị ghi môn Toán)
  const [subject, setSubject] = useState(defaults?.subject ?? '');
  const [lesson, setLesson] = useState(defaults?.lesson ?? '');
  const [types, setTypes] = useState<QuestionType[]>([...COMPOSER_TYPES]);
  const [formUrl, setFormUrl] = useState('');
  const canReadForm = loadSettings().backend === 'drive' || !!scriptUrlFromLink();

  const downloadTemplate = async () => {
    try {
      downloadBlob('Quickplay-file-Word-mau.docx', await buildWordTemplate());
      toast('Đã tải file Word mẫu. Soạn đúng mẫu rồi tải lên với cách “Giữ nguyên tài liệu”.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const loadForm = async () => {
    const url = formUrl.trim();
    if (!isGoogleFormUrl(url)) return toast('Link Google Form không hợp lệ. Link có dạng https://docs.google.com/forms/d/…/edit hoặc https://forms.gle/…', 'error');
    setBusy('Đang đọc Google Form…');
    try {
      const r = formToQuestions(await api.importGoogleForm(url));
      if (!r.questions.length) throw new Error('Form này không có câu hỏi nào nhập được.');
      if (!title && r.title) setTitle(r.title);
      setResult({ questions: withMeta(r.questions), warnings: r.warnings });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const loadFile = async () => {
    const f = await pickFile(ACCEPT);
    if (!f) return;
    if (f.size > 30 * 1024 * 1024) return toast('Tệp lớn hơn 30 MB, hãy tách nhỏ tài liệu.', 'error');
    setBusy('Đang đọc tệp…');
    try {
      const text = await extractText(f);
      if (!text.trim()) throw new Error('Không tìm thấy chữ trong tệp (có thể là PDF dạng ảnh scan).');
      setSource(text);
      setFileName(f.name);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
      if (!lesson) setLesson(f.name.replace(/\.[^.]+$/, ''));
      setResult(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const withMeta = (qs: Question[]) => qs.map((q) => ({ ...q, subject: q.subject ?? (subject || undefined), lesson: q.lesson ?? (lesson.trim() || undefined) }));

  const run = async () => {
    if (way === 'gform') return loadForm();
    if (!source.trim()) return toast('Hãy chọn tệp hoặc dán nội dung trước.', 'error');
    setResult(null);
    if (way === 'exact') {
      const r = parseQuestions(source, fileName);
      if (!r.questions.length) return toast('Không nhận ra câu hỏi nào. Hãy thử "Giữ nguyên – AI bóc tách".', 'error');
      return setResult({ ...r, questions: withMeta(r.questions) });
    }
    if (way === 'generate' && !types.length) return toast('Chọn ít nhất một dạng câu hỏi.', 'error');
    setBusy(way === 'generate' ? 'AI đang soạn câu hỏi… (10–40 giây)' : 'AI đang bóc tách đề…');
    try {
      const p = buildPrompt(way === 'generate' ? 'generate' : 'extract', source, { count, types, level, grade });
      const text = await runAi(p.prompt, p.system);
      const qs = aiItemsToQuestions(extractJsonArray(text), { subject: subject || undefined, lesson: lesson.trim() || undefined });
      if (!qs.length) throw new Error('AI không tạo được câu hỏi nào từ nội dung này.');
      setResult({ questions: qs, warnings: qs.flatMap((q, i) => (q.needs_review ? [`Câu ${i + 1}: chưa xác định được đáp án đúng.`] : [])) });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!result?.questions.length) return;
    setBusy(hasImportedImages(result.questions) ? 'Đang tải hình ảnh trong tệp…' : 'Đang lưu…');
    try {
      // Ảnh nhúng trong tệp Word: nén rồi tải lên kho, thay bằng URL thật
      const questions = await resolveImportedImages(result.questions, async (blob, name) => uploadFile(await compressImage(blob), name));
      if (onQuestions) {
        setBusy('');
        return onQuestions(questions);
      }
      const q = newQuiz(title.trim() || (way === 'gform' ? 'Bộ đề từ Google Form' : 'Bộ đề từ tài liệu'));
      Object.assign(q, place ?? {}); // đặt vào mục đang chọn ở cây thư mục (nếu có)
      if (subject) q.subject = subject;
      q.questions = questions;
      const saved = await api.saveQuiz(q);
      toast(`Đã lưu ${q.questions.length} câu hỏi.`, 'ok');
      onDone?.(saved.id);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy('');
    }
  };

  const review = result?.questions.filter((q) => q.needs_review).length ?? 0;
  const byType = result ? COMPOSER_TYPES.map((t) => [t, result.questions.filter((q) => q.type === t).length] as const).filter(([, n]) => n) : [];

  return (
    <Modal
      wide
      title="Tạo câu hỏi từ tài liệu"
      onClose={onClose}
      footer={
        result ? (
          <>
            <button className="btn ghost" onClick={() => setResult(null)}>Làm lại</button>
            <button className="btn violet lg" onClick={save} disabled={!!busy}>
              {onQuestions ? `Thêm ${result.questions.length} câu vào bộ đề` : `Lưu ${result.questions.length} câu thành bộ đề mới`}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>Hủy</button>
            <button className="btn accent lg" onClick={run} disabled={!!busy || (way === 'gform' ? !formUrl.trim() || !canReadForm : !source.trim())}>
              {way === 'exact' ? <Wand2 size={20} /> : way === 'gform' ? <ClipboardList size={20} /> : <Sparkles size={20} />} {busy || (way === 'exact' ? 'Bóc tách đề' : way === 'gform' ? 'Tải câu hỏi' : 'Chạy AI')}
            </button>
          </>
        )
      }
    >
      {!result ? (
        <div className="stack" style={{ gap: 16 }}>
          <div className="alert ok" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="grow" style={{ minWidth: 220 }}>
              <b>Soạn trên Word theo file mẫu</b>
              <div className="small">Đúng mẫu thì nhập ngay đủ 7 dạng câu hỏi kèm đáp án, thời gian, điểm, hình ảnh: không cần AI, không phải sửa lại. File có sẵn lời nhắc để nhờ ChatGPT/Gemini trình bày lại bộ câu hỏi cũ theo mẫu.</div>
            </div>
            <button type="button" className="btn success" onClick={downloadTemplate}><FileDown size={18} /> Tải file Word mẫu</button>
          </div>
          {way === 'gform' ? (
            <div className="stack">
              <label className="field">
                <span><ClipboardList size={14} /> Link Google Form</span>
                <input className="input" type="url" inputMode="url" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://docs.google.com/forms/d/…/edit" />
                <small className="help">Dùng link chỉnh sửa (…/edit) của form do chính thầy cô tạo để lấy được cả đáp án đúng và điểm. Link công khai chỉ lấy được câu hỏi và phương án.</small>
              </label>
              {!canReadForm && (
                <div className="alert warn"><AlertTriangle size={20} /><div>Cần kết nối Google Drive (trang Cài đặt) để đọc Google Form: trình duyệt không được phép đọc trực tiếp trang của Google, nên việc đọc form do Apps Script của thầy cô thực hiện.</div></div>
              )}
            </div>
          ) : (
          <>
          <div className="row">
            <button className="btn primary" onClick={loadFile} disabled={!!busy}><FileUp size={18} /> Tải tài liệu lên (.docx, .pdf, .pptx, .xlsx, .csv)</button>
            {fileName && <span className="badge green">{fileName}</span>}
          </div>
          <label className="field">
            <span><ClipboardPaste size={14} /> Hoặc dán nội dung tài liệu / đề vào đây</span>
            <textarea className="input" rows={6} value={source} onChange={(e) => setSource(e.target.value)}
              placeholder={'Câu 1: Thủ đô của Việt Nam là?\nA. Huế  B. Hà Nội  C. Đà Nẵng  D. Cần Thơ\nĐáp án: B'} />
          </label>
          </>
          )}

          <div className="type-grid" role="radiogroup" aria-label="Cách tạo câu hỏi">
            {WAYS.map((w) => (
              <button key={w.id} type="button" role="radio" aria-checked={way === w.id} className="type-btn" onClick={() => setWay(w.id)}
                style={way === w.id ? { borderColor: 'var(--violet)', background: 'var(--violet-soft)' } : undefined}>
                <span className="ic" style={{ background: way === w.id ? 'var(--violet)' : '#94a3b8' }}><w.icon size={20} /></span>
                <span><b>{w.title}</b><br /><small className="muted">{w.desc}</small></span>
              </button>
            ))}
          </div>

          <div className="cmp-meta">
            {!onQuestions && (
              <label className="field"><span>Tên bộ đề</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Ôn tập Toán 5 – Chương 2" /></label>
            )}
            <label className="field"><span>Môn học</span>
              <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Không ghi môn</option>
                {subject && !SUBJECTS.includes(subject) && <option>{subject}</option>}
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="field"><span>Bài học (không bắt buộc)</span><input className="input" value={lesson} onChange={(e) => setLesson(e.target.value)} /></label>
          </div>

          {way === 'generate' && (
            <div className="stack">
              <div className="row">
                <label className="field"><span>Số câu</span><input className="input" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value))))} /></label>
                <label className="field"><span>Mức độ nhận thức</span>
                  <select className="input" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                    {Object.entries(LEVEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="field grow"><span>Lớp (không bắt buộc)</span><input className="input" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="VD: lớp 6" /></label>
              </div>
              <span className="cmp-label">Dạng câu hỏi AI được dùng</span>
              <div className="cmp-tabs" style={{ padding: 0, border: 0 }}>
                {COMPOSER_TYPES.map((t) => {
                  const Ic = TYPE_ICON[t];
                  const on = types.includes(t);
                  return (
                    <button key={t} type="button" role="checkbox" aria-checked={on} className={`cmp-tab ${on ? 'on' : ''}`}
                      onClick={() => setTypes((x) => (on ? x.filter((y) => y !== t) : [...x, t]))}>
                      <Ic size={20} /> {TYPE_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {way !== 'exact' && way !== 'gform' && <p className="help" style={{ margin: 0 }}>AI dùng Google Gemini (gói miễn phí). Khóa API dán ở trang Cài đặt → Trí tuệ nhân tạo (bấm Lưu khóa để kiểm tra). Luôn kiểm tra lại câu hỏi do AI tạo trước khi dùng.</p>}
        </div>
      ) : (
        <div className="stack">
          <div className={`alert ${review ? 'warn' : 'ok'}`}>
            {review ? <AlertTriangle size={20} /> : null}
            <div>
              Nhận được <b>{result.questions.length}</b> câu hỏi: {byType.map(([t, n]) => `${n} ${TYPE_LABELS[t]}`).join(' · ')}.{' '}
              {review ? <>Có <b>{review}</b> câu tô vàng thiếu đáp án – bấm <b>Sửa</b> trong bộ đề để bổ sung.</> : 'Tất cả câu đã có đáp án.'}
              {result.warnings.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary>Chi tiết ({result.warnings.length})</summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </details>
              )}
            </div>
          </div>
          <ol className="stack" style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
            {result.questions.map((q, i) => (
              <li key={q.id} className="card tight" style={q.needs_review ? { background: 'var(--warn-bg)' } : undefined}>
                <div className="row between">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="qnum">{i + 1}</span>
                    <span className="badge purple">{TYPE_LABELS[q.type]}</span>
                    {q.needs_review && <span className="badge amber"><AlertTriangle size={12} /> Thiếu đáp án</span>}
                  </div>
                  <button className="btn icon sm danger" aria-label={`Bỏ câu ${i + 1}`} onClick={() => setResult({ ...result, questions: result.questions.filter((x) => x.id !== q.id) })}><Trash2 size={16} /></button>
                </div>
                <p style={{ margin: '8px 0 4px', fontWeight: 700 }}>{htmlToText(q.stem.text).replace(/\[blank_\d+\]/g, '[___]')}</p>
                {q.options.length > 0 && (
                  <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
                    {q.options.map((o) => (
                      <li key={o.option_id} style={o.is_correct ? { color: 'var(--success)', fontWeight: 800 } : undefined}>
                        {o.side === 'right' ? '→ ' : ''}{q.type === 'reorder' ? `${(o.order_index ?? 0) + 1}. ` : ''}{htmlToText(o.text)} {o.is_correct ? '✓' : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {q.type === 'fill_blank' && (
                  <small className="muted">Từ đúng: {(q.blanks ?? []).map((b) => b.accepted.join(' / ') || '—').join('; ')}{q.distractors?.length ? ` · Từ gây nhiễu: ${q.distractors.join(', ')}` : ''}</small>
                )}
                {q.type === 'oral' && q.explanation && <small className="muted">Gợi ý đáp án: {q.explanation}</small>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  );
}
