import { describe, expect, it } from 'vitest';
import { parseScanLink } from '../components/PaperLiveNotice';

describe('mã QR điều khiển trên màn chiếu', () => {
  it('đọc được mã phòng và khóa quét từ đường dẫn ngắn /quet và đường dẫn trong ứng dụng', () => {
    expect(parseScanLink('https://quickplay-delta.vercel.app/quet?pin=780105&k=fbTD%2FNf8&s=https%3A%2F%2Fscript.google.com%2Fx')).toEqual({ pin: '780105', key: 'fbTD/Nf8' });
    expect(parseScanLink('https://quickplay-delta.vercel.app/#/scan?pin=123456&k=abcDEF')).toEqual({ pin: '123456', key: 'abcDEF' });
  });
  it('mã QR khác (không có mã phòng 6 số hoặc khóa) thì bỏ qua', () => {
    expect(parseScanLink('https://example.com/?pin=12345&k=x')).toBeNull();
    expect(parseScanLink('https://zalo.me/0888358363')).toBeNull();
    expect(parseScanLink('https://quickplay-delta.vercel.app/quet?pin=780105')).toBeNull();
  });
});
