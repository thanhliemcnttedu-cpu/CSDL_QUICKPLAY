import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Play, Pencil, Trash2, Upload, Sparkles, Copy, Globe, Lock, BookOpenCheck, Eye, FolderInput, FolderTree, ChevronDown, ChevronUp, DatabaseZap, Star, CopyPlus } from 'lucide-react';
import type { Catalog, Quiz, QuizSummary } from '../lib/types';
import { api } from '../lib/api';
import { BUILTIN_QUIZZES, newQuiz, sampleQuiz, type BuiltinQuiz } from '../lib/factory';
import { ALL, NONE, UNGRADED, countByNode, emptyCatalog, ensurePath, gradeOfId, inNode, isGradeId, nodeExists, pathOf, placementOf, resolve, type Placement } from '../lib/catalog';
import { formatDate, uid } from '../lib/util';
import { Modal, Spinner, useToast, askConfirm } from '../components/ui';
import { ImportDialog } from '../components/ImportDialog';
import { HostSetupDialog } from '../components/HostSetupDialog';
import { CatalogTree, PlacementPicker } from '../components/CatalogTree';

const NODE_KEY = 'quizzi.library.node';
const readNode = () => {
  try {
    return sessionStorage.getItem(NODE_KEY) || ALL;
  } catch {
    return ALL;
  }
};
const toSummary = (q: Quiz): QuizSummary => ({
  id: q.id, title: q.title, subject: q.subject, subject_id: q.subject_id, chapter_id: q.chapter_id, lesson_id: q.lesson_id, grade: q.grade,
  visibility: q.visibility, updated_at: q.updated_at, cover_url: q.cover_url, question_count: q.questions.length,
});

export default function Library() {
  const nav = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<QuizSummary[] | null>(null);
  const [pub, setPub] = useState<QuizSummary[]>([]);
  const [tab, setTab] = useState<'mine' | 'public'>('mine');
  const [error, setError] = useState('');
  const [dlg, setDlg] = useState<null | { kind: 'import' | 'ai' } | { kind: 'host'; quiz: QuizSummary } | { kind: 'move'; quiz: QuizSummary; to: Placement & { subject?: string } }>(null);
  const [filter, setFilter] = useState('');
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [node, setNodeState] = useState<string>(readNode);
  const [sideOpen, setSideOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const setNode = (id: string) => {
    setNodeState(id);
    setSideOpen(false);
    try {
      sessionStorage.setItem(NODE_KEY, id);
    } catch { /* không lưu được cũng không sao */ }
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const [list, cat] = await Promise.all([api.listQuizzes(), api.getCatalog().catch(() => emptyCatalog())]);
      setItems(list);
      setCatalog(cat);
      api.listPublicQuizzes().then(setPub).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Nút đang chọn đã bị xóa (hoặc danh mục đổi ở máy khác) thì quay về "Tất cả bộ đề"
  const current = node === ALL || node === NONE || nodeExists(catalog, node) ? node : ALL;
  const counts = useMemo(() => countByNode(catalog, items ?? []), [catalog, items]);
  const onGrade = isGradeId(current); // đang chọn một khối lớp (bộ đề nằm trong môn / chủ đề / bài của lớp đó)
  const currentLabel = current === ALL ? 'Tất cả bộ đề' : current === NONE ? 'Chưa phân loại' : onGrade ? (current === UNGRADED ? 'Môn chưa xếp lớp' : gradeOfId(current)) : pathOf(catalog, placementOf(catalog, current) ?? {});

  const saveCatalog = async (next: Catalog) => {
    const before = catalog;
    setCatalog(next);
    try {
      setCatalog(await api.saveCatalog(next));
    } catch (e) {
      setCatalog(before);
      toast(`Chưa lưu được danh mục: ${(e as Error).message}`, 'error');
    }
  };

  const create = async () => {
    const place = current === ALL || current === NONE ? null : placementOf(catalog, current);
    const q = await api.saveQuiz({ ...newQuiz(), ...(place ?? {}) });
    nav(`/teacher/edit/${q.id}`);
  };
  const addSample = async () => {
    await api.saveQuiz(sampleQuiz());
    toast('Đã thêm bộ đề mẫu.', 'ok');
    load();
  };
  const remove = async (q: QuizSummary) => {
    if (!(await askConfirm(`Xóa bộ câu hỏi "${q.title}"? (Trên Drive, tệp được chuyển vào Thùng rác.)`, { danger: true, okLabel: 'Xóa bộ đề' }))) return;
    await api.deleteQuiz(q.id);
    toast('Đã xóa.', 'ok');
    load();
  };
  const duplicate = async (q: QuizSummary) => {
    const full = await api.getQuiz(q.id);
    const now = new Date().toISOString();
    await api.saveQuiz({ ...full, id: uid('quiz_'), title: full.title + ' (bản sao)', visibility: 'private', created_at: now, updated_at: now });
    toast('Đã tạo bản sao vào thư viện của bạn.', 'ok');
    load();
  };

  // Chuyển bộ đề sang Môn / Chương / Bài khác (hoặc về "Chưa phân loại")
  const move = async () => {
    if (dlg?.kind !== 'move') return;
    const { quiz, to } = dlg;
    setDlg(null);
    try {
      const full = await api.getQuiz(quiz.id);
      await api.saveQuiz({ ...full, subject_id: to.subject_id, chapter_id: to.chapter_id, lesson_id: to.lesson_id, subject: to.subject ?? full.subject, updated_at: new Date().toISOString() });
      toast(`Đã chuyển "${quiz.title}" tới: ${pathOf(catalog, to) || 'Chưa phân loại'}.`, 'ok');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  // ----- Bộ câu hỏi mặc định của Quickplay (Tiếng Việt 1, Tiếng Anh 1) -----
  /** Chép một bộ mặc định vào thư viện của giáo viên, đặt đúng Môn › Chương › Bài mẫu (tạo danh mục nếu chưa có). */
  const copyBuiltin = async (b: BuiltinQuiz, cat: Catalog): Promise<{ catalog: Catalog; quiz: Quiz }> => {
    const r = ensurePath(cat, ...b.path, b.grade);
    const now = new Date().toISOString();
    const quiz = await api.saveQuiz({ ...b.make(), ...r.placement, id: uid('quiz_'), visibility: 'private', created_at: now, updated_at: now });
    return { catalog: r.catalog, quiz };
  };
  /** Bản đã chép của bộ mặc định trong thư viện (cùng tên, nằm đúng bài mẫu) – để không chép trùng khi bấm Tổ chức / Dùng bộ này. */
  const existingCopy = (b: BuiltinQuiz) =>
    (items ?? []).find((q) => q.title === b.title && pathOf(catalog, q) === [b.grade, ...b.path].join(' › '));

  const useBuiltin = async (b: BuiltinQuiz, thenHost: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      let summary = existingCopy(b);
      let lessonId = summary?.lesson_id;
      if (!summary) {
        const r = await copyBuiltin(b, catalog);
        if (r.catalog !== catalog) await api.saveCatalog(r.catalog).then(setCatalog);
        summary = toSummary(r.quiz);
        lessonId = r.quiz.lesson_id;
        toast(`Đã chép "${b.title}" vào thư viện của thầy cô: ${b.path.join(' › ')}.${thenHost ? ' Máy chủ chỉ tổ chức được bộ đề đã lưu nên Quickplay chép trước rồi mới mở hộp Tổ chức.' : ' Bấm "Tổ chức" để bắt đầu.'}`, 'ok');
        await load();
      } else {
        toast(`"${b.title}" đã có trong thư viện của thầy cô (${b.path.join(' › ')})${thenHost ? ', dùng luôn bản đó để tổ chức.' : '.'}`, 'info');
      }
      setTab('mine');
      setFilter('');
      if (lessonId) setNode(lessonId);
      if (thenHost) setDlg({ kind: 'host', quiz: summary });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setBusy(false);
  };

  // Nút "Thêm dữ liệu mẫu": tạo 2 môn mẫu (không tạo trùng) và chép hai bộ mặc định vào đúng hai bài
  const addDemoData = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const had = BUILTIN_QUIZZES.filter((b) => existingCopy(b)).length;
      let cat = catalog;
      for (const b of BUILTIN_QUIZZES) cat = ensurePath(cat, ...b.path, b.grade).catalog;
      const added = cat.subjects.length - catalog.subjects.length;
      if (cat !== catalog) cat = await api.saveCatalog(cat);
      setCatalog(cat);
      for (const b of BUILTIN_QUIZZES) await copyBuiltin(b, cat);
      toast(
        had
          ? 'Môn Tiếng Việt và Tiếng Anh đã có sẵn nên không tạo trùng môn, chương, bài. Đã thêm một bản mới của hai bộ đề mẫu vào đúng hai bài.'
          : `Đã thêm dữ liệu mẫu: ${added ? `${added} môn mới, ` : ''}hai bộ đề "Tiếng Việt 1" và "Tiếng Anh 1" nằm trong ${BUILTIN_QUIZZES.map((b) => b.path.join(' › ')).join(' và ')}.`,
        'ok',
      );
      setTab('mine');
      setNode(ALL);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setBusy(false);
  };

  const mine = tab === 'mine';
  const needle = filter.trim().toLowerCase();
  const byName = (q: { title: string }) => q.title.toLowerCase().includes(needle);
  const list = (mine ? items?.filter((q) => inNode(catalog, q, current)) : pub)?.filter(byName);
  const builtins = mine ? [] : BUILTIN_QUIZZES.filter(byName);
  const inNodeView = mine && current !== ALL;
  const sampleBtn = (
    <button type="button" className="btn sm ghost cat-sample" onClick={addDemoData} disabled={busy} title="Tạo hai môn mẫu kèm hai bộ đề đủ mọi dạng câu hỏi">
      <DatabaseZap size={16} /> Thêm dữ liệu mẫu (Tiếng Việt, Tiếng Anh)
    </button>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row between">
        <h1 style={{ margin: 0 }}>Thư viện đề</h1>
        <div className="row lib-actions">
          <button className="btn" onClick={() => setDlg({ kind: 'import' })}><Upload size={18} /> Nhập từ tệp</button>
          <button className="btn accent" onClick={() => setDlg({ kind: 'ai' })}><Sparkles size={18} /> AI sinh đề</button>
          <button className="btn primary" onClick={create} title={inNodeView && current !== NONE ? `Tạo bộ đề trong: ${currentLabel}` : undefined}><Plus size={18} /> Tạo bộ đề</button>
        </div>
      </div>
      <div className="row between">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mine} className={`tab ${mine ? 'on' : ''}`} onClick={() => setTab('mine')}>Của tôi ({items?.length ?? 0})</button>
          <button role="tab" aria-selected={!mine} className={`tab ${!mine ? 'on' : ''}`} onClick={() => setTab('public')}>Thư viện công cộng ({pub.length + BUILTIN_QUIZZES.length})</button>
        </div>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Tìm theo tên…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Tìm bộ đề" />
      </div>
      {error && (
        <div className="alert error" role="alert">
          <div>{error} <Link to="/teacher/settings">Mở Cài đặt</Link></div>
        </div>
      )}

      <div className={`lib-layout ${mine ? '' : 'single'}`}>
        {mine && (
          <aside className={`card lib-side ${sideOpen ? 'open' : ''}`}>
            <button type="button" className="btn sm ghost lib-side-toggle" onClick={() => setSideOpen((v) => !v)} aria-expanded={sideOpen}>
              <FolderTree size={16} /><span>Danh mục: {currentLabel}</span>{sideOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <CatalogTree catalog={catalog} counts={counts} selected={current} onSelect={setNode} onChange={(next) => saveCatalog(next)} footer={sampleBtn} />
          </aside>
        )}

        <div className="stack" style={{ gap: 14, minWidth: 0 }}>
          {inNodeView && (
            <p className="lib-crumb">
              <FolderTree size={18} /> {currentLabel}
              <span className="badge blue">{counts[current] ?? 0} bộ đề</span>
              {current !== NONE && !onGrade && <button className="btn sm primary" onClick={create}><Plus size={16} /> Tạo bộ đề trong mục này</button>}
              {onGrade && <span className="muted small">Chọn một môn, chủ đề hoặc bài của lớp này để tạo bộ đề bên trong.</span>}
            </p>
          )}
          {!list ? (
            <Spinner />
          ) : list.length + builtins.length === 0 ? (
            <div className="card empty">
              <BookOpenCheck size={48} color="var(--primary)" />
              <h2>{!mine ? 'Không tìm thấy bộ đề phù hợp' : needle ? 'Không tìm thấy bộ đề phù hợp' : current === NONE ? 'Không có bộ đề nào chưa phân loại' : inNodeView ? 'Mục này chưa có bộ đề' : 'Chưa có bộ đề nào'}</h2>
              <p className="muted">
                {!mine || needle ? 'Thử gõ từ khóa khác hoặc xóa ô tìm kiếm.'
                  : current === NONE ? 'Mọi bộ đề đều đã được xếp vào môn học.'
                  : onGrade ? 'Bấm dấu + cạnh tên lớp để thêm môn học, rồi thêm chủ đề và bài; bộ đề nằm trong môn, chủ đề hoặc bài.'
                  : inNodeView ? 'Bấm "Tạo bộ đề trong mục này", hoặc dùng nút "Chuyển tới…" trên thẻ của một bộ đề có sẵn để đưa vào đây.'
                  : 'Tạo bộ đề đầu tiên, nhập từ tệp Word, hoặc thêm dữ liệu mẫu môn Tiếng Việt và Tiếng Anh đủ mọi dạng câu hỏi.'}
              </p>
              {mine && !needle && current !== NONE && !onGrade && (
                <div className="row" style={{ justifyContent: 'center' }}>
                  {!inNodeView && <button className="btn" onClick={addSample}>Thêm bộ đề mẫu</button>}
                  {!inNodeView && <button className="btn" onClick={addDemoData} disabled={busy}><DatabaseZap size={18} /> Thêm dữ liệu mẫu (Tiếng Việt, Tiếng Anh)</button>}
                  <button className="btn primary" onClick={create}><Plus size={18} /> {inNodeView ? 'Tạo bộ đề trong mục này' : 'Tạo bộ đề'}</button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid">
              {builtins.map((b) => {
                const copy = existingCopy(b);
                return (
                  <article key={b.id} className="card quiz-card builtin">
                    <div className="quiz-cover">{b.title.charAt(0)}</div>
                    <div>
                      <h3 style={{ margin: 0 }}>{b.title}</h3>
                      <div className="row small muted" style={{ gap: 6, marginTop: 4 }}>
                        <span className="badge amber"><Star size={12} /> Mặc định của Quickplay</span>
                        <span className="badge blue">10 câu</span>
                        <span className="badge">Đủ 7 dạng</span>
                      </div>
                      <div className="quiz-path"><FolderTree size={14} /><span>{b.path.join(' › ')}</span></div>
                      <small className="muted">{copy ? 'Đã có một bản trong thư viện của thầy cô.' : 'Luôn có sẵn, không cần cài thêm.'}</small>
                    </div>
                    <div className="card-actions">
                      <button className="btn success grow" onClick={() => useBuiltin(b, true)} disabled={busy} title="Chép một bản vào thư viện của thầy cô rồi mở hộp Tổ chức"><Play size={18} /> Tổ chức</button>
                      <Link className="btn grow" to={`/teacher/preview/${b.id}`}><Eye size={18} /> Chơi thử như học sinh</Link>
                      <button className="btn primary grow" onClick={() => useBuiltin(b, false)} disabled={busy}><CopyPlus size={18} /> Dùng bộ này</button>
                    </div>
                  </article>
                );
              })}
              {list.map((q) => {
                const path = mine ? pathOf(catalog, q) : '';
                return (
                  <article key={q.id} className="card quiz-card">
                    <div className="quiz-cover">{q.cover_url ? <img src={q.cover_url} alt="" /> : q.title.trim().charAt(0).toUpperCase() || 'Q'}</div>
                    <div>
                      <h3 style={{ margin: 0 }}>{q.title}</h3>
                      <div className="row small muted" style={{ gap: 6, marginTop: 4 }}>
                        <span className="badge blue">{q.question_count} câu</span>
                        {!path && q.subject && <span className="badge">{q.subject}</span>}
                        {q.grade && <span className="badge">{q.grade}</span>}
                        <span className="badge" title={q.visibility === 'public' ? 'Công khai' : 'Riêng tư'}>{q.visibility === 'public' ? <Globe size={12} /> : <Lock size={12} />}</span>
                      </div>
                      {mine && <div className={`quiz-path ${path ? '' : 'none'}`}><FolderTree size={14} /><span>{path || 'Chưa phân loại'}</span></div>}
                      <small className="muted">Cập nhật {formatDate(q.updated_at)}</small>
                    </div>
                    <div className="card-actions">
                      <button className="btn success grow" onClick={() => setDlg({ kind: 'host', quiz: q })} disabled={!q.question_count}><Play size={18} /> Tổ chức</button>
                      {mine ? (
                        <>
                          <Link className="btn icon" to={`/teacher/preview/${q.id}`} aria-label={`Chơi thử ${q.title} với vai trò học sinh`} title="Chơi thử như học sinh"><Eye size={18} /></Link>
                          <Link className="btn icon" to={`/teacher/edit/${q.id}`} aria-label={`Sửa ${q.title}`} title="Sửa"><Pencil size={18} /></Link>
                          <button className="btn icon" onClick={() => setDlg({ kind: 'move', quiz: q, to: resolve(catalog, q) ? { subject_id: q.subject_id, chapter_id: q.chapter_id, lesson_id: q.lesson_id } : {} })} aria-label={`Chuyển ${q.title} tới môn, chương, bài khác`} title="Chuyển tới…"><FolderInput size={18} /></button>
                          <button className="btn icon" onClick={() => duplicate(q)} aria-label={`Nhân bản ${q.title}`} title="Nhân bản"><Copy size={18} /></button>
                          <button className="btn icon danger" onClick={() => remove(q)} aria-label={`Xóa ${q.title}`} title="Xóa"><Trash2 size={18} /></button>
                        </>
                      ) : (
                        <button className="btn icon" onClick={() => duplicate(q)} aria-label={`Sao chép ${q.title} về thư viện`} title="Sao chép về thư viện của tôi"><Copy size={18} /></button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {(dlg?.kind === 'import' || dlg?.kind === 'ai') && (() => {
        // Bộ đề mới nằm luôn trong mục đang chọn ở cây thư mục (Môn › Chủ đề › Bài)
        const here = current === ALL || current === NONE ? null : placementOf(catalog, current);
        return <ImportDialog mode={dlg.kind === 'ai' ? 'ai' : 'file'} place={here ?? undefined} defaults={{ subject: here?.subject }} onClose={() => setDlg(null)} onDone={(id) => nav(`/teacher/edit/${id}`)} />;
      })()}
      {dlg?.kind === 'host' && <HostSetupDialog quiz={dlg.quiz} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'move' && (
        <Modal
          title={`Chuyển "${dlg.quiz.title}" tới…`}
          onClose={() => setDlg(null)}
          footer={<><button className="btn" onClick={() => setDlg(null)}>Hủy</button><button className="btn primary" onClick={move}><FolderInput size={18} /> Chuyển tới đây</button></>}
        >
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>Đang ở: <b>{pathOf(catalog, dlg.quiz) || 'Chưa phân loại'}</b></p>
            <PlacementPicker catalog={catalog} value={dlg.to} manageLink={false} onChange={(to) => setDlg({ ...dlg, to })} />
            <p className="muted small" style={{ margin: 0 }}>
              Sẽ chuyển tới: <b>{pathOf(catalog, dlg.to) || 'Chưa phân loại'}</b>.
              {!catalog.subjects.length && ' Chưa có môn học nào: hãy thêm môn ở cây danh mục bên trái trước.'}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
