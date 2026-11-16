import { useEffect, useRef, useState } from 'react';
import type { VideoMedia } from '../lib/types';
import { checkAudio, checkEmbeddable, checkImage, compressImage, embedUrl, parseVideoUrl, toWebImage, uploadFile, videoUrlHint } from '../lib/media';
import { ClipboardPaste } from 'lucide-react';
import { Modal, useToast } from './ui';

/** Tải ảnh (kiểm tra định dạng & 10 MB, nén nhẹ) – dùng chung cho câu hỏi, đáp án và lời giải. */
export function useImageUpload() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const upload = async (f: File | Blob, name = 'anh', maxSide?: number): Promise<string | null> => {
    const err = checkImage(f);
    if (err) {
      toast(err, 'error');
      return null;
    }
    setBusy(true);
    try {
      const small = await compressImage(await toWebImage(f), maxSide);
      const ext = small.type.split('/')[1] || 'png';
      return await uploadFile(small, `${name}-${Date.now()}.${ext}`);
    } catch (e) {
      toast((e as Error).message, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    // Gắn ô chọn tệp vào trang (ẩn): ô không nằm trong trang có thể bị trình duyệt dọn mất trước khi người dùng chọn xong,
    // khi đó chọn tệp xong không có gì xảy ra.
    i.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    i.tabIndex = -1;
    i.setAttribute('aria-hidden', 'true');
    let done = false;
    const finish = (f: File | null) => {
      if (done) return;
      done = true;
      i.remove();
      resolve(f);
    };
    i.addEventListener('change', () => finish(i.files?.[0] ?? null));
    i.addEventListener('cancel', () => finish(null));
    document.body.appendChild(i);
    i.click();
  });
}

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/**
 * Đọc ảnh đang có trong bộ nhớ tạm (nút "Dán ảnh"), kèm lý do khi không lấy được:
 * 'empty' = bộ nhớ tạm không có ảnh; 'denied' = trình duyệt không cho trang đọc bộ nhớ tạm (chưa cấp quyền, hoặc trình duyệt không hỗ trợ).
 * Khi bị chặn, cách chắc chắn là để người dùng nhấn Ctrl+V (sự kiện dán luôn được phép).
 */
export async function clipboardImage(): Promise<{ blob: Blob | null; reason: 'ok' | 'empty' | 'denied' }> {
  if (!navigator.clipboard?.read) return { blob: null, reason: 'denied' };
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) return { blob: await item.getType(type), reason: 'ok' };
    }
    return { blob: null, reason: 'empty' };
  } catch (e) {
    // NotAllowedError: chưa cấp quyền / trang không được nhìn thấy; DataError: bộ nhớ tạm không có gì đọc được
    return { blob: null, reason: (e as Error)?.name === 'DataError' ? 'empty' : 'denied' };
  }
}

/** Đọc ảnh đang có trong bộ nhớ tạm. Trả về null nếu không có ảnh / trình duyệt chặn. */
export async function readClipboardImage(): Promise<Blob | null> {
  return (await clipboardImage()).blob;
}

/** Lấy ảnh từ sự kiện dán (Ctrl+V): ảnh chụp màn hình, ảnh chép từ trang web, hoặc tệp ảnh chép từ thư mục. */
export function imageFromPaste(e: ClipboardEvent | React.ClipboardEvent): File | null {
  const items = Array.from(e.clipboardData?.items ?? []);
  const it = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'));
  const fromItem = it?.getAsFile() ?? null;
  if (fromItem) return fromItem;
  return Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/') || /\.(png|jpe?g|jfif|webp|gif|bmp)$/i.test(f.name)) ?? null;
}

/**
 * Hộp "Dán ảnh": một ô dán đã đặt sẵn con trỏ. Nhấn Ctrl+V để dán ảnh vừa chép, hoặc Win+V để chọn ảnh bất kỳ trong
 * lịch sử bộ nhớ tạm của Windows (Win+V chỉ dán được vào ô đang nhận chữ, nên phải có ô này).
 * Nút "Dán ảnh mới nhất" đọc thẳng bộ nhớ tạm (khi trình duyệt cho phép).
 */
export function PasteImageDialog({ title = 'Dán ảnh', onPick, onClose }: { title?: string; onPick: (f: File | Blob) => void; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const ua = `${navigator.platform || ''} ${navigator.userAgent}`;
  const touch = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));
  const isWin = !touch && /Win/i.test(ua);
  const isMac = !touch && /Mac/.test(ua);
  const hint = touch ? 'Chạm giữ vào ô này → chọn Dán' : isMac ? 'Nhấn ⌘ + V để dán ảnh vừa chép' : 'Nhấn Ctrl + V để dán ảnh vừa chép';
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation(); // không để hộp soạn câu hỏi phía sau nhận thêm lần dán này
    const f = imageFromPaste(e);
    if (!f) return setMsg('Thứ vừa dán không phải ảnh. Hãy chọn một ảnh trong danh sách (Win + V) hoặc chép lại ảnh rồi dán.');
    onPick(f);
    onClose();
  };
  const latest = async () => {
    const r = await clipboardImage();
    if (r.blob) { onPick(r.blob); onClose(); return; }
    setMsg(r.reason === 'empty'
      ? 'Bộ nhớ tạm chưa có ảnh. Chép một ảnh (chuột phải vào ảnh → Sao chép hình ảnh, hoặc chụp màn hình) rồi dán vào ô trên.'
      : 'Trình duyệt chưa cho phần mềm tự đọc bộ nhớ tạm. Hãy bấm vào ô trên rồi nhấn Ctrl + V.');
  };
  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <button type="button" className="btn ghost" onClick={onClose}>Hủy</button>
        <button type="button" className="btn primary" onClick={latest}><ClipboardPaste size={16} /> Dán ảnh mới nhất</button>
      </>
    }>
      <div className="stack" style={{ gap: 10 }}>
        <textarea className="paste-catch" value="" onChange={() => {}} onPaste={onPaste} aria-label="Ô dán ảnh: nhấn Ctrl + V, hoặc Windows + V để chọn ảnh trong lịch sử bộ nhớ tạm"
          placeholder={hint} />
        {isWin && (
          <p className="paste-tip">
            <span><kbd>⊞ Win</kbd> + <kbd>V</kbd>: mở <b>lịch sử bộ nhớ tạm</b> của Windows, bấm chọn ảnh muốn dán (không chỉ ảnh mới nhất).</span>
            <small>Lần đầu dùng, Windows có thể hỏi bật lịch sử bộ nhớ tạm: chọn <b>Turn on / Bật</b>.</small>
          </p>
        )}
        {msg && <div className="alert warn" role="status"><div>{msg}</div></div>}
      </div>
    </Modal>
  );
}

/** Ghi âm qua micro, tự dừng khi đủ `maxSeconds`. */
export function useRecorder(onDone: (blob: Blob) => void, maxSeconds = 120) {
  const toast = useToast();
  const [rec, setRec] = useState(false);
  const [sec, setSec] = useState(0);
  const mr = useRef<MediaRecorder | null>(null);
  const timer = useRef<number>();
  const cb = useRef(onDone);
  cb.current = onDone;

  const stop = () => mr.current?.state === 'recording' && mr.current.stop();
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer.current);
        setRec(false);
        cb.current(new Blob(chunks, { type: r.mimeType || 'audio/webm' }));
      };
      mr.current = r;
      r.start();
      setSec(0);
      setRec(true);
      const t0 = Date.now();
      timer.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        setSec(s);
        if (s >= maxSeconds) stop();
      }, 250);
    } catch {
      toast('Không truy cập được micro. Bấm biểu tượng ổ khóa cạnh thanh địa chỉ → Micrô → Cho phép.', 'error');
    }
  };
  useEffect(() => () => clearInterval(timer.current), []);
  return { rec, sec, toggle: () => (rec ? stop() : start()) };
}

export { checkAudio };

export function VideoUrlDialog({ initial, onClose, onSave }: { initial?: VideoMedia; onClose: () => void; onSave: (v: VideoMedia) => void }) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [start, setStart] = useState(initial?.start_time?.toString() ?? '');
  const [end, setEnd] = useState(initial?.end_time?.toString() ?? '');
  const [err, setErr] = useState('');
  const [checking, setChecking] = useState(false);
  const parsed = parseVideoUrl(url);
  const preview: VideoMedia | null = parsed ? { source_type: 'internet_url', ...parsed, start_time: Number(start) || undefined, end_time: Number(end) || undefined } : null;

  useEffect(() => setErr(''), [url]);

  const save = async () => {
    if (!preview) return setErr(videoUrlHint(url));
    if (preview.start_time && preview.end_time && preview.end_time <= preview.start_time) return setErr('Giây kết thúc phải lớn hơn giây bắt đầu.');
    setChecking(true);
    const e = await checkEmbeddable(preview);
    setChecking(false);
    if (e) return setErr(e);
    onSave(preview);
  };

  return (
    <Modal
      title="Nhúng video từ Internet"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Hủy</button>
          <button className="btn primary" onClick={save} disabled={!url || checking}>{checking ? 'Đang kiểm tra…' : 'Chèn video'}</button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span>Đường link video</span>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" autoFocus />
        </label>
        <div className="row">
          <label className="field grow"><span>Bắt đầu từ giây</span><input className="input" type="number" min={0} value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="field grow"><span>Kết thúc ở giây</span><input className="input" type="number" min={0} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        {err && <div className="alert error" role="alert">{err}</div>}
        {preview && embedUrl(preview) && <iframe className="video-frame" src={embedUrl(preview)!} title="Xem trước" allowFullScreen />}
      </div>
    </Modal>
  );
}
