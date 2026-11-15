// Nhịp hỏi máy chủ thông minh (thay cho setInterval cố định).
// Mục tiêu: một lớp 40–50 máy cùng vào không dội quá nhiều lượt gọi lên Apps Script.
// - Lượt sau chỉ bắt đầu khi lượt trước đã xong (không chồng lượt khi mạng chậm).
// - Khoảng nghỉ do nơi gọi quyết định theo tình huống (đang chờ giáo viên: nhanh; đang tự làm bài: thưa).
// - Lệch ngẫu nhiên ±15% để các máy không hỏi cùng một tích tắc.
// - Lỗi mạng thì giãn dần (gấp đôi mỗi lần, tối đa 30 giây); thẻ trình duyệt bị ẩn thì hỏi thưa.
// - Mở lại thẻ hoặc có mạng lại thì hỏi ngay.

export const HIDDEN_MIN_MS = 10000;
export const MAX_DELAY_MS = 30000;

/** Khoảng nghỉ thực tế trước lượt hỏi kế tiếp (tách riêng để kiểm thử). */
export function nextDelay(base: number, fails: number, hidden: boolean, rand = Math.random()): number {
  let d = Math.min(MAX_DELAY_MS, Math.max(500, base) * 2 ** Math.min(fails, 4));
  if (hidden) d = Math.max(d, HIDDEN_MIN_MS);
  return Math.round(d * (0.85 + rand * 0.3));
}

/**
 * Bắt đầu hỏi định kỳ. `run` trả về false (hoặc ném lỗi) khi thất bại. Trả về hàm dừng.
 * `delay` được gọi lại trước mỗi lượt nên nhịp tự đổi theo trạng thái hiện tại.
 */
export function startPolling(run: () => Promise<boolean | void>, delay: () => number): () => void {
  let stopped = false;
  let running = false;
  let fails = 0;
  let timer: number | undefined;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    let ok = true;
    try {
      ok = (await run()) !== false;
    } catch {
      ok = false;
    }
    running = false;
    fails = ok ? 0 : fails + 1;
    if (!stopped) timer = window.setTimeout(tick, nextDelay(delay(), fails, document.hidden));
  };
  const wake = () => {
    if (stopped || running || document.hidden) return;
    clearTimeout(timer);
    tick();
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', wake);
  };
}
