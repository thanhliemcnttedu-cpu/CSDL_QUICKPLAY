// Chơi thử: bộ câu hỏi mặc định "Trải nghiệm Quickplay" với đủ 7 dạng. Không đăng nhập, không tạo phòng, không gọi máy chủ.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, GraduationCap, Lightbulb, Pencil, RotateCcw, X } from 'lucide-react';
import type { Question, Quiz } from '../lib/types';
import { gradeRatio, type Answer } from '../lib/grading';
import { TYPE_LABELS, TYPE_USE_CASES, demoQuiz } from '../lib/factory';
import { sfx } from '../lib/sound';
import { PlayQuestion } from '../components/PlayQuestion';
import { Wordmark } from '../components/Logo';
import { AppFooter } from '../components/AppFooter';
import '../demo.css';

type Result = { answer: Answer; ratio: number | null }; // ratio null = câu trả lời miệng đang chờ tự chấm

const label = (q: Question) => {
  if (q.type !== 'fill_blank') return TYPE_LABELS[q.type];
  const mode = q.fill_mode ?? ((q.distractors ?? []).length ? 'bank' : 'type');
  return mode === 'menu' ? 'Điền chỗ trống (chọn từ menu)' : mode === 'bank' ? 'Điền chỗ trống (chọn từ kho từ)' : 'Điền chỗ trống (gõ chữ)';
};

export default function Demo() {
  const quiz = useMemo(demoQuiz, []);
  return <Tryout quiz={quiz} />;
}

/**
 * Chơi thử một bộ câu hỏi ngay trên máy, không tạo phòng.
 * previewId có giá trị = giáo viên chơi thử bộ câu hỏi của mình với vai trò học sinh (có nút quay lại sửa).
 */
export function Tryout({ quiz, previewId, readOnly }: { quiz: Quiz; previewId?: string; readOnly?: boolean }) {
  const qs = quiz.questions;
  // readOnly: bộ câu hỏi mặc định dựng sẵn trong phần mềm, không sửa được nên các nút quay lại dẫn về thư viện
  const edit = previewId ? (readOnly ? '/teacher' : `/teacher/edit/${previewId}`) : '';
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [round, setRound] = useState(0); // đổi để dựng lại câu khi chơi lại
  const done = idx >= qs.length;
  const q = qs[idx];
  const res = results[idx];
  const answered = Object.values(results).filter((r) => r.ratio !== null).length;
  const correct = Object.values(results).filter((r) => r.ratio === 1).length;

  // Trên điện thoại phần phản hồi nằm dưới các ô đáp án: cuộn tới để học sinh thấy ngay
  useEffect(() => {
    if (res) document.querySelector('.demo-fb, .demo-oral')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [res]);

  // Thanh chọn nhanh cuộn ngang: luôn đưa dạng đang chơi vào tầm nhìn
  useEffect(() => {
    document.querySelector('.demo-chip.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [idx]);

  const submit = (a: Answer) => {
    if (!q || res) return;
    if (a.kind === 'oral') return setResults((r) => ({ ...r, [idx]: { answer: a, ratio: null } }));
    const ratio = gradeRatio(q, a);
    ratio === 1 ? sfx.correct() : sfx.wrong();
    setResults((r) => ({ ...r, [idx]: { answer: a, ratio } }));
  };
  const selfGrade = (ok: boolean) => {
    ok ? sfx.correct() : sfx.wrong();
    setResults((r) => ({ ...r, [idx]: { answer: { kind: 'oral' }, ratio: ok ? 1 : 0 } }));
  };
  const go = (i: number) => {
    sfx.whoosh();
    setIdx(i);
    window.scrollTo({ top: 0 });
  };
  const restart = () => {
    setResults({});
    setRound((n) => n + 1);
    go(0);
  };
  const retry = () => {
    setResults((r) => {
      const { [idx]: _drop, ...rest } = r;
      return rest;
    });
    setRound((n) => n + 1);
  };

  return (
    <div className="play-bg">
      <div className="play-wrap demo">
        <header className="demo-top">
          {previewId
            ? <Link to={edit} className="btn ghost sm"><ArrowLeft size={16} /> {readOnly ? 'Về thư viện' : 'Quay lại sửa bộ câu hỏi'}</Link>
            : <Link to="/" className="btn ghost sm" aria-label="Về trang chủ"><ArrowLeft size={16} /> Trang chủ</Link>}
          <Wordmark size={28} />
          <span className="grow" />
          <span className="badge blue">{previewId ? `Chơi thử với vai trò học sinh · ${quiz.title}` : 'Chơi thử · không cần đăng nhập'}</span>
          <button className="btn ghost sm" onClick={restart}><RotateCcw size={16} /> Chơi lại</button>
        </header>

        <nav className="demo-nav" aria-label="Chọn nhanh dạng câu hỏi">
          {qs.map((x, i) => {
            const r = results[i];
            const state = r?.ratio === 1 ? 'ok' : r && r.ratio !== null ? 'bad' : '';
            return (
              <button key={x.id} type="button" className={`demo-chip ${i === idx ? 'on' : ''} ${state}`} onClick={() => go(i)} aria-current={i === idx ? 'step' : undefined}>
                <b>{i + 1}</b> {label(x)}
                {state === 'ok' && <Check size={14} aria-label="đã trả lời đúng" />}
                {state === 'bad' && <X size={14} aria-label="đã trả lời chưa đúng" />}
              </button>
            );
          })}
        </nav>
        <div className="demo-progress" role="progressbar" aria-valuemin={0} aria-valuemax={qs.length} aria-valuenow={answered} aria-label={`Đã làm ${answered}/${qs.length} câu`}>
          <i style={{ width: `${(answered / qs.length) * 100}%` }} />
        </div>

        {done ? (
          <section className="card demo-end">
            <div className="demo-score">{correct}<span>/{qs.length}</span></div>
            <h1 style={{ margin: 0 }}>{correct === qs.length ? 'Tuyệt vời, đúng tất cả!' : 'Đã chơi thử xong!'}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {previewId
                ? readOnly
                  ? 'Thầy cô vừa chơi thử bộ câu hỏi mặc định của Quickplay đúng như học sinh sẽ thấy. Về thư viện, bấm "Dùng bộ này" để chép vào thư viện của mình rồi tổ chức cho lớp. Kết quả chơi thử không được lưu.'
                  : 'Thầy cô vừa xem bộ câu hỏi đúng như học sinh sẽ thấy. Câu nào bố trí, định dạng hay đáp án chưa hợp lý, hãy quay lại sửa rồi chơi thử lại. Kết quả chơi thử không được lưu.'
                : 'Thầy cô vừa trải nghiệm đủ 7 dạng câu hỏi của Quickplay. Khi tổ chức thật, học sinh vào bằng mã PIN, đường link hoặc mã QR, và có bảng xếp hạng, báo cáo từng câu.'}
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              {previewId
                ? readOnly
                  ? <Link to="/teacher" className="btn primary lg"><ArrowLeft size={20} /> Về thư viện</Link>
                  : <><Link to={edit} className="btn primary lg"><Pencil size={20} /> Quay lại sửa bộ câu hỏi</Link><Link to="/teacher" className="btn ghost lg">Về thư viện để giao bài</Link></>
                : <Link to="/teacher" className="btn primary lg"><GraduationCap size={20} /> Dành cho giáo viên: tạo bộ câu hỏi của tôi</Link>}
              <button className="btn ghost lg" onClick={restart}><RotateCcw size={18} /> Chơi lại</button>
            </div>
          </section>
        ) : (
          <>
            <div className="demo-info">
              <span className="badge blue">Câu {idx + 1}/{qs.length} · {label(q)}</span>
              {!previewId && <span className="demo-use"><Lightbulb size={16} aria-hidden /><span><b>Dạng này dùng khi nào:</b> {TYPE_USE_CASES[q.type]}</span></span>}
              <span className="muted small">
                {previewId ? `Khi chơi thật: ${q.time_limit_seconds} giây, ${q.points} điểm. Ở đây không tính giờ.` : `Thời gian gợi ý khi chơi thật: ${q.time_limit_seconds} giây. Ở đây không tính giờ.`}
                {previewId && !readOnly && <> <Link to={edit}>Sửa câu này</Link></>}
              </span>
            </div>

            <PlayQuestion key={`${round}-${q.id}`} q={q} seed={idx * 31 + round + 7} shuffleOptions={false} disabled={!!res} reveal={!!res} chosen={res?.answer ?? null} onSubmit={submit} />

            {res && res.ratio === null && (
              <section className="card demo-oral" role="status">
                <p style={{ margin: 0 }}>Khi chơi thật, giáo viên nghe em trả lời rồi bấm chấm <b>Đúng / Sai</b> trên bảng điều khiển. Ở bản chơi thử, em tự chấm nhé.</p>
                {q.explanation && <p className="demo-exp"><b>Gợi ý đáp án:</b> {q.explanation}</p>}
                <div className="row">
                  <button className="btn success" onClick={() => selfGrade(true)}><Check size={18} /> Em trả lời đúng</button>
                  <button className="btn danger" onClick={() => selfGrade(false)}><X size={18} /> Em trả lời chưa đúng</button>
                </div>
              </section>
            )}
            {res && res.ratio !== null && (
              <section className={`demo-fb ${res.ratio === 1 ? 'ok' : 'bad'}`} role="status">
                <div className="demo-fb-head">
                  {res.ratio === 1 ? <Check size={26} aria-hidden /> : <X size={26} aria-hidden />}
                  {res.ratio === 1 ? 'Chính xác!' : res.ratio > 0 ? `Đúng một phần (${Math.round(res.ratio * 100)}%)` : 'Chưa đúng'}
                </div>
                {q.explanation && q.type !== 'oral' && <p className="demo-exp"><b>Giải thích:</b> {q.explanation}</p>}
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  {res.ratio !== 1 && <button className="btn ghost" onClick={retry}><RotateCcw size={16} /> Làm lại câu này</button>}
                  <button className="btn primary lg" onClick={() => go(idx + 1)}>{idx + 1 >= qs.length ? 'Xem tổng kết' : 'Câu tiếp'} <ArrowRight size={18} /></button>
                </div>
              </section>
            )}
            {!res && (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn ghost sm" onClick={() => go(idx + 1)}>Câu hỏi tiếp theo <ArrowRight size={14} /></button>
              </div>
            )}
          </>
        )}
      </div>
      <AppFooter compact />
    </div>
  );
}
