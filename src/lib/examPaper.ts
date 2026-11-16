// Đề thi: thời điểm kiểm tra, mã đề, gom đề theo Khối lớp › Môn › Thời điểm, bốc đề ngẫu nhiên, chia học sinh cho các đề.
// Cách chia học sinh dùng chung với Apps Script (apps-script/Code.gs, hàm pickPaper_).
import type { ExamPeriod, QuizSummary } from './types';

export const PERIODS: ExamPeriod[] = ['tx', 'gk1', 'ck1', 'gk2', 'ck2'];
export const PERIOD_LABEL: Record<ExamPeriod, string> = {
  tx: 'Kiểm tra thường xuyên',
  gk1: 'Kiểm tra giữa học kì I',
  ck1: 'Kiểm tra cuối học kì I',
  gk2: 'Kiểm tra giữa học kì II',
  ck2: 'Kiểm tra cuối học kì II',
};
/** Mã thời điểm dùng trong mã đề. */
export const PERIOD_CODE: Record<ExamPeriod, string> = { tx: 'TX', gk1: 'GK1', ck1: 'CK1', gk2: 'GK2', ck2: 'CK2' };

export const isPeriod = (v: unknown): v is ExamPeriod => typeof v === 'string' && (PERIODS as string[]).includes(v);

/** Viết tắt tên môn cho mã đề: "Tin học" → TIN, "Tiếng Việt" → TV, "Toán" → TOAN. */
export function subjectCode(subject: string | undefined): string {
  const plain = String(subject ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').trim();
  const known: Record<string, string> = { 'tin hoc': 'TIN', 'toan': 'TOAN', 'tieng viet': 'TV', 'tieng anh': 'TA', 'khoa hoc': 'KH', 'lich su va dia ly': 'LSDL', 'cong nghe': 'CN', 'dao duc': 'DD', 'ngu van': 'NV' };
  const k = known[plain.toLowerCase()];
  if (k) return k;
  const words = plain.split(/\s+/).filter(Boolean);
  if (!words.length) return 'DE';
  return (words.length === 1 ? words[0].slice(0, 4) : words.map((w) => w[0]).join('')).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DE';
}
const gradeNum = (grade: string | undefined) => (String(grade ?? '').match(/\d+/)?.[0] ?? '');

/** Gợi ý mã đề: TIN3-CK1-01 (môn + lớp, thời điểm, số thứ tự chưa dùng trong nhóm). */
export function suggestCode(subject: string | undefined, grade: string | undefined, period: ExamPeriod, used: string[] = []): string {
  const head = `${subjectCode(subject)}${gradeNum(grade)}-${PERIOD_CODE[period]}-`;
  const taken = new Set(used.map((c) => c.toUpperCase()));
  for (let n = 1; n < 1000; n++) {
    const code = head + String(n).padStart(2, '0');
    if (!taken.has(code)) return code;
  }
  return head + Date.now().toString(36).toUpperCase();
}

/** Năm học của một ngày: từ tháng 8 trở đi là năm học mới. VD 16/11/2026 → "2026–2027"; 3/2027 → "2026–2027". */
export function schoolYearOf(d: Date = new Date()): string {
  const y = d.getFullYear();
  const start = d.getMonth() >= 7 ? y : y - 1;
  return `${start}–${start + 1}`;
}
/** Vài năm học quanh năm học hiện tại, để chọn trong ô Năm học. */
export function schoolYearChoices(d: Date = new Date()): string[] {
  const cur = Number(schoolYearOf(d).slice(0, 4));
  return [cur - 1, cur, cur + 1].map((y) => `${y}–${y + 1}`);
}
/** Tên trường giáo viên nhập lần trước (nhớ trên máy này), để đề sau tự điền. */
const SCHOOL_KEY = 'quickplay.schoolName';
export function rememberedSchool(): string {
  try { return localStorage.getItem(SCHOOL_KEY) ?? ''; } catch { return ''; }
}
export function rememberSchool(v: string) {
  try { if (v.trim()) localStorage.setItem(SCHOOL_KEY, v.trim()); } catch { /* bỏ qua */ }
}

/** Tên đề thi mặc định: "Đề kiểm tra cuối học kì I – Tin học lớp 3 – Mã TIN3-CK1-01". */
export function paperTitle(subject: string | undefined, grade: string | undefined, period: ExamPeriod, code: string): string {
  const what = [subject, grade ? grade.replace(/^Lớp\s*/i, 'lớp ') : ''].filter(Boolean).join(' ');
  return [`Đề ${PERIOD_LABEL[period].replace(/^Kiểm tra/, 'kiểm tra')}`, what, code ? `Mã ${code}` : ''].filter(Boolean).join(' – ');
}

export interface PaperGroup { key: string; grade: string; subject: string; period: ExamPeriod; papers: QuizSummary[] }

/** Gom đề thi theo Khối lớp › Môn › Thời điểm (theo thứ tự khối lớp, môn, thời điểm trong năm học). */
export function groupPapers(list: QuizSummary[]): PaperGroup[] {
  const map = new Map<string, PaperGroup>();
  for (const q of list) {
    if (!isPeriod(q.paper_period)) continue;
    const grade = q.grade || 'Chưa xếp lớp';
    const subject = q.subject || 'Chưa có môn';
    const key = `${grade}|${subject}|${q.paper_period}`;
    const g = map.get(key) ?? { key, grade, subject, period: q.paper_period, papers: [] };
    g.papers.push(q);
    map.set(key, g);
  }
  const cmp = (a: string, b: string) => a.localeCompare(b, 'vi', { numeric: true });
  return [...map.values()]
    .map((g) => ({ ...g, papers: g.papers.sort((a, b) => cmp(a.paper_code ?? a.title, b.paper_code ?? b.title)) }))
    .sort((a, b) => cmp(a.grade, b.grade) || cmp(a.subject, b.subject) || PERIODS.indexOf(a.period) - PERIODS.indexOf(b.period));
}

/** Bốc ngẫu nhiên k đề trong danh sách (không lặp). */
export function drawPapers<T>(list: T[], k: number, rnd: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(1, Math.min(k, a.length)));
}

/**
 * Chia học sinh cho các đề: em mới vào nhận đề đang có ít em nhất; nhiều đề bằng nhau thì bốc ngẫu nhiên trong số đó.
 * Nhờ vậy số em mỗi đề luôn lệch nhau nhiều nhất 1, và em ngồi cạnh nhau khó biết bạn làm đề nào.
 */
export function pickPaper(counts: number[], rnd: () => number = Math.random): number {
  if (counts.length <= 1) return 0;
  const min = Math.min(...counts);
  const ties = counts.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
  return ties[Math.floor(rnd() * ties.length)] ?? 0;
}
