import type { Question } from './types';

/** Câu trả lời của học sinh theo từng dạng. */
export type Answer =
  | { kind: 'choice'; option_ids: string[] } // single, multiple, true_false
  | { kind: 'fill'; values: Record<string, string> } // blank_id -> chữ
  | { kind: 'drag'; placement: Record<string, string> } // zone(blank_id) -> option_id
  | { kind: 'order'; option_ids: string[] } // thứ tự học sinh sắp
  | { kind: 'match'; pairs: Record<string, string> } // left option_id -> right option_id
  | { kind: 'oral'; text?: string; audio_url?: string; audio_ms?: number } // trả lời miệng – giáo viên chấm (em có thể gõ chữ và/hoặc ghi âm)
  | { kind: 'none' }; // hết giờ không trả lời

export function normalizeText(s: string, rule: 'exact' | 'ignore_case', noAccents = false): string {
  let t = s.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (noAccents) t = stripAccents(t);
  return rule === 'ignore_case' ? t.toLocaleLowerCase('vi') : t;
}

/** Bỏ dấu tiếng Việt: "Hà Nội" → "Ha Noi". */
export const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');

/** Trả về tỉ lệ đúng 0..1 (đã áp dụng quy tắc chấm toàn phần / từng phần). */
export function gradeRatio(q: Question, a: Answer): number {
  if (a.kind === 'none' || a.kind === 'oral' || q.type === 'oral') return 0; // trả lời miệng: chờ giáo viên chấm
  const partial = q.scoring === 'partial';
  switch (q.type) {
    case 'single_choice':
    case 'true_false': {
      if (a.kind !== 'choice' || a.option_ids.length !== 1) return 0;
      return q.options.find((o) => o.option_id === a.option_ids[0])?.is_correct ? 1 : 0;
    }
    case 'multiple_select': {
      if (a.kind !== 'choice') return 0;
      const correct = new Set(q.options.filter((o) => o.is_correct).map((o) => o.option_id));
      const chosen = new Set(a.option_ids);
      if (!correct.size) return 0;
      let hit = 0;
      let wrong = 0;
      chosen.forEach((id) => (correct.has(id) ? hit++ : wrong++));
      if (!partial) return hit === correct.size && wrong === 0 ? 1 : 0;
      // Từng phần: mỗi đáp án đúng +1, mỗi lựa chọn sai −1, không âm
      return Math.max(0, (hit - wrong) / correct.size);
    }
    case 'fill_blank': {
      if (a.kind !== 'fill') return 0;
      const blanks = q.blanks ?? [];
      if (!blanks.length) return 0;
      const ok = blanks.filter((b) => {
        const v = normalizeText(a.values[b.blank_id] ?? '', b.match_rule, b.ignore_accents);
        return v !== '' && b.accepted.some((acc) => normalizeText(acc, b.match_rule, b.ignore_accents) === v);
      }).length;
      return partial ? ok / blanks.length : ok === blanks.length ? 1 : 0;
    }
    case 'drag_drop': {
      if (a.kind !== 'drag') return 0;
      const zones = (q.blanks ?? []).map((b) => b.blank_id);
      if (!zones.length) return 0;
      const ok = zones.filter((z) => {
        const opt = q.options.find((o) => o.option_id === a.placement[z]);
        return opt?.match_pair_id === z;
      }).length;
      return partial ? ok / zones.length : ok === zones.length ? 1 : 0;
    }
    case 'reorder': {
      if (a.kind !== 'order') return 0;
      const expected = q.options
        .slice()
        .sort((x, y) => (x.order_index ?? 0) - (y.order_index ?? 0))
        .map((o) => o.option_id);
      if (!expected.length || a.option_ids.length !== expected.length) return 0;
      const ok = expected.filter((id, i) => a.option_ids[i] === id).length;
      return partial ? ok / expected.length : ok === expected.length ? 1 : 0;
    }
    case 'matching': {
      if (a.kind !== 'match') return 0;
      const lefts = q.options.filter((o) => o.side === 'left');
      if (!lefts.length) return 0;
      const ok = lefts.filter((l) => {
        const r = q.options.find((o) => o.option_id === a.pairs[l.option_id]);
        return !!r && r.side === 'right' && !!l.match_pair_id && r.match_pair_id === l.match_pair_id;
      }).length;
      return partial ? ok / lefts.length : ok === lefts.length ? 1 : 0;
    }
  }
  return 0;
}

/** Điểm: trả lời nhanh được 100%, chậm nhất còn 50% số điểm; thưởng chuỗi khi bật power-ups. */
export const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * ĐIỂM của một câu = điểm giáo viên đặt cho câu đó × tỉ lệ đúng (đúng một phần được một phần điểm).
 * Điểm không phụ thuộc tốc độ, nên tổng điểm tối đa của cả bài đúng bằng tổng điểm các câu.
 */
export function computeScore(q: Question, ratio: number): number {
  return ratio <= 0 ? 0 : round2(q.points * Math.min(1, ratio));
}

/** Tỉ lệ điểm thưởng so với điểm của câu. */
export const SPEED_BONUS = 0.2; // trả lời đúng trong nửa đầu thời gian suy nghĩ
export const STREAK_BONUS = 0.5; // mỗi khi đạt 3, 6, 9… câu đúng liên tiếp
export const STREAK_EVERY = 3;

export interface Bonus { speed: number; streak: number; total: number }

/**
 * ĐIỂM THƯỞNG (cộng riêng, không tính vào điểm bài làm):
 *  - thưởng tốc độ: trả lời đúng hoàn toàn trong nửa đầu thời gian suy nghĩ (chỉ khi câu có tính giờ);
 *  - thưởng chuỗi: mỗi khi đạt 3, 6, 9… câu đúng liên tiếp (khi giáo viên bật).
 * Câu làm lại ở lượt làm lại câu sai không có điểm thưởng.
 */
export function computeBonus(q: Question, ratio: number, timeMs: number, streakAfter: number, o: { timed: boolean; streaks: boolean; retry?: boolean }): Bonus {
  if (ratio < 1 || o.retry) return { speed: 0, streak: 0, total: 0 };
  const limit = Math.max(1, q.time_limit_seconds) * 1000;
  const speed = o.timed && timeMs <= limit / 2 ? round2(q.points * SPEED_BONUS) : 0;
  const streak = o.streaks && streakAfter > 0 && streakAfter % STREAK_EVERY === 0 ? round2(q.points * STREAK_BONUS) : 0;
  return { speed, streak, total: round2(speed + streak) };
}

/** Kiểm tra câu hỏi hợp lệ trước khi lưu – trả về danh sách lỗi tiếng Việt. */
export function validateQuestion(q: Question): string[] {
  const errs: string[] = [];
  const hasMedia = !!(q.stem.image_url || q.stem.audio_url || q.stem.video);
  const text = q.stem.text.replace(/<[^>]*>/g, '').trim();
  if (!text && !hasMedia) errs.push('Chưa có nội dung câu hỏi (chữ, ảnh, âm thanh hoặc video).');
  const filled = (o: { text: string; image_url?: string }) => !!(o.text.replace(/<[^>]*>/g, '').trim() || o.image_url);
  switch (q.type) {
    case 'single_choice':
    case 'multiple_select': {
      if (q.options.length < 2 || q.options.length > 6) errs.push('Cần từ 2 đến 6 phương án.');
      if (q.options.some((o) => !filled(o))) errs.push('Có phương án đang để trống.');
      const n = q.options.filter((o) => o.is_correct).length;
      if (q.type === 'single_choice' && n !== 1) errs.push('Dạng một đáp án đúng cần đánh dấu đúng 1 phương án.');
      if (q.type === 'multiple_select' && n < 2) errs.push('Dạng nhiều đáp án đúng cần ít nhất 2 phương án đúng.');
      break;
    }
    case 'true_false':
      if (q.options.filter((o) => o.is_correct).length !== 1) errs.push('Hãy chọn nhận định là Đúng hay Sai.');
      break;
    case 'fill_blank': {
      const blanks = q.blanks ?? [];
      if (!blanks.length) errs.push('Chưa có ô trống nào. Bấm "Thêm ô trống" để chèn [blank_1].');
      blanks.forEach((b, i) => {
        if (!q.stem.text.includes(`[${b.blank_id}]`)) errs.push(`Ô trống ${i + 1} không còn trong câu hỏi.`);
        if (!b.accepted.some((x) => x.trim())) errs.push(`Ô trống ${i + 1} chưa có từ khóa đúng.`);
      });
      break;
    }
    case 'drag_drop': {
      const zones = q.blanks ?? [];
      if (!zones.length) errs.push('Chưa có ô thả nào trong câu hỏi.');
      zones.forEach((z, i) => {
        if (!q.options.some((o) => o.match_pair_id === z.blank_id)) errs.push(`Ô thả ${i + 1} chưa có thẻ đáp án đúng.`);
      });
      if (q.options.some((o) => !filled(o))) errs.push('Có thẻ kéo thả đang để trống.');
      break;
    }
    case 'reorder':
      if (q.options.length < 2) errs.push('Cần ít nhất 2 bước để sắp xếp.');
      if (q.options.some((o) => !filled(o))) errs.push('Có bước đang để trống.');
      break;
    case 'matching': {
      const lefts = q.options.filter((o) => o.side === 'left');
      if (lefts.length < 2) errs.push('Cần ít nhất 2 cặp nối.');
      if (q.options.some((o) => !filled(o))) errs.push('Có ô nối đang để trống.');
      break;
    }
  }
  if (q.type === 'fill_blank' && (q.distractors ?? []).some((d) => (q.blanks ?? []).some((b) => b.accepted.some((a) => normalizeText(a, 'ignore_case') === normalizeText(d, 'ignore_case')))))
    errs.push('Có từ gây nhiễu trùng với từ đúng.');
  if (q.time_limit_seconds < 5) errs.push('Thời gian tối thiểu 5 giây.');
  return errs;
}
