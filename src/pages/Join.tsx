import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, Gamepad2, LogIn, UserCheck } from 'lucide-react';
import { api } from '../lib/api';
import { avatarKind, randomAnyAvatar } from '../lib/avatar';
import { sfx } from '../lib/sound';
import { enterFullscreen } from '../lib/anticheat';
import { NAME_USED, NEED_CODE } from '../lib/sessionLogic';
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
  // Bài kiểm tra: ngoài tên và lớp, em phải nhập mã số học sinh thầy cô đã phát
  // Em tự bấm "Làm bài kiểm tra", hoặc phần mềm tự chuyển khi mã PIN là phòng kiểm tra
  const [exam, setExam] = useState(params.get('kt') === '1');
  const picked = useRef(params.get('kt') === '1'); // em tự chọn làm bài kiểm tra (chưa biết mã PIN là loại phòng nào)
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const pickKind = (isExam: boolean) => {
    picked.current = isExam;
    setExam(isExam);
    setNote('');
    setErr('');
  };
  useEffect(() => {
    setNote('');
    if (!/^\d{6}$/.test(pin)) return;
    let live = true;
    api.poll(pin).then((p) => {
      if (!live) return;
      const isExam = p.mode === 'exam';
      if (isExam && !exam) setNote('Mã PIN này là phòng kiểm tra: em cần nhập thêm mã số học sinh.');
      if (!isExam && picked.current) setNote('Mã PIN này là phòng chơi thường, không phải bài kiểm tra nên không cần mã số học sinh.');
      picked.current = false;
      setExam(isExam);
    }).catch(() => {});
    return () => { live = false; };
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps
  // Bài kiểm tra: em gõ mã số học sinh → phần mềm tra danh sách lớp, tự điền họ tên và lớp để em kiểm tra lại trước khi vào
  const [who, setWho] = useState<{ name: string; class_name: string; done: boolean } | null>(null);
  const [whoMiss, setWhoMiss] = useState('');
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    setWho(null);
    setWhoMiss('');
    if (!exam || !/^\d{6}$/.test(pin) || code.length < 2) return;
    let live = true;
    const t = window.setTimeout(() => {
      setLooking(true);
      api.examStudent(pin, code)
        .then((r) => {
          if (!live) return;
          setWho(r);
          setName(r.name);
          setCls(r.class_name);
        })
        .catch((e) => {
          // Apps Script cũ chưa có chức năng tra mã: im lặng, em tự điền như trước
          if (live && /không có trong danh sách/.test((e as Error).message)) setWhoMiss((e as Error).message);
        })
        .finally(() => live && setLooking(false));
    }, 450);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [exam, pin, code]);
  const nameRef = useRef<HTMLInputElement>(null);
  const again = params.get('again') === '1'; // em vừa bấm "Làm lại bài này": chính em đó làm lại nên không cần hỏi
  const s = params.get('s');
  const suffix = s ? `?s=${encodeURIComponent(s)}` : '';
  const saved = /^\d{6}$/.test(pin) ? loadPlayer(pin) : null;

  useEffect(() => {
    setErr('');
    setNameUsed(false);
  }, [pin, name, cls, code]);

  const join = async (resume?: SavedPlayer, reuse = again) => {
    if (!/^\d{6}$/.test(pin)) {
      // chưa nhập mã, hoặc mã chưa đủ 6 số
      setPinLocked(false);
      return setErr(BAD_PIN);
    }
    if (!resume && exam && !code.trim()) return setErr('Hãy nhập mã số học sinh thầy cô đã phát.');
    if (!resume && exam && who?.done) return setErr(`Mã số ${code} đã nộp bài kiểm tra này rồi, không thể làm lại.`);
    // Bài kiểm tra: họ tên và lớp lấy theo danh sách lớp của thầy cô, em chỉ cần gõ đúng mã số
    if (!resume && !exam && !name.trim()) return setErr('Hãy nhập tên của em.');
    if (!resume && !exam && !cls.trim()) return setErr('Hãy nhập lớp của em (ví dụ: 5A).');
    setBusy(true);
    try {
      const r = await api.joinSession(pin, resume?.name ?? name.trim(), resume?.avatar ?? avatar, resume?.player_id, resume?.class_name ?? cls.trim(), reuse, resume ? undefined : code.trim());
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
      else if (msg.includes(NEED_CODE)) {
        // phòng này là bài kiểm tra: hiện ô nhập mã số học sinh (nếu chưa hiện) và báo lý do
        setExam(true);
        setErr(msg.replace(NEED_CODE, '').trim());
      } else if (/Không tìm thấy phòng/.test(msg)) {
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
          <h1 className="center" style={{ margin: 0 }}>{exam ? 'Vào làm bài kiểm tra' : 'Vào phòng chơi'}</h1>
          {!saved && (
            <div className="join-kind" role="radiogroup" aria-label="Em vào phòng để làm gì">
              <button type="button" role="radio" aria-checked={!exam} className={!exam ? 'on' : ''} onClick={() => pickKind(false)}><Gamepad2 size={20} /> Vào phòng chơi</button>
              <button type="button" role="radio" aria-checked={exam} className={exam ? 'on' : ''} onClick={() => pickKind(true)}><ClipboardCheck size={20} /> Làm bài kiểm tra</button>
            </div>
          )}
          {note && <div className="alert ok" role="status"><div>{note}</div></div>}
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
              {exam && (
                <div className="stack" style={{ gap: 10 }}>
                  <label className="field" style={{ margin: 0 }}>
                    <span>{pinLocked ? '1' : '2'}. Mã số học sinh</span>
                    <input className="input join-code" maxLength={32} required value={code} autoFocus={pinLocked} onChange={(e) => setCode(e.target.value.replace(/\s+/g, '').toUpperCase())} placeholder="VD: HS12"
                      autoCapitalize="characters" autoComplete="off" aria-describedby="code-help" />
                    <small className="help" id="code-help">Em chỉ cần gõ đúng mã số thầy cô đã phát (mã học sinh, số căn cước hoặc tên đăng nhập): họ tên và lớp tự điền theo danh sách lớp. Mỗi mã chỉ làm bài một lần.</small>
                  </label>
                  {looking && !who && <div className="muted small" role="status">Đang tìm mã trong danh sách lớp…</div>}
                  {who && (
                    <div className={`join-who ${who.done ? 'done' : ''}`} role="status">
                      <UserCheck size={26} />
                      <div>
                        <b>{who.name}</b>
                        <span>Lớp {who.class_name} · mã {code}</span>
                        {who.done ? <small>Mã này đã nộp bài kiểm tra, không thể làm lại.</small> : <small>Đúng là em thì bấm <b>Tham gia</b>. Không phải em thì kiểm tra lại mã.</small>}
                      </div>
                    </div>
                  )}
                  {whoMiss && <div className="alert warn" role="status"><div>{whoMiss}</div></div>}
                </div>
              )}
              <label className="field">
                <span>{exam ? (pinLocked ? '2' : '3') : pinLocked ? '1' : '2'}. {exam ? 'Họ và tên' : 'Tên hiển thị'}</span>
                <input className="input" maxLength={exam ? 40 : 24} required ref={nameRef} autoFocus={pinLocked && !exam} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nguyễn Minh Anh"
                  readOnly={exam && !!who} style={{ color: 'var(--fg)', fontSize: '1.2rem', ...(exam && who ? { background: 'var(--muted)' } : {}) }} autoComplete="nickname" />
                {exam && <small className="help">{who ? 'Tự điền theo danh sách lớp của thầy cô.' : 'Gõ mã số ở trên là ô này tự điền. Em cũng có thể tự gõ.'}</small>}
              </label>
              <label className="field">
                <span>{exam ? (pinLocked ? '3' : '4') : pinLocked ? '2' : '3'}. Lớp của em</span>
                <input className="input" maxLength={20} required value={cls} onChange={(e) => setCls(e.target.value)} placeholder="VD: 5A" autoCapitalize="characters"
                  readOnly={exam && !!who} style={{ color: 'var(--fg)', fontSize: '1.2rem', ...(exam && who ? { background: 'var(--muted)' } : {}) }} />
                {!exam && <small className="help">Thầy cô dùng lớp để thống kê kết quả.</small>}
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
