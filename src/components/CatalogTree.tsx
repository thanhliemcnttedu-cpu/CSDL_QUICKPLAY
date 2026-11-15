// Cây danh mục của giáo viên: Môn học → Chương/Chủ đề → Bài, và bộ ba ô chọn vị trí cho một bộ đề.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronRight, FileText, FolderPlus, Inbox, Layers, LibraryBig, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Catalog } from '../lib/types';
import { ALL, NONE, MAX_NAME, addChapter, addLesson, addSubject, findNode, idsUnder, removeNode, renameNode, resolve, type NodeKind, type Placement } from '../lib/catalog';
import { Modal, askConfirm } from './ui';
import '../catalog.css';

const KIND_LABEL: Record<NodeKind, string> = { subject: 'môn học', chapter: 'chương / chủ đề', lesson: 'bài' };

type NameDialog =
  | { mode: 'add'; kind: NodeKind; parentId?: string; parentName?: string }
  | { mode: 'rename'; kind: NodeKind; id: string; old: string };

export function CatalogTree({ catalog, counts, selected, onSelect, onChange, footer }: {
  catalog: Catalog;
  counts: Record<string, number>;
  selected: string;
  onSelect: (id: string) => void;
  /** Lưu danh mục mới. removed: id các nút vừa bị xóa (để nơi gọi bỏ chọn nếu cần). */
  onChange: (next: Catalog, removed?: string[]) => void;
  footer?: React.ReactNode;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [dlg, setDlg] = useState<NameDialog | null>(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const toggle = (id: string) => setClosed((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const open = (d: NameDialog) => {
    setDlg(d);
    setName(d.mode === 'rename' ? d.old : '');
    setErr('');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!dlg) return;
    try {
      if (dlg.mode === 'rename') onChange(renameNode(catalog, dlg.id, name));
      else {
        const r = dlg.kind === 'subject' ? addSubject(catalog, name) : dlg.kind === 'chapter' ? addChapter(catalog, dlg.parentId!, name) : addLesson(catalog, dlg.parentId!, name);
        if (dlg.parentId) setClosed((s) => { const n = new Set(s); n.delete(dlg.parentId!); return n; });
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

  const row = (o: { id: string; label: string; depth: number; icon: React.ReactNode; kind?: NodeKind; hasKids?: boolean; childKind?: NodeKind }) => {
    const on = selected === o.id;
    const isClosed = closed.has(o.id);
    return (
      <div className={`cat-row d${o.depth} ${on ? 'on' : ''}`} key={o.id}>
        {o.childKind ? (
          <button type="button" className="cat-tog" onClick={() => toggle(o.id)} aria-label={isClosed ? `Mở ${o.label}` : `Thu gọn ${o.label}`} aria-expanded={!isClosed} disabled={!o.hasKids}>
            {o.hasKids ? (isClosed ? <ChevronRight size={16} /> : <ChevronDown size={16} />) : <span className="cat-dot" />}
          </button>
        ) : <span className="cat-tog" aria-hidden />}
        <button type="button" className="cat-name" onClick={() => onSelect(o.id)} aria-current={on ? 'true' : undefined} title={o.label}>
          {o.icon}<span>{o.label}</span><em>{counts[o.id] ?? 0}</em>
        </button>
        {o.kind && (
          <span className="cat-acts">
            {o.childKind && (
              <button type="button" onClick={() => open({ mode: 'add', kind: o.childKind!, parentId: o.id, parentName: o.label })} aria-label={`Thêm ${KIND_LABEL[o.childKind]} trong ${o.label}`} title={`Thêm ${KIND_LABEL[o.childKind]}`}><Plus size={15} /></button>
            )}
            <button type="button" onClick={() => open({ mode: 'rename', kind: o.kind!, id: o.id, old: o.label })} aria-label={`Đổi tên ${o.label}`} title="Đổi tên"><Pencil size={14} /></button>
            <button type="button" className="del" onClick={() => remove(o.id)} aria-label={`Xóa ${o.label}`} title="Xóa (không xóa bộ đề)"><Trash2 size={14} /></button>
          </span>
        )}
      </div>
    );
  };

  return (
    <nav className="cat-tree" aria-label="Danh mục môn học">
      {row({ id: ALL, label: 'Tất cả bộ đề', depth: 0, icon: <LibraryBig size={16} /> })}
      {row({ id: NONE, label: 'Chưa phân loại', depth: 0, icon: <Inbox size={16} /> })}
      <div className="cat-sep"><span>Môn học</span></div>
      {catalog.subjects.length === 0 && <p className="cat-empty">Chưa có môn học nào. Thêm môn, rồi thêm chương hoặc chủ đề và các bài để xếp bộ đề cho gọn.</p>}
      {catalog.subjects.map((s) => (
        <div key={s.id}>
          {row({ id: s.id, label: s.name, depth: 0, icon: <BookOpen size={16} />, kind: 'subject', childKind: 'chapter', hasKids: s.chapters.length > 0 })}
          {!closed.has(s.id) && s.chapters.map((c) => (
            <div key={c.id}>
              {row({ id: c.id, label: c.name, depth: 1, icon: <Layers size={15} />, kind: 'chapter', childKind: 'lesson', hasKids: c.lessons.length > 0 })}
              {!closed.has(c.id) && c.lessons.map((l) => row({ id: l.id, label: l.name, depth: 2, icon: <FileText size={15} />, kind: 'lesson' }))}
            </div>
          ))}
        </div>
      ))}
      <button type="button" className="btn sm cat-add" onClick={() => open({ mode: 'add', kind: 'subject' })}><FolderPlus size={16} /> Thêm môn học</button>
      {footer}

      {dlg && (
        <Modal
          title={dlg.mode === 'rename' ? `Đổi tên ${KIND_LABEL[dlg.kind]}` : dlg.kind === 'subject' ? 'Thêm môn học' : `Thêm ${KIND_LABEL[dlg.kind]} trong "${dlg.parentName}"`}
          onClose={() => setDlg(null)}
          footer={<><button type="button" className="btn" onClick={() => setDlg(null)}>Hủy</button><button type="submit" form="cat-name-form" className="btn primary">{dlg.mode === 'rename' ? 'Lưu tên mới' : 'Thêm'}</button></>}
        >
          <form id="cat-name-form" className="stack" onSubmit={submit}>
            <label className="field">
              <span>Tên {KIND_LABEL[dlg.kind]}</span>
              <input
                className="input" autoFocus maxLength={MAX_NAME} value={name} onChange={(e) => { setName(e.target.value); setErr(''); }}
                placeholder={dlg.kind === 'subject' ? 'VD: Tiếng Việt' : dlg.kind === 'chapter' ? 'VD: Chủ đề 1: Em yêu trường em' : 'VD: Bài 1: Ôn tập từ và câu'}
                aria-invalid={!!err}
              />
            </label>
            {err && <div className="alert error" role="alert"><div>{err}</div></div>}
            {dlg.mode === 'rename' && <p className="muted small" style={{ margin: 0 }}>Đổi tên không làm thay đổi các bộ đề bên trong.</p>}
          </form>
        </Modal>
      )}
    </nav>
  );
}

/** Ba ô chọn phụ thuộc nhau: Môn học → Chương/Chủ đề → Bài. Trả về vị trí mới kèm tên môn (để ghi vào trường subject dạng chữ). */
export function PlacementPicker({ catalog, value, onChange, legacySubject, manageLink = true }: {
  catalog: Catalog;
  value: Placement;
  onChange: (p: Placement & { subject?: string }) => void;
  /** Tên môn dạng chữ của bộ đề cũ (chưa gắn vào danh mục) */
  legacySubject?: string;
  manageLink?: boolean;
}) {
  const f = resolve(catalog, value);
  const subject = f?.subject;
  const chapter = f?.chapter;
  const lesson = f?.lesson;
  return (
    <div className="place-pick">
      <label className="field">
        <span>Môn học</span>
        <select className="input" value={subject?.id ?? ''} onChange={(e) => {
          const s = catalog.subjects.find((x) => x.id === e.target.value);
          onChange(s ? { subject_id: s.id, subject: s.name } : {});
        }}>
          <option value="">Chưa phân loại</option>
          {catalog.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Chương / Chủ đề</span>
        <select className="input" value={chapter?.id ?? ''} disabled={!subject || !subject.chapters.length} onChange={(e) => onChange({ subject_id: subject!.id, subject: subject!.name, chapter_id: e.target.value || undefined })}>
          <option value="">{subject && !subject.chapters.length ? 'Môn này chưa có chương' : 'Không chọn'}</option>
          {subject?.chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Bài</span>
        <select className="input" value={lesson?.id ?? ''} disabled={!chapter || !chapter.lessons.length} onChange={(e) => onChange({ subject_id: subject!.id, subject: subject!.name, chapter_id: chapter!.id, lesson_id: e.target.value || undefined })}>
          <option value="">{chapter && !chapter.lessons.length ? 'Chương này chưa có bài' : 'Không chọn'}</option>
          {chapter?.lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      {(!subject && legacySubject) || (manageLink && !catalog.subjects.length) ? (
        <p className="place-note muted small">
          {!subject && legacySubject && <>Bộ đề này đang ghi môn "{legacySubject}" nhưng chưa được xếp vào danh mục. </>}
          {manageLink && !catalog.subjects.length && <>Chưa có môn học nào trong danh mục. <Link to="/teacher">Mở Thư viện để thêm môn, chương, bài</Link>.</>}
        </p>
      ) : null}
    </div>
  );
}
