// Nút "Đăng nhập bằng Gmail" (Google Identity Services). Token của Google được đổi lấy phiên Quickplay ở máy chủ quản trị.
import { useEffect, useRef, useState } from 'react';
import { loginWithGoogle } from '../lib/account';

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } };
  }
}

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';

/** Tải thư viện Google một lần, rồi vẽ nút. Khi đăng nhập xong gọi onDone. */
export function GoogleSignIn({ onDone, onError }: { onDone: () => void; onError: (msg: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let live = true;
    const draw = () => {
      if (!live || !box.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (resp: { credential: string }) => {
          try {
            await loginWithGoogle(resp.credential);
            onDone();
          } catch (e) {
            onError((e as Error).message);
          }
        },
      });
      window.google.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', text: 'continue_with', width: 320, locale: 'vi' });
      setReady(true);
    };
    if (window.google) draw();
    else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = draw;
      s.onerror = () => onError('Không tải được đăng nhập Google. Kiểm tra mạng Internet.');
      document.head.appendChild(s);
    }
    return () => { live = false; };
  }, [onDone, onError]);

  if (!CLIENT_ID) return null;
  return (
    <div className="stack" style={{ gap: 8, alignItems: 'center' }}>
      <div ref={box} />
      {!ready && <small className="muted">Đang tải nút đăng nhập Google…</small>}
    </div>
  );
}
