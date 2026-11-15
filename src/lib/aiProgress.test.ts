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

describe('Gemini quá tải (503): tự thử lại rồi đổi sang mô hình khác', () => {
  it('thử lại một lần, vẫn quá tải thì lấy danh sách mô hình và chạy bằng mô hình kế tiếp', async () => {
    const { vi } = await import('vitest');
    const { streamDirect } = await import('./aiProgress');
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
    const calls: string[] = [];
    const busy = () => new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } }), { status: 503 });
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('/models?')) return new Response(JSON.stringify({ models: ['gemini-2.5-flash', 'gemini-2.0-flash'].map((n) => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) }), { status: 200 });
      if (url.includes('gemini-flash-latest')) return busy();
      return new Response('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"type":"oral","question":"a"}]' }] } }] }) + '\n', { status: 200 });
    });
    const notes: string[] = [];
    const text = await streamDirect('p', 's', () => {}, undefined, (n) => notes.push(n), 1);
    expect(text).toBe('[{"type":"oral","question":"a"}]');
    expect(calls.filter((u) => u.includes('gemini-flash-latest'))).toHaveLength(2); // gọi + thử lại
    expect(calls.some((u) => u.includes('gemini-2.5-flash:streamGenerateContent'))).toBe(true);
    expect(notes[0]).toMatch(/quá tải/);
    expect(notes.some((n) => /đổi sang gemini-2\.5-flash/.test(n))).toBe(true);
    vi.unstubAllGlobals();
  });
});
