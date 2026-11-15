import { describe, expect, it } from 'vitest';
import type { Catalog, Question, Quiz } from './types';
import { ALL, NONE, addChapter, addLesson, addSubject, countByNode, emptyCatalog, ensurePath, findNode, inNode, normalizeCatalog, pathOf, placementOf, removeNode, renameNode } from './catalog';
import { BUILTIN_QUIZZES, builtinQuiz, englishDemoQuiz, isBuiltinId, vietnameseDemoQuiz } from './factory';
import { gradeRatio, validateQuestion, type Answer } from './grading';

function sample() {
  let c: Catalog = emptyCatalog();
  const tv = addSubject(c, '  Tiếng   Việt ');
  c = tv.catalog;
  const ta = addSubject(c, 'Tiếng Anh');
  c = ta.catalog;
  const ch = addChapter(c, tv.id, 'Chủ đề 1');
  c = ch.catalog;
  const b1 = addLesson(c, ch.id, 'Bài 1');
  c = b1.catalog;
  const b2 = addLesson(c, ch.id, 'Bài 2');
  c = b2.catalog;
  return { c, tv: tv.id, ta: ta.id, ch: ch.id, b1: b1.id, b2: b2.id };
}

describe('Danh mục Môn › Chương › Bài', () => {
  it('thêm môn, chương, bài; gọn khoảng trắng và không cho trùng tên', () => {
    const { c, tv, ch } = sample();
    expect(c.subjects.map((s) => s.name)).toEqual(['Tiếng Việt', 'Tiếng Anh']);
    expect(c.subjects[0].chapters[0].lessons.map((l) => l.name)).toEqual(['Bài 1', 'Bài 2']);
    expect(() => addSubject(c, 'tiếng việt')).toThrow();
    expect(() => addSubject(c, '   ')).toThrow();
    expect(() => addChapter(c, tv, 'chủ đề 1')).toThrow();
    expect(() => addLesson(c, ch, 'BÀI 2')).toThrow();
    expect(() => addChapter(c, 'khong_co', 'X')).toThrow();
    expect(() => addLesson(c, tv, 'X')).toThrow(); // bài phải nằm trong chương, không nằm thẳng trong môn
  });

  it('đổi tên nút ở mọi cấp, không đổi id', () => {
    const { c, tv, ch, b1 } = sample();
    const r = renameNode(renameNode(renameNode(c, tv, 'Ngữ văn'), ch, 'Chương I'), b1, 'Bài mở đầu');
    expect(findNode(r, tv)!.subject.name).toBe('Ngữ văn');
    expect(findNode(r, ch)!.chapter!.name).toBe('Chương I');
    expect(findNode(r, b1)!.lesson!.name).toBe('Bài mở đầu');
    expect(() => renameNode(c, tv, ' ')).toThrow();
    expect(findNode(c, tv)!.subject.name).toBe('Tiếng Việt'); // hàm thuần: bản gốc không đổi
  });

  it('xóa môn thì chương và bài con mất theo; xóa bài chỉ mất bài đó', () => {
    const { c, tv, ta, ch, b1, b2 } = sample();
    const r = removeNode(c, tv);
    expect(r.removed.sort()).toEqual([tv, ch, b1, b2].sort());
    expect(r.catalog.subjects.map((s) => s.id)).toEqual([ta]);
    for (const id of [tv, ch, b1, b2]) expect(findNode(r.catalog, id)).toBeNull();
    const one = removeNode(c, b1);
    expect(one.removed).toEqual([b1]);
    expect(findNode(one.catalog, b2)).not.toBeNull();
    expect(removeNode(c, ch).removed.sort()).toEqual([ch, b1, b2].sort());
  });

  it('đếm số bộ đề theo nút; môn gồm cả chương và bài con; id đã xóa tính là chưa phân loại', () => {
    const { c, tv, ta, ch, b1, b2 } = sample();
    const quizzes = [
      { subject_id: tv, chapter_id: ch, lesson_id: b1 },
      { subject_id: tv, chapter_id: ch, lesson_id: b1 },
      { subject_id: tv, chapter_id: ch, lesson_id: b2 },
      { subject_id: tv, chapter_id: ch },
      { subject_id: tv },
      { subject_id: ta },
      {},
      { subject_id: 'da_xoa', chapter_id: ch },
    ];
    const n = countByNode(c, quizzes);
    expect(n[ALL]).toBe(8);
    expect(n[NONE]).toBe(2);
    expect(n[tv]).toBe(5);
    expect(n[ch]).toBe(4);
    expect(n[b1]).toBe(2);
    expect(n[b2]).toBe(1);
    expect(n[ta]).toBe(1);
    expect(quizzes.filter((q) => inNode(c, q, tv)).length).toBe(5);
    expect(quizzes.filter((q) => inNode(c, q, NONE)).length).toBe(2);
    expect(quizzes.filter((q) => inNode(c, q, ALL)).length).toBe(8);
    // Xóa môn: bộ đề không mất, chỉ trở về "Chưa phân loại"
    const after = countByNode(removeNode(c, tv).catalog, quizzes);
    expect(after[ALL]).toBe(8);
    expect(after[NONE]).toBe(7);
  });

  it('đường dẫn "Môn › Chương › Bài" và vị trí gán cho bộ đề', () => {
    const { c, tv, ch, b1 } = sample();
    expect(pathOf(c, { subject_id: tv, chapter_id: ch, lesson_id: b1 })).toBe('Tiếng Việt › Chủ đề 1 › Bài 1');
    expect(pathOf(c, { subject_id: tv, chapter_id: ch })).toBe('Tiếng Việt › Chủ đề 1');
    expect(pathOf(c, { subject_id: tv, lesson_id: b1 })).toBe('Tiếng Việt'); // thiếu chương thì bỏ qua bài
    expect(pathOf(c, {})).toBe('');
    expect(pathOf(c, { subject_id: 'x' })).toBe('');
    expect(placementOf(c, b1)).toEqual({ subject_id: tv, chapter_id: ch, lesson_id: b1, subject: 'Tiếng Việt' });
    expect(placementOf(c, tv)).toEqual({ subject_id: tv, chapter_id: undefined, lesson_id: undefined, subject: 'Tiếng Việt' });
    expect(placementOf(c, 'x')).toBeNull();
  });

  it('ensurePath không tạo trùng khi gọi lại', () => {
    const p = BUILTIN_QUIZZES[0].path;
    const a = ensurePath(emptyCatalog(), ...p);
    const b = ensurePath(a.catalog, p[0].toUpperCase(), p[1], p[2]);
    expect(b.catalog).toBe(a.catalog);
    expect(b.placement).toEqual(a.placement);
    expect(pathOf(a.catalog, a.placement)).toBe(p.join(' › '));
    const both = ensurePath(a.catalog, ...BUILTIN_QUIZZES[1].path).catalog;
    expect(both.subjects.map((s) => s.name)).toEqual(['Tiếng Việt', 'Tiếng Anh']);
  });

  it('chuẩn hóa dữ liệu hỏng đọc từ kho', () => {
    expect(normalizeCatalog(null)).toEqual({ subjects: [], updated_at: undefined });
    const c = normalizeCatalog({ subjects: [{ id: 's1', name: ' Toán ', chapters: [{ id: 'c1', name: 'Chương 1' }, { id: 5, name: 'hỏng' }] }, { name: 'thiếu id' }, 'x'] });
    expect(c.subjects).toEqual([{ id: 's1', name: 'Toán', chapters: [{ id: 'c1', name: 'Chương 1', lessons: [] }] }]);
  });
});

/** Đáp án mẫu của một câu, để chấm thử. */
function modelAnswer(q: Question): Answer {
  switch (q.type) {
    case 'single_choice':
    case 'multiple_select':
    case 'true_false':
      return { kind: 'choice', option_ids: q.options.filter((o) => o.is_correct).map((o) => o.option_id) };
    case 'fill_blank':
      return { kind: 'fill', values: Object.fromEntries(q.blanks!.map((b) => [b.blank_id, b.accepted[0]])) };
    case 'reorder':
      return { kind: 'order', option_ids: q.options.slice().sort((a, b) => a.order_index! - b.order_index!).map((o) => o.option_id) };
    case 'matching':
      return { kind: 'match', pairs: Object.fromEntries(q.options.filter((o) => o.side === 'left').map((l) => [l.option_id, q.options.find((r) => r.side === 'right' && r.match_pair_id === l.match_pair_id)!.option_id])) };
    default:
      return { kind: 'oral' };
  }
}
const fillMode = (q: Question) => q.fill_mode ?? 'type';

describe('Bộ câu hỏi mặc định của Quickplay', () => {
  it('có đúng 2 bộ, id cố định, tên "Tiếng Việt 1" và "Tiếng Anh 1"', () => {
    expect(BUILTIN_QUIZZES.map((b) => b.id)).toEqual(['builtin_tieng_viet_1', 'builtin_tieng_anh_1']);
    expect(BUILTIN_QUIZZES.map((b) => b.title)).toEqual(['Tiếng Việt 1', 'Tiếng Anh 1']);
    for (const b of BUILTIN_QUIZZES) {
      expect(isBuiltinId(b.id)).toBe(true);
      const q = builtinQuiz(b.id)!;
      expect(q.id).toBe(b.id);
      expect(q.title).toBe(b.title);
      expect(q.subject).toBe(b.path[0]);
    }
    expect(builtinQuiz('builtin_khong_co')).toBeNull();
    expect(isBuiltinId('quiz_abc')).toBe(false);
    expect(vietnameseDemoQuiz().id).toBe('builtin_tieng_viet_1');
    expect(englishDemoQuiz().id).toBe('builtin_tieng_anh_1');
  });

  const each: [string, () => Quiz][] = [['Tiếng Việt 1', vietnameseDemoQuiz], ['Tiếng Anh 1', englishDemoQuiz]];
  for (const [name, make] of each) {
    describe(name, () => {
      const quiz = make();
      const qs = quiz.questions;

      it('đủ 7 dạng câu hỏi và 3 cách điền chỗ trống, có câu 2 chỗ trống, có hình tự vẽ', () => {
        expect(new Set(qs.map((q) => q.type))).toEqual(new Set(['single_choice', 'multiple_select', 'true_false', 'fill_blank', 'reorder', 'matching', 'oral']));
        const fills = qs.filter((q) => q.type === 'fill_blank');
        expect(new Set(fills.map(fillMode))).toEqual(new Set(['type', 'bank', 'menu']));
        expect(fills.some((q) => q.blanks!.length === 2)).toBe(true);
        const typed = fills.find((q) => fillMode(q) === 'type')!;
        expect(typed.blanks![0].ignore_accents).toBe(true);
        expect(typed.blanks![0].accepted.length).toBeGreaterThan(1);
        expect(fills.find((q) => fillMode(q) === 'bank')!.distractors!.length).toBeGreaterThan(0);
        expect(fills.find((q) => fillMode(q) === 'menu')!.distractors!.length).toBeGreaterThan(0);
        expect(qs.some((q) => q.type === 'single_choice' && q.stem.image_url?.startsWith('data:image/svg+xml') && q.stem.image_alt)).toBe(true);
        expect(qs.find((q) => q.type === 'multiple_select')!.scoring).toBe('partial');
      });

      it('mọi câu hợp lệ, có lời giải thích, mỗi câu 10 điểm (tổng 100)', () => {
        for (const q of qs) {
          expect(validateQuestion(q), `${q.type}: ${q.stem.text}`).toEqual([]);
          expect(q.explanation).toBeTruthy();
          expect(q.points).toBe(10);
          expect(q.time_limit_seconds).toBeGreaterThanOrEqual(20);
        }
        expect(qs.length).toBe(10);
        expect(qs.reduce((s, q) => s + q.points, 0)).toBe(100);
        expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
      });

      it('chấm đúng đáp án mẫu của mọi câu tự chấm; trả lời miệng chờ giáo viên chấm', () => {
        for (const q of qs) expect(gradeRatio(q, modelAnswer(q)), q.stem.text).toBe(q.type === 'oral' ? 0 : 1);
        // Sai thì không được điểm; chọn thiếu ở câu nhiều đáp án được một nửa
        const ms = qs.find((q) => q.type === 'multiple_select')!;
        expect(gradeRatio(ms, { kind: 'choice', option_ids: [ms.options.find((o) => o.is_correct)!.option_id] })).toBe(0.5);
        const sc = qs.find((q) => q.type === 'single_choice')!;
        expect(gradeRatio(sc, { kind: 'choice', option_ids: [sc.options.find((o) => !o.is_correct)!.option_id] })).toBe(0);
        const two = qs.find((q) => q.type === 'fill_blank' && q.blanks!.length === 2)!;
        expect(gradeRatio(two, { kind: 'fill', values: { blank_1: two.blanks![0].accepted[0], blank_2: 'sai' } })).toBe(0.5);
      });
    });
  }

  it('gõ không dấu và cách viết khác vẫn được chấm đúng', () => {
    const vi = vietnameseDemoQuiz().questions.find((q) => q.type === 'fill_blank' && fillMode(q) === 'type')!;
    expect(gradeRatio(vi, { kind: 'fill', values: { blank_1: 'ha noi' } })).toBe(1);
    expect(gradeRatio(vi, { kind: 'fill', values: { blank_1: 'Thủ đô Hà Nội' } })).toBe(1);
    expect(gradeRatio(vi, { kind: 'fill', values: { blank_1: 'Huế' } })).toBe(0);
    const en = englishDemoQuiz().questions.find((q) => q.type === 'fill_blank' && fillMode(q) === 'type')!;
    expect(gradeRatio(en, { kind: 'fill', values: { blank_1: 'Little' } })).toBe(1);
  });
});
