// Bản nháp của hộp "Soạn câu hỏi mới" <-> lược đồ Question chuẩn (types.ts).
// Giáo viên gõ chữ thuần, chỗ trống ghi là [___]; khi lưu chuyển thành [blank_1], [blank_2]…
import type { Option, Question, QuestionType, VideoMedia } from './types';
import { htmlToText, plainToHtml, uid } from './util';

export const BLANK = '[___]';

export interface Cell { id: string; text: string; image?: string }
export interface ChoiceCell extends Cell { correct: boolean }
export interface Pair { pid: string; left: Cell; right: Cell }

export interface Draft {
  id: string;
  type: QuestionType;
  text: string;
  image?: string;
  image_alt?: string;
  audio?: string;
  video?: VideoMedia;
  hyperlink?: string;
  options: ChoiceCell[]; // một / nhiều đáp án
  tf: boolean; // Đúng/Sai: nhận định là Đúng?
  tfIds: [string, string];
  blanks: string[]; // từ đúng của từng chỗ trống, nhiều cách viết ngăn bằng |
  noAccent: boolean[]; // từng chỗ trống: chấp nhận gõ không dấu
  fillMode: 'type' | 'bank' | 'menu'; // gõ chữ / kho từ / menu thả xuống
  distractors: string[];
  steps: Cell[];
  pairs: Pair[];
  extraRights: Cell[]; // phương án nhiễu cột B của đề cũ (giữ nguyên)
  explanation: string;
  explanation_image?: string;
  subject: string;
  lesson: string;
  coins: number;
  time: number;
  points: number;
  scoring: 'all_or_nothing' | 'partial';
  plain: boolean; // một đáp án: ô đáp án nền trắng, không tô màu
}

const cell = (text = '', image?: string): Cell => ({ id: uid('o'), text, image });

export function emptyDraft(type: QuestionType, keep?: Partial<Pick<Draft, 'subject' | 'lesson' | 'coins' | 'points'>>): Draft {
  const pairs = [0, 1, 2].map(() => ({ pid: uid('p'), left: cell(), right: cell() }));
  return {
    id: uid('q'),
    type,
    text: '',
    options: [0, 1, 2, 3].map((i) => ({ ...cell(), correct: i === 0 || (type === 'multiple_select' && i === 1) })),
    tf: true,
    tfIds: [uid('o'), uid('o')],
    blanks: [],
    noAccent: [],
    fillMode: 'type',
    distractors: [],
    steps: [cell(), cell(), cell()],
    pairs,
    extraRights: [],
    explanation: '',
    subject: keep?.subject ?? 'Toán học',
    lesson: keep?.lesson ?? '',
    coins: keep?.coins ?? 2,
    time: defaultTime(type),
    points: keep?.points ?? 10,
    plain: false,
    scoring: type === 'multiple_select' || type === 'matching' || type === 'fill_blank' ? 'partial' : 'all_or_nothing',
  };
}

export const defaultTime = (t: QuestionType) => (t === 'true_false' ? 20 : t === 'oral' ? 60 : ['fill_blank', 'reorder', 'matching'].includes(t) ? 45 : 30);

const txt = (html: string) => htmlToText(html ?? '');

/** Đổi dạng câu hỏi nhưng giữ nội dung đã nhập. */
export function switchType(d: Draft, type: QuestionType): Draft {
  if (d.type === type) return d;
  const next: Draft = { ...d, type, time: d.time === defaultTime(d.type) ? defaultTime(type) : d.time };
  if (type === 'single_choice') {
    const first = next.options.findIndex((o) => o.correct);
    next.options = next.options.map((o, i) => ({ ...o, correct: i === Math.max(0, first) }));
  }
  if (type === 'multiple_select' || type === 'matching' || type === 'fill_blank') next.scoring = 'partial';
  return next;
}

export function countBlanks(text: string) {
  return text.split(BLANK).length - 1;
}

export function fromQuestion(q: Question): Draft {
  const d = emptyDraft(q.type === 'drag_drop' ? 'fill_blank' : q.type);
  d.id = q.id;
  d.image = q.stem.image_url;
  d.image_alt = q.stem.image_alt;
  d.audio = q.stem.audio_url;
  d.video = q.stem.video;
  d.hyperlink = q.stem.hyperlink;
  d.explanation = q.explanation ?? '';
  d.explanation_image = q.explanation_image;
  d.subject = q.subject ?? d.subject;
  d.lesson = q.lesson ?? '';
  d.coins = q.coins ?? 2;
  d.time = q.time_limit_seconds;
  d.points = q.points;
  d.scoring = q.scoring ?? d.scoring;
  d.plain = !!q.plain_options;
  // Chỗ trống theo thứ tự xuất hiện trong câu
  const order = [...q.stem.text.matchAll(/\[(blank_\d+)\]/g)].map((m) => m[1]);
  d.text = txt(q.stem.text.replace(/\[blank_\d+\]/g, BLANK));
  switch (q.type) {
    case 'single_choice':
    case 'multiple_select':
      d.options = q.options.map((o) => ({ id: o.option_id, text: txt(o.text), image: o.image_url, correct: !!o.is_correct }));
      break;
    case 'true_false': {
      const t = q.options.find((o) => /^đúng|true$/i.test(txt(o.text))) ?? q.options[0];
      const f = q.options.find((o) => o !== t) ?? q.options[1];
      d.tf = !!t?.is_correct;
      d.tfIds = [t?.option_id ?? uid('o'), f?.option_id ?? uid('o')];
      break;
    }
    case 'fill_blank':
      d.blanks = order.map((id) => (q.blanks ?? []).find((b) => b.blank_id === id)?.accepted.join(' | ') ?? '');
      d.noAccent = order.map((id) => !!(q.blanks ?? []).find((b) => b.blank_id === id)?.ignore_accents);
      d.distractors = q.distractors ?? [];
      d.fillMode = q.fill_mode ?? (d.distractors.length ? 'bank' : 'type');
      break;
    case 'drag_drop': // đề cũ: thẻ đúng -> từ đúng, thẻ nhiễu -> từ gây nhiễu
      d.blanks = order.map((id) => txt(q.options.find((o) => o.match_pair_id === id)?.text ?? ''));
      d.distractors = q.options.filter((o) => !o.match_pair_id).map((o) => txt(o.text)).filter(Boolean);
      break;
    case 'reorder':
      d.steps = q.options
        .slice()
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((o) => ({ id: o.option_id, text: txt(o.text), image: o.image_url }));
      break;
    case 'matching': {
      const L = q.options.filter((o) => o.side === 'left');
      const R = q.options.filter((o) => o.side === 'right');
      d.pairs = L.map((l) => {
        const r = R.find((x) => x.match_pair_id === l.match_pair_id);
        return { pid: l.match_pair_id ?? uid('p'), left: { id: l.option_id, text: txt(l.text), image: l.image_url }, right: { id: r?.option_id ?? uid('o'), text: txt(r?.text ?? ''), image: r?.image_url } };
      });
      d.extraRights = R.filter((r) => !L.some((l) => l.match_pair_id === r.match_pair_id)).map((r) => ({ id: r.option_id, text: txt(r.text), image: r.image_url }));
      break;
    }
  }
  return d;
}

export function toQuestion(d: Draft): Question {
  let n = 0;
  const stemHtml = plainToHtml(d.text.trim()).replace(/\[___\]/g, () => `[blank_${++n}]`);
  const op = (c: Cell, extra: Partial<Option> = {}): Option => ({ option_id: c.id, text: plainToHtml(c.text.trim()), image_url: c.image, ...extra });
  const q: Question = {
    id: d.id,
    type: d.type,
    time_limit_seconds: d.time,
    points: d.points,
    coins: d.coins,
    subject: d.subject || undefined,
    lesson: d.lesson.trim() || undefined,
    stem: {
      text: d.type === 'fill_blank' ? stemHtml : plainToHtml(d.text.trim()),
      image_url: d.image,
      image_alt: d.image_alt,
      audio_url: d.audio,
      video: d.video,
      hyperlink: d.hyperlink,
    },
    options: [],
    explanation: d.explanation.trim() || undefined,
    explanation_image: d.explanation_image,
  };
  if (['multiple_select', 'fill_blank', 'reorder', 'matching'].includes(d.type)) q.scoring = d.scoring;
  if (d.type === 'single_choice' && d.plain) q.plain_options = true;
  switch (d.type) {
    case 'single_choice':
    case 'multiple_select':
      q.options = d.options.map((o) => op(o, { is_correct: o.correct }));
      break;
    case 'true_false':
      q.options = [
        { option_id: d.tfIds[0], text: 'Đúng', is_correct: d.tf },
        { option_id: d.tfIds[1], text: 'Sai', is_correct: !d.tf },
      ];
      break;
    case 'fill_blank': {
      const words = d.distractors.map((x) => x.trim()).filter(Boolean);
      // Bản nháp từ bộ nhập đề/AI không đặt fillMode: có từ nhiễu thì hiểu là "kho từ" như trước đây
      const mode = d.fillMode === 'type' && words.length ? 'bank' : d.fillMode;
      q.blanks = Array.from({ length: n }, (_, i) => ({
        blank_id: `blank_${i + 1}`,
        accepted: (d.blanks[i] ?? '').split('|').map((x) => x.trim()).filter(Boolean),
        match_rule: 'ignore_case' as const,
        ...(mode === 'type' && d.noAccent[i] ? { ignore_accents: true } : {}),
      }));
      q.distractors = words;
      if (!words.length) delete q.distractors;
      if (mode === 'type') delete q.fill_mode;
      else q.fill_mode = mode;
      break;
    }
    case 'reorder':
      q.options = d.steps.map((s, i) => op(s, { order_index: i }));
      break;
    case 'matching':
      q.options = [
        ...d.pairs.map((p) => op(p.left, { side: 'left', match_pair_id: p.pid })),
        ...d.pairs.map((p) => op(p.right, { side: 'right', match_pair_id: p.pid })),
        ...d.extraRights.map((r) => op(r, { side: 'right', match_pair_id: uid('x') })),
      ];
      break;
  }
  return q;
}
