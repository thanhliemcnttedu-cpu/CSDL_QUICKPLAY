// Trình cài đặt Apps Script ngay trong phần mềm: tạo mã đã điền sẵn thư mục và khóa, để thầy cô chỉ việc
// sao chép – dán – triển khai, không phải chạy hàm setup() hay tìm khóa trong nhật ký.

/** Phiên bản mã máy chủ đang đi kèm phần mềm (phải trùng APP_VERSION / ADMIN_VERSION trong hai tệp Code.gs). */
export const SCRIPT_VERSION = '1.1.0';
/** Phiên bản mã máy chủ tài khoản (ADMIN_VERSION trong apps-script-admin/Code.gs). */
export const ADMIN_SCRIPT_VERSION = '1.2.0';

export type InstallKind = 'teacher' | 'admin';

/** Lấy mã thư mục từ link Google Drive (…/folders/<id>, ?id=<id>) hoặc từ chính mã thư mục. */
export function folderIdOf(link: string): string | null {
  const s = link.trim();
  const m = s.match(/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/^([\w-]{20,})$/);
  return m ? m[1] : null;
}

export const isExecUrl = (url: string) => /^https:\/\/script\.google(usercontent)?\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(url.trim());

/** Khóa ngẫu nhiên, bỏ các ký tự dễ nhầm (0/O, 1/l/I). */
export function randomKey(len = 32): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(r, (b) => abc[b % abc.length]).join('');
}

/** So sánh phiên bản dạng 1.2.3: âm nếu a cũ hơn b. */
export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const setVar = (code: string, name: string, value: string) => {
  const re = new RegExp(`var ${name} = '[^']*';`);
  if (!re.test(code)) throw new Error(`Mã máy chủ thiếu dòng "var ${name}". Hãy báo tác giả.`);
  if (!/^[\w-]*$/.test(value)) throw new Error('Giá trị điền vào mã có ký tự không hợp lệ.');
  return code.replace(re, `var ${name} = '${value}';`);
};

/** Mã Apps Script của giáo viên, đã điền sẵn khóa giáo viên và mã thư mục lưu trữ. */
export function fillTeacherCode(code: string, teacherKey: string, folderId: string): string {
  return setVar(setVar(code, 'PRESET_TEACHER_KEY', teacherKey), 'PRESET_FOLDER_ID', folderId);
}

/** Mã máy chủ tài khoản của quản trị, đã điền sẵn khóa quản trị. */
export function fillAdminCode(code: string, adminKey: string): string {
  return setVar(code, 'PRESET_ADMIN_KEY', adminKey);
}

/** Tải mã máy chủ đi kèm phần mềm (chỉ tải khi thầy cô bấm Sao chép mã). */
export async function loadScriptCode(kind: InstallKind): Promise<string> {
  const m = kind === 'teacher' ? await import('../../apps-script/Code.gs?raw') : await import('../../apps-script-admin/Code.gs?raw');
  return m.default;
}

/** Hỏi máy chủ Apps Script tên và phiên bản (không cần khóa). */
export async function pingScript(url: string): Promise<{ name: string; version: string }> {
  let res: Response;
  try {
    res = await fetch(url.trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'ping' }), redirect: 'follow' });
  } catch {
    throw new Error('Không mở được link này. Kiểm tra mạng Internet, và bản triển khai đã đặt "Người có quyền truy cập: Bất kỳ ai" chưa.');
  }
  try {
    const j = JSON.parse(await res.text()) as { ok: boolean; data?: { name: string; version: string }; error?: string };
    if (j.ok && j.data) return j.data;
    throw new Error(j.error || 'Máy chủ trả lời không đúng.');
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('Link này không trả về dữ liệu của Quickplay. Thường là do chưa chọn "Bất kỳ ai" khi triển khai, hoặc dán nhầm link.');
    throw e;
  }
}
