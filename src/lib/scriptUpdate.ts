// Nhắc cập nhật Apps Script của giáo viên.
// Khi giáo viên mở phần mềm (tối đa 6 giờ một lần): hỏi phiên bản Apps Script đang chạy; nếu cũ hơn bản phần mềm cần
// thì nhắc thầy cô cập nhật tay bằng 5 bước ở trang Cài đặt. Phần mềm KHÔNG tự cập nhật Apps Script.
import { SCRIPT_VERSION, compareVersion, pingScript } from './installer';
import { loadSettings } from './settings';

const KEY = 'quickplay.scriptUpdate';
const EVERY_MS = 6 * 60 * 60 * 1000;

export type UpdateState = 'current' | 'old'; // đang chạy bản mới nhất | cần cập nhật tay
export interface UpdateStatus { state: UpdateState; at: number; server?: string }

export function scriptUpdateStatus(): UpdateStatus | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as UpdateStatus | null;
    return s && (s.state === 'current' || s.state === 'old') ? s : null; // bỏ trạng thái của bản tự cập nhật cũ
  } catch { return null; }
}
function save(s: UpdateStatus) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* bỏ qua */ }
  window.dispatchEvent(new Event('quickplay-script-update'));
  return s;
}

/** So phiên bản máy chủ với bản phần mềm cần. */
export function versionState(server: string): UpdateState {
  return compareVersion(server, SCRIPT_VERSION) >= 0 ? 'current' : 'old';
}

let running: Promise<UpdateStatus | null> | null = null;

/** Hỏi phiên bản Apps Script đang chạy. force = bỏ qua giới hạn 6 giờ. */
export function checkScriptVersion(force = false): Promise<UpdateStatus | null> {
  if (running) return running;
  running = (async () => {
    const s = loadSettings();
    if (s.backend !== 'drive' || !s.scriptUrl) return null;
    const old = scriptUpdateStatus();
    if (!force && old && Date.now() - old.at < EVERY_MS) return old;
    try {
      const info = await pingScript(s.scriptUrl);
      return save({ state: versionState(info.version), at: Date.now(), server: info.version });
    } catch {
      return old; // mất mạng: để lần sau
    }
  })().finally(() => { running = null; });
  return running;
}

/** Ghi nhận phiên bản vừa biết (sau khi cài đặt hoặc cập nhật tay xong) để lời nhắc tắt ngay. */
export function noteScriptVersion(server: string) {
  save({ state: versionState(server), at: Date.now(), server });
}
