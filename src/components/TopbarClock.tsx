// Đồng hồ số trên thanh trên cùng của giáo viên: giờ:phút:giây và ngày tháng năm, cập nhật mỗi giây.
import { useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');
export const clockTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const clockDate = (d: Date) => `Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;

export function TopbarClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Canh đúng đầu mỗi giây để số giây không nhảy cóc
    let id = 0;
    const tick = () => {
      setNow(new Date());
      id = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    id = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <time className="topbar-clock" dateTime={now.toISOString()} aria-label={`Bây giờ là ${clockTime(now)}, ${clockDate(now).toLowerCase()}`}>
      <span className="tc-time" aria-hidden>{clockTime(now)}</span>
      <span className="tc-date" aria-hidden>{clockDate(now)}</span>
    </time>
  );
}
