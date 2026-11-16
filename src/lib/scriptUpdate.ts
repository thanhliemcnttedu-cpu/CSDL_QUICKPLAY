// Tự cập nhật Apps Script của giáo viên (bật lại ở 1.5.8, có nút dự phòng).
// Khi giáo viên mở phần mềm: hỏi phiên bản Apps Script đang chạy. Cũ hơn bản phần mềm cần và Apps Script đã có chức năng
// tự cập nhật (từ 1.4.0) → gửi selfUpdate: Apps Script tự tải mã mới từ trang Quickplay, kiểm tra mã băm, ghi đè,
// tạo phiên bản mới và chuyển link /exec đang dùng sang bản đó (link, khóa, dữ liệu giữ nguyên).
// Không tự làm được thì ghi rõ LÝ DO để giao diện chỉ đúng việc thầy cô cần làm (bật API, cập nhật tay một lần…).
import { call } from './api';
import { SCRIPT_VERSION, compareVersion, pingScript } from './installer';
import { loadSettings } from './settings';

const KEY = 'quickplay.scriptUpdate';
const LOCK = 'quickplay.scriptUpdate.lock';
const EVERY_MS = 6 * 60 * 60 * 1000; // đang chạy bản mới nhất: 6 giờ hỏi lại một lần
const RETRY_MS = 15 * 60 * 1000; // chưa cập nhật được: 15 phút sau thử lại (thầy cô có thể vừa bật API, buổi học vừa xong)

export type UpdateState = 'current' | 'updated' | 'old';
/** Vì sao chưa tự cập nhật được */
export type UpdateReason =
  | 'api_off' // Gmail chạy Apps Script chưa bật Google Apps Script API
  | 'scopes' // dự án chưa có quyền tự cập nhật (chưa dán tệp cấu hình appsscript.json)
  | 'manual' // bản mới cần thêm quyền Google: Google bắt chủ dự án tự cấp → cập nhật tay
  | 'busy' // đang có buổi học trực tiếp: để buổi học xong
  | 'no_self' // Apps Script cũ hơn 1.4.0, chưa có chức năng tự cập nhật
  | 'error';

export interface UpdateStatus { state: UpdateState; at: number; server?: string; from?: string; to?: string; reason?: UpdateReason; message?: string }

export function scriptUpdateStatus(): UpdateStatus | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as UpdateStatus | null;
    return s && ['current', 'updated', 'old'].includes(s.state) ? s : null;
  } catch { return null; }
}
function save(s: UpdateStatus) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* bỏ qua */ }
  window.dispatchEvent(new Event('quickplay-script-update'));
  return s;
}

/** So phiên bản máy chủ với bản phần mềm cần. */
export function versionState(server: string): 'current' | 'old' {
  return compareVersion(server, SCRIPT_VERSION) >= 0 ? 'current' : 'old';
}

/** Đổi lỗi có mã của Apps Script (API_OFF:, SCOPES:, MANUAL:, BUSY:) thành lý do. */
export function reasonOf(message: string): { reason: UpdateReason; message: string } {
  const m = message.match(/^(API_OFF|SCOPES|MANUAL|BUSY):\s*/);
  const map: Record<string, UpdateReason> = { API_OFF: 'api_off', SCOPES: 'scopes', MANUAL: 'manual', BUSY: 'busy' };
  return { reason: m ? map[m[1]] : 'error', message: m ? message.slice(m[0].length) : message };
}

/** Đã đến lúc hỏi lại chưa (không hỏi dồn dập mỗi lần chuyển trang). */
export function isFresh(s: UpdateStatus | null, now = Date.now()): boolean {
  if (!s) return false;
  return now - s.at < (s.state === 'old' ? RETRY_MS : EVERY_MS);
}

/** Hai thẻ trình duyệt cùng mở: chỉ một thẻ được tự cập nhật (giữ chỗ 2 phút). */
function takeLock(): boolean {
  try {
    const t = Number(localStorage.getItem(LOCK) || 0);
    if (Date.now() - t < 120000) return false;
    localStorage.setItem(LOCK, String(Date.now()));
    return true;
  } catch { return true; }
}
function dropLock() {
  try { localStorage.removeItem(LOCK); } catch { /* bỏ qua */ }
}

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
let running: Promise<UpdateStatus | null> | null = null;

/**
 * Kiểm tra và TỰ CẬP NHẬT nếu cần.
 * force = nút "Cập nhật ngay" (bỏ qua giới hạn thời gian); live = cập nhật cả khi đang có buổi học trực tiếp (thầy cô đã đồng ý).
 */
export function autoUpdateScript(force = false, live = false): Promise<UpdateStatus | null> {
  if (running) return running;
  running = (async () => {
    const s = loadSettings();
    if (s.backend !== 'drive' || !s.scriptUrl) return null;
    const old = scriptUpdateStatus();
    if (!force && isFresh(old)) return old;
    let info: { version: string; self_update?: boolean };
    try {
      info = await pingScript(s.scriptUrl);
    } catch {
      return old; // mất mạng: để lần sau
    }
    if (versionState(info.version) === 'current') {
      // vừa tự cập nhật xong thì giữ trạng thái "updated" để thông báo kịp hiện
      return save(old?.state === 'updated' && old.to === info.version ? { ...old, at: Date.now() } : { state: 'current', at: Date.now(), server: info.version });
    }
    if (!info.self_update) return save({ state: 'old', at: Date.now(), server: info.version, reason: 'no_self' });
    if (!force && !takeLock()) return old; // thẻ khác đang cập nhật
    try {
      const r = await call<{ updated: boolean; from: string; to: string }>('selfUpdate', { exec_url: s.scriptUrl, force: live });
      if (!r.updated) {
        return save({ state: 'old', at: Date.now(), server: info.version, reason: 'error', message: `Trang phát hành của Quickplay chưa có bản ${SCRIPT_VERSION}. Thử lại sau ít phút.` });
      }
      // Xác nhận link /exec đã chạy mã mới (Google có thể cần vài giây để chuyển bản triển khai)
      let now = r.to;
      for (let i = 0; i < 4; i++) {
        const after = await pingScript(s.scriptUrl).catch(() => null);
        if (after) now = after.version;
        if (after && versionState(after.version) === 'current') break;
        await sleep(2000);
      }
      if (versionState(now) !== 'current') {
        return save({ state: 'old', at: Date.now(), server: now, reason: 'error', message: `Apps Script đã ghi mã ${r.to} nhưng link đang dùng vẫn trả về bản ${now}. Bấm "Cập nhật ngay" để thử lại, hoặc làm 5 bước cập nhật tay.` });
      }
      return save({ state: 'updated', at: Date.now(), from: r.from, to: now, server: now });
    } catch (e) {
      const { reason, message } = reasonOf((e as Error).message);
      return save({ state: 'old', at: Date.now(), server: info.version, reason, message });
    } finally {
      dropLock();
    }
  })().finally(() => { running = null; });
  return running;
}

/** Chỉ hỏi phiên bản (không cập nhật) — dùng ở màn mở phòng kiểm tra. */
export async function checkScriptVersion(force = false): Promise<UpdateStatus | null> {
  const s = loadSettings();
  if (s.backend !== 'drive' || !s.scriptUrl) return null;
  const old = scriptUpdateStatus();
  if (!force && isFresh(old)) return old;
  try {
    const info = await pingScript(s.scriptUrl);
    if (versionState(info.version) === 'current') return save({ state: old?.state === 'updated' && old.to === info.version ? 'updated' : 'current', at: Date.now(), server: info.version, from: old?.from, to: old?.to });
    // Cũ: giữ lý do và mốc thời gian của lần TỰ CẬP NHẬT trước (cùng bản) để giao diện chỉ đúng việc cần làm.
    // Chưa từng thử tự cập nhật thì mốc = 0, để lần mở trang giáo viên kế tiếp thử tự cập nhật ngay.
    const same = old?.state === 'old' && old.server === info.version;
    return save({ state: 'old', at: same ? old!.at : 0, server: info.version, reason: same ? old!.reason : info.self_update ? undefined : 'no_self', message: same ? old!.message : undefined });
  } catch {
    return old;
  }
}

/** Kiểm tra Apps Script đã đủ điều kiện tự cập nhật chưa (đã bật API, đã có quyền). */
export async function checkSelfUpdateReady(): Promise<{ ready: boolean; reason?: UpdateReason; message?: string }> {
  try {
    await call('updateCheck');
    return { ready: true };
  } catch (e) {
    const msg = (e as Error).message;
    if (/không hợp lệ|Hành động/.test(msg)) return { ready: false, reason: 'no_self', message: 'Apps Script đang chạy bản cũ (trước 1.4.0), chưa có chức năng tự cập nhật.' };
    const { reason, message } = reasonOf(msg);
    return { ready: false, reason, message };
  }
}

/** Ghi nhận phiên bản vừa biết (sau khi cài đặt hoặc cập nhật tay xong) để lời nhắc tắt ngay. */
export function noteScriptVersion(server: string) {
  save({ state: versionState(server), at: Date.now(), server });
}

/** Trang bật Google Apps Script API (một lần cho mỗi Gmail). */
export const API_SETTINGS_URL = 'https://script.google.com/home/usersettings';

/** Câu giải thích ngắn cho từng lý do chưa tự cập nhật được. */
export function reasonText(r: UpdateReason | undefined): string {
  switch (r) {
    case 'api_off': return 'Gmail chạy Apps Script chưa bật Google Apps Script API (bật một lần, khoảng 10 giây).';
    case 'scopes': return 'Dự án Apps Script chưa có quyền tự cập nhật. Cập nhật tay một lần cuối (dán cả mã và tệp cấu hình), từ đó các bản sau tự cập nhật.';
    case 'manual': return 'Bản mới cần thêm quyền Google, Google bắt chủ tài khoản tự cấp quyền. Cập nhật tay lần này.';
    case 'busy': return 'Đang có buổi học trực tiếp. Apps Script sẽ tự cập nhật khi buổi học kết thúc.';
    case 'no_self': return 'Apps Script đang chạy bản cũ, chưa có chức năng tự cập nhật. Cập nhật tay một lần cuối, từ đó các bản sau tự cập nhật.';
    default: return 'Chưa tự cập nhật được.';
  }
}
