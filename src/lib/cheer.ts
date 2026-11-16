// Lời khen, lời động viên và quà thưởng theo mốc cho học sinh trong lúc chơi; xếp mức kết quả cuối bài.
export interface Cheer {
  text: string;
  tone: 'praise' | 'encourage' | 'gift';
  bonusCoins: number; // xu thưởng thêm ở mốc chuỗi đúng
}

const PRAISE = ['Bạn giỏi quá!', 'Bạn thật thông minh!', 'Bạn giỏi lắm!', 'Tuyệt vời!'];
/** Mốc chuỗi đúng liên tiếp → xu thưởng. */
export const STREAK_GIFTS: Record<number, number> = { 3: 5, 5: 10, 10: 20, 15: 30, 20: 40 };

/**
 * streak: số câu đúng liên tiếp sau câu vừa trả lời; wrongStreak: số câu chưa đúng liên tiếp;
 * left: số câu còn lại; gifts: giáo viên có bật thưởng chuỗi đúng hay không.
 */
export function cheerFor(o: { correct: boolean; streak: number; wrongStreak: number; left: number; answered: number; gifts: boolean }): Cheer | null {
  if (o.left === 0) return { text: 'Chúc mừng bạn đã hoàn thành nội dung kiến thức!', tone: 'praise', bonusCoins: 0 };
  if (o.correct) {
    const gift = o.gifts ? STREAK_GIFTS[o.streak] ?? 0 : 0;
    if (gift) return { text: `${o.streak} câu đúng liên tiếp! Bạn nhận quà thưởng +${gift} điểm thưởng.`, tone: 'gift', bonusCoins: gift };
    if (o.streak === 3 || (o.streak > 3 && o.streak % 4 === 0))
      return { text: 'Bạn đang làm rất tốt! Hãy cố gắng và tiếp tục trả lời nhé.', tone: 'praise', bonusCoins: 0 };
    if (o.left === 2) return { text: 'Sắp về đích rồi, cố lên!', tone: 'praise', bonusCoins: 0 };
    if (o.streak >= 2) return { text: PRAISE[(o.answered + o.streak) % PRAISE.length], tone: 'praise', bonusCoins: 0 };
    return null;
  }
  if (o.wrongStreak === 3) return { text: 'Bạn hãy đọc thật kỹ nội dung câu hỏi và đáp án trước khi trả lời nhé. Cố gắng lên!', tone: 'encourage', bonusCoins: 0 };
  if (o.wrongStreak > 3 && o.wrongStreak % 2 === 1) return { text: 'Đừng bỏ cuộc, hãy cố gắng tiếp tục nào!', tone: 'encourage', bonusCoins: 0 };
  if (o.left === 2) return { text: 'Sắp về đích rồi, bạn cố lên!', tone: 'encourage', bonusCoins: 0 };
  return null;
}

export type Level = 'excellent' | 'good' | 'pass' | 'effort';
export const LEVEL_LABEL: Record<Level, string> = {
  excellent: 'Hoàn thành xuất sắc',
  good: 'Hoàn thành tốt',
  pass: 'Hoàn thành',
  effort: 'Chưa đạt',
};
/** Mức đánh giá theo tỉ lệ điểm đạt được (câu đúng một phần tính theo phần đúng). */
export const levelOf = (pct: number): Level => (pct >= 90 ? 'excellent' : pct >= 70 ? 'good' : pct >= 50 ? 'pass' : 'effort');

export interface ResultSummary {
  total: number;
  correct: number; // đúng hoàn toàn
  partial: number; // đúng một phần
  wrong: number;
  blank: number;
  pct_full: number; // % câu đúng hoàn toàn trên tổng số câu
  pct_partial: number; // % câu đúng một phần trên tổng số câu
  pct: number; // % số điểm đạt được → mức đánh giá
  level: Level;
}
/** Câu hết giờ mà không chọn gì (answer.kind = 'none') là "chưa trả lời", không phải trả lời sai. */
export const isSkipped = (a: { answer?: unknown }) => (a.answer as { kind?: string } | null | undefined)?.kind === 'none';

export function summarize(total: number, all: { ratio: number; pending?: boolean; answer?: unknown }[]): ResultSummary {
  const answers = all.filter((a) => !isSkipped(a));
  const done = answers.filter((a) => !a.pending);
  const correct = done.filter((a) => a.ratio >= 1).length;
  const partial = done.filter((a) => a.ratio > 0 && a.ratio < 1).length;
  const wrong = done.length - correct - partial;
  const earned = done.reduce((t, a) => t + Math.max(0, Math.min(1, a.ratio)), 0);
  const pct = total ? Math.round((earned / total) * 100) : 0;
  const p = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return { total, correct, partial, wrong, blank: Math.max(0, total - answers.length), pct_full: p(correct), pct_partial: p(partial), pct, level: levelOf(pct) };
}
