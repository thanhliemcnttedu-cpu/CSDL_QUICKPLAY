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

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, slideTo?: number, dest?: AudioNode, at?: number) {
  const c = ac();
  if (c.state === 'suspended') c.resume().catch(() => {});
  const o = c.createOscillator();
  const g = c.createGain();
  const t0 = (at ?? c.currentTime) + start;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(dest ?? c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Tiếng "xì" ngắn (hi-hat) cho nhịp nhạc nền. */
let noiseBuf: AudioBuffer | null = null;
function hat(at: number, vol: number, dest: AudioNode) {
  const c = ac();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.05), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.045);
  s.connect(f).connect(g).connect(dest);
  s.start(at);
  s.stop(at + 0.05);
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
  /** Màn giáo viên: có học sinh vừa trả lời (bong bóng nhỏ) */
  answerIn: play(() => {
    tone(523, 0, 0.08, 'sine', 0.06, 784);
    tone(1047, 0.06, 0.1, 'triangle', 0.04);
  }),
  /** Bài kiểm tra: đã ghi nhận câu trả lời (chuông nhẹ hai nốt, không cho biết đúng hay sai) */
  saved: play(() => {
    tone(880, 0, 0.12, 'sine', 0.07);
    tone(1319, 0.07, 0.2, 'sine', 0.06);
  }),
};

// ---------------- Nhạc nền vui nhộn (tự tổng hợp, lặp lại) ----------------
// Nhịp 132, mỗi bước một nốt móc đơn. 0 = nghỉ. Giai điệu Đô trưởng, 4 ô nhịp × 8 bước, hai lượt (lượt sau lên cao hơn).
const N: Record<string, number> = { G3: 196, A3: 220, C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, G5: 784 };
const MELODY = [
  'C5', 0, 'G4', 'E4', 'G4', 0, 'C5', 'D5', 'E5', 0, 'D5', 'C5', 'D5', 0, 'G4', 0,
  'A4', 0, 'C5', 'A4', 'G4', 'E4', 'G4', 0, 'F4', 'E4', 'D4', 'E4', 'C4', 0, 0, 0,
  'E5', 0, 'C5', 'G4', 'C5', 0, 'E5', 'G5', 'E5', 0, 'D5', 'C5', 'D5', 0, 'B4', 0,
  'A4', 0, 'C5', 'D5', 'E5', 'D5', 'C5', 'A4', 'G4', 'E4', 'D4', 'G4', 'C5', 0, 0, 0,
].map((n) => (n ? N[n as string] : 0));
const BASS = ['C4', 'G3', 'A3', 'F4', 'C4', 'G3', 'F4', 'C4'].map((n) => N[n] / 2); // mỗi ô nhịp một nốt trầm, nảy 2 lần
const STEP = 60 / 132 / 2;

/** Bắt đầu nhạc nền, trả về hàm dừng (giảm dần âm lượng rồi tắt). */
export function startMusic(): () => void {
  const c = ac();
  const master = c.createGain();
  master.gain.value = 0.55;
  master.connect(c.destination);
  let step = 0;
  let next = 0; // thời điểm (theo đồng hồ âm thanh) của bước kế tiếp
  let stopped = false;
  // Hẹn trước các nốt trong 0,3 giây tới, kiểm tra mỗi 100 ms: nhịp đều kể cả khi trang bận
  const pump = () => {
    if (stopped) return;
    if (c.state !== 'running') { c.resume().catch(() => {}); next = 0; return; } // chưa được phát (chưa chạm trang): chờ, không dồn nốt
    if (!next || next < c.currentTime) next = c.currentTime + 0.05;
    try {
      while (next < c.currentTime + 0.3) {
        const m = MELODY[step % MELODY.length];
        if (m) tone(m, 0, STEP * 0.9, 'triangle', 0.06, undefined, master, next);
        if (step % 4 === 0) tone(BASS[Math.floor(step / 8) % BASS.length], 0, STEP * 1.6, 'sine', 0.09, undefined, master, next);
        if (step % 2 === 1) hat(next, 0.025, master);
        if (step % 8 === 0) [1, 1.26, 1.5].forEach((r) => tone(BASS[Math.floor(step / 8) % BASS.length] * 4 * r, 0, STEP * 3, 'sine', 0.012, undefined, master, next)); // hợp âm nền mỏng
        step++;
        next += STEP;
      }
    } catch { /* bỏ qua */ }
  };
  pump();
  const id = window.setInterval(pump, 100);
  return () => {
    stopped = true;
    clearInterval(id);
    try {
      master.gain.setTargetAtTime(0, c.currentTime, 0.08);
      window.setTimeout(() => master.disconnect(), 600);
    } catch { /* bỏ qua */ }
  };
}

/** Nhạc nền dùng chung cả trang: chỉ một bản nhạc phát tại một thời điểm. Mỗi vai (giáo viên / học sinh) nhớ bật/tắt riêng. */
export type MusicScope = 'teacher' | 'student';
const MUSIC_KEY = (s: MusicScope) => `quickplay.music.${s}`;
export function musicPref(scope: MusicScope, fallback = false): boolean {
  try {
    const v = localStorage.getItem(MUSIC_KEY(scope));
    return v === null ? fallback : v === 'on';
  } catch { return fallback; }
}
export function setMusicPref(scope: MusicScope, on: boolean) {
  try { localStorage.setItem(MUSIC_KEY(scope), on ? 'on' : 'off'); } catch { /* bỏ qua */ }
}
let stopCurrent: (() => void) | null = null;
let pendingStop = 0;
export function playMusic() {
  clearTimeout(pendingStop);
  if (stopCurrent) return; // đang phát (chuyển trang trong cùng vai: nhạc chạy liền, không ngắt)
  try { stopCurrent = startMusic(); } catch { stopCurrent = null; }
}
/** Dừng nhạc; delay > 0: chờ chút (trang kế tiếp có nút nhạc sẽ giữ nhạc tiếp tục). */
export function stopMusic(delay = 0) {
  clearTimeout(pendingStop);
  const go = () => { stopCurrent?.(); stopCurrent = null; };
  if (delay > 0) pendingStop = window.setTimeout(go, delay);
  else go();
}
export const musicPlaying = () => !!stopCurrent;
