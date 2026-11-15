/**
 * Logo Quickplay (nét vẽ riêng): chữ Q trắng, lõi là tam giác "phát", đuôi Q là vệt tốc độ màu vàng.
 * Cùng hình với public/favicon.svg – sửa một nơi thì sửa cả nơi kia.
 */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <defs>
        <linearGradient id="qp-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f80ff" />
          <stop offset="1" stopColor="#0b4fd0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#qp-bg)" />
      <circle cx="30" cy="30" r="16.5" fill="none" stroke="#fff" strokeWidth="6.5" />
      <path d="M25.5 21.8v16.4a1.6 1.6 0 0 0 2.4 1.4l14-8.2a1.6 1.6 0 0 0 0-2.8l-14-8.2a1.6 1.6 0 0 0-2.4 1.4z" fill="#fff" />
      <path d="M42.5 42.5l6.5 6.5" stroke="#f59e0b" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

/** Logo kèm tên phần mềm. */
export function Wordmark({ size = 36 }: { size?: number }) {
  return (
    <>
      <Logo size={size} /> <span>Quick<span style={{ color: 'var(--primary)' }}>play</span></span>
    </>
  );
}
