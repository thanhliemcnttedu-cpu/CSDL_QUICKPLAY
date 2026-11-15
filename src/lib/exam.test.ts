import { describe, expect, it } from 'vitest';
import * as logic from './sessionLogic';
import type { AnswerRecord, ClassRoom, SessionSettings } from './types';

const cls: ClassRoom = { id: 'c1', name: '5A', students: ['Nguyễn An', 'Trần Bình', 'Lê Chi'], codes: ['HS1', 'hs 2', 'HS3'], updated_at: '' };
const settings: SessionSettings = {
  mode: 'exam', music: true, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, power_ups: true, retry_rounds: 3, exam_minutes: 30,
  anti_cheat: { enabled: true, block_right_click: true, block_copy: true, detect_leave: true, require_fullscreen: false, max_violations: 3 },
};
const rec = (pid: string, i: number, correct: boolean): AnswerRecord => ({
  player_id: pid, question_id: 'q' + i, q_index: i, answer: { kind: 'choice', option_ids: ['a'] }, correct, ratio: correct ? 1 : 0, score: correct ? 1000 : 0, time_ms: 0, at: 0,
});
const open = () => {
  const s = logic.createSession('123456', 'q', 'Kiểm tra giữa kỳ', 3, settings, logic.examRoster(cls));
  return s;
};

describe('bài kiểm tra: danh sách lớp và mã số học sinh', () => {
  it('chuẩn hóa mã: bỏ khoảng trắng, không phân biệt hoa thường', () => {
    expect(logic.normCode(' hs 12 ')).toBe('HS12');
    expect(logic.examRoster(cls).roster.map((r) => r.code)).toEqual(['HS1', 'HS2', 'HS3']);
  });
  it('lớp thiếu mã hoặc trùng mã thì không giao được bài kiểm tra', () => {
    expect(() => logic.examRoster({ ...cls, codes: ['HS1', '', 'HS3'] })).toThrow(/còn 1 học sinh chưa có mã/);
    expect(() => logic.examRoster({ ...cls, codes: ['HS1', 'hs1', 'HS3'] })).toThrow(/bị trùng/);
    expect(() => logic.examRoster({ ...cls, codes: undefined })).toThrow(/chưa có mã/);
    expect(() => logic.examRoster(null)).toThrow(/chọn lớp/);
  });
  it('bài kiểm tra tắt làm lại, bảng xếp hạng, thưởng và nhạc', () => {
    const s = open();
    expect(s.settings).toMatchObject({ retry_rounds: 0, show_leaderboard: false, power_ups: false, music: false, exam_minutes: 30 });
    expect(s.state).toBe('LOBBY_WAITING');
  });
});

describe('bài kiểm tra: vào phòng bằng mã số học sinh', () => {
  it('thiếu mã hoặc mã không có trong lớp thì không vào được', () => {
    const s = open();
    expect(() => logic.joinPlayer(s, 'An', 'cat', undefined, '5A')).toThrow(logic.NEED_CODE);
    expect(() => logic.joinPlayer(s, 'An', 'cat', undefined, '5A', false, 'HS9')).toThrow(/không có trong danh sách lớp 5A/);
  });
  it('tên và lớp lấy theo danh sách; nhập lại cùng mã thì làm tiếp bài cũ', () => {
    const s = open();
    const p = logic.joinPlayer(s, 'tên gõ bừa', 'cat', undefined, '9Z', false, ' hs2 ');
    expect(p).toMatchObject({ name: 'Trần Bình', class_name: '5A', student_code: 'HS2' });
    const again = logic.joinPlayer(s, 'Bình', 'dog', undefined, '5A', false, 'HS2');
    expect(again.player_id).toBe(p.player_id);
    expect(s.players).toHaveLength(1);
  });
  it('đã nộp bài thì mã đó không vào làm lại được và không trả lời thêm được', () => {
    const s = open();
    const p = logic.joinPlayer(s, 'An', 'cat', undefined, '5A', false, 'HS1');
    logic.applyHostOp(s, 'start');
    logic.submitAnswer(s, rec(p.player_id, 0, true));
    // trả lời hết cũng CHƯA tính là nộp: em phải tự bấm Nộp bài kiểm tra
    logic.submitAnswer(s, rec(p.player_id, 1, false));
    logic.submitAnswer(s, rec(p.player_id, 2, true));
    expect(p.finished).toBe(false);
    p.finished = true; // bấm Nộp bài kiểm tra (finishPlayer)
    expect(() => logic.joinPlayer(s, 'An', 'cat', undefined, '5A', false, 'HS1')).toThrow(/đã nộp bài kiểm tra này rồi/);
    const q = logic.joinPlayer(s, 'Chi', 'cat', undefined, '5A', false, 'HS3');
    q.finished = true;
    expect(() => logic.submitAnswer(s, rec(q.player_id, 0, true))).toThrow(/đã nộp bài kiểm tra/);
  });
});

describe('bài kiểm tra: giờ làm bài và thông tin gửi cho học sinh', () => {
  it('giờ thu bài = lúc bắt đầu + số phút; tạm dừng thì cộng bù', () => {
    const s = open();
    logic.applyHostOp(s, 'start');
    const due = Date.parse(s.settings.deadline!);
    expect(due - s.started_at!).toBe(30 * 60000);
    logic.applyHostOp(s, 'pause');
    s.paused_at = Date.now() - 60000; // đã tạm dừng 1 phút
    logic.applyHostOp(s, 'resume');
    expect(Date.parse(s.settings.deadline!) - due).toBeGreaterThanOrEqual(60000);
  });
  it('hết giờ thì phòng tự kết thúc và không nhận thêm câu trả lời', () => {
    const s = open();
    const p = logic.joinPlayer(s, 'An', 'cat', undefined, '5A', false, 'HS1');
    logic.applyHostOp(s, 'start');
    s.settings.deadline = new Date(Date.now() - 1000).toISOString();
    expect(() => logic.submitAnswer(s, rec(p.player_id, 0, true))).toThrow(/hết giờ/);
    expect(logic.pollView(s, p.player_id).state).toBe('COMPLETED');
  });
  it('học sinh chỉ thấy thông tin của chính mình và giờ thu bài', () => {
    const s = open();
    const a = logic.joinPlayer(s, 'An', 'cat', undefined, '5A', false, 'HS1');
    logic.joinPlayer(s, 'Bình', 'dog', undefined, '5A', false, 'HS2');
    logic.applyHostOp(s, 'start');
    const v = logic.pollView(s, a.player_id);
    expect(v.players.map((p) => p.name)).toEqual(['Nguyễn An']);
    expect(v.deadline).toBe(Date.parse(s.settings.deadline!));
    expect(logic.pollView(s).players).toHaveLength(0); // chưa vào phòng: không thấy ai
    expect(logic.pollView(s).mode).toBe('exam');
  });
  it('vi phạm quá 3 lần thì bài bị khóa', () => {
    const s = open();
    const p = logic.joinPlayer(s, 'An', 'cat', undefined, '5A', false, 'HS1');
    logic.applyHostOp(s, 'start');
    const kinds = ['right_click', 'tab_hidden', 'copy_paste', 'window_blur'] as const;
    const locks = kinds.map((k) => logic.reportViolation(s, p.player_id, k).locked);
    expect(locks).toEqual([false, false, false, true]);
  });
});
