import { describe, expect, it } from 'vitest';
import { copyTitle, isConflict, localIsNewer, locked } from './offlineSync';

describe('phát hiện xung đột khi đồng bộ', () => {
  it('không xung đột khi Drive còn đúng bản máy đã thấy', () => {
    expect(isConflict('2026-11-20T08:00:00.000Z', '2026-11-20T08:00:00.000Z')).toBe(false);
  });

  it('xung đột khi Drive đã đổi sau lần đồng bộ cuối', () => {
    expect(isConflict('2026-11-20T09:00:00.000Z', '2026-11-20T08:00:00.000Z')).toBe(true);
  });

  it('xung đột khi mục đã có trên Drive mà máy chưa từng thấy (base = null)', () => {
    expect(isConflict('2026-11-20T09:00:00.000Z', null)).toBe(true);
  });
});

describe('chọn bản mới hơn', () => {
  it('bản trên máy mới hơn', () => {
    expect(localIsNewer('2026-11-20T10:00:00.000Z', '2026-11-20T09:00:00.000Z')).toBe(true);
  });
  it('bản trên Drive mới hơn', () => {
    expect(localIsNewer('2026-11-20T08:00:00.000Z', '2026-11-20T09:00:00.000Z')).toBe(false);
  });
  it('bằng nhau thì ưu tiên bản trên máy', () => {
    expect(localIsNewer('2026-11-20T09:00:00.000Z', '2026-11-20T09:00:00.000Z')).toBe(true);
  });
});

describe('ghi chú bản sao xung đột', () => {
  it('ghi rõ bản nào được giữ thành bản sao', () => {
    expect(copyTitle('Toán lớp 5', 'trên máy')).toBe('Toán lớp 5 (xung đột – bản trên máy)');
    expect(copyTitle('Toán lớp 5', 'trên Drive')).toBe('Toán lớp 5 (xung đột – bản trên Drive)');
  });
});

describe('khóa tuần tự', () => {
  it('các thao tác chạy lần lượt, không chen vào nhau', async () => {
    const order: string[] = [];
    const a = locked(async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('a-end');
      return 1;
    });
    const b = locked(async () => {
      order.push('b');
      return 2;
    });
    expect(await Promise.all([a, b])).toEqual([1, 2]);
    expect(order).toEqual(['a-start', 'a-end', 'b']);
  });

  it('một thao tác lỗi không làm kẹt các thao tác sau', async () => {
    await expect(locked(async () => { throw new Error('lỗi'); })).rejects.toThrow('lỗi');
    expect(await locked(async () => 'tiếp tục')).toBe('tiếp tục');
  });
});
