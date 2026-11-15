import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

// ---------- Thông báo nhanh ----------
type Toast = { id: number; text: string; tone: 'info' | 'ok' | 'error' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <ConfirmHost />
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Hộp thoại ----------
export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-x)')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn icon ghost modal-x" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>
        {children}
        {footer && <div className="row end" style={{ marginTop: 18 }}>{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Phóng to ảnh toàn màn hình ----------
const LightboxCtx = createContext<(src: string, alt?: string) => void>(() => {});
export const useLightbox = () => useContext(LightboxCtx);

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [img, setImg] = useState<{ src: string; alt?: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const open = useCallback((src: string, alt?: string) => {
    setZoom(1);
    setImg({ src, alt });
  }, []);
  useEffect(() => {
    if (!img) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImg(null);
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.5));
      if (e.key === '-') setZoom((z) => Math.max(0.5, z - 0.5));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [img]);
  return (
    <LightboxCtx.Provider value={open}>
      {children}
      {img && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh phóng to" onClick={(e) => e.target === e.currentTarget && setImg(null)}>
          <div className="tools">
            <button className="btn icon" onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))} aria-label="Thu nhỏ"><ZoomOut size={20} /></button>
            <button className="btn icon" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} aria-label="Phóng to"><ZoomIn size={20} /></button>
            <button className="btn icon" onClick={() => setImg(null)} aria-label="Đóng"><X size={20} /></button>
          </div>
          <img
            src={img.src}
            alt={img.alt || 'Ảnh phóng to'}
            style={{ maxHeight: zoom === 1 ? '90vh' : undefined, maxWidth: zoom === 1 ? '94vw' : undefined, width: zoom === 1 ? undefined : `${zoom * 60}vw` }}
            onWheel={(e) => setZoom((z) => Math.min(4, Math.max(0.5, z + (e.deltaY < 0 ? 0.25 : -0.25))))}
          />
        </div>
      )}
    </LightboxCtx.Provider>
  );
}

export function Spinner({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="row" role="status" style={{ justifyContent: 'center', padding: 24 }}>
      <svg width="28" height="28" viewBox="0 0 50 50" aria-hidden>
        <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="6" />
        <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="40 200" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" />
        </circle>
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {help && <small className="help">{help}</small>}
      {error && <small className="error-text">{error}</small>}
    </label>
  );
}

// ---------- Hộp xác nhận ----------
type Ask = { message: string; okLabel: string; danger: boolean; resolve: (ok: boolean) => void };
let pushAsk: ((a: Ask) => void) | null = null;

/**
 * Hỏi xác nhận bằng hộp thoại của phần mềm (thay cho confirm() của trình duyệt: đẹp hơn, dùng được trên mọi thiết bị,
 * không bị trình duyệt nhúng tự bỏ qua). Trả về true nếu người dùng đồng ý.
 */
export function askConfirm(message: string, opts: { okLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushAsk) return resolve(window.confirm(message));
    pushAsk({ message, okLabel: opts.okLabel ?? 'Đồng ý', danger: !!opts.danger, resolve });
  });
}

export function ConfirmHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => {
    pushAsk = (a) => setAsk((cur) => { cur?.resolve(false); return a; });
    return () => { pushAsk = null; };
  }, []);
  const done = useCallback((ok: boolean) => {
    setAsk((cur) => { cur?.resolve(ok); return null; });
  }, []);
  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ask, done]);
  if (!ask) return null;
  return (
    <div className="modal-back" style={{ zIndex: 95 }} onMouseDown={(e) => e.target === e.currentTarget && done(false)}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-label="Xác nhận" style={{ maxWidth: 460 }}>
        <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, whiteSpace: 'pre-line' }}>{ask.message}</p>
        <div className="row end" style={{ marginTop: 18 }}>
          <button className="btn ghost" onClick={() => done(false)}>Hủy</button>
          <button className={`btn ${ask.danger ? 'danger' : 'primary'}`} autoFocus onClick={() => done(true)}>{ask.okLabel}</button>
        </div>
      </div>
    </div>
  );
}
