// Theo dõi dung lượng Google Drive của giáo viên.
// - Apps Script báo lỗi "DRIVE_FULL: …" khi không ghi được vì Drive đầy → đánh dấu ngay.
// - Định kỳ (tối đa 6 giờ một lần) hỏi Apps Script dung lượng đã dùng / tổng dung lượng → cảnh báo khi từ 90% trở lên.
// Phần mềm hiện biểu ngữ cảnh báo kèm nút tải tệp sao lưu toàn bộ (xem components/DriveFullBanner.tsx).

const KEY = 'quickplay.driveSpace';
export const NEAR_FULL = 0.9;
export const FULL = 0.98;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export interface DriveSpace {
  level: 'ok' | 'near' | 'full';
  used?: number;
  limit?: number;
  at: number;
  /** Lỗi ghi dữ liệu vì Drive đầy (không chỉ là con số dung lượng) */
  blocked?: boolean;
}

export function driveSpace(): DriveSpace | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}
function save(s: DriveSpace | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch { /* bỏ qua */ }
  window.dispatchEvent(new Event('quickplay-drive-space'));
}

/** Gọi khi Apps Script báo DRIVE_FULL */
export function markDriveFull() {
  // không giữ số đo cũ: lúc này Drive thực tế đã đầy
  save({ level: 'full', blocked: true, at: Date.now() });
}
export const clearDriveSpace = () => save(null);

/** Phân loại theo tỉ lệ đã dùng. limit = 0: tài khoản không giới hạn dung lượng. */
export function levelOf(used: number, limit: number): DriveSpace['level'] {
  if (!limit || limit <= 0) return 'ok';
  const r = used / limit;
  return r >= FULL ? 'full' : r >= NEAR_FULL ? 'near' : 'ok';
}

/** Hỏi Apps Script dung lượng Drive. force = bỏ qua giới hạn 6 giờ (nút "Kiểm tra lại"). */
export async function checkDriveSpace(force = false): Promise<DriveSpace | null> {
  const { loadSettings } = await import('./settings');
  const s = loadSettings();
  if (s.backend !== 'drive' || !s.scriptUrl) return null;
  const old = driveSpace();
  if (!force && old && Date.now() - old.at < CHECK_EVERY_MS) return old;
  try {
    const { call } = await import('./api');
    const r = await call<{ used: number; limit: number }>('driveQuota');
    const level = levelOf(r.used, r.limit);
    const next: DriveSpace = { level, used: r.used, limit: r.limit, at: Date.now() };
    // còn chỗ trống rõ ràng thì bỏ cờ "không ghi được"
    save(next);
    return next;
  } catch {
    return old; // Apps Script bản cũ hoặc mất mạng: giữ trạng thái cũ
  }
}

export const fmtGB = (b?: number) => (b === undefined ? '?' : (b / 1024 ** 3).toFixed(b >= 10 * 1024 ** 3 ? 1 : 2).replace('.', ',') + ' GB');
