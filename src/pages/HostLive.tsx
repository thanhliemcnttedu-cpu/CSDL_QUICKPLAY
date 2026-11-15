import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { AppFooter } from '../components/AppFooter';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { Play as PlayIcon, Pause, Square, SkipForward, Lock, Copy, Music, VolumeX, UserX, ArrowLeft, Download, Users, Trophy, Maximize, ShieldAlert, LayoutDashboard, ChartColumn, Clock } from 'lucide-react';
import { CheatMonitor, TopFilter } from '../components/CheatMonitor';
import { VIOLATION_LABELS } from '../lib/anticheat';
import { sfx } from '../lib/sound';
import type { Quiz, Session } from '../lib/types';
import { api } from '../lib/api';
import { startPolling } from '../lib/pollTimer';
import type { HostOp } from '../lib/sessionLogic';
import { answerKey } from '../lib/sessionLogic';
import { loadSettings } from '../lib/settings';
import { htmlToText, sanitizeHtml } from '../lib/util';
import { Check, X, MessageSquareText } from 'lucide-react';
import { startMusic } from '../lib/sound';
import { download, questionStats, rankedPlayers, sessionCsv, totalOf } from '../lib/report';
import { visiblePlayers } from '../lib/sessionLogic';
import { Spinner, useToast, askConfirm } from '../components/ui';
import { StemMedia } from '../components/MediaView';
import { Leaderboard, Stats } from './Play';
import { LiveReport } from '../components/LiveReport';

export function joinUrl(pin: string): string {
  const s = loadSettings();
  const base = location.protocol.startsWith('http')
    ? location.origin
    : ((import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? '');
  if (!base) return '';
  const script = s.backend === 'drive' && s.scriptUrl ? `&s=${encodeURIComponent(s.scriptUrl)}` : '';
  return `${base.replace(/\/+$/, '')}/join?pin=${pin}${script}`;
}

export default function HostLive() {
  const { pin = '' } = useParams();
  const toast = useToast();
  const [s, setS] = useState<Session | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [err, setErr] = useState('');
  const [qr, setQr] = useState('');
  const [music, setMusic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'dash' | 'stats' | 'cheat' | 'lb'>('dash');
  const [top, setTop] = useState<number | null>(null);
  const [seenV, setSeenV] = useState<number | null>(null); // số vi phạm giáo viên đã xem
  const [openedAt, setOpenedAt] = useState(Date.now());
  const lastAlerted = useRef<number | null>(null);
  const [tick, setTick] = useState(Date.now()); // nhịp đồng hồ đếm ngược của câu (giáo viên điều khiển)
  const autoLocked = useRef(-1);
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const link = useMemo(() => joinUrl(pin), [pin]);

  // Cảnh báo vi phạm mới: thông báo + âm thanh, đếm trên tab Giám sát
  const vlist = s?.violations ?? [];
  const counted = vlist.filter((v) => v.kind !== 'open_link');
  useEffect(() => {
    if (!s) return;
    if (top === null) setTop(s.settings.leaderboard_top ?? 10);
    if (lastAlerted.current === null) {
      lastAlerted.current = vlist.length;
      setSeenV(counted.length);
      return;
    }
    const fresh = vlist.slice(lastAlerted.current).filter((v) => v.kind !== 'open_link');
    lastAlerted.current = vlist.length;
    if (fresh.length) {
      const v = fresh[fresh.length - 1];
      toast(`⚠ ${v.name}: ${VIOLATION_LABELS[v.kind]}${fresh.length > 1 ? ` (+${fresh.length - 1} vi phạm khác)` : ''}`, 'error');
      sfx.wrong();
    }
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === 'cheat') {
      setSeenV(counted.length);
      setOpenedAt(Date.now() - 15000);
    }
  }, [tab, counted.length]);
  const unseen = Math.max(0, counted.length - (seenV ?? 0));

  const hostMode = useRef<string>('');
  const refresh = useCallback(async () => {
    try {
      const next = await api.hostState(pin);
      hostMode.current = next.state === 'COMPLETED' ? 'done' : next.settings.mode;
      setS(next);
      setErr('');
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    }
  }, [pin]);

  useEffect(() => {
    // Giáo viên điều khiển: 2 giây; trực tiếp tự do: 3 giây; bài về nhà: 10 giây; phiên đã kết thúc: 20 giây
    return startPolling(refresh, () => (hostMode.current === 'done' ? 20000 : hostMode.current === 'homework' ? 10000 : hostMode.current === 'instructor_paced' ? 2000 : 3000));
  }, [refresh]);

  useEffect(() => {
    if (s && !quiz) api.getQuiz(s.quiz_id).then(setQuiz).catch(() => {});
  }, [s, quiz]);

  useEffect(() => {
    if (link) QRCode.toDataURL(link, { margin: 1, width: 220 }).then(setQr).catch(() => {});
  }, [link]);

  useEffect(() => {
    if (!music) return;
    return startMusic();
  }, [music]);
  useEffect(() => {
    if (s?.state === 'COMPLETED') setMusic(false);
  }, [s?.state]);

  const act = async (op: HostOp, player_id?: string, extra?: { q_index?: number; correct?: boolean; points?: number; coins?: number }) => {
    setBusy(true);
    try {
      setS(await api.hostAction(pin, op, player_id, extra));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (err && !s)
    return (
      <div className="page">
        <div className="alert error">{err}</div>
        <Link to="/teacher" className="btn" style={{ marginTop: 12 }}><ArrowLeft size={18} /> Về thư viện</Link>
      </div>
    );
  if (!s) return <div className="play-bg"><div style={{ paddingTop: 80 }}><Spinner label="Đang mở phòng…" /></div></div>;

  const paced = s.settings.mode === 'instructor_paced';
  // Câu đang mở (chưa khóa): bảng điều khiển và xếp hạng chưa tính câu hiện tại, để khi chiếu lên bảng không lộ ai đúng ai sai
  const shownSession = { ...s, players: visiblePlayers(s) };
  const players = shownSession.players.filter((p) => !p.kicked && !p.superseded);
  const ranked = rankedPlayers(shownSession);
  const curQ = quiz?.questions[s.current_index];
  // Hết giờ mà không chọn gì (kind 'none') là CHƯA trả lời, không tính vào số đã trả lời
  const answeredCur = new Set(
    s.answers.filter((a) => a.q_index === s.current_index && (a.answer as { kind?: string } | null)?.kind !== 'none').map((a) => a.player_id),
  ).size;
  // Đồng hồ của câu hiện tại (giáo viên điều khiển); tạm dừng thì đứng yên
  const limitMs = (curQ?.time_limit_seconds ?? 30) * 1000;
  const nowMs = s.state === 'PAUSED' && s.paused_at ? s.paused_at : tick;
  const remainMs = paced && s.question_opened_at ? Math.max(0, limitMs - (nowMs - s.question_opened_at)) : 0;

  // Hết giờ thì máy giáo viên tự khóa câu (một lần cho mỗi câu) để không ai nộp muộn và kết quả hiện ra
  if (paced && s.state === 'IN_PROGRESS' && !s.question_locked && s.question_opened_at && remainMs <= 0 && autoLocked.current !== s.current_index && !busy) {
    autoLocked.current = s.current_index;
    window.setTimeout(() => act('lock'), 0);
  }

  const header = (
    <div className="row between" style={{ padding: '12px 0' }}>
      <div className="row">
        <Link to="/teacher" className="btn ghost"><ArrowLeft size={18} /> Thư viện</Link>
        <h2 style={{ margin: 0 }}>{s.quiz_title}</h2>
        <span className="badge blue">
          {s.settings.mode === 'classic_live' ? 'Trực tiếp tự do' : paced ? 'Giáo viên điều khiển' : s.settings.mode === 'exam' ? 'Bài kiểm tra' : 'Giao bài về nhà'}
        </span>
      </div>
      <div className="row">
        {s.state !== 'COMPLETED' && (
          <button className="btn icon" onClick={() => setMusic((m) => !m)} aria-label={music ? 'Tắt nhạc' : 'Bật nhạc nền'} title={music ? 'Tắt nhạc' : 'Bật nhạc nền'}>
            {music ? <VolumeX size={18} /> : <Music size={18} />}
          </button>
        )}
        <button className="btn icon" onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Toàn màn hình" title="Toàn màn hình (chiếu lên bảng)"><Maximize size={18} /></button>
        {s.state === 'IN_PROGRESS' && s.settings.mode !== 'homework' && <button className="btn" disabled={busy} onClick={() => act('pause')}><Pause size={18} /> Tạm dừng</button>}
        {s.state === 'PAUSED' && <button className="btn accent" disabled={busy} onClick={() => act('resume')}><PlayIcon size={18} /> Tiếp tục</button>}
        {s.state !== 'COMPLETED' && (
          <button className="btn danger" disabled={busy} onClick={async () => (await askConfirm('Kết thúc phiên ngay bây giờ?')) && act('end')}><Square size={18} /> Kết thúc</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="play-bg">
      <div className="page" style={{ maxWidth: 1280 }}>
        {header}
        {err && <div className="alert warn" style={{ marginBottom: 12 }}>Mất kết nối tạm thời: {err}</div>}
        {s.settings.mode === 'exam' && s.exam && <ExamPanel s={s} now={nowMs} link={link} qr={qr} />}

        {s.state === 'LOBBY_WAITING' && (
          <div className="stack" style={{ gap: 20 }}>
            <div className="lobby-head">
              <div className="stack">
                <span style={{ fontSize: '1.2rem' }}>Vào <b>{link ? `${new URL(link).host}/join` : 'trang Quickplay'}</b> và nhập mã{s.settings.mode === 'exam' ? ' PIN, sau đó nhập mã số học sinh' : ''}:</span>
                <div className="pin-display" aria-label={`Mã PIN ${pin.split('').join(' ')}`}>{pin.slice(0, 3)} {pin.slice(3)}</div>
                {link && (
                  <div className="row">
                    <button className="btn sm" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Đã chép đường dẫn tham gia.', 'ok'))}><Copy size={16} /> Chép link tham gia</button>
                    {loadSettings().backend === 'local' && <span className="small muted">Chế độ "Chỉ máy này": học sinh mở link ở tab khác của cùng trình duyệt.</span>}
                  </div>
                )}
              </div>
              {qr && <img className="qr" src={qr} alt="Mã QR để vào phòng" width={200} height={200} />}
            </div>
            <div className="row between">
              <h2 style={{ margin: 0 }}><Users size={24} /> {players.length} học sinh</h2>
              <button className="btn accent lg" disabled={busy || !players.length} onClick={() => act('start')}><PlayIcon size={22} /> Bắt đầu</button>
            </div>
            <div className="players" aria-live="polite">
              {players.length === 0 && <p className="muted">Đang chờ học sinh vào phòng…</p>}
              {players.map((p) => (
                <span key={p.player_id} className="player-chip">
                  <span className="av"><Avatar value={p.avatar} size={34} /></span>{p.name}{p.class_name && <small className="muted"> · {p.class_name}</small>}
                  <button className="btn icon sm ghost" onClick={async () => (await askConfirm(`Mời "${p.name}" ra khỏi phòng?`)) && act('kick', p.player_id)} aria-label={`Mời ${p.name} ra khỏi phòng`} title="Mời ra"><UserX size={16} /></button>
                </span>
              ))}
            </div>
          </div>
        )}

        {(s.state === 'IN_PROGRESS' || s.state === 'PAUSED') && (
          <div className="stack" style={{ gap: 18 }}>
            {s.settings.mode === 'homework' && (
              <div className="lobby-head">
                <div>
                  <h2 style={{ margin: 0 }}>Bài tập về nhà – mã {pin}</h2>
                  <p style={{ margin: 0 }}>
                    Mở: {s.settings.start_time ? new Date(s.settings.start_time).toLocaleString('vi-VN') : 'ngay'} · Hạn nộp:{' '}
                    {s.settings.deadline ? new Date(s.settings.deadline).toLocaleString('vi-VN') : '—'}
                  </p>
                  {link && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => navigator.clipboard.writeText(link).then(() => toast('Đã chép link giao bài.', 'ok'))}><Copy size={16} /> Chép link giao bài</button>}
                </div>
                {qr && <img className="qr" src={qr} alt="Mã QR làm bài" width={160} height={160} />}
              </div>
            )}
            {paced && curQ && (
              <div className="card stack" style={{ color: 'var(--fg)' }}>
                <div className="row between">
                  <h2 style={{ margin: 0 }}>Câu {s.current_index + 1}/{s.question_count}</h2>
                  <div className="row">
                    {!s.question_locked && <span className={`badge ${remainMs <= 5000 ? 'red' : 'amber'}`} role="timer" style={{ fontSize: '1rem' }}><Clock size={14} /> {Math.ceil(remainMs / 1000)} giây</span>}
                    {s.question_locked && <span className="badge">Đã khóa câu</span>}
                    <span className="badge blue">{answeredCur}/{players.length} đã trả lời</span>
                    {!s.question_locked && <button className="btn" disabled={busy} onClick={() => act('lock')}><Lock size={18} /> Khóa & xem đáp án</button>}
                    <button className="btn primary" disabled={busy || s.state === 'PAUSED'} onClick={() => act('next')}>
                      <SkipForward size={18} /> {s.current_index + 1 >= s.question_count ? 'Kết thúc' : 'Câu tiếp theo'}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(curQ.stem.text) }} />
                <StemMedia stem={curQ.stem} />
                {s.question_locked && (() => {
                  const cur = new Map(s.answers.filter((a) => a.q_index === s.current_index).map((a) => [a.player_id, a]));
                  const kind = (pid: string) => {
                    const a = cur.get(pid);
                    if (!a || (a.answer as { kind?: string } | null)?.kind === 'none') return 'none';
                    return a.pending ? 'wait' : a.correct ? 'ok' : 'bad';
                  };
                  const group = (k: string) => players.filter((p) => kind(p.player_id) === k);
                  const rows: [string, string, string][] = [['ok', 'Trả lời đúng', 'green'], ['bad', 'Trả lời sai', 'red'], ['none', 'Chưa trả lời', 'amber'], ['wait', 'Trả lời miệng chờ chấm', 'blue']];
                  return (
                    <div className="stack" style={{ gap: 6 }} aria-label="Trạng thái trả lời của từng học sinh">
                      {rows.map(([k, label, tone]) => {
                        const list = group(k);
                        if (!list.length && k === 'wait') return null;
                        return (
                          <div key={k} className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
                            <span className={`badge ${tone}`} style={{ flex: 'none' }}>{label}: {list.length}</span>
                            <span className="small">{list.map((p) => p.name).join(' · ') || '—'}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {s.question_locked && (
                  <Stats q={curQ} stats={Object.fromEntries(
                    Object.entries(
                      s.answers.filter((a) => a.q_index === s.current_index).reduce<Record<string, number>>((m, a) => {
                        const k = answerKey(a.answer);
                        m[k] = (m[k] ?? 0) + 1;
                        return m;
                      }, {}),
                    ),
                  )} />
                )}
              </div>
            )}
            <OralGrading s={s} quiz={quiz} busy={busy} onGrade={(pid, qi, correct, points, coins) => act('grade', pid, { q_index: qi, correct, points, coins })} />
            <div className="tabs" role="tablist" aria-label="Khu vực điều khiển">
              <button role="tab" aria-selected={tab === 'dash'} className={`tab ${tab === 'dash' ? 'on' : ''}`} onClick={() => setTab('dash')}>
                <LayoutDashboard size={16} /> Bảng điều khiển
              </button>
              <button role="tab" aria-selected={tab === 'stats'} className={`tab ${tab === 'stats' ? 'on' : ''}`} onClick={() => setTab('stats')}>
                <ChartColumn size={16} /> Thống kê
              </button>
              <button role="tab" aria-selected={tab === 'cheat'} className={`tab ${tab === 'cheat' ? 'on' : ''}`} onClick={() => setTab('cheat')}>
                <ShieldAlert size={16} /> Giám sát gian lận
                {counted.length > 0 && <span className={`tab-badge ${unseen ? 'pulse' : ''}`}>{unseen || counted.length}</span>}
              </button>
              <button role="tab" aria-selected={tab === 'lb'} className={`tab ${tab === 'lb' ? 'on' : ''}`} onClick={() => setTab('lb')}>
                <Trophy size={16} /> Bảng xếp hạng
              </button>
            </div>

            {tab === 'dash' && (
              <div className="card" style={{ color: 'var(--fg)' }}>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>#</th><th>Học sinh</th><th>Lớp</th><th>Tiến độ</th><th>Đúng</th><th>Điểm</th><th>Điểm thưởng</th><th>Tổng</th>{s.settings.anti_cheat?.enabled && <th>Vi phạm</th>}<th /></tr></thead>
                    <tbody>
                      {ranked.map((p, i) => (
                        <tr key={p.player_id} style={p.locked ? { background: '#fef2f2' } : undefined}>
                          <td>{i + 1}</td>
                          <td><span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><Avatar value={p.avatar} size={30} /> <b>{p.name}</b></span> {p.finished && <span className="badge green">Xong</span>} {p.locked && <span className="badge red">Bị khóa</span>}</td>
                          <td>{p.class_name || '—'}</td>
                          <td style={{ minWidth: 120 }}>
                            <div className="progress"><i style={{ width: `${(p.answered / Math.max(1, s.question_count)) * 100}%` }} /></div>
                            <small className="muted">{p.answered}/{s.question_count}</small>
                          </td>
                          <td>{p.correct}</td>
                          <td><b>{p.score.toLocaleString('vi-VN')}</b></td>
                          <td><span className="badge amber">+{(p.coins ?? 0).toLocaleString('vi-VN')}</span></td>
                          <td><b>{totalOf(p).toLocaleString('vi-VN')}</b></td>
                          {s.settings.anti_cheat?.enabled && (
                            <td>
                              {p.violations ? (
                                <button className="badge red" style={{ border: 0, cursor: 'pointer' }} onClick={() => setTab('cheat')}><ShieldAlert size={12} /> {p.violations}</button>
                              ) : <span className="badge green">0</span>}
                            </td>
                          )}
                          <td><button className="btn icon sm ghost" onClick={async () => (await askConfirm(`Mời "${p.name}" ra?`)) && act('kick', p.player_id)} aria-label={`Mời ${p.name} ra`}><UserX size={16} /></button></td>
                        </tr>
                      ))}
                      {!ranked.length && <tr><td colSpan={10} className="muted">Chưa có học sinh nào.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {tab === 'stats' && <LiveReport s={s} quiz={quiz} />}
            {tab === 'cheat' && (
              <CheatMonitor
                s={s}
                busy={busy}
                newSince={openedAt}
                onUnlock={(pid) => act('unlock', pid)}
                onKick={async (pid, name) => (await askConfirm(`Mời "${name}" ra khỏi phòng?`)) && act('kick', pid)}
              />
            )}
            {tab === 'lb' && (
              <div className="stack" style={{ maxWidth: 760 }}>
                <div className="row between">
                  <h3 style={{ margin: 0 }}><Trophy size={20} /> {top ? `Top ${top} bạn dẫn đầu` : 'Cả lớp'} ({ranked.length} học sinh)</h3>
                  <TopFilter value={top ?? 10} onChange={setTop} />
                </div>
                <Leaderboard rows={top ? ranked.slice(0, top) : ranked} />
              </div>
            )}
          </div>
        )}

        {s.state === 'COMPLETED' && <Completed s={s} quiz={quiz} />}
      </div>
      {s.state === 'PAUSED' && <div className="badge amber" style={{ position: 'fixed', bottom: 16, left: 16, fontSize: '1.1rem' }}><Pause size={16} /> Đang tạm dừng – đồng hồ của học sinh đã dừng</div>}
      <AppFooter compact />
    </div>
  );
}

/** Danh sách câu trả lời miệng đang chờ giáo viên chấm Đúng / Sai. */
function OralGrading({ s, quiz, busy, onGrade }: {
  s: Session;
  quiz: Quiz | null;
  busy: boolean;
  onGrade: (playerId: string, qIndex: number, correct: boolean, points: number, coins: number) => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(true);
  const live = s.players.filter((p) => !p.kicked && !p.superseded);
  // Chỉ chấm câu em đã thật sự trả lời miệng (hết giờ không nói gì thì không nằm ở đây)
  const pending = s.answers.filter((a) => a.pending && (a.answer as { kind?: string } | null)?.kind !== 'none' && live.some((p) => p.player_id === a.player_id));
  if (!pending.length) return null;
  // Gom theo câu hỏi: đề và gợi ý đáp án chỉ hiện một lần, bên dưới là danh sách học sinh
  const groups = [...new Set(pending.map((a) => a.q_index))].sort((x, y) => x - y).map((qi) => {
    const rows = pending.filter((a) => a.q_index === qi)
      .map((a) => ({ a, p: live.find((x) => x.player_id === a.player_id)! }))
      .sort((x, y) => (x.p.class_name ?? '').localeCompare(y.p.class_name ?? '', 'vi') || x.p.name.localeCompare(y.p.name, 'vi'));
    return { qi, q: quiz?.questions.find((x) => x.id === rows[0].a.question_id), rows };
  });
  const gradeAll = async (g: (typeof groups)[number], correct: boolean) => {
    if (!(await askConfirm(`Chấm ${correct ? 'ĐÚNG' : 'SAI'} cho cả ${g.rows.length} em còn chờ ở câu ${g.qi + 1}?`))) return;
    for (const r of g.rows) await onGrade(r.a.player_id, r.a.q_index, correct, correct ? g.q?.points ?? 10 : 0, 0);
  };
  return (
    <div className="card stack oral-card">
      <button type="button" className="oral-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <MessageSquareText size={22} color="var(--violet)" /> <b>Chấm trả lời miệng</b> <span className="badge amber">{pending.length} lượt chờ chấm</span>
        <span className="grow" /> <span className="small muted">{open ? 'Thu gọn' : 'Mở ra để chấm'}</span>
      </button>
      {open && groups.map((g) => (
        <div key={g.qi} className="stack" style={{ gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div><b>Câu {g.qi + 1}.</b> {g.q ? htmlToText(g.q.stem.text) : ''}</div>
          {g.q?.explanation && <div className="small muted">Gợi ý đáp án: {g.q.explanation}</div>}
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm success" disabled={busy} onClick={() => gradeAll(g, true)}><Check size={16} /> Tất cả đúng ({g.rows.length})</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => gradeAll(g, false)}><X size={16} /> Tất cả sai</button>
            <span className="small muted">hoặc chấm từng em bên dưới</span>
          </div>
          <div className="oral-grid">
            {g.rows.map(({ a, p }) => {
              const ans = a.answer as { text?: string; audio_url?: string } | null;
              const has = !!(ans?.text || ans?.audio_url);
              return (
              <div key={a.player_id} className={`oral-row${has ? ' has' : ''}`}>
                <Avatar value={p.avatar} size={32} />
                <span className="oral-name"><b>{p.name}</b>{p.class_name ? <small> · {p.class_name}</small> : null}</span>
                <button className="btn icon sm success" disabled={busy} aria-label={`Chấm đúng cho ${p.name}`} title="Đúng" onClick={() => onGrade(a.player_id, a.q_index, true, g.q?.points ?? 10, 0)}><Check size={18} /></button>
                <button className="btn icon sm danger" disabled={busy} aria-label={`Chấm sai cho ${p.name}`} title="Sai" onClick={() => onGrade(a.player_id, a.q_index, false, 0, 0)}><X size={18} /></button>
                {/* Em gõ chữ / ghi âm: thầy cô đọc, nghe ngay tại đây trước khi chấm */}
                {has && (
                  <div className="oral-said">
                    {ans?.audio_url && <audio src={ans.audio_url} controls preload="none" aria-label={`Bản ghi âm của ${p.name}`} />}
                    {ans?.text && <p>{ans.text}</p>}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Completed({ s, quiz }: { s: Session; quiz: Quiz | null }) {
  const ranked = rankedPlayers(s);
  const [p1, p2, p3] = ranked;
  const stats = quiz ? questionStats(quiz, s) : [];
  const [top, setTop] = useState(s.settings.leaderboard_top ?? 0);
  const anti = !!s.settings.anti_cheat?.enabled;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <h1 className="center" style={{ margin: 0 }}>Bục vinh danh</h1>
      <div className="podium" aria-label="Top 3">
        {[p2, p1, p3].map((p, k) => (
          <div key={k} className={`step ${['p2', 'p1', 'p3'][k]}`}>
            {p ? (
              <>
                <div className="av" style={{ display: "grid", placeItems: "center" }}><Avatar value={p.avatar} size={72} /></div>
                <div>{['🥈', '🥇', '🥉'][k]} {p.name}</div>
                <div>{totalOf(p).toLocaleString('vi-VN')}</div>
              </>
            ) : <div className="muted">—</div>}
          </div>
        ))}
      </div>
      <div className="row end">
        <button className="btn accent" disabled={!quiz} onClick={() => quiz && download(`bao-cao-${s.pin}.csv`, sessionCsv(quiz, s))}>
          <Download size={18} /> Xuất báo cáo Excel (CSV)
        </button>
      </div>
      <h2 style={{ margin: 0 }}>Báo cáo chi tiết</h2>
      <LiveReport s={s} quiz={quiz} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
        <div className="card" style={{ color: 'var(--fg)' }}>
          <h3>Phân tích từng câu</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Câu</th><th>Nội dung</th><th>Tỉ lệ đúng</th><th>TG TB</th></tr></thead>
              <tbody>
                {stats.map((x) => (
                  <tr key={x.question_id}>
                    <td>{x.index}</td>
                    <td style={{ maxWidth: 280 }}><small className="muted">{x.type}</small><br />{x.text.slice(0, 120)}</td>
                    <td style={{ minWidth: 110 }}>
                      <div className="progress"><i style={{ width: `${x.pct}%`, background: x.pct >= 70 ? 'var(--success)' : x.pct >= 40 ? 'var(--accent)' : 'var(--danger)' }} /></div>
                      <b>{x.pct}%</b> <small className="muted">({x.correct}/{x.answered})</small>
                    </td>
                    <td>{x.avg_time_s}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="help">Câu có tỉ lệ đúng dưới 40% (đỏ) nên được giảng lại.</p>
        </div>
        <div className="card" style={{ color: 'var(--fg)' }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>{top ? `Top ${top} bạn được tặng cúp` : 'Kết quả học sinh'}</h3>
            <div style={{ background: 'var(--muted)', borderRadius: 12 }}><TopFilter value={top} onChange={setTop} /></div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Học sinh</th><th>Đúng</th><th>Điểm</th>{anti && <th>Vi phạm</th>}</tr></thead>
              <tbody>
                {(top ? ranked.slice(0, top) : ranked).map((p, i) => (
                  <tr key={p.player_id}>
                    <td>{i + 1}</td><td><span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><Avatar value={p.avatar} size={28} /> {p.name}{top > 0 && i < top && <Trophy size={16} color={i === 0 ? '#d97706' : i === 1 ? '#64748b' : i === 2 ? '#b45309' : 'var(--primary)'} aria-label="Được tặng cúp" />}</span></td><td>{p.correct}/{s.question_count}</td><td><b>{totalOf(p).toLocaleString('vi-VN')}</b></td>
                    {anti && <td>{p.violations ? <span className="badge red">{p.violations}</span> : <span className="badge green">0</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {anti && (
        <div className="stack">
          <h2 className="row" style={{ gap: 8, margin: 0 }}><ShieldAlert size={24} /> Nhật ký gian lận</h2>
          <CheatMonitor s={s} busy newSince={Date.now()} onUnlock={() => {}} onKick={() => {}} />
        </div>
      )}
    </div>
  );
}

/** Bài kiểm tra: lớp được giao, đồng hồ thu bài, ai đã vào, ai đã nộp, ai chưa vào. */
function ExamPanel({ s, now, link, qr }: { s: Session; now: number; link: string; qr: string }) {
  const toast = useToast();
  const roster = s.exam?.roster ?? [];
  // Chép vào bộ nhớ tạm để dán vào Zalo, tin nhắn… gửi cho phụ huynh, học sinh
  const copy = (text: string, done: string) =>
    navigator.clipboard.writeText(text).then(() => toast(done, 'ok')).catch(() => { window.prompt('Bôi đen rồi nhấn Ctrl + C để sao chép:', text); });
  const host = link ? new URL(link).host : '';
  const message = [
    `Bài kiểm tra "${s.quiz_title}" – lớp ${s.exam?.class_name ?? ''} (${s.settings.exam_minutes ?? 45} phút).`,
    link ? `Vào link: ${link}` : '',
    `${link ? 'Hoặc mở' : 'Mở'} ${host ? host + '/join' : 'trang Quickplay'}, bấm "Làm bài kiểm tra" và nhập mã PIN: ${s.pin}`,
    'Sau đó nhập tên, lớp và mã số học sinh của em.',
  ].filter(Boolean).join('\n');
  const byCode = new Map(s.players.filter((p) => !p.kicked && p.student_code).map((p) => [p.student_code!, p]));
  const absent = roster.filter((r) => !byCode.has(r.code));
  const handed = [...byCode.values()].filter((p) => p.finished).length;
  const locked = [...byCode.values()].filter((p) => p.locked).length;
  const due = s.settings.deadline ? Date.parse(s.settings.deadline) : 0;
  const left = due ? Math.max(0, due - now) : 0;
  const sec = Math.ceil(left / 1000);
  const running = s.state === 'IN_PROGRESS' || s.state === 'PAUSED';
  return (
    <div className="card stack" style={{ color: 'var(--fg)', marginBottom: 16 }} role="status">
      <div className="row between">
        <b style={{ fontSize: '1.15rem' }}>Bài kiểm tra lớp {s.exam?.class_name} · {s.settings.exam_minutes ?? 45} phút</b>
        {running && due > 0 && (
          <span className={`badge ${left < 60000 ? 'red' : 'amber'}`} style={{ fontSize: '1.1rem' }}>
            Còn {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')} · thu bài lúc {new Date(due).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {s.state === 'LOBBY_WAITING' && <span className="badge blue">Đồng hồ chạy khi thầy cô bấm Bắt đầu</span>}
        {s.state === 'COMPLETED' && <span className="badge">Đã thu bài</span>}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <span className="badge green">Đã vào {byCode.size}/{roster.length}</span>
        <span className="badge blue">Đã nộp bài {handed}</span>
        {locked > 0 && <span className="badge red">Bị khóa do vi phạm {locked}</span>}
        <span className={`badge ${absent.length ? 'amber' : ''}`}>Chưa vào {absent.length}</span>
      </div>
      {s.state !== 'COMPLETED' && (
        <div className="exam-share">
          {qr && <img className="qr" src={qr} alt="Mã QR để vào bài kiểm tra" width={132} height={132} />}
          <div className="stack grow" style={{ gap: 8, minWidth: 0 }}>
            <b>Gửi cho học sinh, phụ huynh để vào bài kiểm tra</b>
            <div className="exam-share-row">
              <span className="lbl">Mã PIN</span>
              <b className="pin" aria-label={`Mã PIN ${s.pin.split('').join(' ')}`}>{s.pin.slice(0, 3)} {s.pin.slice(3)}</b>
              <button className="btn sm" onClick={() => copy(s.pin, 'Đã chép mã PIN.')}><Copy size={16} /> Chép mã PIN</button>
            </div>
            {link && (
              <div className="exam-share-row">
                <span className="lbl">Đường link</span>
                <a className="url" href={link} target="_blank" rel="noopener noreferrer">{link.replace(/^https?:\/\//, '')}</a>
                <button className="btn sm" onClick={() => copy(link, 'Đã chép đường link vào bài kiểm tra.')}><Copy size={16} /> Chép link</button>
              </div>
            )}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm primary" onClick={() => copy(message, 'Đã chép lời nhắn. Dán vào Zalo hoặc tin nhắn để gửi.')}><Copy size={16} /> Chép lời nhắn gửi đi</button>
              {qr && <a className="btn sm" href={qr} download={`QR-bai-kiem-tra-${s.pin}.png`}><Download size={16} /> Tải ảnh mã QR</a>}
            </div>
            <small className="muted">Quét mã QR hoặc mở đường link là tới thẳng trang nhập tên, lớp và mã số học sinh. Mã số học sinh thầy cô phát riêng cho từng em.</small>
          </div>
        </div>
      )}
      {absent.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Học sinh chưa vào làm bài ({absent.length})</summary>
          <p className="small" style={{ margin: '6px 0 0' }}>{absent.map((r) => `${r.name} (${r.code})`).join(' · ')}</p>
        </details>
      )}
    </div>
  );
}
