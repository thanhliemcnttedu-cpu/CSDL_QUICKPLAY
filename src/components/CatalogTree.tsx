// Cây danh mục của giáo viên: Khối lớp → Môn học → Chương/Chủ đề → Bài, và các ô chọn vị trí cho một bộ đề.
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronRight, FileText, FolderPlus, GraduationCap, Inbox, Layers, LibraryBig, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Catalog } from '../lib/types';
import {
  ALL, NONE, MAX_NAME, UNGRADED, addChapter, addGrade, addLesson, addSubject, findNode, gradeId, gradesOf, idsUnder, removeGrade, removeNode, renameGrade, renameNode,
  resolve, setSubjectGrade, subjectsOfGrade, type NodeKind, type Placement,
} from '../lib/catalog';
import { Modal, askConfirm } from './ui';
import '../catalog.css';

type Kind = NodeKind | 'grade';
const KIND_LABEL: Record<Kind, string> = { grade: 'khối lớp', subject: 'môn học', chapter: 'chương / chủ đề', lesson: 'bài' };

type NameDialog =
  | { mode: 'add'; kind: Kind; parentId?: string; parentName?: string; grade?: string }
  | { mode: 'rename'; kind: Kind; id: string; old: string; grade?: string };

export function CatalogTree({ catalog, counts, selected, onSelect, onChange, footer, readOnly }: {
  catalog: Catalog;
  counts: Record<string, number>;
  selected: string;
  onSelect: (id: string) => void;
  /** Lưu danh mục mới. removed: id các nút vừa bị xóa (để nơi gọi bỏ chọn nếu cần). */
  onChange: (next: Catalog, removed?: string[]) => void;
  footer?: React.ReactNode;
  /** Chỉ xem (thư viện công cộng): không có nút thêm / đổi tên / xóa, chỉ hiện các lớp đang có bộ đề */
  readOnly?: boolean;
}) {
  // Mặc định THU GỌN (chỉ hiện các khối lớp, đỡ rối mắt); thầy cô bấm mũi tên để mở nhánh cần xem.
  // Nhánh chứa mục đang chọn tự mở; các nhánh đã mở được nhớ cho lần sau (trên máy này).
  const KEY = readOnly ? 'quickplay.catOpen.pub' : 'quickplay.catOpen';
  const [opened, setOpened] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]') as string[]); } catch { return new Set(); }
  });
  const saveOpened = (n: Set<string>) => { try { localStorage.setItem(KEY, JSON.stringify([...n].slice(-200))); } catch { /* bỏ qua */ } return n; };
  useEffect(() => {
    const f = findNode(catalog, selected);
    if (!f) return;
    const up = [gradeId(f.subject.grade ?? ''), ...(f.kind !== 'subject' ? [f.subject.id] : []), ...(f.kind === 'lesson' && f.chapter ? [f.chapter.id] : [])];
    setOpened((s) => (up.every((id) => s.has(id)) ? s : saveOpened(new Set([...s, ...up]))));
  }, [selected, catalog]); // eslint-disable-line react-hooks/exhaustive-deps
  const closed = { has: (id: string) => !opened.has(id) };
  const [dlg, setDlg] = useState<NameDialog | null>(null);
  const [name, setName] = useState('');
  const [toGrade, setToGrade] = useState(''); // đổi tên môn: có thể chuyển môn sang lớp khác
  const [err, setErr] = useState('');
  const grades = gradesOf(catalog).filter((g) => !readOnly || subjectsOfGrade(catalog, g).length > 0);
  const ungraded = subjectsOfGrade(catalog, '');

  const toggle = (id: string) => setOpened((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return saveOpened(n);
  });
  const expand = (id?: string) => id && setOpened((s) => saveOpened(new Set([...s, id])));
  const open = (d: NameDialog) => {
    setDlg(d);
    setName(d.mode === 'rename' ? d.old : '');
    setToGrade(d.grade ?? '');
    setErr('');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!dlg) return;
    try {
      if (dlg.mode === 'rename') {
        if (dlg.kind === 'grade') {
          const next = renameGrade(catalog, dlg.old, name);
          onChange(next);
          if (selected === gradeId(dlg.old)) onSelect(gradeId(name.replace(/\s+/g, ' ').trim()));
        } else {
          let next = renameNode(catalog, dlg.id, name);
          if (dlg.kind === 'subject' && toGrade !== (dlg.grade ?? '')) next = setSubjectGrade(next, dlg.id, toGrade);
          onChange(next);
        }
      } else if (dlg.kind === 'grade') {
        const next = addGrade(catalog, name);
        onChange(next);
        onSelect(gradeId(gradesOf(next).at(-1)!));
      } else {
        const r = dlg.kind === 'subject' ? addSubject(catalog, name, toGrade) : dlg.kind === 'chapter' ? addChapter(catalog, dlg.parentId!, name) : addLesson(catalog, dlg.parentId!, name);
        expand(dlg.kind === 'subject' ? gradeId(toGrade) : dlg.parentId);
        onChange(r.catalog);
        onSelect(r.id);
      }
      setDlg(null);
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };
  const remove = async (id: string) => {
    const f = findNode(catalog, id);
    if (!f) return;
    const nodeName = f.lesson?.name ?? f.chapter?.name ?? f.subject.name;
    const inside = idsUnder(catalog, id).length - 1;
    const quizzes = counts[id] ?? 0;
    const msg =
      `Xóa ${KIND_LABEL[f.kind]} "${nodeName}"${inside ? ` cùng ${inside} mục con bên trong` : ''}?\n\n` +
      (quizzes ? `${quizzes} bộ đề đang nằm trong mục này KHÔNG bị xóa: chúng sẽ chuyển về "Chưa phân loại".` : 'Không có bộ đề nào bị xóa.');
    if (!(await askConfirm(msg, { danger: true, okLabel: 'Xóa mục này' }))) return;
    const r = removeNode(catalog, id);
    onChange(r.catalog, r.removed);
  };
  const dropGrade = async (g: string) => {
    try {
      const next = removeGrade(catalog, g); // lớp còn môn thì báo lỗi, không xóa
      if (!(await askConfirm(`Xóa khối lớp "${g}" khỏi danh mục? (Lớp này chưa có môn học nào.)`, { danger: true, okLabel: 'Xóa lớp này' }))) return;
      onChange(next, [gradeId(g)]);
    } catch (ex) {
      await askConfirm((ex as Error).message, { okLabel: 'Đã hiểu' });
    }
  };

  const row = (o: { id: string; label: string; depth: number; icon: React.ReactNode; hasKids?: boolean; canToggle?: boolean; acts?: React.ReactNode }) => {
    const on = selected === o.id;
    const isClosed = closed.has(o.id);
    return (
      <div className={`cat-row d${o.depth} ${on ? 'on' : ''}`} key={o.id}>
        {o.canToggle ? (
          <button type="button" className="cat-tog" onClick={() => toggle(o.id)} aria-label={isClosed ? `Mở ${o.label}` : `Thu gọn ${o.label}`} aria-expanded={!isClosed} disabled={!o.hasKids}>
            {o.hasKids ? (isClosed ? <ChevronRight size={16} /> : <ChevronDown size={16} />) : <span className="cat-dot" />}
          </button>
        ) : <span className="cat-tog" aria-hidden />}
        <button type="button" className="cat-name" onClick={() => onSelect(o.id)} aria-current={on ? 'true' : undefined} title={o.label}>
          {o.icon}<span>{o.label}</span><em>{counts[o.id] ?? 0}</em>
        </button>
        {o.acts && !readOnly && <span className="cat-acts">{o.acts}</span>}
      </div>
    );
  };
  const nodeActs = (id: string, label: string, kind: NodeKind, childKind?: NodeKind, grade?: string) => (
    <>
      {childKind && <button type="button" onClick={() => open({ mode: 'add', kind: childKind, parentId: id, parentName: label })} aria-label={`Thêm ${KIND_LABEL[childKind]} trong ${label}`} title={`Thêm ${KIND_LABEL[childKind]}`}><Plus size={15} /></button>}
      <button type="button" onClick={() => open({ mode: 'rename', kind, id, old: label, grade })} aria-label={`Đổi tên ${label}`} title={kind === 'subject' ? 'Đổi tên / chuyển lớp' : 'Đổi tên'}><Pencil size={14} /></button>
      <button type="button" className="del" onClick={() => remove(id)} aria-label={`Xóa ${label}`} title="Xóa (không xóa bộ đề)"><Trash2 size={14} /></button>
    </>
  );
  const subjectRows = (g: string, depth: number) => subjectsOfGrade(catalog, g).map((s) => (
    <div key={s.id}>
      {row({ id: s.id, label: s.name, depth, icon: <BookOpen size={16} />, canToggle: true, hasKids: s.chapters.length > 0, acts: nodeActs(s.id, s.name, 'subject', 'chapter', s.grade ?? '') })}
      {!closed.has(s.id) && s.chapters.map((c) => (
        <div key={c.id}>
          {row({ id: c.id, label: c.name, depth: depth + 1, icon: <Layers size={15} />, canToggle: true, hasKids: c.lessons.length > 0, acts: nodeActs(c.id, c.name, 'chapter', 'lesson') })}
          {!closed.has(c.id) && c.lessons.map((l) => row({ id: l.id, label: l.name, depth: depth + 2, icon: <FileText size={15} />, acts: nodeActs(l.id, l.name, 'lesson') }))}
        </div>
      ))}
    </div>
  ));

  return (
    <nav className="cat-tree" aria-label="Danh mục khối lớp, môn học">
      {row({ id: ALL, label: 'Tất cả bộ đề', depth: 0, icon: <LibraryBig size={16} /> })}
      {(!readOnly || (counts[NONE] ?? 0) > 0) && row({ id: NONE, label: 'Chưa phân loại', depth: 0, icon: <Inbox size={16} /> })}
      <div className="cat-sep"><span>Khối lớp</span></div>
      {grades.map((g) => {
        const id = gradeId(g);
        const n = subjectsOfGrade(catalog, g).length;
        return (
          <div key={id}>
            {row({
              id, label: g, depth: 0, icon: <GraduationCap size={17} />, canToggle: true, hasKids: n > 0,
              acts: (
                <>
                  <button type="button" onClick={() => open({ mode: 'add', kind: 'subject', parentName: g, grade: g })} aria-label={`Thêm môn học trong ${g}`} title="Thêm môn học"><Plus size={15} /></button>
                  <button type="button" onClick={() => open({ mode: 'rename', kind: 'grade', id, old: g })} aria-label={`Đổi tên ${g}`} title="Đổi tên"><Pencil size={14} /></button>
                  <button type="button" className="del" onClick={() => dropGrade(g)} aria-label={`Xóa ${g}`} title="Xóa khối lớp (khi chưa có môn)"><Trash2 size={14} /></button>
                </>
              ),
            })}
            {!closed.has(id) && subjectRows(g, 1)}
          </div>
        );
      })}
      {ungraded.length > 0 && (
        <div>
          {row({ id: UNGRADED, label: 'Môn chưa xếp lớp', depth: 0, icon: <Inbox size={16} />, canToggle: true, hasKids: true })}
          {!closed.has(UNGRADED) && subjectRows('', 1)}
          {!closed.has(UNGRADED) && !readOnly && <p className="cat-empty" style={{ paddingLeft: 26 }}>Bấm bút chì cạnh tên môn để chuyển môn vào một khối lớp.</p>}
        </div>
      )}
      {!readOnly && <button type="button" className="btn sm cat-add" onClick={() => open({ mode: 'add', kind: 'grade' })}><FolderPlus size={16} /> Thêm khối lớp</button>}
      {footer}

      {dlg && (
        <Modal
          title={dlg.mode === 'rename' ? `Đổi tên ${KIND_LABEL[dlg.kind]}` : dlg.kind === 'grade' ? 'Thêm khối lớp' : `Thêm ${KIND_LABEL[dlg.kind]} trong "${dlg.parentName}"`}
          onClose={() => setDlg(null)}
          footer={<><button type="button" className="btn" onClick={() => setDlg(null)}>Hủy</button><button type="submit" form="cat-name-form" className="btn primary">{dlg.mode === 'rename' ? 'Lưu' : 'Thêm'}</button></>}
        >
          <form id="cat-name-form" className="stack" onSubmit={submit}>
            <label className="field">
              <span>Tên {KIND_LABEL[dlg.kind]}</span>
              <input
                className="input" autoFocus maxLength={MAX_NAME} value={name} onChange={(e) => { setName(e.target.value); setErr(''); }}
                placeholder={dlg.kind === 'grade' ? 'VD: Lớp 6' : dlg.kind === 'subject' ? 'VD: Tiếng Việt' : dlg.kind === 'chapter' ? 'VD: Chủ đề 1: Em yêu trường em' : 'VD: Bài 1: Ôn tập từ và câu'}
                aria-invalid={!!err}
              />
            </label>
            {dlg.mode === 'rename' && dlg.kind === 'subject' && (
              <label className="field">
                <span>Khối lớp</span>
                <select className="input" value={toGrade} onChange={(e) => { setToGrade(e.target.value); setErr(''); }}>
                  <option value="">Chưa xếp lớp</option>
                  {grades.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
            )}
            {err && <div className="alert error" role="alert"><div>{err}</div></div>}
            {dlg.mode === 'rename' && <p className="muted small" style={{ margin: 0 }}>Đổi tên{dlg.kind === 'subject' ? ' hoặc chuyển lớp' : ''} không làm thay đổi các bộ đề bên trong.</p>}
          </form>
        </Modal>
      )}
    </nav>
  );
}

/** Các ô chọn phụ thuộc nhau: Khối lớp → Môn học → Chương/Chủ đề → Bài. Trả về vị trí mới kèm tên môn và tên lớp (để ghi vào bộ đề). */
export function PlacementPicker({ catalog, value, onChange, legacySubject, legacyGrade, manageLink = true }: {
  catalog: Catalog;
  value: Placement;
  onChange: (p: Placement & { subject?: string; grade?: string }) => void;
  /** Tên môn dạng chữ của bộ đề cũ (chưa gắn vào danh mục) */
  legacySubject?: string;
  /** Khối lớp ghi trong bộ đề (đề nhập từ tệp, tạo từ kho…): chưa gắn danh mục thì ô Khối lớp hiện đúng lớp này, không nhảy về Lớp 1 */
  legacyGrade?: string;
  manageLink?: boolean;
}) {
  const f = resolve(catalog, value);
  const subject = f?.subject;
  const chapter = f?.chapter;
  const lesson = f?.lesson;
  // Lớp đang xem: lớp của môn đã chọn; chưa chọn môn thì theo ô Khối lớp
  const [pickedGrade, setPickedGrade] = useState<string | null>(null);
  const grades = gradesOf(catalog);
  const hasUngraded = subjectsOfGrade(catalog, '').length > 0;
  const own = legacyGrade && grades.includes(legacyGrade) ? legacyGrade : null;
  const grade = subject ? subject.grade ?? '' : pickedGrade ?? own ?? (hasUngraded || !grades.length ? '' : grades.find((g) => subjectsOfGrade(catalog, g).length) ?? grades[0]);
  const subjects = subjectsOfGrade(catalog, grade);
  const at = (p: Placement) => (subject ? { ...p, subject: subject.name, grade: subject.grade } : p);
  return (
    <div className="place-pick">
      <label className="field">
        <span>Khối lớp</span>
        <select className="input" value={grade} onChange={(e) => { setPickedGrade(e.target.value); onChange({}); }}>
          {(hasUngraded || !grades.length) && <option value="">Chưa xếp lớp</option>}
          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Môn học</span>
        <select className="input" value={subject?.id ?? ''} disabled={!subjects.length} onChange={(e) => {
          const s = catalog.subjects.find((x) => x.id === e.target.value);
          onChange(s ? { subject_id: s.id, subject: s.name, grade: s.grade } : {});
        }}>
          <option value="">{subjects.length ? 'Chưa phân loại' : 'Lớp này chưa có môn'}</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Chương / Chủ đề</span>
        <select className="input" value={chapter?.id ?? ''} disabled={!subject || !subject.chapters.length} onChange={(e) => onChange(at({ subject_id: subject!.id, chapter_id: e.target.value || undefined }))}>
          <option value="">{subject && !subject.chapters.length ? 'Môn này chưa có chương' : 'Không chọn'}</option>
          {subject?.chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Bài</span>
        <select className="input" value={lesson?.id ?? ''} disabled={!chapter || !chapter.lessons.length} onChange={(e) => onChange(at({ subject_id: subject!.id, chapter_id: chapter!.id, lesson_id: e.target.value || undefined }))}>
          <option value="">{chapter && !chapter.lessons.length ? 'Chương này chưa có bài' : 'Không chọn'}</option>
          {chapter?.lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      {(!subject && legacySubject) || (manageLink && !catalog.subjects.length) ? (
        <p className="place-note muted small">
          {!subject && legacySubject && <>Bộ đề này đang ghi môn "{legacySubject}" nhưng chưa được xếp vào danh mục. </>}
          {manageLink && !catalog.subjects.length && <>Chưa có môn học nào trong danh mục. <Link to="/teacher">Mở Thư viện để thêm khối lớp, môn, chủ đề, bài</Link>.</>}
        </p>
      ) : null}
    </div>
  );
}
