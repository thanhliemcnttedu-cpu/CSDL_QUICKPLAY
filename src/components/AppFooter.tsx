/** Chân trang chung: thông tin tác giả. `compact` dùng cho màn làm bài (nhỏ gọn, không che nội dung). */
export function AppFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`app-footer${compact ? ' compact' : ''}`}>
      Tác giả: <b>Nguyễn Thanh Liêm</b> – Zalo:{' '}
      <a href="https://zalo.me/0888358363" target="_blank" rel="noopener noreferrer">0888358363</a>
    </footer>
  );
}
