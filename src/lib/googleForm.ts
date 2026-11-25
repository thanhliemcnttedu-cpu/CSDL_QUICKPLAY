// Nhập bộ câu hỏi từ Google Form. Apps Script đọc form (FormApp) hoặc trang công khai rồi trả dữ liệu trung gian;
// tệp này chuyển dữ liệu đó thành câu hỏi của Quickplay.
import type { Question } from './types';
import { newQuestion, opt } from './factory';
import { escapeHtml } from './util';

export interface FormItem {
  kind: 'choice' | 'checkbox' | 'text' | 'paragraph';
  title: string;
  help?: string;
  options?: { text: string; correct?: boolean }[];
  answers?: string[]; // đáp án chữ (nếu có)
  points?: number;
}
/** Dữ liệu Apps Script trả về: `items` khi đọc bằng FormApp, `raw` (chuỗi FB_PUBLIC_LOAD_DATA_) khi đọc trang công khai. */
export interface FormData {
  title: string;
  source: 'editor' | 'public';
  is_quiz?: boolean;
  items?: FormItem[];
  raw?: string;
}

export const isGoogleFormUrl = (url: string) => /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)\S+$/i.test(url.trim());

/** Link làm bài (…/forms/d/e/…/viewform hoặc forms.gle): không chứa đáp án đúng, phải dùng link chỉnh sửa (…/forms/d/…/edit). */
export const isPublishedFormUrl = (url: string) => /docs\.google\.com\/forms\/d\/e\//i.test(url.trim()) || /forms\.gle\//i.test(url.trim());

/** Phân tích biến FB_PUBLIC_LOAD_DATA_ của trang form công khai (không có đáp án đúng). */
export function parsePublicForm(raw: string): { title: string; items: FormItem[] } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Không đọc được dữ liệu của Google Form này.');
  }
  const d = data as unknown[];
  const meta = (d?.[1] ?? []) as unknown[];
  const list = (Array.isArray(meta[1]) ? meta[1] : []) as unknown[][];
  const title = String(d?.[3] || meta[8] || '').trim();
  const KIND: Record<number, FormItem['kind']> = { 0: 'text', 1: 'paragraph', 2: 'choice', 3: 'choice', 4: 'checkbox' };
  const items: FormItem[] = [];
  for (const it of list) {
    const kind = KIND[Number(it?.[3])];
    const text = String(it?.[1] ?? '').trim();
    if (!kind || !text) continue; // tiêu đề phần, ảnh, lưới, thang điểm… không chuyển được
    const entry = (Array.isArray(it[4]) ? it[4][0] : null) as unknown[] | null;
    const opts = (entry && Array.isArray(entry[1]) ? entry[1] : []) as unknown[][];
    items.push({
      kind,
      title: text,
      help: it[2] ? String(it[2]) : undefined,
      options: kind === 'choice' || kind === 'checkbox' ? opts.map((o) => ({ text: String(o?.[0] ?? '').trim() })).filter((o) => o.text) : undefined,
    });
  }
  return { title, items };
}

export function formToQuestions(form: FormData): { title: string; questions: Question[]; warnings: string[] } {
  const parsed = form.items ? { title: form.title, items: form.items } : parsePublicForm(form.raw ?? '');
  const warnings: string[] = [];
  if (form.source === 'public') warnings.push('Form được đọc từ trang công khai nên không có đáp án đúng. Mở form bằng link chỉnh sửa (…/edit) của chính thầy cô để lấy kèm đáp án.');
  const maxPts = Math.max(0, ...parsed.items.map((i) => i.points ?? 0));
  const questions: Question[] = [];
  parsed.items.forEach((it, i) => {
    const n = i + 1;
    const stem = escapeHtml(it.title) + (it.help ? `<br>${escapeHtml(it.help)}` : '');
    let q: Question;
    if (it.kind === 'choice' || it.kind === 'checkbox') {
      const all = (it.options ?? []).filter((o) => o.text);
      if (all.length < 2) {
        warnings.push(`Câu ${n}: có ít hơn 2 phương án, đã bỏ qua.`);
        return;
      }
      if (all.length > 6) warnings.push(`Câu ${n}: có hơn 6 phương án, đã giữ 6 phương án đầu.`);
      const opts = all.slice(0, 6);
      const nCorrect = opts.filter((o) => o.correct).length;
      const isTF = opts.length === 2 && opts.every((o) => /^(đúng|sai|true|false)$/i.test(o.text));
      q = newQuestion(isTF ? 'true_false' : it.kind === 'checkbox' || nCorrect > 1 ? 'multiple_select' : 'single_choice');
      q.options = opts.map((o) => opt(o.text, { is_correct: !!o.correct }));
      if (!nCorrect) {
        q.needs_review = true;
        warnings.push(`Câu ${n}: chưa có đáp án đúng.`);
      }
    } else {
      const answers = (it.answers ?? []).map((a) => a.trim()).filter(Boolean);
      const blankTag = /\[(điền chỗ trống|kéo thả[^\]]*|điền từ[^\]]*)\]/i.test(it.title);
      if (answers.length && blankTag) {
        // Câu kéo thả / điền chỗ trống theo nhãn trong tiêu đề: "[Ngân hàng từ: a | b | c]" là kho từ
        const bankRaw = it.title.match(/\[ngân hàng từ:\s*([^\]]+)\]/i)?.[1] ?? '';
        const bank = bankRaw.split('|').map((x) => x.trim()).filter(Boolean);
        const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
        const ansSet = new Set(answers.map(norm));
        const distractors = bank.filter((w) => !ansSet.has(norm(w)));
        let body = it.title.replace(/\[ngân hàng từ:[^\]]*\]/i, '').replace(/\[[^\]]*\]\s*:?\s*/g, '').trim();
        body = /_{3,}/.test(body) ? body.replace(/_{3,}/, '[blank_1]') : `${body} [blank_1]`;
        const bodyStem = escapeHtml(body).replace(/\[blank_1\]/g, '[blank_1]') + (it.help ? `<br>${escapeHtml(it.help)}` : '');
        q = newQuestion('fill_blank');
        q.stem.text = bodyStem;
        q.blanks = [{ blank_id: 'blank_1', accepted: answers, match_rule: 'ignore_case' }];
        if (distractors.length) {
          q.distractors = distractors;
          q.fill_mode = 'bank';
        }
        questions.push(withPoints(q, it.points, maxPts));
        return;
      }
      if (answers.length) {
        q = newQuestion('fill_blank');
        q.stem.text = `${stem} [blank_1]`;
        q.blanks = [{ blank_id: 'blank_1', accepted: answers, match_rule: 'ignore_case' }];
        questions.push(withPoints(q, it.points, maxPts));
        return;
      }
      if (blankTag) warnings.push(`Câu ${n}: có nhãn dạng điền/kéo thả nhưng không đọc được đáp án. Hãy kiểm tra đáp án trong Google Form hoặc chỉnh lại dạng câu.`);
      q = newQuestion('oral'); // trả lời ngắn / đoạn văn không có đáp án → giáo viên chấm
    }
    q.stem.text = stem;
    questions.push(withPoints(q, it.points, maxPts));
  });
  return { title: parsed.title, questions, warnings };
}

/** Điểm trong Google Form thường nhỏ (1, 2, 5…): quy đổi để câu cao điểm nhất được 1000. */
function withPoints(q: Question, pts: number | undefined, max: number): Question {
  if (pts && max > 0) q.points = Math.max(100, Math.round(((pts / max) * 1000) / 50) * 50);
  return q;
}
