import { describe, expect, it } from 'vitest';
import { paperQuiz, paperReason, isPaperQuestion } from './paper';
import type { Question, Quiz } from './types';

const opt = (id: string, correct = false) => ({ option_id: id, text: id, is_correct: correct });
const q = (id: string, type: Question['type'], options: ReturnType<typeof opt>[]): Question => ({
  id, type, time_limit_seconds: 20, points: 10, stem: { text: id }, options,
});

describe('câu dùng được với thẻ giấy', () => {
  it('nêu đúng lý do khi câu không dùng được', () => {
    expect(paperReason(q('a', 'single_choice', [opt('1', true), opt('2')]))).toBeNull();
    expect(paperReason(q('b', 'multiple_select', [opt('1', true), opt('2', true)]))).toMatch(/một đáp án/);
    expect(paperReason(q('c', 'single_choice', [opt('1', true), opt('2'), opt('3'), opt('4'), opt('5')]))).toMatch(/5 phương án/);
    expect(paperReason(q('d', 'single_choice', [opt('1'), opt('2')]))).toMatch(/đáp án đúng/);
    expect(paperReason(q('e', 'reorder', [opt('1', true), opt('2')]))).toMatch(/dạng câu/);
  });

  it('lọc theo danh sách câu được chọn', () => {
    const quiz: Quiz = {
      id: 'x', title: 'T', questions: [q('a', 'single_choice', [opt('1', true), opt('2')]), q('b', 'single_choice', [opt('1', true), opt('2')]), q('c', 'reorder', [opt('1')])],
      visibility: 'private', created_at: '', updated_at: '',
    };
    expect(paperQuiz(quiz).questions.map((x) => x.id)).toEqual(['a', 'b']);
    expect(paperQuiz(quiz, ['b']).questions.map((x) => x.id)).toEqual(['b']);
    expect(paperQuiz(quiz, ['c']).questions).toEqual([]);
    expect(isPaperQuestion(quiz.questions[2])).toBe(false);
  });
});
