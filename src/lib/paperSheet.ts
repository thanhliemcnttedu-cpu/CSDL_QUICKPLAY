// "Đề giấy": các phép tính cho tờ bài kiểm tra trên màn hình học sinh
// (chia phần theo dạng câu, điểm từng câu thang 10, ngày tháng kiểu Việt Nam, tiêu đề kì kiểm tra, lời phê tự động).
import type { ExamPeriod, Question, QuestionType } from './types';
import type { Level } from './cheer';
import { schoolYearOf } from './examPaper';

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Tên phần và lời hướng dẫn theo dạng câu (giọng đề kiểm tra trên lớp). */
export const SECTION_OF: Record<QuestionType, { title: string; hint: string }> = {
  single_choice: { title: 'Trắc nghiệm nhiều lựa chọn', hint: 'Chọn chữ cái đặt trước câu trả lời đúng. Mỗi câu chỉ chọn một phương án.' },
  multiple_select: { title: 'Trắc nghiệm nhiều đáp án', hint: 'Chọn tất cả các phương án đúng rồi bấm Gửi đáp án.' },
  true_false: { title: 'Đúng hay Sai', hint: 'Đọc kĩ rồi chọn Đúng hoặc Sai cho mỗi câu.' },
  fill_blank: { title: 'Điền vào chỗ trống', hint: 'Điền từ hoặc số thích hợp vào chỗ trống.' },
  drag_drop: { title: 'Kéo thả vào chỗ trống', hint: 'Kéo các thẻ vào đúng chỗ trống.' },
  reorder: { title: 'Sắp xếp theo thứ tự', hint: 'Sắp xếp các mục theo đúng thứ tự.' },
  matching: { title: 'Nối cột', hint: 'Nối mỗi ô ở cột A với ô phù hợp ở cột B.' },
  oral: { title: 'Trả lời miệng', hint: 'Ghi âm câu trả lời của em; thầy cô sẽ chấm sau.' },
};

export interface SheetSection { type: QuestionType; title: string; hint: string; items: number[] }

/**
 * Chia các câu (theo thứ tự hiển thị của em) thành từng phần theo dạng câu, giữ thứ tự xuất hiện đầu tiên của mỗi dạng.
 * items là vị trí câu trong danh sách `order` (dùng để gửi đáp án và tô bảng số câu).
 */
export function sectionsOf(order: Question[]): SheetSection[] {
  const map = new Map<QuestionType, SheetSection>();
  order.forEach((q, i) => {
    const t = q.type;
    if (!map.has(t)) map.set(t, { type: t, ...SECTION_OF[t], items: [] });
    map.get(t)!.items.push(i);
  });
  return [...map.values()];
}

/** Số thứ tự câu in trên tờ đề (theo thứ tự các phần), theo vị trí câu trong `order`. */
export function sheetNumbers(sections: SheetSection[]): Map<number, number> {
  const m = new Map<number, number>();
  let n = 0;
  for (const s of sections) for (const i of s.items) m.set(i, ++n);
  return m;
}

/** Mỗi câu bằng điểm nhau trên thang 10 (khớp cách tính điểm thang 10 của bài kiểm tra). */
export const pointEach = (total: number) => (total > 0 ? 10 / total : 0);

/** Số điểm viết kiểu Việt Nam, tối đa 2 chữ số thập phân: 0,25 · 2,5 · 3,33. */
export const fmtPoint = (x: number) => (Math.round(x * 100) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** "Thứ Hai ngày 16 tháng 11 năm 2026" */
export function vnDate(d: Date): string {
  return `${WEEKDAY[d.getDay()]} ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
}

const PERIOD_TITLE: Record<ExamPeriod, string> = {
  tx: 'Đề kiểm tra thường xuyên',
  gk1: 'Đề kiểm tra giữa kì I',
  ck1: 'Đề kiểm tra cuối kì I',
  gk2: 'Đề kiểm tra giữa kì II',
  ck2: 'Đề kiểm tra cuối kì II',
};
/** Tiêu đề in hoa ở đầu đề. Bộ đề không gắn thời điểm kiểm tra → "Bài kiểm tra". */
export const sheetTitle = (period: ExamPeriod | undefined) => (period ? PERIOD_TITLE[period] : 'Bài kiểm tra');

/** Năm học in ở đầu đề: lấy theo đề thi, không có thì tính theo ngày làm bài. */
export const sheetYear = (year: string | undefined, d: Date) => (year && year.trim()) || schoolYearOf(d);

/** "Môn: Toán – Lớp 5" (bỏ phần trống). */
export function subjectLine(subject: string | undefined, grade: string | undefined): string {
  const parts = [subject?.trim(), grade?.trim()].filter(Boolean);
  return parts.length ? `Môn: ${parts.join(' – ')}` : '';
}

/** Lời phê tự động theo mức đánh giá (thầy cô có thể nhận xét thêm khi xem bài). */
export function autoComment(level: Level, pending: boolean): string {
  const base: Record<Level, string> = {
    excellent: 'Em làm bài rất tốt! Tiếp tục phát huy nhé.',
    good: 'Em làm bài tốt. Cố gắng thêm một chút nữa nhé!',
    pass: 'Em đã hoàn thành bài. Em xem lại các câu chưa đúng nhé.',
    effort: 'Em cần ôn luyện thêm. Thầy cô tin em sẽ tiến bộ!',
  };
  return base[level] + (pending ? ' Phần trả lời miệng đang chờ thầy cô chấm.' : '');
}
