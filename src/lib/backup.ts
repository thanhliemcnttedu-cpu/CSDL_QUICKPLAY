// Sao lưu và khôi phục TOÀN BỘ dữ liệu của một giáo viên thành MỘT tệp .json tự chứa:
//   thông tin tài khoản (tên đăng nhập, họ tên, email), danh mục môn học – chương – bài, lớp và học sinh,
//   bộ câu hỏi (ngân hàng câu hỏi), kết quả các buổi đã tổ chức, và ẢNH / ÂM THANH dùng trong câu hỏi (đóng gói ngay trong tệp).
// Vì ảnh và âm thanh nằm sẵn trong tệp nên tệp dùng được độc lập với Google Drive cũ:
//   - mở bằng "Chỉ máy này" để dùng ngay trên máy tính, không cần Internet tới Drive;
//   - hoặc khôi phục lên một Google Drive mới (khi Drive cũ đã đầy): ảnh/âm thanh được tải lên Drive mới và mọi link được đổi theo.
import { api, call } from './api';
import { currentAccount } from './account';
import { loadSettings } from './settings';
import { kvGet, kvKeys, kvSet } from './idb';
import type { Catalog, ClassRoom, Quiz } from './types';

/** Một tệp kết quả buổi học: <pin>.json (phiên) hoặc <pin>.quiz.json (đề thẻ giấy) */
export interface SessionFile { name: string; data: Record<string, unknown> }
/** Nội dung một tệp ảnh/âm thanh, khóa là mã tệp trên Google Drive cũ */
export interface MediaEntry { mime: string; data: string; name?: string }

export interface BackupFile {
  app: 'Quickplay';
  kind: 'backup';
  version: 1 | 2;
  exported_at: string;
  owner?: { username: string; name: string; email?: string };
  source?: 'drive' | 'local';
  quizzes: Quiz[];
  catalog: Catalog | null;
  classes: ClassRoom[];
  sessions?: SessionFile[];
  media?: Record<string, MediaEntry>;
  /** Mã các tệp không lấy được (đã xóa, quá lớn…): câu hỏi vẫn giữ link cũ */
  media_missing?: string[];
}

export type Progress = (text: string, pct?: number) => void;

// ---------------- nhận diện link ảnh/âm thanh trên Google Drive ----------------
const MEDIA_RE = /https:\/\/(?:lh3\.googleusercontent\.com\/d\/|drive\.google\.com\/uc\?export=download(?:&|\\u0026|&amp;)id=)([\w-]{10,})/g;
/** Mã tệp Drive của mọi ảnh/âm thanh xuất hiện trong dữ liệu */
export function mediaIdsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(MEDIA_RE)) out.add(m[1]);
  return [...out];
}
/** Thay mọi link của tệp `id` (dạng ảnh hoặc dạng tải về) bằng `url` */
export function replaceMediaLinks(text: string, map: Record<string, string>): string {
  return text.replace(MEDIA_RE, (all, id: string) => (map[id] ? map[id] : all));
}

const isOldServer = (e: unknown) => /không hợp lệ|Hành động|Unknown action/i.test((e as Error).message);
const onDrive = () => loadSettings().backend === 'drive';

// ---------------- SAO LƯU ----------------
export async function exportAll(o: { media?: boolean; sessions?: boolean; onProgress?: Progress } = {}): Promise<BackupFile> {
  const say: Progress = o.onProgress ?? (() => {});
  const withMedia = o.media ?? true;
  const withSessions = o.sessions ?? true;
  const drive = onDrive();
  const acc = currentAccount();

  // 1. bộ câu hỏi
  say('Đang đọc các bộ câu hỏi…', 2);
  const quizzes: Quiz[] = [];
  let bulk = false;
  if (drive) {
    try {
      for (let page = 0; ; page++) {
        const r = await call<{ total: number; page_size: number; items: Quiz[] }>('exportQuizzes', { page });
        quizzes.push(...r.items);
        say(`Đang đọc bộ câu hỏi ${Math.min(quizzes.length, r.total)}/${r.total}…`, 2 + Math.round((18 * quizzes.length) / Math.max(1, r.total)));
        if ((page + 1) * r.page_size >= r.total) break;
      }
      bulk = true;
    } catch (e) {
      if (!isOldServer(e)) throw e;
    }
  }
  if (!bulk) {
    const list = await api.listQuizzes();
    for (let i = 0; i < list.length; i++) {
      quizzes.push(await api.getQuiz(list[i].id));
      say(`Đang đọc bộ câu hỏi ${i + 1}/${list.length}…`, 2 + Math.round((18 * (i + 1)) / list.length));
    }
  }

  // 2. danh mục, lớp
  say('Đang đọc môn học – chương – bài và danh sách lớp…', 22);
  const [catalog, classes] = await Promise.all([api.getCatalog().catch(() => null), api.listClasses().catch(() => [] as ClassRoom[])]);

  // 3. kết quả các buổi đã tổ chức
  let sessions: SessionFile[] = [];
  if (withSessions) {
    say('Đang đọc kết quả các buổi đã tổ chức…', 25);
    sessions = drive ? await exportDriveSessions(say) : await exportLocalSessions();
  }

  // 4. ảnh và âm thanh trong câu hỏi
  const media: Record<string, MediaEntry> = {};
  const missing: string[] = [];
  if (withMedia && drive) {
    const ids = mediaIdsIn(JSON.stringify(quizzes) + JSON.stringify(sessions));
    let done = 0;
    let queue = ids.slice();
    let oldServer = false;
    while (queue.length && !oldServer) {
      const batch = queue.slice(0, 20);
      queue = queue.slice(20);
      try {
        const r = await call<{ id: string; mime?: string; name?: string; base64?: string; later?: boolean; missing?: boolean; skipped?: string }[]>('exportMedia', { ids: batch });
        for (const m of r) {
          if (m.later) queue.push(m.id);
          else if (m.base64 && m.mime) { media[m.id] = { mime: m.mime, data: m.base64, name: m.name }; done++; }
          else { missing.push(m.id); done++; }
        }
      } catch (e) {
        if (isOldServer(e)) oldServer = true;
        else throw e;
      }
      say(`Đang đóng gói ảnh, âm thanh ${done}/${ids.length}…`, 30 + Math.round((65 * done) / Math.max(1, ids.length)));
    }
    if (oldServer) missing.push(...queue);
  }
  say('Đang tạo tệp…', 98);
  return {
    app: 'Quickplay', kind: 'backup', version: 2, exported_at: new Date().toISOString(),
    owner: acc ? { username: acc.username, name: acc.name, email: acc.email } : undefined,
    source: drive ? 'drive' : 'local',
    quizzes, catalog, classes, sessions,
    media: withMedia ? media : undefined,
    media_missing: missing.length ? missing : undefined,
  };
}

async function exportDriveSessions(say: Progress): Promise<SessionFile[]> {
  const out: SessionFile[] = [];
  try {
    for (let page = 0; ; page++) {
      const r = await call<{ total: number; page_size: number; items: SessionFile[] }>('exportSessions', { page });
      out.push(...r.items);
      say(`Đang đọc kết quả buổi học ${Math.min(out.length, r.total)}/${r.total}…`, 25 + Math.round((5 * out.length) / Math.max(1, r.total)));
      if ((page + 1) * r.page_size >= r.total) break;
    }
  } catch (e) {
    if (!isOldServer(e)) throw e; // Apps Script bản cũ: chưa đọc được kết quả buổi học hàng loạt
  }
  return out;
}

async function exportLocalSessions(): Promise<SessionFile[]> {
  const out: SessionFile[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) ?? '';
    if (!k.startsWith('quizzi.session.')) continue;
    try {
      const s = JSON.parse(localStorage.getItem(k) || 'null');
      if (s?.pin) out.push({ name: `${s.pin}.json`, data: s });
    } catch { /* bỏ qua */ }
  }
  for (const k of (await kvKeys()).filter((x) => x.startsWith('sessionquiz:'))) {
    const q = await kvGet<Record<string, unknown>>(k);
    if (q) out.push({ name: `${k.slice('sessionquiz:'.length)}.quiz.json`, data: q });
  }
  return out;
}

/** Tên tệp sao lưu: quickplay-saoluu_<tên đăng nhập>_<ngày>_<tháng>_<năm>_<giờ>h<phút>.json */
export function backupFileName(owner?: string, d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const who = String(owner ?? '').replace(/[^0-9A-Za-z._@+-]+/g, '-').replace(/^-+|-+$/g, '') || 'quickplay';
  return `quickplay-saoluu_${who}_${p(d.getDate())}_${p(d.getMonth() + 1)}_${d.getFullYear()}_${p(d.getHours())}h${p(d.getMinutes())}.json`;
}

// ---------------- ĐỌC TỆP ----------------
/** Đọc và kiểm tra tệp sao lưu. Chấp nhận: tệp sao lưu toàn bộ, tệp gộp tự lưu, tệp một bộ câu hỏi lẻ. */
export function parseBackup(text: string): BackupFile {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('Tệp này không phải tệp .json hợp lệ.');
  }
  const o = d as Partial<BackupFile> & Partial<Quiz> & { sessions?: unknown[] };
  if (o && o.kind === 'backup' && Array.isArray(o.quizzes)) {
    // kết quả buổi học: tệp sao lưu toàn bộ ghi {name, data}; tệp gộp tự lưu ghi thẳng đối tượng phiên
    const sessions: SessionFile[] = (Array.isArray(o.sessions) ? o.sessions : []).flatMap((x): SessionFile[] => {
      const it = x as Partial<SessionFile> & { pin?: string; session_id?: string };
      if (it && typeof it.name === 'string' && it.data && typeof it.data === 'object') return [{ name: it.name, data: it.data }];
      if (it && typeof it.pin === 'string' && it.session_id) return [{ name: `${it.pin}.json`, data: it as Record<string, unknown> }];
      return [];
    });
    const media: Record<string, MediaEntry> = {};
    if (o.media && typeof o.media === 'object') {
      for (const [id, m] of Object.entries(o.media)) if (m && typeof m.data === 'string' && typeof m.mime === 'string') media[id] = m;
    }
    return {
      app: 'Quickplay', kind: 'backup', version: o.version === 2 ? 2 : 1, exported_at: String(o.exported_at ?? ''),
      owner: o.owner && typeof o.owner.username === 'string' ? o.owner : undefined,
      source: o.source,
      quizzes: o.quizzes.filter((q) => q && typeof q.id === 'string' && Array.isArray(q.questions)),
      catalog: o.catalog && Array.isArray((o.catalog as Catalog).subjects) ? (o.catalog as Catalog) : null,
      classes: Array.isArray(o.classes) ? o.classes.filter((c) => c && typeof c.name === 'string' && Array.isArray(c.students)) : [],
      sessions,
      media,
      media_missing: Array.isArray(o.media_missing) ? o.media_missing.map(String) : undefined,
    };
  }
  if (o && typeof o.id === 'string' && Array.isArray(o.questions)) {
    return { app: 'Quickplay', kind: 'backup', version: 1, exported_at: '', quizzes: [o as Quiz], catalog: null, classes: [] };
  }
  throw new Error('Tệp này không phải tệp sao lưu của Quickplay.');
}

/** Tóm tắt nội dung tệp để hiện trước khi khôi phục */
export function backupSummary(b: BackupFile) {
  const questions = b.quizzes.reduce((s, q) => s + q.questions.length, 0);
  const students = b.classes.reduce((s, c) => s + c.students.length, 0);
  const subjects = b.catalog?.subjects?.length ?? 0;
  const sessions = (b.sessions ?? []).filter((f) => !f.name.endsWith('.quiz.json')).length;
  const media = Object.keys(b.media ?? {}).length;
  const mediaBytes = Object.values(b.media ?? {}).reduce((s, m) => s + Math.floor((m.data.length * 3) / 4), 0);
  return { quizzes: b.quizzes.length, questions, classes: b.classes.length, students, subjects, sessions, media, mediaBytes, missing: b.media_missing?.length ?? 0 };
}

// ---------------- KHÔI PHỤC ----------------
const CHUNK_CHARS = 3_000_000; // mỗi lần gửi lên Apps Script khoảng 3 MB

function chunksBySize<T>(items: T[], size = CHUNK_CHARS): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let n = 0;
  for (const it of items) {
    const len = JSON.stringify(it).length;
    if (cur.length && n + len > size) { out.push(cur); cur = []; n = 0; }
    cur.push(it);
    n += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export interface RestoreResult { quizzes: number; classes: number; catalog: boolean; sessions: number; media: number; mediaFailed: number; sessionsSkipped: number; note?: string }

/** Ghi dữ liệu trong tệp sao lưu vào nơi lưu đang dùng (Google Drive đang kết nối, hoặc "Chỉ máy này").
 *  Bộ câu hỏi trùng mã được ghi đè bằng bản trong tệp; lớp trùng tên được cập nhật. */
export async function importAll(b: BackupFile, onProgress?: Progress): Promise<RestoreResult> {
  const say: Progress = (t, p) => onProgress?.(t, p);
  const drive = onDrive();
  const res: RestoreResult = { quizzes: 0, classes: 0, catalog: false, sessions: 0, media: 0, mediaFailed: 0, sessionsSkipped: 0 };

  // 1. ảnh và âm thanh: tải lên nơi lưu mới (Drive: tệp mới, link mới; máy này: nhúng thẳng vào dữ liệu)
  const map: Record<string, string> = {};
  const entries = Object.entries(b.media ?? {});
  if (entries.length) {
    const { hashBlob, shrinkMedia } = await import('./media');
    let done = 0;
    for (const [id, m] of entries) {
      try {
        let blob = base64ToBlob(m.data, m.mime);
        // tệp cũ chưa nén (PNG, JPG, MP3, WAV…) thì nén luôn cho nhẹ; tệp đã là WebP/Opus thì giữ nguyên để không giảm chất lượng sau mỗi lần chuyển kho
        if (!/^(image\/(webp|gif|svg)|audio\/webm)/.test(blob.type)) blob = await shrinkMedia(blob);
        const hash = blob.type.startsWith('image/') ? await hashBlob(blob) : null;
        const dataUrl = await blobToDataUrl(blob);
        const ext = (blob.type.split('/')[1] || 'bin').split(';')[0];
        const name = (m.name || id).replace(/^(\d{10,}_)+/, '').replace(/\.\w+$/, '') + '.' + ext;
        map[id] = (await api.uploadMedia(name, blob.type, dataUrl, hash ?? undefined)).url;
        res.media++;
      } catch (e) {
        if (/DRIVE_FULL|đã đầy/i.test((e as Error).message)) throw e;
        res.mediaFailed++;
      }
      done++;
      say(`Đang đưa ảnh, âm thanh lên ${drive ? 'Google Drive' : 'máy này'} ${done}/${entries.length}…`, Math.round((50 * done) / entries.length));
    }
  }
  const fix = <T,>(x: T): T => (Object.keys(map).length ? JSON.parse(replaceMediaLinks(JSON.stringify(x), map)) : x);
  const quizzes = fix(b.quizzes);
  const sessions = fix(b.sessions ?? []);

  // 2. danh mục môn học – chương – bài
  if (b.catalog) {
    say('Đang ghi môn học – chương – bài…', 52);
    await api.saveCatalog(b.catalog);
    res.catalog = true;
  }

  // 3. lớp và học sinh (lớp trùng tên thì cập nhật, không tạo lớp thứ hai)
  if (b.classes.length) {
    const existing = await api.listClasses().catch(() => [] as ClassRoom[]);
    for (const c of b.classes) {
      const same = existing.find((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
      await api.saveClass({ id: same?.id ?? c.id, name: c.name, students: c.students });
      res.classes++;
      say(`Đang ghi lớp ${res.classes}/${b.classes.length}…`, 55);
    }
  }

  // 4. bộ câu hỏi
  let bulk = false;
  if (drive && quizzes.length) {
    try {
      const parts = chunksBySize(quizzes);
      for (let i = 0; i < parts.length; i++) {
        const r = await call<{ quizzes: number }>('restoreData', { quizzes: parts[i], rebuild_index: i === parts.length - 1 });
        res.quizzes += r.quizzes;
        say(`Đang ghi bộ câu hỏi ${res.quizzes}/${quizzes.length}…`, 58 + Math.round((30 * (i + 1)) / parts.length));
      }
      bulk = true;
    } catch (e) {
      if (!isOldServer(e)) throw e;
      res.quizzes = 0;
    }
  }
  if (!bulk) {
    for (const q of quizzes) {
      if (drive) await api.saveQuiz(q);
      else await kvSet('quiz:' + q.id, { ...q, updated_at: q.updated_at || new Date().toISOString() }); // giữ nguyên ngày cập nhật trong tệp
      res.quizzes++;
      say(`Đang ghi bộ câu hỏi ${res.quizzes}/${quizzes.length}…`, 58 + Math.round((30 * res.quizzes) / quizzes.length));
    }
  }

  // 5. kết quả các buổi đã tổ chức
  if (sessions.length) {
    say('Đang ghi kết quả các buổi đã tổ chức…', 90);
    if (drive) {
      try {
        for (const part of chunksBySize(sessions)) {
          const r = await call<{ sessions: number; skipped: number }>('restoreData', { session_files: part });
          res.sessions += r.sessions;
          res.sessionsSkipped += r.skipped;
        }
      } catch (e) {
        if (!isOldServer(e)) throw e;
        res.note = 'Apps Script của thầy cô đang chạy bản cũ nên chưa khôi phục được kết quả các buổi học. Hãy cập nhật Apps Script (Trình cài đặt → Cập nhật bản mới) rồi khôi phục lại tệp này.';
      }
    } else {
      for (const f of sessions) {
        const pin = f.name.replace(/\.quiz\.json$|\.json$/, '');
        if (f.name.endsWith('.quiz.json')) { await kvSet('sessionquiz:' + pin, f.data); continue; }
        const key = 'quizzi.session.' + String(f.data.pin ?? pin);
        const cur = localStorage.getItem(key);
        if (cur && JSON.parse(cur).session_id !== f.data.session_id) { res.sessionsSkipped++; continue; }
        try {
          localStorage.setItem(key, JSON.stringify(f.data));
          res.sessions++;
        } catch {
          res.note = 'Bộ nhớ của trình duyệt đã đầy nên chưa ghi hết kết quả các buổi học.';
          break;
        }
      }
    }
  }
  say('Đã khôi phục xong.', 100);
  return res;
}

const blobToDataUrl = (f: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
