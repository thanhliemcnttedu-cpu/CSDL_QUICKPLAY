// Đồng bộ ngoại tuyến cho giáo viên (chế độ Google Drive).
//  - Mọi thay đổi bộ đề, danh mục môn–chương–bài và lớp học được ghi vào kho trên máy trước (IndexedDB).
//  - Có mạng: đẩy lên Drive ngay trong nền. Không có mạng: xếp vào hàng đợi (outbox), khi có mạng sẽ tự đẩy.
//  - Khi kéo về, bản trên Drive được chép vào kho trên máy để dùng lúc mất mạng.
//  - Xung đột (cùng một mục bị sửa cả trên máy lẫn trên Drive): bản mới hơn giữ ở vị trí chính,
//    bản còn lại được lưu thành một bản sao có ghi chú "(xung đột …)". Danh mục môn học: bản mới hơn thắng.
// Mô-đun này không gọi mạng trực tiếp: api.ts đưa vào hai hàm (drive, isRetryable) qua SyncTransport.
import { kvDel, kvGet, kvKeys, kvSet } from './idb';
import { uid } from './util';
import type { Catalog, ClassRoom, Quiz, QuizSummary } from './types';

export interface SyncTransport {
  drive: <T>(action: string, params?: Record<string, unknown>) => Promise<T>;
  /** Lỗi tạm thời (mất mạng, máy chủ bận): giữ mục trong hàng đợi, thử lại sau */
  isRetryable: (e: unknown) => boolean;
}

export type OutboxOp = 'put' | 'del';
export interface OutboxEntry {
  op: OutboxOp;
  /** updated_at của bản trên Drive mà máy này đã thấy lần cuối (mốc để phát hiện xung đột) */
  base: string | null;
  at: number;
  error?: string;
}
export type Outbox = Record<string, OutboxEntry>;
export interface SyncResult { pending: number; pushed: number; conflicts: number; offline: boolean; error?: string }
export interface SyncStatus { pending: number; lastAt?: number; lastError?: string; lastConflicts: number; offline: boolean }
interface LastRun { at: number; conflicts: number; error?: string; offline?: boolean }

export const SYNC_EVENT = 'quickplay-sync';
const OUT = 'sync:outbox';
const BASE = 'sync:base';
const LAST = 'sync:last';

// ---------- khóa tuần tự: thao tác ghi, kéo về và đẩy lên không bao giờ chen vào nhau ----------
let chain: Promise<unknown> = Promise.resolve();
export function locked<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => undefined);
  return p;
}

function notify(detail?: Partial<SyncResult>) {
  try {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail }));
  } catch {
    /* môi trường không có cửa sổ (kiểm thử) – bỏ qua */
  }
}

// ---------- quy tắc thuần (có kiểm thử) ----------
/** Có xung đột không: Drive đã đổi so với mốc máy này đã thấy (hoặc mục đã có trên Drive mà máy chưa từng thấy). */
export function isConflict(remoteUpdated: string | undefined, base: string | null): boolean {
  return (remoteUpdated ?? '') !== (base ?? '');
}
/** Bản trên máy mới hơn (so sánh chuỗi thời gian ISO). Bằng nhau thì ưu tiên bản trên máy. */
export function localIsNewer(localUpdated: string | undefined, remoteUpdated: string | undefined): boolean {
  return (localUpdated ?? '') >= (remoteUpdated ?? '');
}
export function copyTitle(title: string, side: 'trên máy' | 'trên Drive'): string {
  return `${title} (xung đột – bản ${side})`;
}

// ---------- hàng đợi ----------
const readOutbox = async (): Promise<Outbox> => (await kvGet<Outbox>(OUT)) ?? {};
const writeOutbox = (o: Outbox) => kvSet(OUT, o);
const readBase = async (): Promise<Record<string, string | null>> => (await kvGet<Record<string, string | null>>(BASE)) ?? {};
const writeBase = (b: Record<string, string | null>) => kvSet(BASE, b);

async function setBase(key: string, updated: string | null | undefined) {
  const b = await readBase();
  b[key] = updated ?? null;
  await writeBase(b);
}
async function dropBase(key: string) {
  const b = await readBase();
  delete b[key];
  await writeBase(b);
}
async function clearEntry(key: string) {
  const o = await readOutbox();
  delete o[key];
  await writeOutbox(o);
}

/** Ghi vào hàng đợi (không khóa – chỉ gọi trong locked). Giữ nguyên mốc base của lần chờ đầu tiên. */
export async function queueWriteRaw(key: string, op: OutboxOp) {
  const o = await readOutbox();
  const prev = o[key];
  o[key] = prev
    ? { ...prev, op, at: Date.now(), error: undefined }
    : { op, base: (await readBase())[key] ?? null, at: Date.now() };
  await writeOutbox(o);
  notify();
}

/** Lỗi máy chủ của một mục đang chờ đẩy (nếu có). */
export async function entryErrorRaw(key: string): Promise<string | undefined> {
  return (await readOutbox())[key]?.error;
}

/** Mục này còn chờ đẩy lên Drive không (gọi trong locked). */
export async function hasPendingRaw(key: string): Promise<boolean> {
  return !!(await readOutbox())[key];
}

/** Ghi thêm trạng thái lượt đồng bộ gần nhất (giữ các trường cũ nếu không ghi đè). */
async function mergeLast(patch: Partial<LastRun>) {
  const prev = (await kvGet<LastRun>(LAST)) ?? { at: 0, conflicts: 0 };
  await kvSet(LAST, { ...prev, ...patch });
}

export async function status(): Promise<SyncStatus> {
  const o = await readOutbox();
  const last = (await kvGet<LastRun>(LAST)) ?? { at: 0, conflicts: 0 };
  const errs = Object.values(o).map((e) => e.error).filter(Boolean);
  return {
    pending: Object.keys(o).length,
    lastAt: last.at || undefined,
    lastConflicts: last.conflicts,
    lastError: errs[0] ?? last.error,
    offline: !!last.offline,
  };
}

// ---------- đẩy lên Drive ----------
async function findQuiz(id: string, t: SyncTransport): Promise<Quiz | undefined> {
  try {
    return await t.drive<Quiz>('getQuiz', { id });
  } catch (e) {
    if (t.isRetryable(e)) throw e;
    return undefined; // không có trên Drive
  }
}

/** Xóa trên Drive. Nếu Drive không còn mục đó (đã xóa từ trước) thì coi là xong, không giữ trong hàng đợi. */
async function deleteRemote(action: 'deleteQuiz' | 'deleteClass', id: string, t: SyncTransport) {
  try {
    await t.drive(action, { id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!t.isRetryable(e) && /không tìm thấy/i.test(msg)) return;
    throw e;
  }
}

async function flushOne(key: string, entry: OutboxEntry, t: SyncTransport): Promise<'pushed' | 'conflict'> {
  const done = async (conflict = false) => {
    await clearEntry(key);
    return conflict ? 'conflict' : 'pushed';
  };

  if (key === 'catalog') {
    const local = await kvGet<Catalog>('catalog');
    if (entry.op === 'del' || !local) return done();
    const remote = await t.drive<Catalog>('getCatalog');
    if (isConflict(remote.updated_at, entry.base) && !localIsNewer(local.updated_at, remote.updated_at)) {
      // Danh mục: bản trên Drive mới hơn → giữ bản đó trên máy, không tạo bản sao
      await kvSet('catalog', remote);
      await setBase(key, remote.updated_at);
      return done();
    }
    const saved = await t.drive<Catalog>('saveCatalog', { catalog: local });
    await kvSet('catalog', saved);
    await setBase(key, saved.updated_at);
    return done();
  }

  if (key.startsWith('quiz:')) {
    const id = key.slice('quiz:'.length);
    if (entry.op === 'del') {
      await deleteRemote('deleteQuiz', id, t);
      await dropBase(key);
      return done();
    }
    const local = await kvGet<Quiz>(key);
    if (!local) return done();
    const remote = await findQuiz(id, t);
    let conflict = false;
    if (remote && isConflict(remote.updated_at, entry.base)) {
      conflict = true;
      if (localIsNewer(local.updated_at, remote.updated_at)) {
        // Bản trên Drive thành bản sao; bản trên máy ghi đè vị trí chính
        const copy: Quiz = { ...remote, id: uid('quiz_'), title: copyTitle(remote.title, 'trên Drive'), updated_at: new Date().toISOString() };
        const saved = await t.drive<Quiz>('saveQuiz', { quiz: copy });
        await kvSet('quiz:' + saved.id, saved);
        await setBase('quiz:' + saved.id, saved.updated_at);
      } else {
        // Bản trên máy thành bản sao; giữ bản mới hơn trên Drive ở vị trí chính
        const copy: Quiz = { ...local, id: uid('quiz_'), title: copyTitle(local.title, 'trên máy'), updated_at: new Date().toISOString() };
        const saved = await t.drive<Quiz>('saveQuiz', { quiz: copy });
        await kvSet('quiz:' + saved.id, saved);
        await setBase('quiz:' + saved.id, saved.updated_at);
        await kvSet(key, remote);
        await setBase(key, remote.updated_at);
        return done(true);
      }
    }
    const saved = await t.drive<Quiz>('saveQuiz', { quiz: local });
    await kvSet(key, saved);
    await setBase(key, saved.updated_at);
    return done(conflict);
  }

  // lớp học
  const id = key.slice('class:'.length);
  if (entry.op === 'del') {
    await deleteRemote('deleteClass', id, t);
    await dropBase(key);
    return done();
  }
  const local = await kvGet<ClassRoom>(key);
  if (!local) return done();
  const remoteList = await t.drive<ClassRoom[]>('listClasses');
  const remote = remoteList.find((c) => c.id === id);
  let conflict = false;
  if (remote && isConflict(remote.updated_at, entry.base)) {
    conflict = true;
    if (localIsNewer(local.updated_at, remote.updated_at)) {
      const copy: ClassRoom = { ...remote, id: uid('c_'), name: copyTitle(remote.name, 'trên Drive'), updated_at: new Date().toISOString() };
      const saved = await t.drive<ClassRoom>('saveClass', { cls: copy });
      await kvSet('class:' + saved.id, saved);
      await setBase('class:' + saved.id, saved.updated_at);
    } else {
      const copy: ClassRoom = { ...local, id: uid('c_'), name: copyTitle(local.name, 'trên máy'), updated_at: new Date().toISOString() };
      const saved = await t.drive<ClassRoom>('saveClass', { cls: copy });
      await kvSet('class:' + saved.id, saved);
      await setBase('class:' + saved.id, saved.updated_at);
      await kvSet(key, remote);
      await setBase(key, remote.updated_at);
      return done(true);
    }
  }
  const saved = await t.drive<ClassRoom>('saveClass', { cls: local });
  await kvSet(key, saved);
  await setBase(key, saved.updated_at);
  return done(conflict);
}

/** Đẩy mọi mục đang chờ lên Drive. Lỗi tạm thời thì dừng và giữ nguyên hàng đợi. */
export function flushAll(t: SyncTransport): Promise<SyncResult> {
  return locked(async () => {
    let pushed = 0;
    let conflicts = 0;
    let lastError: string | undefined;
    const keys = Object.keys(await readOutbox());
    for (const key of keys) {
      const entry = (await readOutbox())[key];
      if (!entry) continue;
      try {
        const r = await flushOne(key, entry, t);
        pushed++;
        if (r === 'conflict') conflicts++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (t.isRetryable(e)) {
          await mergeLast({ offline: true });
          const result = { pending: Object.keys(await readOutbox()).length, pushed, conflicts, offline: true };
          notify(result);
          return result;
        }
        // Lỗi từ máy chủ (ví dụ Drive đầy): giữ mục trong hàng đợi, ghi lỗi để hiển thị và thử lại sau
        const o = await readOutbox();
        if (o[key]) {
          o[key] = { ...o[key], error: msg };
          await writeOutbox(o);
        }
        lastError = msg;
      }
    }
    const pending = Object.keys(await readOutbox()).length;
    // Chỉ ghi "đã liên lạc được Drive" khi thật sự đã gửi thứ gì đó (không có mục nào thì chưa biết trạng thái mạng)
    if (keys.length) await kvSet(LAST, { at: Date.now(), conflicts, error: lastError, offline: false });
    const result: SyncResult = { pending, pushed, conflicts, offline: false, error: lastError };
    notify(result);
    return result;
  });
}

// ---------- kéo về ----------
/** Chép bản trên Drive vào kho trên máy. Mục đang chờ đẩy được giữ nguyên (không bị ghi đè). */
export function pullAll(t: SyncTransport): Promise<void> {
  return locked(async () => {
    const out = await readOutbox();
    const base = await readBase();

    // Bộ đề
    const list = await t.drive<QuizSummary[]>('listQuizzes');
    const remoteIds = new Set(list.map((s) => 'quiz:' + s.id));
    for (const s of list) {
      const key = 'quiz:' + s.id;
      if (out[key]) continue;
      const local = await kvGet<Quiz>(key);
      if (local && local.updated_at === s.updated_at) {
        base[key] = s.updated_at ?? null;
        continue;
      }
      const full = await t.drive<Quiz>('getQuiz', { id: s.id });
      await kvSet(key, full);
      base[key] = full.updated_at ?? null;
    }
    for (const k of await kvKeys()) {
      if (k.startsWith('quiz:') && !out[k] && !remoteIds.has(k)) {
        await kvDel(k);
        delete base[k];
      }
    }

    // Lớp học (trả về đủ danh sách học sinh)
    const classes = await t.drive<ClassRoom[]>('listClasses');
    const classKeys = new Set(classes.map((c) => 'class:' + c.id));
    for (const c of classes) {
      const key = 'class:' + c.id;
      if (out[key]) continue;
      await kvSet(key, c);
      base[key] = c.updated_at ?? null;
    }
    for (const k of await kvKeys()) {
      if (k.startsWith('class:') && !out[k] && !classKeys.has(k)) {
        await kvDel(k);
        delete base[k];
      }
    }

    // Danh mục môn học
    if (!out.catalog) {
      const cat = await t.drive<Catalog>('getCatalog');
      await kvSet('catalog', cat);
      base.catalog = cat.updated_at ?? null;
    }

    await writeBase(base);
    await kvSet(LAST, { at: Date.now(), conflicts: (await kvGet<LastRun>(LAST))?.conflicts ?? 0, offline: false });
    notify();
  });
}

/** Một lượt đồng bộ: đẩy hàng đợi; nếu cần thì kéo về. */
export async function runSync(t: SyncTransport, opts: { pull: boolean }): Promise<SyncResult> {
  const r = await flushAll(t);
  if (opts.pull && !r.offline) {
    try {
      await pullAll(t);
    } catch (e) {
      if (t.isRetryable(e)) {
        await mergeLast({ offline: true });
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        await mergeLast({ error: msg, offline: false });
        notify({ error: msg });
      }
    }
  }
  return r;
}
