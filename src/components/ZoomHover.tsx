// Rê chuột vào mã PIN / mã QR trên màn chiếu: phóng to giữa màn hình để cả lớp nhìn rõ; rời chuột thì thu lại.
// Màn cảm ứng (không có chuột): chạm để phóng to, chạm lần nữa (hoặc chạm ra ngoài) để thu lại.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ZoomHover({ children, big, label, className = '' }: { children: ReactNode; big: ReactNode; label: string; className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const off = (e: KeyboardEvent) => e.key === 'Escape' && setOn(false);
    window.addEventListener('keydown', off);
    return () => window.removeEventListener('keydown', off);
  }, [on]);
  return (
    <>
      <span
        className={`zoom-hover ${className}`}
        tabIndex={0}
        role="button"
        aria-label={`${label} (rê chuột hoặc chạm để phóng to)`}
        title="Rê chuột vào để phóng to"
        onMouseEnter={() => setOn(true)}
        onMouseLeave={() => setOn(false)}
        onFocus={() => setOn(true)}
        onBlur={() => setOn(false)}
        onClick={() => setOn((v) => !v)}
      >
        {children}
      </span>
      {on && createPortal(
        <div className="zoom-overlay" aria-hidden onClick={() => setOn(false)}>
          <div className="zoom-big">{big}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
