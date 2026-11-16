// Nút bật/tắt nhạc nền vui nhộn (giáo viên: thanh trên cùng; học sinh: phòng chờ, màn chơi).
// Trình duyệt chỉ cho phát âm thanh sau lần chạm/bấm đầu tiên: nhạc đã bật thì tự phát từ lần chạm đó.
import { useEffect, useState } from 'react';
import { Music, Music2 } from 'lucide-react';
import { musicPref, playMusic, setMusicPref, stopMusic, type MusicScope } from '../lib/sound';

export function MusicButton({ scope, defaultOn = false, initial, paused = false, label = true, className = 'btn sm ghost' }: {
  scope: MusicScope;
  /** Bắt đầu theo giá trị này, bỏ qua lựa chọn đã nhớ (VD màn tổ chức: theo ô "Nhạc nền" thầy cô vừa chọn cho phòng) */
  initial?: boolean;
  /** Chưa chọn lần nào thì theo mặc định này (VD học sinh: theo cài đặt "Nhạc nền" của phòng) */
  defaultOn?: boolean;
  /** Tạm dừng (VD đang làm bài kiểm tra, buổi học đã kết thúc) mà không đổi lựa chọn của người dùng */
  paused?: boolean;
  label?: boolean;
  className?: string;
}) {
  const [on, setOn] = useState(() => initial ?? musicPref(scope, defaultOn));
  const playing = on && !paused;
  useEffect(() => {
    if (!playing) {
      stopMusic();
      return;
    }
    playMusic();
    // nhạc đang chờ được phép phát: lần chạm/bấm kế tiếp trên trang sẽ mở tiếng
    const kick = () => playMusic();
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      stopMusic(400); // chuyển sang trang khác cũng có nút nhạc: nhạc chạy liền, không ngắt
    };
  }, [playing]);
  const toggle = () => {
    setMusicPref(scope, !on);
    setOn(!on);
  };
  const text = on ? 'Tắt nhạc nền' : 'Bật nhạc nền';
  return (
    <button type="button" className={`${className} music-btn ${playing ? 'on' : ''}`} onClick={toggle} aria-pressed={on} aria-label={text} title={paused && on ? 'Nhạc nền tạm dừng' : text}>
      {on ? <Music2 size={18} /> : <Music size={18} />}
      {label && <span>{on ? 'Nhạc: bật' : 'Nhạc: tắt'}</span>}
    </button>
  );
}
