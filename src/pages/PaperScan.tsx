// Máy quét thẻ trên điện thoại của giáo viên: mở từ mã QR trên màn chiếu, không cài ứng dụng, không đăng nhập.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, BellRing, Camera, ChartColumn, Square } from 'lucide-react';
import type { PaperView, Quiz } from '../lib/types';
import { api } from '../lib/api';
import type { PaperHit, PaperOp } from '../lib/paper';
import { detectCards, toGray, type CardHit } from '../lib/paperScan';
import { OPTION_LABELS, htmlToText } from '../lib/util';
import { sfx } from '../lib/sound';
import { Wordmark } from '../components/Logo';
import { Spinner, askConfirm } from '../components/ui';
import '../paper.css';

const MAX_W = 1600; // bề rộng khung hình đem đi nhận dạng
const CONFIRM = 2; // thẻ phải đọc giống nhau ở 2 khung hình liên tiếp mới ghi nhận

export default function PaperScan() {
  const [params] = useSearchParams();
  const pin = params.get('pin') ?? '';
  const key = params.get('k') ?? '';
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [view, setView] = useState<PaperView | null>(null);
  const [err, setErr] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const gray = useRef<Uint8Array>();
  const seen = useRef(new Map<number, { choice: number; n: number }>()); // đang xác nhận
  const sent = useRef(new Map<number, number>()); // đã ghi nhận ở câu hiện tại: thẻ -> phương án
  const queue = useRef<PaperHit[]>([]);
  const viewRef = useRef<PaperView | null>(null);
  viewRef.current = view;
  const optCount = quiz && view ? quiz.questions[view.current_index]?.options.length ?? 0 : 0;
  const optRef = useRef(0);
  optRef.current = optCount;

  const apply = useCallback((v: PaperView) => {
    if (viewRef.current && viewRef.current.current_index !== v.current_index) {
      seen.current.clear();
      sent.current.clear();
      queue.current = [];
    }
    for (const [card, choice] of Object.entries(v.answers)) sent.current.set(Number(card), choice);
    setView(v);
  }, []);

  // Kết nối: báo cho màn chiếu biết điện thoại đã vào, tải đề
  useEffect(() => {
    if (!pin || !key) return setErr('Liên kết quét không đầy đủ. Hãy quét lại mã QR trên màn chiếu.');
    Promise.all([api.getSessionQuiz(pin), api.paperAction(pin, key, 'hello')])
      .then(([r, v]) => {
        setQuiz(r.quiz);
        apply(v);
      })
      .catch((e) => setErr((e as Error).message));
  }, [pin, key, apply]);

  // Gửi thẻ mới đọc được và đồng bộ trạng thái
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
      apply(await api.paperAction(pin, key, op));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const startCamera = async () => {
    setCamErr('');
    if (!navigator.mediaDevices?.getUserMedia) return setCamErr('Trình duyệt này không mở được camera. Hãy dùng Chrome hoặc Safari và mở trang bằng địa chỉ https.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      setCamOn(true);
      (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request('screen').catch(() => {});
    } catch {
      setCamErr('Không mở được camera. Hãy cho phép trang này dùng camera rồi bấm lại.');
    }
  };
  useEffect(() => () => (video.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()), []);

  // Vòng nhận dạng
  useEffect(() => {
    if (!camOn) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const v = video.current, ov = overlay.current, cur = viewRef.current;
      if (!v || !ov || !v.videoWidth || t - last < 110) return;
      last = t;
      const scale = Math.min(1, MAX_W / v.videoWidth);
      const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
      const cv = (work.current ??= document.createElement('canvas'));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, w, h);
      gray.current = toGray(ctx.getImageData(0, 0, w, h).data, gray.current);
      const hits: CardHit[] = cur?.state === 'IN_PROGRESS' ? detectCards(gray.current, w, h) : [];

      if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
      const g = ov.getContext('2d')!;
      g.clearRect(0, 0, w, h);
      const now = new Set<number>();
      for (const hit of hits) {
        if (!cur || hit.card > cur.total) continue; // thẻ không thuộc lớp này
        now.add(hit.card);
        const valid = hit.side < optRef.current;
        const prev = seen.current.get(hit.card);
        const n = prev && prev.choice === hit.side ? prev.n + 1 : 1;
        seen.current.set(hit.card, { choice: hit.side, n });
        const ok = valid && sent.current.get(hit.card) === hit.side;
        if (valid && n >= CONFIRM && !ok) {
          sent.current.set(hit.card, hit.side);
          queue.current = queue.current.filter((x) => x.card !== hit.card).concat({ card: hit.card, choice: hit.side });
          sfx.pop();
        }
        const done = valid && sent.current.get(hit.card) === hit.side;
        g.lineWidth = Math.max(3, w / 260);
        g.strokeStyle = !valid ? '#94a3b8' : done ? '#22c55e' : '#f59e0b';
        g.beginPath();
        hit.corners.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
        g.stroke();
        const cx = (hit.corners[0].x + hit.corners[2].x) / 2, cy = (hit.corners[0].y + hit.corners[2].y) / 2;
        const fs = Math.max(16, w / 44);
        g.font = `800 ${fs}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const label = `${hit.card} · ${OPTION_LABELS[hit.side]}`;
        const tw = g.measureText(label).width + fs * 0.7;
        g.fillStyle = g.strokeStyle;
        g.fillRect(cx - tw / 2, cy - fs * 0.75, tw, fs * 1.5);
        g.fillStyle = '#fff';
        g.fillText(label, cx, cy);
      }
      for (const card of [...seen.current.keys()]) if (!now.has(card)) seen.current.delete(card);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [camOn]);

  if (err) return <div className="ps-wrap"><Wordmark size={30} /><div className="alert error"><div>{err}</div></div></div>;
  if (!quiz || !view) return <div className="ps-wrap"><Spinner label="Đang kết nối máy quét…" /></div>;

  const q = quiz.questions[view.current_index];
  const done = Object.keys(view.answers).length;
  const ended = view.state === 'COMPLETED';
  const last = view.current_index >= view.question_count - 1;
  return (
    <div className="ps-wrap">
      <div className="ps-head">
        <Wordmark size={26} />
        <span className="pp-count">Câu {view.current_index + 1}/{view.question_count}</span>
        <span className="pp-count">Đã nhận <b>{done}</b>/{view.total}</span>
      </div>

      <div className="ps-cam">
        <video ref={video} playsInline muted />
        <canvas ref={overlay} />
        {!camOn && (
          <div className="ps-start">
            {ended ? <p>Buổi học đã kết thúc. Xem bảng tổng kết trên màn chiếu.</p> : (
              <>
                <button className="btn primary lg" onClick={startCamera}><Camera size={22} /> Bắt đầu quét</button>
                <p className="small">Học sinh xoay thẻ rồi giơ cao. Thầy cô giơ điện thoại lia một vòng quanh lớp.</p>
              </>
            )}
            {camErr && <div className="alert error"><div>{camErr}</div></div>}
          </div>
        )}
      </div>

      {!ended && q && (
        <div className="ps-q">
          <b>{htmlToText(q.stem.text) || 'Câu hỏi có hình ảnh (xem trên màn chiếu)'}</b>
          <span className="muted small">{q.options.map((o, i) => `${OPTION_LABELS[i]}. ${htmlToText(o.text)}`).join('   ')}</span>
        </div>
      )}
      {!ended && (
        <div className="ps-actions">
          <button className={`btn ${view.remind ? 'accent' : 'ghost'}`} onClick={() => control('remind')}><BellRing size={18} /> Nhắc</button>
          <button className="btn ghost" onClick={() => control('reveal')}><ChartColumn size={18} /> {view.reveal ? 'Ẩn kết quả' : 'Hiện kết quả'}</button>
          <button className="btn primary" onClick={() => control('next')}>{last ? 'Tổng kết' : 'Câu tiếp'} <ArrowRight size={18} /></button>
          <button className="btn danger" onClick={async () => (await askConfirm('Kết thúc buổi học?')) && control('end')} aria-label="Kết thúc buổi học"><Square size={16} /></button>
        </div>
      )}
      <p className="ps-foot">Khung xanh: thẻ đã nhận · Khung vàng: đang đọc · Tác giả: Nguyễn Thanh Liêm – Zalo: 0888358363</p>
    </div>
  );
}
