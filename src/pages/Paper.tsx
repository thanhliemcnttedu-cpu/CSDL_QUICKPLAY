// Dạy học trên lớp – Thẻ trả lời: in thẻ, quản lý lớp, mở buổi học quét thẻ.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, KeyRound, Pencil, Plus, Printer, ScanLine, Trash2, Users } from 'lucide-react';
import { StudentCodesDialog } from '../components/StudentCodesDialog';
import type { Catalog, ClassRoom, Quiz, QuizSummary } from '../lib/types';
import { PaperPickDialog } from '../components/PaperPickDialog';
import { api } from '../lib/api';
import { QuizPicker } from '../components/QuizPicker';
import { emptyCatalog, ensurePath, pathOf } from '../lib/catalog';
import { BUILTIN_QUIZZES, builtinQuiz, isBuiltinId } from '../lib/factory';
import { uid } from '../lib/util';
import { CARD_CODES, CARD_COUNT, cardBit, cardsBackPdf, cardsPdf, type NameImage } from '../lib/paperCard';
import { isPaperQuestion, parseStudents } from '../lib/paper';
import { downloadBlob } from '../lib/xlsx';
import { Field, Modal, Spinner, useToast, askConfirm } from '../components/ui';
import '../paper.css';

/** Hình xem trước một thẻ (đúng bảng mã dùng khi in). */
export function CardPreview({ card, size = 180 }: { card: number; size?: number }) {
  const code = CARD_CODES[card - 1];
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!cardBit(code, r, c)) cells.push(<rect key={r * 4 + c} x={30 + (c + 1) * 10} y={30 + (r + 1) * 10} width={10} height={10} fill="#fff" />);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`Thẻ trả lời số ${card}: ô mã đen ở giữa, bốn cạnh ghi A, B, C, D`} className="pp-card">
      <rect width="120" height="120" rx="6" fill="#fff" />
      <rect x="30" y="30" width="60" height="60" fill="#0a1730" />
      {cells}
      <g fontFamily="var(--font-head)" fontWeight="800" fontSize="13" fill="#0a1730" textAnchor="middle">
        <text x="60" y="22">A</text>
        <text x="60" y="22" transform="rotate(90 60 60)">B</text>
        <text x="60" y="22" transform="rotate(180 60 60)">C</text>
        <text x="60" y="22" transform="rotate(270 60 60)">D</text>
        <text x="14" y="14" fontSize="8">#{card}</text>
      </g>
    </svg>
  );
}

/** Vẽ tên học sinh thành ảnh 1 bit để nhúng vào PDF (giữ đúng dấu tiếng Việt). */
function nameImage(name: string): NameImage | null {
  const H = 72;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const font = "700 50px 'Be Vietnam Pro', system-ui, sans-serif";
  ctx.font = font;
  const w = Math.min(1100, Math.ceil(ctx.measureText(name).width) + 8);
  cv.width = w;
  cv.height = H;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(name, 4, H / 2 + 2);
  const px = ctx.getImageData(0, 0, w, H).data;
  const rowBytes = Math.ceil(w / 8);
  let hex = '';
  for (let y = 0; y < H; y++)
    for (let b = 0; b < rowBytes; b++) {
      let v = 0;
      for (let k = 0; k < 8; k++) {
        const x = b * 8 + k;
        if (x < w && px[(y * w + x) * 4 + 3] > 110) v |= 0x80 >> k;
      }
      hex += (v < 16 ? '0' : '') + v.toString(16);
    }
  return { w, h: H, hex };
}

export default function Paper() {
  const nav = useNavigate();
  const toast = useToast();
  const [classes, setClasses] = useState<ClassRoom[] | null>(null);
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<null | { id?: string; name: string; text: string }>(null);
  const [classId, setClassId] = useState('');
  const [quizId, setQuizId] = useState(() => { try { return localStorage.getItem('quickplay.paperQuiz') ?? ''; } catch { return ''; } });
  const [pub, setPub] = useState<QuizSummary[]>([]);
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  useEffect(() => { try { if (quizId) localStorage.setItem('quickplay.paperQuiz', quizId); } catch { /* bỏ qua */ } }, [quizId]);
  const [usable, setUsable] = useState<{ ok: number; all: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Quiz | null>(null); // bộ đề đang chờ giáo viên chọn câu dùng cho thẻ
  const [perPage, setPerPage] = useState<1 | 2>(2);
  const [printFor, setPrintFor] = useState(''); // '' = bộ thẻ chung 1–100, hoặc id lớp (in sẵn tên)
  const [codesFor, setCodesFor] = useState<ClassRoom | null>(null); // lớp đang mở hộp đặt mã số học sinh

  const load = useCallback(async () => {
    try {
      const [c, q, cat] = await Promise.all([api.listClasses(), api.listQuizzes(), api.getCatalog().catch(() => emptyCatalog())]);
      setClasses(c);
      setQuizzes(q);
      setCatalog(cat);
      api.listPublicQuizzes().then(setPub).catch(() => {});
      setClassId((v) => (c.some((x) => x.id === v) ? v : c[0]?.id ?? ''));
      setQuizId((v) => v); // thầy cô tự chọn đề trong bộ chọn (kho lớn thì không tự chọn bừa đề đầu tiên)
    } catch (e) {
      setError((e as Error).message);
      setClasses([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Máy tự chọn những câu dùng được với thẻ
  useEffect(() => {
    setUsable(null);
    if (!quizId) return;
    let live = true;
    const b = isBuiltinId(quizId) ? builtinQuiz(quizId) : null; // bộ mẫu của Quickplay: đọc sẵn trong phần mềm
    (b ? Promise.resolve(b) : api.getQuiz(quizId)).then((q) => live && setUsable({ ok: q.questions.filter(isPaperQuestion).length, all: q.questions.length })).catch(() => {});
    return () => {
      live = false;
    };
  }, [quizId]);

  const cls = classes?.find((c) => c.id === classId);
  const printCls = classes?.find((c) => c.id === printFor);
  const count = printCls ? printCls.students.length : CARD_COUNT;
  const sheets = Math.ceil(count / perPage);
  const students = useMemo(() => parseStudents(edit?.text ?? ''), [edit?.text]);

  const downloadCards = async () => {
    try {
      await document.fonts?.load("700 50px 'Be Vietnam Pro'");
    } catch { /* dùng phông hệ thống */ }
    const blob = cardsPdf({ to: count, perPage, nameImage: printCls ? (card) => nameImage(printCls.students[card - 1]) : undefined });
    downloadBlob(printCls ? `Quickplay-the-tra-loi-${printCls.name}.pdf` : `Quickplay-the-tra-loi-1-${CARD_COUNT}.pdf`, blob);
    toast(`Đã tải PDF ${count} thẻ (${sheets} tờ A4). In đen trắng, tỷ lệ 100%.`, 'ok');
  };

  const saveClass = async () => {
    if (!edit) return;
    if (!edit.name.trim()) return toast('Hãy nhập tên lớp.', 'error');
    if (!students.length) return toast('Hãy dán danh sách học sinh, mỗi dòng một tên.', 'error');
    try {
      // Sửa danh sách tên thì mã số đã đặt vẫn đi theo đúng em (ghép theo tên); em mới thêm chưa có mã
      const old = classes?.find((c) => c.id === edit.id);
      let codes: string[] | undefined;
      if (old?.codes) {
        const pool = old.students.map((n, i) => ({ n, c: old.codes![i] ?? '' }));
        codes = students.map((n) => {
          const k = pool.findIndex((x) => x.n === n);
          return k < 0 ? '' : pool.splice(k, 1)[0].c;
        });
      }
      const saved = await api.saveClass({ id: edit.id, name: edit.name.trim(), students, codes });
      setEdit(null);
      toast(`Đã lưu lớp ${saved.name} (${saved.students.length} em).`, 'ok');
      await load();
      setClassId(saved.id);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const removeClass = async (c: ClassRoom) => {
    if (!(await askConfirm(`Xóa lớp "${c.name}"? Bảng điểm các buổi đã quét vẫn được giữ.`))) return;
    await api.deleteClass(c.id);
    toast('Đã xóa lớp.', 'ok');
    load();
  };
  // Bấm Bắt đầu: mở hộp thoại cho giáo viên xem câu nào phù hợp với thẻ, rồi mới tạo phiên
  const start = async () => {
    if (!cls || !quizId) return;
    setBusy(true);
    try {
      const b0 = BUILTIN_QUIZZES.find((x) => x.id === quizId);
      setPick(b0 ? ({ ...b0.make(), id: quizId } as Quiz) : await api.getQuiz(quizId));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const launch = async (questionIds: string[]) => {
    if (!cls || !quizId) return;
    // Câu được chọn theo VỊ TRÍ trong bộ đề: mã câu hỏi của bộ mẫu được tạo lại mỗi lần, nên không dùng mã để đối chiếu
    const chosenAt = (pick?.questions ?? []).flatMap((q, i) => (questionIds.includes(q.id) ? [i] : []));
    setPick(null);
    setBusy(true);
    try {
      let id = quizId;
      let ids = questionIds;
      // Bộ mẫu của Quickplay chưa nằm trong kho của thầy cô: máy chủ chỉ tổ chức được bộ đề đã lưu → chép vào "Của tôi" (đúng bài mẫu) rồi dùng
      const b = BUILTIN_QUIZZES.find((x) => x.id === quizId);
      if (b) {
        const where = [b.grade, ...b.path].join(' › ');
        const had = quizzes.find((q) => q.title === b.title && pathOf(catalog, q) === where);
        if (had) {
          id = had.id;
          const full = await api.getQuiz(had.id);
          ids = full.questions.filter((_, i) => chosenAt.includes(i)).map((q) => q.id);
        } else {
          const r = ensurePath(catalog, ...b.path, b.grade);
          if (r.catalog !== catalog) setCatalog(await api.saveCatalog(r.catalog));
          const now = new Date().toISOString();
          const made = b.make();
          const saved = await api.saveQuiz({ ...made, ...r.placement, id: uid('quiz_'), visibility: 'private', created_at: now, updated_at: now });
          id = saved.id;
          ids = made.questions.filter((_, i) => chosenAt.includes(i)).map((q) => q.id); // bản sao giữ nguyên mã câu hỏi
          toast(`Đã chép "${b.title}" vào kho đề của thầy cô (${where}).`, 'ok');
        }
      }
      const { pin } = await api.createPaperSession(id, cls.name, cls.students, ids);
      nav(`/teacher/paper/${pin}`);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };

  if (!classes) return <Spinner />;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="pp-head card">
        <div className="grow">
          <span className="badge blue">Dạy học trên lớp</span>
          <h1 style={{ margin: '6px 0 0', fontSize: '1.6rem' }}>Thẻ trả lời</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Cả lớp trả lời bằng thẻ giấy, không cần điện thoại của học sinh. Chỉ cần thẻ và điện thoại của thầy cô để quét.</p>
        </div>
        <CardPreview card={1} size={96} />
      </section>
      {error && <div className="alert error"><div>{error}</div></div>}

      <div className="pp-dash">
      <details className="card pp-panel pp-print" open={classes.length === 0}>
        <summary className="pp-print-sum"><span className="step-pill"><b>1</b> In thẻ</span><span className="muted small">In một lần cho cả năm học · bấm để mở</span></summary>
        <div className="stack" style={{ gap: 10 }}>
          <div className="stack" style={{ gap: 10 }}>
            <div className="field">
              <span>Chọn kiểu in</span>
              <div className="pp-choice" role="radiogroup" aria-label="Kiểu in thẻ">
                <button type="button" role="radio" aria-checked={!!printFor} aria-label="In cho lớp đã có danh sách, mỗi thẻ có tên học sinh" className={printFor ? 'on' : ''} disabled={!classes.length}
                  onClick={() => setPrintFor(printFor || classes[0]?.id || '')}>
                  <b>1. In cho lớp đã có danh sách</b>
                  <small>In sẵn tên và số thẻ của từng em.</small>
                </button>
                <button type="button" role="radio" aria-checked={!printFor} aria-label="In bộ thẻ dùng chung đánh số 1 đến 100" className={!printFor ? 'on' : ''} onClick={() => setPrintFor('')}>
                  <b>2. In bộ thẻ dùng chung</b>
                  <small>Số 1 đến {CARD_COUNT}, không tên. Dùng cho mọi lớp.</small>
                </button>
              </div>
            </div>
            {printFor ? (
              <Field label="Lớp cần in">
                <select className="input" value={printFor} onChange={(e) => setPrintFor(e.target.value)}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.students.length} em)</option>)}
                </select>
              </Field>
            ) : !classes.length ? (
              <p className="muted small" style={{ margin: 0 }}>Muốn in thẻ có tên, hãy thêm lớp ở bước 2 trước.</p>
            ) : null}
            <div className="field">
              <span>Cỡ thẻ</span>
              <div className="row" role="radiogroup" aria-label="Cỡ thẻ">
                <button type="button" role="radio" aria-checked={perPage === 2} className={`tab ${perPage === 2 ? 'on' : ''}`} onClick={() => setPerPage(2)}>2 thẻ một tờ (lớp học thường)</button>
                <button type="button" role="radio" aria-checked={perPage === 1} className={`tab ${perPage === 1 ? 'on' : ''}`} onClick={() => setPerPage(1)}>1 thẻ một tờ, mã to (phòng rộng)</button>
              </div>
            </div>
            <div className="row">
              <button className="btn primary lg" onClick={downloadCards} disabled={!count}><Download size={20} /> Tải PDF bộ thẻ</button>
              <button className="btn ghost" onClick={() => downloadBlob('Quickplay-mat-sau-the.pdf', cardsBackPdf(perPage))}><Printer size={18} /> Tải PDF mặt sau (tùy chọn)</button>
            </div>
            <p className="muted small" style={{ margin: 0 }}>{count} thẻ = {sheets} tờ A4.</p>
          </div>
          <details className="pp-more">
            <summary>Lưu ý khi in thẻ</summary>
            <ul className="pp-tips">
              <li>Giấy A4 trắng, in đen trắng, tỷ lệ 100% (không chọn “vừa trang giấy”).</li>
              <li>Mặt sau in chữ A, B, C, D kèm mũi tên: em xoay thẻ cho <b>mũi tên chữ mình chọn chỉ lên trên</b>.</li>
              <li>In mặt sau bằng <b>in hai mặt, lật theo cạnh dài</b> để chữ khớp đúng cạnh mặt trước.</li>
              <li>Cầm ở phần giấy trắng, đừng che ô đen. Giấy mỏng thì dán lên bìa cứng.</li>
            </ul>
          </details>
        </div>
      </details>

      <section className="card stack pp-panel">
        <div className="row between">
          <div className="step-pill"><b>2</b> Lớp học</div>
          <button className="btn primary sm" onClick={() => setEdit({ name: '', text: '' })}><Plus size={16} /> Thêm lớp</button>
        </div>
        {classes.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>Chưa có lớp nào. Bấm “Thêm lớp” rồi dán danh sách học sinh, mỗi dòng một tên.</p>
        ) : (
          <div className="grid pp-list">
            {classes.map((c) => (
              <div key={c.id} className="pp-class">
                <div className="grow">
                  <b>{c.name}</b>
                  <div className="muted small"><Users size={14} /> {c.students.length} em · thẻ số 1 đến {c.students.length}</div>
                  <div className="muted small"><KeyRound size={14} /> {(() => { const n = (c.codes ?? []).filter(Boolean).length; return n >= c.students.length ? 'Đã có đủ mã số học sinh' : n ? `Mã số học sinh: ${n}/${c.students.length} em` : 'Chưa đặt mã số học sinh'; })()}</div>
                </div>
                <button className="btn sm" title="Mã số học sinh" onClick={() => setCodesFor(c)} aria-label={`Mã số học sinh lớp ${c.name}`}><KeyRound size={16} /> Mã học sinh</button>
                <button className="btn icon ghost" title="Sửa lớp" onClick={() => setEdit({ id: c.id, name: c.name, text: c.students.join('\n') })} aria-label={`Sửa lớp ${c.name}`}><Pencil size={18} /></button>
                <button className="btn icon danger" title="Xóa lớp" onClick={() => removeClass(c)} aria-label={`Xóa lớp ${c.name}`}><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card stack pp-panel">
        <div className="step-pill"><b>3</b> Hôm nay lớp học gì?</div>
        <div>
          <Field label="Lớp">
            <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!classes.length}>
              {!classes.length && <option value="">Chưa có lớp</option>}
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.students.length} em)</option>)}
            </select>
          </Field>
        </div>
        <div className="field pp-quiz">
          <span>Lấy câu từ đề có sẵn</span>
          <QuizPicker mine={quizzes} pub={pub} catalog={catalog} value={quizId} onChange={(id) => setQuizId(id)} />
          {usable && <small className="help" style={usable.ok ? undefined : { color: 'var(--danger)' }}>{usable.ok ? `Máy đã chọn ${usable.ok}/${usable.all} câu dùng được với thẻ (câu một đáp án, 2 đến 4 phương án).` : 'Đề này chưa có câu nào dùng được với thẻ. Hãy chọn đề có câu một đáp án, 2 đến 4 phương án.'}</small>}
        </div>
        <div className="row pp-foot">
          <button className="btn success lg" onClick={start} disabled={busy || !cls || !quizId || !usable?.ok}><ScanLine size={20} /> {busy ? 'Đang tạo…' : 'Tạo buổi học'}</button>
          <span className="muted small">Máy chiếu hiện mã QR để quét bằng điện thoại.</span>
        </div>
      </section>
      </div>

      {pick && <PaperPickDialog quiz={pick} onClose={() => setPick(null)} onConfirm={(ids) => launch(ids)} />}
      {codesFor && <StudentCodesDialog cls={codesFor} onClose={() => setCodesFor(null)} onSaved={(c) => { setCodesFor(c); load(); }} />}
      {edit && (
        <Modal title={edit.id ? 'Sửa lớp' : 'Thêm lớp'} onClose={() => setEdit(null)} footer={<button className="btn primary" onClick={saveClass}>Lưu lớp</button>}>
          <div className="stack">
            <Field label="Tên lớp"><input className="input" value={edit.name} maxLength={60} placeholder="Ví dụ: 6A1" onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Danh sách học sinh" help={`Mỗi dòng một tên, tối đa ${CARD_COUNT} em. Thứ tự dòng chính là số thẻ của em. Đang có ${students.length} em.`}>
              <textarea className="input" rows={12} value={edit.text} placeholder={'Nguyễn Văn An\nTrần Thị Bình\nLê Minh Châu'} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
