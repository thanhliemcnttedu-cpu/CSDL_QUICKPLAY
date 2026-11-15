import { describe, expect, it } from 'vitest';
import { CARD_CODES, CARD_COUNT, cardBit, cardsPdf, decodeCard, rotateCode, _minDistance } from './paperCard';
import { detectCards } from './paperScan';
import { createPaperSession, paperAction, paperQuiz, parseStudents } from './paper';
import { sampleQuiz } from './factory';

/** Vẽ ảnh xám giả lập: nhiều thẻ trên nền lớp học, mỗi thẻ có tâm, cạnh ô mã (px), góc xoay (độ, theo chiều kim đồng hồ). */
function render(w: number, h: number, cards: { card: number; cx: number; cy: number; size: number; deg: number }[], noise = 6) {
  const g = new Uint8Array(w * h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2 * noise;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 120 + (x / w) * 50; // nền xám, sáng dần sang phải
      for (const c of cards) {
        const a = (-c.deg * Math.PI) / 180;
        const dx = x + 0.5 - c.cx, dy = y + 0.5 - c.cy;
        // toạ độ trong hệ của thẻ (đơn vị: ô), tâm thẻ = (3, 3)
        const u = (dx * Math.cos(a) - dy * Math.sin(a)) / (c.size / 6) + 3;
        const t = (dx * Math.sin(a) + dy * Math.cos(a)) / (c.size / 6) + 3;
        if (u < -1.6 || t < -1.6 || u > 7.6 || t > 7.6) continue; // ngoài tờ giấy
        v = 235;
        if (u >= 0 && t >= 0 && u < 6 && t < 6) {
          const col = Math.floor(u), row = Math.floor(t);
          const border = col === 0 || row === 0 || col === 5 || row === 5;
          if (border || cardBit(CARD_CODES[c.card - 1], row - 1, col - 1)) v = 35;
        }
      }
      g[y * w + x] = Math.max(0, Math.min(255, v + rnd()));
    }
  return g;
}

describe('thẻ giấy', () => {
  it('bảng mã: 100 mã, mọi phép xoay lệch nhau ≥ 4 ô và tự sửa được 1 ô sai', () => {
    expect(CARD_COUNT).toBe(100);
    expect(_minDistance()).toBeGreaterThanOrEqual(4);
    const c = CARD_CODES[41];
    expect(decodeCard(c)).toEqual({ card: 42, turns: 0 });
    expect(decodeCard(rotateCode(c))).toEqual({ card: 42, turns: 1 });
    expect(decodeCard(rotateCode(rotateCode(c)) ^ 0b100)).toEqual({ card: 42, turns: 2 });
  });

  it('đọc đúng số thẻ và đáp án ở cả 4 hướng xoay, kể cả khi cầm nghiêng', () => {
    // Xoay thẻ theo chiều kim đồng hồ 90° → cạnh trái (D) lên trên; 180° → C; 270° → B
    const expectSide = [0, 3, 2, 1];
    for (const tilt of [0, 14, -17]) {
      const cards = [0, 1, 2, 3].map((k) => ({ card: 10 + k * 23, cx: 110 + k * 190, cy: 130, size: 90, deg: k * 90 + tilt }));
      const hits = detectCards(render(800, 260, cards), 800, 260);
      expect(hits.map((x) => x.card).sort((a, b) => a - b)).toEqual([10, 33, 56, 79]);
      cards.forEach((c, k) => expect(hits.find((x) => x.card === c.card)!.side).toBe(expectSide[k]));
    }
  });

  it('đọc được thẻ ở xa (ô mã ~26 px) và thẻ giơ sát máy (ô mã ~300 px), nhiều thẻ một lúc', () => {
    const far = Array.from({ length: 12 }, (_, i) => ({ card: i * 8 + 1, cx: 60 + (i % 6) * 100, cy: 60 + Math.floor(i / 6) * 100, size: 26, deg: (i % 4) * 90 + (i % 3) * 5 }));
    const hits = detectCards(render(640, 220, far, 4), 640, 220);
    expect(hits.map((x) => x.card).sort((a, b) => a - b)).toEqual(far.map((c) => c.card));
    const near = detectCards(render(640, 480, [{ card: 100, cx: 320, cy: 240, size: 300, deg: 185 }]), 640, 480);
    expect(near).toHaveLength(1);
    expect(near[0]).toMatchObject({ card: 100, side: 2 });
  });

  it('vẫn đọc đúng khi khung hình đổi chiều ngang ↔ dọc (xoay điện thoại)', () => {
    const one = (w: number, h: number) => detectCards(render(w, h, [{ card: 41, cx: w / 2, cy: h / 2, size: 120, deg: 0 }]), w, h).map((x) => x.card);
    expect(one(300, 200)).toEqual([41]);
    expect(one(200, 300)).toEqual([41]);
    expect(one(300, 200)).toEqual([41]);
  });

  it('không nhận nhầm khi trong hình không có thẻ', () => {
    expect(detectCards(render(400, 300, []), 400, 300)).toEqual([]);
  });

  it('tạo được PDF bộ thẻ: 100 thẻ = 50 trang A4', async () => {
    const pdf = await cardsPdf().text();
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Count 50');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(await cardsPdf({ from: 1, to: 3 }).text()).toContain('/Count 2');
    expect(await cardsPdf({ to: 48, perPage: 1 }).text()).toContain('/Count 48');
  });
});

describe('buổi học quét thẻ', () => {
  const quiz = paperQuiz(sampleQuiz());
  const make = () => createPaperSession('123456', quiz, '6A1', parseStudents(['1. An', '2) Bình', '', 'Châu'].join('\n')), 'KEY');

  it('chỉ lấy câu một đáp án 2–4 phương án; bỏ số thứ tự khi dán danh sách', () => {
    expect(quiz.questions.length).toBeGreaterThan(0);
    expect(quiz.questions.every((q) => ['single_choice', 'true_false'].includes(q.type) && q.options.length <= 4)).toBe(true);
    expect(make().players.map((p) => p.name)).toEqual(['An', 'Bình', 'Châu']);
  });

  it('chấm theo thẻ, cho xoay lại thẻ, từ chối khóa sai và thẻ ngoài lớp', () => {
    const s = make();
    const q = quiz.questions[0];
    const right = q.options.findIndex((o) => o.is_correct);
    const wrong = q.options.findIndex((o) => !o.is_correct);
    expect(() => paperAction(s, quiz.questions, 'SAI', 'scan', 0, [])).toThrow();
    let v = paperAction(s, quiz.questions, 'KEY', 'scan', 0, [{ card: 1, choice: right }, { card: 2, choice: wrong }, { card: 9, choice: 0 }, { card: 3, choice: 7 }]);
    expect(v.answers).toEqual({ 1: right, 2: wrong });
    expect(s.players[0]).toMatchObject({ correct: 1, answered: 1, score: q.points });
    expect(s.players[1]).toMatchObject({ correct: 0, answered: 1, score: 0 });
    // Bình xoay lại thẻ sang đáp án đúng
    v = paperAction(s, quiz.questions, 'KEY', 'scan', 0, [{ card: 2, choice: right }]);
    expect(s.players[1]).toMatchObject({ correct: 1, answered: 1, score: q.points });
    expect(s.answers).toHaveLength(2);
    // Quét của câu cũ sau khi đã sang câu mới thì bỏ qua
    paperAction(s, quiz.questions, 'KEY', 'next');
    v = paperAction(s, quiz.questions, 'KEY', 'scan', 0, [{ card: 3, choice: right }]);
    expect(v.current_index).toBe(quiz.questions.length > 1 ? 1 : 0);
    expect(v.answers).toEqual({});
  });

  it('câu tiếp ở câu cuối thì kết thúc; nhắc và hiện kết quả bật tắt được', () => {
    const s = make();
    expect(paperAction(s, quiz.questions, 'KEY', 'hello').state).toBe('IN_PROGRESS');
    expect(s.paper!.connected).toBe(true);
    expect(paperAction(s, quiz.questions, 'KEY', 'remind').remind).toBe(true);
    expect(paperAction(s, quiz.questions, 'KEY', 'reveal')).toMatchObject({ reveal: true, remind: false });
    for (let i = 0; i < quiz.questions.length; i++) paperAction(s, quiz.questions, 'KEY', 'next');
    expect(s.state).toBe('COMPLETED');
  });
});
