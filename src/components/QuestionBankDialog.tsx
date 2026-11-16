// Tạo bộ đề mới từ kho câu hỏi đã có: chọn từng câu, nhiều câu, hoặc cả bộ đề (của tôi, thư viện công cộng, bộ mặc định).
// Câu được chép sang bộ mới (mã câu mới), bộ cũ giữ nguyên. Tạo xong mở trình soạn để thầy cô thêm câu mới, sắp xếp lại.
import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, ChevronDown, ChevronRight, FolderTree, Image as ImageIcon, Layers, Library, Minus, Search, Shuffle, Square, X } from 'lucide-react';
import type { Catalog, Question, Quiz, QuizSummary } from '../lib/types';
import { api } from '../lib/api';
import { BUILTIN_QUIZZES, TYPE_LABELS, builtinQuiz, newQuiz } from '../lib/factory';
import { emptyCatalog, pathOf, type Placement } from '../lib/catalog';
import { hashString, htmlToText, shuffle, uid } from '../lib/util';
import { Modal, Spinner, useToast } from './ui';
import { PaperFields, type PaperInfo } from './PaperFields';
import { paperTitle, suggestCode } from '../lib/examPaper';

type Source = { id: string; title: string; count: number; where: string; kind: 'mine' | 'public' | 'builtin' };
const keyOf = (quizId: string, qid: string) => `${quizId}|${qid}`;

/** Chép câu hỏi sang bộ đề mới: mã câu mới, giữ nguyên nội dung và đáp án. */
export function copyQuestions(list: Question[]): Question[] {
  return list.map((q) => ({ ...(JSON.parse(JSON.stringify(q)) as Question), id: uid('q') }));
}

export function QuestionBankDialog({ mine: mineIn, pub: pubIn, catalog: catIn, place, defaultTitle, exclude, onClose, onDone, onPick, paper: paperIn }: {
  paper?: Partial<PaperInfo>; // mở sẵn ở chế độ "Đề thi" (từ mục Đề thi của thư viện)
  mine?: QuizSummary[]; // không truyền: hộp tự tải danh sách bộ đề
  pub?: QuizSummary[];
  catalog?: Catalog;
  place?: Placement | null;
  defaultTitle?: string;
  exclude?: string; // bộ đề đang soạn (không lấy câu từ chính nó)
  onClose: () => void;
  onDone?: (id: string) => void; // tạo bộ đề mới
  onPick?: (questions: Question[]) => void; // trình soạn: thêm câu đã chọn vào bộ đề đang sửa
}) {
  const toast = useToast();
  const [mineAll, setMine] = useState<QuizSummary[] | null>(mineIn ?? null);
  const [pub, setPub] = useState<QuizSummary[]>(pubIn ?? []);
  const [catalog, setCatalog] = useState<Catalog>(catIn ?? emptyCatalog());
  useEffect(() => {
    if (mineIn) return;
    api.listQuizzes().then(setMine).catch((e) => { setMine([]); toast((e as Error).message, 'error'); });
    api.listPublicQuizzes().then(setPub).catch(() => {});
    api.getCatalog().then(setCatalog).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = useMemo(() => (mineAll ?? []).filter((q) => q.id !== exclude), [mineAll, exclude]);
  const [title, setTitle] = useState(defaultTitle || 'Bộ đề tổng hợp');
  // Đề thi: Khối lớp, Môn, Thời điểm, Mã đề; tên đề tự đặt theo các ô này cho tới khi thầy cô tự sửa tên
  const [asPaper, setAsPaper] = useState(!!paperIn);
  const [paper, setPaper] = useState<PaperInfo>({ grade: paperIn?.grade ?? '', subject: paperIn?.subject ?? '', period: paperIn?.period ?? 'ck1', code: paperIn?.code ?? '' });
  const [titleTouched, setTitleTouched] = useState(false);
  const [codeTouched, setCodeTouched] = useState(!!paperIn?.code);
  /** Mã đề tự đổi theo Khối lớp, Môn, Thời điểm cho tới khi thầy cô tự gõ mã. */
  const changePaper = (v: PaperInfo) => {
    if (v.code !== paper.code) {
      setCodeTouched(true);
      return setPaper(v);
    }
    setPaper(codeTouched ? v : { ...v, code: suggestCode(v.subject, v.grade, v.period, usedCodes) });
  };
  const usedCodes = useMemo(() => (mineAll ?? []).map((q) => q.paper_code).filter((c): c is string => !!c), [mineAll]);
  useEffect(() => {
    // mã đề gợi ý sẵn khi đã biết danh sách đề trong thư viện
    if (asPaper && !paper.code && mineAll) setPaper((p) => ({ ...p, code: suggestCode(p.subject, p.grade, p.period, usedCodes) }));
  }, [asPaper, mineAll]); // eslint-disable-line react-hooks/exhaustive-deps
  const autoTitle = asPaper ? paperTitle(paper.subject, paper.grade, paper.period, paper.code) : title;
  const shownTitle = asPaper && !titleTouched ? autoTitle : title;
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState<Map<string, Quiz>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string[]>([]); // thứ tự chọn = thứ tự câu trong bộ mới
  const [mix, setMix] = useState(false);
  const [busy, setBusy] = useState(false);

  const sources = useMemo<Source[]>(() => {
    const own = new Set(mine.map((q) => q.id));
    return [
      ...mine.map((q) => ({ id: q.id, title: q.title, count: q.question_count, where: pathOf(catalog, q) || 'Chưa phân loại', kind: 'mine' as const })),
      ...pub.filter((q) => !own.has(q.id) && q.id !== exclude).map((q) => ({ id: q.id, title: q.title, count: q.question_count, where: [q.grade, q.subject].filter(Boolean).join(' › ') || 'Thư viện công cộng', kind: 'public' as const })),
      // bộ mặc định: ẩn nếu thầy cô đã chép một bản cùng tên về thư viện
      ...BUILTIN_QUIZZES.filter((b) => !mine.some((q) => q.title === b.title)).map((b) => ({ id: b.id, title: b.title, count: 10, where: [b.grade, ...b.path].join(' › '), kind: 'builtin' as const })),
    ];
  }, [mine, pub, catalog]);

  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const term = search.trim().toLocaleLowerCase('vi');
  const qText = (q: Question) => htmlToText(q.stem.text).replace(/\[blank_\d+\]/g, '____').replace(/\s+/g, ' ').trim();
  const matches = (q: Question) => !term || qText(q).toLocaleLowerCase('vi').includes(term);
  const shown = sources.filter((s) => !term || s.title.toLocaleLowerCase('vi').includes(term) || s.where.toLocaleLowerCase('vi').includes(term) || (loaded.get(s.id)?.questions.some(matches) ?? false));

  /** Tải đầy đủ một bộ đề (một lần). */
  const load = async (id: string): Promise<Quiz | null> => {
    const have = loaded.get(id);
    if (have) return have;
    setLoading((s) => new Set(s).add(id));
    try {
      const q = builtinQuiz(id) ?? (await api.getQuiz(id));
      setLoaded((m) => new Map(m).set(id, q));
      return q;
    } catch (e) {
      toast(`Không mở được bộ đề: ${(e as Error).message}`, 'error');
      return null;
    } finally {
      setLoading((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };
  const toggleOpen = async (id: string) => {
    const on = !open.has(id);
    setOpen((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
    if (on) await load(id);
  };
  const toggleOne = (quizId: string, qid: string) => {
    const k = keyOf(quizId, qid);
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };
  /** Chọn / bỏ cả bộ đề (khi đang tìm thì chỉ các câu khớp). */
  const toggleQuiz = async (id: string) => {
    const q = await load(id);
    if (!q) return;
    const keys = q.questions.filter(matches).map((x) => keyOf(id, x.id));
    const all = keys.length > 0 && keys.every((k) => pickedSet.has(k));
    setPicked((p) => (all ? p.filter((k) => !keys.includes(k)) : [...p, ...keys.filter((k) => !p.includes(k))]));
  };
  const stateOf = (id: string): 'all' | 'some' | 'none' => {
    const q = loaded.get(id);
    if (!q) return 'none';
    const n = q.questions.filter((x) => pickedSet.has(keyOf(id, x.id))).length;
    return n === 0 ? 'none' : n === q.questions.length ? 'all' : 'some';
  };
  const fromQuizzes = new Set(picked.map((k) => k.split('|')[0])).size;

  const create = async () => {
    const list = picked
      .map((k) => {
        const [qz, qid] = k.split('|');
        return loaded.get(qz)?.questions.find((x) => x.id === qid);
      })
      .filter((x): x is Question => !!x);
    if (!list.length) return toast('Hãy chọn ít nhất một câu hỏi.', 'error');
    if (onPick) {
      onPick(copyQuestions(mix ? shuffle(list, hashString(picked.join())) : list));
      return;
    }
    setBusy(true);
    try {
      if (asPaper && (!paper.grade || !paper.subject.trim() || !paper.code.trim())) {
        setBusy(false);
        return toast('Đề thi cần có Khối lớp, Môn học và Mã đề.', 'error');
      }
      const quiz = newQuiz(shownTitle.trim() || 'Bộ đề tổng hợp');
      quiz.questions = copyQuestions(mix ? shuffle(list, hashString(quiz.id)) : list);
      let extra: Partial<Quiz> = { ...(place ?? {}) };
      if (asPaper) {
        // gắn với môn trong danh mục nếu trùng tên (cùng khối lớp)
        const subj = catalog.subjects.find((s) => s.name.toLocaleLowerCase('vi') === paper.subject.trim().toLocaleLowerCase('vi') && (!s.grade || s.grade === paper.grade));
        extra = { grade: paper.grade, subject: paper.subject.trim(), ...(subj ? { subject_id: subj.id } : {}), paper_period: paper.period, paper_code: paper.code.trim() };
      }
      const saved = await api.saveQuiz({ ...quiz, ...extra });
      toast(`Đã tạo bộ đề "${saved.title}" gồm ${list.length} câu. Thầy cô có thể thêm câu mới, sửa và sắp xếp lại.`, 'ok');
      onDone?.(saved.id);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };

  const Box = ({ st }: { st: 'all' | 'some' | 'none' }) => (st === 'all' ? <CheckSquare size={20} /> : st === 'some' ? <Minus size={20} /> : <Square size={20} />);

  return (
    <Modal
      wide
      title={onPick ? 'Lấy câu hỏi từ kho' : asPaper ? 'Tạo đề thi từ ngân hàng câu hỏi' : 'Tạo bộ đề từ kho câu hỏi'}
      onClose={onClose}
      footer={
        <>
          <span className="qb-sum grow">
            {picked.length ? <>Đã chọn <b>{picked.length}</b> câu từ <b>{fromQuizzes}</b> bộ đề</> : 'Chưa chọn câu nào'}
            {picked.length > 0 && <button type="button" className="btn sm ghost" onClick={() => setPicked([])}><X size={14} /> Bỏ chọn</button>}
          </span>
          <button className="btn ghost" onClick={onClose}>Hủy</button>
          <button className="btn primary" onClick={create} disabled={busy || !picked.length}><Layers size={18} /> {onPick ? `Thêm ${picked.length} câu vào bộ đề` : busy ? 'Đang tạo…' : asPaper ? 'Tạo đề thi (' + picked.length + ' câu)' : `Tạo bộ đề (${picked.length} câu)`}</button>
        </>
      }
    >
      <div className="stack qb">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          {!onPick && (
            <div className="field" style={{ margin: 0 }}>
              <span>Tạo thành</span>
              <div className="row" role="radiogroup" aria-label="Loại bộ đề tạo ra" style={{ gap: 6 }}>
                <button type="button" role="radio" aria-checked={!asPaper} className={`tab ${!asPaper ? 'on' : ''}`} onClick={() => setAsPaper(false)}>Bộ câu hỏi</button>
                <button type="button" role="radio" aria-checked={asPaper} className={`tab ${asPaper ? 'on' : ''}`} onClick={() => setAsPaper(true)}>Đề thi (có mã đề)</button>
              </div>
            </div>
          )}
          {!onPick && (
            <label className="field grow" style={{ minWidth: 220, margin: 0 }}>
              <span>{asPaper ? 'Tên đề thi' : 'Tên bộ đề mới'}</span>
              <input className="input" value={shownTitle} maxLength={160} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} />
            </label>
          )}
          <label className="switch" style={{ marginBottom: 8 }}><input type="checkbox" checked={mix} onChange={(e) => setMix(e.target.checked)} /> <Shuffle size={16} /> Trộn thứ tự câu</label>
        </div>
        {asPaper && !onPick && (
          <div className="paper-box">
            <PaperFields value={paper} onChange={changePaper} catalog={catalog} usedCodes={usedCodes} />
            <small className="muted">Đề thi nằm trong mục <b>Đề thi</b> của thư viện, xếp theo Khối lớp › Môn › Thời điểm. Muốn có nhiều đề cho một kì kiểm tra (để bốc đề ngẫu nhiên), tạo mỗi đề một mã khác nhau và cùng số câu.</small>
          </div>
        )}
        {place && !onPick && !asPaper && <p className="small muted" style={{ margin: 0 }}><FolderTree size={14} /> Bộ đề mới nằm trong: <b>{pathOf(catalog, place)}</b></p>}
        <div className="qb-search">
          <Search size={18} aria-hidden />
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm bộ đề, bài học hoặc nội dung câu hỏi (với bộ đề đã mở)…" aria-label="Tìm trong kho câu hỏi" />
        </div>
        <p className="help" style={{ margin: 0 }}>
          Bấm ô vuông bên trái tên bộ đề để chọn <b>cả bộ</b>; bấm tên bộ đề để mở ra và chọn <b>từng câu</b>. Câu được chép sang bộ mới theo thứ tự thầy cô chọn, các bộ đề cũ giữ nguyên.
          {onPick ? 'Câu đã chọn được thêm vào cuối bộ đề đang soạn.' : <>Tạo xong, phần mềm mở trình soạn để thầy cô <b>thêm câu mới</b>, sửa hoặc sắp xếp lại.</>}
        </p>
        <ul className="qb-list">
          {shown.map((s) => {
            const st = stateOf(s.id);
            const q = loaded.get(s.id);
            const isOpen = open.has(s.id) || (!!term && !!q && !s.title.toLocaleLowerCase('vi').includes(term));
            const qs = q ? q.questions.filter(matches) : [];
            return (
              <li key={s.id} className={`qb-quiz ${st !== 'none' ? 'on' : ''}`}>
                <div className="qb-row">
                  <button type="button" className="qb-check" onClick={() => toggleQuiz(s.id)} aria-label={`${st === 'all' ? 'Bỏ chọn' : 'Chọn'} cả bộ "${s.title}"`} aria-pressed={st === 'all'}>
                    {loading.has(s.id) ? <Spinner /> : <Box st={st} />}
                  </button>
                  <button type="button" className="qb-title" onClick={() => toggleOpen(s.id)} aria-expanded={open.has(s.id)}>
                    {open.has(s.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span className="grow">
                      <b>{s.title}</b>
                      <small>{s.where}</small>
                    </span>
                    {s.kind !== 'mine' && <span className="badge">{s.kind === 'builtin' ? 'Mặc định' : 'Công cộng'}</span>}
                    <span className="badge blue">{q ? `${q.questions.filter((x) => pickedSet.has(keyOf(s.id, x.id))).length}/` : ''}{q?.questions.length ?? s.count} câu</span>
                  </button>
                </div>
                {isOpen && q && (
                  <ol className="qb-qs">
                    {qs.map((x) => {
                      const on = pickedSet.has(keyOf(s.id, x.id));
                      const order = on ? picked.indexOf(keyOf(s.id, x.id)) + 1 : 0;
                      return (
                        <li key={x.id}>
                          <button type="button" className={`qb-q ${on ? 'on' : ''}`} onClick={() => toggleOne(s.id, x.id)} aria-pressed={on}>
                            {on ? <span className="qb-no">{order}</span> : <Square size={18} />}
                            <span className="grow">
                              <span className="qb-text">{qText(x) || '(câu hỏi chỉ có hình)'}</span>
                              <small>{TYPE_LABELS[x.type]}{x.stem.image_url ? ' · có hình' : ''}{x.explanation ? ' · có lời giải' : ''}</small>
                            </span>
                            {x.stem.image_url && <ImageIcon size={16} aria-hidden />}
                          </button>
                        </li>
                      );
                    })}
                    {!qs.length && <li className="muted small">Không có câu nào khớp từ khóa.</li>}
                  </ol>
                )}
              </li>
            );
          })}
          {!shown.length && (
            <li className="muted" style={{ padding: 12 }}><Library size={18} /> {mineAll === null ? 'Đang tải thư viện…' : sources.length ? 'Không có bộ đề nào khớp từ khóa.' : 'Thư viện chưa có bộ đề nào.'}</li>
          )}
        </ul>
      </div>
    </Modal>
  );
}
