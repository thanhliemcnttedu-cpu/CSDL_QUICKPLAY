// Câu trả lời miệng của học sinh: em có thể GHI ÂM giọng nói, GÕ CHỮ, hoặc chỉ báo "đã nói với thầy cô" (giơ tay trả lời trên lớp).
// Bản ghi âm được nén nhỏ (Opus ~24 kbit/s, 1 phút ≈ 180 KB) rồi gửi lên Drive của giáo viên để thầy cô nghe lại khi chấm.
import { useEffect, useRef, useState } from 'react';
import { Check, Hand, Keyboard, Loader2, Mic, RotateCcw, Send, Square, Trash2 } from 'lucide-react';
import type { Answer } from '../lib/grading';
import { inAppBrowser, openInBrowserHint } from '../lib/inApp';

export const ORAL_MAX_SECONDS = 90;
export const ORAL_MAX_TEXT = 1000;
const MAX_BYTES = 1_500_000;

interface Props {
  disabled: boolean;
  reveal?: boolean;
  chosen?: Answer | null;
  draft?: Answer | null;
  onSubmit: (a: Answer) => void;
  onDraft?: (a: Answer) => void;
  /** Gửi bản ghi âm lên máy chủ, trả về đường dẫn nghe lại. Không có thì giữ bản ghi trên máy (chạy thử). */
  uploadAudio?: (blob: Blob) => Promise<string>;
}

type Rec = { blob?: Blob; url: string; ms: number; uploaded?: string };

/** Chọn định dạng ghi âm mà trình duyệt hỗ trợ (Chrome/Android: webm-opus; iPhone: mp4-aac). */
function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const m of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

export const micSupported = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function OralAnswer({ disabled, reveal, chosen, draft, onSubmit, onDraft, uploadAudio }: Props) {
  const saved = chosen?.kind === 'oral' ? chosen : draft?.kind === 'oral' ? draft : null;
  const [text, setText] = useState(saved?.text ?? '');
  const [rec, setRec] = useState<Rec | null>(saved?.audio_url ? { url: saved.audio_url, ms: saved.audio_ms ?? 0, uploaded: saved.audio_url } : null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [typing, setTyping] = useState(!!saved?.text);
  const mr = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);
  const tick = useRef<number>();

  const stopTracks = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    clearInterval(tick.current);
  };
  // Rời câu hỏi (hết giờ, chuyển câu) thì tắt micro ngay
  useEffect(() => () => {
    try { mr.current?.state === 'recording' && mr.current.stop(); } catch { /* bỏ qua */ }
    stopTracks();
  }, []);
  useEffect(() => {
    if (disabled && recording) stop();
  }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftOf = (t: string, r: Rec | null): Answer => ({ kind: 'oral', text: t.trim() || undefined, audio_url: r?.uploaded, audio_ms: r?.uploaded ? Math.round(r.ms) : undefined });

  const upload = async (r: Rec) => {
    if (!r.blob) return r;
    if (!uploadAudio) {
      // Chạy thử không có máy chủ: dùng luôn bản trên máy
      const done = { ...r, uploaded: r.url };
      setRec(done);
      onDraft?.(draftOf(text, done));
      return done;
    }
    setUploading(true);
    setErr('');
    try {
      const url = await uploadAudio(r.blob);
      const done = { ...r, uploaded: url };
      setRec(done);
      onDraft?.(draftOf(text, done));
      return done;
    } catch (e) {
      const msg = (e as Error).message || '';
      setErr(/Hành động không hợp lệ/.test(msg)
        ? 'Máy chủ của thầy cô chưa nhận được bản ghi âm (cần cập nhật Apps Script). Em hãy gõ câu trả lời bằng chữ nhé.'
        : `Chưa gửi được bản ghi âm: ${msg} Em bấm "Gửi lại bản ghi" hoặc gõ câu trả lời bằng chữ.`);
      return r;
    } finally {
      setUploading(false);
    }
  };

  const start = async () => {
    setErr('');
    if (!micSupported()) {
      const app = inAppBrowser();
      setErr(app ? `Trình duyệt trong ${app} không cho dùng micro. ${openInBrowserHint(app)} Hoặc em gõ câu trả lời bằng chữ.` : 'Trình duyệt này không hỗ trợ ghi âm. Em hãy gõ câu trả lời bằng chữ.');
      setTyping(true);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mime = pickMime();
      const m = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
      const parts: Blob[] = [];
      m.ondataavailable = (e) => e.data.size && parts.push(e.data);
      m.onstop = () => {
        stopTracks();
        setRecording(false);
        const ms = Date.now() - startedAt.current;
        const blob = new Blob(parts, { type: (m.mimeType || mime || 'audio/webm').split(';')[0] });
        if (!blob.size) return setErr('Không thu được âm thanh. Em kiểm tra micro rồi thử lại nhé.');
        if (blob.size > MAX_BYTES) return setErr('Bản ghi quá dài. Em hãy nói ngắn gọn hơn rồi ghi lại.');
        const r: Rec = { blob, url: URL.createObjectURL(blob), ms };
        setRec(r);
        void upload(r);
      };
      mr.current = m;
      startedAt.current = Date.now();
      setElapsed(0);
      m.start(1000);
      setRecording(true);
      tick.current = window.setInterval(() => {
        const e = Date.now() - startedAt.current;
        setElapsed(e);
        if (e >= ORAL_MAX_SECONDS * 1000) stop(); // tự dừng khi đủ thời lượng tối đa
      }, 250);
    } catch (e) {
      stopTracks();
      const name = (e as DOMException).name;
      const app = inAppBrowser();
      setErr(name === 'NotAllowedError' || name === 'SecurityError'
        ? `Em chưa cho phép dùng micro. ${app ? openInBrowserHint(app) : 'Bấm vào biểu tượng ổ khóa cạnh thanh địa chỉ, chọn Cho phép micro, rồi bấm Ghi âm lại.'} Hoặc em gõ câu trả lời bằng chữ.`
        : name === 'NotFoundError' ? 'Máy này không có micro. Em hãy gõ câu trả lời bằng chữ.'
        : 'Không mở được micro. Em hãy gõ câu trả lời bằng chữ.');
      setTyping(true);
    }
  };
  function stop() {
    try { mr.current?.state === 'recording' && mr.current.stop(); } catch { stopTracks(); setRecording(false); }
  }
  const remove = () => {
    setRec(null);
    onDraft?.(draftOf(text, null));
  };

  const hasAnswer = !!text.trim() || !!rec?.uploaded;
  const send = () => onSubmit(draftOf(text, rec));
  const left = Math.max(0, ORAL_MAX_SECONDS * 1000 - elapsed);

  // Đã nộp: hiện lại phần em đã trả lời
  if (reveal || chosen?.kind === 'oral') {
    const a = chosen?.kind === 'oral' ? chosen : null;
    return (
      <div className="oral-box">
        <span className="pq-mic" aria-hidden><Mic size={34} /></span>
        <h2 style={{ margin: 0 }}>Câu trả lời miệng</h2>
        {a?.audio_url && <audio src={a.audio_url} controls preload="metadata" className="oral-audio" />}
        {a?.text && <p className="oral-text">{a.text}</p>}
        {!a?.audio_url && !a?.text && <p style={{ margin: 0 }}>Em đã trả lời bằng lời với thầy cô.</p>}
      </div>
    );
  }

  return (
    <div className="oral-box">
      <span className={`pq-mic${recording ? ' on' : ''}`} aria-hidden><Mic size={34} /></span>
      <h2 style={{ margin: 0 }}>Câu trả lời miệng</h2>
      <p style={{ margin: 0 }}>Em <b>ghi âm</b> câu trả lời, hoặc <b>gõ chữ</b>, rồi bấm <b>Gửi câu trả lời</b>. Thầy cô sẽ nghe / đọc và chấm.</p>

      <div className="oral-tools">
        {recording ? (
          <button type="button" className="btn danger lg" onClick={stop}>
            <Square size={18} fill="currentColor" /> Dừng ghi ({fmt(elapsed)} / còn {fmt(left)})
          </button>
        ) : (
          <button type="button" className="btn primary lg" disabled={disabled || uploading} onClick={start}>
            <Mic size={20} /> {rec ? 'Ghi âm lại' : 'Ghi âm câu trả lời'}
          </button>
        )}
        {!typing && !recording && (
          <button type="button" className="btn ghost lg" disabled={disabled} onClick={() => setTyping(true)}><Keyboard size={20} /> Gõ chữ</button>
        )}
      </div>
      {recording && <div className="oral-live" role="status"><span className="oral-dot" aria-hidden /> Đang ghi âm… em nói rõ ràng vào micro nhé.</div>}

      {rec && !recording && (
        <div className="oral-rec">
          <audio src={rec.url} controls preload="metadata" className="oral-audio" />
          <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
            {uploading ? <span className="badge blue"><Loader2 size={14} className="spin" /> Đang gửi bản ghi…</span>
              : rec.uploaded ? <span className="badge green"><Check size={14} /> Đã lưu bản ghi {rec.ms ? `(${fmt(rec.ms)})` : ''}</span>
              : <button type="button" className="btn sm" onClick={() => upload(rec)}><RotateCcw size={16} /> Gửi lại bản ghi</button>}
            <button type="button" className="btn sm ghost" disabled={disabled || uploading} onClick={remove}><Trash2 size={16} /> Xóa bản ghi</button>
          </div>
        </div>
      )}

      {typing && (
        <label className="field oral-field">
          <span>Câu trả lời của em</span>
          <textarea
            className="input" rows={3} maxLength={ORAL_MAX_TEXT} value={text} disabled={disabled} autoFocus={!saved?.text}
            placeholder="Gõ câu trả lời ở đây…"
            onChange={(e) => {
              setText(e.target.value);
              onDraft?.(draftOf(e.target.value, rec));
            }}
          />
          <small className="help">{text.length}/{ORAL_MAX_TEXT} ký tự</small>
        </label>
      )}

      {err && <div className="alert warn" role="alert" style={{ textAlign: 'left' }}>{err}</div>}

      <div className="oral-tools">
        <button type="button" className="btn success lg" disabled={disabled || !hasAnswer || uploading || recording} onClick={send}>
          <Send size={20} /> Gửi câu trả lời
        </button>
      </div>
      <button type="button" className="btn ghost sm" disabled={disabled || recording} onClick={() => onSubmit({ kind: 'oral' })}>
        <Hand size={16} /> Em đã giơ tay trả lời trực tiếp với thầy cô
      </button>
    </div>
  );
}
