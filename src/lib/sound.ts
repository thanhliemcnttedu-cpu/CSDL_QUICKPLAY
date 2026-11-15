// Âm thanh tổng hợp bằng WebAudio – không dùng tệp nhạc ngoài (không lo bản quyền, chạy offline).
// Nguyên tắc: âm ngắn (< 0,8 giây), âm lượng nhỏ, chỉ phát khi có sự kiện ý nghĩa; học sinh tắt được.
let ctx: AudioContext | null = null;
const ac = () => (ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)());

const KEY = 'quizzi.sound';
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();
const listeners = new Set<(on: boolean) => void>();

export const soundOn = () => enabled;
export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch { /* bỏ qua */ }
  listeners.forEach((f) => f(on));
}
export const onSoundChange = (f: (on: boolean) => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, slideTo?: number) {
  const c = ac();
  if (c.state === 'suspended') c.resume().catch(() => {});
  const o = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime + start;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const play = (fn: () => void) => () => {
  if (!enabled) return;
  try {
    fn();
  } catch { /* trình duyệt chặn âm thanh – bỏ qua */ }
};

export const sfx = {
  /** Trả lời đúng: ba nốt đi lên vui tai */
  correct: play(() => [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.22, 'triangle'))),
  /** Trả lời chưa đúng: tiếng "bùm bụp" nhẹ, không gây sợ */
  wrong: play(() => {
    tone(330, 0, 0.18, 'triangle', 0.1, 220);
    tone(247, 0.14, 0.26, 'triangle', 0.08, 165);
  }),
  /** Chuỗi trả lời đúng liên tiếp (≥3): lấp lánh */
  combo: play(() => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25 + i * 0.06, 0.16, 'sine', 0.07))),
  /** Câu hỏi mới xuất hiện: tiếng "vút" */
  whoosh: play(() => tone(260, 0, 0.22, 'sine', 0.06, 780)),
  /** Chạm chọn (thẻ, ô, nhân vật): "pốp" nhỏ */
  pop: play(() => tone(660, 0, 0.07, 'sine', 0.07, 990)),
  /** Đếm ngược 3-2-1 */
  tick: play(() => tone(880, 0, 0.06, 'square', 0.04)),
  /** 5 giây cuối: tích tắc nhẹ */
  hurry: play(() => tone(1200, 0, 0.04, 'sine', 0.035)),
  /** Vào phòng thành công */
  join: play(() => [392, 523, 659].forEach((f, i) => tone(f, i * 0.07, 0.18, 'sine', 0.08))),
  /** Hoàn thành bài: kèn chiến thắng ngắn */
  fanfare: play(() => {
    [523, 523, 523, 659, 784].forEach((f, i) => tone(f, [0, 0.12, 0.24, 0.36, 0.52][i], i === 4 ? 0.5 : 0.11, 'triangle', 0.1));
    tone(1047, 0.52, 0.5, 'sine', 0.05);
  }),
  /** Cả lớp trả lời xong, hiện kết quả: giai điệu chúc mừng vui nhộn (kèn đi lên + lấp lánh + nốt kết) */
  cheer: play(() => {
    [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, i === 6 ? 0.55 : 0.13, 'triangle', 0.11));
    [1319, 1568, 2093, 1568, 2093].forEach((f, i) => tone(f, 0.8 + i * 0.07, 0.14, 'sine', 0.06));
    [523, 659, 784].forEach((f) => tone(f, 1.2, 0.7, 'sine', 0.05)); // hợp âm kết
  }),
  /** Cảnh báo vi phạm: hai nốt báo động ngắn */
  warn: play(() => {
    tone(880, 0, 0.14, 'square', 0.05);
    tone(660, 0.16, 0.18, 'square', 0.05);
  }),
  /** Bị khóa lượt chơi */
  lock: play(() => tone(300, 0, 0.5, 'sawtooth', 0.05, 120)),
};

/** Nhạc nền vui nhộn lặp lại cho phòng chờ / màn giáo viên. */
export function startMusic(): () => void {
  let stopped = false;
  const melody = [262, 330, 392, 330, 349, 440, 523, 440, 392, 330, 294, 330, 262, 294, 330, 392];
  const bass = [131, 131, 175, 175, 196, 196, 131, 131];
  let step = 0;
  const id = window.setInterval(() => {
    if (stopped) return;
    try {
      tone(melody[step % melody.length], 0, 0.22, 'triangle', 0.05);
      if (step % 2 === 0) tone(bass[(step / 2) % bass.length], 0, 0.4, 'sine', 0.06);
    } catch { /* bỏ qua */ }
    step++;
  }, 260);
  return () => {
    stopped = true;
    clearInterval(id);
  };
}
