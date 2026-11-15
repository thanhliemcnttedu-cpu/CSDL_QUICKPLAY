// Máy quét thẻ trên điện thoại của giáo viên: mở từ mã QR trên màn chiếu, chạy trên trình duyệt, không cài ứng dụng.
// Phải đăng nhập đúng tài khoản giáo viên tổ chức buổi học thì mới điều khiển được.
// Luồng: Câu hỏi → Quét phản hồi (camera, thẻ hiện tên + chữ, xanh = đúng, đỏ = sai) → Nộp (xem kết quả) → Câu tiếp → Tổng kết.
// Bảng mã thẻ là của riêng Quickplay (paperCard.ts); chỉ tham khảo cách bố trí màn hình của các phần mềm khác.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChartColumn, ChevronDown, ChevronUp, FastForward, LogIn, LogOut, ScanLine, Send, Users, ZoomIn, ZoomOut, ArrowRight, X, Play } from 'lucide-react';
import type { PaperView, Quiz, Session } from '../lib/types';
import { api } from '../lib/api';
import { cardOf, type PaperHit, type PaperOp } from '../lib/paper';
import { detectCards, toGray, type CardHit } from '../lib/paperScan';
import { currentAccount } from '../lib/account';
import { OPTION_LABELS, htmlToText } from '../lib/util';
import { sfx } from '../lib/sound';
import { Wordmark } from '../components/Logo';
import { StemMedia } from '../components/MediaView';
import { Spinner, askConfirm } from '../components/ui';
import '../paper.css';

const CONFIRM = 2; // thẻ phải đọc giống nhau ở 2 khung hình liên tiếp mới ghi nhận
const KEEP_MS = 900; // giữ nhãn tên trên thẻ thêm một lúc khi khung hình kế tiếp lỡ không đọc được (đỡ nhấp nháy)

type Stage = 'question' | 'scan' | 'result';
type Shown = { hit: CardHit; t: number };

export default function PaperScan() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const pin = params.get('pin') ?? '';
  const key = params.get('k') ?? '';
  const account = currentAccount();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [view, setView] = useState<PaperView | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [session, setSession] = useState<Session | null>(null); // dùng cho bảng tổng kết
  const [err, setErr] = useState('');
  const [stage, setStage] = useState<Stage>('question');
  const [camErr, setCamErr] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [zoom, setZoom] = useState<{ min: number; max: number; v: number } | null>(null);
  const [started, setStarted] = useState(false); // đã bấm Bắt đầu (màn chiếu mới chuyển từ mã QR sang câu 1)
  const [klass, setKlass] = useState('');
  const [recent, setRecent] = useState<{ card: number; choice: number; right: boolean }[]>([]); // vừa ghi nhận (hiện dưới ống kính)
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const gray = useRef<Uint8Array>();
  const stream = useRef<MediaStream | null>(null);
  const seen = useRef(new Map<number, { choice: number; n: number }>()); // đang xác nhận
  const sent = useRef(new Map<number, number>()); // đã ghi nhận ở câu hiện tại: thẻ -> phương án
  const shown = useRef(new Map<number, Shown>());
  const queue = useRef<PaperHit[]>([]);
  const viewRef = useRef<PaperView | null>(null);
  viewRef.current = view;
  const q = quiz && view ? quiz.questions[view.current_index] : undefined;
  const qRef = useRef(q);
  qRef.current = q;
  const namesRef = useRef(names);
  namesRef.current = names;

  const apply = useCallback((v: PaperView) => {
    if (viewRef.current && viewRef.current.current_index !== v.current_index) {
      seen.current.clear();
      sent.current.clear();
      shown.current.clear();
      queue.current = [];
      setRecent([]);
      setStage('question');
    }
    for (const [card, choice] of Object.entries(v.answers)) sent.current.set(Number(card), choice);
    setView(v);
  }, []);

  // Kết nối: kiểm tra đúng giáo viên tổ chức (đọc được buổi học bằng khóa của tài khoản), tải đề và danh sách lớp
  useEffect(() => {
    if (!pin || !key) return setErr('Liên kết quét không đầy đủ. Hãy quét lại mã QR trên màn chiếu.');
    if (!account) return;
    (async () => {
      try {
        const host = await api.hostState(pin).catch(() => {
          throw new Error('Tài khoản đang đăng nhập không phải tài khoản tổ chức buổi học này. Hãy đăng xuất rồi đăng nhập đúng tài khoản giáo viên đã mở màn chiếu.');
        });
        if (host.settings.mode !== 'paper') throw new Error('Phòng này không dùng thẻ giấy.');
        setNames(host.players.map((p) => p.name));
        setKlass(host.paper?.class_name ?? '');
        // Buổi học đã chạy (mở lại trang, đổi điện thoại) thì vào thẳng; buổi mới thì chờ thầy cô bấm Bắt đầu
        setStarted(!!host.paper?.connected || host.current_index > 0 || host.answers.length > 0 || host.state === 'COMPLETED');
        const [r, v] = await Promise.all([api.getSessionQuiz(pin), api.paperAction(pin, key, 'state')]);
        setQuiz(r.quiz);
        apply(v);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [pin, key, account?.username, apply]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gửi thẻ mới đọc được và đồng bộ trạng thái với màn chiếu
  useEffect(() => {
    if (!quiz) return;
    let stop = false;
    let sending = false;
    const tick = async () => {
      if (sending || stop) return;
      sending = true;
      try {
        const v = viewRef.current;
        const hits = queue.current.splice(0);
        const res = hits.length && v ? await api.paperAction(pin, key, 'scan', v.current_index, hits) : await api.paperAction(pin, key, 'state');
        if (!stop) apply(res);
      } catch { /* mạng chập chờn: thử lại ở nhịp sau */ }
      sending = false;
    };
    const id = window.setInterval(tick, 700);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [quiz, pin, key, apply]);

  const control = async (op: PaperOp) => {
    try {
      // Gửi nốt các thẻ vừa đọc trước khi chuyển câu
      const hits = queue.current.splice(0);
      if (hits.length && viewRef.current) await api.paperAction(pin, key, 'scan', viewRef.current.current_index, hits);
      apply(await api.paperAction(pin, key, op));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  // ---------- Camera ----------
  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  };
  useEffect(() => () => stopCamera(), []);
  useEffect(() => {
    if (stage !== 'scan') return stopCamera();
    let cancelled = false;
    (async () => {
      setCamErr('');
      if (!navigator.mediaDevices?.getUserMedia) return setCamErr('Trình duyệt này không mở được camera. Hãy mở trang bằng Chrome hoặc Safari (địa chỉ https).');
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play();
        const caps = (s.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number } };
        setZoom(caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: Math.min(caps.zoom.max, 4), v: caps.zoom.min } : null);
        (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request('screen').catch(() => {});
      } catch {
        setCamErr('Không mở được camera. Hãy cho phép trang này dùng camera rồi bấm Quét phản hồi lại.');
      }
    })();
    return () => { cancelled = true; };
  }, [stage]);
  const setZoomTo = (z: number) => {
    if (!zoom) return;
    const v = Math.max(zoom.min, Math.min(zoom.max, z));
    stream.current?.getVideoTracks()[0]?.applyConstraints({ advanced: [{ zoom: v } as MediaTrackConstraintSet] }).catch(() => {});
    setZoom({ ...zoom, v });
  };

  // ---------- Vòng nhận dạng ----------
  useEffect(() => {
    if (stage !== 'scan') return;
    let raf = 0;
    let last = 0;
    let maxW = 1600; // tự giảm khi điện thoại xử lý chậm, tăng lại khi nhanh
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const v = video.current, ov = overlay.current, cur = viewRef.current, qq = qRef.current;
      if (!v || !ov || !v.videoWidth || t - last < 90) return;
      last = t;
      const t0 = performance.now();
      const scale = Math.min(1, maxW / v.videoWidth);
      const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
      const cv = (work.current ??= document.createElement('canvas'));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, w, h);
      gray.current = toGray(ctx.getImageData(0, 0, w, h).data, gray.current);
      const hits: CardHit[] = cur?.state === 'IN_PROGRESS' ? detectCards(gray.current, w, h) : [];
      const took = performance.now() - t0;
      maxW = took > 220 ? Math.max(960, maxW - 160) : took < 90 ? Math.min(1600, maxW + 80) : maxW;

      const optN = qq?.options.length ?? 0;
      const now = performance.now();
      const visible = new Set<number>();
      for (const hit of hits) {
        if (!cur || hit.card > cur.total) continue; // thẻ không thuộc lớp này
        visible.add(hit.card);
        const valid = hit.side < optN;
        const prev = seen.current.get(hit.card);
        const n = prev && prev.choice === hit.side ? prev.n + 1 : 1;
        seen.current.set(hit.card, { choice: hit.side, n });
        if (valid && n >= CONFIRM && sent.current.get(hit.card) !== hit.side) {
          sent.current.set(hit.card, hit.side);
          queue.current = queue.current.filter((x) => x.card !== hit.card).concat({ card: hit.card, choice: hit.side });
          sfx.pop();
          const item = { card: hit.card, choice: hit.side, right: !!qq?.options[hit.side]?.is_correct };
          setRecent((r) => [item, ...r.filter((x) => x.card !== hit.card)].slice(0, 6));
        }
        // Tọa độ nhãn tính theo khung hình gốc để không lệch khi đổi độ phân giải xử lý
        shown.current.set(hit.card, { hit: { ...hit, corners: hit.corners.map((p) => ({ x: p.x / scale, y: p.y / scale })) as CardHit['corners'] }, t: now });
      }
      for (const card of [...seen.current.keys()]) if (!visible.has(card)) seen.current.delete(card);

      // Vẽ nhãn: [chữ] Tên học sinh — ô chữ xanh nếu đúng, đỏ nếu sai, xám khi chưa chắc / không có phương án đó
      const W = v.videoWidth, H = v.videoHeight;
      if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
      const g = ov.getContext('2d')!;
      g.clearRect(0, 0, W, H);
      // Cỡ chữ, nét khung tính theo kích thước ĐANG HIỂN THỊ trên màn hình (camera 1080 điểm ảnh thu vào khung ~350 điểm ảnh
      // thì chữ phải to gấp 3 mới đọc được): chữ cao ~15 điểm ảnh, khung dày ~3 điểm ảnh trên màn hình điện thoại
      const disp = Math.min((ov.clientWidth || W) / W, (ov.clientHeight || H) / H) || 1;
      const fs = 15 / disp;
      g.font = `800 ${fs}px 'Be Vietnam Pro', system-ui, sans-serif`;
      g.textBaseline = 'middle';
      for (const [card, s] of shown.current) {
        if (now - s.t > KEEP_MS) { shown.current.delete(card); continue; }
        const { hit } = s;
        const valid = hit.side < optN;
        const recorded = sent.current.get(card) === hit.side;
        const right = valid && !!qq?.options[hit.side]?.is_correct;
        const color = !valid || !recorded ? '#64748b' : right ? '#16a34a' : '#dc2626';
        // Khung quanh thẻ
        g.lineWidth = 3.5 / disp;
        g.strokeStyle = color;
        g.beginPath();
        hit.corners.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
        g.stroke();
        // Nhãn phía trên thẻ
        const cx = hit.corners.reduce((a, p) => a + p.x, 0) / 4;
        const top = Math.min(...hit.corners.map((p) => p.y));
        const name = (namesRef.current[card - 1] || `Thẻ ${card}`).slice(0, 18);
        const letter = valid ? OPTION_LABELS[hit.side] : '?';
        const pad = fs * 0.35, box = fs * 1.35;
        const nw = g.measureText(name).width;
        const tw = box + pad + nw + pad * 2;
        const x0 = Math.max(4, Math.min(W - tw - 4, cx - tw / 2));
        const y0 = Math.max(4, top - box - fs * 0.4);
        g.globalAlpha = 0.9;
        g.fillStyle = '#0f172a';
        g.fillRect(x0, y0, tw, box);
        g.globalAlpha = 1;
        g.fillStyle = color;
        g.fillRect(x0, y0, box, box);
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.fillText(letter, x0 + box / 2, y0 + box / 2);
        g.textAlign = 'left';
        g.fillText(name, x0 + box + pad, y0 + box / 2);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  // ---------- Số liệu câu hiện tại ----------
  const counts = useMemo(() => {
    const c = q ? q.options.map(() => 0) : [];
    for (const ch of Object.values(view?.answers ?? {})) if (c[ch] !== undefined) c[ch]++;
    return c;
  }, [q, view?.answers]);
  const responded = Object.keys(view?.answers ?? {}).length;

  const loadSummary = async () => {
    try { setSession(await api.hostState(pin)); } catch { /* bỏ qua */ }
  };
  useEffect(() => {
    if (view?.state === 'COMPLETED' && !session) loadSummary();
  }, [view?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Giao diện ----------
  if (!account) {
    const back = `/scan?${params.toString()}`;
    return (
      <div className="ps-wrap ps-center">
        <Wordmark size={30} />
        <div className="card stack" style={{ maxWidth: 420 }}>
          <h2 style={{ margin: 0 }}>Đăng nhập để điều khiển buổi học</h2>
          <p className="muted" style={{ margin: 0 }}>Máy quét thẻ chỉ dành cho giáo viên tổ chức buổi học. Thầy cô đăng nhập đúng tài khoản Quickplay đã mở màn chiếu, sau đó máy quét tự mở.</p>
          <button className="btn primary lg" onClick={() => nav(`/teacher/login?next=${encodeURIComponent(back)}`)}><LogIn size={20} /> Đăng nhập tài khoản giáo viên</button>
        </div>
      </div>
    );
  }
  if (err) {
    return (
      <div className="ps-wrap ps-center">
        <Wordmark size={30} />
        <div className="alert error" role="alert"><div>{err}</div></div>
        <Link className="btn ghost" to="/teacher">Về trang giáo viên</Link>
      </div>
    );
  }
  if (!quiz || !view) return <div className="ps-wrap ps-center"><Spinner label="Đang kết nối máy quét…" /></div>;

  const ended = view.state === 'COMPLETED';

  // Bước đầu: thầy cô kiểm tra lớp, bộ đề rồi bấm Bắt đầu (màn chiếu chuyển từ mã QR sang câu 1)
  if (!started && !ended) {
    return (
      <div className="ps-wrap ps-center">
        <Wordmark size={30} />
        <div className="card stack ps-intro">
          <span className="badge green" style={{ alignSelf: 'center' }}>Điện thoại đã kết nối</span>
          <h2 className="center" style={{ margin: 0 }}>{quiz.title}</h2>
          <div className="ps-facts">
            <div><b>{view.question_count}</b><span>câu hỏi</span></div>
            <div><b>{view.total}</b><span>học sinh{klass ? ` lớp ${klass}` : ''}</span></div>
          </div>
          <ol className="ps-steps">
            <li>Phát thẻ đúng số cho từng em.</li>
            <li>Bấm <b>Bắt đầu</b>: màn chiếu hiện câu hỏi đầu tiên.</li>
            <li>Học sinh xoay thẻ cho chữ đáp án lên trên rồi giơ cao, thầy cô bấm <b>Quét phản hồi</b>.</li>
          </ol>
          <button className="btn primary lg ps-wide" onClick={async () => { await control('hello'); setStarted(true); }}><Play size={22} /> Bắt đầu</button>
        </div>
      </div>
    );
  }
  const last = view.current_index >= view.question_count - 1;

  // Danh sách tên đã quét: xanh = đúng, đỏ = sai, xám = chưa quét
  const roster = (
    <div className="ps-roster">
      <div className="ps-roster-head"><ChartColumn size={16} /> <b>{responded}/{view.total}</b> đã quét</div>
      <div className="ps-roster-grid">
        {Array.from({ length: view.total }, (_, i) => {
          const ch = view.answers[i + 1];
          const cls = ch === undefined ? '' : q?.options[ch]?.is_correct ? 'ok' : 'bad';
          return <span key={i} className={cls}>#{i + 1} {names[i] || `Thẻ ${i + 1}`}{ch !== undefined ? ` · ${OPTION_LABELS[ch]}` : ''}</span>;
        })}
      </div>
    </div>
  );
  const respToggle = (
    <button type="button" className="ps-resp" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen}>
      <Users size={18} /> <b>{responded}</b> phản hồi {listOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
    </button>
  );

  if (ended) {
    const all = session?.answers ?? [];
    const right = all.filter((a) => a.correct).length;
    const acc = all.length ? Math.round((right / all.length) * 100) : 0;
    const rows = (session?.players ?? []).map((p) => ({ card: cardOf(p.player_id), name: p.name, right: all.filter((a) => a.player_id === p.player_id && a.correct).length, done: all.filter((a) => a.player_id === p.player_id).length }));
    return (
      <div className="ps-wrap">
        <div className="ps-end card stack">
          <span className="badge red" style={{ alignSelf: 'center' }}>Buổi học đã kết thúc</span>
          <h2 className="center" style={{ margin: 0 }}>{quiz.title}</h2>
          <p className="center muted" style={{ margin: 0 }}>{view.question_count} câu hỏi · {view.total} học sinh</p>
          <div className="ps-acc"><span>Độ chính xác của lớp</span><b className={acc >= 50 ? 'ok' : 'bad'}>{acc}%</b></div>
          {rows.length > 0 && (
            <div className="ps-score">
              {rows.map((r) => (
                <div key={r.card}><span>#{r.card} {r.name}</span><b className={r.right * 2 >= view.question_count ? 'ok' : 'bad'}>{r.right}/{view.question_count}</b></div>
              ))}
            </div>
          )}
          <Link className="btn primary lg" to={`/teacher/paper/${pin}`}><ChartColumn size={20} /> Xem báo cáo chi tiết</Link>
        </div>
      </div>
    );
  }

  const top = (
    <div className="ps-bar">
      <button className="btn danger sm" onClick={async () => { if (await askConfirm('Kết thúc buổi học và tạo báo cáo?')) control('end'); }}><LogOut size={16} /> Kết thúc</button>
      <span className="ps-qno">Câu {view.current_index + 1}/{view.question_count}</span>
      {stage === 'question' && <button className="btn ghost sm" onClick={async () => { if (await askConfirm('Bỏ qua câu này, chuyển sang câu tiếp theo?')) control('next'); }}><FastForward size={16} /> Bỏ qua</button>}
      {stage === 'scan' && <button className="btn ghost sm" onClick={() => setStage('question')} aria-label="Đóng camera"><X size={16} /> Đóng</button>}
    </div>
  );
  const stem = q && (
    <div className="ps-stem">
      <b>{htmlToText(q.stem.text) || 'Câu hỏi có hình ảnh'}</b>
      {(q.stem.image_url || q.stem.video) && <div className="ps-media"><StemMedia stem={q.stem} /></div>}
    </div>
  );

  if (stage === 'scan') {
    return (
      <div className="ps-wrap ps-scan">
        {top}
        <div className="ps-cam">
          <video ref={video} playsInline muted />
          <canvas ref={overlay} />
          <span className="ps-corner tl" /><span className="ps-corner tr" /><span className="ps-corner bl" /><span className="ps-corner br" />
          {zoom && (
            <div className="ps-zoom">
              <span>{zoom.v.toFixed(1).replace(/\.0$/, '')}x</span>
              <button type="button" onClick={() => setZoomTo(zoom.v + 0.5)} aria-label="Phóng to"><ZoomIn size={22} /></button>
              <button type="button" onClick={() => setZoomTo(zoom.v - 0.5)} aria-label="Thu nhỏ"><ZoomOut size={22} /></button>
            </div>
          )}
          {camErr && <div className="ps-start"><div className="alert error"><div>{camErr}</div></div></div>}
        </div>
        {/* Vừa quét: tên + chữ đáp án, xanh = đúng, đỏ = sai (giáo viên biết chắc đã nhận thẻ của em nào) */}
        <div className="ps-recent" aria-live="polite">
          {recent.length === 0 ? <span className="ps-hint">Đưa ống kính về phía các thẻ đang giơ…</span>
            : recent.map((r) => (
              <span key={r.card} className={r.right ? 'ok' : 'bad'}>
                <b>{OPTION_LABELS[r.choice]}</b> {names[r.card - 1] || `Thẻ ${r.card}`}
              </span>
            ))}
        </div>
        <div className="ps-sheet">
          {respToggle}
          {listOpen && roster}
          <button className="btn primary lg ps-wide" onClick={() => { setStage('result'); if (!view.reveal) control('reveal'); }}><Send size={20} /> Nộp</button>
          <p className="ps-foot">Học sinh giơ thẻ, giữ thẳng, không che ô đen. Lia điện thoại chậm qua từng dãy bàn.</p>
        </div>
      </div>
    );
  }

  if (stage === 'result') {
    const max = Math.max(1, ...counts);
    return (
      <div className="ps-wrap">
        {top}
        {stem}
        {respToggle}
        {listOpen && roster}
        <div className="ps-opts">
          {q?.options.map((o, i) => (
            <div key={o.option_id} className={`ps-opt res ${o.is_correct ? 'right' : 'wrong'}`}>
              <b>{OPTION_LABELS[i]}</b>
              <div>
                <span>{htmlToText(o.text) || `Phương án ${OPTION_LABELS[i]}`}</span>
                <div className="ps-meter"><i style={{ width: `${(counts[i] / max) * 100}%` }} /><em>{counts[i]}</em></div>
              </div>
            </div>
          ))}
        </div>
        <div className="ps-sheet">
          <button className="btn ghost ps-wide" onClick={() => setStage('scan')}><ScanLine size={18} /> Quét tiếp câu này</button>
          <button className="btn primary lg ps-wide" onClick={() => control('next')}>{last ? 'Tổng kết' : 'Câu hỏi tiếp theo'} <ArrowRight size={20} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-wrap">
      {top}
      {stem}
      <div className="ps-opts">
        {q?.options.map((o, i) => (
          <div key={o.option_id} className="ps-opt"><b>{OPTION_LABELS[i]}</b><div><span>{htmlToText(o.text) || `Phương án ${OPTION_LABELS[i]}`}</span></div></div>
        ))}
      </div>
      {responded > 0 && <p className="center muted" style={{ margin: 0 }}>Đã nhận {responded}/{view.total} phản hồi ở câu này.</p>}
      <div className="ps-sheet">
        <button className="btn primary lg ps-wide" onClick={() => setStage('scan')}><ScanLine size={22} /> Quét phản hồi</button>
        <p className="ps-foot">Tác giả: Nguyễn Thanh Liêm – Zalo: 0888358363</p>
      </div>
    </div>
  );
}
