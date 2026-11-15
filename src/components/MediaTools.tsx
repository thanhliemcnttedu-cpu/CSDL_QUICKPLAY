import { useEffect, useRef, useState } from 'react';
import type { VideoMedia } from '../lib/types';
import { checkAudio, checkEmbeddable, checkImage, compressImage, embedUrl, parseVideoUrl, toWebImage, uploadFile } from '../lib/media';
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
    if (!preview) return setErr('Link chưa hợp lệ. Hỗ trợ YouTube, Vimeo hoặc link trực tiếp tệp .mp4/.webm.');
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
