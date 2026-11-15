import { describe, expect, it } from 'vitest';
import { scanItems } from './aiProgress';
import { parseSse } from './gemini';

describe('Tiến độ AI: đếm câu đã xong khi câu trả lời đang được gửi dở', () => {
  const a = { type: 'single_choice', question: '1 + 1 = ? {gợi ý: "hai"}', options: [{ text: '2', correct: true }, { text: '3' }] };
  const b = { type: 'matching', question: 'Nối', pairs: [{ left: 'a', right: 'b' }] };
  const full = JSON.stringify([a, b]);
  it('chưa có gì, đang dở câu đầu, xong câu đầu và dở câu hai, xong cả hai', () => {
    expect(scanItems('').items).toHaveLength(0);
    expect(scanItems('[{"type":"single_cho').items).toHaveLength(0);
    const mid = full.slice(0, JSON.stringify([a]).length + 30); // hết câu 1, đang viết câu 2
    const s = scanItems(mid);
    expect(s.items).toEqual([a]);
    expect(s.tail).toMatch(/"type":"matching"/); // biết dạng của câu đang soạn dở
    expect(scanItems(full).items).toEqual([a, b]);
    expect(scanItems('```json\n' + full + '\n```').items).toHaveLength(2);
  });
  it('dấu ngoặc nằm trong chuỗi không làm đếm sai', () => {
    expect(scanItems(full).items[0]).toEqual(a);
  });
});

describe('Đọc câu trả lời gửi dần của Gemini (SSE)', () => {
  it('ghép phần chữ của nhiều dòng data, bỏ qua dòng chưa trọn vẹn', () => {
    const line = (t: string) => 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] });
    expect(parseSse([line('[{"type":'), '', line('"oral"}]')].join('\n'))).toBe('[{"type":"oral"}]');
    expect(parseSse('data: {"candidates":[{"content":{"par')).toBe('');
    expect(parseSse(': ghi chú\r\n' + line('ok') + '\r\n')).toBe('ok');
  });
});
