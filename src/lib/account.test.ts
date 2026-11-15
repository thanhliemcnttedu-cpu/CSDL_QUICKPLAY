// Chạy mã thật của máy chủ tài khoản (apps-script-admin/Code.gs) trong Node với dịch vụ Google giả lập.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { decryptVault, deriveKey, encryptVault } from './account';

const require = createRequire(import.meta.url);
const { createAdmin } = require('../../apps-script-admin/gas-harness.cjs') as {
  createAdmin: (opts?: { folderId?: string; drive?: Map<string, Map<string, { content: string; at: number }>> }) => { adminKey: string; post: (b: Record<string, unknown>) => { ok: boolean; data?: any; error?: string }; store: Map<string, string>; mails: { to: string; subject: string; body: string }[]; drive: Map<string, Map<string, { content: string; at: number }>> };
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

  it('quản trị đăng nhập bằng tên tài khoản và mật khẩu tự đặt', () => {
    const a = createAdmin();
    expect(a.post({ action: 'adminStatus' }).data).toEqual({ has_admin: false, folder: false });
    // chưa thiết lập thì không đăng nhập được; thiết lập phải có ADMIN_KEY đúng và mật khẩu đủ dài
    expect(a.post({ action: 'adminLogin', username: 'adminquantri', password: 'bat-ky-123' }).error).toMatch(/Chưa thiết lập/);
    expect(a.post({ action: 'adminInit', admin_key: 'sai', username: 'adminquantri', password: 'mat-khau-dai' }).error).toMatch(/ADMIN_KEY/);
    expect(a.post({ action: 'adminInit', admin_key: a.adminKey, username: 'adminquantri', password: 'ngan' }).error).toMatch(/8 đến 72/);
    const first = a.post({ action: 'adminInit', admin_key: a.adminKey, username: 'AdminQuanTri', password: 'mat-khau-dai' });
    expect(first.data.username).toBe('adminquantri');
    expect(a.post({ action: 'adminStatus' }).data).toEqual({ has_admin: true, folder: false });
    // mật khẩu không được lưu dạng rõ
    expect([...a.store.values()].join('|')).not.toContain('mat-khau-dai');

    // đăng nhập: sai tên hoặc sai mật khẩu đều báo cùng một câu
    expect(a.post({ action: 'adminLogin', username: 'adminquantri', password: 'sai-mat-khau' }).error).toMatch(/không đúng/);
    expect(a.post({ action: 'adminLogin', username: 'nguoikhac', password: 'mat-khau-dai' }).error).toMatch(/không đúng/);
    const t = a.post({ action: 'adminLogin', username: 'adminquantri', password: 'mat-khau-dai' }).data.token;
    expect(a.post({ action: 'adminList', admin_token: t }).ok).toBe(true);
    expect(a.post({ action: 'adminList', admin_token: 'gia-mao' }).error).toMatch(/hết hạn/);
    expect(a.post({ action: 'adminList', admin_token: first.data.token }).ok).toBe(false); // đăng nhập mới thay phiên cũ

    // đổi mật khẩu, đăng xuất
    expect(a.post({ action: 'adminChangePassword', admin_token: t, password: 'sai', new_password: 'mat-khau-moi-1' }).error).toMatch(/hiện tại/);
    expect(a.post({ action: 'adminChangePassword', admin_token: t, password: 'mat-khau-dai', new_password: 'mat-khau-moi-1' }).data.changed).toBe(true);
    a.post({ action: 'adminLogout', admin_token: t });
    expect(a.post({ action: 'adminList', admin_token: t }).ok).toBe(false);
    expect(a.post({ action: 'adminLogin', username: 'adminquantri', password: 'mat-khau-dai' }).ok).toBe(false);
    expect(a.post({ action: 'adminLogin', username: 'adminquantri', password: 'mat-khau-moi-1' }).ok).toBe(true);

    // sai quá 8 lần thì tạm khóa, kể cả khi sau đó nhập đúng; ADMIN_KEY vẫn đặt lại được
    for (let i = 0; i < 8; i++) a.post({ action: 'adminLogin', username: 'adminquantri', password: 'sai-' + i });
    expect(a.post({ action: 'adminLogin', username: 'adminquantri', password: 'mat-khau-moi-1' }).error).toMatch(/quá nhiều lần/);
    expect(a.post({ action: 'adminInit', admin_key: a.adminKey, username: 'adminquantri', password: 'dat-lai-bang-khoa' }).ok).toBe(true);
    expect(a.post({ action: 'adminLogin', username: 'adminquantri', password: 'dat-lai-bang-khoa' }).ok).toBe(true);
  });

  it('giáo viên khai báo email khôi phục và tự đặt lại mật khẩu bằng mã gửi qua email', () => {
    const a = createAdmin();
    a.post({ action: 'adminCreate', admin_key: a.adminKey, username: 'lan.nguyen', name: 'Nguyễn Thị Lan', password: 'matkhau1' });
    const s1 = a.post({ action: 'login', username: 'lan.nguyen', password: 'matkhau1' }).data;
    a.post({ action: 'saveVault', username: 'lan.nguyen', token: s1.token, vault: 'KET-DA-MA-HOA' });

    // chưa khai báo email (hoặc tài khoản không tồn tại): cùng một câu trả lời, không gửi thư
    const none = a.post({ action: 'forgotStart', username: 'lan.nguyen' }).error;
    expect(none).toMatch(/chưa khai báo email/);
    expect(a.post({ action: 'forgotStart', username: 'khong.co' }).error).toBe(none);
    expect(a.mails).toHaveLength(0);

    // khai báo email: phải đúng mật khẩu hiện tại và đúng dạng email
    expect(a.post({ action: 'setRecoveryEmail', username: 'lan.nguyen', token: s1.token, email: 'lan@example.com', password: 'sai' }).error).toMatch(/hiện tại không đúng/);
    expect(a.post({ action: 'setRecoveryEmail', username: 'lan.nguyen', token: s1.token, email: 'khong-phai-email', password: 'matkhau1' }).error).toMatch(/email chưa đúng/);
    expect(a.post({ action: 'setRecoveryEmail', username: 'lan.nguyen', token: s1.token, email: ' Lan@Example.com ', password: 'matkhau1' }).data.recovery_email).toBe('lan@example.com');
    expect(a.post({ action: 'adminList', admin_key: a.adminKey }).data[0].has_email).toBe(true);

    // gửi mã: email trả về đã che bớt, thư tới đúng địa chỉ, mã 6 số không lưu dạng rõ, không gửi dồn dập
    const st = a.post({ action: 'forgotStart', username: 'lan.nguyen' });
    expect(st.data.email).toBe('l***@example.com'); // tên ngắn: chỉ để lại chữ đầu
    expect(a.mails).toHaveLength(1);
    expect(a.mails[0].to).toBe('lan@example.com');
    const code = a.mails[0].body.match(/là: (\d{6})/)![1];
    expect([...a.store.values()].join('|')).not.toContain(code);
    expect(a.post({ action: 'forgotStart', username: 'lan.nguyen' }).error).toMatch(/chờ 1 phút/);

    // sai mã thì bị đếm; đúng mã thì đổi được mật khẩu, mã chỉ dùng một lần
    const wrong = code === '000000' ? '111111' : '000000';
    expect(a.post({ action: 'forgotFinish', username: 'lan.nguyen', code: wrong, new_password: 'moi-123456' }).error).toMatch(/còn 4 lần/);
    expect(a.post({ action: 'forgotFinish', username: 'lan.nguyen', code, new_password: '123' }).error).toMatch(/6 đến 72/);
    expect(a.post({ action: 'forgotFinish', username: 'lan.nguyen', code, new_password: 'moi-123456' }).data.changed).toBe(true);
    expect(a.post({ action: 'forgotFinish', username: 'lan.nguyen', code, new_password: 'lan-nua-123' }).ok).toBe(false);

    // mật khẩu cũ và phiên cũ hết hiệu lực; két cũ bị bỏ; email khôi phục vẫn còn
    expect(a.post({ action: 'login', username: 'lan.nguyen', password: 'matkhau1' }).ok).toBe(false);
    expect(a.post({ action: 'check', username: 'lan.nguyen', token: s1.token }).ok).toBe(false);
    const s2 = a.post({ action: 'login', username: 'lan.nguyen', password: 'moi-123456' }).data;
    expect(s2.vault).toBe('');
    expect(s2.recovery_email).toBe('lan@example.com');

    // nhập sai mã 5 lần thì mã bị hủy
    const acc = JSON.parse(a.store.get('U_lan.nguyen')!);
    acc.reset = undefined;
    a.store.set('U_lan.nguyen', JSON.stringify(acc));
    a.post({ action: 'forgotStart', username: 'lan.nguyen' });
    const code2 = a.mails[1].body.match(/là: (\d{6})/)![1];
    const bad = code2 === '999999' ? '888888' : '999999';
    for (let i = 0; i < 5; i++) a.post({ action: 'forgotFinish', username: 'lan.nguyen', code: bad, new_password: 'moi-123456' });
    expect(a.post({ action: 'forgotFinish', username: 'lan.nguyen', code: code2, new_password: 'moi-654321' }).error).toMatch(/quá nhiều lần|gửi mã/);

    // tài khoản bị khóa thì không xin mã được; không gửi được thư thì báo lỗi rõ
    a.post({ action: 'adminSetLocked', admin_key: a.adminKey, username: 'lan.nguyen', locked: true });
    expect(a.post({ action: 'forgotStart', username: 'lan.nguyen' }).error).toMatch(/đang bị khóa/);
  });

  it('quản trị khai báo email khôi phục và tự đặt lại mật khẩu bằng mã', () => {
    const a = createAdmin();
    const t = a.post({ action: 'adminInit', admin_key: a.adminKey, username: 'adminquantri', password: 'mat-khau-dai' }).data.token;
    // chưa khai báo email, hoặc sai tên tài khoản: cùng một câu, không gửi thư
    const none = a.post({ action: 'adminForgotStart', username: 'adminquantri' }).error;
    expect(none).toMatch(/chưa khai báo email/);
    expect(a.post({ action: 'adminForgotStart', username: 'nguoikhac' }).error).toBe(none);
    expect(a.mails).toHaveLength(0);

    expect(a.post({ action: 'adminSetEmail', email: 'qt@example.com', password: 'mat-khau-dai' }).ok).toBe(false); // phải đang đăng nhập
    expect(a.post({ action: 'adminSetEmail', admin_token: t, email: 'qt@example.com', password: 'sai' }).error).toMatch(/hiện tại không đúng/);
    expect(a.post({ action: 'adminSetEmail', admin_token: t, email: 'quantri@example.com', password: 'mat-khau-dai' }).data.recovery_email).toBe('quantri@example.com');

    expect(a.post({ action: 'adminForgotStart', username: 'adminquantri' }).data.email).toBe('qu***i@example.com');
    const code = a.mails[0].body.match(/là: (\d{6})/)![1];
    expect(a.post({ action: 'adminForgotFinish', username: 'adminquantri', code, new_password: 'ngan' }).error).toMatch(/8 đến 72/);
    const done = a.post({ action: 'adminForgotFinish', username: 'adminquantri', code, new_password: 'mat-khau-moi-2' });
    expect(done.data.recovery_email).toBe('quantri@example.com');
    expect(a.post({ action: 'adminList', admin_token: done.data.token }).ok).toBe(true);
    expect(a.post({ action: 'adminList', admin_token: t }).ok).toBe(false); // phiên cũ hết hiệu lực
    expect(a.post({ action: 'adminLogin', username: 'adminquantri', password: 'mat-khau-dai' }).ok).toBe(false);
    expect(a.post({ action: 'adminForgotFinish', username: 'adminquantri', code, new_password: 'lan-nua-12345' }).ok).toBe(false); // mã dùng một lần

    // đặt lại bằng ADMIN_KEY vẫn giữ email khôi phục
    expect(a.post({ action: 'adminInit', admin_key: a.adminKey, username: 'adminquantri', password: 'dat-lai-khoa-1' }).data.recovery_email).toBe('quantri@example.com');
  });

  it('máy chủ tài khoản sao lưu vào thư mục Google Drive và tự khôi phục khi cài lại', () => {
    const FOLDER = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
    const a = createAdmin({ folderId: FOLDER });
    expect(a.post({ action: 'ping' }).data.folder).toBe(true);
    const t = a.post({ action: 'adminInit', admin_key: a.adminKey, username: 'adminquantri', password: 'mat-khau-dai' }).data.token;
    a.post({ action: 'adminCreate', admin_token: t, username: 'lan.nguyen', name: 'Nguyễn Thị Lan', password: 'matkhau1' });
    a.post({ action: 'adminCreate', admin_token: t, username: 'binh.tran', name: 'Trần Văn Bình', password: 'matkhau2' });
    const s1 = a.post({ action: 'login', username: 'lan.nguyen', password: 'matkhau1' }).data;
    a.post({ action: 'saveVault', username: 'lan.nguyen', token: s1.token, vault: 'KET-DA-MA-HOA' });

    // tệp sao lưu có đủ tài khoản, không có mật khẩu dạng rõ, không có phiên đăng nhập
    const file = a.drive.get(FOLDER)!.get('quickplay-tai-khoan.json')!.content;
    const snap = JSON.parse(file);
    expect(snap.accounts.map((x: { username: string }) => x.username).sort()).toEqual(['binh.tran', 'lan.nguyen']);
    expect(snap.admin.username).toBe('adminquantri');
    expect(file).not.toContain('matkhau1');
    expect(file).not.toContain('mat-khau-dai');
    expect(file).not.toContain('token_hash');
    expect(file).toContain('KET-DA-MA-HOA');

    const st = a.post({ action: 'adminStorage', admin_token: t }).data;
    expect(st).toMatchObject({ folder_id: FOLDER, error: '' });
    expect(st.folder_url).toContain(FOLDER);
    expect(st.file_url).not.toBe('');
    expect(a.post({ action: 'adminStorage' }).ok).toBe(false); // chỉ quản trị xem được

    // xóa một tài khoản thì tệp sao lưu cập nhật theo
    a.post({ action: 'adminDelete', admin_token: t, username: 'binh.tran' });
    expect(JSON.parse(a.drive.get(FOLDER)!.get('quickplay-tai-khoan.json')!.content).accounts).toHaveLength(1);

    // cài lại máy chủ (dự án Apps Script mới, kho trống) vào CÙNG thư mục: tự nạp lại tài khoản
    const b = createAdmin({ folderId: FOLDER, drive: a.drive });
    expect(b.post({ action: 'adminStatus' }).data).toEqual({ has_admin: true, folder: true });
    expect(b.post({ action: 'adminLogin', username: 'adminquantri', password: 'mat-khau-dai' }).ok).toBe(true);
    const again = b.post({ action: 'login', username: 'lan.nguyen', password: 'matkhau1' });
    expect(again.data.vault).toBe('KET-DA-MA-HOA');
    expect(b.post({ action: 'login', username: 'binh.tran', password: 'matkhau2' }).ok).toBe(false);

    // không có thư mục: vẫn chạy bình thường, chỉ là không có tệp sao lưu
    const c = createAdmin();
    expect(c.post({ action: 'adminStatus' }).data).toEqual({ has_admin: false, folder: false });
    expect(c.post({ action: 'adminInit', admin_key: c.adminKey, username: 'adminquantri', password: 'mat-khau-dai' }).ok).toBe(true);
    expect(c.drive.size).toBe(0);

    // thư mục không mở được: thao tác chính vẫn thành công, lỗi được ghi lại để quản trị thấy
    const d = createAdmin({ folderId: 'KHONG_CO_THU_MUC' });
    const td = d.post({ action: 'adminInit', admin_key: d.adminKey, username: 'adminquantri', password: 'mat-khau-dai' });
    expect(td.ok).toBe(true);
    expect(d.post({ action: 'adminStorage', admin_token: td.data.token }).data.error).not.toBe('');
  });
});
