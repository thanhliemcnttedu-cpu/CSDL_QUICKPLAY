import { describe, expect, it } from 'vitest';
import { drawPapers, groupPapers, paperTitle, pickPaper, subjectCode, suggestCode } from './examPaper';
import * as logic from './sessionLogic';
import { analyze, examRows, examSheet } from './analytics';
import type { ClassRoom, QuizSummary, SessionSettings } from './types';

const qs = (id: string, extra: Partial<QuizSummary>): QuizSummary => ({ id, title: id, visibility: 'private', updated_at: '', question_count: 20, ...extra });

describe('đề thi: mã đề, tên đề, gom theo kì kiểm tra', () => {
  it('mã môn viết tắt và mã đề gợi ý không trùng', () => {
    expect(subjectCode('Tin học')).toBe('TIN');
    expect(subjectCode('Tiếng Việt')).toBe('TV');
    expect(subjectCode('Hoạt động trải nghiệm')).toBe('HĐTN'.replace('Đ', 'D'));
    expect(suggestCode('Tin học', 'Lớp 3', 'ck1')).toBe('TIN3-CK1-01');
    expect(suggestCode('Tin học', 'Lớp 3', 'ck1', ['TIN3-CK1-01', 'tin3-ck1-02'])).toBe('TIN3-CK1-03');
  });
  it('tên đề mặc định có thời điểm, môn, lớp và mã đề', () => {
    expect(paperTitle('Tin học', 'Lớp 3', 'ck1', 'TIN3-CK1-01')).toBe('Đề kiểm tra cuối học kì I – Tin học lớp 3 – Mã TIN3-CK1-01');
  });
  it('gom đề theo Khối lớp › Môn › Thời điểm, sắp theo năm học; bộ câu hỏi thường không vào mục Đề thi', () => {
    const g = groupPapers([
      qs('a', { grade: 'Lớp 3', subject: 'Tin học', paper_period: 'ck1', paper_code: 'TIN3-CK1-02' }),
      qs('b', { grade: 'Lớp 3', subject: 'Tin học', paper_period: 'ck1', paper_code: 'TIN3-CK1-01' }),
      qs('c', { grade: 'Lớp 3', subject: 'Tin học', paper_period: 'gk1', paper_code: 'TIN3-GK1-01' }),
      qs('d', { grade: 'Lớp 3', subject: 'Tin học' }),
    ]);
    expect(g.map((x) => [x.period, x.papers.map((p) => p.paper_code)])).toEqual([['gk1', ['TIN3-GK1-01']], ['ck1', ['TIN3-CK1-01', 'TIN3-CK1-02']]]);
  });
  it('bốc ngẫu nhiên k đề không lặp', () => {
    const r = drawPapers(['A', 'B', 'C', 'D'], 2);
    expect(r).toHaveLength(2);
    expect(new Set(r).size).toBe(2);
    expect(drawPapers(['A', 'B'], 5)).toHaveLength(2);
  });
  it('chia học sinh: luôn vào đề ít bạn nhất', () => {
    expect(pickPaper([3, 2])).toBe(1);
    expect(pickPaper([2, 2], () => 0.99)).toBe(1);
    expect(pickPaper([2, 2], () => 0)).toBe(0);
  });
});

describe('phòng thi nhiều đề', () => {
  const names = Array.from({ length: 31 }, (_, i) => `Học sinh ${i + 1}`);
  const cls: ClassRoom = { id: 'c', name: '3A', students: names, codes: names.map((_, i) => `HS${i + 1}`), updated_at: '' };
  const settings: SessionSettings = { mode: 'exam', music: false, shuffle_questions: true, shuffle_options: true, show_leaderboard: false, power_ups: false, exam_minutes: 40 };
  const papers = [{ quiz_id: 'q1', code: 'TIN3-CK1-01', title: 'Đề 1' }, { quiz_id: 'q2', code: 'TIN3-CK1-03', title: 'Đề 3' }];
  it('31 em vào phòng 2 đề: mỗi đề 15 hoặc 16 em, vào lại vẫn giữ đề cũ', () => {
    const s = logic.createSession('111111', 'q1', 'Đề 1', 20, settings, logic.examRoster(cls), papers);
    const ps = names.map((_, i) => logic.joinPlayer(s, '', 'cat', undefined, '', false, `HS${i + 1}`));
    const c0 = ps.filter((p) => p.paper === 0).length;
    expect([c0, 31 - c0].sort()).toEqual([15, 16]);
    const again = logic.joinPlayer(s, '', 'cat', undefined, '', false, 'HS1');
    expect(again.paper).toBe(ps[0].paper);
  });
  it('một đề thì không chia; bảng điểm Excel có cột Mã đề khi thi nhiều đề', () => {
    const one = logic.createSession('222222', 'q1', 'Đề 1', 20, settings, logic.examRoster(cls), [papers[0]]);
    expect(one.papers).toBeUndefined();
    const s = logic.createSession('333333', 'q1', 'Đề 1', 20, settings, logic.examRoster(cls), papers);
    const p = logic.joinPlayer(s, '', 'cat', undefined, '', false, 'HS2');
    p.finished = true;
    const rows = examRows(s, analyze(s, null));
    expect(rows[0]).toMatchObject({ name: 'Học sinh 2', paper_code: papers[p.paper!].code });
    const sheet = examSheet(s, analyze(s, null));
    const head = sheet.rows.find((r) => r[0] === 'Hạng')!;
    expect(head.slice(0, 6)).toEqual(['Hạng', 'Họ và tên', 'Lớp', 'Mã số HS', 'Mã đề', 'Trạng thái']);
  });
});
