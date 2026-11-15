// Kho khóa–giá trị tối giản trên IndexedDB (dung lượng lớn hơn localStorage, chứa được ảnh dạng data URL).
const DB = 'quizzi';
const STORE = 'kv';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp)
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
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
