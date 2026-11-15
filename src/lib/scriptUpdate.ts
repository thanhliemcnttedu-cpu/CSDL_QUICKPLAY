// Tự cập nhật Apps Script của giáo viên.
// Khi giáo viên mở phần mềm (tối đa 6 giờ một lần): hỏi phiên bản Apps Script đang chạy; nếu cũ hơn bản phần mềm cần
// và Apps Script đã có chức năng tự cập nhật (từ 1.4.0) → gửi selfUpdate: Apps Script tự tải mã mới từ trang Quickplay,
// ghi đè, tạo phiên bản mới và chuyển link /exec đang dùng sang bản đó. Giáo viên không phải làm gì.
import { call } from './api';
import { SCRIPT_VERSION, compareVersion, pingScript } from './installer';
import { loadSettings } from './settings';

const KEY = 'quickplay.scriptUpdate';
const EVERY_MS = 6 * 60 * 60 * 1000;

export type UpdateState =
  | 'current' // đang chạy bản mới nhất
  | 'updated' // vừa tự cập nhật xong
  | 'old' // bản cũ chưa có chức năng tự cập nhật: cập nhật tay một lần
  | 'api_off' // chưa bật Google Apps Script API
  | 'scopes' // thiếu quyền (chưa dán appsscript.json)
  | 'manual' // bản mới cần thêm quyền Google: cập nhật tay
  | 'busy' // đang có buổi học trực tiếp: để sau
  | 'error';

export interface UpdateStatus { state: UpdateState; at: number; server?: string; from?: string; to?: string; message?: string; ready?: boolean }

export function scriptUpdateStatus(): UpdateStatus | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function save(s: UpdateStatus) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* bỏ qua */ }
  window.dispatchEvent(new Event('quickplay-script-update'));
  return s;
}

/** Đổi lỗi có mã (API_OFF:, SCOPES:, MANUAL:, BUSY:) thành trạng thái */
export function stateOf(message: string): { state: UpdateState; message: string } {
  const m = message.match(/^(API_OFF|SCOPES|MANUAL|BUSY):\s*/);
  const map: Record<string, UpdateState> = { API_OFF: 'api_off', SCOPES: 'scopes', MANUAL: 'manual', BUSY: 'busy' };
  return { state: m ? map[m[1]] : 'error', message: m ? message.slice(m[0].length) : message };
}

let running: Promise<UpdateStatus | null> | null = null;

/** Kiểm tra và tự cập nhật nếu cần. force = bỏ qua giới hạn 6 giờ (nút "Cập nhật ngay"). */
export function autoUpdateScript(force = false): Promise<UpdateStatus | null> {
  if (running) return running;
  running = (async () => {
    const s = loadSettings();
    if (s.backend !== 'drive' || !s.scriptUrl) return null;
    const old = scriptUpdateStatus();
    if (!force && old && Date.now() - old.at < EVERY_MS && old.state !== 'updated') return old;
    let info: { version: string; self_update?: boolean };
    try {
      info = await pingScript(s.scriptUrl);
    } catch {
      return old; // mất mạng: để lần sau
    }
    if (compareVersion(info.version, SCRIPT_VERSION) >= 0) return save({ state: 'current', at: Date.now(), server: info.version, ready: old?.ready });
    if (!info.self_update) return save({ state: 'old', at: Date.now(), server: info.version });
    try {
      const r = await call<{ updated: boolean; from: string; to: string }>('selfUpdate', { exec_url: s.scriptUrl, force });
      // xác nhận link /exec đã chạy mã mới
      const after = await pingScript(s.scriptUrl).catch(() => null);
      return save({ state: 'updated', at: Date.now(), from: r.from, to: after?.version ?? r.to, server: after?.version ?? r.to, ready: true });
    } catch (e) {
      const { state, message } = stateOf((e as Error).message);
      return save({ state, at: Date.now(), server: info.version, message });
    }
  })().finally(() => { running = null; });
  return running;
}

/** Kiểm tra Apps Script đã đủ điều kiện tự cập nhật chưa (đã bật API, đã có quyền). */
export async function checkSelfUpdateReady(): Promise<{ ready: boolean; state?: UpdateState; message?: string }> {
  try {
    await call('updateCheck');
    const cur = scriptUpdateStatus();
    if (cur) save({ ...cur, ready: true });
    return { ready: true };
  } catch (e) {
    const { state, message } = stateOf((e as Error).message);
    if (/không hợp lệ|Hành động/.test(message)) return { ready: false, state: 'old', message: 'Apps Script đang chạy bản cũ, chưa có chức năng tự cập nhật.' };
    return { ready: false, state, message };
  }
}

export const API_SETTINGS_URL = 'https://script.google.com/home/usersettings';
