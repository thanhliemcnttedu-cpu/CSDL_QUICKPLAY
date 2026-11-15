// Tự lưu MỘT tệp gộp duy nhất của giáo viên mỗi khi dữ liệu thay đổi:
//   <tên đăng nhập>_<ngày>_<tháng>_<năm>_<giờ>h<phút>.json   (ví dụ 035091005725_15_11_2026_12h45.json)
// Tệp chứa bộ câu hỏi, danh mục môn học – chương – bài, lớp (danh sách học sinh) và kết quả các buổi đã tổ chức.
// Tệp nằm trong thư mục Google Drive đã kết nối (Apps Script ghi); chỉ giữ tệp mới nhất, tệp cũ vào Thùng rác của Drive.
import { currentAccount } from './account';
import { loadSettings } from './settings';

/** Các thao tác làm thay đổi dữ liệu soạn bài của giáo viên → hẹn lưu tệp gộp.
 *  Không tính các thao tác trong giờ học (mở phòng, chuyển câu, quét thẻ…) để máy chủ dành sức cho học sinh;
 *  kết quả buổi học được lưu một lần khi giáo viên bấm Kết thúc (xem shouldSnapshot). */
export const SNAPSHOT_TRIGGERS = new Set(['saveQuiz', 'deleteQuiz', 'saveCatalog', 'saveClass', 'deleteClass', 'setRootFolder', 'deleteSessions']);
export const shouldSnapshot = (action: string, params: Record<string, unknown>) =>
  SNAPSHOT_TRIGGERS.has(action) || ((action === 'hostAction' || action === 'paperAction') && params.op === 'end');
/** Chờ bấy nhiêu sau thay đổi cuối cùng rồi mới lưu, để nhiều thay đổi liên tiếp chỉ ghi một lần */
export const SNAPSHOT_DELAY_MS = 15000;
/** Hai lần tự lưu cách nhau ít nhất bấy nhiêu (bấm Lưu ngay thì không bị giới hạn) */
export const SNAPSHOT_MIN_GAP_MS = 3 * 60 * 1000;

const STATUS = 'quickplay.snapshot';
export interface SnapshotStatus {
  name: string;
  at: number;
  drive: 'ok' | 'off' | 'error' | 'old';
  counts?: { quizzes: number; classes: number; sessions: number };
  error?: string;
  driveUrl?: string;
}
export function snapshotStatus(): SnapshotStatus | null {
  try {
    return JSON.parse(localStorage.getItem(STATUS) || 'null');
  } catch {
    return null;
  }
}
function setStatus(s: SnapshotStatus) {
  try { localStorage.setItem(STATUS, JSON.stringify(s)); } catch { /* bỏ qua */ }
  window.dispatchEvent(new Event('quickplay-snapshot'));
}

/** Tên đăng nhập dùng làm đầu tên tệp (giữ chữ, số, . _ - @ +; ký tự khác thành gạch nối) — giống Apps Script */
export function snapshotOwner(raw?: string): string {
  const s = String(raw ?? '').trim().replace(/[^0-9A-Za-z._@+-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'quickplay';
}
/** Phần ngày giờ của tên tệp theo giờ máy: 15_11_2026_12h45 */
export function snapshotStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}_${p(d.getMonth() + 1)}_${d.getFullYear()}_${p(d.getHours())}h${p(d.getMinutes())}`;
}
export const snapshotName = (owner: string, stamp: string) => `${owner}_${stamp}.json`;
/** Tệp này có phải tệp gộp (của tài khoản owner) không */
export const isSnapshotOf = (file: string, owner: string) =>
  file.startsWith(owner + '_') && /^_\d{2}_\d{2}_\d{4}_\d{2}h\d{2}\.json$/.test(file.slice(owner.length));

let timer: number | undefined;
let running = false;
let again = false;

/** Hẹn lưu tệp gộp (gọi sau mỗi thay đổi). */
export function scheduleSnapshot() {
  window.clearTimeout(timer);
  const since = Date.now() - (snapshotStatus()?.at ?? 0);
  timer = window.setTimeout(() => void runSnapshot(), Math.max(SNAPSHOT_DELAY_MS, SNAPSHOT_MIN_GAP_MS - since));
}

/** Lưu ngay tệp gộp lên Google Drive đã kết nối. */
export async function runSnapshot(): Promise<SnapshotStatus | null> {
  window.clearTimeout(timer);
  if (running) {
    again = true; // đang lưu dở: lưu thêm một lần nữa khi xong
    return null;
  }
  running = true;
  try {
    const settings = loadSettings();
    const owner = snapshotOwner(currentAccount()?.username);
    const stamp = snapshotStamp();
    const name = snapshotName(owner, stamp);
    if (settings.backend !== 'drive' || !settings.scriptUrl) return null; // chưa kết nối Google Drive
    const st: SnapshotStatus = { name, at: Date.now(), drive: 'off' };
    {
      try {
        const { call } = await import('./api');
        const r = await call<{ name: string; url: string; content?: string; counts: SnapshotStatus['counts'] }>('saveSnapshot', { owner, stamp });
        st.drive = 'ok';
        st.name = r.name;
        st.driveUrl = r.url;
        st.counts = r.counts;
      } catch (e) {
        const msg = (e as Error).message;
        // Apps Script bản cũ chưa có chức năng này
        st.drive = /không hỗ trợ|không hợp lệ|Unknown action|Hành động/i.test(msg) ? 'old' : 'error';
        st.error = st.drive === 'old' ? 'Apps Script của thầy cô đang chạy bản cũ, chưa ghi được tệp gộp lên Drive. Hãy cập nhật ở trang Cài đặt.' : msg;
      }
    }

    setStatus(st);
    return st;
  } finally {
    running = false;
    if (again) {
      again = false;
      scheduleSnapshot();
    }
  }
}

