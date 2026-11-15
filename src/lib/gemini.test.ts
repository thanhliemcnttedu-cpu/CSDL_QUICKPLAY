import { describe, expect, it } from 'vitest';
import { explainGeminiError, pickModel } from './gemini';

const m = (name: string, gen = true) => ({ name: 'models/' + name, supportedGenerationMethods: gen ? ['generateContent'] : ['embedContent'] });

describe('khóa API Gemini', () => {
  it('đổi lỗi của Google sang trạng thái dễ hiểu: sai khóa, hết hạn mức, bị chặn', () => {
    expect(explainGeminiError(400, { error: { message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } }).status).toBe('invalid');
    const q = explainGeminiError(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota' } });
    expect(q.status).toBe('quota');
    expect(q.message).toMatch(/hết hạn mức.*đổi khóa API khác/);
    expect(explainGeminiError(403, { error: { message: 'Permission denied' } }).status).toBe('blocked');
    expect(explainGeminiError(500, null).status).toBe('error');
  });
  it('tự chọn mô hình flash bản chính thức mới nhất, bỏ qua mô hình ảnh, giọng nói, bản thử', () => {
    expect(pickModel([m('gemini-2.0-flash'), m('gemini-2.5-flash'), m('gemini-2.5-flash-lite'), m('gemini-2.5-pro'), m('gemini-3.0-flash-preview'), m('gemini-2.5-flash-image'), m('text-embedding-004', false)])).toBe('gemini-2.5-flash');
    expect(pickModel([m('gemini-3.0-flash'), m('gemini-2.5-flash')])).toBe('gemini-3.0-flash');
    expect(pickModel([m('gemini-flash-latest'), m('gemini-2.5-flash-lite')])).toBe('gemini-flash-latest');
    expect(pickModel([m('gemini-2.5-pro')])).toBe('gemini-2.5-pro');
    expect(pickModel([m('text-embedding-004', false)])).toBeUndefined();
  });
});
