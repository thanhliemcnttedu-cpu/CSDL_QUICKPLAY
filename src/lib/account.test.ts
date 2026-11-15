// Chạy mã thật của máy chủ tài khoản (apps-script-admin/Code.gs) trong Node với dịch vụ Google giả lập.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { decryptVault, deriveKey, encryptVault } from './account';

const require = createRequire(import.meta.url);
const { createAdmin } = require('../../apps-script-admin/gas-harness.cjs') as {
  createAdmin: () => { adminKey: string; post: (b: Record<string, unknown>) => { ok: boolean; data?: any; error?: string }; store: Map<string, string> };
};

describe('máy chủ tài khoản', () => {
  it('quản trị cấp tài khoản; giáo viên đăng nhập, lưu két, bị khóa thì mất phiên', () => {
    const a = createAdmin();
    const k = a.adminKey;
    expect(a.post({ action: 'adminList', admin_key: 'sai' }).ok).toBe(false);
    expect(a.post({ action: 'adminCreate', admin_key: k, username: 'Lan.Nguyen', name: 'Nguyễn Thị Lan', password: '12345' }).error).toMatch(/6 đến 72/);
    expect(a.post({ action: 'adminCreate', admin_key: k, username: 'Lan.Nguyen', name: 'Nguyễn Thị Lan', password: 'matkhau1' }).data.username).toBe('lan.nguyen');
    expect(a.post({ action: 'adminCreate', admin_key: k, username: 'lan.nguyen', name: 'X', password: 'matkhau1' }).error).toMatch(/đã tồn tại/);

    // sai mật khẩu và tài khoản không tồn tại cho cùng một thông báo
    const wrong = a.post({ action: 'login', username: 'lan.nguyen', password: 'sai-roi' });
    const none = a.post({ action: 'login', username: 'khong.co', password: 'sai-roi' });
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toBe(none.error);

    const login = a.post({ action: 'login', username: 'LAN.nguyen', password: 'matkhau1' });
    expect(login.data).toMatchObject({ username: 'lan.nguyen', name: 'Nguyễn Thị Lan', vault: '' });
    const token = login.data.token as string;
    expect(a.post({ action: 'saveVault', username: 'lan.nguyen', token: 'gia', vault: 'x' }).ok).toBe(false);
    expect(a.post({ action: 'saveVault', username: 'lan.nguyen', token, vault: 'ket-da-ma-hoa' }).ok).toBe(true);
    expect(a.post({ action: 'login', username: 'lan.nguyen', password: 'matkhau1' }).data.vault).toBe('ket-da-ma-hoa');

    // mật khẩu không lưu dạng rõ; két quản trị thấy được chỉ là chuỗi đã mã hóa do trình duyệt gửi lên
    expect(a.store.get('U_lan.nguyen')).not.toContain('matkhau1');
    expect(a.post({ action: 'adminList', admin_key: k }).data[0]).toMatchObject({ username: 'lan.nguyen', configured: true, locked: false });

    // khóa tài khoản: phiên đang mở mất hiệu lực, không đăng nhập lại được
    const fresh = a.post({ action: 'login', username: 'lan.nguyen', password: 'matkhau1' }).data.token;
    expect(a.post({ action: 'check', username: 'lan.nguyen', token: fresh }).ok).toBe(true);
    a.post({ action: 'adminSetLocked', admin_key: k, username: 'lan.nguyen', locked: true });
    expect(a.post({ action: 'check', username: 'lan.nguyen', token: fresh }).ok).toBe(false);
    expect(a.post({ action: 'login', username: 'lan.nguyen', password: 'matkhau1' }).error).toMatch(/bị khóa/);
    a.post({ action: 'adminSetLocked', admin_key: k, username: 'lan.nguyen', locked: false });

    // đặt lại mật khẩu: mật khẩu cũ hết dùng, két cũ bị bỏ
    a.post({ action: 'adminResetPassword', admin_key: k, username: 'lan.nguyen', password: 'moi-hoan-toan' });
    expect(a.post({ action: 'login', username: 'lan.nguyen', password: 'matkhau1' }).ok).toBe(false);
    expect(a.post({ action: 'login', username: 'lan.nguyen', password: 'moi-hoan-toan' }).data.vault).toBe('');
  });

  it('nhập sai quá 8 lần thì tạm khóa đăng nhập, kể cả khi sau đó nhập đúng', () => {
    const a = createAdmin();
    a.post({ action: 'adminCreate', admin_key: a.adminKey, username: 'binh', name: 'Bình', password: 'dung-roi' });
    for (let i = 0; i < 8; i++) a.post({ action: 'login', username: 'binh', password: 'sai' + i });
    expect(a.post({ action: 'login', username: 'binh', password: 'dung-roi' }).error).toMatch(/quá nhiều lần/);
  });

  it('két cấu hình: chỉ mở được bằng đúng mật khẩu của giáo viên', async () => {
    const v = { scriptUrl: 'https://script.google.com/macros/s/abc/exec', teacherKey: 'KHOA', folderUrl: 'https://drive.google.com/drive/folders/xyz' };
    const key = await deriveKey('lan.nguyen', 'matkhau1');
    const sealed = await encryptVault(key, v);
    expect(sealed).not.toContain('KHOA');
    expect(await decryptVault(key, sealed)).toEqual(v);
    expect(await decryptVault(await deriveKey('lan.nguyen', 'mat-khau-khac'), sealed)).toBeNull();
    expect(await decryptVault(await deriveKey('nguoi.khac', 'matkhau1'), sealed)).toBeNull();
  });
});
