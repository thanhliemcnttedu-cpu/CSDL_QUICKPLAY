// Tải đề nhanh cho học sinh:
// - "boot": máy chủ (Apps Script 1.5.8) gửi kèm đề + cài đặt + tiến độ ngay trong lần vào phòng,
//   màn làm bài dùng luôn, không phải gọi thêm getSessionQuiz và getProgress.
// - "snap": ảnh chụp đề lưu trong thẻ trình duyệt (sessionStorage); tải lại trang thì đề hiện ngay,
//   chỉ còn hỏi tiến độ. Ảnh chụp đề của một phòng không đổi trong suốt buổi nên dùng lại được.
import type { AnswerRecord, Quiz, SessionPaper, SessionSettings } from './types';

export interface Progress { current_index: number; draft: unknown; answers: AnswerRecord[] }
export interface SessionQuiz { quiz: Quiz; settings: SessionSettings; state: string; paper?: SessionPaper }
export interface Boot extends SessionQuiz { progress?: Progress }

const mem = new Map<string, Boot>();
const snapKey = (pin: string, pid: string) => `quizzi.snap.${pin}.${pid}`;

/** Ghi nhớ dữ liệu khởi động vừa nhận khi vào phòng (dùng một lần ở màn làm bài). */
export function putBoot(pin: string, pid: string, b: Boot) {
  mem.set(pin + ':' + pid, b);
  saveSnap(pin, pid, b);
}

/**
 * Lấy dữ liệu khởi động. Tiến độ chỉ đúng ở thời điểm vừa vào phòng, nên chỉ dùng được trong vài giây đầu
 * (màn làm bài có thể dựng hai lần liền nhau, ví dụ chế độ kiểm tra của React khi phát triển), sau đó tự bỏ.
 */
export function takeBoot(pin: string, pid: string): Boot | undefined {
  const k = pin + ':' + pid;
  const b = mem.get(k);
  if (b) window.setTimeout(() => { if (mem.get(k) === b) mem.delete(k); }, 5000);
  return b;
}

export function saveSnap(pin: string, pid: string, s: SessionQuiz) {
  try {
    sessionStorage.setItem(snapKey(pin, pid), JSON.stringify({ quiz: s.quiz, settings: s.settings, state: s.state, paper: s.paper }));
  } catch {
    /* thẻ trình duyệt hết chỗ hoặc chặn bộ nhớ: lần sau tải đề từ máy chủ */
  }
}

export function readSnap(pin: string, pid: string): SessionQuiz | null {
  try {
    const raw = sessionStorage.getItem(snapKey(pin, pid));
    const s = raw ? (JSON.parse(raw) as SessionQuiz) : null;
    return s && s.quiz && Array.isArray(s.quiz.questions) && s.settings ? s : null;
  } catch {
    return null;
  }
}
