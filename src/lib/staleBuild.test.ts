import { describe, expect, it } from 'vitest';
import { assetUrlsOf, busyRoute, entryOf, recentReloads } from './staleBuild';

describe('Bản mới của Quickplay', () => {
  it('đọc tên tệp mã chính trong index.html (có hoặc không có / ở đầu)', () => {
    expect(entryOf('<script type="module" crossorigin src="./assets/index-BNYF7PLN.js"></script>')).toBe('index-BNYF7PLN.js');
    expect(entryOf('/assets/index-BHjKQNKc.js')).toBe('index-BHjKQNKc.js');
    expect(entryOf('<html></html>')).toBeNull();
  });
  it('chỉ đếm các lần tự tải lại trong 2 phút gần nhất', () => {
    const now = 1_000_000;
    expect(recentReloads([now - 10_000, now - 60_000, now - 200_000], now)).toHaveLength(2);
  });
  it('không tự tải lại giữa chừng ở màn đang soạn đề, đang chơi, đang điều khiển buổi học', () => {
    expect(busyRoute('#/teacher/edit/quiz_1')).toBe(true);
    expect(busyRoute('#/play/123456')).toBe(true);
    expect(busyRoute('#/teacher/host/123456')).toBe(true);
    expect(busyRoute('#/teacher/paper/123456')).toBe(true);
    expect(busyRoute('#/teacher/paper')).toBe(false);
    expect(busyRoute('#/teacher')).toBe(false);
    expect(busyRoute('#/login')).toBe(false);
  });
  it('lấy ra các tệp mã bị lỗi trong thông báo để dọn bộ nhớ đệm', () => {
    expect(assetUrlsOf('Failed to fetch dynamically imported module: https://quickplay-delta.vercel.app/assets/Settings-CU9lZY5z.js'))
      .toEqual(['/assets/Settings-CU9lZY5z.js']);
    expect(assetUrlsOf('Unable to preload CSS for /assets/Settings-a1.css')).toEqual(['/assets/Settings-a1.css']);
    expect(assetUrlsOf('Network error')).toEqual([]);
  });
});
