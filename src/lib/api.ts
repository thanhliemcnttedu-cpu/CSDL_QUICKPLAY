// Lớp truy cập dữ liệu: cùng một tập hành động (docs/API.md) cho 2 nơi lưu
//  - 'drive': Google Apps Script Web App -> tệp .json trên Google Drive của giáo viên
//  - 'local': IndexedDB/localStorage trong trình duyệt (chạy thử không cần cấu hình; phiên trực tiếp giữa các tab)
import type { AnswerRecord, ClassRoom, PaperView, PollResult, Quiz, QuizSummary, Session, SessionSettings } from './types';
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
  ...(q.paper_period ? { paper_period: q.paper_period } : {}), ...(q.paper_code ? { paper_code: q.paper_code } : {}),
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
        if (q.paper_period) q.visibility = 'private'; // đề thi luôn riêng tư (giống Apps Script)
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
        const st = p.settings as SessionSettings;
        const exam = st.mode === 'exam' ? logic.examRoster(await kvGet<ClassRoom>('class:' + st.exam_class_id)) : undefined;
        // Bài kiểm tra nhiều đề: các đề đã bốc (cùng số câu), học sinh được chia đều khi vào phòng
        const ids: string[] = Array.isArray(p.paper_ids) ? p.paper_ids : [];
        const paperQuizzes: Quiz[] = [];
        if (st.mode === 'exam' && ids.length > 1) {
          for (const id of ids) {
            const pq = await kvGet<Quiz>('quiz:' + id);
            if (!pq) throw new ApiError('Không tìm thấy một đề thi đã chọn.');
            if (pq.questions.length !== quiz.questions.length) throw new ApiError(`Các đề thi phải có cùng số câu: đề "${pq.title}" có ${pq.questions.length} câu, đề "${quiz.title}" có ${quiz.questions.length} câu.`);
            paperQuizzes.push(pq);
          }
        }
        const papers = paperQuizzes.map((x) => ({ quiz_id: x.id, code: x.paper_code || x.title, title: x.title }));
        // Nhiều đề: tên chung của kì thi (bỏ "– Mã ..." của đề thứ nhất), giống Apps Script
        const title = papers.length > 1 ? `${quiz.title.replace(/\s*[–-]\s*Mã\s+\S+\s*$/, '')} (${papers.length} đề)` : quiz.title;
        const s = logic.createSession(pin, quiz.id, title, quiz.questions.length, st, exam, papers);
        writeSession(s);
        await kvSet('sessionquiz:' + pin, quiz); // ảnh chụp bộ đề tại thời điểm tổ chức
        for (let k = 0; k < paperQuizzes.length; k++) await kvSet(`sessionquiz:${pin}:${k}`, paperQuizzes[k]);
        return { pin, session_id: s.session_id };
      }
      case 'hostState': {
        const s = readSession(p.pin);
        // Bài kiểm tra hết giờ: tự kết thúc cả khi không còn học sinh nào đang mở trang
        if (s.settings.mode === 'exam' && s.state !== 'COMPLETED' && s.state !== 'LOBBY_WAITING' && s.settings.deadline && Date.now() > Date.parse(s.settings.deadline)) {
          s.state = 'COMPLETED';
          s.ended_at = Date.now();
          writeSession(s);
        }
        return s;
      }
      case 'hostAction':
        return mutate(p.pin, (s) => logic.applyHostOp(s, p.op, p.player_id, { q_index: p.q_index, correct: p.correct, points: p.points, coins: p.coins }));
      case 'listSessions':
        return Object.keys(localStorage)
          .filter((k) => k.startsWith('quizzi.session.'))
          .map((k) => JSON.parse(localStorage.getItem(k)!) as Session)
          .map((s) => ({ pin: s.pin, session_id: s.session_id, quiz_title: s.quiz_title, state: s.state, mode: s.settings.mode, created_at: s.created_at, player_count: s.players.length }))
          .sort((a, b) => b.created_at - a.created_at);
      case 'deleteSessions': {
        const ids = new Set<string>(p.session_ids ?? []);
        let removed = 0;
        for (const k of Object.keys(localStorage).filter((x) => x.startsWith('quizzi.session.'))) {
          const s = JSON.parse(localStorage.getItem(k)!) as Session;
          if (!p.all && !ids.has(s.session_id)) continue;
          localStorage.removeItem(k);
          for (const pk of Object.keys(localStorage)) if (pk.startsWith(`quizzi.progress.${s.pin}.`)) localStorage.removeItem(pk);
          await kvDel('sessionquiz:' + s.pin);
          removed++;
        }
        return { removed, files: removed, audio: 0, left: Object.keys(localStorage).filter((x) => x.startsWith('quizzi.session.')).length };
      }
      case 'getSessionQuiz': {
        const s = readSession(p.pin);
        // Nhiều đề: em nhận đúng đề đã được chia cho mình
        const me = p.player_id ? s.players.find((x) => x.player_id === p.player_id) : undefined;
        const k = s.papers && me?.paper !== undefined ? me.paper : -1;
        const quiz = await kvGet<Quiz>(k >= 0 ? `sessionquiz:${p.pin}:${k}` : 'sessionquiz:' + p.pin);
        if (!quiz) throw new ApiError('Không tải được đề của phòng này.');
        return { quiz, settings: s.settings, state: s.state, ...(k >= 0 && s.papers ? { paper: s.papers[k] } : {}) };
      }
      case 'joinSession': {
        const r = mutate(p.pin, (s) => {
          const player = logic.joinPlayer(s, p.name, p.avatar, p.player_id, p.class_name, !!p.reuse_name, p.student_code);
          return { player_id: player.player_id, player };
        });
        if (!p.boot) return r;
        // như Apps Script 1.5.8: gửi kèm đề + cài đặt + tiến độ để màn làm bài hiện ngay
        try {
          const sq = await callLocal<Record<string, unknown>>('getSessionQuiz', { pin: p.pin, player_id: r.player_id });
          const progress = await callLocal<Record<string, unknown>>('getProgress', { pin: p.pin, player_id: r.player_id });
          return { ...r, boot: { ...sq, progress } };
        } catch {
          return r;
        }
      }
      case 'examStudent':
        return logic.examStudent(readSession(p.pin), p.student_code);
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
        if (c.codes) c.codes = c.students.map((_, i) => logic.normCode(c.codes?.[i]));
        await kvSet('class:' + c.id, c);
        return c;
      }
      case 'deleteClass':
        await kvDel('class:' + p.id);
        return { id: p.id };
      case 'createPaperSession': {
        const full = await kvGet<Quiz>('quiz:' + p.quiz_id);
        if (!full) throw new ApiError('Không tìm thấy bộ câu hỏi.');
        const quiz = paper.paperQuiz(full, Array.isArray(p.question_ids) ? p.question_ids : undefined);
        if (!quiz.questions.length) throw new ApiError('Chưa có câu nào được chọn để dùng với thẻ giấy (cần câu một đáp án, 2–4 phương án).');
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
  return s.backend === 'drive' ? callDrive<T>(action, params)
    : linked ? callDrive<T>(action, params, linked) // học sinh mở link tham gia có kèm URL Apps Script
    : callLocal<T>(action, params as Record<string, any>);
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
  /** paper_ids: bài kiểm tra nhiều đề (các đề đã bốc, cùng số câu); bỏ trống = một đề. */
  createSession: (quiz_id: string, settings: SessionSettings, paper_ids?: string[]) => call<{ pin: string; session_id: string }>('createSession', { quiz_id, settings, ...(paper_ids && paper_ids.length > 1 ? { paper_ids } : {}) }),
  hostState: (pin: string) => call<Session>('hostState', { pin }),
  hostAction: (pin: string, op: logic.HostOp, player_id?: string, extra: { q_index?: number; correct?: boolean; points?: number; coins?: number } = {}) =>
    call<Session>('hostAction', { pin, op, player_id, ...extra }),
  listSessions: () => call<{ pin: string; session_id: string; quiz_title: string; state: string; mode: string; created_at: number; player_count: number }[]>('listSessions'),
  /** Xóa báo cáo: các phiên được chọn, hoặc toàn bộ (all). Trên Drive, tệp vào Thùng rác. */
  deleteSessions: (session_ids: string[], all = false) => call<{ removed: number; files: number; audio: number; left: number }>('deleteSessions', { session_ids, all }),
  getSessionQuiz: (pin: string, player_id?: string) => call<{ quiz: Quiz; settings: SessionSettings; state: string; paper?: import('./types').SessionPaper }>('getSessionQuiz', { pin, ...(player_id ? { player_id } : {}) }),
  /** Bài kiểm tra: tra tên và lớp theo mã số học sinh (Apps Script 1.5.6). */
  examStudent: (pin: string, student_code: string) =>
    call<{ name: string; class_name: string; code: string; done: boolean }>('examStudent', { pin, student_code }),
  joinSession: (pin: string, name: string, avatar: string, player_id?: string, class_name?: string, reuse_name?: boolean, student_code?: string) =>
    // boot (Apps Script 1.5.8): máy chủ gửi kèm đề và tiến độ; máy chủ cũ bỏ qua, màn làm bài tự tải như trước
    call<{ player_id: string; player: import('./types').Player; boot?: import('./bootCache').Boot }>('joinSession', { pin, name, avatar, player_id, class_name, reuse_name, student_code, boot: true }),
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
  saveClass: (cls: Partial<ClassRoom> & { name: string; students: string[] }) => call<ClassRoom>('saveClass', { cls: cls.codes ? cls : { ...cls, codes: undefined } }),
  deleteClass: (id: string) => call<{ id: string }>('deleteClass', { id }),
  /** question_ids: các câu được chọn cho thẻ giấy (bỏ trống = mọi câu dùng được). */
  createPaperSession: (quiz_id: string, class_name: string, students: string[], question_ids?: string[]) =>
    call<{ pin: string; session_id: string }>('createPaperSession', { quiz_id, class_name, students, question_ids }),
  paperAction: (pin: string, key: string, op: paper.PaperOp, q_index?: number, hits?: paper.PaperHit[]) =>
    call<PaperView>('paperAction', { pin, key, op, q_index, hits }),
  importGoogleForm: (url: string) => call<import('./googleForm').FormData>('importGoogleForm', { url }),
  setRootFolder: (folder_url: string) => call<{ id: string; name: string }>('setRootFolder', { folder_url }),
  aiGenerate: (prompt: string, system?: string) => call<{ text: string }>('aiGenerate', { prompt, system }),
};
