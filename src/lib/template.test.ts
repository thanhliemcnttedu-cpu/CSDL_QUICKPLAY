import { describe, expect, it } from 'vitest';
import { docxHtmlToText, parseFreeText } from './importer';
import { buildWordTemplate, templateQuestionsText } from './wordTemplate';
import { formToQuestions, isGoogleFormUrl, parsePublicForm } from './googleForm';
import { COMPOSER_TYPES } from './factory';
import type { Question } from './types';

function checkSamples(qs: Question[]) {
  expect(qs).toHaveLength(11);
  expect(qs.every((q) => !q.needs_review)).toBe(true);
  expect(new Set(qs.map((q) => q.type))).toEqual(new Set(COMPOSER_TYPES)); // đủ 7 dạng
  const [q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11] = qs;
  expect(q1).toMatchObject({ type: 'single_choice', time_limit_seconds: 20, points: 1000 });
  expect(q1.options.map((o) => !!o.is_correct)).toEqual([false, true, false, false]);
  expect(q1.explanation).toContain('Hà Nội là thủ đô');
  expect(q2.options.find((o) => o.is_correct)?.text).toBe('56');
  expect(q3.type).toBe('multiple_select');
  expect(q3.options.filter((o) => o.is_correct).map((o) => o.text)).toEqual(['12', '30']);
  expect(q4.options.find((o) => o.is_correct)?.text).toBe('Đúng');
  expect(q5.options.find((o) => o.is_correct)?.text).toBe('Sai');
  expect(q6.stem.text).toBe('Nước sôi ở [blank_1] độ C và đóng băng ở [blank_2] độ C.');
  expect(q6.blanks?.map((b) => b.accepted)).toEqual([['100', 'một trăm'], ['0', 'không']]);
  expect(q7.blanks?.[0].accepted).toEqual(['mèo']);
  expect(q7.distractors).toEqual(['chó', 'gà', 'vịt']);
  expect(q8.type).toBe('reorder');
  expect(q8.options.map((o) => [o.order_index, o.text])).toEqual([[0, 'Nước bay hơi'], [1, 'Hơi nước ngưng tụ thành mây'], [2, 'Mưa rơi xuống'], [3, 'Nước chảy ra sông, biển']]);
  expect(q9.type).toBe('matching');
  const left = q9.options.filter((o) => o.side === 'left');
  expect(left.map((l) => `${l.text}=${q9.options.find((r) => r.side === 'right' && r.match_pair_id === l.match_pair_id)?.text}`)).toEqual(['Việt Nam=Hà Nội', 'Nhật Bản=Tokyo', 'Pháp=Paris']);
  expect(q10).toMatchObject({ type: 'oral', time_limit_seconds: 60 });
  expect(q10.explanation).toContain('Khóa vòi');
  expect(q11.stem.video).toMatchObject({ source_type: 'internet_url', provider: 'youtube', embed_id: 'dQw4w9WgXcQ' });
  expect(q11.options.find((o) => o.is_correct)?.text).toBe('Ánh sáng');
}

describe('file Word mẫu', () => {
  it('phần câu hỏi mẫu được đọc đúng cả 11 câu, đủ 7 dạng, đúng đáp án', () => {
    const r = parseFreeText(templateQuestionsText());
    expect(r.warnings).toEqual([]);
    checkSamples(r.questions);
  });

  it('trọn vòng: tạo tệp .docx → đọc bằng mammoth → ra đúng các câu hỏi (bỏ qua phần hướng dẫn)', async () => {
    const blob = await buildWordTemplate();
    const mammoth = await import('mammoth');
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(await blob.arrayBuffer()) });
    expect(value).toContain('FILE WORD MẪU');
    checkSamples(parseFreeText(docxHtmlToText(value)).questions);
  });

  it('ảnh nhúng trong Word được gắn vào câu hỏi hoặc phương án đứng ngay trên nó', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const text = docxHtmlToText(`<p>Câu 1: Đây là con gì?</p><p><img src="${png}" /></p><p>*A. Mèo</p><p>B. Chó</p><p><img src="${png}" /></p>`);
    const [q] = parseFreeText(text).questions;
    expect(q.stem.image_url).toMatch(/^import-img:\d+$/);
    expect(q.options[0].image_url).toBeUndefined();
    expect(q.options[1].image_url).toMatch(/^import-img:\d+$/);
  });

  it('vẫn đọc được định dạng cũ (không nhãn, đáp án ở cuối)', () => {
    const r = parseFreeText('Câu 1: Thủ đô của Việt Nam là?\nA. Huế  B. Hà Nội  C. Đà Nẵng  D. Cần Thơ\nĐáp án: B\nCâu 2: Kể tên một loài chim.\nCâu 3: Hà Nội có Hồ ___.\nĐáp án: Gươm');
    expect(r.questions.map((q) => q.type)).toEqual(['single_choice', 'oral', 'fill_blank']);
    expect(r.questions[0].options.findIndex((o) => o.is_correct)).toBe(1);
  });
});

describe('nhập từ Google Form', () => {
  it('nhận đúng link Google Form', () => {
    expect(isGoogleFormUrl('https://docs.google.com/forms/d/abc123/edit')).toBe(true);
    expect(isGoogleFormUrl('https://forms.gle/AbCdEf')).toBe(true);
    expect(isGoogleFormUrl('https://example.com/forms/d/abc')).toBe(false);
  });

  it('chuyển dữ liệu đọc bằng FormApp thành câu hỏi, giữ đáp án và quy đổi điểm', () => {
    const r = formToQuestions({
      title: 'Kiểm tra 15 phút', source: 'editor', is_quiz: true,
      items: [
        { kind: 'choice', title: '2 + 2 = ?', options: [{ text: '3' }, { text: '4', correct: true }], points: 1 },
        { kind: 'checkbox', title: 'Số chẵn?', options: [{ text: '2', correct: true }, { text: '3' }, { text: '4', correct: true }], points: 2 },
        { kind: 'choice', title: 'Trái Đất hình cầu', options: [{ text: 'Đúng', correct: true }, { text: 'Sai' }] },
        { kind: 'text', title: 'Thủ đô của Việt Nam là', answers: ['Hà Nội'] },
        { kind: 'paragraph', title: 'Nêu cảm nghĩ của em <b>ngắn gọn</b>' },
        { kind: 'choice', title: 'Chưa có đáp án', options: [{ text: 'A' }, { text: 'B' }] },
      ],
    });
    expect(r.title).toBe('Kiểm tra 15 phút');
    expect(r.questions.map((q) => q.type)).toEqual(['single_choice', 'multiple_select', 'true_false', 'fill_blank', 'oral', 'single_choice']);
    expect(r.questions[0].points).toBe(500);
    expect(r.questions[1].points).toBe(1000);
    expect(r.questions[1].options.filter((o) => o.is_correct)).toHaveLength(2);
    expect(r.questions[3].blanks?.[0].accepted).toEqual(['Hà Nội']);
    expect(r.questions[4].stem.text).toContain('&lt;b&gt;'); // chữ trong form không được hiểu là HTML
    expect(r.questions[5].needs_review).toBe(true);
  });

  it('đọc trang công khai (FB_PUBLIC_LOAD_DATA_): có câu hỏi và phương án, không có đáp án', () => {
    const raw = JSON.stringify([null, ['Mô tả', [
      [101, 'Màu của lá cây?', null, 2, [[201, [['Xanh', null, null, null, 0], ['Đỏ', null, null, null, 0]], 1]]],
      [102, 'Phần 2', null, 8],
      [103, 'Chọn các số lẻ', 'Có thể chọn nhiều', 4, [[203, [['1'], ['2'], ['3']], 0]]],
      [104, 'Họ tên của em', null, 0, [[204, null, 1]]],
    ], null, null, null, null, null, null, 'Tên tệp form'], '/forms', 'Bài ôn tập']);
    const p = parsePublicForm(raw);
    expect(p.title).toBe('Bài ôn tập');
    expect(p.items.map((i) => i.kind)).toEqual(['choice', 'checkbox', 'text']);
    const r = formToQuestions({ title: '', source: 'public', raw });
    expect(r.questions.map((q) => q.type)).toEqual(['single_choice', 'multiple_select', 'oral']);
    expect(r.questions[0].needs_review).toBe(true);
    expect(r.warnings[0]).toContain('không có đáp án');
  });
});
