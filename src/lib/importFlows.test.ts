import { describe, expect, it } from 'vitest';
import { parseQuestions } from './importer';
import { aiItemsToQuestions, extractJsonArray } from './ai';

const right = (t: string) => parseQuestions(t, 'de.txt').questions.map((q) => q.options.map((o, i) => (o.is_correct ? 'ABCDEF'[i] : '')).join(''));

describe('Giữ nguyên tài liệu: các kiểu trình bày đề hay gặp', () => {
  it('bảng đáp án viết gọn trên một dòng "Đáp án: 1-B; 2-C" được hiểu là bảng đáp án, không dính vào phương án cuối', () => {
    const r = parseQuestions('Câu 1: Màu của lá cây?\nA. Đỏ\nB. Xanh\nC. Vàng\nCâu 2: 1 + 1 = ?\nA. 1\nB. 2\nC. 3\nĐáp án: 1-B; 2-C', 'de.txt');
    expect(r.questions).toHaveLength(2);
    expect(r.questions[1].options.map((o) => o.text.replace(/<[^>]*>/g, ''))).toEqual(['1', '2', '3']);
    expect(right('Câu 1: Màu của lá cây?\nA. Đỏ\nB. Xanh\nC. Vàng\nCâu 2: 1 + 1 = ?\nA. 1\nB. 2\nC. 3\nĐáp án: 1-B; 2-C')).toEqual(['B', 'C']);
    expect(r.warnings).toEqual([]);
  });
  it('vẫn hiểu đúng "Đáp án: B" của từng câu, bảng đáp án nhiều dòng, phương án cùng dòng, dấu sao', () => {
    expect(right('Câu 1: A?\nA. x\nB. y\nĐáp án: B\nCâu 2: B?\nA. x\nB. y\nĐáp án: A')).toEqual(['B', 'A']);
    expect(right('Câu 1. A?\nA. x\nB. y\nCâu 2. B?\nA. x\nB. y\nCâu 3. C?\nA. x\nB. y\nĐÁP ÁN\n1.B  2.A  3.B')).toEqual(['B', 'A', 'B']);
    expect(right('Câu 1: 2 + 3 = ?\nA. 4 B. 5 C. 6 D. 7\nĐáp án: B')).toEqual(['B']);
    expect(right('Câu 1: Thủ đô?\nA. Huế\n*B. Hà Nội\nC. Đà Nẵng')).toEqual(['B']);
  });
});

describe('Kết quả AI trả về: chịu được các kiểu phản hồi khó', () => {
  const item = (n: number) => ({ type: 'single_choice', question: `1 + ${n} = ?`, options: [{ text: String(n), correct: false }, { text: String(n + 1), correct: true }] });
  const full = JSON.stringify([item(1), item(2), item(3)]);
  it('đọc được mảng chuẩn, mảng bọc ```json, mảng bọc trong đối tượng', () => {
    expect(extractJsonArray(full)).toHaveLength(3);
    expect(extractJsonArray('```json\n' + full + '\n```')).toHaveLength(3);
    expect(extractJsonArray(JSON.stringify({ questions: [item(1), item(2)] }))).toHaveLength(2);
  });
  it('phản hồi bị cắt giữa chừng: giữ lại các câu trọn vẹn; không phải JSON: báo lỗi tiếng Việt', () => {
    expect(extractJsonArray(full.slice(0, full.length - 40))).toHaveLength(2);
    expect(() => extractJsonArray('Xin lỗi, tôi không soạn được.')).toThrow(/AI không trả về danh sách câu hỏi hợp lệ/);
    expect(() => extractJsonArray('[{"type":"single_cho')).toThrow(/AI không trả về/);
  });
  it('phương án dạng chuỗi kèm đáp án bằng chữ cái vẫn giữ được đáp án đúng', () => {
    const [a] = aiItemsToQuestions([{ type: 'single_choice', question: 'Thủ đô?', options: ['A. Huế', 'B. Hà Nội', 'C. Đà Nẵng'], answer: 'B' }]);
    expect(a.options.map((o) => o.text.replace(/<[^>]*>/g, ''))).toEqual(['Huế', 'Hà Nội', 'Đà Nẵng']);
    expect(a.options.map((o) => !!o.is_correct)).toEqual([false, true, false]);
    expect(a.needs_review).toBe(false);
    const [b] = aiItemsToQuestions([{ type: 'multiple_select', question: 'Biết bay?', options: ['Chim', 'Cá', 'Chuồn chuồn'], correct: ['A', 'C'] }]);
    expect(b.options.map((o) => !!o.is_correct)).toEqual([true, false, true]);
  });
});
