import { describe, expect, it } from 'vitest';
import type { Question } from './types';
import { autoComment, fmtPoint, pointEach, sectionsOf, sheetNumbers, sheetTitle, sheetYear, subjectLine, vnDate } from './paperSheet';
import { isSchoolYear, normalizeSchoolYear, schoolYearOf, schoolYearChoices } from './examPaper';
import * as logic from './sessionLogic';

const q = (id: string, type: Question['type']): Question => ({ id, type, time_limit_seconds: 30, points: 1000, stem: { text: id }, options: [] });

describe('"Đề giấy"', () => {
  it('chia phần theo dạng câu, giữ thứ tự xuất hiện; đánh số câu theo thứ tự các phần', () => {
    const order = [q('a', 'single_choice'), q('b', 'true_false'), q('c', 'single_choice'), q('d', 'fill_blank'), q('e', 'true_false')];
    const secs = sectionsOf(order);
    expect(secs.map((s) => [s.type, s.items])).toEqual([['single_choice', [0, 2]], ['true_false', [1, 4]], ['fill_blank', [3]]]);
    const nos = sheetNumbers(secs);
    expect([0, 2, 1, 4, 3].map((i) => nos.get(i))).toEqual([1, 2, 3, 4, 5]);
  });

  it('điểm mỗi câu bằng nhau trên thang 10, viết kiểu Việt Nam', () => {
    expect(fmtPoint(pointEach(40))).toBe('0,25');
    expect(fmtPoint(pointEach(20) * 8)).toBe('4');
    expect(fmtPoint(pointEach(3))).toBe('3,33');
    expect(pointEach(0)).toBe(0);
  });

  it('ngày tháng, năm học, tiêu đề, dòng môn', () => {
    expect(vnDate(new Date(2026, 10, 16))).toBe('Thứ Hai ngày 16 tháng 11 năm 2026');
    expect(vnDate(new Date(2026, 10, 15))).toBe('Chủ nhật ngày 15 tháng 11 năm 2026');
    expect(schoolYearOf(new Date(2026, 10, 16))).toBe('2026–2027');
    expect(schoolYearOf(new Date(2027, 2, 1))).toBe('2026–2027');
    expect(schoolYearOf(new Date(2027, 7, 15))).toBe('2027–2028');
    expect(schoolYearChoices(new Date(2026, 10, 16))).toEqual(['2025–2026', '2026–2027', '2027–2028']);
    expect(sheetYear('2025–2026', new Date(2026, 10, 16))).toBe('2025–2026');
    expect(sheetYear(undefined, new Date(2026, 10, 16))).toBe('2026–2027');
    expect(sheetTitle('gk1')).toBe('Đề kiểm tra giữa kì I');
    expect(sheetTitle(undefined)).toBe('Bài kiểm tra');
    expect(subjectLine('Toán', 'Lớp 5')).toBe('Môn: Toán – Lớp 5');
    expect(subjectLine(undefined, undefined)).toBe('');
  });

  it('năm học thầy cô tự gõ được chuẩn hóa và kiểm tra', () => {
    expect(normalizeSchoolYear('2026-2027')).toBe('2026–2027');
    expect(normalizeSchoolYear(' 2026 / 2027 ')).toBe('2026–2027');
    expect(normalizeSchoolYear('2026-27')).toBe('2026–2027');
    expect(normalizeSchoolYear('năm nay')).toBe('năm nay');
    expect(isSchoolYear('2026-2027')).toBe(true);
    expect(isSchoolYear('2026–2028')).toBe(false);
    expect(isSchoolYear('2026')).toBe(false);
  });

  it('lời phê tự động theo mức, nhắc phần chờ chấm', () => {
    expect(autoComment('excellent', false)).toMatch(/rất tốt/);
    expect(autoComment('effort', true)).toMatch(/chờ thầy cô chấm/);
  });

  it('cài đặt phòng thi: chỉ giữ kiểu "Đề giấy" khi làm cả bài trên một trang', () => {
    const base = { mode: 'exam' as const, music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: false, power_ups: false };
    expect(logic.examSettings({ ...base, exam_layout: 'page', exam_style: 'paper' }).exam_style).toBe('paper');
    expect(logic.examSettings({ ...base, exam_layout: 'one', exam_style: 'paper' }).exam_style).toBeUndefined();
  });
});
