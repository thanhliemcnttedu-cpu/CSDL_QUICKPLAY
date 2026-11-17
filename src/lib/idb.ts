// Kho khóa–giá trị tối giản trên IndexedDB (dung lượng lớn hơn localStorage, chứa được ảnh dạng data URL).
// Mỗi tài khoản giáo viên có kho riêng (quizzi:<tên đăng nhập>) để nhiều giáo viên dùng chung một trình duyệt
// không thấy bộ đề, lớp, kết quả của nhau. Khi chưa đăng nhập tài khoản thì dùng kho chung 'quizzi' như trước.
import { currentAccount } from './account';

const BASE = 'quizzi';
const STORE = 'kv';
const conns = new Map<string, Promise<IDBDatabase>>();

/** Tên kho của tài khoản đang đăng nhập (tên đăng nhập viết thường, không dấu cách). */
export function dbName(username = currentAccount()?.username): string {
  const u = (username ?? '').trim().toLowerCase();
  return u ? `${BASE}:${u}` : BASE;
}

function open(name: string): Promise<IDBDatabase> {
  let p = conns.get(name);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { conns.delete(name); reject(req.error); };
    });
    conns.set(name, p);
  }
  return p;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await open(dbName());
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const kvGet = <T>(k: string) => tx<T | undefined>('readonly', (s) => s.get(k));
export const kvSet = (k: string, v: unknown) => tx<void>('readwrite', (s) => s.put(v, k));
export const kvDel = (k: string) => tx<void>('readwrite', (s) => s.delete(k));
export const kvKeys = () => tx<string[]>('readonly', (s) => s.getAllKeys());
