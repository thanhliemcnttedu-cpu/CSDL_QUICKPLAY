import type { Quiz, Session } from './types';
import { htmlToText } from './util';
import { TYPE_LABELS } from './factory';

export interface QuestionStat {
  index: number;
  question_id: string;
  text: string;
  type: string;
  answered: number;
  correct: number;
  pct: number;
  avg_time_s: number;
  pending: number; // số lượt trả lời miệng đang chờ chấm (không tính vào tỉ lệ đúng)
}

export function questionStats(quiz: Quiz, s: Session): QuestionStat[] {
  return quiz.questions.map((q, i) => {
    const all = s.answers.filter((a) => a.question_id === q.id);
    const pending = all.filter((a) => a.pending).length; // trả lời miệng chưa được giáo viên chấm
    const rows = all.filter((a) => !a.pending);
    const correct = rows.filter((a) => a.correct).length;
    return {
      index: i + 1,
      question_id: q.id,
      text: htmlToText(q.stem.text).replace(/\[blank_\d+\]/g, '____') || '[Hình ảnh/Media]',
      type: TYPE_LABELS[q.type],
      answered: rows.length,
      pending,
      correct,
      pct: rows.length ? Math.round((correct / rows.length) * 100) : 0,
      avg_time_s: rows.length ? Math.round(rows.reduce((t, a) => t + a.time_ms, 0) / rows.length / 100) / 10 : 0,
    };
  });
}

/** Tổng dùng để xếp hạng = điểm bài làm + điểm thưởng. */
export const totalOf = (p: { score: number; coins?: number }) => Math.round((p.score + (p.coins ?? 0)) * 100) / 100;

export function rankedPlayers(s: Session) {
  // Xếp hạng theo tổng điểm + điểm thưởng
  return s.players.filter((p) => !p.kicked && !p.superseded).sort((a, b) => totalOf(b) - totalOf(a) || b.correct - a.correct);
}

/** Một ô CSV an toàn: escape dấu phẩy/ngoặc kép/xuống dòng và chống CSV injection (=, +, -, @). */
function cell(v: unknown): string {
  let t = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t)) t = "'" + t;
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function toCsv(rows: unknown[][]): string {
  // BOM UTF-8 để Excel hiển thị đúng tiếng Việt
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function sessionCsv(quiz: Quiz, s: Session): string {
  const qs = quiz.questions;
  const anti = !!s.settings.anti_cheat?.enabled;
  const header = ['Hạng', 'Tên học sinh', 'Lớp', 'Điểm', 'Điểm thưởng', 'Tổng', 'Số câu đúng', 'Số câu đã làm', 'Tỉ lệ đúng (%)', ...(anti ? ['Số lần vi phạm', 'Bị khóa'] : []), ...qs.map((_, i) => `Câu ${i + 1}`)];
  const body = rankedPlayers(s).map((p, i) => {
    const per = qs.map((q) => {
      const a = s.answers.find((x) => x.player_id === p.player_id && x.question_id === q.id);
      return a ? (a.correct ? 'Đúng' : a.ratio > 0 ? `${Math.round(a.ratio * 100)}%` : 'Sai') : '—';
    });
    return [
      i + 1, p.name, p.class_name ?? s.paper?.class_name ?? '', p.score, p.coins ?? 0, totalOf(p), p.correct, p.answered, qs.length ? Math.round((p.correct / qs.length) * 100) : 0,
      ...(anti ? [p.violations ?? 0, p.locked ? 'Có' : 'Không'] : []),
      ...per,
    ];
  });
  const stats = questionStats(quiz, s);
  return toCsv([
    [`Báo cáo: ${quiz.title}`],
    [`Mã phòng: ${s.pin}`, `Ngày: ${new Date(s.created_at).toLocaleString('vi-VN')}`],
    [],
    header,
    ...body,
    [],
    ['PHÂN TÍCH TỪNG CÂU'],
    ['Câu', 'Nội dung', 'Dạng', 'Số lượt trả lời', 'Số lượt đúng', 'Tỉ lệ đúng (%)', 'Thời gian TB (giây)'],
    ...stats.map((x) => [x.index, x.text, x.type, x.answered, x.correct, x.pct, x.avg_time_s]),
  ]);
}

export function download(name: string, content: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
