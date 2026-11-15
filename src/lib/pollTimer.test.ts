import { describe, expect, it } from 'vitest';
import { HIDDEN_MIN_MS, MAX_DELAY_MS, nextDelay } from './pollTimer';

describe('nhịp hỏi máy chủ', () => {
  it('bình thường: quanh mức gốc, lệch tối đa 15%', () => {
    expect(nextDelay(2000, 0, false, 0)).toBe(1700);
    expect(nextDelay(2000, 0, false, 0.5)).toBe(2000);
    expect(nextDelay(2000, 0, false, 1)).toBe(2300);
  });
  it('lỗi liên tiếp thì giãn gấp đôi mỗi lần nhưng không quá 30 giây', () => {
    expect(nextDelay(2000, 1, false, 0.5)).toBe(4000);
    expect(nextDelay(2000, 3, false, 0.5)).toBe(16000);
    expect(nextDelay(2000, 9, false, 0.5)).toBe(MAX_DELAY_MS);
    expect(nextDelay(20000, 2, false, 0.5)).toBe(MAX_DELAY_MS);
  });
  it('thẻ trình duyệt bị ẩn thì hỏi thưa (ít nhất 10 giây)', () => {
    expect(nextDelay(2000, 0, true, 0.5)).toBe(HIDDEN_MIN_MS);
    expect(nextDelay(20000, 0, true, 0.5)).toBe(20000);
  });
});
