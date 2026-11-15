// Lớp truy cập dữ liệu: cùng một tập hành động (docs/API.md) cho 2 nơi lưu
//  - 'drive': Google Apps Script Web App -> tệp .json trên Google Drive (dùng chung web + bản .exe)
//  - 'local': IndexedDB/localStorage trong trình duyệt (chạy thử không cần cấu hình; phiên trực tiếp giữa các tab)
import type { AnswerRecord, ClassRoom, PaperView, PollResult, Quiz, QuizSummary, Session, SessionSettings } from './types';
import { scheduleSnapshot, shouldSnapshot } from './autoSnapshot';
import * as paper from './paper';
import { normalizeCatalog } from './catalog';
import type { Catalog } from './types';
import { loadSettings, scriptUrlFromLink } from './settings';
import * as logic from './sessionLogic';
import { randomPin, uid } from './util';
import { kvGet, kvSet, kvDel, kvKeys } from './idb';

export class ApiError extends Error {
  /** Lỗi tạm thời (mất mạng, máy chủ bận): gửi lại sau vài giây là được */
  retryable = false;
}
const retryable = (msg: string) => Object.assign(new ApiError(msg), { retryable: true });

async function callDrive<T>(action: string, params: Record<string, unknown> = {}, scriptUrlOverride?: string): Promise<T> {
  const s = loadSettings();
  const url = scriptUrlOverride || s.scriptUrl || scriptUrlFromLink();
  if (!url) throw new ApiError('Chưa cấu hình địa chỉ Apps Script. Vào Cài đặt để dán URL Web App.');
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, teacher_key: s.teacherKey, ...params }),
      redirect: 'follow',
    });
  } catch {
    throw retryable('Không kết nối được máy chủ Google. Kiểm tra mạng Internet hoặc URL Apps Script.');
  }
  const text = await res.text();
  let json: { ok: boolean; data?: T; error?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw retryable('Apps Script trả về dữ liệu không hợp lệ. Hãy kiểm tra đã triển khai Web App với quyền "Bất kỳ ai".');
  }
  if (!json.ok && /^DRIVE_FULL:/.test(json.error ?? '')) {
    // Google Drive của giáo viên đã đầy: bật cảnh báo kèm nút tải tệp sao lưu toàn bộ
    import('./driveFull').then((m) => m.markDriveFull()).catch(() => {});
    throw new ApiError(json.error!.replace(/^DRIVE_FULL:\s*/, ''));
  }
  if (!json.ok) throw /Máy chủ đang bận/.test(json.error ?? '') ? retryable(json.error!) : new ApiError(json.error || 'Lỗi không xác định từ Apps Script.');
  return json.data as T;
}

// ---------------- Chế độ cục bộ ----------------
const SESS = (pin: string) => `quizzi.session.${pin}`;
const PROG = (pin: string, pid: string) => `quizzi.progress.${pin}.${pid}`;

function readSession(pin: string): Session {
  const raw = localStorage.getItem(SESS(pin));
  if (!raw) throw new ApiError('Không tìm thấy phòng với mã PIN này.');
  return JSON.parse(raw);
}
function writeSession(s: Session) {
  localStorage.setItem(SESS(s.pin), JSON.stringify(s));
}
function mutate<T>(pin: string, fn: (s: Session) => T): T {
  const s = readSession(pin);
  const r = fn(s);
  writeSession(s);
  return r;
}
const summary = (q: Quiz): QuizSummary => ({
  id: q.id, title: q.title, subject: q.subject, subject_id: q.subject_id, chapter_id: q.chapter_id, lesson_id: q.lesson_id, grade: q.grade, visibility: q.visibility,
  updated_at: q.updated_at, cover_url: q.cover_url, question_count: q.questions.length,
});

async function callLocal<T>(action: string, p: Record<string, any>): Promise<T> {
  const r = await (async (): Promise<unknown> => {
    switch (action) {
      case 'ping':
        return { name: 'Quickplay-local', version: '1.0.0' };
      case 'verifyTeacher':
        return { ok: true };
      case 'listQuizzes':
      case 'listPublicQuizzes': {
        const keys = (await kvKeys()).filter((k) => k.startsWith('quiz:'));
        const all = (await Promise.all(keys.map((k) => kvGet<Quiz>(k)))).filter(Boolean) as Quiz[];
        return all
          .filter((q) => action === 'listQuizzes' || q.visibility === 'public')
          .map(summary)
          .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
      }
      case 'getQuiz': {
        const q = await kvGet<Quiz>('quiz:' + p.id);
        if (!q) throw new ApiError('Không tìm thấy bộ câu hỏi.');
        return q;
      }
      case 'saveQuiz': {
        const q: Quiz = { ...p.quiz, updated_at: new Date().toISOString() };
        await kvSet('quiz:' + q.id, q);
        return q;
      }
      case 'deleteQuiz':
        await kvDel('quiz:' + p.id);
        return { id: p.id };
      case 'uploadMedia':
        // Chế độ cục bộ: giữ nguyên data URL trong tệp JSON
        return { url: p.base64.startsWith('data:') ? p.base64 : `data:${p.mime};base64,${p.base64}`, file_id: '' };
      case 'createSession': {
        const quiz = await kvGet<Quiz>('quiz:' + p.quiz_id);
        if (!quiz) throw new ApiError('Không tìm thấy bộ câu hỏi.');
        let pin = randomPin();
        while (localStorage.getItem(SESS(pin))) pin = randomPin();
        const s = logic.createSession(pin, quiz.id, quiz.title, quiz.questions.length, p.settings as SessionSettings);
        writeSession(s);
        await kvSet('sessionquiz:' + pin, quiz); // ảnh chụp bộ đề tại thời điểm tổ chức
        return { pin, session_id: s.session_id };
      }
      case 'hostState':
        return readSession(p.pin);
      case 'hostAction':
        return mutate(p.pin, (s) => logic.applyHostOp(s, p.op, p.player_id, { q_index: p.q_index, correct: p.correct, points: p.points, coins: p.coins }));
      case 'listSessions':
        return Object.keys(localStorage)
          .filter((k) => k.startsWith('quizzi.session.'))
          .map((k) => JSON.parse(localStorage.getItem(k)!) as Session)
          .map((s) => ({ pin: s.pin, quiz_title: s.quiz_title, state: s.state, mode: s.settings.mode, created_at: s.created_at, player_count: s.players.length }))
          .sort((a, b) => b.created_at - a.created_at);
      case 'getSessionQuiz': {
        const s = readSession(p.pin);
        const quiz = await kvGet<Quiz>('sessionquiz:' + p.pin);
        if (!quiz) throw new ApiError('Không tải được đề của phòng này.');
        return { quiz, settings: s.settings, state: s.state };
      }
      case 'joinSession':
        return mutate(p.pin, (s) => {
          const player = logic.joinPlayer(s, p.name, p.avatar, p.player_id, p.class_name, !!p.reuse_name);
          return { player_id: player.player_id, player };
        });
      case 'poll':
        return mutate(p.pin, (s) => logic.pollView(s, p.player_id));
      case 'submitAnswer':
        return mutate(p.pin, (s) => ({ player: logic.submitAnswer(s, p.record as AnswerRecord) }));
      case 'saveProgress':
        localStorage.setItem(PROG(p.pin, p.player_id), JSON.stringify({ current_index: p.current_index, draft: p.draft }));
        return { saved_at: Date.now() };
      case 'getProgress': {
        const s = readSession(p.pin);
        const raw = localStorage.getItem(PROG(p.pin, p.player_id));
        const prog = raw ? JSON.parse(raw) : { current_index: 0, draft: null };
        return { ...prog, answers: s.answers.filter((a) => a.player_id === p.player_id) };
      }
      case 'reportViolation':
        return mutate(p.pin, (s) => logic.reportViolation(s, p.player_id, p.kind, p.detail, p.q_index));
      case 'uploadAnswerAudio':
        // Chạy cục bộ: giữ thẳng bản ghi âm trong câu trả lời (dạng data URL)
        return { url: `data:${p.mime};base64,${p.base64}` };
      case 'finishPlayer':
        return mutate(p.pin, (s) => {
          const pl = s.players.find((x) => x.player_id === p.player_id);
          if (pl && !pl.finished) {
            pl.finished = true;
            pl.finished_at = Date.now();
          }
          return { player: pl };
        });
      case 'getCatalog':
        return normalizeCatalog(await kvGet('catalog'));
      case 'saveCatalog': {
        const c = { ...normalizeCatalog(p.catalog), updated_at: new Date().toISOString() };
        await kvSet('catalog', c);
        return c;
      }
      case 'listClasses': {
        const keys = (await kvKeys()).filter((k) => k.startsWith('class:'));
        const all = (await Promise.all(keys.map((k) => kvGet<ClassRoom>(k)))).filter(Boolean) as ClassRoom[];
        return all.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      }
      case 'saveClass': {
        const c: ClassRoom = { ...p.cls, id: p.cls.id || uid('c_'), updated_at: new Date().toISOString() };
        await kvSet('class:' + c.id, c);
        return c;
      }
      case 'deleteClass':
        await kvDel('class:' + p.id);
        return { id: p.id };
      case 'createPaperSession': {
        const full = await kvGet<Quiz>('quiz:' + p.quiz_id);
        if (!full) throw new ApiError('Không tìm thấy bộ câu hỏi.');
        const quiz = paper.paperQuiz(full);
        if (!quiz.questions.length) throw new ApiError('Bộ câu hỏi này chưa có câu nào dùng được với thẻ giấy (cần câu một đáp án, 2–4 phương án).');
        if (!p.students?.length) throw new ApiError('Lớp chưa có học sinh nào.');
        let pin = randomPin();
        while (localStorage.getItem(SESS(pin))) pin = randomPin();
        const s = paper.createPaperSession(pin, quiz, p.class_name, p.students, uid('k') + uid(''));
        writeSession(s);
        await kvSet('sessionquiz:' + pin, quiz);
        return { pin, session_id: s.session_id };
      }
      case 'paperAction': {
        const quiz = await kvGet<Quiz>('sessionquiz:' + p.pin);
        try {
          return mutate(p.pin, (s) => paper.paperAction(s, quiz?.questions ?? [], p.key, p.op, p.q_index, p.hits));
        } catch (e) {
          throw e instanceof ApiError ? e : new ApiError((e as Error).message);
        }
      }
      case 'importGoogleForm':
        throw new ApiError('Cần kết nối Google Drive (Apps Script) để đọc Google Form: trình duyệt không được phép đọc trực tiếp trang của Google.');
      case 'setRootFolder':
        throw new ApiError('Chọn thư mục Google Drive chỉ dùng khi lưu trên Google Drive.');
      case 'aiGenerate':
        throw new ApiError('AI_LOCAL'); // xử lý trực tiếp ở ai.ts bằng khóa Gemini của giáo viên
    }
    throw new ApiError('Hành động không hỗ trợ: ' + action);
  })();
  return r as T;
}

export function call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const s = loadSettings();
  const linked = scriptUrlFromLink();
  const run = s.backend === 'drive' ? callDrive<T>(action, params)
    : linked ? callDrive<T>(action, params, linked) // học sinh mở link tham gia có kèm URL Apps Script
    : callLocal<T>(action, params as Record<string, any>);
  // Dữ liệu của giáo viên vừa thay đổi: hẹn lưu tệp gộp (Drive + thư mục trên máy), không làm chậm thao tác chính
  if (shouldSnapshot(action, params)) run.then(() => scheduleSnapshot()).catch(() => {});
  return run;
}

export const testConnection = (url: string) => callDrive<{ name: string; version: string }>('verifyTeacher', {}, url);

// Các hàm tiện dụng có kiểu
export const api = {
  listQuizzes: () => call<QuizSummary[]>('listQuizzes'),
  listPublicQuizzes: () => call<QuizSummary[]>('listPublicQuizzes'),
  getQuiz: (id: string) => call<Quiz>('getQuiz', { id }),
  saveQuiz: (quiz: Quiz) => call<Quiz>('saveQuiz', { quiz }),
  deleteQuiz: (id: string) => call<{ id: string }>('deleteQuiz', { id }),
  uploadMedia: (name: string, mime: string, base64: string, hash?: string) => call<{ url: string; file_id: string; reused?: boolean }>('uploadMedia', { name, mime, base64, hash }),
  createSession: (quiz_id: string, settings: SessionSettings) => call<{ pin: string; session_id: string }>('createSession', { quiz_id, settings }),
  hostState: (pin: string) => call<Session>('hostState', { pin }),
  hostAction: (pin: string, op: logic.HostOp, player_id?: string, extra: { q_index?: number; correct?: boolean; points?: number; coins?: number } = {}) =>
    call<Session>('hostAction', { pin, op, player_id, ...extra }),
  listSessions: () => call<{ pin: string; quiz_title: string; state: string; mode: string; created_at: number; player_count: number }[]>('listSessions'),
  getSessionQuiz: (pin: string) => call<{ quiz: Quiz; settings: SessionSettings; state: string }>('getSessionQuiz', { pin }),
  joinSession: (pin: string, name: string, avatar: string, player_id?: string, class_name?: string, reuse_name?: boolean) =>
    call<{ player_id: string; player: import('./types').Player }>('joinSession', { pin, name, avatar, player_id, class_name, reuse_name }),
  poll: (pin: string, player_id?: string) => call<PollResult>('poll', { pin, player_id }),
  submitAnswer: (pin: string, player_id: string, record: AnswerRecord) => call<{ player: import('./types').Player }>('submitAnswer', { pin, player_id, record }),
  saveProgress: (pin: string, player_id: string, current_index: number, draft: unknown) => call('saveProgress', { pin, player_id, current_index, draft }),
  getProgress: (pin: string, player_id: string) =>
    call<{ current_index: number; draft: unknown; answers: AnswerRecord[] }>('getProgress', { pin, player_id }),
  finishPlayer: (pin: string, player_id: string) => call('finishPlayer', { pin, player_id }),
  /** Học sinh gửi bản ghi âm câu trả lời miệng (lưu vào Drive của giáo viên, cần Apps Script 1.5.0 trở lên). */
  uploadAnswerAudio: (pin: string, player_id: string, q_index: number, mime: string, base64: string) =>
    call<{ url: string; file_id?: string }>('uploadAnswerAudio', { pin, player_id, q_index, mime, base64 }),
  reportViolation: (pin: string, player_id: string, kind: import('./types').ViolationKind, detail: string, q_index?: number) =>
    call<{ violations: number; locked: boolean }>('reportViolation', { pin, player_id, kind, detail, q_index }),
  getCatalog: () => call<Catalog>('getCatalog'),
  saveCatalog: (catalog: Catalog) => call<Catalog>('saveCatalog', { catalog }),
  listClasses: () => call<ClassRoom[]>('listClasses'),
  saveClass: (cls: Partial<ClassRoom> & { name: string; students: string[] }) => call<ClassRoom>('saveClass', { cls }),
  deleteClass: (id: string) => call<{ id: string }>('deleteClass', { id }),
  createPaperSession: (quiz_id: string, class_name: string, students: string[]) =>
    call<{ pin: string; session_id: string }>('createPaperSession', { quiz_id, class_name, students }),
  paperAction: (pin: string, key: string, op: paper.PaperOp, q_index?: number, hits?: paper.PaperHit[]) =>
    call<PaperView>('paperAction', { pin, key, op, q_index, hits }),
  importGoogleForm: (url: string) => call<import('./googleForm').FormData>('importGoogleForm', { url }),
  setRootFolder: (folder_url: string) => call<{ id: string; name: string }>('setRootFolder', { folder_url }),
  aiGenerate: (prompt: string, system?: string) => call<{ text: string }>('aiGenerate', { prompt, system }),
};
