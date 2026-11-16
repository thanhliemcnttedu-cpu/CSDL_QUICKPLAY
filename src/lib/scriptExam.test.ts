// Chạy thẳng mã Apps Script (apps-script/Code.gs) trên Google Drive ảo trong bộ nhớ:
// kiểm tra đường vào phòng kiểm tra nhanh của bản 1.5.8 (đề đi kèm khi vào phòng, không ghi Drive khi vào).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type Ctx = { post: (action: string, p?: Record<string, unknown>) => any; driveWrites: () => number; cache: Map<string, string> };

function server(): Ctx {
  const code = readFileSync('apps-script/Code.gs', 'utf8');
  let idn = 0, writes = 0;
  const iter = <T,>(a: T[]) => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
  const files: Record<string, any> = {}, byId: Record<string, any> = {};
  const mkFile = (fo: any, name: string, content: unknown) => {
    writes++;
    const f: any = { id: 'f' + ++idn, name, content: String(content), trashed: false };
    Object.assign(f, { getName: () => f.name, setName: (n: string) => { f.name = n; }, getId: () => f.id, isTrashed: () => f.trashed, setTrashed: (v: boolean) => { f.trashed = v; },
      getSize: () => f.content.length, getBlob: () => ({ getDataAsString: () => f.content, getBytes: () => Buffer.from(f.content) }),
      setContent: (c: string) => { writes++; f.content = String(c); }, getUrl: () => '', setSharing() {}, getLastUpdated: () => new Date() });
    fo.files.push(f); files[f.id] = f; return f;
  };
  const mkFolder = (name: string): any => {
    const fo: any = { name, files: [], subs: [], id: 'd' + ++idn };
    Object.assign(fo, { getName: () => name, getId: () => fo.id, isTrashed: () => false, getUrl: () => '',
      getFiles: () => iter(fo.files.slice()), getFilesByName: (n: string) => iter(fo.files.filter((f: any) => f.name === n && !f.trashed)),
      createFile: (n: any, c: unknown) => (typeof n === 'object' ? mkFile(fo, n.name, n.data) : mkFile(fo, n, c)),
      getFoldersByName: (n: string) => iter(fo.subs.filter((s: any) => s.name === n)),
      createFolder: (n: string) => { const s = mkFolder(n); fo.subs.push(s); byId[s.id] = s; return s; }, addFile() {} });
    return fo;
  };
  const root = mkFolder('QUICKPLAY_DATA'); byId[root.id] = root;
  const props = new Map([['ROOT_FOLDER_ID', root.id], ['TEACHER_KEY', 'k']]);
  const cache = new Map<string, string>();
  const stubs: Record<string, unknown> = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, String(v)), deleteProperty: (k: string) => props.delete(k), getProperties: () => Object.fromEntries(props) }) },
    DriveApp: { getFolderById: (id: string) => { if (!byId[id]) throw new Error('nf'); return byId[id]; }, getRootFolder: () => root, getFileById: (id: string) => files[id], Access: {}, Permission: {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => cache.set(k, v), remove: (k: string) => cache.delete(k),
      getAll: (ks: string[]) => Object.fromEntries(ks.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)])), putAll: (o: Record<string, string>) => Object.entries(o).forEach(([k, v]) => cache.set(k, v)), removeAll: (ks: string[]) => ks.forEach((k) => cache.delete(k)) }) },
    Utilities: { formatDate: () => 'x', getUuid: () => 'u' + ++idn, sleep() {}, base64Encode: (b: string) => Buffer.from(b).toString('base64'), base64Decode: (s: string) => Buffer.from(s, 'base64'), newBlob: (d: unknown, _m: string, n: string) => ({ name: n, data: d }), computeDigest: () => [], DigestAlgorithm: {}, Charset: {} },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ t, setMimeType() { return this; } }) },
    Logger: { log() {} }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }, console: { log() {}, warn() {} },
    ScriptApp: { getProjectTriggers: () => [], getScriptId: () => 'x', getOAuthToken: () => 'x' }, UrlFetchApp: {}, MailApp: {}, FormApp: {},
  };
  const api = new Function(...Object.keys(stubs), code + '\nreturn { doPost };')(...Object.values(stubs));
  const post = (action: string, p: Record<string, unknown> = {}) => {
    const out = JSON.parse(api.doPost({ postData: { contents: JSON.stringify({ action, teacher_key: 'k', ...p }) } }).t);
    if (!out.ok) throw new Error(out.error);
    return out.data;
  };
  return { post, driveWrites: () => writes, cache };
}

const quiz = (title: string, code: string, tag: string) => ({
  title, grade: 'Lớp 3', subject: 'Tin học', paper_period: 'ck1', paper_code: code, visibility: 'private',
  questions: Array.from({ length: 4 }, (_, i) => ({ id: tag + i, type: 'single_choice', text: `${tag} câu ${i}`, points: 1000, time_limit: 30,
    options: [0, 1].map((j) => ({ id: 'o' + j, text: 'P' + j, is_correct: j === 0 })) })),
});

function examRoom(n: number) {
  const s = server();
  const a = s.post('saveQuiz', { quiz: quiz('Đề A', 'TIN3-CK1-01', 'a') });
  const b = s.post('saveQuiz', { quiz: quiz('Đề B', 'TIN3-CK1-02', 'b') });
  const cls = s.post('saveClass', { cls: { name: '3A', students: Array.from({ length: n }, (_, i) => 'Em ' + i), codes: Array.from({ length: n }, (_, i) => 'HS' + i) } });
  const { pin } = s.post('createSession', { quiz_id: a.id, paper_ids: [a.id, b.id], settings: { mode: 'exam', exam_class_id: cls.id, navigation: 'free', exam_layout: 'one', exam_review: 'end' } });
  s.post('hostAction', { pin, op: 'start' });
  return { ...s, pin };
}

describe('Apps Script: vào phòng kiểm tra nhanh (1.5.8)', () => {
  it('vào phòng gửi kèm đúng đề đã chia, cài đặt và tiến độ trống; chia đều hai đề', () => {
    const r = examRoom(30);
    const counts = [0, 0];
    for (let i = 0; i < 30; i++) {
      const j = r.post('joinSession', { pin: r.pin, student_code: 'HS' + i, avatar: 'x', boot: true });
      expect(j.boot.settings.mode).toBe('exam');
      expect(j.boot.progress.answers).toEqual([]);
      const k = j.player.paper as number;
      counts[k]++;
      expect(j.boot.paper.code).toBe(k === 0 ? 'TIN3-CK1-01' : 'TIN3-CK1-02');
      expect(j.boot.quiz.questions[0].id).toBe(k === 0 ? 'a0' : 'b0');
    }
    expect(counts).toEqual([15, 15]);
  });

  it('cả lớp vào phòng không ghi Drive lần nào (không giữ khóa lâu), lần thăm dò sau 10 giây ghi bù', () => {
    const r = examRoom(10);
    const before = r.driveWrites();
    for (let i = 0; i < 10; i++) r.post('joinSession', { pin: r.pin, student_code: 'HS' + i, avatar: 'x', boot: true });
    expect(r.driveWrites()).toBe(before);
    // giả lập đã qua 10 giây kể từ lần ghi trước → lần thăm dò ghi bù phiên xuống Drive
    const meta = JSON.parse(r.cache.get('P_' + r.pin)!);
    r.cache.set('P_' + r.pin, JSON.stringify({ ...meta, t: 0 }));
    r.post('poll', { pin: r.pin });
    expect(r.driveWrites()).toBe(before + 1);
  });

  it('vào lại sau khi đã làm: tiến độ đi kèm có câu đã trả lời; mất bộ nhớ đệm đề thì đọc Drive và nạp lại', () => {
    const r = examRoom(2);
    const j = r.post('joinSession', { pin: r.pin, student_code: 'HS0', avatar: 'x', boot: true });
    const q = j.boot.quiz.questions[1];
    r.post('submitAnswer', { pin: r.pin, player_id: j.player_id, record: { player_id: j.player_id, question_id: q.id, q_index: 1, answer: { kind: 'choice', option_ids: ['o0'] }, correct: true, ratio: 1, score: 1000, time_ms: 0, at: Date.now() } });
    const again = r.post('joinSession', { pin: r.pin, student_code: 'HS0', avatar: 'x', boot: true });
    expect(again.player_id).toBe(j.player_id);
    expect(again.boot.progress.answers.map((a: { q_index: number }) => a.q_index)).toEqual([1]);
    // bộ nhớ đệm đề bị xóa (hết hạn): vẫn trả đúng đề và nạp lại bộ nhớ đệm
    for (const key of [...r.cache.keys()]) if (key.startsWith('Q_')) r.cache.delete(key);
    const sq = r.post('getSessionQuiz', { pin: r.pin, player_id: j.player_id });
    expect(sq.quiz.questions[0].id).toBe(j.boot.quiz.questions[0].id);
    expect([...r.cache.keys()].some((key) => key.startsWith('Q_' + r.pin + '_'))).toBe(true);
  });

  it('tải lại trang (F5) chỉ ghi nhận cho giáo viên, không tính vi phạm, không khóa bài', () => {
    const r = examRoom(1);
    const s = r.post('hostState', { pin: r.pin });
    r.post('hostAction', { pin: r.pin, op: 'end' }); // phòng cũ không bật chống gian lận → tạo phòng có bật
    const cls = s.settings.exam_class_id;
    const { pin } = r.post('createSession', { quiz_id: s.quiz_id, settings: { mode: 'exam', exam_class_id: cls, anti_cheat: { enabled: true, block_right_click: true, block_copy: true, detect_leave: true, require_fullscreen: true, max_violations: 1 } } });
    r.post('hostAction', { pin, op: 'start' });
    const j = r.post('joinSession', { pin, student_code: 'HS0', avatar: 'x' });
    for (let i = 0; i < 3; i++) {
      const v = r.post('reportViolation', { pin, player_id: j.player_id, kind: 'reload', detail: 'F5' });
      expect(v).toMatchObject({ locked: false });
      r.cache.delete('__'); // không làm gì: các lần tải lại cách nhau (máy chủ gộp lần trùng trong 3 giây)
    }
    const after = r.post('hostState', { pin });
    expect(after.players[0].violations ?? 0).toBe(0);
    expect(after.violations.some((v: { kind: string }) => v.kind === 'reload')).toBe(true);
  });

  it('trực tiếp tự do / bài về nhà: cùng tên vào nhiều lần, mỗi lần một lượt mới, lượt cũ giữ nguyên', () => {
    const r = server();
    const q = r.post('saveQuiz', { quiz: quiz('Ôn tập', 'X', 'q') });
    for (const mode of ['classic_live', 'homework']) {
      const { pin } = r.post('createSession', { quiz_id: q.id, settings: { mode, navigation: 'linear' } });
      r.post('hostAction', { pin, op: 'start' });
      const ids = [1, 2, 3].map(() => r.post('joinSession', { pin, name: 'An', class_name: '3A', avatar: 'x' }).player_id);
      expect(new Set(ids).size).toBe(3);
      const st = r.post('hostState', { pin });
      expect(st.players.map((p: { attempt_no?: number; superseded?: boolean }) => [p.attempt_no ?? 1, !!p.superseded])).toEqual([[1, true], [2, true], [3, false]]);
    }
    // giáo viên điều khiển: vẫn không cho trùng tên + lớp
    const { pin } = r.post('createSession', { quiz_id: q.id, settings: { mode: 'instructor_paced' } });
    r.post('joinSession', { pin, name: 'An', class_name: '3A', avatar: 'x' });
    expect(() => r.post('joinSession', { pin, name: 'An', class_name: '3A', avatar: 'x' })).toThrow(/đang có bạn/);
  });

  it('máy khách cũ (không xin boot) vẫn nhận kết quả như trước', () => {
    const r = examRoom(1);
    const j = r.post('joinSession', { pin: r.pin, student_code: 'HS0', avatar: 'x' });
    expect(j.boot).toBeUndefined();
    expect(j.player_id).toBeTruthy();
  });
});
