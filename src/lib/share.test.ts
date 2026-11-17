import { describe, expect, it } from 'vitest';
import { autoTargets, namesOf, parseShare, placeShare, placeTargets, shareFileName, SHARE_KIND, withPlace, type ShareFile } from './share';
import { addChapter, addLesson, addSubject, findNode } from './catalog';
import type { Catalog, Question, Quiz } from './types';

const q = (id: string): Quiz['questions'][number] => ({
  id, type: 'single_choice', time_limit_seconds: 20, points: 10, stem: { text: `Câu ${id}` },
  options: [{ option_id: 'o1', text: 'A', is_correct: true }],
});

describe('tệp chia sẻ bộ đề', () => {
  it('đọc đúng tệp chia sẻ và từ chối tệp khác', () => {
    const ok: ShareFile = { app: 'Quickplay', kind: SHARE_KIND, version: 1, exported_at: '', title: 'T', quizzes: [{ title: 'Đề 1', grade: 'Lớp 3', subject: 'Tin học', chapter: 'Chương 1', lesson: 'Bài 1', questions: [q('q1')] }] };
    expect(parseShare(JSON.stringify(ok)).quizzes[0].title).toBe('Đề 1');
    expect(() => parseShare('không phải json')).toThrow(/không phải tệp .json/);
    expect(() => parseShare(JSON.stringify({ app: 'Quickplay', kind: 'backup', version: 2 }))).toThrow(/không phải tệp chia sẻ/);
    expect(() => parseShare(JSON.stringify({ app: 'Quickplay', kind: 'share', version: 1, quizzes: [] }))).toThrow(/không có bộ đề/);
  });

  it('tên tệp có ngày giờ và đuôi .json', () => {
    expect(shareFileName(new Date(2026, 10, 17, 9, 5))).toBe('quickplay-chia-se_17_11_2026_09h05.json');
  });
});

describe('đặt bộ đề vào lớp và môn khi nhập', () => {
  it('tạo môn, chương, bài còn thiếu và dùng lại mục đã có', () => {
    let cat: Catalog = { subjects: [] };
    const s = addSubject(cat, 'Tin học', 'Lớp 3'); cat = s.catalog;
    const c = addChapter(cat, s.id, 'Chương 1'); cat = c.catalog;
    const l = addLesson(cat, c.id, 'Bài 1'); cat = l.catalog;

    const { catalog, placements } = placeShare(cat, [
      { chapter: 'chương 1', lesson: 'Bài 1' }, // trùng không phân biệt hoa thường: dùng lại
      { chapter: 'Chương 2', lesson: 'Bài 9' }, // mới: tạo chương và bài
      { chapter: '', lesson: '' },              // không có chương: chỉ xếp vào môn
    ], 'Lớp 3', 'Tin học');

    expect(placements[0]).toEqual({ subject_id: s.id, chapter_id: c.id, lesson_id: l.id });
    expect(findNode(catalog, placements[1].chapter_id!)?.chapter?.name).toBe('Chương 2');
    expect(findNode(catalog, placements[1].lesson_id!)?.lesson?.name).toBe('Bài 9');
    expect(placements[2]).toEqual({ subject_id: s.id });
    // không tạo môn trùng
    expect(catalog.subjects.filter((x) => x.name === 'Tin học' && x.grade === 'Lớp 3')).toHaveLength(1);
  });

  it('môn cùng tên ở lớp khác là môn khác', () => {
    const { catalog, placements } = placeShare({ subjects: [] }, [{ chapter: '', lesson: '' }], 'Lớp 2', 'Tin học');
    expect(catalog.subjects[0].grade).toBe('Lớp 2');
    expect(placements[0].subject_id).toBe(catalog.subjects[0].id);
  });

  it('bắt buộc chọn lớp và môn', () => {
    expect(() => placeShare({ subjects: [] }, [{ chapter: '', lesson: '' }], '', 'Tin học')).toThrow(/chọn lớp/);
    expect(() => placeShare({ subjects: [] }, [{ chapter: '', lesson: '' }], 'Lớp 3', '  ')).toThrow(/môn học/);
  });
});

describe('đặt từng bộ đề vào vị trí riêng', () => {
  it('chế độ tự động: mỗi bộ đề vào lớp, môn, chương, bài ghi trong tệp', () => {
    const file: ShareFile = { app: 'Quickplay', kind: SHARE_KIND, version: 1, exported_at: '', title: 'T', quizzes: [
      { title: 'A', grade: 'Lớp 1', subject: 'Tiếng Việt', chapter: 'Chủ đề 1', lesson: 'Bài 1', questions: [q('a')] },
      { title: 'B', grade: 'Lớp 3', subject: 'Tin học', chapter: '', lesson: '', questions: [q('b')] },
    ] };
    const { catalog, placements } = placeTargets({ subjects: [] }, autoTargets(file));
    expect(catalog.subjects.map((s) => `${s.grade}|${s.name}`).sort()).toEqual(['Lớp 1|Tiếng Việt', 'Lớp 3|Tin học']);
    expect(findNode(catalog, placements[0].lesson_id!)?.lesson?.name).toBe('Bài 1');
    expect(placements[1]).toEqual({ subject_id: catalog.subjects.find((s) => s.name === 'Tin học')!.id });
  });

  it('chế độ chọn vị trí: mọi bộ đề vào cùng môn đã chọn', () => {
    const { catalog, placements } = placeTargets({ subjects: [] }, [
      { grade: 'Lớp 2', subject: 'Toán', chapter: 'Phép cộng', lesson: '' },
      { grade: 'Lớp 2', subject: 'Toán', chapter: 'Phép cộng', lesson: '' },
    ]);
    expect(catalog.subjects).toHaveLength(1);
    expect(placements[0].subject_id).toBe(placements[1].subject_id);
    expect(placements[0].chapter_id).toBe(placements[1].chapter_id);
  });

  it('bộ đề không có môn thì không đặt được', () => {
    expect(() => placeTargets({ subjects: [] }, [{ grade: 'Lớp 1', subject: ' ', chapter: '', lesson: '' }])).toThrow(/tên môn/);
  });
});

describe('nhãn môn, bài trên từng câu', () => {
  it('câu được đặt sang môn khác mang nhãn môn mới', () => {
    const c: Question = { ...q('q1'), subject: 'Tiếng Việt', lesson: 'Bài 1' };
    expect(withPlace(c, 'Tiếng Anh', '')).toEqual({ ...q('q1'), subject: 'Tiếng Anh' });
    expect(withPlace(c, 'Tiếng Anh', ' Bài  9 ').lesson).toBe('Bài 9');
    expect(c.subject).toBe('Tiếng Việt'); // không sửa đối tượng gốc
  });
});

describe('tên môn, lớp, chương, bài của bộ đề', () => {
  it('lấy theo danh mục hiện tại, không dùng id của máy khác', () => {
    let cat: Catalog = { subjects: [] };
    const s = addSubject(cat, 'Toán', 'Lớp 4'); cat = s.catalog;
    const c = addChapter(cat, s.id, 'Phép cộng'); cat = c.catalog;
    const n = namesOf(cat, { subject_id: s.id, chapter_id: c.id, lesson_id: undefined, subject: 'cũ', grade: '' });
    expect(n).toEqual({ subject: 'Toán', grade: 'Lớp 4', chapter: 'Phép cộng', lesson: '' });
  });
});
