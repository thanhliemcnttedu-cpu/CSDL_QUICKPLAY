import { describe, expect, it } from 'vitest';
import {
  ALL, DEFAULT_GRADES, UNGRADED, addChapter, addGrade, addLesson, addSubject, countByNode, emptyCatalog, ensurePath, gradeId, gradesOf, inNode, nodeExists, normalizeCatalog,
  pathOf, placementOf, removeGrade, renameGrade, setSubjectGrade, subjectsOfGrade,
} from './catalog';

describe('Cây thư mục: Khối lớp › Môn › Chủ đề › Bài', () => {
  it('mặc định có Lớp 1 đến Lớp 5; thêm, đổi tên, xóa khối lớp', () => {
    let c = emptyCatalog();
    expect(gradesOf(c)).toEqual(DEFAULT_GRADES);
    c = addGrade(c, '  Lớp 6 ');
    expect(gradesOf(c).at(-1)).toBe('Lớp 6');
    expect(() => addGrade(c, 'lớp 6')).toThrow(/Đã có/);
    c = renameGrade(c, 'Lớp 6', 'Khối 6');
    expect(gradesOf(c)).toContain('Khối 6');
    expect(removeGrade(c, 'Khối 6').grades).not.toContain('Khối 6');
  });

  it('cùng tên môn được phép ở các lớp khác nhau, không trùng trong cùng một lớp', () => {
    let c = emptyCatalog();
    const a = addSubject(c, 'Tiếng Việt', 'Lớp 1'); c = a.catalog;
    const b = addSubject(c, 'Tiếng Việt', 'Lớp 2'); c = b.catalog;
    expect(() => addSubject(c, 'tiếng việt', 'Lớp 1')).toThrow(/Lớp 1 đã có môn/);
    expect(subjectsOfGrade(c, 'Lớp 1').map((s) => s.id)).toEqual([a.id]);
    expect(subjectsOfGrade(c, 'Lớp 2').map((s) => s.id)).toEqual([b.id]);
  });

  it('đường dẫn có tên lớp; đếm và lọc bộ đề theo khối lớp', () => {
    let c = emptyCatalog();
    const tv = addSubject(c, 'Tiếng Việt', 'Lớp 1'); c = tv.catalog;
    const ch = addChapter(c, tv.id, 'Chủ đề 1'); c = ch.catalog;
    const b1 = addLesson(c, ch.id, 'Bài 1'); c = b1.catalog;
    const toan = addSubject(c, 'Toán', 'Lớp 2'); c = toan.catalog;
    const q1 = { subject_id: tv.id, chapter_id: ch.id, lesson_id: b1.id }, q2 = { subject_id: toan.id }, q3 = {};
    expect(pathOf(c, q1)).toBe('Lớp 1 › Tiếng Việt › Chủ đề 1 › Bài 1');
    expect(placementOf(c, b1.id)).toMatchObject({ subject: 'Tiếng Việt', grade: 'Lớp 1' });
    expect(placementOf(c, gradeId('Lớp 1'))).toBeNull(); // bộ đề không nằm thẳng trong khối lớp
    const counts = countByNode(c, [q1, q2, q3]);
    expect(counts[gradeId('Lớp 1')]).toBe(1);
    expect(counts[gradeId('Lớp 2')]).toBe(1);
    expect(counts[ALL]).toBe(3);
    expect(inNode(c, q1, gradeId('Lớp 1'))).toBe(true);
    expect(inNode(c, q2, gradeId('Lớp 1'))).toBe(false);
    expect(nodeExists(c, gradeId('Lớp 3'))).toBe(true);
    expect(nodeExists(c, gradeId('Lớp 9'))).toBe(false);
  });

  it('dữ liệu cũ (môn chưa có lớp) vẫn dùng được và chuyển được vào một lớp; lớp còn môn thì không cho xóa', () => {
    let c = normalizeCatalog({ subjects: [{ id: 's1', name: 'Tin học', chapters: [] }] });
    expect(subjectsOfGrade(c, '').map((s) => s.name)).toEqual(['Tin học']);
    expect(nodeExists(c, UNGRADED)).toBe(true);
    expect(pathOf(c, { subject_id: 's1' })).toBe('Tin học');
    c = setSubjectGrade(c, 's1', 'Lớp 3');
    expect(pathOf(c, { subject_id: 's1' })).toBe('Lớp 3 › Tin học');
    expect(nodeExists(c, UNGRADED)).toBe(false);
    expect(() => removeGrade(c, 'Lớp 3')).toThrow(/còn 1 môn học/);
    // lưu rồi đọc lại vẫn giữ lớp
    const again = normalizeCatalog(JSON.parse(JSON.stringify(c)));
    expect(again.subjects[0].grade).toBe('Lớp 3');
    expect(gradesOf(again)).toEqual(gradesOf(c));
  });

  it('dữ liệu mẫu đặt vào đúng lớp và không tạo trùng khi gọi lại', () => {
    const a = ensurePath(emptyCatalog(), 'Tiếng Việt', 'Chủ đề 1', 'Bài 1', 'Lớp 1');
    const b = ensurePath(a.catalog, 'tiếng việt', 'Chủ đề 1', 'Bài 1', 'Lớp 1');
    expect(b.catalog).toEqual(a.catalog);
    expect(pathOf(a.catalog, a.placement)).toBe('Lớp 1 › Tiếng Việt › Chủ đề 1 › Bài 1');
    expect(a.placement.grade).toBe('Lớp 1');
  });
});
