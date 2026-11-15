// Ảnh bìa của bộ câu hỏi: dán, tải lên, hoặc dùng lại ảnh bìa giáo viên đã tải lên trước đây (không tải trùng).
import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, ImagePlus, Images, Link2, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { clipboardImage, imageFromPaste, pickFile, useImageUpload } from './MediaTools';
import { Modal, Spinner, useToast } from './ui';
import '../cover.css';

export function CoverPicker({ value, title, onChange }: { value?: string; title: string; onChange: (url: string | undefined) => void }) {
  const toast = useToast();
  const { upload, busy } = useImageUpload();
  const [gallery, setGallery] = useState<null | { url: string; used: string[] }[]>(null);
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState('');
  // Dùng ảnh theo đường link: không tải gì lên, không tốn dung lượng lưu trữ
  const useLink = () => {
    const u = link.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) return toast('Link ảnh phải bắt đầu bằng http:// hoặc https://', 'error');
    const img = new Image();
    img.onload = () => { onChange(u); setLinking(false); setLink(''); toast('Đã đặt ảnh bìa từ link.', 'ok'); };
    img.onerror = () => toast('Không mở được ảnh từ link này. Hãy bấm chuột phải vào ảnh, chọn "Sao chép địa chỉ hình ảnh" rồi dán lại.', 'error');
    img.src = u;
  };

  const put = async (f: File | Blob | null) => {
    if (!f) return;
    const url = await upload(f, 'bia', 960); // ảnh bìa chỉ hiện nhỏ: 960px là đủ nét, tệp nhẹ hơn nhiều
    if (url) {
      onChange(url);
      toast('Đã đặt ảnh bìa.', 'ok');
    }
  };
  // Bấm "Dán ảnh" mà trình duyệt không cho đọc bộ nhớ tạm: chờ người dùng nhấn Ctrl+V (cách này trình duyệt luôn cho phép)
  const frame = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const putRef = useRef(put);
  putRef.current = put;
  useEffect(() => {
    if (!armed) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = imageFromPaste(e);
      if (!f) return toast('Thứ vừa dán không phải ảnh. Hãy chép một ảnh (chuột phải vào ảnh → Sao chép hình ảnh, hoặc chụp màn hình) rồi nhấn Ctrl + V lại.', 'error');
      e.preventDefault();
      setArmed(false);
      putRef.current(f);
    };
    window.addEventListener('paste', onPaste);
    const t = window.setTimeout(() => setArmed(false), 60000);
    return () => { window.removeEventListener('paste', onPaste); clearTimeout(t); };
  }, [armed]); // eslint-disable-line react-hooks/exhaustive-deps
  const paste = async () => {
    const r = await clipboardImage();
    if (r.blob) return put(r.blob);
    setArmed(true);
    frame.current?.focus();
    toast(r.reason === 'empty'
      ? 'Bộ nhớ tạm chưa có ảnh. Hãy chép một ảnh (chuột phải vào ảnh → Sao chép hình ảnh, hoặc chụp màn hình), rồi nhấn Ctrl + V.'
      : 'Trình duyệt chưa cho phần mềm tự đọc bộ nhớ tạm. Hãy nhấn Ctrl + V ngay bây giờ để dán ảnh.', 'info');
  };
  // Ảnh bìa đã dùng ở các bộ câu hỏi khác của giáo viên: gom theo đường dẫn để mỗi ảnh chỉ hiện một lần
  const openGallery = async () => {
    setOpen(true);
    setGallery(null);
    try {
      const map = new Map<string, string[]>();
      for (const q of await api.listQuizzes()) if (q.cover_url) map.set(q.cover_url, [...(map.get(q.cover_url) ?? []), q.title]);
      setGallery([...map.entries()].map(([url, used]) => ({ url, used })));
    } catch (e) {
      toast((e as Error).message, 'error');
      setGallery([]);
    }
  };

  return (
    <div className="cover-pick">
      <div
        ref={frame} className={`cover-frame ${armed ? 'armed' : ''}`} tabIndex={0} role="group" aria-label="Ảnh bìa bộ câu hỏi. Bấm vào đây rồi nhấn Ctrl+V để dán ảnh"
        onPaste={(e) => { if (armed) return; const f = imageFromPaste(e); if (f) { e.preventDefault(); put(f); } }}
      >
        {busy ? <Spinner label="Đang tải ảnh…" /> : value ? <img src={value} alt={`Ảnh bìa của ${title}`} /> : <span>{title.trim().charAt(0).toUpperCase() || 'Q'}</span>}
        {armed && !busy && <b className="cover-armed" role="status">Nhấn Ctrl + V để dán ảnh</b>}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <b>Ảnh bìa bộ câu hỏi</b>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn sm" onClick={paste} disabled={busy}><ClipboardPaste size={16} /> Dán ảnh</button>
          <button type="button" className="btn sm" onClick={async () => put(await pickFile('image/*'))} disabled={busy}><ImagePlus size={16} /> Tải ảnh lên</button>
          <button type="button" className="btn sm" onClick={() => setLinking((v) => !v)} disabled={busy} aria-expanded={linking}><Link2 size={16} /> Dán link ảnh</button>
          <button type="button" className="btn sm" onClick={openGallery} disabled={busy}><Images size={16} /> Dùng ảnh đã có</button>
          {value && <button type="button" className="btn sm danger" onClick={() => onChange(undefined)}><Trash2 size={16} /> Bỏ ảnh bìa</button>}
        </div>
        {linking && (
          <div className="row" style={{ gap: 6 }}>
            <input className="input grow" style={{ minWidth: 220 }} type="url" inputMode="url" autoFocus placeholder="https://… (địa chỉ của ảnh)" value={link}
              onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); useLink(); } }} aria-label="Link ảnh bìa" />
            <button type="button" className="btn sm primary" onClick={useLink}>Dùng link này</button>
          </div>
        )}
        <small className="muted">Ảnh bìa giúp nhận ra bộ câu hỏi trong thư viện. Dùng lại ảnh đã tải lên để không tốn thêm dung lượng lưu trữ.</small>
      </div>

      {open && (
        <Modal title="Ảnh bìa đã tải lên" onClose={() => setOpen(false)}>
          {!gallery ? <Spinner /> : gallery.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Chưa có ảnh bìa nào. Hãy dán hoặc tải lên một ảnh; từ lần sau ảnh đó sẽ hiện ở đây để dùng lại.</p>
          ) : (
            <div className="cover-grid">
              {gallery.map((g) => (
                <button key={g.url} type="button" className={`cover-item ${g.url === value ? 'on' : ''}`} title={`Đang dùng ở: ${g.used.join(', ')}`}
                  aria-label={`Dùng ảnh bìa của ${g.used[0]}`} onClick={() => { onChange(g.url); setOpen(false); toast('Đã dùng lại ảnh bìa có sẵn.', 'ok'); }}>
                  <img src={g.url} alt="" loading="lazy" />
                  <small>{g.used.length > 1 ? `${g.used.length} bộ đang dùng` : g.used[0]}</small>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
