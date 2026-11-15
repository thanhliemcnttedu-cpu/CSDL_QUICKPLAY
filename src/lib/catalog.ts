// Danh mục của giáo viên: Môn học → Chương/Chủ đề → Bài. Các hàm ở đây là hàm thuần (không gọi máy chủ).
// Bộ đề chỉ giữ id của nút (subject_id, chapter_id, lesson_id). Xóa một nút KHÔNG xóa bộ đề:
// id không còn trong danh mục được coi là "Chưa phân loại".
import type { Catalog, CatalogChapter, CatalogLesson, CatalogSubject } from './types';
import { uid } from './util';

export const ALL = 'all';
export const NONE = 'none';
export const MAX_NAME = 80;

export interface Placement { subject_id?: string; chapter_id?: string; lesson_id?: string }
export type NodeKind = 'subject' | 'chapter' | 'lesson';
export interface Found { kind: NodeKind; subject: CatalogSubject; chapter?: CatalogChapter; lesson?: CatalogLesson }

export const emptyCatalog = (): Catalog => ({ subjects: [] });
const clean = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
const same = (a: string, b: string) => a.toLocaleLowerCase('vi') === b.toLocaleLowerCase('vi');

/** Chuẩn hóa dữ liệu đọc từ kho (bỏ nút hỏng, cắt tên quá dài). */
export function normalizeCatalog(raw: unknown): Catalog {
  const r = raw as Partial<Catalog> | null;
  const list = Array.isArray(r?.subjects) ? r!.subjects : [];
  const node = (x: unknown) => !!x && typeof (x as { id?: unknown }).id === 'string' && typeof (x as { name?: unknown }).name === 'string' && !!clean((x as { name: string }).name);
  return {
    subjects: list.filter(node).map((s) => ({
      id: s.id,
      name: clean(s.name),
      chapters: (Array.isArray(s.chapters) ? s.chapters : []).filter(node).map((c) => ({
        id: c.id,
        name: clean(c.name),
        lessons: (Array.isArray(c.lessons) ? c.lessons : []).filter(node).map((l) => ({ id: l.id, name: clean(l.name) })),
      })),
    })),
    updated_at: typeof r?.updated_at === 'string' ? r.updated_at : undefined,
  };
}

export function findNode(c: Catalog, id: string): Found | null {
  for (const subject of c.subjects) {
    if (subject.id === id) return { kind: 'subject', subject };
    for (const chapter of subject.chapters) {
      if (chapter.id === id) return { kind: 'chapter', subject, chapter };
      for (const lesson of chapter.lessons) if (lesson.id === id) return { kind: 'lesson', subject, chapter, lesson };
    }
  }
  return null;
}

export function addSubject(c: Catalog, name: string): { catalog: Catalog; id: string } {
  const n = clean(name);
  if (!n) throw new Error('Hãy nhập tên môn học.');
  if (c.subjects.some((s) => same(s.name, n))) throw new Error(`Đã có môn "${n}".`);
  const id = uid('sub_');
  return { catalog: { ...c, subjects: [...c.subjects, { id, name: n, chapters: [] }] }, id };
}

export function addChapter(c: Catalog, subjectId: string, name: string): { catalog: Catalog; id: string } {
  const n = clean(name);
  if (!n) throw new Error('Hãy nhập tên chương hoặc chủ đề.');
  const subject = c.subjects.find((s) => s.id === subjectId);
  if (!subject) throw new Error('Không tìm thấy môn học.');
  if (subject.chapters.some((x) => same(x.name, n))) throw new Error(`Môn ${subject.name} đã có "${n}".`);
  const id = uid('ch_');
  return {
    catalog: { ...c, subjects: c.subjects.map((s) => (s.id === subjectId ? { ...s, chapters: [...s.chapters, { id, name: n, lessons: [] }] } : s)) },
    id,
  };
}

export function addLesson(c: Catalog, chapterId: string, name: string): { catalog: Catalog; id: string } {
  const n = clean(name);
  if (!n) throw new Error('Hãy nhập tên bài.');
  const f = findNode(c, chapterId);
  if (!f || f.kind !== 'chapter') throw new Error('Không tìm thấy chương hoặc chủ đề.');
  if (f.chapter!.lessons.some((x) => same(x.name, n))) throw new Error(`"${f.chapter!.name}" đã có bài "${n}".`);
  const id = uid('les_');
  return {
    catalog: {
      ...c,
      subjects: c.subjects.map((s) => ({ ...s, chapters: s.chapters.map((ch) => (ch.id === chapterId ? { ...ch, lessons: [...ch.lessons, { id, name: n }] } : ch)) })),
    },
    id,
  };
}

export function renameNode(c: Catalog, id: string, name: string): Catalog {
  const n = clean(name);
  if (!n) throw new Error('Tên không được để trống.');
  if (!findNode(c, id)) throw new Error('Không tìm thấy mục cần đổi tên.');
  return {
    ...c,
    subjects: c.subjects.map((s) => ({
      ...s,
      name: s.id === id ? n : s.name,
      chapters: s.chapters.map((ch) => ({ ...ch, name: ch.id === id ? n : ch.name, lessons: ch.lessons.map((l) => (l.id === id ? { ...l, name: n } : l)) })),
    })),
  };
}

/** Mọi id nằm trong nút (kể cả chính nó). */
export function idsUnder(c: Catalog, id: string): string[] {
  const f = findNode(c, id);
  if (!f) return [];
  if (f.kind === 'lesson') return [id];
  if (f.kind === 'chapter') return [id, ...f.chapter!.lessons.map((l) => l.id)];
  return [id, ...f.subject.chapters.flatMap((ch) => [ch.id, ...ch.lessons.map((l) => l.id)])];
}

/** Xóa một nút cùng các nút con. Bộ đề bên trong không bị xóa: chúng trở về "Chưa phân loại". */
export function removeNode(c: Catalog, id: string): { catalog: Catalog; removed: string[] } {
  const removed = idsUnder(c, id);
  return {
    catalog: {
      ...c,
      subjects: c.subjects
        .filter((s) => s.id !== id)
        .map((s) => ({ ...s, chapters: s.chapters.filter((ch) => ch.id !== id).map((ch) => ({ ...ch, lessons: ch.lessons.filter((l) => l.id !== id) })) })),
    },
    removed,
  };
}

/** Vị trí HỢP LỆ của bộ đề trong danh mục (bỏ các id đã bị xóa hoặc không khớp cha–con). */
export function resolve(c: Catalog, p: Placement): Found | null {
  const subject = c.subjects.find((s) => s.id === p.subject_id);
  if (!subject) return null;
  const chapter = subject.chapters.find((ch) => ch.id === p.chapter_id);
  if (!chapter) return { kind: 'subject', subject };
  const lesson = chapter.lessons.find((l) => l.id === p.lesson_id);
  return lesson ? { kind: 'lesson', subject, chapter, lesson } : { kind: 'chapter', subject, chapter };
}

/** "Môn › Chương › Bài" của bộ đề; chuỗi rỗng nếu chưa phân loại. */
export function pathOf(c: Catalog, p: Placement): string {
  const f = resolve(c, p);
  return f ? [f.subject.name, f.chapter?.name, f.lesson?.name].filter(Boolean).join(' › ') : '';
}

/** Các trường gán cho bộ đề khi đặt vào một nút (kèm tên môn dạng chữ để các chỗ khác vẫn hiển thị được). */
export function placementOf(c: Catalog, nodeId: string): Required<Pick<Placement, 'subject_id'>> & Placement & { subject: string } | null {
  const f = findNode(c, nodeId);
  if (!f) return null;
  return { subject_id: f.subject.id, chapter_id: f.chapter?.id, lesson_id: f.lesson?.id, subject: f.subject.name };
}

/** Bộ đề có thuộc nút đang chọn không (môn: gồm mọi chương/bài con). */
export function inNode(c: Catalog, p: Placement, selected: string): boolean {
  if (selected === ALL) return true;
  const f = resolve(c, p);
  if (selected === NONE) return !f;
  return !!f && [f.subject.id, f.chapter?.id, f.lesson?.id].includes(selected);
}

/** Số bộ đề theo từng nút, kèm 'all' và 'none'. */
export function countByNode(c: Catalog, quizzes: Placement[]): Record<string, number> {
  const out: Record<string, number> = { [ALL]: quizzes.length, [NONE]: 0 };
  for (const q of quizzes) {
    const f = resolve(c, q);
    if (!f) {
      out[NONE]++;
      continue;
    }
    for (const id of [f.subject.id, f.chapter?.id, f.lesson?.id]) if (id) out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

/** Tìm (không phân biệt hoa thường) hoặc tạo đường dẫn Môn › Chương › Bài; dùng khi thêm dữ liệu mẫu để không tạo trùng. */
export function ensurePath(c: Catalog, subjectName: string, chapterName: string, lessonName: string): { catalog: Catalog; placement: Placement & { subject: string } } {
  let cat = c;
  let subject = cat.subjects.find((s) => same(s.name, clean(subjectName)));
  if (!subject) {
    const r = addSubject(cat, subjectName);
    cat = r.catalog;
    subject = cat.subjects.find((s) => s.id === r.id)!;
  }
  let chapter = subject.chapters.find((ch) => same(ch.name, clean(chapterName)));
  if (!chapter) {
    const r = addChapter(cat, subject.id, chapterName);
    cat = r.catalog;
    chapter = findNode(cat, r.id)!.chapter!;
  }
  let lesson = chapter.lessons.find((l) => same(l.name, clean(lessonName)));
  if (!lesson) {
    const r = addLesson(cat, chapter.id, lessonName);
    cat = r.catalog;
    lesson = findNode(cat, r.id)!.lesson!;
  }
  return { catalog: cat, placement: { subject_id: subject.id, chapter_id: chapter.id, lesson_id: lesson.id, subject: subject.name } };
}
