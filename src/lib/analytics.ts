// Thống kê chi tiết một phiên (trực tuyến hoặc thẻ giấy). Dùng CHUNG cách tính và 4 mức đánh giá với bảng tổng kết của học sinh
// (src/lib/cheer.ts) để số liệu giáo viên và học sinh nhìn thấy luôn giống nhau.
import type { Quiz, Session } from './types';
import { questionStats, type QuestionStat } from './report';
import { LEVEL_LABEL, isSkipped, summarize, type Level } from './cheer';
import type { Player } from './types';

export const LEVELS: Level[] = ['excellent', 'good', 'pass', 'effort'];
export { LEVEL_LABEL };
export type { Level };

export interface StudentStat {
  player_id: string;
  name: string;
  class_name: string;
  avatar: string;
  correct: number; // số câu đúng hoàn toàn
  partial: number; // số câu đúng một phần
  wrong: number;
  blank: number; // chưa làm
  pct_full: number; // % câu đúng hoàn toàn
  pct_partial: number; // % câu đúng một phần
  pct: number; // % số điểm đạt được (câu đúng một phần tính theo phần đúng) → quyết định mức đánh giá
  mark10: number; // quy về thang điểm 10
  score: number;
  level: Level;
  answered: number;
  finished: boolean;
  violations: number;
  duration_ms: number | null; // thời gian làm cả bài (trực tiếp tự do, bài về nhà); null = chưa nộp
  attempt_no: number; // lần làm bài thứ mấy
  latest: boolean; // là lần làm mới nhất của em đó (chỉ lần mới nhất được tính vào số liệu tổng)
  started_at: number; // ngày giờ bắt đầu lần làm này
}

/** Thời gian làm cả bài: từ lúc bắt đầu (hoặc lúc vào phòng nếu vào sau / bài về nhà) đến lúc làm xong. */
export function durationOf(s: Pick<Session, 'settings' | 'started_at'>, p: Pick<Player, 'joined_at' | 'finished_at'>): number | null {
  if (s.settings.mode !== 'classic_live' && s.settings.mode !== 'homework') return null;
  if (!p.finished_at) return null;
  const start = s.settings.mode === 'homework' ? p.joined_at ?? s.started_at : Math.max(s.started_at ?? 0, p.joined_at ?? 0);
  return start && p.finished_at > start ? p.finished_at - start : null;
}
export interface ClassStat { class_name: string; students: number; pct: number; pct_full: number; pct_partial: number; pass_pct: number; avg10: number }
export interface SessionAnalytics {
  live: boolean; // phiên chưa kết thúc: tỉ lệ của mỗi em tạm tính trên các câu em đã làm
  students: StudentStat[]; // lần mới nhất của mỗi em xếp từ cao xuống thấp; các lần cũ của em đó nằm ngay bên dưới (mới trước, cũ sau)
  attempts: number; // tổng số lượt làm bài (kể cả các lần cũ)
  total_students: number;
  rated: number; // số em được xếp mức (đang diễn ra: chỉ các em đã trả lời ít nhất 1 câu)
  finished: number;
  answered: number; // tổng lượt trả lời đã chấm
  full: number; // lượt đúng hoàn toàn
  partial: number; // lượt đúng một phần
  wrong: number;
  full_pct: number;
  partial_pct: number;
  wrong_pct: number;
  pass_count: number; // số em từ mức Đạt yêu cầu trở lên
  pass_pct: number;
  avg10: number;
  levels: Record<Level, number>;
  classes: ClassStat[];
  questions: QuestionStat[];
  hardest: QuestionStat[]; // câu sai nhiều nhất (đã có người trả lời)
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const avg = (list: number[]) => (list.length ? list.reduce((t, x) => t + x, 0) / list.length : 0);

export function analyze(s: Session, quiz: Quiz | null): SessionAnalytics {
  const live = s.state !== 'COMPLETED';
  const total = Math.max(1, s.question_count);
  const byPlayer = new Map<string, { ratio: number; pending?: boolean; answer?: unknown }[]>();
  for (const a of s.answers) byPlayer.set(a.player_id, [...(byPlayer.get(a.player_id) ?? []), a]);

  const students: StudentStat[] = s.players
    .filter((p) => !p.kicked)
    .map((p) => {
      const answers = byPlayer.get(p.player_id) ?? [];
      // Khi kết thúc: tính trên tổng số câu (bỏ trống = sai). Khi đang diễn ra: tính trên số câu em đã làm.
      const real = answers.filter((x) => !isSkipped(x)).length; // không tính câu hết giờ chưa trả lời
      // Em đã nộp bài thì luôn tính trên tổng số câu, đúng như bảng tổng kết em đó nhìn thấy
      const r = summarize(live && !p.finished ? Math.max(1, real) : total, answers);
      return {
        player_id: p.player_id,
        name: p.name,
        class_name: p.class_name ?? s.paper?.class_name ?? '',
        avatar: p.avatar,
        correct: r.correct,
        partial: r.partial,
        wrong: r.wrong,
        blank: Math.max(0, total - real),
        pct_full: r.pct_full,
        pct_partial: r.pct_partial,
        pct: r.pct,
        mark10: round1(r.pct / 10),
        score: p.score,
        level: r.level,
        answered: real,
        finished: p.finished,
        violations: p.violations ?? 0,
        duration_ms: durationOf(s, p),
        attempt_no: p.attempt_no ?? 1,
        latest: !p.superseded,
        started_at: p.joined_at ?? s.started_at ?? s.created_at,
      };
    })
    // cùng tỉ lệ thì bạn làm nhanh hơn xếp trên
    .sort((a, b) => b.pct - a.pct || (a.duration_ms ?? Infinity) - (b.duration_ms ?? Infinity) || b.score - a.score || a.name.localeCompare(b.name, 'vi'));

  // Gom các lần làm của cùng một em (cùng tên + lớp): lần mới nhất ở trên, các lần cũ ngay bên dưới
  const keyOf = (x: StudentStat) => `${x.name.toLocaleLowerCase('vi')}|${x.class_name.toLocaleLowerCase('vi')}`;
  const newest = students.filter((x) => x.latest);
  const older = students.filter((x) => !x.latest);
  const grouped: StudentStat[] = [];
  for (const x of newest) {
    grouped.push(x, ...older.filter((o) => keyOf(o) === keyOf(x)).sort((a, b) => b.attempt_no - a.attempt_no));
  }
  grouped.push(...older.filter((o) => !newest.some((x) => keyOf(x) === keyOf(o))));
  const attempts = students.length;
  students.length = 0;
  students.push(...grouped);

  const current = students.filter((x) => x.latest); // số liệu tổng chỉ tính lần làm mới nhất của mỗi em
  const rated = live ? current.filter((x) => x.answered > 0) : current;
  const levels: Record<Level, number> = { excellent: 0, good: 0, pass: 0, effort: 0 };
  rated.forEach((x) => levels[x.level]++);
  const full = current.reduce((t, x) => t + x.correct, 0);
  const partial = current.reduce((t, x) => t + x.partial, 0);
  const wrong = current.reduce((t, x) => t + x.wrong, 0);
  const answered = full + partial + wrong;
  const passCount = rated.length - levels.effort;

  const groups = new Map<string, StudentStat[]>();
  rated.forEach((x) => groups.set(x.class_name || 'Chưa ghi lớp', [...(groups.get(x.class_name || 'Chưa ghi lớp') ?? []), x]));
  const classes: ClassStat[] = [...groups.entries()]
    .map(([class_name, list]) => ({
      class_name,
      students: list.length,
      pct: Math.round(avg(list.map((x) => x.pct))),
      pct_full: Math.round(avg(list.map((x) => x.pct_full))),
      pct_partial: Math.round(avg(list.map((x) => x.pct_partial))),
      pass_pct: pctOf(list.filter((x) => x.level !== 'effort').length, list.length),
      avg10: round1(avg(list.map((x) => x.mark10))),
    }))
    .sort((a, b) => a.class_name.localeCompare(b.class_name, 'vi', { numeric: true }));

  const questions = quiz ? questionStats(quiz, s) : [];
  const hardest = questions.filter((q) => q.answered > 0 && q.pct < 60).sort((a, b) => a.pct - b.pct).slice(0, 5);

  return {
    live,
    students,
    total_students: current.length,
    attempts,
    rated: rated.length,
    finished: current.filter((x) => x.finished).length,
    answered,
    full,
    partial,
    wrong,
    full_pct: pctOf(full, answered),
    partial_pct: pctOf(partial, answered),
    wrong_pct: pctOf(wrong, answered),
    pass_count: passCount,
    pass_pct: pctOf(passCount, rated.length),
    avg10: round1(avg(rated.map((x) => x.mark10))),
    levels,
    classes,
    questions,
    hardest,
  };
}

/** Dữ liệu cho tệp Excel báo cáo chi tiết. */
export function analyticsSheets(s: Session, a: SessionAnalytics) {
  return [
    {
      name: 'Tổng quan',
      rows: [
        [`Báo cáo: ${s.quiz_title}`],
        [`Mã phòng: ${s.pin}`, `Ngày: ${new Date(s.created_at).toLocaleString('vi-VN')}`],
        [],
        ['Số học sinh', a.total_students],
        ['Đã hoàn thành', a.finished],
        ['Tỉ lệ trả lời đúng hoàn toàn (%)', a.full_pct],
        ['Tỉ lệ trả lời đúng một phần (%)', a.partial_pct],
        ['Tỉ lệ trả lời sai (%)', a.wrong_pct],
        ['Tỉ lệ học sinh đạt yêu cầu trở lên (%)', a.pass_pct],
        ['Điểm trung bình (thang 10)', a.avg10],
        [],
        ['Mức đánh giá', 'Số học sinh'],
        ...LEVELS.map((g) => [LEVEL_LABEL[g], a.levels[g]]),
        ['Cách xếp mức: Hoàn thành xuất sắc từ 90% số điểm · Hoàn thành tốt từ 70% · Đạt yêu cầu từ 50% · Chưa đạt yêu cầu dưới 50%'],
        [],
        ['Lớp', 'Số học sinh', 'Đúng hoàn toàn TB (%)', 'Đúng một phần TB (%)', 'Đạt yêu cầu trở lên (%)', 'Điểm TB (thang 10)'],
        ...a.classes.map((c) => [c.class_name, c.students, c.pct_full, c.pct_partial, c.pass_pct, c.avg10]),
      ],
    },
    {
      name: 'Học sinh',
      rows: [
        ['STT', 'Họ tên', 'Lớp', 'Lần làm bài', 'Lần mới nhất', 'Bắt đầu lúc', 'Đúng hoàn toàn', 'Đúng một phần', 'Sai', 'Chưa làm', 'Đúng hoàn toàn (%)', 'Đúng một phần (%)', 'Số điểm đạt (%)', 'Điểm (thang 10)', 'Điểm trò chơi', 'Mức đánh giá', 'Thời gian làm bài (giây)', 'Số lần vi phạm'],
        ...a.students.map((x, i) => [i + 1, x.name, x.class_name, x.attempt_no, x.latest ? 'Có' : '', new Date(x.started_at).toLocaleString('vi-VN'), x.correct, x.partial, x.wrong, x.blank, x.pct_full, x.pct_partial, x.pct, x.mark10, x.score, LEVEL_LABEL[x.level], x.duration_ms === null ? '' : Math.round(x.duration_ms / 1000), x.violations]),
      ],
    },
    {
      name: 'Câu hỏi',
      rows: [
        ['Câu', 'Nội dung', 'Dạng', 'Số lượt trả lời', 'Số lượt đúng hoàn toàn', 'Tỉ lệ đúng hoàn toàn (%)', 'Thời gian TB (giây)'],
        ...a.questions.map((q) => [q.index, q.text, q.type, q.answered, q.correct, q.pct, q.avg_time_s]),
      ],
    },
  ];
}
