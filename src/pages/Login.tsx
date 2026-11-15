// Đăng nhập giáo viên bằng tài khoản do quản trị cấp.
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, Mail, ShieldCheck } from 'lucide-react';
import { accountRequired, currentAccount, forgotFinish, forgotStart, login } from '../lib/account';
import { Modal, useToast } from '../components/ui';
import { Wordmark } from '../components/Logo';
import { AppFooter } from '../components/AppFooter';

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  // Quên mật khẩu: bước 1 nhập tên tài khoản để nhận mã qua email khôi phục; bước 2 nhập mã và mật khẩu mới
  const [fg, setFg] = useState<null | { username: string; sentTo: string; code: string; next: string; again: string; err: string; busy: boolean; help: boolean }>(null);
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
          <button type="button" className="btn ghost" onClick={() => setFg({ username, sentTo: '', code: '', next: '', again: '', err: '', busy: false, help: false })}><KeyRound size={18} /> Quên mật khẩu?</button>
          <p className="muted small center" style={{ margin: 0 }}>
            Tài khoản do quản trị cấp. Chưa có tài khoản, hãy liên hệ tác giả Nguyễn Thanh Liêm qua <a href="https://zalo.me/0888358363" target="_blank" rel="noopener noreferrer">Zalo 0888358363</a>.
          </p>
        </form>
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
