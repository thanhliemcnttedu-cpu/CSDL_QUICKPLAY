import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Copy, Trash2, ArrowUp, ArrowDown, AlertTriangle, CheckCircle2, Pencil, Play, Loader2, Sparkles, Coins, Image as ImageIcon, Music, Youtube, Clock, Eye, Upload, Layers, ClipboardList } from 'lucide-react';
import type { Question, QuestionType, Quiz } from '../lib/types';
import { api } from '../lib/api';
import { COMPOSER_TYPES, TYPE_LABELS, DEFAULT_QUIZ_TITLE } from '../lib/factory';
import { validateQuestion } from '../lib/grading';
import { htmlToText, uid } from '../lib/util';
import { QuestionComposer } from '../components/QuestionComposer';
import { HostSetupDialog } from '../components/HostSetupDialog';
import { ImportDialog } from '../components/ImportDialog';
import { QuestionBankDialog } from '../components/QuestionBankDialog';
import { PaperFields } from '../components/PaperFields';
import { suggestCode } from '../lib/examPaper';
import { Spinner, useToast, askConfirm } from '../components/ui';
import { PlacementPicker } from '../components/CatalogTree';
import { CoverPicker } from '../components/CoverPicker';
import { emptyCatalog, resolve } from '../lib/catalog';
import type { Catalog } from '../lib/types';

const BULK_TIMES = [10, 15, 20, 30, 45, 60, 90, 120];
const fmtTime = (t: number) => (t < 60 ? `${t} giây` : t % 60 ? `${t} giây` : `${t / 60} phút`);

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
type ComposerState = { mode: 'new'; type: QuestionType; at: number } | { mode: 'edit'; q: Question };

export default function Editor() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [save, setSave] = useState<SaveState>('saved');
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [hosting, setHosting] = useState(false);
  const [importing, setImporting] = useState<null | 'file' | 'ai'>(null);
  const [banking, setBanking] = useState(false); // lấy câu hỏi từ các bộ đề khác trong thư viện
  const [paperCodes, setPaperCodes] = useState<string[]>([]); // mã đề đã có (để gợi ý mã không trùng)
  useEffect(() => {
    api.listQuizzes().then((l) => setPaperCodes(l.filter((x) => x.id !== id && x.paper_code).map((x) => x.paper_code!))).catch(() => {});
  }, [id]);
  const [bulkTime, setBulkTime] = useState(30);
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  useEffect(() => {
    api.getCatalog().then(setCatalog).catch(() => {});
  }, []);
  const timer = useRef<number>();
  const latest = useRef<Quiz | null>(null);

  useEffect(() => {
    api.getQuiz(id!).then((q) => {
      setQuiz(q);
      latest.current = q;
    }).catch((e) => {
      toast((e as Error).message, 'error');
      nav('/teacher');
    });
  }, [id, nav, toast]);

  const persist = useCallback(async () => {
    const q = latest.current;
    if (!q) return;
    setSave('saving');
    try {
      await api.saveQuiz(q);
      setSave((s) => (latest.current === q ? 'saved' : s));
    } catch (e) {
      setSave('error');
      toast('Chưa lưu được: ' + (e as Error).message, 'error');
    }
  }, [toast]);

  // Tự động lưu sau 1,2 giây
  const update = (q: Quiz) => {
    setQuiz(q);
    latest.current = q;
    setSave('dirty');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(persist, 1200);
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === 'dirty' || save === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      if (latest.current) api.saveQuiz(latest.current).catch(() => {});
    }
  }, []);

  const lessons = useMemo(() => [...new Set((quiz?.questions ?? []).map((q) => q.lesson).filter(Boolean) as string[])], [quiz]);
  // Hook phải đứng trước mọi lệnh return sớm
  const [perPoints, setPerPoints] = useState('10');
  const [allPoints, setAllPoints] = useState('10');
  if (!quiz) return <Spinner />;
  const qs = quiz.questions;
  const setQs = (questions: Question[]) => update({ ...latest.current!, questions });
  const last = qs[qs.length - 1];

  const onSaveQuestion = (q: Question) => {
    const cur = latest.current!.questions;
    if (composer?.mode === 'edit' || cur.some((x) => x.id === q.id)) {
      setQs(cur.map((x) => (x.id === q.id ? q : x)));
    } else {
      const at = composer?.mode === 'new' ? composer.at : cur.length;
      setQs([...cur.slice(0, at), q, ...cur.slice(at)]);
      if (composer?.mode === 'new') setComposer({ ...composer, at: at + 1 });
    }
    toast('Đã lưu câu hỏi.', 'ok');
  };
  const move = (i: number, d: number) => {
    const arr = qs.slice();
    [arr[i], arr[i + d]] = [arr[i + d], arr[i]];
    setQs(arr);
  };
  const dup = (i: number) => {
    const copy = JSON.parse(JSON.stringify(qs[i])) as Question;
    copy.id = uid('q');
    copy.options = copy.options.map((o) => ({ ...o, option_id: uid('o') }));
    setQs([...qs.slice(0, i + 1), copy, ...qs.slice(i + 1)]);
  };
  const del = async (i: number) => (await askConfirm(`Xóa câu ${i + 1}?`)) && setQs(qs.filter((_, k) => k !== i));
  const applyTimeAll = async () => {
    const cur = latest.current!.questions;
    if (!cur.length) return;
    if (!(await askConfirm(`Đặt thời gian suy nghĩ ${fmtTime(bulkTime)} cho tất cả ${cur.length} câu hỏi của bộ đề này?`))) return;
    setQs(cur.map((x) => ({ ...x, time_limit_seconds: bulkTime })));
    toast(`Đã áp dụng ${fmtTime(bulkTime)} cho ${cur.length} câu hỏi.`, 'ok');
  };
  // Điểm: giáo viên đặt cho từng câu (bấm Sửa), hoặc đặt nhanh cho cả bộ đề ở đây
  const totalPoints = Math.round(qs.reduce((t, x) => t + (x.points || 0), 0) * 100) / 100;
  const applyPointsEach = () => {
    const cur = latest.current!.questions;
    const v = Math.round(Number(perPoints) * 100) / 100;
    if (!cur.length || !Number.isFinite(v) || v <= 0 || v > 100000) return toast('Điểm mỗi câu là một số lớn hơn 0.', 'error');
    setQs(cur.map((x) => ({ ...x, points: v })));
    toast(`Đã đặt ${v} điểm cho mỗi câu. Tổng cả bài: ${Math.round(v * cur.length * 100) / 100} điểm.`, 'ok');
  };
  const applyPointsTotal = () => {
    const cur = latest.current!.questions;
    const total = Math.round(Number(allPoints) * 100) / 100;
    if (!cur.length || !Number.isFinite(total) || total <= 0 || total > 1000000) return toast('Tổng điểm cả bài là một số lớn hơn 0.', 'error');
    // chia đều, làm tròn 2 chữ số; phần lẻ dồn vào câu cuối để tổng luôn đúng
    const each = Math.floor((total / cur.length) * 100) / 100;
    const lastOne = Math.round((total - each * (cur.length - 1)) * 100) / 100;
    setQs(cur.map((x, i) => ({ ...x, points: i === cur.length - 1 ? lastOne : each })));
    toast(`Đã chia đều ${total} điểm cho ${cur.length} câu (mỗi câu ${each} điểm${lastOne !== each ? `, câu cuối ${lastOne} điểm` : ''}).`, 'ok');
  };
  // Gán nhanh thời gian cho một câu ngay trong danh sách, không cần mở hộp Sửa
  const setTimeOf = (qid: string, t: number) => setQs(latest.current!.questions.map((x) => (x.id === qid ? { ...x, time_limit_seconds: t } : x)));
  const sameTime = qs.length > 0 && qs.every((x) => x.time_limit_seconds === qs[0].time_limit_seconds);
  const invalid = qs.filter((x) => x.needs_review || validateQuestion(x).length).length;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row between">
        <div className="row grow">
          <Link to="/teacher" className="btn icon ghost" aria-label="Về thư viện"><ArrowLeft size={20} /></Link>
          <input className="input grow" style={{ fontSize: '1.3rem', fontWeight: 800, maxWidth: 560 }} value={quiz.title} onChange={(e) => update({ ...quiz, title: e.target.value })} aria-label="Tên bộ đề" />
        </div>
        <div className="row">
          <span className="small muted row" style={{ gap: 6 }} aria-live="polite">
            {save === 'saving' && <><Loader2 size={16} className="spin" /> Đang lưu…</>}
            {save === 'saved' && <><CheckCircle2 size={16} color="var(--success)" /> Đã lưu</>}
            {save === 'dirty' && 'Có thay đổi…'}
            {save === 'error' && <span className="error-text">Lỗi lưu – <button className="btn sm" onClick={persist}>Thử lại</button></span>}
          </span>
          <button className="btn" disabled={!qs.length} title="Xem bộ câu hỏi đúng như học sinh sẽ thấy" onClick={async () => { await persist(); nav(`/teacher/preview/${id}`); }}><Eye size={18} /> Chơi thử như học sinh</button>
          <button className="btn success" disabled={!qs.length} onClick={async () => { await persist(); setHosting(true); }}><Play size={18} /> Tổ chức</button>
        </div>
      </div>
      <div className="row">
        <PlacementPicker catalog={catalog} value={quiz} legacySubject={quiz.subject} legacyGrade={quiz.grade} onChange={(p) => {
          // Chọn Bài: tên bộ đề đổi theo tên bài, miễn là thầy cô chưa tự đặt tên khác (tên còn mặc định, để trống, hoặc đang là tên bài cũ)
          const oldLesson = resolve(catalog, quiz)?.lesson?.name;
          const newLesson = resolve(catalog, p)?.lesson?.name;
          const auto = !quiz.title.trim() || quiz.title === DEFAULT_QUIZ_TITLE || quiz.title === oldLesson;
          update({ ...quiz, subject_id: p.subject_id, chapter_id: p.chapter_id, lesson_id: p.lesson_id, subject: p.subject ?? quiz.subject, grade: p.grade ?? quiz.grade, title: newLesson && auto ? newLesson : quiz.title });
        }} />
        <label className="field"><span>Chia sẻ</span>
          <select className="input" value={quiz.visibility} disabled={!!quiz.paper_period} title={quiz.paper_period ? 'Đề thi luôn để riêng tư để giữ bí mật đề' : undefined}
            onChange={(e) => update({ ...quiz, visibility: e.target.value as Quiz['visibility'] })}>
            <option value="private">Riêng tư</option>
            <option value="public">Công khai (thư viện chung)</option>
          </select>
        </label>
        {invalid > 0 && <span className="badge amber" style={{ alignSelf: 'flex-end', marginBottom: 10 }}><AlertTriangle size={14} /> {invalid} câu cần hoàn thiện</span>}
      </div>
      <div className={quiz.paper_period ? 'paper-box' : 'card tight'}>
        <label className="switch" style={{ fontWeight: 800 }}>
          <input type="checkbox" checked={!!quiz.paper_period} onChange={(e) => {
            const on = e.target.checked;
            update(on
              ? { ...quiz, paper_period: 'ck1', paper_code: quiz.paper_code || suggestCode(quiz.subject, quiz.grade, 'ck1', paperCodes), visibility: 'private' }
              : { ...quiz, paper_period: undefined, paper_code: undefined });
          }} />
          <ClipboardList size={18} /> Đây là đề thi (có thời điểm kiểm tra và mã đề, nằm ở mục Đề thi của thư viện)
        </label>
        {quiz.paper_period && (
          <PaperFields compact placeFromQuiz catalog={catalog} usedCodes={paperCodes}
            value={{ grade: quiz.grade ?? '', subject: quiz.subject ?? '', period: quiz.paper_period, code: quiz.paper_code ?? '' }}
            onChange={(v) => update({ ...latest.current!, grade: v.grade || undefined, subject: v.subject || undefined, paper_period: v.period, paper_code: v.code })} />
        )}
      </div>

      <div className="card">
        <CoverPicker value={quiz.cover_url} title={quiz.title} onChange={(url) => update({ ...latest.current!, cover_url: url })} />
      </div>

      <div className="card stack">
        <div className="row between">
          <h2 style={{ margin: 0 }}>{qs.length} câu hỏi</h2>
          <div className="row">
            <button className="btn" onClick={() => setImporting('file')} title="Tải tệp Word, PDF, PowerPoint, Excel, CSV lên để thêm câu hỏi vào bộ đề này"><Upload size={18} /> Tải tệp lên</button>
            <button className="btn" onClick={() => setBanking(true)} title="Chép câu hỏi từ các bộ đề khác trong thư viện vào bộ đề này"><Layers size={18} /> Lấy từ kho câu hỏi</button>
            <button className="btn accent" onClick={() => setImporting('ai')}><Sparkles size={18} /> AI sinh thêm</button>
            <button className="btn violet" onClick={() => setComposer({ mode: 'new', type: last?.type && COMPOSER_TYPES.includes(last.type) ? last.type : 'single_choice', at: qs.length })}>
              <Plus size={18} /> Thêm câu hỏi
            </button>
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="small muted">Thêm nhanh:</span>
          {COMPOSER_TYPES.map((t) => (
            <button key={t} className="btn sm ghost" onClick={() => setComposer({ mode: 'new', type: t, at: qs.length })}>{TYPE_LABELS[t]}</button>
          ))}
        </div>
        {qs.length > 0 && (
          <div className="row time-all" role="group" aria-label="Điểm cho cả bộ đề">
            <Coins size={18} color="var(--primary)" aria-hidden />
            <b>Điểm</b>
            <span className="badge blue">Tổng cả bài: {totalPoints} điểm</span>
            <label className="row" style={{ gap: 6 }}>Mỗi câu
              <input className="input" type="number" min={0.25} step="any" style={{ width: 90 }} value={perPoints} onChange={(e) => setPerPoints(e.target.value)} aria-label="Điểm mỗi câu" />
            </label>
            <button className="btn sm" onClick={applyPointsEach}>Áp dụng cho {qs.length} câu</button>
            <label className="row" style={{ gap: 6 }}>hoặc tổng cả bài
              <input className="input" type="number" min={1} step="any" style={{ width: 90 }} value={allPoints} onChange={(e) => setAllPoints(e.target.value)} aria-label="Tổng điểm cả bài" />
            </label>
            <button className="btn sm" onClick={applyPointsTotal}>Chia đều</button>
            <span className="small muted">Muốn đặt điểm riêng một câu, bấm Sửa ở câu đó. Điểm thưởng (trả lời nhanh, chuỗi câu đúng) được cộng riêng, không tính vào tổng này.</span>
          </div>
        )}
        {qs.length > 0 && (
          <div className="row time-all" role="group" aria-label="Thời gian suy nghĩ cho cả bộ đề">
            <Clock size={18} color="var(--primary)" aria-hidden />
            <label htmlFor="bulk-time"><b>Thời gian suy nghĩ cho tất cả câu hỏi</b></label>
            <select id="bulk-time" className="input" style={{ width: 'auto' }} value={bulkTime} onChange={(e) => setBulkTime(Number(e.target.value))}>
              {BULK_TIMES.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
            </select>
            <button className="btn primary sm" onClick={applyTimeAll}>Áp dụng cho {qs.length} câu</button>
            <span className="small muted">
              {sameTime ? `Hiện tất cả các câu đều ${fmtTime(qs[0].time_limit_seconds)}.` : 'Hiện các câu đang có thời gian khác nhau.'} Muốn đặt riêng một câu, chọn ở ô thời gian ngay trên câu đó.
            </span>
          </div>
        )}
      </div>

      {qs.length === 0 ? (
        <div className="card empty">
          <h2>Bộ đề đang trống</h2>
          <p className="muted">Soạn câu hỏi đầu tiên, hoặc tải tài liệu lên để tạo câu hỏi tự động.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn violet lg" onClick={() => setComposer({ mode: 'new', type: 'single_choice', at: 0 })}><Plus size={20} /> Soạn câu hỏi đầu tiên</button>
            <button className="btn lg" onClick={() => setImporting('file')}><Upload size={20} /> Tải tệp lên (Word, PDF, Excel…)</button>
          </div>
        </div>
      ) : (
        <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {qs.map((q, i) => {
            const errs = validateQuestion(q);
            const warn = q.needs_review || errs.length > 0;
            return (
              <li key={q.id} className={`card tight qcard ${warn ? 'warn' : ''}`}>
                <span className="qnum" style={{ width: 36, height: 36 }}>{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="badge purple">{TYPE_LABELS[q.type]}</span>
                    {q.subject && <span className="badge">{q.subject}</span>}
                    {q.lesson && <span className="badge">{q.lesson}</span>}
                    <span className="badge amber"><Coins size={12} /> {q.points} điểm</span>
                    <label className="qtime" title="Thời gian suy nghĩ của câu này">
                      <Clock size={13} aria-hidden />
                      <select value={q.time_limit_seconds} onChange={(e) => setTimeOf(q.id, Number(e.target.value))} aria-label={`Thời gian suy nghĩ của câu ${i + 1}`}>
                        {[...new Set([...BULK_TIMES, q.time_limit_seconds])].sort((a, b) => a - b).map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
                      </select>
                    </label>
                    {q.stem.image_url && <ImageIcon size={16} color="var(--muted-fg)" aria-label="Có ảnh" />}
                    {q.stem.audio_url && <Music size={16} color="var(--muted-fg)" aria-label="Có âm thanh" />}
                    {q.stem.video && <Youtube size={16} color="var(--muted-fg)" aria-label="Có video" />}
                    {warn && <span className="badge amber"><AlertTriangle size={12} /> {q.needs_review ? 'Thiếu đáp án' : errs[0]}</span>}
                  </div>
                  <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{htmlToText(q.stem.text).replace(/\[blank_\d+\]/g, '[___]') || <i className="muted">(Câu hỏi bằng ảnh / âm thanh)</i>}</p>
                  <AnswerSummary q={q} />
                </div>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <button className="btn sm vout" onClick={() => setComposer({ mode: 'edit', q })}><Pencil size={16} /> Sửa</button>
                  <button className="btn icon sm ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Chuyển câu ${i + 1} lên`}><ArrowUp size={16} /></button>
                  <button className="btn icon sm ghost" disabled={i === qs.length - 1} onClick={() => move(i, 1)} aria-label={`Chuyển câu ${i + 1} xuống`}><ArrowDown size={16} /></button>
                  <button className="btn icon sm ghost" onClick={() => dup(i)} aria-label={`Nhân bản câu ${i + 1}`}><Copy size={16} /></button>
                  <button className="btn icon sm danger" onClick={() => del(i)} aria-label={`Xóa câu ${i + 1}`}><Trash2 size={16} /></button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {composer && (
        <QuestionComposer
          key={composer.mode === 'edit' ? composer.q.id : 'new'}
          initial={composer.mode === 'edit' ? composer.q : undefined}
          defaultType={composer.mode === 'new' ? composer.type : undefined}
          lessons={lessons}
          defaults={{ subject: last?.subject ?? quiz.subject, lesson: last?.lesson, coins: last?.coins }}
          onSave={(q, next) => {
            onSaveQuestion(q);
            if (!next) setComposer(null);
          }}
          onClose={() => setComposer(null)}
        />
      )}
      {hosting && (
        <HostSetupDialog quiz={{ id: quiz.id, title: quiz.title, visibility: quiz.visibility, updated_at: quiz.updated_at, question_count: qs.length }} onClose={() => setHosting(false)} />
      )}
      {banking && (
        <QuestionBankDialog
          exclude={quiz.id}
          onClose={() => setBanking(false)}
          onPick={(add) => {
            setQs([...latest.current!.questions, ...add]);
            setBanking(false);
            toast(`Đã thêm ${add.length} câu từ kho câu hỏi vào cuối bộ đề.`, 'ok');
          }}
        />
      )}
      {importing && (
        <ImportDialog
          mode={importing}
          defaults={{ subject: quiz.subject, lesson: quiz.title }}
          onClose={() => setImporting(null)}
          onQuestions={(list) => {
            setQs([...latest.current!.questions, ...list]);
            setImporting(null);
            toast(`Đã thêm ${list.length} câu hỏi vào bộ đề.`, 'ok');
          }}
        />
      )}
    </div>
  );
}

function AnswerSummary({ q }: { q: Question }) {
  const t = (h: string) => htmlToText(h);
  switch (q.type) {
    case 'single_choice':
    case 'multiple_select':
    case 'true_false':
      return (
        <div className="opts">
          {q.options.map((o) => <span key={o.option_id} className={`wchip ${o.is_correct ? 'ok' : ''}`} style={o.is_correct ? undefined : { background: 'var(--muted)', color: 'var(--muted-fg)' }}>{t(o.text) || '[ảnh]'}</span>)}
        </div>
      );
    case 'fill_blank':
      return (
        <div className="opts">
          {(q.blanks ?? []).map((b) => <span key={b.blank_id} className="wchip ok">{b.accepted.join(' / ') || '—'}</span>)}
          {(q.distractors ?? []).map((w) => <span key={w} className="wchip">{w}</span>)}
        </div>
      );
    case 'reorder':
      return <div className="opts">{q.options.slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).map((o, i) => <span key={o.option_id} className="badge">{i + 1}. {t(o.text) || '[ảnh]'}</span>)}</div>;
    case 'matching': {
      const R = q.options.filter((o) => o.side === 'right');
      return (
        <div className="opts">
          {q.options.filter((o) => o.side === 'left').map((l) => <span key={l.option_id} className="badge green">{t(l.text) || '[ảnh]'} ↔ {t(R.find((r) => r.match_pair_id === l.match_pair_id)?.text ?? '') || '[ảnh]'}</span>)}
        </div>
      );
    }
    case 'oral':
      return q.explanation ? <small className="muted">Gợi ý: {q.explanation}</small> : null;
    default:
      return null;
  }
}
