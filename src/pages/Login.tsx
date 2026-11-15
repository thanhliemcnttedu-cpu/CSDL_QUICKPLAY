// Đăng nhập giáo viên bằng tài khoản do quản trị cấp.
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, LogIn } from 'lucide-react';
import { accountRequired, currentAccount, login } from '../lib/account';
import { Wordmark } from '../components/Logo';
import { AppFooter } from '../components/AppFooter';

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!accountRequired() || currentAccount()) return <Navigate to="/teacher" replace />;

  const submit = async () => {
    setErr('');
    if (!username.trim() || !password) return setErr('Hãy nhập tên tài khoản và mật khẩu.');
    setBusy(true);
    try {
      const r = await login(username, password);
      // Lần đầu: chưa có link thư mục và Apps Script → mở Cài đặt để nhập và lưu một lần
      nav(r.configured ? '/teacher' : '/teacher/settings?first=1', { replace: true });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="play-bg">
      <div className="play-wrap" style={{ maxWidth: 460, justifyContent: 'center' }}>
        <Link to="/" className="btn ghost" style={{ alignSelf: 'flex-start' }}><ArrowLeft size={18} /> Trang chủ</Link>
        <form className="card stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div style={{ alignSelf: 'center' }}><Wordmark size={40} /></div>
          <h1 className="center" style={{ margin: 0, fontSize: '1.6rem' }}>Đăng nhập giáo viên</h1>
          <label className="field">
            <span>Tên tài khoản</span>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" className="btn icon" onClick={() => setShow((x) => !x)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          {err && <div className="alert error" role="alert"><div>{err}</div></div>}
          <button className="btn primary lg" disabled={busy}><LogIn size={20} /> {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
          <p className="muted small center" style={{ margin: 0 }}>
            Tài khoản do quản trị cấp. Chưa có tài khoản hoặc quên mật khẩu, hãy liên hệ tác giả Nguyễn Thanh Liêm qua <a href="https://zalo.me/0888358363" target="_blank" rel="noopener noreferrer">Zalo 0888358363</a>.
          </p>
        </form>
        <p className="muted small center" style={{ margin: 0 }}>Học sinh không cần đăng nhập: vào <Link to="/join">phòng chơi</Link> bằng mã PIN.</p>
      </div>
      <AppFooter />
    </div>
  );
}
