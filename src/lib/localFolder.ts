// Tự lưu dữ liệu soạn bài vào một thư mục trên máy tính (ổ D, ổ E, USB…) do thầy cô chọn.
// Dùng File System Access API: chỉ có trên Chrome / Edge / Cốc Cốc cho máy tính và bản cài .exe. Trình duyệt chỉ cho ghi vào
// đúng thư mục thầy cô đã chọn và sẽ hỏi lại quyền sau khi mở lại trình duyệt.
//
// Trong thư mục:
//   bo-cau-hoi/<tên>__<mã>.json      mỗi bộ câu hỏi một tệp, tự ghi đè mỗi khi lưu
//   lop-hoc/<tên>__<mã>.json         mỗi lớp một tệp
//   danh-muc-mon-hoc.json            môn học – chương – bài
//   quickplay-toan-bo.json           một tệp chứa tất cả (ghi khi bấm "Lưu toàn bộ"), dùng được để khôi phục
import { kvDel, kvGet, kvSet } from './idb';
import type { BackupFile } from './backup';

type Dir = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

const HANDLE = 'localFolder.handle';
const META = 'quickplay.localFolder';
export const FULL_FILE = 'quickplay-toan-bo.json';

export interface FolderMeta { name: string; last?: number; error?: string }
export type FolderState = 'unsupported' | 'none' | 'granted' | 'prompt' | 'denied';

export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export function folderMeta(): FolderMeta | null {
  try {
    return JSON.parse(localStorage.getItem(META) || 'null');
  } catch {
    return null;
  }
}
function setMeta(m: FolderMeta | null) {
  try {
    if (m) localStorage.setItem(META, JSON.stringify(m));
    else localStorage.removeItem(META);
  } catch { /* bỏ qua */ }
  window.dispatchEvent(new Event('quickplay-folder'));
}

async function handle(): Promise<Dir | null> {
  if (!folderSupported()) return null;
  try {
    return ((await kvGet<Dir>(HANDLE)) as Dir | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Trạng thái hiện tại: chưa chọn / đang được phép ghi / cần bấm cho phép lại / bị từ chối. */
export async function folderState(): Promise<FolderState> {
  if (!folderSupported()) return 'unsupported';
  const h = await handle();
  if (!h) return 'none';
  try {
    return ((await h.queryPermission?.({ mode: 'readwrite' })) ?? 'granted') as FolderState;
  } catch {
    return 'prompt';
  }
}

/** Mở hộp chọn thư mục của trình duyệt (phải gọi từ một lần bấm nút). */
export async function chooseFolder(): Promise<FolderMeta | null> {
  const pick = (window as unknown as { showDirectoryPicker?: (o: object) => Promise<Dir> }).showDirectoryPicker;
  if (!pick) throw new Error('Trình duyệt này không cho phần mềm ghi vào thư mục trên máy. Hãy dùng Chrome, Edge hoặc Cốc Cốc trên máy tính.');
  let h: Dir;
  try {
    h = await pick({ mode: 'readwrite', id: 'quickplay' });
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null; // thầy cô bấm Hủy
    throw new Error('Không mở được thư mục này. Hãy chọn một thư mục thường trong ổ D hoặc E (trình duyệt không cho chọn thư mục hệ thống).');
  }
  await kvSet(HANDLE, h);
  const m: FolderMeta = { name: h.name };
  setMeta(m);
  return m;
}

/** Xin lại quyền ghi sau khi mở lại trình duyệt (phải gọi từ một lần bấm nút). */
export async function allowFolder(): Promise<boolean> {
  const h = await handle();
  if (!h) return false;
  const ok = (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
  if (ok) setMeta({ ...(folderMeta() ?? { name: h.name }), error: undefined });
  return ok;
}

export async function forgetFolder() {
  await kvDel(HANDLE).catch(() => {});
  setMeta(null);
}

/** Tên tệp an toàn: bỏ dấu, chỉ giữ chữ, số, gạch nối; tối đa 60 ký tự. */
export function fileSlug(name: string): string {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s || 'khong-ten';
}
const fileFor = (title: string, id: string) => `${fileSlug(title)}__${fileSlug(id)}.json`;

async function writeJson(dir: Dir, name: string, data: unknown) {
  const f = await dir.getFileHandle(name, { create: true });
  const w = await f.createWritable();
  await w.write(JSON.stringify(data, null, 1));
  await w.close();
}
/** Xóa các tệp cũ của cùng một mã (khi đổi tên bộ câu hỏi thì tên tệp đổi theo), trừ tệp `keep`. */
async function removeById(dir: Dir, id: string, keep?: string) {
  const tail = `__${fileSlug(id)}.json`;
  const names: string[] = [];
  if (dir.entries) for await (const [n] of dir.entries()) if (n.endsWith(tail) && n !== keep) names.push(n);
  for (const n of names) await dir.removeEntry(n).catch(() => {});
}

// Các lần ghi nối đuôi nhau để không ghi chồng lên cùng một tệp
let queue: Promise<void> = Promise.resolve();
function enqueue(job: (root: Dir) => Promise<void>): Promise<void> {
  queue = queue.then(async () => {
    const h = await handle();
    if (!h) return;
    const m = folderMeta() ?? { name: h.name };
    try {
      if (((await h.queryPermission?.({ mode: 'readwrite' })) ?? 'granted') !== 'granted') {
        if (m.error !== 'permission') setMeta({ ...m, error: 'permission' });
        return;
      }
      await job(h);
      setMeta({ name: h.name, last: Date.now() });
    } catch (e) {
      setMeta({ ...m, error: (e as Error).message || 'Không ghi được vào thư mục.' });
    }
  });
  return queue;
}

/** Gọi sau mỗi lần lưu / xóa thành công: ghi ngay tệp tương ứng vào thư mục đã chọn (nếu có và đang được phép). */
export function mirrorChange(action: string, params: Record<string, any>, result: any): void {
  if (!folderSupported() || !folderMeta()) return;
  switch (action) {
    case 'saveQuiz': {
      const q = result?.id ? result : params.quiz;
      if (!q?.id) return;
      enqueue(async (root) => {
        const dir = (await root.getDirectoryHandle('bo-cau-hoi', { create: true })) as Dir;
        const name = fileFor(q.title ?? 'bo-cau-hoi', q.id);
        await writeJson(dir, name, q);
        await removeById(dir, q.id, name);
      });
      return;
    }
    case 'deleteQuiz':
      enqueue(async (root) => removeById((await root.getDirectoryHandle('bo-cau-hoi', { create: true })) as Dir, String(params.id)));
      return;
    case 'saveCatalog':
      enqueue((root) => writeJson(root, 'danh-muc-mon-hoc.json', result ?? params.catalog));
      return;
    case 'saveClass': {
      const c = result?.id ? result : null;
      if (!c) return;
      enqueue(async (root) => {
        const dir = (await root.getDirectoryHandle('lop-hoc', { create: true })) as Dir;
        const name = fileFor(c.name ?? 'lop', c.id);
        await writeJson(dir, name, c);
        await removeById(dir, c.id, name);
      });
      return;
    }
    case 'deleteClass':
      enqueue(async (root) => removeById((await root.getDirectoryHandle('lop-hoc', { create: true })) as Dir, String(params.id)));
      return;
  }
}

/** Ghi toàn bộ dữ liệu vào thư mục: một tệp tổng (khôi phục được) và từng tệp riêng. */
export async function saveEverything(b: BackupFile): Promise<void> {
  let failed = '';
  await enqueue(async (root) => {
    await writeJson(root, FULL_FILE, b);
    const quizzes = (await root.getDirectoryHandle('bo-cau-hoi', { create: true })) as Dir;
    for (const q of b.quizzes) await writeJson(quizzes, fileFor(q.title, q.id), q);
    const classes = (await root.getDirectoryHandle('lop-hoc', { create: true })) as Dir;
    for (const c of b.classes) await writeJson(classes, fileFor(c.name, c.id), c);
    if (b.catalog) await writeJson(root, 'danh-muc-mon-hoc.json', b.catalog);
  });
  const m = folderMeta();
  if (m?.error) failed = m.error === 'permission' ? 'Trình duyệt chưa cho phép ghi vào thư mục. Hãy bấm "Cho phép ghi lại".' : m.error;
  if (failed) throw new Error(failed);
}
