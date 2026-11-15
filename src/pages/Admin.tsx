// Trang quản trị (dành cho tác giả): cấp, khóa, đặt lại mật khẩu và xóa tài khoản giáo viên.
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Check, ChevronRight, Download, Eye, EyeOff, FileSpreadsheet, FolderOpen, KeyRound, Lock, LockOpen, LogIn, LogOut, Mail, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { DEFAULT_ADMIN_USER, adminApi, adminAuth, adminBootOk, adminEmail, adminSignedIn, adminUrl, adminUser, bootAdminPassword, markDefaultAdminPassword, setAdminUrl, usingDefaultAdminPassword, type AccountRow } from '../lib/account';
import { Wordmark } from '../components/Logo';
import { AppFooter } from '../components/AppFooter';
import { Field, Modal, useToast, askConfirm } from '../components/ui';
import { ScriptInstaller } from '../components/ScriptInstaller';
import { ADMIN_SCRIPT_VERSION, buildLinkFile, compareVersion, linkFileName, loadLink, pingScript, saveLink } from '../lib/installer';
import { downloadBlob } from '../lib/xlsx';
import { AdminGuide } from '../components/AdminGuide';
import '../installer.css';
import '../admin.css';

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
  // Email khôi phục của quản trị và hộp "quên mật khẩu"
  const [mail, setMail] = useState<null | { email: string; password: string }>(null);
  const [myEmail, setMyEmail] = useState(adminEmail());
  const [defaultPw, setDefaultPw] = useState(usingDefaultAdminPassword());
  // Nơi lưu trữ trên Google Drive của máy chủ tài khoản (thư mục + tệp sao lưu)
  // Sau khi bước 5 báo liên kết thành công: giữ nguyên màn hình để quản trị thấy tích xanh và tải tệp kết nối, bấm Tiếp tục mới sang bước sau
  // Mật khẩu giáo viên đang được mở xem (tự ẩn sau 30 giây), và phiên bản mã của máy chủ tài khoản
  const [shown, setShown] = useState<Record<string, string>>({});
  const [pwLoading, setPwLoading] = useState(false);
  const [hideAll, setHideAll] = useState(false); // ẩn tạm cả cột mật khẩu (khi chiếu màn hình cho người khác xem)
  // Lấy mật khẩu của mọi tài khoản, 6 tài khoản một lượt để máy chủ không bị dồn
  const loadAllPw = useCallback(async (list: AccountRow[]) => {
    const need = list.filter((r) => r.has_pw);
    if (!need.length) return setShown({});
    setPwLoading(true);
    const got: Record<string, string> = {};
    try {
      for (let i = 0; i < need.length; i += 6) {
        const part = await Promise.all(need.slice(i, i + 6).map((r) => adminApi.viewPassword(r.username).then((x) => [r.username, x.password] as const).catch(() => [r.username, ''] as const)));
        part.forEach(([u, pw]) => (got[u] = pw));
      }
      setShown(got);
    } finally {
      setPwLoading(false);
    }
  }, []);
  const [serverVer, setServerVer] = useState('');
  const outdated = !!serverVer && compareVersion(serverVer, ADMIN_SCRIPT_VERSION) < 0;
  const [afterLink, setAfterLink] = useState<null | { label: string; go: () => void }>(null);
  const [store, setStore] = useState<null | { folder_id: string; folder_name: string; folder_url: string; file_url: string; saved_at: string; error: string }>(null); // đang dùng mật khẩu mặc định: nhắc đổi ngay
  const [fg, setFg] = useState<null | { sentTo: string; code: string; next: string; again: string; err: string; busy: boolean }>(null);
  const envUrl = ((import.meta.env?.VITE_ADMIN_URL as string | undefined) || '').trim(); // đã đặt trên Vercel chưa
  const saveMail = async () => {
    if (!mail) return;
    try {
      const e = await adminAuth.setEmail(mail.email, mail.password);
      setMyEmail(e);
      setMail(null);
      toast(e ? 'Đã lưu email khôi phục của quản trị.' : 'Đã xóa email khôi phục.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const fgSend = async () => {
    if (!fg) return;
    setFg({ ...fg, busy: true, err: '' });
    try {
      const r = await adminAuth.forgotStart(form.username);
      setFg((f) => f && { ...f, busy: false, sentTo: r.email, code: '' });
    } catch (e) {
      setFg((f) => f && { ...f, busy: false, err: (e as Error).message });
    }
  };
  const fgFinish = async () => {
    if (!fg) return;
    if (fg.code.length !== 6) return setFg({ ...fg, err: 'Mã xác nhận gồm 6 chữ số.' });
    if (fg.next !== fg.again) return setFg({ ...fg, err: 'Hai lần nhập mật khẩu mới chưa giống nhau.' });
    setFg({ ...fg, busy: true, err: '' });
    try {
      await adminAuth.forgotFinish(form.username, fg.code, fg.next);
      setFg(null);
      setMyEmail(adminEmail());
      toast('Đã đặt lại mật khẩu quản trị.', 'ok');
      await load();
    } catch (e) {
      setFg((f) => f && { ...f, busy: false, err: (e as Error).message });
    }
  };
  // Tệp kết nối của quản trị: link máy chủ + thư mục (không có khóa, không có mật khẩu) để nạp ở máy khác
  const downloadLink = async () => {
    try {
      const old = loadLink('admin');
      const pong = await pingScript(adminUrl());
      const info = {
        role: 'admin' as const, script_url: adminUrl(), folder_url: store?.folder_url ?? old?.folder_url ?? '', folder_id: store?.folder_id ?? old?.folder_id ?? '',
        folder_name: store?.folder_name ?? old?.folder_name ?? '', key: '', server_version: pong.version, linked_at: old?.script_url === adminUrl() && old.linked_at ? old.linked_at : new Date().toISOString(),
      };
      saveLink(info, 'admin');
      downloadBlob(linkFileName('admin'), new Blob([buildLinkFile(info)], { type: 'application/json' }));
      toast('Đã tải tệp kết nối. Ở máy khác: chọn vai trò Quản trị rồi bấm Nạp tệp kết nối.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  // Xuất danh sách tài khoản, mật khẩu ra Excel
  const exportXlsx = async () => {
    if (!rows?.length) return toast('Chưa có tài khoản nào để xuất.', 'info');
    try {
      const { buildXlsx, downloadBlob: save } = await import('../lib/xlsx');
      const fmt = (t?: number) => (t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
      const head = ['STT', 'Tên đăng nhập', 'Họ tên', 'Mật khẩu', 'Mật khẩu do', 'Ngày đặt mật khẩu', 'Email', 'Trạng thái', 'Đã cài kho riêng', 'Đăng nhập gần nhất', 'Ngày cấp'];
      const body = rows.map((r, i) => [
        i + 1, r.username, r.name, shown[r.username] ?? '', r.pw_by === 'teacher' ? 'Giáo viên tự đổi' : r.pw_by === 'admin' ? 'Quản trị cấp' : '',
        fmt(r.pw_at), r.email ?? '', r.locked ? 'Đang khóa' : 'Hoạt động', r.configured ? 'Rồi' : 'Chưa', fmt(r.last_login) || 'Chưa đăng nhập', fmt(r.created_at),
      ]);
      const info = [
        ['Danh sách tài khoản giáo viên Quickplay'],
        [`Xuất lúc ${fmt(Date.now())} · ${rows.length} tài khoản · trang đăng nhập giáo viên: ${location.origin}/teacher`],
        ['Tệp có mật khẩu: chỉ lưu ở nơi an toàn, không gửi lên nhóm chung.'],
        [],
      ];
      const day = new Date().toISOString().slice(0, 10);
      save(`quickplay-tai-khoan-giao-vien-${day}.xlsx`, await buildXlsx([{ name: 'Tài khoản', rows: [...info, head, ...body] }]));
      toast(`Đã xuất ${rows.length} tài khoản ra Excel.`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const copy = (text: string, ok: string) => navigator.clipboard.writeText(text).then(() => toast(ok, 'ok')).catch(() => toast('Trình duyệt không cho sao chép. Hãy bôi đen rồi nhấn Ctrl + C.', 'error'));
  const site = location.origin;
  // Bước đang làm trong bảng hướng dẫn
  const guideAt = step === 'server' || step === 'checking' ? 1 : step === 'init' ? 2 : step === 'login' ? 2 : !myEmail ? 3 : !envUrl ? 4 : rows && rows.length ? 6 : 5;

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const list = await adminApi.list();
      setRows(list);
      setStep('in');
      loadAllPw(list);
      adminApi.storage().then(setStore).catch(() => setStore(null));
      pingScript(adminUrl()).then((r) => setServerVer(r.version)).catch(() => {});
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
      setMyEmail(adminEmail());
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
      markDefaultAdminPassword(false);
      setDefaultPw(false);
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
    run(() => adminApi.resetPassword(r.username, password).then(() => { setIssued({ username: r.username, password }); setShown((m) => ({ ...m, [r.username]: password })); }), 'Đã đặt lại mật khẩu.');
  };

  if (step === 'server' && !adminBootOk()) return <Navigate to="/login?role=admin" replace />;

  return (
    <div className="page stack adm-page" style={{ gap: 18 }}>
      <div className="row between">
        <Link to="/" aria-label="Quickplay – Trang chủ"><Wordmark /></Link>
        <span className="badge blue">Quản trị toàn hệ thống</span>
      </div>

      <div className={`adm-top ${step === 'in' ? 'two' : ''}`}>
      {step !== 'in' && <AdminGuide at={guideAt} site={site} linked={!!envUrl} serverUrl={adminUrl()} copy={copy} />}
      <div className="adm-side stack">

      {step === 'server' && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Kết nối máy chủ tài khoản</h2>
          <Field label="Địa chỉ Web App của máy chủ tài khoản" help="Lấy sau khi triển khai apps-script-admin/Code.gs. Khi đưa lên Vercel, đặt địa chỉ này vào biến VITE_ADMIN_URL thì không phải dán ở đây nữa và mọi giáo viên đều phải đăng nhập.">
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
          </Field>
          <div className="row"><button className="btn primary" onClick={saveServer}><KeyRound size={18} /> Kết nối</button></div>
          <p className="muted" style={{ margin: 0 }}>Chưa có máy chủ tài khoản? Làm theo 5 bước dưới đây (một lần, khoảng 5 phút). Xong bước 5 phần mềm chuyển ngay sang đặt mật khẩu quản trị.</p>
          <ScriptInstaller kind="admin" onDone={async (r) => {
            setAdminUrl(r.scriptUrl);
            setUrl(r.scriptUrl);
            // Có khóa (vừa cài mới) thì kiểm tra luôn quyền quản trị và thư mục Google Drive lưu trữ
            let folder: { folderName?: string; folderUrl?: string } = {};
            if (r.key) {
              const sto = await adminApi.storageByKey(r.key);
              if (sto.error) throw new Error(sto.error);
              if (!sto.folder_id) throw new Error('Máy chủ chưa nhận được thư mục Google Drive. Hãy lưu link thư mục ở bước 1, bấm Sao chép mã rồi dán lại mã vào Apps Script.');
              folder = { folderName: sto.folder_name, folderUrl: sto.folder_url };
            }
            const st = await adminAuth.status();
            const first = bootAdminPassword();
            if (!st.has_admin && first) {
              // Máy chủ vừa cài xong: lấy luôn tài khoản và mật khẩu mặc định vừa đăng nhập làm tài khoản quản trị, rồi nhắc đổi mật khẩu
              await adminAuth.init(r.key, DEFAULT_ADMIN_USER, first);
              markDefaultAdminPassword(true);
              setDefaultPw(true);
              toast('Đã kết nối máy chủ tài khoản. Tài khoản mặc định giờ là tài khoản quản trị.', 'ok');
              setAfterLink({ label: 'Tiếp tục: vào trang quản lý tài khoản', go: () => { setAfterLink(null); load(); } });
              return folder;
            }
            setForm((f) => ({ ...f, key: r.key }));
            const next = st.has_admin ? 'login' as const : 'init' as const;
            setAfterLink({ label: next === 'login' ? 'Tiếp tục: đăng nhập quản trị' : 'Tiếp tục: đặt mật khẩu quản trị', go: () => { setAfterLink(null); setStep(next); } });
            return folder;
          }} />
          {afterLink && <button className="btn primary lg" style={{ alignSelf: 'flex-start' }} onClick={afterLink.go}>{afterLink.label} <ChevronRight size={20} /></button>}
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
            {step === 'login' && <button type="button" className="btn ghost" onClick={() => setFg({ sentTo: '', code: '', next: '', again: '', err: '', busy: false })}><Mail size={16} /> Quên mật khẩu?</button>}
            {step === 'login' && <button type="button" className="btn ghost" onClick={() => setStep('init')}>Đặt lại bằng ADMIN_KEY</button>}
            {step === 'init' && <button type="button" className="btn ghost" onClick={check}>Quay lại đăng nhập</button>}
          </div>
          <small className="muted">Máy chủ: {adminUrl().replace(/^https?:\/\//, '').slice(0, 44)}… <button type="button" className="btn sm ghost" onClick={async () => { if (await askConfirm('Bỏ địa chỉ máy chủ tài khoản khỏi trình duyệt này?')) { setAdminUrl(''); setUrl(''); setStep('server'); } }}>Đổi máy chủ</button></small>
        </form>
      )}

      {step === 'in' && store && (
        store.error ? (
          <div className="alert error" role="alert"><div><b>Chưa ghi được tệp sao lưu vào thư mục Google Drive:</b> {store.error}</div></div>
        ) : store.folder_id ? (
          <div className="conn-ok" role="status" style={{ flexWrap: 'wrap' }}>
            <FolderOpen size={20} /> Thư mục lưu trữ: {store.folder_name || store.folder_id}
            <a className="btn sm ghost" href={store.folder_url} target="_blank" rel="noopener noreferrer">Mở thư mục</a>
            <button className="btn sm ghost" onClick={downloadLink} title={`Máy chủ tài khoản · phần mềm cần phiên bản ${ADMIN_SCRIPT_VERSION}`}><Download size={16} /> Tải tệp kết nối (.json)</button>
            {(() => { const l = loadLink('admin'); return l?.script_url === adminUrl() && l.server_version ? <small style={{ fontWeight: 600 }}>Máy chủ phiên bản {l.server_version} · liên kết lúc {new Date(l.linked_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</small> : null; })()}
            {store.saved_at && <small style={{ fontWeight: 600 }}>Tệp sao lưu tài khoản cập nhật lúc {new Date(store.saved_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</small>}
          </div>
        ) : (
          <div className="conn-off" role="status"><FolderOpen size={20} /> Máy chủ tài khoản này chưa có thư mục Google Drive lưu trữ. Muốn có tệp sao lưu, hãy cài lại bằng Trình cài đặt (bước 1: dán link thư mục và bấm Lưu link).</div>
        )
      )}
      {step === 'in' && defaultPw && (
        <div className="alert ok" role="status">
          <div>
            Đang dùng <b>mật khẩu quản trị mặc định</b>. Có thể giữ nguyên, hoặc đổi sang mật khẩu riêng bất cứ lúc nào.
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              <button className="btn sm" onClick={() => { markDefaultAdminPassword(false); setDefaultPw(false); }}>Giữ mật khẩu hiện tại</button>
              <button className="btn sm ghost" onClick={() => setPw({ password: '', next: '', again: '' })}><KeyRound size={16} /> Đổi mật khẩu quản trị</button>
            </div>
          </div>
        </div>
      )}
      {step === 'in' && (
        <div className="row between">
          <span className="badge green"><ShieldCheck size={14} /> Đang đăng nhập: {adminUser() || 'quản trị'}</span>
          <div className="row">
            <button className={`btn sm ${myEmail ? '' : 'accent'}`} onClick={() => setMail({ email: myEmail, password: '' })}><Mail size={16} /> Email khôi phục{myEmail ? <Check size={14} /> : ': chưa khai báo'}</button>
            <button className="btn sm" onClick={() => setPw({ password: '', next: '', again: '' })}><KeyRound size={16} /> Đổi mật khẩu quản trị</button>
            <button className="btn sm ghost" onClick={signOut}><LogOut size={16} /> Đăng xuất</button>
          </div>
        </div>
      )}

      {step === 'in' && (
        <details className="card stack" open={outdated}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
            Máy chủ tài khoản{serverVer ? `: đang chạy phiên bản ${serverVer}` : ''}
            {outdated ? <span className="badge amber" style={{ marginLeft: 8 }}>Cần cập nhật lên {ADMIN_SCRIPT_VERSION}</span> : serverVer ? <span className="badge green" style={{ marginLeft: 8 }}>Mới nhất</span> : null}
          </summary>
          {outdated && <div className="alert warn" role="status"><div><b>Phần mềm đã có mã máy chủ mới ({ADMIN_SCRIPT_VERSION}).</b> Một số chức năng (tên tài khoản có ký tự đặc biệt, xem mật khẩu giáo viên, gửi mật khẩu mới qua email) chỉ chạy sau khi cập nhật. Chọn thẻ <b>Cập nhật bản mới</b> bên dưới: Sao chép mã → dán đè vào dự án Apps Script đang dùng → Triển khai <b>Phiên bản mới</b> → bấm Kiểm tra. Link và tài khoản giữ nguyên.</div></div>}
          <ScriptInstaller kind="admin" current={{ scriptUrl: adminUrl(), folderUrl: store?.folder_url ?? '' }} onDone={async () => {
            const sto = await adminApi.storage();
            setStore(sto);
            const pong = await pingScript(adminUrl());
            setServerVer(pong.version);
            if (sto.error) throw new Error(sto.error);
            return { folderName: sto.folder_name, folderUrl: sto.folder_url };
          }} />
        </details>
      )}

      </div>
      </div>

      {step === 'in' && rows && (
        <section className="card stack">
          <div className="row between">
            <h2 style={{ margin: 0 }}>Tài khoản giáo viên ({rows.length})</h2>
            <div className="row">
              <button className="btn ghost" onClick={() => setHideAll((v) => !v)} aria-pressed={hideAll} title="Ẩn hoặc hiện cột mật khẩu (khi chiếu màn hình)">{hideAll ? <><Eye size={18} /> Hiện mật khẩu</> : <><EyeOff size={18} /> Ẩn mật khẩu</>}</button>
              <button className="btn ghost" onClick={load} disabled={busy}><RefreshCw size={18} /> Tải lại</button>
              <button className="btn success" onClick={exportXlsx} disabled={!rows.length || pwLoading} title={pwLoading ? 'Đang lấy mật khẩu…' : undefined}><FileSpreadsheet size={18} /> Xuất Excel</button>
              <button className="btn primary" onClick={() => setAdd({ username: '', name: '', password: randomPassword() })}><UserPlus size={18} /> Cấp tài khoản</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table adm-table">
              <thead><tr><th>#</th><th>Tên đăng nhập</th><th>Họ tên</th><th>Mật khẩu</th><th>Email</th><th>Trạng thái</th><th>Kho riêng</th><th>Đăng nhập gần nhất</th><th className="adm-act-h">Thao tác</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.username}>
                    <td className="muted" data-label="#">{i + 1}</td>
                    <td className="adm-mono" data-label="Tên đăng nhập"><b>{r.username}</b></td>
                    <td data-label="Họ tên">{r.name}</td>
                    <td className="adm-mono" data-label="Mật khẩu">
                      {hideAll ? <span className="muted">••••••</span>
                        : shown[r.username] ? <b>{shown[r.username]}</b>
                        : pwLoading && r.has_pw ? <span className="muted">đang lấy…</span>
                        : <span className="muted adm-note">chưa lưu (bấm Đặt lại mật khẩu để xem được)</span>}
                      {r.pw_by === 'teacher' && <small className="muted adm-note">giáo viên tự đổi{r.pw_at ? ` ${new Date(r.pw_at).toLocaleDateString('vi-VN')}` : ''}</small>}
                    </td>
                    <td style={{ overflowWrap: 'anywhere' }} data-label="Email">{r.email || (r.has_email ? 'Đã khai báo' : <span className="muted">Chưa</span>)}</td>
                    <td data-label="Trạng thái">{r.locked ? <span className="badge red">Đang khóa</span> : <span className="badge green">Hoạt động</span>}</td>
                    <td data-label="Kho riêng">{r.configured ? 'Rồi' : 'Chưa'}</td>
                    <td data-label="Đăng nhập gần nhất">{r.last_login ? new Date(r.last_login).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : <span className="muted">Chưa đăng nhập</span>}</td>
                    <td data-label="Thao tác">
                      <span className="row" style={{ gap: 6, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                        <button className="btn icon sm" onClick={() => run(() => adminApi.setLocked(r.username, !r.locked), r.locked ? 'Đã mở khóa.' : 'Đã khóa tài khoản.')}
                          aria-label={`${r.locked ? 'Mở khóa' : 'Khóa'} tài khoản ${r.username}`} title={r.locked ? 'Mở khóa' : 'Khóa tài khoản'}>
                          {r.locked ? <LockOpen size={16} /> : <Lock size={16} />}
                        </button>
                        <button className="btn icon sm" onClick={() => reset(r)} aria-label={`Đặt lại mật khẩu cho ${r.username}`} title="Đặt lại mật khẩu"><KeyRound size={16} /></button>
                        <button className="btn icon sm danger" aria-label={`Xóa tài khoản ${r.username}`} onClick={async () => (await askConfirm(`Xóa tài khoản "${r.username}"? Dữ liệu trên Drive của giáo viên không bị xóa.`)) && run(() => adminApi.remove(r.username), 'Đã xóa tài khoản.')}><Trash2 size={16} /></button>
                      </span>
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={9} className="muted">Chưa có tài khoản nào. Bấm “Cấp tài khoản”.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="help" style={{ margin: 0 }}>
            Máy chủ tài khoản giữ tên tài khoản, email và mật khẩu của giáo viên (kể cả mật khẩu giáo viên đã tự đổi). Bấm <b>Ẩn mật khẩu</b> trước khi chiếu màn hình cho người khác xem.
            Bộ câu hỏi và kết quả học sinh nằm trong Google Drive riêng của từng giáo viên. Lưu ý: vì quản trị xem được mật khẩu, về kỹ thuật quản trị có thể đăng nhập thay giáo viên;
            hãy giữ kín tài khoản quản trị. Tệp sao lưu trên Google Drive không chứa mật khẩu dạng xem được.
          </p>
        </section>
      )}

      {step === 'in' && <AdminGuide at={guideAt} site={site} linked={!!envUrl} serverUrl={adminUrl()} copy={copy} />}

      {add && (
        <Modal title="Cấp tài khoản giáo viên" onClose={() => setAdd(null)} footer={<button className="btn primary" onClick={create}><Plus size={18} /> Tạo tài khoản</button>}>
          <div className="stack">
            <Field label="Tên tài khoản" help="3–32 ký tự, không có dấu cách. Dùng được: toàn số (ví dụ số căn cước), chữ không dấu, chữ kết hợp số, và các ký tự . _ - @ + ! # $ % & * = ? ~ ^  Không phân biệt chữ hoa, chữ thường.">
              <input className="input" value={add.username} onChange={(e) => setAdd({ ...add, username: e.target.value })} autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field label="Họ tên giáo viên"><input className="input" value={add.name} maxLength={60} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
            <Field label="Mật khẩu ban đầu" help="Từ 6 ký tự. Đặt đơn giản toàn số cũng được, hoặc kết hợp chữ hoa, chữ thường, số, ký tự đặc biệt. Giáo viên có thể giữ nguyên hoặc tự đổi trong mục Cài đặt.">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} autoComplete="off" />
                <button type="button" className="btn" onClick={() => setAdd({ ...add, password: randomPassword() })}>Tạo ngẫu nhiên</button>
              </div>
            </Field>
          </div>
        </Modal>
      )}
      {mail && (
        <Modal title="Email khôi phục của quản trị" onClose={() => setMail(null)} footer={<button className="btn success" onClick={saveMail} disabled={!mail.password}><Mail size={18} /> Lưu email khôi phục</button>}>
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>Khi quên mật khẩu, bấm <b>Quên mật khẩu?</b> ở màn đăng nhập quản trị: phần mềm gửi mã 6 số tới email này để đặt mật khẩu mới.{myEmail ? <> Email đang dùng: <b>{myEmail}</b>.</> : null}</p>
            <Field label="Email khôi phục (để trống = xóa)"><input className="input" type="email" value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} placeholder="email-ca-nhan@gmail.com" autoComplete="email" /></Field>
            <Field label="Mật khẩu quản trị hiện tại (để xác nhận)"><input className="input" type="password" value={mail.password} onChange={(e) => setMail({ ...mail, password: e.target.value })} autoComplete="current-password" /></Field>
            <small className="muted">Nên dùng email cá nhân mà chỉ quản trị mở được. Thư do chính tài khoản Google đã cài máy chủ tài khoản gửi đi.</small>
          </div>
        </Modal>
      )}
      {fg && (
        <Modal title="Quên mật khẩu quản trị" onClose={() => setFg(null)}>
          <div className="stack">
            {!fg.sentTo ? (
              <>
                <p className="muted" style={{ margin: 0 }}>Phần mềm gửi mã 6 số tới email khôi phục của tài khoản <b>{form.username || '…'}</b>. Tài khoản giáo viên và dữ liệu không bị ảnh hưởng.</p>
                <button type="button" className="btn primary" onClick={fgSend} disabled={fg.busy || !form.username.trim()}><Mail size={18} /> {fg.busy ? 'Đang gửi…' : 'Gửi mã về email khôi phục'}</button>
                <small className="muted">Chưa khai báo email khôi phục: đóng hộp này và bấm <b>Đặt lại bằng ADMIN_KEY</b>. Khóa này nằm trong dự án Apps Script của máy chủ tài khoản: biểu tượng bánh răng <b>Cài đặt dự án</b> → <b>Thuộc tính tập lệnh</b> → <code>ADMIN_KEY</code>.</small>
              </>
            ) : (
              <>
                <div className="alert ok" role="status"><div>Đã gửi mã 6 số tới <b>{fg.sentTo}</b>. Mã có hiệu lực 15 phút. Nếu chưa thấy, hãy xem cả mục Thư rác.</div></div>
                <Field label="Mã 6 số trong email"><input className="input" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={fg.code} onChange={(e) => setFg({ ...fg, code: e.target.value.replace(/\D/g, '') })} style={{ letterSpacing: '0.4em', textAlign: 'center', fontWeight: 800, fontSize: '1.3rem' }} /></Field>
                <Field label="Mật khẩu quản trị mới" help="Từ 8 đến 72 ký tự."><input className="input" type="password" value={fg.next} onChange={(e) => setFg({ ...fg, next: e.target.value })} autoComplete="new-password" /></Field>
                <Field label="Nhập lại mật khẩu mới"><input className="input" type="password" value={fg.again} onChange={(e) => setFg({ ...fg, again: e.target.value })} autoComplete="new-password" /></Field>
                <button type="button" className="btn success" onClick={fgFinish} disabled={fg.busy}><ShieldCheck size={18} /> Đặt lại mật khẩu</button>
                <button type="button" className="btn ghost sm" onClick={fgSend} disabled={fg.busy}>Gửi lại mã (sau 1 phút)</button>
              </>
            )}
            {fg.err && <div className="alert error" role="alert"><div>{fg.err}</div></div>}
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
          <p>Mật khẩu: <b style={{ fontSize: '1.3rem', letterSpacing: '0.08em' }}>{issued.password}</b></p>
          <p className="muted small" style={{ margin: 0 }}>Mật khẩu chỉ hiện lần này. Máy chủ chỉ lưu bản đã băm nên không xem lại được.</p>
        </Modal>
      )}
      <AppFooter />
    </div>
  );
}
