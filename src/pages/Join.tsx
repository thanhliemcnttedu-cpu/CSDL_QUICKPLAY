import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LogIn } from 'lucide-react';
import { api } from '../lib/api';
import { avatarKind, randomAnyAvatar } from '../lib/avatar';
import { sfx } from '../lib/sound';
import { enterFullscreen } from '../lib/anticheat';
import { NAME_USED } from '../lib/sessionLogic';
import { Avatar } from '../components/Avatar';
import { AppFooter } from '../components/AppFooter';
import { AvatarBuilder } from '../components/AvatarBuilder';
import { Palette, Shuffle } from 'lucide-react';

export interface SavedPlayer { pin: string; player_id: string; name: string; avatar: string; class_name?: string }
export const playerKey = (pin: string) => `quizzi.player.${pin}`;
export function loadPlayer(pin: string): SavedPlayer | null {
  try {
    return JSON.parse(localStorage.getItem(playerKey(pin)) || 'null');
  } catch {
    return null;
  }
}

export function Join() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [pin, setPin] = useState(params.get('pin') ?? '');
  const [name, setName] = useState(() => localStorage.getItem('quizzi.lastName') ?? '');
  const [cls, setCls] = useState(() => localStorage.getItem('quizzi.lastClass') ?? '');
  const [avatar, setAvatar] = useState<string>(() => {
    const last = localStorage.getItem('quizzi.lastAvatar');
    return last && avatarKind(last) !== 'none' ? last : randomAnyAvatar(); // nhớ lựa chọn lần trước (bạn học sinh hoặc con vật)
  });
  const [building, setBuilding] = useState(false);
  const fresh = avatarKind(localStorage.getItem('quizzi.lastAvatar')) === 'none';
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [nameUsed, setNameUsed] = useState(false); // tên + lớp này đã nộp bài ở lượt trước → hỏi đổi tên hay vẫn dùng
  const nameRef = useRef<HTMLInputElement>(null);
  const again = params.get('again') === '1'; // em vừa bấm "Làm lại bài này": chính em đó làm lại nên không cần hỏi
  const s = params.get('s');
  const suffix = s ? `?s=${encodeURIComponent(s)}` : '';
  const saved = /^\d{6}$/.test(pin) ? loadPlayer(pin) : null;

  useEffect(() => {
    setErr('');
    setNameUsed(false);
  }, [pin, name, cls]);

  const join = async (resume?: SavedPlayer, reuse = again) => {
    if (!/^\d{6}$/.test(pin)) return setErr('Mã PIN gồm đúng 6 chữ số.');
    if (!resume && !name.trim()) return setErr('Hãy nhập tên của em.');
    if (!resume && !cls.trim()) return setErr('Hãy nhập lớp của em (ví dụ: 5A).');
    setBusy(true);
    try {
      const r = await api.joinSession(pin, resume?.name ?? name.trim(), resume?.avatar ?? avatar, resume?.player_id, resume?.class_name ?? cls.trim(), reuse);
      const sp: SavedPlayer = { pin, player_id: r.player_id, name: r.player.name, avatar: r.player.avatar, class_name: r.player.class_name };
      localStorage.setItem(playerKey(pin), JSON.stringify(sp));
      localStorage.setItem('quizzi.lastName', sp.name);
      if (sp.class_name) localStorage.setItem('quizzi.lastClass', sp.class_name);
      localStorage.setItem('quizzi.lastAvatar', sp.avatar);
      sfx.join();
      enterFullscreen(); // bấm Tham gia là một thao tác của người dùng nên trình duyệt cho phép phóng to toàn màn hình
      nav(`/play/${pin}${suffix}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes(NAME_USED)) setNameUsed(true);
      else setErr(msg);
      if (resume) localStorage.removeItem(playerKey(pin));
      setBusy(false);
    }
  };

  return (
    <div className="play-bg">
      <div className="play-wrap" style={{ maxWidth: 520, justifyContent: 'center' }}>
        <Link to="/" className="btn ghost" style={{ alignSelf: 'flex-start' }}><ArrowLeft size={18} /> Trang chủ</Link>
        <form
          className="stack"
          style={{ gap: 18 }}
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <h1 className="center" style={{ margin: 0 }}>Vào phòng chơi</h1>
          <label className="field">
            <span>1. Mã PIN</span>
            <input className="input" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ fontSize: '1.8rem', textAlign: 'center', letterSpacing: '.3em', fontWeight: 800, color: 'var(--fg)' }} />
          </label>
          {saved ? (
            <div className="card stack center" style={{ color: 'var(--fg)' }}>
              <div style={{ alignSelf: 'center' }}><Avatar value={saved.avatar} size={96} /></div>
              <p style={{ margin: 0 }}>Em đã vào phòng này với tên <b>{saved.name}</b>{saved.class_name ? <> – lớp <b>{saved.class_name}</b></> : null}.</p>
              <button type="button" className="btn primary lg" disabled={busy} onClick={() => join(saved)}><LogIn size={20} /> Tiếp tục làm bài</button>
              <button type="button" className="btn ghost" onClick={() => { localStorage.removeItem(playerKey(pin)); setPin(pin + ''); setErr(''); nav(0); }}>Vào với tên khác</button>
            </div>
          ) : (
            <>
              <label className="field">
                <span>2. Tên hiển thị</span>
                <input className="input" maxLength={24} required ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nguyễn Minh Anh" style={{ color: 'var(--fg)', fontSize: '1.2rem' }} autoComplete="nickname" />
              </label>
              <label className="field">
                <span>3. Lớp của em</span>
                <input className="input" maxLength={20} required value={cls} onChange={(e) => setCls(e.target.value)} placeholder="VD: 5A" style={{ color: 'var(--fg)', fontSize: '1.2rem' }} autoCapitalize="characters" />
                <small className="help">Thầy cô dùng lớp để thống kê kết quả.</small>
              </label>
              <div className="av-me">
                <button type="button" onClick={() => setBuilding(true)} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }} aria-label="Đổi nhân vật">
                  <Avatar value={avatar} size={96} label />
                </button>
                <div className="stack" style={{ gap: 8 }}>
                  <b style={{ fontSize: '1.1rem' }}>Nhân vật của em</b>
                  {fresh && <small className="muted">Bấm để chọn bạn học sinh hoặc con vật em thích nhé!</small>}
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn violet" onClick={() => setBuilding(true)}><Palette size={18} /> Đổi nhân vật</button>
                    <button type="button" className="btn" onClick={() => { sfx.whoosh(); setAvatar(randomAnyAvatar()); }}><Shuffle size={18} /> Bất ngờ!</button>
                  </div>
                </div>
              </div>
              <button className="btn primary lg" disabled={busy}>{busy ? 'Đang vào…' : 'Tham gia'}</button>
            </>
          )}
          {nameUsed && (
            <div className="alert warn" role="alert">
              <div className="stack" style={{ gap: 10 }}>
                <div>
                  <b>Tên này đã được dùng ở lượt làm trước.</b> Em đang chơi ở lượt sau và điền tên giống một bạn trong lớp đã dùng tên <b>{name.trim()}</b> (lớp {cls.trim()}).
                  Em có thể điền một tên mới, hoặc thêm một ký tự sau tên của mình để phân biệt với bạn (ví dụ: {name.trim()} 2).
                  Nếu đây chính là em làm lại bài, em vẫn dùng tên cũ được: mỗi lần làm được ghi riêng theo ngày giờ, không ghi đè kết quả lần trước.
                </div>
                <div className="row">
                  <button type="button" className="btn primary" onClick={() => { setNameUsed(false); nameRef.current?.focus(); nameRef.current?.select(); }}>Đổi tên khác</button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => join(undefined, true)}>Vẫn dùng tên cũ</button>
                </div>
              </div>
            </div>
          )}
          {err && <div className="alert error" role="alert">{err}</div>}
        </form>
        {building && (
          <AvatarBuilder
            value={avatar}
            onClose={() => setBuilding(false)}
            onDone={(v) => {
              setAvatar(v);
              localStorage.setItem('quizzi.lastAvatar', v); // nhớ nhân vật cho lần sau
              setBuilding(false);
            }}
          />
        )}
      </div>
      <AppFooter />
    </div>
  );
}
