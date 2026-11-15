// Chế độ giấy: phiên do giáo viên điều khiển, đáp án đến từ máy quét thẻ. Apps Script cài đặt cùng quy tắc.
import type { AnswerRecord, PaperView, Question, Quiz, Session } from './types';
import { uid } from './util';
import { CARD_COUNT } from './paperCard';

export interface PaperHit { card: number; choice: number }
export type PaperOp = 'state' | 'hello' | 'scan' | 'next' | 'remind' | 'reveal' | 'end';

/** Câu dùng được với thẻ giấy: một đáp án đúng, 2–4 phương án. */
export const isPaperQuestion = (q: Question) =>
  (q.type === 'single_choice' || q.type === 'true_false') && q.options.length >= 2 && q.options.length <= 4 && q.options.some((o) => o.is_correct);
export const paperQuiz = (quiz: Quiz): Quiz => ({ ...quiz, questions: quiz.questions.filter(isPaperQuestion) });

/** Mỗi dòng một tên; bỏ số thứ tự đầu dòng nếu giáo viên dán kèm ("1. An", "2) Bình"). */
export function parseStudents(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d+\s*[.)\-:]\s*/, '').trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, CARD_COUNT);
}

export const cardOf = (playerId: string) => Number(playerId.slice(1));
const choiceOf = (a: AnswerRecord) => (a.answer as { choice: number }).choice;

export function createPaperSession(pin: string, quiz: Quiz, className: string, students: string[], scanKey: string): Session {
  const now = Date.now();
  return {
    session_id: uid('s_'),
    pin,
    quiz_id: quiz.id,
    quiz_title: quiz.title,
    settings: { mode: 'paper', music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, leaderboard_top: 0, power_ups: false },
    state: 'IN_PROGRESS',
    created_at: now,
    started_at: now,
    question_opened_at: now,
    current_index: 0,
    question_locked: false,
    paused_total_ms: 0,
    players: students.slice(0, CARD_COUNT).map((name, i) => ({
      player_id: 'c' + (i + 1), name, avatar: '', score: 0, correct: 0, answered: 0, current_index: 0, finished: false, last_seen: now,
    })),
    answers: [],
    question_count: quiz.questions.length,
    paper: { class_name: className, scan_key: scanKey },
  };
}

export function paperView(s: Session): PaperView {
  const answers: Record<number, number> = {};
  for (const a of s.answers) if (a.q_index === s.current_index) answers[cardOf(a.player_id)] = choiceOf(a);
  return { state: s.state, current_index: s.current_index, question_count: s.question_count, total: s.players.length, remind: !!s.paper?.remind, reveal: !!s.paper?.reveal, answers };
}

/** Xử lý một yêu cầu từ máy quét thẻ (hoặc màn chiếu). `questions` là đề của phiên (đã lọc cho chế độ giấy). */
export function paperAction(s: Session, questions: Question[], key: string, op: PaperOp, qIndex?: number, hits: PaperHit[] = []): PaperView {
  if (s.settings.mode !== 'paper' || !s.paper) throw new Error('Phòng này không ở chế độ giấy.');
  if (!key || key !== s.paper.scan_key) throw new Error('Mã quét không hợp lệ. Hãy quét lại mã QR trên màn chiếu.');
  const now = Date.now();
  if (op === 'scan') {
    if (s.state !== 'IN_PROGRESS' || qIndex !== s.current_index) return paperView(s);
    const q = questions[s.current_index];
    for (const h of hits) {
      const p = s.players[h.card - 1];
      if (!q || !p || !Number.isInteger(h.choice) || h.choice < 0 || h.choice >= q.options.length) continue;
      const old = s.answers.find((a) => a.player_id === p.player_id && a.q_index === s.current_index);
      if (old && choiceOf(old) === h.choice) continue;
      if (old) {
        // Em xoay lại thẻ: lấy đáp án mới nhất
        p.score -= old.score;
        if (old.correct) p.correct -= 1;
        p.answered -= 1;
        s.answers.splice(s.answers.indexOf(old), 1);
      }
      const opt = q.options[h.choice];
      const correct = !!opt.is_correct;
      const rec: AnswerRecord = {
        player_id: p.player_id, question_id: q.id, q_index: s.current_index,
        answer: { kind: 'choice', option_ids: [opt.option_id], choice: h.choice },
        correct, ratio: correct ? 1 : 0, score: correct ? q.points : 0,
        time_ms: Math.max(0, now - (s.question_opened_at ?? now)), at: now,
      };
      s.answers.push(rec);
      p.score += rec.score;
      if (correct) p.correct += 1;
      p.answered += 1;
      p.last_seen = now;
    }
  } else if (op === 'hello') {
    s.paper.connected = true;
  } else if (op === 'reveal') {
    s.paper.reveal = !s.paper.reveal;
    s.paper.remind = false;
  } else if (op === 'remind') {
    s.paper.remind = !s.paper.remind;
  } else if (op === 'next' && s.state === 'IN_PROGRESS') {
    s.paper.remind = false;
    s.paper.reveal = false;
    if (s.current_index >= s.question_count - 1) {
      s.state = 'COMPLETED';
      s.ended_at = now;
    } else {
      s.current_index += 1;
      s.question_opened_at = now;
    }
  } else if (op === 'end' && s.state !== 'COMPLETED') {
    s.state = 'COMPLETED';
    s.ended_at = now;
  }
  return paperView(s);
}
