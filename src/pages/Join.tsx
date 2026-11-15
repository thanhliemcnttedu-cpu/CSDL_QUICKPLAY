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
import { fromB64Url } from '../lib/inApp';

const BAD_PIN = 'Bạn chưa nhập đúng mã, hãy kiểm tra lại.';

export interface SavedPlayer { pin: string; player_id: string; name: string; avatar: string; class_name?: string }
export const playerKey = (pin: string) => `quizzi.player.${pin}`;
export function loadPlayer(pin: string): SavedPlayer | null {
  // Mở từ Zalo sang trình duyệt của máy: đường dẫn mang theo "me=" (chỉ gắn khi em đã làm xong bài)
  // để trình duyệt mới nhận ra em và hiện đúng phiếu kết quả, không bắt vào phòng lại.
  try {
    if (!localStorage.getItem(playerKey(pin))) {
      const m = location.hash.match(/[?&]me=([^&]+)/);
      const sp = m ? fromB64Url<SavedPlayer>(decodeURIComponent(m[1])) : null;
      if (sp && sp.pin === pin && typeof sp.player_id === 'string' && sp.player_id) {
        localStorage.setItem(playerKey(pin), JSON.stringify({ pin, player_id: sp.player_id, name: String(sp.name || ''), avatar: String(sp.avatar || ''), class_name: sp.class_name }));
      }
    }
  } catch { /* bỏ qua */ }
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
  // Mã PIN đã có sẵn (gõ ở trang chủ, mở từ link hoặc quét mã QR): không bắt em nhập lại, chỉ còn điền tên và lớp
  const [pinLocked, setPinLocked] = useState(/^\d{6}$/.test(params.get('pin') ?? ''));
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
    if (!/^\d{6}$/.test(pin)) {
      // chưa nhập mã, hoặc mã chưa đủ 6 số
      setPinLocked(false);
      return setErr(BAD_PIN);
    }
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
      else if (/Không tìm thấy phòng/.test(msg)) {
        // mã đủ 6 số nhưng không có phòng nào dùng mã này: mở lại ô mã để em sửa
        setPinLocked(false);
        setErr(BAD_PIN);
      } else setErr(msg);
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
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <h1 className="center" style={{ margin: 0 }}>Vào phòng chơi</h1>
          {pinLocked ? (
            <div className="pin-ok" role="status">
              <span>Mã PIN của phòng</span>
              <b aria-label={`Mã PIN ${pin.split('').join(' ')}`}>{pin}</b>
              <button type="button" className="btn sm ghost" onClick={() => { setPinLocked(false); setErr(''); }}>Đổi mã</button>
            </div>
          ) : (
            <label className="field">
              <span>1. Mã PIN thầy cô giao</span>
              <input className="input" inputMode="numeric" maxLength={6} value={pin} autoFocus onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" style={{ fontSize: '1.8rem', textAlign: 'center', letterSpacing: '.3em', fontWeight: 800, color: 'var(--fg)' }} />
            </label>
          )}
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
                <span>{pinLocked ? '1' : '2'}. Tên hiển thị</span>
                <input className="input" maxLength={24} required ref={nameRef} autoFocus={pinLocked} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nguyễn Minh Anh" style={{ color: 'var(--fg)', fontSize: '1.2rem' }} autoComplete="nickname" />
              </label>
              <label className="field">
                <span>{pinLocked ? '2' : '3'}. Lớp của em</span>
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
