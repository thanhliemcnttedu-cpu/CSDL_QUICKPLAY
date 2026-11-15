// Trang quản trị (dành cho tác giả): cấp, khóa, đặt lại mật khẩu và xóa tài khoản giáo viên.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Lock, LockOpen, LogIn, LogOut, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { DEFAULT_ADMIN_USER, adminApi, adminAuth, adminSignedIn, adminUrl, adminUser, setAdminUrl, type AccountRow } from '../lib/account';
import { Wordmark } from '../components/Logo';
import { AppFooter } from '../components/AppFooter';
import { Field, Modal, useToast, askConfirm } from '../components/ui';

const randomPassword = () => {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(r, (b) => abc[b % abc.length]).join('');
};

export default function Admin() {
  const toast = useToast();
  const [url, setUrl] = useState(adminUrl());
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState<null | { username: string; name: string; password: string }>(null);
  const [issued, setIssued] = useState<null | { username: string; password: string }>(null);
  // Bước đăng nhập của quản trị: chưa có địa chỉ máy chủ → 'server'; máy chủ chưa có tài khoản quản trị → 'init';
  // đã có → 'login'; đăng nhập xong → 'in'
  const [step, setStep] = useState<'server' | 'checking' | 'init' | 'login' | 'in'>(adminUrl() ? 'checking' : 'server');
  const [form, setForm] = useState({ key: '', username: DEFAULT_ADMIN_USER, password: '', again: '' });
  const [pw, setPw] = useState<null | { password: string; next: string; again: string }>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await adminApi.list());
      setStep('in');
    } catch (e) {
      toast((e as Error).message, 'error');
      setRows(null);
      setStep('login'); // phiên hết hạn: đăng nhập lại
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const check = useCallback(async () => {
    setStep('checking');
    try {
      const st = await adminAuth.status();
      if (!st.has_admin) setStep('init');
      else if (adminSignedIn()) await load();
      else setStep('login');
    } catch (e) {
      toast((e as Error).message, 'error');
      setStep('server');
    }
  }, [load, toast]);
  useEffect(() => {
    if (adminUrl()) check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveServer = async () => {
    if (!/^https?:\/\//.test(url.trim())) return toast('Hãy dán địa chỉ Web App của máy chủ tài khoản.', 'error');
    setAdminUrl(url);
    await check();
  };
  const submit = async (kind: 'init' | 'login') => {
    if (kind === 'init' && form.password !== form.again) return toast('Hai lần nhập mật khẩu chưa giống nhau.', 'error');
    setBusy(true);
    try {
      if (kind === 'init') await adminAuth.init(form.key, form.username, form.password);
      else await adminAuth.login(form.username, form.password);
      setForm({ key: '', username: form.username, password: '', again: '' });
      toast(kind === 'init' ? 'Đã thiết lập tài khoản quản trị.' : 'Đăng nhập quản trị thành công.', 'ok');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    await adminAuth.logout();
    setRows(null);
    setStep('login');
  };
  const changePw = async () => {
    if (!pw) return;
    if (pw.next !== pw.again) return toast('Hai lần nhập mật khẩu mới chưa giống nhau.', 'error');
    try {
      await adminAuth.changePassword(pw.password, pw.next);
      setPw(null);
      toast('Đã đổi mật khẩu quản trị.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok, 'ok');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const create = async () => {
    if (!add) return;
    try {
      await adminApi.create(add.username, add.name, add.password);
      setIssued({ username: add.username.trim().toLowerCase(), password: add.password });
      setAdd(null);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const reset = async (r: AccountRow) => {
    if (!(await askConfirm(`Đặt lại mật khẩu cho "${r.username}"?\nGiáo viên sẽ phải nhập lại link thư mục và link Apps Script sau khi đăng nhập (dữ liệu trên Drive của giáo viên không mất).`))) return;
    const password = randomPassword();
    run(() => adminApi.resetPassword(r.username, password).then(() => setIssued({ username: r.username, password })), 'Đã đặt lại mật khẩu.');
  };

  return (
    <div className="page stack" style={{ gap: 18, maxWidth: 980 }}>
      <div className="row between">
        <Link to="/" aria-label="Quickplay – Trang chủ"><Wordmark /></Link>
        <span className="badge blue">Quản trị toàn hệ thống</span>
      </div>

      {step === 'server' && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Kết nối máy chủ tài khoản</h2>
          <Field label="Địa chỉ Web App của máy chủ tài khoản" help="Lấy sau khi triển khai apps-script-admin/Code.gs. Khi đưa lên Vercel, đặt địa chỉ này vào biến VITE_ADMIN_URL thì không phải dán ở đây nữa và mọi giáo viên đều phải đăng nhập.">
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
          </Field>
          <div className="row"><button className="btn primary" onClick={saveServer}><KeyRound size={18} /> Kết nối</button></div>
        </section>
      )}
      {step === 'checking' && <section className="card"><p className="muted" style={{ margin: 0 }}>Đang kết nối máy chủ tài khoản…</p></section>}

      {(step === 'init' || step === 'login') && (
        <form className="card stack" style={{ maxWidth: 520, width: '100%', margin: '0 auto' }} onSubmit={(e) => { e.preventDefault(); submit(step); }}>
          <h2 className="row" style={{ margin: 0, gap: 8 }}><ShieldCheck size={24} color="var(--primary)" /> {step === 'init' ? 'Thiết lập tài khoản quản trị' : 'Đăng nhập quản trị'}</h2>
          {step === 'init' && (
            <>
              <p className="muted" style={{ margin: 0 }}>Làm một lần. Mật khẩu do quản trị tự đặt ở đây và chỉ được lưu trên máy chủ dưới dạng đã băm, không nằm trong mã nguồn phần mềm.</p>
              <Field label="Khóa quản trị (ADMIN_KEY)" help="In ra trong Nhật ký thực thi khi chạy hàm setup() của máy chủ tài khoản. Chỉ cần ở bước này và khi quên mật khẩu.">
                <input className="input" type="password" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} autoComplete="off" required />
              </Field>
            </>
          )}
          <Field label="Tên tài khoản quản trị">
            <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoCapitalize="none" spellCheck={false} autoComplete="username" required />
          </Field>
          <Field label="Mật khẩu" help={step === 'init' ? 'Từ 8 đến 72 ký tự.' : undefined}>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete={step === 'init' ? 'new-password' : 'current-password'} required />
          </Field>
          {step === 'init' && (
            <Field label="Nhập lại mật khẩu">
              <input className="input" type="password" value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} autoComplete="new-password" required />
            </Field>
          )}
          <div className="row">
            <button className="btn primary" type="submit" disabled={busy}>{step === 'init' ? <><ShieldCheck size={18} /> Lưu tài khoản quản trị</> : <><LogIn size={18} /> Đăng nhập</>}</button>
            {step === 'login' && <button type="button" className="btn ghost" onClick={() => setStep('init')}>Quên mật khẩu? Đặt lại bằng ADMIN_KEY</button>}
            {step === 'init' && <button type="button" className="btn ghost" onClick={check}>Quay lại đăng nhập</button>}
          </div>
          <small className="muted">Máy chủ: {adminUrl().replace(/^https?:\/\//, '').slice(0, 44)}… <button type="button" className="btn sm ghost" onClick={async () => { if (await askConfirm('Bỏ địa chỉ máy chủ tài khoản khỏi trình duyệt này?')) { setAdminUrl(''); setUrl(''); setStep('server'); } }}>Đổi máy chủ</button></small>
        </form>
      )}

      {step === 'in' && (
        <div className="row between">
          <span className="badge green"><ShieldCheck size={14} /> Đang đăng nhập: {adminUser() || 'quản trị'}</span>
          <div className="row">
            <button className="btn sm" onClick={() => setPw({ password: '', next: '', again: '' })}><KeyRound size={16} /> Đổi mật khẩu quản trị</button>
            <button className="btn sm ghost" onClick={signOut}><LogOut size={16} /> Đăng xuất</button>
          </div>
        </div>
      )}

      {step === 'in' && rows && (
        <section className="card stack">
          <div className="row between">
            <h2 style={{ margin: 0 }}>Tài khoản giáo viên ({rows.length})</h2>
            <div className="row">
              <button className="btn ghost" onClick={load} disabled={busy}><RefreshCw size={18} /> Tải lại</button>
              <button className="btn primary" onClick={() => setAdd({ username: '', name: '', password: randomPassword() })}><UserPlus size={18} /> Cấp tài khoản</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Trạng thái</th><th>Đã cài kho riêng</th><th>Đăng nhập gần nhất</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.username}>
                    <td><b>{r.username}</b></td>
                    <td>{r.name}</td>
                    <td>{r.locked ? <span className="badge red">Đang khóa</span> : <span className="badge green">Hoạt động</span>}</td>
                    <td>{r.configured ? 'Rồi' : 'Chưa'}</td>
                    <td>{r.last_login ? new Date(r.last_login).toLocaleString('vi-VN') : 'Chưa đăng nhập'}</td>
                    <td>
                      <span className="row" style={{ gap: 6, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                        <button className="btn sm" onClick={() => run(() => adminApi.setLocked(r.username, !r.locked), r.locked ? 'Đã mở khóa.' : 'Đã khóa tài khoản.')}>
                          {r.locked ? <><LockOpen size={16} /> Mở khóa</> : <><Lock size={16} /> Khóa</>}
                        </button>
                        <button className="btn sm" onClick={() => reset(r)}><KeyRound size={16} /> Đặt lại mật khẩu</button>
                        <button className="btn icon sm danger" aria-label={`Xóa tài khoản ${r.username}`} onClick={async () => (await askConfirm(`Xóa tài khoản "${r.username}"? Dữ liệu trên Drive của giáo viên không bị xóa.`)) && run(() => adminApi.remove(r.username), 'Đã xóa tài khoản.')}><Trash2 size={16} /></button>
                      </span>
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={6} className="muted">Chưa có tài khoản nào. Bấm “Cấp tài khoản”.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="help" style={{ margin: 0 }}>
            Máy chủ này chỉ giữ tên tài khoản, mật khẩu đã băm và cấu hình đã mã hóa của giáo viên. Bộ câu hỏi và kết quả học sinh nằm trong Google Drive riêng của từng giáo viên, quản trị không xem được.
          </p>
        </section>
      )}

      {add && (
        <Modal title="Cấp tài khoản giáo viên" onClose={() => setAdd(null)} footer={<button className="btn primary" onClick={create}><Plus size={18} /> Tạo tài khoản</button>}>
          <div className="stack">
            <Field label="Tên tài khoản" help="3–32 ký tự: chữ thường không dấu, số, dấu chấm, gạch nối. Ví dụ: lan.nguyen">
              <input className="input" value={add.username} onChange={(e) => setAdd({ ...add, username: e.target.value })} autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field label="Họ tên giáo viên"><input className="input" value={add.name} maxLength={60} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
            <Field label="Mật khẩu ban đầu" help="Ít nhất 6 ký tự. Giáo viên có thể tự đổi trong mục Cài đặt.">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} autoComplete="off" />
                <button type="button" className="btn" onClick={() => setAdd({ ...add, password: randomPassword() })}>Tạo ngẫu nhiên</button>
              </div>
            </Field>
          </div>
        </Modal>
      )}
      {pw && (
        <Modal title="Đổi mật khẩu quản trị" onClose={() => setPw(null)} footer={<button className="btn primary" onClick={changePw}>Lưu mật khẩu mới</button>}>
          <div className="stack">
            <Field label="Mật khẩu hiện tại"><input className="input" type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} autoComplete="current-password" /></Field>
            <Field label="Mật khẩu mới" help="Từ 8 đến 72 ký tự."><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Nhập lại mật khẩu mới"><input className="input" type="password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} autoComplete="new-password" /></Field>
          </div>
        </Modal>
      )}
      {issued && (
        <Modal title="Gửi thông tin này cho giáo viên" onClose={() => setIssued(null)} footer={<button className="btn primary" onClick={() => navigator.clipboard.writeText(`Tài khoản Quickplay\nTên tài khoản: ${issued.username}\nMật khẩu: ${issued.password}`).then(() => toast('Đã chép.', 'ok'))}>Chép để gửi</button>}>
          <p>Tên tài khoản: <b>{issued.username}</b></p>
          <p>Mật khẩu: <b style={{ fontFamily: 'monospace', fontSize: '1.2rem' }}>{issued.password}</b></p>
          <p className="muted small" style={{ margin: 0 }}>Mật khẩu chỉ hiện lần này. Máy chủ chỉ lưu bản đã băm nên không xem lại được.</p>
        </Modal>
      )}
      <AppFooter />
    </div>
  );
}
