// Cửa sổ đăng nhập: chọn vai trò (Quản trị / Giáo viên) rồi mới nhập tên đăng nhập và mật khẩu.
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, GraduationCap, KeyRound, LogIn, Mail, ShieldCheck, Upload } from 'lucide-react';
import {
  DEFAULT_ADMIN_USER, accountRequired, adminAuth, adminBootLogin, adminSignedIn, adminUrl, currentAccount, forgotFinish, forgotStart, isDefaultAdminPassword, login, markDefaultAdminPassword, setAdminUrl,
} from '../lib/account';
import { parseLinkFile, pingScript, saveLink } from '../lib/installer';
import { pickFile } from '../components/MediaTools';
import { Wordmark } from '../components/Logo';
import { AppFooter } from '../components/AppFooter';
import { Modal, useToast } from '../components/ui';
import '../login.css';

type Role = 'admin' | 'teacher';

export default function Login({ role: fixed }: { role?: Role }) {
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const asked = params.get('role');
  // Đăng nhập xong quay về đúng trang đang dùng dở (ví dụ máy quét thẻ mở từ mã QR trên màn chiếu)
  const nextRaw = params.get('next') ?? '';
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : null;
  const [role, setRole] = useState<Role | null>(fixed ?? (asked === 'admin' || asked === 'teacher' ? asked : null));
  const [username, setUsername] = useState(role === 'admin' ? DEFAULT_ADMIN_USER : '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Quên mật khẩu (giáo viên): bước 1 nhập tên tài khoản để nhận mã qua email khôi phục; bước 2 nhập mã và mật khẩu mới
  const [fg, setFg] = useState<null | { username: string; sentTo: string; code: string; next: string; again: string; err: string; busy: boolean; help: boolean }>(null);

  // Đã đăng nhập thì vào thẳng, không hỏi lại mật khẩu (chỉ hỏi lại sau khi bấm Đăng xuất)
  const teacherIn = !!currentAccount();
  const adminIn = !!adminUrl() && adminSignedIn();
  if (role === 'teacher' && teacherIn) return <Navigate to={next ?? '/teacher'} replace />;
  if (role === 'admin' && adminIn) return <Navigate to="/admin" replace />;
  // Vừa bấm Đăng xuất (…/login?chon=1): luôn hiện ô chọn vai trò, không tự chuyển vào vai trò còn đăng nhập trên máy này
  const choose = params.get('chon') === '1';
  if (!role && !choose && teacherIn && !adminIn) return <Navigate to="/teacher" replace />;
  if (!role && !choose && adminIn && !teacherIn) return <Navigate to="/admin" replace />;

  const pick = (r: Role) => {
    if (r === 'teacher' && teacherIn) return nav(next ?? '/teacher');
    if (r === 'admin' && adminIn) return nav('/admin');
    setRole(r);
    setErr('');
    setPassword('');
    setUsername(r === 'admin' ? DEFAULT_ADMIN_USER : '');
  };

  const submitTeacher = async () => {
    const r = await login(username, password);
    // Lần đầu: chưa có link thư mục và Apps Script → mở Cài đặt để làm Trình cài đặt một lần
    nav(next && r.configured ? next : r.configured ? '/teacher' : '/teacher/settings?first=1', { replace: true });
  };
  const submitAdmin = async () => {
    const bad = 'Tên tài khoản hoặc mật khẩu quản trị không đúng.';
    if (!adminUrl()) {
      // Trang web chưa biết máy chủ tài khoản: đây là lần thiết lập đầu tiên, chỉ quản trị (tài khoản mặc định) mới được mở Trình cài đặt
      if (!(await adminBootLogin(username, password))) throw new Error(bad);
      return nav('/admin', { replace: true });
    }
    const st = await adminAuth.status();
    if (!st.has_admin) {
      // Máy chủ đã cài nhưng chưa đặt mật khẩu quản trị
      if (!(await adminBootLogin(username, password))) throw new Error(bad);
      return nav('/admin', { replace: true });
    }
    await adminAuth.login(username, password);
    if (await isDefaultAdminPassword(username, password)) markDefaultAdminPassword(true);
    nav('/admin', { replace: true });
  };
  const submit = async () => {
    setErr('');
    if (!username.trim() || !password) return setErr('Hãy nhập tên đăng nhập và mật khẩu.');
    setBusy(true);
    try {
      await (role === 'admin' ? submitAdmin() : submitTeacher());
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  // Quản trị đăng nhập ở máy tính khác: nạp tệp kết nối đã tải, không phải làm lại Trình cài đặt
  const [, bump] = useState(0);
  const loadLinkFile = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    setErr('');
    setBusy(true);
    try {
      const info = parseLinkFile(await f.text(), 'admin');
      const pong = await pingScript(info.script_url);
      if (pong.name !== 'QUICKPLAY-ACCOUNTS') throw new Error('Link trong tệp không phải máy chủ tài khoản.');
      setAdminUrl(info.script_url);
      saveLink({ ...info, server_version: pong.version, linked_at: new Date().toISOString() }, 'admin');
      toast('Đã nối với máy chủ tài khoản. Hãy nhập tên đăng nhập và mật khẩu quản trị.', 'ok');
      bump((n) => n + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    if (!fg) return;
    if (!fg.username.trim()) return setFg({ ...fg, err: 'Hãy nhập tên tài khoản.' });
    setFg({ ...fg, busy: true, err: '' });
    try {
      const r = await forgotStart(fg.username);
      setFg((f) => f && { ...f, busy: false, sentTo: r.email, code: '' });
    } catch (e) {
      setFg((f) => f && { ...f, busy: false, err: (e as Error).message });
    }
  };
  const resetPw = async () => {
    if (!fg) return;
    if (fg.code.replace(/\D/g, '').length !== 6) return setFg({ ...fg, err: 'Mã xác nhận gồm 6 chữ số.' });
    if (fg.next.length < 6) return setFg({ ...fg, err: 'Mật khẩu mới cần ít nhất 6 ký tự.' });
    if (fg.next !== fg.again) return setFg({ ...fg, err: 'Hai lần nhập mật khẩu mới chưa giống nhau.' });
    setFg({ ...fg, busy: true, err: '' });
    try {
      await forgotFinish(fg.username, fg.code, fg.next);
      setUsername(fg.username.trim().toLowerCase());
      setPassword('');
      setFg(null);
      toast('Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới, rồi kết nối lại Google Drive của thầy cô ở trang Cài đặt.', 'ok');
    } catch (e) {
      setFg((f) => f && { ...f, busy: false, err: (e as Error).message });
    }
  };

  const teacherOpen = role === 'teacher' && !accountRequired(); // quản trị chưa bật đăng nhập cho trang web này

  return (
    <div className="play-bg">
      <div className="play-wrap login-wrap">
        <Link to="/" className="btn ghost" style={{ alignSelf: 'flex-start' }}><ArrowLeft size={18} /> Trang chủ</Link>
        <div className="login-shell">
        {/* Màn hình rộng (máy tính): thêm khung giới thiệu bên trái */}
        <aside className="login-side" aria-hidden>
          <Wordmark size={44} />
          <h2 className="hero-title side"><span className="ht-main">TRẮC NGHIỆM TƯƠNG TÁC</span><span className="ht-sub">AI BỨT PHÁ <i>•</i> QUẢN LÝ TRONG TAY</span></h2>
          <ul>
            <li><GraduationCap size={20} /> <span><b>Giáo viên</b> soạn bộ câu hỏi, tổ chức trên lớp hoặc giao về nhà, xem báo cáo từng lớp.</span></li>
            <li><ShieldCheck size={20} /> <span><b>Quản trị</b> cấp và quản lý tài khoản giáo viên.</span></li>
            <li><KeyRound size={20} /> <span>Dữ liệu của mỗi giáo viên nằm trong Google Drive của chính giáo viên đó.</span></li>
          </ul>
        </aside>
        <form className="card stack login-card" onSubmit={(e) => { e.preventDefault(); if (role && !teacherOpen) submit(); }}>
          <div className="login-logo"><Wordmark size={40} /></div>
          <h1 className="center" style={{ margin: 0, fontSize: '1.6rem' }}>Đăng nhập</h1>

          <div className="stack" style={{ gap: 8 }}>
            <b>1. Chọn vai trò đăng nhập</b>
            <div className="role-grid" role="radiogroup" aria-label="Vai trò đăng nhập">
              {([
                ['teacher', GraduationCap, 'Giáo viên', 'Soạn bộ câu hỏi, tổ chức cho học sinh làm bài, xem báo cáo.'],
                ['admin', ShieldCheck, 'Quản trị (admin)', 'Cấp, khóa và đặt lại mật khẩu tài khoản cho giáo viên.'],
              ] as const).map(([id, Ic, t, d]) => (
                <button key={id} type="button" role="radio" aria-checked={role === id} aria-label={t} className={`role-btn ${role === id ? 'on' : ''}`} onClick={() => pick(id)}>
                  <span className="ic"><Ic size={22} /></span>
                  <b>{t}</b>
                  <small>{d}</small>
                </button>
              ))}
            </div>
          </div>

          {!role && <p className="muted center" style={{ margin: 0 }}>Chọn một vai trò ở trên để nhập tên đăng nhập và mật khẩu.</p>}

          {teacherOpen && (
            <div className="alert warn" role="status">
              <div>
                Trang web này <b>chưa được quản trị bật đăng nhập</b> nên chưa có tài khoản giáo viên. Thầy cô có thể dùng thử ngay (dữ liệu lưu trong trình duyệt của máy này).
                <div style={{ marginTop: 8 }}><Link to="/teacher" className="btn primary sm">Vào dùng thử không cần tài khoản</Link></div>
              </div>
            </div>
          )}

          {role && !teacherOpen && (
            <>
              <b>2. Nhập tên đăng nhập và mật khẩu {role === 'admin' ? 'quản trị' : 'giáo viên'}</b>
              <label className="field">
                <span>Tên đăng nhập</span>
                <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus={role === 'teacher'} />
              </label>
              <label className="field">
                <span>Mật khẩu</span>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input className="input" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus={role === 'admin'} />
                  <button type="button" className="btn icon" onClick={() => setShow((x) => !x)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>
              </label>
              {err && <div className="alert error" role="alert"><div>{err}</div></div>}
              <button className="btn primary lg" disabled={busy}><LogIn size={20} /> {busy ? 'Đang đăng nhập…' : role === 'admin' ? 'Đăng nhập quản trị' : 'Đăng nhập'}</button>
              {role === 'teacher' ? (
                <>
                  <button type="button" className="btn ghost" onClick={() => setFg({ username, sentTo: '', code: '', next: '', again: '', err: '', busy: false, help: false })}><KeyRound size={18} /> Quên mật khẩu?</button>
                  <p className="muted small center" style={{ margin: 0 }}>
                    Tài khoản do quản trị cấp. Chưa có tài khoản, hãy liên hệ tác giả Nguyễn Thanh Liêm qua <a href="https://zalo.me/0888358363" target="_blank" rel="noopener noreferrer">Zalo 0888358363</a>.
                  </p>
                </>
              ) : (
                <p className="muted small center" style={{ margin: 0 }}>
                  {adminUrl()
                    ? <>Quên mật khẩu quản trị: mở <Link to="/admin">trang quản trị</Link> rồi bấm <b>Quên mật khẩu?</b>.</>
                    : 'Lần đầu thiết lập hệ thống: đăng nhập bằng tài khoản quản trị mặc định, phần mềm sẽ mở Trình cài đặt để nối máy chủ tài khoản.'}
                </p>
              )}
              {!adminUrl() && (
                <button type="button" className="btn ghost" onClick={loadLinkFile} disabled={busy}><Upload size={18} /> Đã cài ở máy khác? Nạp tệp kết nối (.json)</button>
              )}
            </>
          )}
        </form>
        </div>

        {fg && (
          <Modal title="Quên mật khẩu" onClose={() => setFg(null)}>
            <div className="stack">
              <p className="muted" style={{ margin: 0 }}>Nhận mã qua email khôi phục để đặt mật khẩu mới. Bộ câu hỏi và kết quả trên Google Drive của thầy cô được giữ nguyên.</p>
              {!fg.sentTo ? (
                <>
                  <label className="field"><span>Tên tài khoản</span>
                    <input className="input" value={fg.username} onChange={(e) => setFg({ ...fg, username: e.target.value })} autoCapitalize="none" spellCheck={false} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') sendCode(); }} />
                  </label>
                  <button type="button" className="btn primary" onClick={sendCode} disabled={fg.busy}><Mail size={18} /> {fg.busy ? 'Đang gửi…' : 'Gửi mã về email khôi phục'}</button>
                  <button type="button" className="btn ghost sm" aria-expanded={fg.help} onClick={() => setFg({ ...fg, help: !fg.help })}>Chưa khai báo email khôi phục thì làm thế nào?</button>
                  {fg.help && <p className="muted small" style={{ margin: 0 }}>Liên hệ quản trị (Zalo 0888358363) để được đặt lại mật khẩu. Sau khi đăng nhập lại, vào <b>Cài đặt → Tài khoản → Email khôi phục</b> để khai báo email cho lần sau.</p>}
                </>
              ) : (
                <>
                  <div className="alert ok" role="status"><div>Đã gửi mã 6 số tới <b>{fg.sentTo}</b>. Mã có hiệu lực 15 phút. Nếu chưa thấy, hãy xem cả mục Thư rác.</div></div>
                  <label className="field"><span>Mã 6 số trong email</span>
                    <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={fg.code} onChange={(e) => setFg({ ...fg, code: e.target.value.replace(/\D/g, '') })} style={{ letterSpacing: '0.4em', textAlign: 'center', fontWeight: 800, fontSize: '1.3rem' }} autoFocus />
                  </label>
                  <label className="field"><span>Mật khẩu mới (ít nhất 6 ký tự)</span><input className="input" type="password" value={fg.next} onChange={(e) => setFg({ ...fg, next: e.target.value })} autoComplete="new-password" /></label>
                  <label className="field"><span>Nhập lại mật khẩu mới</span><input className="input" type="password" value={fg.again} onChange={(e) => setFg({ ...fg, again: e.target.value })} autoComplete="new-password" /></label>
                  <button type="button" className="btn success" onClick={resetPw} disabled={fg.busy}><ShieldCheck size={18} /> Đặt lại mật khẩu</button>
                  <button type="button" className="btn ghost sm" onClick={sendCode} disabled={fg.busy}>Gửi lại mã (sau 1 phút)</button>
                </>
              )}
              {fg.err && <div className="alert error" role="alert"><div>{fg.err}</div></div>}
            </div>
          </Modal>
        )}
        <p className="muted small center" style={{ margin: 0 }}>Học sinh không cần đăng nhập: vào <Link to="/join">phòng chơi</Link> bằng mã PIN.</p>
      </div>
      <AppFooter />
    </div>
  );
}
