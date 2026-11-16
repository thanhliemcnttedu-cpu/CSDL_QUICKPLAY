// Cây danh mục của Thư viện công cộng (chỉ xem): dựng từ bộ mặc định của Quickplay và lớp + môn ghi trên bộ đề công khai.
// Dùng chung ở trang Thư viện và bộ chọn đề của "Dạy học trên lớp".
import type { Catalog, QuizSummary } from './types';
import { BUILTIN_QUIZZES } from './factory';
import { addSubject, emptyCatalog, ensurePath, subjectsOfGrade, type Placement } from './catalog';

export function buildPublicCatalog(pub: QuizSummary[]): { cat: Catalog; place: Map<string, Placement> } {
  let cat: Catalog = emptyCatalog();
  const place = new Map<string, Placement>();
  for (const b of BUILTIN_QUIZZES) {
    const r = ensurePath(cat, ...b.path, b.grade);
    cat = r.catalog;
    place.set(b.id, r.placement);
  }
  for (const q of pub) {
    const name = (q.subject ?? '').trim();
    if (!name) continue; // không ghi môn → "Chưa phân loại"
    const grade = (q.grade ?? '').replace(/\s+/g, ' ').trim();
    try {
      let s = subjectsOfGrade(cat, grade).find((x) => x.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'));
      if (!s) {
        const r = addSubject(cat, name, grade);
        cat = r.catalog;
        s = cat.subjects.find((x) => x.id === r.id)!;
      }
      place.set(q.id, { subject_id: s.id });
    } catch { /* tên môn không hợp lệ: để ở Chưa phân loại */ }
  }
  return { cat, place };
}
