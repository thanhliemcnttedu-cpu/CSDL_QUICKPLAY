import { describe, expect, it } from 'vitest';
import { backupFileName, backupSummary, mediaIdsIn, parseBackup, replaceMediaLinks } from './backup';
import { levelOf } from './driveFull';
import { muxWebm } from './audioCompress';

const IMG = 'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOp';
const SND = 'https://drive.google.com/uc?export=download&id=1ZyXwVuTsRqPoNm';

describe('link ảnh/âm thanh trên Drive', () => {
  it('tìm đủ mã tệp, không trùng', () => {
    const t = JSON.stringify({ a: IMG, b: [IMG, SND], c: 'https://example.com/x.png' });
    expect(mediaIdsIn(t).sort()).toEqual(['1AbCdEfGhIjKlMnOp', '1ZyXwVuTsRqPoNm'].sort());
  });
  it('đổi link cũ sang link mới (cả dạng ảnh và dạng tải về)', () => {
    const t = JSON.stringify({ image: IMG, audio: SND, other: 'giữ nguyên' });
    const out = JSON.parse(replaceMediaLinks(t, { '1AbCdEfGhIjKlMnOp': 'NEW1', '1ZyXwVuTsRqPoNm': 'data:audio/webm;base64,AAA' }));
    expect(out).toEqual({ image: 'NEW1', audio: 'data:audio/webm;base64,AAA', other: 'giữ nguyên' });
  });
});

describe('tệp sao lưu toàn bộ', () => {
  const quiz = { id: 'q1', title: 'Toán', questions: [{ id: 'a' }, { id: 'b' }], cover_url: IMG };
  it('đọc tệp sao lưu kiểu mới kèm ảnh, kết quả, tài khoản', () => {
    const b = parseBackup(JSON.stringify({
      app: 'Quickplay', kind: 'backup', version: 2, exported_at: '2026-11-15T05:00:00Z',
      owner: { username: '035091005725', name: 'Cô Lan', email: 'x@y.vn' },
      quizzes: [quiz], catalog: { subjects: [{ id: 's', name: 'Toán', chapters: [] }] },
      classes: [{ name: '1A1', students: ['An', 'Bình'] }],
      sessions: [{ name: '123456.json', data: { pin: '123456', session_id: 's1' } }, { name: '123456.quiz.json', data: { id: 'q1' } }],
      media: { '1AbCdEfGhIjKlMnOp': { mime: 'image/webp', data: 'AAAA' }, bad: { mime: 1 } },
    }));
    expect(b.owner?.username).toBe('035091005725');
    expect(Object.keys(b.media!)).toEqual(['1AbCdEfGhIjKlMnOp']);
    expect(backupSummary(b)).toMatchObject({ quizzes: 1, questions: 2, classes: 1, students: 2, subjects: 1, sessions: 1, media: 1, mediaBytes: 3 });
  });
  it('đọc được tệp gộp tự lưu (kết quả buổi học ghi thẳng đối tượng phiên)', () => {
    const b = parseBackup(JSON.stringify({ app: 'Quickplay', kind: 'backup', version: 1, owner: 'gv01', quizzes: [quiz], classes: [], sessions: [{ pin: '654321', session_id: 's2', players: [] }, { rác: 1 }] }));
    expect(b.sessions).toEqual([{ name: '654321.json', data: { pin: '654321', session_id: 's2', players: [] } }]);
    expect(b.owner).toBeUndefined();
  });
  it('tên tệp sao lưu theo tên đăng nhập và thời điểm', () => {
    expect(backupFileName('035091005725', new Date(2026, 10, 15, 12, 45))).toBe('quickplay-saoluu_035091005725_15_11_2026_12h45.json');
    expect(backupFileName('gv#02?', new Date(2026, 0, 2, 3, 4))).toBe('quickplay-saoluu_gv-02_02_01_2026_03h04.json');
  });
});

describe('mức cảnh báo dung lượng Drive', () => {
  const GB = 1024 ** 3;
  it('dưới 90% bình thường, từ 90% sắp đầy, từ 98% đã đầy, không giới hạn thì bình thường', () => {
    expect(levelOf(10 * GB, 15 * GB)).toBe('ok');
    expect(levelOf(13.6 * GB, 15 * GB)).toBe('near');
    expect(levelOf(14.8 * GB, 15 * GB)).toBe('full');
    expect(levelOf(99 * GB, 0)).toBe('ok');
  });
});

describe('đóng gói âm thanh Opus vào WebM', () => {
  it('có phần đầu EBML "webm", mã A_OPUS và đủ các khung', () => {
    const chunks = Array.from({ length: 3000 }, (_, i) => ({ t: i * 20000, data: new Uint8Array([i & 0xff, 1, 2]) })); // 60 giây
    const out = muxWebm(chunks, new Uint8Array(19), 60);
    expect([...out.slice(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    const text = new TextDecoder('latin1').decode(out);
    expect(text).toContain('webm');
    expect(text).toContain('A_OPUS');
    // mỗi cụm tối đa 30 giây → 60 giây cần ít nhất 2 cụm (mã cụm 1F 43 B6 75)
    const clusters = text.split('\x1f\x43\xb6\x75').length - 1;
    expect(clusters).toBeGreaterThanOrEqual(2);
    // tổng dữ liệu khung đủ 3000 × 3 byte
    expect(out.length).toBeGreaterThan(3000 * 3);
  });
});
