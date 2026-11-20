import { useState } from 'react';
import { AuthorContact } from './AuthorContact';
import { versionLine } from '../lib/appVersion';

/** Chân trang chung: thông tin tác giả và nút liên hệ. `compact` dùng cho màn làm bài (nhỏ gọn, không che nội dung). */
export function AppFooter({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <footer className={`app-footer${compact ? ' compact' : ''}`}>
      Tác giả: <b>Nguyễn Thanh Liêm</b> – Zalo:{' '}
      <a href="https://zalo.me/0888358363" target="_blank" rel="noopener noreferrer">0888358363</a>
      {!compact && <button type="button" className="app-contact" onClick={() => setOpen(true)}>Liên hệ tác giả</button>}
      {open && <AuthorContact onClose={() => setOpen(false)} />}
      {!compact && <div className="app-version">{versionLine()}</div>}
    </footer>
  );
}
