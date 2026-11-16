// Rê chuột vào mã PIN / mã QR trên màn chiếu: phóng to giữa màn hình để cả lớp nhìn rõ; rời chuột thì thu lại.
// Bấm (hoặc chạm trên màn cảm ứng): ghim ảnh phóng to, bấm lần nữa vào bất kỳ đâu (hoặc phím Esc) để thu lại.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** hoverOnly: chỉ phóng to khi rê chuột; bấm thì để phần bên trong tự xử lý (ví dụ mở hộp tải mã QR). */
export function ZoomHover({ children, big, label, className = '', hoverOnly = false }: { children: ReactNode; big: ReactNode; label: string; className?: string; hoverOnly?: boolean }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const on = hover || pinned;
  const close = () => { setPinned(false); setHover(false); };
  useEffect(() => {
    if (!on) return;
    const off = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', off);
    return () => window.removeEventListener('keydown', off);
  }, [on]);
  return (
    <>
      <span
        className={`zoom-hover ${className}`}
        {...(hoverOnly ? {} : { tabIndex: 0, role: 'button', 'aria-label': `${label} (rê chuột hoặc bấm để phóng to)`, 'aria-expanded': on, title: 'Rê chuột hoặc bấm để phóng to' })}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => !hoverOnly && setHover(true)}
        onBlur={() => setHover(false)}
        onClick={() => (hoverOnly ? setHover(false) : setPinned(true))}
        onKeyDown={(e) => { if (!hoverOnly && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setPinned((v) => !v); } }}
      >
        {children}
      </span>
      {on && createPortal(
        <div className={`zoom-overlay ${pinned ? 'pinned' : ''}`} aria-hidden onClick={close}>
          <div className="zoom-big">{big}{pinned && <div className="zoom-hint">Bấm vào chỗ bất kỳ hoặc phím Esc để thu nhỏ</div>}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
