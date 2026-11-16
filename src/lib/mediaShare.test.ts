import { describe, expect, it } from 'vitest';
import { isShareBlocked, parseVideoUrl, videoUrlHint } from './media';

describe('Ảnh khi Drive chặn chia sẻ, link video', () => {
  it('nhận ra lỗi chia sẻ của Apps Script mới (SHARE_BLOCKED) và cũ', () => {
    expect(isShareBlocked('SHARE_BLOCKED: Google không cho bật chia sẻ… Lỗi gốc: Access denied')).toBe(true);
    expect(isShareBlocked('Không bật được chia sẻ "Bất kỳ ai có đường liên kết" cho tệp. Tài khoản Google…')).toBe(true);
    expect(isShareBlocked('Tệp quá lớn (50 MB).')).toBe(false);
  });

  it('lấy link YouTube nằm trong link chuyển hướng của Google', () => {
    const r = parseVideoUrl('https://www.google.com/url?sa=t&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&usg=x');
    expect(r?.provider).toBe('youtube');
    expect(r?.embed_id).toBe('dQw4w9WgXcQ');
    expect(parseVideoUrl('https://www.google.com/search?q=thong+tin+va+quyet+dinh')).toBeNull();
  });

  it('lời nhắc khi dán nhầm link', () => {
    expect(videoUrlHint('https://www.google.com/search?sa=X&q=abc')).toMatch(/trang tìm kiếm Google/);
    expect(videoUrlHint('https://www.facebook.com/watch?v=1')).toMatch(/không nhúng được/);
    expect(videoUrlHint('abc')).toMatch(/Link chưa hợp lệ/);
  });
});
