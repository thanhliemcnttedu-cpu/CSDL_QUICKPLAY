// Chia sẻ bộ đề và câu hỏi giữa các giáo viên bằng MỘT tệp .json.
// Phần mềm không cho giáo viên xem dữ liệu của nhau: giáo viên A xuất tệp rồi gửi cho giáo viên B,
// B nhập tệp vào lớp và môn của mình. Tệp chỉ chứa nội dung đề (tên, câu hỏi, ảnh/âm thanh kèm theo),
// không chứa mã id, người sở hữu, mật khẩu hay kết quả học sinh.
import { api, call } from './api';
import { mediaIdsIn, replaceMediaLinks, type MediaEntry } from './backup';
import { addChapter, addLesson, addSubject, findNode, subjectsOfGrade, type Placement } from './catalog';
import { loadSettings } from './settings';
import type { Catalog, Question, Quiz } from './types';
import { uid } from './util';

export const SHARE_KIND = 'share';

/** Một bộ đề trong tệp chia sẻ. Vị trí (môn, chương, bài) ghi bằng TÊN, không dùng id của máy gốc. */
export interface ShareQuiz {
  title: string;
  description?: string;
  cover_url?: string;
  /** Lớp và môn của bộ đề gốc (chỉ để tham khảo, khi nhập dùng lớp và môn người nhập chọn) */
  grade: string;
  subject: string;
  chapter: string;
  lesson: string;
  questions: Question[];
}

export interface ShareFile {
  app: 'Quickplay';
  kind: 'share';
  version: 1;
  exported_at: string;
  title: string;
  quizzes: ShareQuiz[];
  /** Ảnh và âm thanh trong câu hỏi, khóa là mã tệp trên Drive gốc */
  media?: Record<string, MediaEntry>;
  media_missing?: string[];
}

/** Một bộ đề được chọn để xuất; questionIds bỏ trống = lấy tất cả câu */
export interface ShareSelection { quiz: Quiz; questionIds?: string[] }

const same = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi') === b.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const isOldServer = (e: unknown) => /không hợp lệ|Hành động|Unknown action/i.test((e as Error).message);

/** Tên môn, lớp, chương, bài của một bộ đề theo danh mục hiện tại. */
export function namesOf(cat: Catalog, quiz: Pick<Quiz, 'subject_id' | 'chapter_id' | 'lesson_id' | 'subject' | 'grade'>) {
  const subj = quiz.subject_id ? findNode(cat, quiz.subject_id) : null;
  const ch = quiz.chapter_id ? findNode(cat, quiz.chapter_id) : null;
  const ls = quiz.lesson_id ? findNode(cat, quiz.lesson_id) : null;
  return {
    subject: subj?.subject.name ?? quiz.subject ?? '',
    grade: subj?.subject.grade ?? quiz.grade ?? '',
    chapter: ch?.chapter?.name ?? '',
    lesson: ls?.lesson?.name ?? '',
  };
}

/** Tạo nội dung tệp chia sẻ. Ảnh và âm thanh chỉ được đóng gói khi máy chủ Drive (không phải máy chủ thử cục bộ) hỗ trợ. */
export async function buildShare(sel: ShareSelection[], cat: Catalog, title: string, o: { media?: boolean; onProgress?: (text: string, pct?: number) => void } = {}): Promise<ShareFile> {
  const say = o.onProgress ?? (() => {});
  const quizzes: ShareQuiz[] = sel
    .map(({ quiz, questionIds }) => {
      const n = namesOf(cat, quiz);
      const questions = questionIds ? quiz.questions.filter((q) => questionIds.includes(q.id)) : quiz.questions;
      return { title: quiz.title, description: quiz.description, cover_url: quiz.cover_url, grade: n.grade, subject: n.subject, chapter: n.chapter, lesson: n.lesson, questions };
    })
    .filter((q) => q.questions.length > 0);
  if (!quizzes.length) throw new Error('Hãy chọn ít nhất một câu hỏi.');

  const media: Record<string, MediaEntry> = {};
  const missing: string[] = [];
  if (o.media !== false && loadSettings().backend === 'drive') {
    const ids = mediaIdsIn(JSON.stringify(quizzes));
    let queue = ids.slice();
    let done = 0;
    let oldServer = false;
    while (queue.length && !oldServer) {
      const batch = queue.slice(0, 20);
      queue = queue.slice(20);
      try {
        const r = await call<{ id: string; mime?: string; name?: string; base64?: string; later?: boolean; missing?: boolean }[]>('exportMedia', { ids: batch });
        for (const m of r) {
          if (m.later) queue.push(m.id);
          else if (m.base64 && m.mime) { media[m.id] = { mime: m.mime, data: m.base64, name: m.name }; done++; }
          else { missing.push(m.id); done++; }
        }
      } catch (e) {
        if (isOldServer(e)) oldServer = true;
        else throw e;
      }
      say(`Đang đóng gói ảnh, âm thanh ${done}/${ids.length}…`, Math.round((90 * done) / Math.max(1, ids.length)));
    }
    if (oldServer) missing.push(...queue);
  }
  return {
    app: 'Quickplay', kind: SHARE_KIND, version: 1, exported_at: new Date().toISOString(), title,
    quizzes,
    media: Object.keys(media).length ? media : undefined,
    media_missing: missing.length ? missing : undefined,
  };
}

export function shareFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `quickplay-chia-se_${p(d.getDate())}_${p(d.getMonth() + 1)}_${d.getFullYear()}_${p(d.getHours())}h${p(d.getMinutes())}.json`;
}

/** Đọc và kiểm tra tệp chia sẻ. Ném lỗi bằng tiếng Việt nếu không phải tệp chia sẻ của Quickplay. */
export function parseShare(text: string): ShareFile {
  let d: Partial<ShareFile>;
  try { d = JSON.parse(text); } catch { throw new Error('Tệp này không phải tệp .json hợp lệ.'); }
  if (!d || d.app !== 'Quickplay' || d.kind !== SHARE_KIND || d.version !== 1) throw new Error('Tệp này không phải tệp chia sẻ bộ đề của Quickplay.');
  if (!Array.isArray(d.quizzes) || !d.quizzes.length) throw new Error('Tệp chia sẻ không có bộ đề nào.');
  for (const q of d.quizzes) {
    if (!q || typeof q.title !== 'string' || !Array.isArray(q.questions)) throw new Error('Tệp chia sẻ có bộ đề không đúng định dạng.');
  }
  return d as ShareFile;
}

/**
 * Đặt các bộ đề vào một lớp và một môn do người nhập chọn. Môn, chương, bài còn thiếu được tạo mới.
 * Tên chương hoặc bài trống trong tệp thì bộ đề chỉ được xếp tới cấp trên của nó.
 */
export function placeShare(cat: Catalog, quizzes: Pick<ShareQuiz, 'chapter' | 'lesson'>[], grade: string, subjectName: string): { catalog: Catalog; placements: Placement[] } {
  const g = grade.trim().replace(/\s+/g, ' ');
  const sname = subjectName.trim().replace(/\s+/g, ' ');
  if (!g) throw new Error('Hãy chọn lớp để nhập bộ đề.');
  if (!sname) throw new Error('Hãy nhập môn học để nhập bộ đề.');
  let c = cat;
  let sid = subjectsOfGrade(c, g).find((s) => same(s.name, sname))?.id;
  if (!sid) {
    const r = addSubject(c, sname, g);
    c = r.catalog;
    sid = r.id;
  }
  const placements: Placement[] = quizzes.map((q) => {
    const pl: Placement = { subject_id: sid };
    const chapterName = q.chapter.trim().replace(/\s+/g, ' ');
    if (!chapterName) return pl;
    let chapter = c.subjects.find((s) => s.id === sid)!.chapters.find((ch) => same(ch.name, chapterName));
    if (!chapter) {
      const r = addChapter(c, sid!, chapterName);
      c = r.catalog;
      chapter = findNode(c, r.id)!.chapter!;
    }
    pl.chapter_id = chapter.id;
    const lessonName = q.lesson.trim().replace(/\s+/g, ' ');
    if (!lessonName) return pl;
    let lesson = chapter.lessons.find((l) => same(l.name, lessonName));
    if (!lesson) {
      const r = addLesson(c, chapter.id, lessonName);
      c = r.catalog;
      lesson = findNode(c, r.id)!.lesson!;
    }
    pl.lesson_id = lesson.id;
    return pl;
  });
  return { catalog: c, placements };
}

/** Gắn nhãn môn và bài mới cho một câu hỏi (dùng khi nhập hoặc chuyển câu sang vị trí khác). */
export function withPlace(q: Question, subject: string, lesson: string): Question {
  const l = lesson.trim().replace(/\s+/g, ' ');
  const out: Question = { ...q, subject };
  if (l) out.lesson = l;
  else delete out.lesson;
  return out;
}

/** Nhập tệp chia sẻ vào tài khoản hiện tại: tải ảnh/âm thanh lên, tạo bộ đề mới và cập nhật danh mục. */
export async function importShare(file: ShareFile, grade: string, subjectName: string, o: { onProgress?: (text: string, pct?: number) => void } = {}): Promise<string[]> {
  const say = o.onProgress ?? (() => {});
  const cur = (await api.getCatalog().catch(() => null)) ?? { subjects: [] };
  const { catalog, placements } = placeShare(cur, file.quizzes, grade, subjectName);
  const g = grade.trim().replace(/\s+/g, ' ');
  const sname = subjectName.trim().replace(/\s+/g, ' ');

  // ảnh và âm thanh: tải lên tài khoản này, rồi đổi link trong câu hỏi
  const urlOf: Record<string, string> = {};
  const entries = Object.entries(file.media ?? {});
  for (let i = 0; i < entries.length; i++) {
    const [id, m] = entries[i];
    const r = await api.uploadMedia(m.name || id, m.mime, m.data);
    urlOf[id] = r.url;
    say(`Đang tải ảnh, âm thanh ${i + 1}/${entries.length}…`, Math.round((60 * (i + 1)) / entries.length));
  }

  await api.saveCatalog(catalog);
  const now = new Date().toISOString();
  const ids: string[] = [];
  for (let i = 0; i < file.quizzes.length; i++) {
    const sq = file.quizzes[i];
    const pl = placements[i];
    const body = replaceMediaLinks(JSON.stringify({ description: sq.description, cover_url: sq.cover_url, questions: sq.questions }), urlOf);
    const parsed = JSON.parse(body) as { description?: string; cover_url?: string; questions: Question[] };
    const quiz: Quiz = {
      id: uid('quiz_'),
      title: sq.title,
      subject: sname,
      grade: g,
      subject_id: pl.subject_id,
      chapter_id: pl.chapter_id,
      lesson_id: pl.lesson_id,
      description: parsed.description,
      cover_url: parsed.cover_url,
      // nhãn môn, bài trên từng câu theo vị trí mới (câu không còn mang nhãn của máy gốc)
      questions: parsed.questions.map((x) => withPlace(x, sname, sq.lesson)),
      visibility: 'private',
      created_at: now,
      updated_at: now,
    };
    await api.saveQuiz(quiz);
    ids.push(quiz.id);
    say(`Đã nhập ${i + 1}/${file.quizzes.length} bộ đề…`, 60 + Math.round((40 * (i + 1)) / file.quizzes.length));
  }
  return ids;
}
