// Sao lưu và khôi phục toàn bộ dữ liệu soạn bài của một giáo viên thành MỘT tệp .json:
// bộ câu hỏi, danh mục môn học – chương – bài, danh sách lớp. Dùng để cất dự phòng, chép sang USB, hoặc chuyển giữa
// "Chỉ máy này" và Google Drive. Kết quả các buổi đã tổ chức không nằm trong tệp này (xuất riêng bằng Excel/PDF).
import { api } from './api';
import type { Catalog, ClassRoom, Quiz } from './types';

export interface BackupFile {
  app: 'Quickplay';
  kind: 'backup';
  version: 1;
  exported_at: string;
  quizzes: Quiz[];
  catalog: Catalog | null;
  classes: ClassRoom[];
}

export async function exportAll(onProgress?: (done: number, total: number) => void): Promise<BackupFile> {
  const list = await api.listQuizzes();
  const quizzes: Quiz[] = [];
  for (let i = 0; i < list.length; i++) {
    quizzes.push(await api.getQuiz(list[i].id));
    onProgress?.(i + 1, list.length);
  }
  const [catalog, classes] = await Promise.all([api.getCatalog().catch(() => null), api.listClasses().catch(() => [] as ClassRoom[])]);
  return { app: 'Quickplay', kind: 'backup', version: 1, exported_at: new Date().toISOString(), quizzes, catalog, classes };
}

/** Đọc và kiểm tra tệp sao lưu. Chấp nhận cả tệp một bộ câu hỏi lẻ (nút "Lưu về máy" ở thư viện). */
export function parseBackup(text: string): BackupFile {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('Tệp này không phải tệp .json hợp lệ.');
  }
  const o = d as Partial<BackupFile> & Partial<Quiz>;
  if (o && o.kind === 'backup' && Array.isArray(o.quizzes)) {
    return {
      app: 'Quickplay', kind: 'backup', version: 1, exported_at: String(o.exported_at ?? ''),
      quizzes: o.quizzes.filter((q) => q && typeof q.id === 'string' && Array.isArray(q.questions)),
      catalog: o.catalog && Array.isArray((o.catalog as Catalog).subjects) ? (o.catalog as Catalog) : null,
      classes: Array.isArray(o.classes) ? o.classes.filter((c) => c && typeof c.name === 'string' && Array.isArray(c.students)) : [],
    };
  }
  if (o && typeof o.id === 'string' && Array.isArray(o.questions)) {
    return { app: 'Quickplay', kind: 'backup', version: 1, exported_at: '', quizzes: [o as Quiz], catalog: null, classes: [] };
  }
  throw new Error('Tệp này không phải tệp sao lưu của Quickplay.');
}

/** Ghi dữ liệu trong tệp sao lưu vào nơi lưu đang dùng. Bộ câu hỏi trùng mã sẽ được ghi đè bằng bản trong tệp. */
export async function importAll(b: BackupFile, onProgress?: (done: number, total: number) => void): Promise<{ quizzes: number; classes: number; catalog: boolean }> {
  const total = b.quizzes.length + b.classes.length + (b.catalog ? 1 : 0);
  let done = 0;
  const tick = () => onProgress?.(++done, total);
  if (b.catalog) {
    await api.saveCatalog(b.catalog);
    tick();
  }
  for (const q of b.quizzes) {
    await api.saveQuiz(q);
    tick();
  }
  // lớp trùng tên thì ghi đè lớp cũ thay vì tạo thêm lớp thứ hai
  const existing = b.classes.length ? await api.listClasses().catch(() => [] as ClassRoom[]) : [];
  for (const c of b.classes) {
    const same = existing.find((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
    await api.saveClass({ id: same?.id, name: c.name, students: c.students });
    tick();
  }
  return { quizzes: b.quizzes.length, classes: b.classes.length, catalog: !!b.catalog };
}
