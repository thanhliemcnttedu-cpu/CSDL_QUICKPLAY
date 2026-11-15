import { describe, expect, it } from 'vitest';
import { fromB64Url, inAppBrowser, openInBrowserHint, toB64Url, withHashParam } from './inApp';

describe('trình duyệt trong ứng dụng', () => {
  it('nhận ra Zalo trên iPhone và Android, Facebook, Messenger', () => {
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/24.07.01')).toBe('Zalo');
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Zalo android/12070611 ZaloTheme/light')).toBe('Zalo');
    expect(inAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450.0]')).toBe('Facebook');
    expect(inAppBrowser('Mozilla/5.0 (iPhone) [FBAN/MessengerForiOS;FBAV/450.0]')).toBe('Messenger');
  });
  it('trình duyệt thường thì không coi là trong ứng dụng', () => {
    expect(inAppBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36')).toBeNull();
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36')).toBeNull();
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1')).toBeNull();
  });
  it('hướng dẫn mở trình duyệt nói rõ nút cần bấm trong Zalo', () => {
    expect(openInBrowserHint('Zalo', true)).toMatch(/Mở bằng trình duyệt.*Safari/);
  });
  it('gắn tham số vào đường dẫn HashRouter, giữ tham số cũ và thay giá trị cũ', () => {
    const a = withHashParam('https://x.app/#/play/123456?s=https%3A%2F%2Fscript', 'me', 'abc');
    expect(a).toBe('https://x.app/#/play/123456?s=https%3A%2F%2Fscript&me=abc');
    expect(withHashParam(a, 'me', 'xyz')).toBe('https://x.app/#/play/123456?s=https%3A%2F%2Fscript&me=xyz');
    expect(withHashParam('https://x.app/#/play/1', 'me', 'q')).toBe('https://x.app/#/play/1?me=q');
  });
  it('mã hóa thông tin em (có dấu tiếng Việt) rồi giải mã lại đúng', () => {
    const me = { pin: '123456', player_id: 'p_ab12', name: 'Nguyễn Minh Anh', avatar: 'cfg:x', class_name: '1A1' };
    const s = toB64Url(me);
    expect(s).not.toMatch(/[+/=]/);
    expect(fromB64Url(s)).toEqual(me);
    expect(fromB64Url('%%%')).toBeNull();
  });
});
