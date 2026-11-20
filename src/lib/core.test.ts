import { describe, expect, it } from 'vitest';
import { computeBonus, computeScore, gradeRatio, validateQuestion } from './grading';
import { newQuestion, sampleQuiz } from './factory';
import { parseFreeText, parseTable, splitInlineOptions } from './importer';
import { aiItemsToQuestions, extractJsonArray } from './ai';
import { parseVideoUrl } from './media';
import * as logic from './sessionLogic';
import { emptyDraft, fromQuestion, switchType, toQuestion } from './draft';
import { decodeAvatar, encodeAvatar, randomAvatar } from './avatar';

describe('chấm điểm', () => {
  it('một đáp án đúng', () => {
    const q = newQuestion('single_choice');
    const right = q.options.find((o) => o.is_correct)!.option_id;
    expect(gradeRatio(q, { kind: 'choice', option_ids: [right] })).toBe(1);
    expect(gradeRatio(q, { kind: 'choice', option_ids: [q.options[1].option_id] })).toBe(0);
  });

  it('nhiều đáp án: toàn phần và từng phần', () => {
    const q = newQuestion('multiple_select');
    const [a, b, c] = q.options.map((o) => o.option_id);
    q.scoring = 'all_or_nothing';
    expect(gradeRatio(q, { kind: 'choice', option_ids: [a, b] })).toBe(1);
    expect(gradeRatio(q, { kind: 'choice', option_ids: [a] })).toBe(0);
    q.scoring = 'partial';
    expect(gradeRatio(q, { kind: 'choice', option_ids: [a] })).toBe(0.5);
    expect(gradeRatio(q, { kind: 'choice', option_ids: [a, c] })).toBe(0);
  });

  it('điền khuyết bỏ hoa/thường và khoảng trắng thừa', () => {
    const q = newQuestion('fill_blank');
    expect(gradeRatio(q, { kind: 'fill', values: { blank_1: '  hà   nội ' } })).toBe(1);
    q.blanks![0].match_rule = 'exact';
    expect(gradeRatio(q, { kind: 'fill', values: { blank_1: 'hà nội' } })).toBe(0);
  });

  it('kéo thả, sắp xếp, nối cột', () => {
    const d = newQuestion('drag_drop');
    const [c100, c0] = d.options;
    expect(gradeRatio(d, { kind: 'drag', placement: { blank_1: c100.option_id, blank_2: c0.option_id } })).toBe(1);
    expect(gradeRatio(d, { kind: 'drag', placement: { blank_1: c100.option_id } })).toBe(0.5);

    const r = newQuestion('reorder');
    const ids = r.options.map((o) => o.option_id);
    expect(gradeRatio(r, { kind: 'order', option_ids: ids })).toBe(1);
    expect(gradeRatio(r, { kind: 'order', option_ids: [...ids].reverse() })).toBe(0);

    const m = newQuestion('matching');
    const L = m.options.filter((o) => o.side === 'left');
    const R = m.options.filter((o) => o.side === 'right');
    const pairs = Object.fromEntries(L.map((l, i) => [l.option_id, R[i].option_id]));
    expect(gradeRatio(m, { kind: 'match', pairs })).toBe(1);
    pairs[L[0].option_id] = R[1].option_id;
    expect(gradeRatio(m, { kind: 'match', pairs })).toBeCloseTo(2 / 3);
  });

  it('điểm thưởng tốc độ trong khoảng 50%–100%', () => {
    const q = newQuestion('single_choice');
    // Điểm = điểm giáo viên đặt × tỉ lệ đúng, không phụ thuộc tốc độ
    expect(computeScore(q, 1)).toBe(q.points);
    expect(computeScore(q, 0.5)).toBe(q.points / 2);
    expect(computeScore(q, 0)).toBe(0);
    // Điểm thưởng: nhanh (nửa đầu thời gian) +20%, mỗi 3 câu đúng liên tiếp +50%; sai / làm lại / không tính giờ thì không thưởng tốc độ
    const half = q.time_limit_seconds * 500;
    expect(computeBonus(q, 1, half - 1, 1, { timed: true, streaks: true })).toEqual({ speed: q.points * 0.2, streak: 0, total: q.points * 0.2 });
    expect(computeBonus(q, 1, half + 1, 3, { timed: true, streaks: true })).toEqual({ speed: 0, streak: q.points * 0.5, total: q.points * 0.5 });
    expect(computeBonus(q, 1, 0, 6, { timed: true, streaks: true }).total).toBe(q.points * 0.7);
    expect(computeBonus(q, 1, 0, 3, { timed: false, streaks: false }).total).toBe(0);
    expect(computeBonus(q, 0.5, 0, 3, { timed: true, streaks: true }).total).toBe(0);
    expect(computeBonus(q, 1, 0, 3, { timed: true, streaks: true, retry: true }).total).toBe(0);
  });

  it('bộ đề mẫu hợp lệ', () => {
    for (const q of sampleQuiz().questions) expect(validateQuestion(q)).toEqual([]);
  });
});

describe('nhập đề – tự sửa lỗi định dạng', () => {
  it('tách phương án nằm cùng một dòng, kể cả thiếu dấu chấm', () => {
    expect(splitInlineOptions('A. Hà Nội  B. Huế  C. Đà Nẵng  D. Cần Thơ')).toHaveLength(4);
    expect(splitInlineOptions('A Hà Nội B Huế C Đà Nẵng D Cần Thơ')).toEqual(['A. Hà Nội', 'B. Huế', 'C. Đà Nẵng', 'D. Cần Thơ']);
  });

  it('đánh số, đáp án đậm, dấu *, dòng "Đáp án:"', () => {
    const r = parseFreeText(
      `Câu 1: Thủ đô của Việt Nam là
thành phố nào?
A. Huế  B. **Hà Nội**  C. Đà Nẵng  D. Cần Thơ
Câu 2. 2 + 2 = ?
*A) 4
B) 5
Câu 3: Chọn số chẵn
A. 2
B. 3
C. 4
Đáp án: A, C`,
    );
    expect(r.questions).toHaveLength(3);
    expect(r.questions[0].stem.text).toBe('Thủ đô của Việt Nam là thành phố nào?');
    expect(r.questions[0].options.find((o) => o.is_correct)?.text).toBe('Hà Nội');
    expect(r.questions[1].options[0].is_correct).toBe(true);
    expect(r.questions[2].type).toBe('multiple_select');
  });

  it('không đánh số + bảng đáp án cuối tệp + cảnh báo thiếu đáp án', () => {
    const r = parseFreeText(
      `Con gì kêu meo meo?
A. Chó
B. Mèo
Con gì có vòi?
A. Voi
B. Gà
Con gì biết bay?
A. Chim
B. Cá
ĐÁP ÁN
1B 2A`,
    );
    expect(r.questions).toHaveLength(3);
    expect(r.questions[0].options[1].is_correct).toBe(true);
    expect(r.questions[1].options[0].is_correct).toBe(true);
    expect(r.questions[2].needs_review).toBe(true);
    expect(r.warnings.some((w) => w.includes('Câu 3'))).toBe(true);
  });

  it('nhận Đúng/Sai và điền khuyết', () => {
    const r = parseFreeText(`1. Trái Đất quay quanh Mặt Trời.\nA. Đúng\nB. Sai\nĐáp án: A\n2. Nước sôi ở ____ độ C.`);
    expect(r.questions[0].type).toBe('true_false');
    expect(r.questions[1].type).toBe('fill_blank');
    expect(r.questions[1].stem.text).toContain('[blank_1]');
  });

  it('bảng tính CSV', () => {
    const t = parseTable('Câu hỏi,A,B,C,D,Đáp án\n"1+1=?",1,2,3,4,B\nChọn số lẻ,1,2,3,4,"A,C"');
    expect(t).toHaveLength(2);
    expect(t![0].options[1].is_correct).toBe(true);
    expect(t![1].type).toBe('multiple_select');
  });
});

describe('AI', () => {
  it('đọc JSON bọc markdown và chuyển đủ 7 dạng', () => {
    const items = extractJsonArray(`\`\`\`json
[{"type":"single_choice","question":"Q1","options":[{"text":"a","correct":true},{"text":"b"}]},
 {"type":"fill_blank","question":"X là [blank_1]","blanks":[{"id":"blank_1","accepted":["y"]}]},
 {"type":"drag_drop","question":"[blank_1] và [blank_2]","cards":[{"text":"a","zone":"blank_1"},{"text":"b","zone":"blank_2"},{"text":"c","zone":null}]},
 {"type":"reorder","question":"Sắp xếp","steps":["1","2","3"]},
 {"type":"matching","question":"Nối","pairs":[{"left":"a","right":"1"},{"left":"b","right":"2"}]},
 {"type":"true_false","question":"Đúng?","options":[{"text":"Đúng","correct":false},{"text":"Sai","correct":true}]},
 {"type":"multiple_select","question":"Chọn","options":[{"text":"a","correct":true},{"text":"b","correct":true},{"text":"c"}]},
 {"type":"oral","question":"Kể tên 3 loài chim","answer":"sẻ, chào mào, bồ câu"},
 {"type":"fill_blank","question":"Nước sôi ở [blank_1] độ C","blanks":[{"id":"blank_1","accepted":["100"]}],"distractors":["50","0"]}]
\`\`\``);
    const qs = aiItemsToQuestions(items, { subject: 'Khoa học' });
    // drag_drop cũ được đổi sang "Điền chỗ trống" có kho từ
    expect(qs.map((q) => q.type)).toEqual(['single_choice', 'fill_blank', 'fill_blank', 'reorder', 'matching', 'true_false', 'multiple_select', 'oral', 'fill_blank']);
    qs.forEach((q) => expect(validateQuestion(q)).toEqual([]));
    expect(qs[2].distractors).toEqual(['c']);
    expect(qs[7].explanation).toBe('sẻ, chào mào, bồ câu');
    expect(qs[8].distractors).toEqual(['50', '0']);
    expect(qs.every((q) => q.subject === 'Khoa học')).toBe(true);
  });
});

describe('hộp soạn câu hỏi (bản nháp ↔ JSON)', () => {
  it('giữ nguyên dữ liệu qua vòng chuyển đổi cho cả 7 dạng', () => {
    for (const q of sampleQuiz().questions) {
      const back = toQuestion(fromQuestion(q));
      expect(back.type === q.type || (q.type === 'drag_drop' && back.type === 'fill_blank')).toBe(true);
      expect(validateQuestion(back)).toEqual([]);
    }
  });

  it('chỗ trống [___] → [blank_n], từ được bôi đen thành đáp án, có từ gây nhiễu', () => {
    const d = emptyDraft('fill_blank');
    d.text = 'Thủ đô là [___], sông lớn là [___].';
    d.blanks = ['Hà Nội | Ha Noi', 'sông Hồng'];
    d.distractors = ['Huế', 'sông Hương'];
    const q = toQuestion(d);
    expect(q.stem.text).toBe('Thủ đô là [blank_1], sông lớn là [blank_2].');
    expect(q.blanks![0].accepted).toEqual(['Hà Nội', 'Ha Noi']);
    expect(validateQuestion(q)).toEqual([]);
    expect(gradeRatio(q, { kind: 'fill', values: { blank_1: 'Hà Nội', blank_2: 'sông Hương' } })).toBe(0.5);
    const again = fromQuestion(q);
    expect(again.text).toBe(d.text);
    expect(again.distractors).toEqual(d.distractors);
  });

  it('đổi dạng giữ nội dung; Một đáp án chỉ còn 1 đáp án đúng; ký tự < > được thoát', () => {
    let d = emptyDraft('multiple_select');
    d.text = 'Số nào < 5?';
    d = switchType(d, 'single_choice');
    expect(d.options.filter((o) => o.correct)).toHaveLength(1);
    expect(toQuestion(d).stem.text).toBe('Số nào &lt; 5?');
    const oral = toQuestion(switchType(d, 'oral'));
    expect(oral.options).toEqual([]);
    expect(validateQuestion(oral)).toEqual([]);
  });
});

describe('trả lời miệng & xu thưởng', () => {
  it('nộp ở trạng thái chờ, giáo viên chấm cộng điểm và xu, chấm lại không cộng trùng', () => {
    const s = logic.createSession('222222', 'q', 'T', 2, {
      mode: 'classic_live', music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, power_ups: false,
    });
    const p = logic.joinPlayer(s, 'Cúc', 'cat', undefined, '5A');
    logic.applyHostOp(s, 'start');
    logic.submitAnswer(s, { player_id: p.player_id, question_id: 'a', q_index: 0, answer: { kind: 'choice', option_ids: ['x'] }, correct: true, ratio: 1, score: 900, coins: 2, time_ms: 1, at: 0 });
    logic.submitAnswer(s, { player_id: p.player_id, question_id: 'b', q_index: 1, answer: { kind: 'oral' }, correct: false, ratio: 0, score: 0, pending: true, time_ms: 1, at: 0 });
    expect(s.players[0]).toMatchObject({ score: 900, coins: 2, correct: 1, answered: 2 });
    expect(logic.pollView(s, p.player_id).my_pending).toEqual([1]);
    logic.applyHostOp(s, 'grade', p.player_id, { q_index: 1, correct: true, points: 1000, coins: 3 });
    expect(s.players[0]).toMatchObject({ score: 1900, coins: 5, correct: 2 });
    expect(logic.pollView(s, p.player_id).my_graded).toEqual({ 1: true });
    logic.applyHostOp(s, 'grade', p.player_id, { q_index: 1, correct: false });
    expect(s.players[0]).toMatchObject({ score: 900, coins: 2, correct: 1 });
  });

  it('bộ tách đề: câu không phương án → Trả lời miệng; có ___ → Điền chỗ trống kèm đáp án chữ', () => {
    const r = parseFreeText('Câu 1: Em hãy kể tên các mùa trong năm.\nĐáp án: Xuân, Hạ, Thu, Đông\nCâu 2: Thủ đô của Việt Nam là ______.\nĐáp án: Hà Nội');
    expect(r.questions.map((q) => q.type)).toEqual(['oral', 'fill_blank']);
    expect(r.questions[0].explanation).toBe('Xuân, Hạ, Thu, Đông');
    expect(r.questions[1].blanks![0].accepted).toEqual(['Hà Nội']);
    expect(r.questions[1].needs_review).toBe(false);
  });
});

describe('chống gian lận', () => {
  it('ghi vi phạm, chống trùng, tự khóa, mở khóa đếm lại', () => {
    const s = logic.createSession('111111', 'q', 'T', 3, {
      mode: 'classic_live', music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, power_ups: false,
      anti_cheat: { enabled: true, block_right_click: true, block_copy: true, detect_leave: true, require_fullscreen: false, max_violations: 2 },
    });
    const p = logic.joinPlayer(s, 'Bình', 'dog', undefined, '5A');
    logic.applyHostOp(s, 'start');
    expect(logic.reportViolation(s, p.player_id, 'tab_hidden').violations).toBe(1);
    expect(logic.reportViolation(s, p.player_id, 'tab_hidden').violations).toBe(1); // trùng trong 3 giây
    expect(logic.reportViolation(s, p.player_id, 'open_link').violations).toBe(1); // không tính
    // ngưỡng 2: lần 2 vẫn chỉ cảnh báo, lần 3 (vượt ngưỡng) mới khóa
    expect(logic.reportViolation(s, p.player_id, 'right_click')).toEqual({ violations: 2, locked: false });
    const r = logic.reportViolation(s, p.player_id, 'exit_fullscreen');
    expect(r).toEqual({ violations: 3, locked: true });
    expect(logic.pollView(s, p.player_id).locked).toBe(true);
    expect(() =>
      logic.submitAnswer(s, { player_id: p.player_id, question_id: 'x', q_index: 0, answer: {}, correct: true, ratio: 1, score: 1, time_ms: 1, at: 0 }),
    ).toThrow(/khóa/);
    logic.applyHostOp(s, 'unlock', p.player_id);
    expect(s.players[0].locked).toBe(false);
    expect(logic.reportViolation(s, p.player_id, 'copy_paste').locked).toBe(false); // đếm lại từ mốc mở khóa
    expect(s.violations).toHaveLength(5);
  });
});

describe('nhân vật', () => {
  it('mã hóa / giải mã, giá trị cũ và giá trị sai đều an toàn', () => {
    const c = { gender: 'f' as const, skin: 2, hair: 1, hairColor: 4, shirt: 5, acc: 3, face: 1 };
    expect(decodeAvatar(encodeAvatar(c))).toEqual(c);
    expect(decodeAvatar('cat')).toBeNull(); // nhân vật cũ (con vật)
    expect(decodeAvatar('v2-m-99-7-x-1-2-0')).toEqual({ gender: 'm', skin: 0, hair: 0, hairColor: 0, shirt: 1, acc: 2, face: 0 });
    for (let i = 0; i < 50; i++) {
      const r = randomAvatar();
      expect(decodeAvatar(encodeAvatar(r))).toEqual(r);
      expect(encodeAvatar(r).length).toBeLessThan(40);
    }
  });
});

describe('video & phiên', () => {
  it('nhận diện link YouTube/Vimeo', () => {
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')?.embed_id).toBe('dQw4w9WgXcQ');
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')?.provider).toBe('youtube');
    expect(parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.embed_id).toBe('dQw4w9WgXcQ');
    expect(parseVideoUrl('https://vimeo.com/123456789')?.provider).toBe('vimeo');
    expect(parseVideoUrl('javascript:alert(1)')).toBeNull();
  });

  it('máy trạng thái nhịp độ giáo viên', () => {
    const s = logic.createSession('123456', 'q', 'T', 2, {
      mode: 'instructor_paced', music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, power_ups: false,
    });
    const p = logic.joinPlayer(s, 'An', 'cat', undefined, '5A');
    expect(() => logic.joinPlayer(s, 'an', 'dog', undefined, '5a')).toThrow(); // trùng tên trong cùng lớp
    expect(() => logic.joinPlayer(s, 'Chi', 'dog')).toThrow(); // thiếu lớp
    logic.applyHostOp(s, 'start');
    expect(s.state).toBe('IN_PROGRESS');
    logic.submitAnswer(s, { player_id: p.player_id, question_id: 'x', q_index: 0, answer: { kind: 'choice', option_ids: ['o1'] }, correct: true, ratio: 1, score: 900, time_ms: 1000, at: 0 });
    logic.submitAnswer(s, { player_id: p.player_id, question_id: 'x', q_index: 0, answer: {}, correct: true, ratio: 1, score: 900, time_ms: 1000, at: 0 });
    expect(s.players[0].score).toBe(900); // không cộng trùng
    expect(s.question_locked).toBe(false); // không tự khóa: học sinh còn được chọn lại đáp án tới khi hết giờ
    // chọn lại đáp án khi câu còn mở: thay câu trả lời cũ, điểm tính lại
    logic.submitAnswer(s, { player_id: p.player_id, question_id: 'x', q_index: 0, answer: { kind: 'choice', option_ids: ['o2'] }, correct: false, ratio: 0, score: 0, time_ms: 2000, at: 0, change: true });
    expect([s.players[0].score, s.players[0].correct, s.players[0].answered, s.answers.length]).toEqual([0, 0, 1, 1]);
    logic.submitAnswer(s, { player_id: p.player_id, question_id: 'x', q_index: 0, answer: { kind: 'choice', option_ids: ['o1'] }, correct: true, ratio: 1, score: 900, time_ms: 3000, at: 0, change: true });
    expect(s.players[0].score).toBe(900);
    logic.applyHostOp(s, 'lock');
    // đã khóa (hết giờ): không chọn lại được nữa
    logic.submitAnswer(s, { player_id: p.player_id, question_id: 'x', q_index: 0, answer: { kind: 'choice', option_ids: ['o2'] }, correct: false, ratio: 0, score: 0, time_ms: 4000, at: 0, change: true });
    expect(s.players[0].score).toBe(900);
    expect(logic.pollView(s).question_stats).toEqual({ o1: 1 });
    logic.applyHostOp(s, 'pause');
    expect(s.state).toBe('PAUSED');
    logic.applyHostOp(s, 'resume');
    logic.applyHostOp(s, 'next');
    expect(s.current_index).toBe(1);
    logic.applyHostOp(s, 'next');
    expect(s.state).toBe('COMPLETED');
  });
});

describe('thống kê chi tiết', () => {
  it('tính tỉ lệ đúng, tỉ lệ đạt, xếp loại và so sánh lớp', async () => {
    const { analyze } = await import('./analytics');
    const s = logic.createSession('222222', 'q', 'T', 4, {
      mode: 'classic_live', music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, power_ups: false,
    });
    const an = logic.joinPlayer(s, 'An', 'cat', undefined, '5A');
    const binh = logic.joinPlayer(s, 'Bình', 'dog', undefined, '5B');
    expect(logic.joinPlayer(s, 'An', 'dog', undefined, '5B').class_name).toBe('5B'); // trùng tên khác lớp thì được
    logic.applyHostOp(s, 'start');
    const ans = (pid: string, i: number, ok: boolean) =>
      logic.submitAnswer(s, { player_id: pid, question_id: 'q' + i, q_index: i, answer: {}, correct: ok, ratio: ok ? 1 : 0, score: ok ? 100 : 0, time_ms: 1, at: 0 });
    [true, true, true, true].forEach((ok, i) => ans(an.player_id, i, ok));
    [true, false, false, false].forEach((ok, i) => ans(binh.player_id, i, ok));
    let a = analyze(s, null);
    expect(a.live).toBe(true);
    expect([a.full_pct, a.partial_pct, a.wrong_pct]).toEqual([63, 0, 38]); // 5 đúng / 3 sai trên 8 lượt
    expect(a.levels).toEqual({ excellent: 1, good: 0, pass: 0, effort: 1 }); // bạn chưa làm câu nào chưa bị xếp mức khi đang diễn ra
    expect(a.pass_pct).toBe(50);
    logic.applyHostOp(s, 'end');
    a = analyze(s, null);
    expect(a.students.map((x) => [x.name, x.class_name, x.pct, x.mark10])).toEqual([['An', '5A', 100, 10], ['Bình', '5B', 25, 2.5], ['An', '5B', 0, 0]]);
    expect(a.levels.effort).toBe(2); // kết thúc: bỏ trống tính là chưa đạt
    expect(a.classes.map((c) => [c.class_name, c.students, c.pass_pct])).toEqual([['5A', 1, 100], ['5B', 2, 0]]);
    // Giáo viên và học sinh thấy cùng con số: báo cáo dùng đúng hàm tổng kết của học sinh
    const { summarize } = await import('./cheer');
    const binhAnswers = s.answers.filter((x) => x.player_id === binh.player_id);
    const mine = summarize(4, binhAnswers);
    const row = a.students.find((x) => x.player_id === binh.player_id)!;
    expect([row.pct, row.pct_full, row.pct_partial, row.level]).toEqual([mine.pct, mine.pct_full, mine.pct_partial, mine.level]);
  });
});

describe('lời khen và tổng kết của học sinh', () => {
  it('khen ở mốc chuỗi đúng, tặng quà khi giáo viên bật, động viên khi sai 3 câu liên tiếp', async () => {
    const { cheerFor, summarize, levelOf } = await import('./cheer');
    const base = { left: 5, answered: 3 };
    expect(cheerFor({ ...base, correct: true, streak: 3, wrongStreak: 0, gifts: true })).toMatchObject({ tone: 'gift', bonusCoins: 5 });
    expect(cheerFor({ ...base, correct: true, streak: 3, wrongStreak: 0, gifts: false })).toMatchObject({ tone: 'praise', bonusCoins: 0 });
    expect(cheerFor({ ...base, correct: true, streak: 1, wrongStreak: 0, gifts: true })).toBeNull();
    expect(cheerFor({ ...base, correct: false, streak: 0, wrongStreak: 3, gifts: true })?.text).toMatch(/đọc thật kỹ/);
    expect(cheerFor({ ...base, correct: false, streak: 0, wrongStreak: 5, gifts: true })?.text).toMatch(/Đừng bỏ cuộc/);
    expect(cheerFor({ ...base, correct: false, streak: 0, wrongStreak: 1, gifts: true })).toBeNull();
    expect(cheerFor({ correct: true, streak: 1, wrongStreak: 0, left: 2, answered: 8, gifts: false })?.text).toMatch(/Sắp về đích/);
    expect(cheerFor({ correct: false, streak: 0, wrongStreak: 1, left: 0, answered: 10, gifts: false })?.text).toMatch(/hoàn thành/);
    expect([95, 75, 50, 49].map(levelOf)).toEqual(['excellent', 'good', 'pass', 'effort']);
    expect(summarize(5, [{ ratio: 1 }, { ratio: 1 }, { ratio: 0.5 }, { ratio: 0 }])).toEqual({ total: 5, correct: 2, partial: 1, wrong: 1, blank: 1, pct_full: 40, pct_partial: 20, pct: 50, level: 'pass' });
    expect(summarize(2, [{ ratio: 0, pending: true }, { ratio: 1 }])).toMatchObject({ correct: 1, wrong: 0, pct: 50 });
  });
});

describe('điền chỗ trống: gõ không dấu, nhiều cách viết, menu thả xuống', () => {
  it('chấm đúng đáp án chính xác, bản không dấu (khi giáo viên bật) và các cách viết khác', () => {
    const d = emptyDraft('fill_blank');
    d.text = 'Thủ đô của Việt Nam là [___].';
    d.blanks = ['Hà Nội | Thủ đô Hà Nội | HN'];
    d.noAccent = [true];
    const q = toQuestion(d);
    expect(q.blanks![0]).toMatchObject({ accepted: ['Hà Nội', 'Thủ đô Hà Nội', 'HN'], ignore_accents: true });
    expect(q.fill_mode).toBeUndefined();
    const g = (v: string) => gradeRatio(q, { kind: 'fill', values: { blank_1: v } });
    expect([g('Hà Nội'), g('  hà   nội '), g('Ha Noi'), g('ha noi'), g('thủ đô hà nội'), g('hn'), g('Huế'), g('')]).toEqual([1, 1, 1, 1, 1, 1, 0, 0]);
    // Không bật "gõ không dấu" thì bản không dấu bị tính sai
    d.noAccent = [false];
    const strict = toQuestion(d);
    expect(strict.blanks![0].ignore_accents).toBeUndefined();
    expect(gradeRatio(strict, { kind: 'fill', values: { blank_1: 'Ha Noi' } })).toBe(0);
    expect(gradeRatio(strict, { kind: 'fill', values: { blank_1: 'hà nội' } })).toBe(1);
    // chữ đ
    d.blanks = ['Đà Nẵng'];
    d.noAccent = [true];
    expect(gradeRatio(toQuestion(d), { kind: 'fill', values: { blank_1: 'da nang' } })).toBe(1);
  });

  it('biến thể menu thả xuống: lưu chế độ, giữ từ nhiễu, mở lại để sửa vẫn đúng', () => {
    const d = emptyDraft('fill_blank');
    d.text = 'I [___] a student.';
    d.blanks = ['am'];
    d.distractors = ['is', 'are'];
    d.fillMode = 'menu';
    const q = toQuestion(d);
    expect(q.fill_mode).toBe('menu');
    expect(q.distractors).toEqual(['is', 'are']);
    expect(gradeRatio(q, { kind: 'fill', values: { blank_1: 'am' } })).toBe(1);
    expect(gradeRatio(q, { kind: 'fill', values: { blank_1: 'is' } })).toBe(0);
    const back = fromQuestion(q);
    expect([back.fillMode, back.distractors, back.blanks]).toEqual(['menu', ['is', 'are'], ['am']]);
    // Đề cũ không có fill_mode: có từ nhiễu → kho từ, không có → gõ chữ
    expect(fromQuestion({ ...q, fill_mode: undefined }).fillMode).toBe('bank');
    expect(fromQuestion({ ...q, fill_mode: undefined, distractors: undefined }).fillMode).toBe('type');
    // Chuyển sang gõ chữ thì bỏ từ nhiễu
    back.fillMode = 'type';
    back.distractors = [];
    const typed = toQuestion(back);
    expect([typed.distractors, typed.fill_mode]).toEqual([undefined, undefined]);
  });
});

describe('lượt làm lại câu sai của cả bài', () => {
  it('thay câu trả lời sai trong số lượt cho phép; hết lượt hoặc câu đã đúng thì không thay', () => {
    const s = logic.createSession('333333', 'q', 'T', 2, {
      mode: 'classic_live', music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, power_ups: false, retry_rounds: 2,
    });
    const p = logic.joinPlayer(s, 'An', 'cat', undefined, '5A');
    logic.applyHostOp(s, 'start');
    const ans = (i: number, ok: boolean, attempt?: number) =>
      logic.submitAnswer(s, { player_id: p.player_id, question_id: 'q' + i, q_index: i, answer: {}, correct: ok, ratio: ok ? 1 : 0, score: ok ? 100 : 0, time_ms: 1, at: 0, attempt });
    ans(0, true);
    ans(1, false);
    expect(s.players[0].finished).toBe(false); // còn lượt làm lại nên chưa tính là xong
    ans(1, false); // nộp trùng không có lượt → bỏ qua
    expect(s.answers).toHaveLength(2);
    ans(1, false, 1); // lượt 1 vẫn sai
    expect([s.answers.length, s.players[0].answered, s.players[0].score]).toEqual([2, 2, 100]);
    ans(1, false, 1); // cùng lượt không được nộp lại
    ans(0, false, 2); // câu đã đúng không được làm lại
    expect(s.players[0].score).toBe(100);
    ans(1, true, 2); // lượt 2 đúng
    expect([s.players[0].score, s.players[0].correct, s.answers.find((a) => a.q_index === 1)!.attempt]).toEqual([200, 2, 2]);
    ans(1, false, 3); // vượt số lượt giáo viên cho phép
    expect(s.players[0].score).toBe(200);
  });
});

describe('thời gian làm bài và trạng thái chưa trả lời', () => {
  it('câu hết giờ không chọn gì là "chưa trả lời", không tính là sai; thời gian làm bài tính từ lúc bắt đầu', async () => {
    const { summarize } = await import('./cheer');
    const { durationOf, analyze } = await import('./analytics');
    const { formatDuration } = await import('./util');
    expect(summarize(3, [{ ratio: 1 }, { ratio: 0, answer: { kind: 'none' } }, { ratio: 0, answer: { kind: 'choice' } }])).toMatchObject({ correct: 1, wrong: 1, blank: 1, pct: 33 });
    const base = { mode: 'classic_live' as const, music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, power_ups: false };
    expect(durationOf({ settings: base, started_at: 1000 }, { joined_at: 500, finished_at: 126000 })).toBe(125000);
    expect(durationOf({ settings: base, started_at: 1000 }, { joined_at: 31000, finished_at: 126000 })).toBe(95000); // vào muộn: tính từ lúc vào
    expect(durationOf({ settings: base, started_at: 1000 }, { joined_at: 500 })).toBeNull(); // chưa nộp
    expect(durationOf({ settings: { ...base, mode: 'instructor_paced' }, started_at: 1000 }, { joined_at: 500, finished_at: 9000 })).toBeNull();
    expect([formatDuration(125000), formatDuration(42000)]).toEqual(['2 phút 05 giây', '42 giây']);
    // cùng tỉ lệ đúng thì bạn làm nhanh hơn xếp trên
    const s = logic.createSession('444444', 'q', 'T', 1, base);
    const a = logic.joinPlayer(s, 'Chậm', 'cat', undefined, '5A');
    const b = logic.joinPlayer(s, 'Nhanh', 'dog', undefined, '5A');
    logic.applyHostOp(s, 'start');
    for (const p of [a, b]) logic.submitAnswer(s, { player_id: p.player_id, question_id: 'q0', q_index: 0, answer: {}, correct: true, ratio: 1, score: 100, time_ms: 1, at: 0 });
    s.players[0].finished_at = s.started_at! + 90000;
    s.players[1].finished_at = s.started_at! + 30000;
    logic.applyHostOp(s, 'end');
    expect(analyze(s, null).students.map((x) => x.name)).toEqual(['Nhanh', 'Chậm']);
  });
});

describe('làm lại bài nhiều lần', () => {
  it('cùng tên + lớp (tự do, về nhà): vào bao nhiêu lần cũng được, mỗi lần là lượt mới, báo cáo gom lần mới nhất lên trên', async () => {
    const { analyze } = await import('./analytics');
    const s = logic.createSession('555555', 'q', 'T', 1, {
      mode: 'homework', music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, power_ups: false,
    });
    const ans = (pid: string, ok: boolean) =>
      logic.submitAnswer(s, { player_id: pid, question_id: 'q0', q_index: 0, answer: {}, correct: ok, ratio: ok ? 1 : 0, score: ok ? 100 : 0, time_ms: 1, at: 0 });
    const a1 = logic.joinPlayer(s, 'An', 'cat', undefined, '5A');
    ans(a1.player_id, false); // trả lời hết → xong
    // vào lại cùng tên: không hỏi lại, thành lượt 2; lượt 1 vẫn giữ nguyên (không bị ghi đè)
    const a2 = logic.joinPlayer(s, 'An', 'cat', undefined, '5A');
    expect([a2.attempt_no, s.players[0].superseded, s.players[0].answered]).toEqual([2, true, 1]);
    expect(a2.joined_at! >= a1.joined_at!).toBe(true); // mỗi lượt có giờ vào riêng
    // lần 2 còn đang làm dở (chưa nộp) mà em vào lại (đổi máy, mở tab mới) → vẫn vào được, thành lượt 3
    const a3 = logic.joinPlayer(s, 'An', 'cat', undefined, '5A');
    ans(a3.player_id, true);
    expect(logic.joinPlayer(s, 'An 2', 'cat', undefined, '5A').attempt_no).toBeUndefined(); // đổi tên thì là học sinh khác
    s.players.pop();
    const b = logic.joinPlayer(s, 'Bình', 'dog', undefined, '5A');
    ans(b.player_id, false);
    expect(logic.pollView(s).players.map((p) => p.name).sort()).toEqual(['An', 'Bình']); // bảng xếp hạng chỉ hiện lần mới nhất
    logic.applyHostOp(s, 'end');
    const r = analyze(s, null);
    expect(r.students.map((x) => [x.name, x.attempt_no, x.latest])).toEqual([['An', 3, true], ['An', 2, false], ['An', 1, false], ['Bình', 1, true]]);
    expect([r.total_students, r.attempts, r.levels.excellent, r.levels.effort]).toEqual([2, 4, 1, 1]); // số liệu tổng chỉ tính lần mới nhất
    // giáo viên điều khiển: không có làm lại
    const p = logic.createSession('666666', 'q', 'T', 1, { mode: 'instructor_paced', music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, power_ups: false });
    const x = logic.joinPlayer(p, 'An', 'cat', undefined, '5A');
    x.finished = true;
    expect(() => logic.joinPlayer(p, 'An', 'cat', undefined, '5A')).toThrow('[TEN_DA_DUNG]'); // trùng tên: máy chủ hỏi lại
    const y = logic.joinPlayer(p, 'An', 'cat', undefined, '5A', true); // em bấm "Có, thi lại": ghi đè lượt cũ
    expect([y.superseded, x.superseded]).toEqual([undefined, true]);
  });
});

describe('điểm, điểm thưởng và xếp hạng', () => {
  it('xếp hạng theo điểm + điểm thưởng; câu đang mở ở chế độ giáo viên điều khiển chưa lộ kết quả', async () => {
    const { rankedPlayers, totalOf } = await import('./report');
    const base = { music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, power_ups: true };
    const s = logic.createSession('777777', 'q', 'T', 2, { ...base, mode: 'instructor_paced' });
    const a = logic.joinPlayer(s, 'An', 'cat', undefined, '5A');
    const b = logic.joinPlayer(s, 'Bình', 'dog', undefined, '5A');
    logic.applyHostOp(s, 'start');
    const ans = (pid: string, ok: boolean, bonus: number) =>
      logic.submitAnswer(s, { player_id: pid, question_id: 'q0', q_index: 0, answer: { kind: 'choice', option_ids: [] }, correct: ok, ratio: ok ? 1 : 0, score: ok ? 10 : 0, coins: bonus, time_ms: 1, at: 0 });
    ans(a.player_id, true, 0);
    ans(b.player_id, true, 2); // Bình trả lời nhanh nên có điểm thưởng
    // câu còn mở: học sinh và bảng giáo viên chưa thấy điểm của câu này
    expect(logic.pollView(s).players.map((p) => [p.score, p.coins, p.correct])).toEqual([[0, 0, 0], [0, 0, 0]]);
    expect(logic.visiblePlayers(s).every((p) => p.score === 0)).toBe(true);
    logic.applyHostOp(s, 'lock');
    expect(logic.pollView(s).players.map((p) => [p.name, p.score, p.coins])).toEqual([['An', 10, 0], ['Bình', 10, 2]]);
    expect(rankedPlayers(s).map((p) => [p.name, totalOf(p)])).toEqual([['Bình', 12], ['An', 10]]);
  });
});
