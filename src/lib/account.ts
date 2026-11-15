// Tài khoản giáo viên do quản trị cấp (máy chủ tài khoản: apps-script-admin/Code.gs).
// Máy chủ chỉ kiểm tra tên/mật khẩu và cất "két cấu hình" đã mã hóa; bộ câu hỏi vẫn nằm trong Drive riêng của giáo viên.
import { loadSettings, saveSettings } from './settings';

export interface Account { username: string; name: string; token: string; key: string; email?: string } // key: khóa AES (base64) suy ra từ mật khẩu
export interface Vault { scriptUrl: string; teacherKey: string; folderUrl: string }
export interface AccountRow { username: string; name: string; locked: boolean; created_at: number; last_login: number; configured: boolean; has_email?: boolean }

const ACC = 'quizzi.account';
const URL_KEY = 'quizzi.adminUrl';
const ADMIN_KEY = 'quizzi.adminKey'; // chỉ giữ trong phiên trình duyệt của quản trị

export class AccountError extends Error {}

/** Địa chỉ máy chủ tài khoản: đặt khi build (VITE_ADMIN_URL) hoặc nhập tay ở trang Quản trị. */
export function adminUrl(): string {
  try {
    return (localStorage.getItem(URL_KEY) || (import.meta.env?.VITE_ADMIN_URL as string | undefined) || '').trim();
  } catch {
    return '';
  }
}
export function setAdminUrl(url: string) {
  if (url.trim()) localStorage.setItem(URL_KEY, url.trim());
  else localStorage.removeItem(URL_KEY);
}
/** Có máy chủ tài khoản thì khu giáo viên bắt buộc đăng nhập. */
export const accountRequired = () => !!adminUrl();

export function currentAccount(): Account | null {
  try {
    const a = JSON.parse(localStorage.getItem(ACC) || 'null');
    return a && a.username && a.token ? a : null;
  } catch {
    return null;
  }
}

async function call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const url = adminUrl();
  if (!url) throw new AccountError('Chưa cấu hình máy chủ tài khoản.');
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...params }), redirect: 'follow' });
  } catch {
    throw new AccountError('Không kết nối được máy chủ tài khoản. Hãy kiểm tra mạng Internet.');
  }
  let json: { ok: boolean; data?: T; error?: string };
  try {
    json = JSON.parse(await res.text());
  } catch {
    throw new AccountError('Máy chủ tài khoản trả về dữ liệu không hợp lệ.');
  }
  if (!json.ok) throw new AccountError(json.error || 'Lỗi không xác định từ máy chủ tài khoản.');
  return json.data as T;
}

// ---------- mã hóa két cấu hình bằng mật khẩu của giáo viên (quản trị không đọc được) ----------
const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function deriveKey(username: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode('quickplay:' + username), iterations: 120000, hash: 'SHA-256' }, base, 256);
  return b64(bits);
}
const aes = (key: string) => crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['encrypt', 'decrypt']);

export async function encryptVault(key: string, v: Vault): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(key), new TextEncoder().encode(JSON.stringify(v)));
  return b64(iv) + '.' + b64(data);
}
export async function decryptVault(key: string, vault: string): Promise<Vault | null> {
  try {
    const [iv, data] = vault.split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aes(key), unb64(data));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null; // két hỏng hoặc mật khẩu đã đổi
  }
}

// ---------- giáo viên ----------
/** Đăng nhập; nếu tài khoản đã lưu cấu hình thì nạp lại link Apps Script + thư mục vào máy này. Trả về true nếu đã có cấu hình. */
export async function login(usernameRaw: string, password: string): Promise<{ account: Account; configured: boolean }> {
  const username = usernameRaw.trim().toLowerCase();
  const r = await call<{ username: string; name: string; token: string; vault: string; recovery_email?: string }>('login', { username, password });
  const key = await deriveKey(r.username, password);
  const account: Account = { username: r.username, name: r.name, token: r.token, key, email: r.recovery_email || '' };
  localStorage.setItem(ACC, JSON.stringify(account));
  const v = r.vault ? await decryptVault(key, r.vault) : null;
  const s = loadSettings();
  if (v?.scriptUrl) saveSettings({ ...s, backend: 'drive', scriptUrl: v.scriptUrl, teacherKey: v.teacherKey, folderUrl: v.folderUrl || '' });
  else saveSettings({ ...s, backend: 'local', scriptUrl: '', teacherKey: '', folderUrl: '' }); // không dùng nhầm cấu hình của người đăng nhập trước
  return { account, configured: !!v?.scriptUrl };
}

/** Đăng xuất: xóa tài khoản và cấu hình kết nối khỏi trình duyệt này (dữ liệu trên Drive không bị ảnh hưởng). */
export function logout() {
  localStorage.removeItem(ACC);
  saveSettings({ ...loadSettings(), backend: 'local', scriptUrl: '', teacherKey: '', folderUrl: '' });
}

/** Kiểm tra phiên còn hiệu lực (tài khoản bị khóa hoặc đã đăng nhập ở nơi khác thì trả về false). */
export async function checkSession(): Promise<boolean> {
  const a = currentAccount();
  if (!a) return false;
  try {
    await call('check', { username: a.username, token: a.token });
    return true;
  } catch (e) {
    if (e instanceof AccountError && /kết nối|hợp lệ/.test(e.message)) return true; // mất mạng: không đăng xuất oan
    return false;
  }
}

/** Lưu link thư mục + link Apps Script + khóa giáo viên vào tài khoản (đã mã hóa) để lần sau đăng nhập ở máy nào cũng nhớ. */
export async function saveVault(v: Vault): Promise<void> {
  const a = currentAccount();
  if (!a) return;
  await call('saveVault', { username: a.username, token: a.token, vault: await encryptVault(a.key, v) });
}

export async function changePassword(password: string, newPassword: string): Promise<void> {
  const a = currentAccount();
  if (!a) throw new AccountError('Chưa đăng nhập.');
  const s = loadSettings();
  const key = await deriveKey(a.username, newPassword);
  const vault = s.scriptUrl ? await encryptVault(key, { scriptUrl: s.scriptUrl, teacherKey: s.teacherKey, folderUrl: s.folderUrl }) : '';
  await call('changePassword', { username: a.username, token: a.token, password, new_password: newPassword, vault });
  localStorage.setItem(ACC, JSON.stringify({ ...a, key }));
}

// ---------- email khôi phục và quên mật khẩu ----------
/** Khai báo (hoặc xóa, khi để trống) email khôi phục của tài khoản đang đăng nhập. */
export async function setRecoveryEmail(email: string, password: string): Promise<string> {
  const a = currentAccount();
  if (!a) throw new AccountError('Chưa đăng nhập.');
  const r = await call<{ recovery_email: string }>('setRecoveryEmail', { username: a.username, token: a.token, email: email.trim(), password });
  localStorage.setItem(ACC, JSON.stringify({ ...a, email: r.recovery_email }));
  return r.recovery_email;
}
/** Quên mật khẩu, bước 1: máy chủ gửi mã 6 số tới email khôi phục. Trả về email đã che bớt. */
export const forgotStart = (username: string) => call<{ sent: boolean; email: string }>('forgotStart', { username: username.trim().toLowerCase() });
/** Quên mật khẩu, bước 2: nhập mã và mật khẩu mới. */
export const forgotFinish = (username: string, code: string, newPassword: string) =>
  call<{ changed: boolean }>('forgotFinish', { username: username.trim().toLowerCase(), code, new_password: newPassword });

// ---------- quản trị ----------
export const getAdminKey = () => sessionStorage.getItem(ADMIN_KEY) || '';
export const setAdminKey = (k: string) => (k ? sessionStorage.setItem(ADMIN_KEY, k) : sessionStorage.removeItem(ADMIN_KEY));
// Phiên đăng nhập của quản trị (tên tài khoản + mật khẩu): chỉ giữ tới khi đóng thẻ trình duyệt
const ADMIN_TOKEN = 'quickplay.adminToken';
const ADMIN_USER = 'quickplay.adminUser';
export const DEFAULT_ADMIN_USER = 'adminquantri';
export const adminSignedIn = () => !!sessionStorage.getItem(ADMIN_TOKEN) || !!getAdminKey();
export const adminUser = () => sessionStorage.getItem(ADMIN_USER) || '';
function keepAdmin(r: { username: string; token: string }) {
  sessionStorage.setItem(ADMIN_TOKEN, r.token);
  sessionStorage.setItem(ADMIN_USER, r.username);
  sessionStorage.removeItem(ADMIN_KEY); // đã có phiên đăng nhập thì không giữ khóa ADMIN_KEY trong trình duyệt nữa
}
const adminCall = <T>(action: string, params: Record<string, unknown> = {}) =>
  call<T>(action, { admin_token: sessionStorage.getItem(ADMIN_TOKEN) || undefined, admin_key: getAdminKey() || undefined, ...params });
export const adminAuth = {
  /** Máy chủ đã có tài khoản quản trị chưa */
  status: () => call<{ has_admin: boolean }>('adminStatus'),
  /** Thiết lập lần đầu hoặc đặt lại mật khẩu quản trị (cần ADMIN_KEY) */
  init: async (adminKey: string, username: string, password: string) => keepAdmin(await call<{ username: string; token: string }>('adminInit', { admin_key: adminKey.trim(), username, password })),
  login: async (username: string, password: string) => keepAdmin(await call<{ username: string; token: string }>('adminLogin', { username, password })),
  changePassword: (password: string, new_password: string) => adminCall<{ changed: boolean }>('adminChangePassword', { password, new_password }),
  logout: async () => {
    try { await adminCall('adminLogout'); } catch { /* máy chủ không tới được: vẫn xóa phiên trên máy */ }
    sessionStorage.removeItem(ADMIN_TOKEN);
    sessionStorage.removeItem(ADMIN_USER);
    sessionStorage.removeItem(ADMIN_KEY);
  },
};
export const adminApi = {
  list: () => adminCall<AccountRow[]>('adminList'),
  create: (username: string, name: string, password: string) => adminCall<AccountRow>('adminCreate', { username, name, password }),
  setLocked: (username: string, locked: boolean) => adminCall<AccountRow>('adminSetLocked', { username, locked }),
  resetPassword: (username: string, password: string) => adminCall<AccountRow>('adminResetPassword', { username, password }),
  remove: (username: string) => adminCall<{ username: string }>('adminDelete', { username }),
};
