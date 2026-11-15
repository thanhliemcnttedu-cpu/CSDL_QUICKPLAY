// Máy trạng thái phiên – bản chạy trong trình duyệt (chế độ cục bộ). Apps Script cài đặt cùng quy tắc (docs/API.md).
import type { AnswerRecord, Player, PollResult, Session, SessionSettings, ViolationKind } from './types';
import { uid } from './util';

export type HostOp = 'start' | 'pause' | 'resume' | 'next' | 'lock' | 'end' | 'kick' | 'unlock' | 'grade';

/** Giáo viên chấm một câu trả lời miệng. points/coins lấy từ đề phía giáo viên. */
export function gradeOral(s: Session, playerId: string, qIndex: number, correct: boolean, points: number, coins: number) {
  const rec = s.answers.find((a) => a.player_id === playerId && a.q_index === qIndex);
  const p = s.players.find((x) => x.player_id === playerId);
  if (!rec || !p) throw new Error('Không tìm thấy câu trả lời cần chấm.');
  // Hoàn tác kết quả cũ nếu chấm lại
  if (!rec.pending) {
    p.score -= rec.score;
    p.coins = (p.coins ?? 0) - (rec.coins ?? 0);
    if (rec.correct) p.correct -= 1;
  }
  rec.pending = false;
  rec.correct = correct;
  rec.ratio = correct ? 1 : 0;
  rec.score = correct ? Math.max(0, Math.round(points * 100) / 100) : 0;
  rec.coins = correct ? Math.max(0, Math.round(coins * 100) / 100) : 0;
  p.score += rec.score;
  p.coins = (p.coins ?? 0) + rec.coins;
  if (correct) p.correct += 1;
  return rec;
}

export const VIOLATION_KINDS: ViolationKind[] = [
  'tab_hidden', 'window_blur', 'exit_fullscreen', 'right_click', 'copy_paste',
  'screenshot_key', 'devtools', 'shortcut', 'split_screen', 'open_link',
];
const MAX_VIOLATION_LOG = 3000;
const VIOLATION_DEBOUNCE_MS = 3000;

/** Ghi một lần vi phạm; tự khóa bài khi đạt ngưỡng. Trả về số lần và trạng thái khóa. */
export function reportViolation(
  s: Session,
  playerId: string,
  kind: ViolationKind,
  detail = '',
  qIndex?: number,
): { violations: number; locked: boolean } {
  const p = s.players.find((x) => x.player_id === playerId);
  if (!p) throw new Error('Không tìm thấy người chơi.');
  if (!VIOLATION_KINDS.includes(kind)) throw new Error('Loại vi phạm không hợp lệ.');
  const now = Date.now();
  s.violations ??= [];
  // Chống ghi trùng: cùng loại từ cùng học sinh trong 3 giây chỉ tính 1 lần
  const last = [...s.violations].reverse().find((v) => v.player_id === playerId && v.kind === kind);
  if (!last || now - last.at > VIOLATION_DEBOUNCE_MS) {
    s.violations.push({ player_id: playerId, name: p.name, kind, detail: detail.slice(0, 200), q_index: qIndex, at: now });
    if (s.violations.length > MAX_VIOLATION_LOG) s.violations.splice(0, s.violations.length - MAX_VIOLATION_LOG);
    if (kind !== 'open_link') {
      p.violations = (p.violations ?? 0) + 1;
      const max = s.settings.anti_cheat?.enabled ? s.settings.anti_cheat.max_violations : 0;
      // Ngưỡng N: N lần đầu chỉ cảnh báo, vượt quá N (lần thứ N+1) thì khóa lượt chơi
      if (max > 0 && p.violations - (p.violation_base ?? 0) > max) p.locked = true;
    }
  }
  return { violations: p.violations ?? 0, locked: !!p.locked };
}

export function createSession(pin: string, quizId: string, title: string, count: number, settings: SessionSettings): Session {
  return {
    session_id: uid('s_'),
    pin,
    quiz_id: quizId,
    quiz_title: title,
    settings,
    state: settings.mode === 'homework' ? 'IN_PROGRESS' : 'LOBBY_WAITING',
    created_at: Date.now(),
    started_at: settings.mode === 'homework' ? Date.now() : undefined,
    current_index: 0,
    players: [],
    answers: [],
    question_count: count,
    paused_total_ms: 0,
  };
}

export function applyHostOp(
  s: Session,
  op: HostOp,
  playerId?: string,
  extra: { q_index?: number; correct?: boolean; points?: number; coins?: number } = {},
): Session {
  const now = Date.now();
  switch (op) {
    case 'start':
      if (s.state !== 'LOBBY_WAITING') break;
      s.state = 'IN_PROGRESS';
      s.started_at = now; // đếm ngược 3-2-1 hiển thị ở máy học sinh
      s.question_opened_at = now;
      s.current_index = 0;
      s.question_locked = false;
      break;
    case 'pause':
      if (s.state === 'IN_PROGRESS') {
        s.state = 'PAUSED';
        s.paused_at = now;
      }
      break;
    case 'resume':
      if (s.state === 'PAUSED') {
        s.state = 'IN_PROGRESS';
        s.paused_total_ms = (s.paused_total_ms ?? 0) + (now - (s.paused_at ?? now));
        if (s.question_opened_at) s.question_opened_at += now - (s.paused_at ?? now);
        s.paused_at = undefined;
      }
      break;
    case 'lock':
      s.question_locked = true;
      break;
    case 'next':
      if (s.current_index + 1 >= s.question_count) {
        s.state = 'COMPLETED';
        s.ended_at = now;
      } else {
        s.current_index += 1;
        s.question_locked = false;
        s.question_opened_at = now;
      }
      break;
    case 'end':
      s.state = 'COMPLETED';
      s.ended_at = now;
      break;
    case 'kick': {
      const p = s.players.find((x) => x.player_id === playerId);
      if (p) p.kicked = true;
      break;
    }
    case 'unlock': {
      const p = s.players.find((x) => x.player_id === playerId);
      if (p) {
        p.locked = false;
        p.violation_base = p.violations ?? 0; // đếm lại từ đầu sau khi mở khóa
      }
      break;
    }
    case 'grade':
      if (playerId && extra.q_index !== undefined)
        gradeOral(s, playerId, extra.q_index, !!extra.correct, extra.points ?? 0, extra.coins ?? 0);
      break;
  }
  return s;
}

/** Tiền tố của lỗi "tên này đã được dùng ở lượt trước": máy học sinh bắt lỗi này để hỏi em đổi tên hay vẫn dùng tên cũ. */
export const NAME_USED = '[TEN_DA_DUNG]';

export function joinPlayer(s: Session, name: string, avatar: string, playerId?: string, className = '', reuseName = false): Player {
  const now = Date.now();
  const existing = playerId ? s.players.find((p) => p.player_id === playerId) : undefined;
  if (existing) {
    if (existing.kicked) throw new Error('Bạn đã được giáo viên mời ra khỏi phòng.');
    existing.last_seen = now;
    return existing;
  }
  if (s.state === 'COMPLETED') throw new Error('Phiên này đã kết thúc.');
  if (s.settings.mode === 'paper') throw new Error('Phòng này dùng thẻ trả lời giấy, học sinh không cần vào bằng thiết bị.');
  if (s.settings.mode === 'homework') {
    if (s.settings.start_time && now < Date.parse(s.settings.start_time)) throw new Error('Bài tập chưa đến giờ mở.');
    if (s.settings.deadline && now > Date.parse(s.settings.deadline)) throw new Error('Đã quá hạn nộp bài.');
  } else if (s.state !== 'LOBBY_WAITING' && s.settings.mode === 'instructor_paced') {
    // vẫn cho vào muộn, bắt đầu từ câu hiện tại
  }
  const clean = name.trim().slice(0, 24);
  if (!clean) throw new Error('Hãy nhập tên hiển thị.');
  const cls = className.replace(/\s+/g, ' ').trim().slice(0, 20);
  if (!cls) throw new Error('Hãy nhập lớp của em.');
  const same = (a: string, b: string) => a.toLocaleLowerCase('vi') === b.toLocaleLowerCase('vi');
  // Hai bạn trùng tên ở hai lớp khác nhau vẫn vào được
  // Cùng tên + cùng lớp: nếu lần trước đã nộp bài hoặc bị khóa thì đây là LẦN LÀM MỚI của em đó
  // (trực tiếp tự do, bài về nhà: làm lại không giới hạn số lần). Lần trước còn đang làm dở thì từ chối.
  const mine = s.players.filter((p) => !p.kicked && same(p.name, clean) && same(p.class_name ?? '', cls));
  const redo = s.settings.mode === 'classic_live' || s.settings.mode === 'homework';
  if (mine.some((p) => !redo || (!p.finished && !p.locked)))
    throw new Error('Tên này đang có bạn cùng lớp dùng, hãy thêm họ hoặc chọn tên khác.');
  // Tên + lớp này đã nộp bài ở lượt trước: báo cho em biết, chỉ vào tiếp khi em xác nhận vẫn dùng tên cũ
  if (mine.length && !reuseName) throw new Error(`${NAME_USED} Tên "${clean}" lớp ${cls} đã được dùng ở lượt làm trước.`);
  mine.forEach((p) => (p.superseded = true));
  const p: Player = {
    player_id: uid('p_'),
    name: clean,
    class_name: cls,
    avatar,
    score: 0,
    correct: 0,
    answered: 0,
    current_index: s.settings.mode === 'instructor_paced' ? s.current_index : 0,
    finished: false,
    last_seen: now,
    joined_at: now,
    streak: 0,
    ...(mine.length ? { attempt_no: mine.length + 1 } : {}),
  };
  s.players.push(p);
  return p;
}

export function submitAnswer(s: Session, rec: AnswerRecord): Player {
  const p = s.players.find((x) => x.player_id === rec.player_id);
  if (!p) throw new Error('Không tìm thấy người chơi.');
  if (p.kicked) throw new Error('Bạn đã được mời ra khỏi phòng.');
  if (p.locked) throw new Error('Bài làm đang bị khóa do vi phạm. Chờ giáo viên mở khóa.');
  if (s.state === 'COMPLETED') throw new Error('Phiên đã kết thúc.');
  const paced = s.settings.mode === 'instructor_paced';
  const old = s.answers.find((a) => a.player_id === rec.player_id && a.q_index === rec.q_index);
  if (old) {
    // Chỉ được thay câu trả lời cũ trong hai trường hợp:
    //  - giáo viên điều khiển: chọn lại đáp án khi câu đó còn mở (chưa khóa, chưa chuyển câu);
    //  - trực tiếp tự do / bài về nhà: lượt làm lại câu sai, không vượt số lượt giáo viên cho phép.
    const attempt = Math.floor(Number(rec.attempt) || 0);
    const can = paced
      ? !!rec.change && rec.q_index === s.current_index && !s.question_locked && s.state === 'IN_PROGRESS'
      : attempt > (old.attempt ?? 0) && attempt <= (s.settings.retry_rounds ?? 0) && !old.pending && old.ratio < 1;
    if (!can) return p; // chống nộp trùng
    if (!old.pending) {
      p.score -= old.score;
      p.coins = (p.coins ?? 0) - (old.coins ?? 0);
      if (old.correct) p.correct -= 1;
    }
    p.answered -= 1;
    s.answers.splice(s.answers.indexOf(old), 1);
  }
  const { change: _change, ...clean } = rec;
  rec = clean;
  if (!old || paced) delete rec.attempt;
  const pending = !!rec.pending;
  const coins = pending ? 0 : Math.max(0, Math.round((rec.coins ?? 0) * 100) / 100);
  s.answers.push({ ...rec, score: pending ? 0 : rec.score, coins, correct: pending ? false : rec.correct, at: Date.now() });
  p.answered += 1;
  if (!pending) {
    p.score += rec.score;
    p.coins = (p.coins ?? 0) + coins;
    if (rec.correct) {
      p.correct += 1;
      p.streak = (p.streak ?? 0) + 1;
    } else p.streak = 0;
  }
  if (!old) p.current_index = Math.max(p.current_index, rec.q_index + 1);
  p.last_seen = Date.now();
  // Tự đánh dấu "xong" khi đã trả lời hết, trừ khi còn lượt làm lại hoặc học sinh tự bấm Nộp bài (tự do chọn câu)
  const selfSubmit = !paced && (s.settings.navigation === 'free' || (s.settings.retry_rounds ?? 0) > 0);
  if (!selfSubmit && p.answered >= s.question_count && !p.finished) {
    p.finished = true;
    p.finished_at = Date.now();
  }
  // Giáo viên điều khiển: KHÔNG tự khóa câu khi cả lớp đã trả lời, để học sinh còn được chọn lại đáp án tới khi hết giờ
  return p;
}

/**
 * Giáo viên điều khiển, câu đang mở (chưa khóa): số liệu hiển thị CHƯA tính câu hiện tại,
 * để bảng xếp hạng và bảng điều khiển không làm lộ ai đúng ai sai trước khi hết giờ.
 */
export function visiblePlayers(s: Session): Player[] {
  const open = s.settings.mode === 'instructor_paced' && !s.question_locked && (s.state === 'IN_PROGRESS' || s.state === 'PAUSED');
  if (!open) return s.players;
  const cur = new Map(s.answers.filter((a) => a.q_index === s.current_index && !a.pending).map((a) => [a.player_id, a]));
  return s.players.map((p) => {
    const a = cur.get(p.player_id);
    if (!a) return p;
    return { ...p, score: Math.round((p.score - a.score) * 100) / 100, coins: Math.round(((p.coins ?? 0) - (a.coins ?? 0)) * 100) / 100, correct: p.correct - (a.correct ? 1 : 0) };
  });
}

export function pollView(s: Session, playerId?: string): PollResult {
  const now = Date.now();
  if (s.settings.mode === 'homework' && s.settings.deadline && now > Date.parse(s.settings.deadline) && s.state !== 'COMPLETED') {
    s.state = 'COMPLETED';
    s.ended_at = now;
  }
  const me = playerId ? s.players.find((p) => p.player_id === playerId) : undefined;
  if (me) me.last_seen = now;
  const visible = visiblePlayers(s).filter((p) => !p.kicked && (!p.superseded || p.player_id === playerId) && (s.state !== 'LOBBY_WAITING' || now - p.last_seen < 60000));
  let stats: Record<string, number> | undefined;
  if (s.settings.mode === 'instructor_paced') {
    stats = {};
    s.answers
      .filter((a) => a.q_index === s.current_index)
      .forEach((a) => {
        const key = answerKey(a.answer);
        stats![key] = (stats![key] ?? 0) + 1;
      });
  }
  return {
    state: s.state,
    mode: s.settings.mode,
    current_index: s.current_index,
    question_locked: !!s.question_locked,
    question_opened_at: s.question_opened_at,
    started_at: s.started_at,
    paused_at: s.paused_at,
    paused_total_ms: s.paused_total_ms,
    server_now: now,
    players: visible.map(({ player_id, name, class_name, avatar, score, correct, answered, finished, current_index, coins, joined_at, finished_at }) => ({
      player_id, name, class_name, avatar, score, correct, answered, finished, current_index, coins: coins ?? 0, joined_at, finished_at,
    })),
    my_pending: me ? s.answers.filter((a) => a.player_id === me.player_id && a.pending).map((a) => a.q_index) : undefined,
    my_graded: me
      ? Object.fromEntries(s.answers.filter((a) => a.player_id === me.player_id && a.answer && (a.answer as { kind?: string }).kind === 'oral' && !a.pending).map((a) => [a.q_index, a.correct]))
      : undefined,
    kicked: me?.kicked,
    locked: me?.locked,
    my_violations: me?.violations ?? 0,
    question_stats: stats,
  };
}

/** Khóa thống kê: với dạng chọn đáp án là từng option_id; dạng khác là "correct"/"wrong". */
export function answerKey(ans: unknown): string {
  const a = ans as { kind?: string; option_ids?: string[] };
  if (a?.kind === 'choice' && a.option_ids) return a.option_ids.slice().sort().join('+') || 'none';
  return a?.kind ?? 'none';
}
