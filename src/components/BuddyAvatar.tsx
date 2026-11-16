// "Bạn của Bé Chớp": 6 nhân vật tròn mũm mĩm cùng nét vẽ với linh vật Quickplay (SVG tự vẽ, không dùng ảnh ngoài).
// Mỗi bạn khác nhau ở màu thân, chi tiết trên đầu và hình trên bụng. Dùng làm "nhân vật của em" (dạng tròn như avatar).
import { memo, useId, type ReactNode } from 'react';
import { buddyOf } from '../lib/avatar';

const INK = '#1B2A4A';

interface Look { light: string; mid: string; dark: string; belly: string }
const LOOKS: Record<string, Look> = {
  may: { light: '#FFE1EE', mid: '#FF9EC7', dark: '#EC6AA3', belly: '#FFF4F9' },
  sao: { light: '#FFF6C4', mid: '#FFD84D', dark: '#EFB000', belly: '#FFFBE6' },
  la: { light: '#D9F8D2', mid: '#7FDB80', dark: '#3AAE4C', belly: '#F1FFF0' },
  giot: { light: '#D2F4FF', mid: '#6FD3F5', dark: '#2AA9DD', belly: '#F0FBFF' },
  banh: { light: '#FFFBF3', mid: '#FFE7C6', dark: '#EDBE84', belly: '#FFFFFF' },
  keo: { light: '#EEE3FF', mid: '#B996F8', dark: '#8657EE', belly: '#F8F3FF' },
};

const BODY = 'M80 46 C112 46 128 70 128 96 C128 124 106 140 80 140 C54 140 32 124 32 96 C32 70 48 46 80 46 Z';

/** Thân + mặt của một bạn, trong hệ tọa độ 160×160 (giống Bé Chớp). */
function Figure({ k, fill }: { k: string; fill: string }) {
  const L = LOOKS[k] ?? LOOKS.may;
  let top: ReactNode = null; // chi tiết trên đầu (vẽ sau thân)
  let topFront: ReactNode = null; // chi tiết trên đầu (vẽ đè lên thân)
  let belly: ReactNode = null;
  switch (k) {
    case 'may':
      top = (
        <g fill={fill} stroke={INK} strokeWidth="3">
          <circle cx="60" cy="54" r="15" /><circle cx="80" cy="44" r="19" /><circle cx="100" cy="54" r="15" />
        </g>
      );
      belly = <path d="M80 126 C66 117 68 106 75 106 C78 106 80 109 80 109 C80 109 82 106 85 106 C92 106 94 117 80 126 Z" fill="#FF6FA5" stroke="#E5487F" strokeWidth="1.6" />;
      break;
    case 'sao':
      topFront = <path d="M80 14 L86.5 30 L103 31 L90 41.5 L94.5 58 L80 49 L65.5 58 L70 41.5 L57 31 L73.5 30 Z" fill="#FFB800" stroke={INK} strokeWidth="3" strokeLinejoin="round" />;
      belly = <circle cx="80" cy="116" r="7" fill="#FFB800" stroke="#E0A000" strokeWidth="1.6" />;
      break;
    case 'la':
      topFront = (
        <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M80 48 Q79 38 82 30" fill="none" strokeLinecap="round" />
          <path d="M82 32 Q90 14 108 18 Q104 36 82 32 Z" fill="#4CC25A" />
          <path d="M80 36 Q70 22 56 28 Q62 42 80 36 Z" fill="#7FDB80" />
        </g>
      );
      belly = <path d="M72 122 Q72 106 90 106 Q90 122 72 122 Z M73 121 L86 109" fill="#7FDB80" stroke="#3AAE4C" strokeWidth="1.8" />;
      break;
    case 'giot':
      top = <path d="M58 58 Q74 40 80 18 Q86 40 102 58 Z" fill={fill} stroke={INK} strokeWidth="3" strokeLinejoin="round" />;
      belly = <path d="M80 104 Q88 115 88 119 Q88 126 80 126 Q72 126 72 119 Q72 115 80 104 Z" fill="#8FDFFA" stroke="#2AA9DD" strokeWidth="1.8" />;
      break;
    case 'banh':
      topFront = (
        <g fill="none" stroke={L.dark} strokeWidth="3" strokeLinecap="round">
          <path d="M80 50 Q76 42 80 36 Q84 42 80 50" fill={L.mid} stroke={INK} strokeWidth="2.6" />
          <path d="M68 54 Q72 48 78 50" />
          <path d="M92 54 Q88 48 82 50" />
          <path d="M60 60 Q66 54 72 55" />
          <path d="M100 60 Q94 54 88 55" />
        </g>
      );
      belly = (
        <g fill="#F2C38B">
          <circle cx="72" cy="114" r="3" /><circle cx="84" cy="110" r="3" /><circle cx="88" cy="121" r="3" /><circle cx="76" cy="124" r="3" />
        </g>
      );
      break;
    case 'keo':
      top = (
        <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M34 92 L12 78 L16 96 L12 114 Z" fill="#FFD84D" />
          <path d="M126 92 L148 78 L144 96 L148 114 Z" fill="#FFD84D" />
          <path d="M18 86 L20 104 M142 86 L140 104" stroke="#FF7FA3" strokeWidth="3" />
        </g>
      );
      belly = <path d="M80 115 m-8 0 a8 8 0 1 0 16 0 a5 5 0 1 0 -10 0 a2.4 2.4 0 1 0 4.8 0" fill="none" stroke="#8657EE" strokeWidth="2.6" strokeLinecap="round" />;
      break;
  }
  return (
    <>
      {top}
      {/* chân */}
      <ellipse cx="64" cy="141" rx="13" ry="8" fill={L.dark} stroke={INK} strokeWidth="2.5" />
      <ellipse cx="96" cy="141" rx="13" ry="8" fill={L.dark} stroke={INK} strokeWidth="2.5" />
      {/* thân: viền trắng sticker + viền đậm */}
      <path d={BODY} fill="#fff" stroke="#fff" strokeWidth="10" />
      <path d={BODY} fill={fill} stroke={INK} strokeWidth="3" />
      {k === 'may' && <path d="M48 62 Q80 30 112 62" fill={fill} stroke="none" />}
      <ellipse cx="62" cy="64" rx="15" ry="7" fill="#fff" opacity=".55" transform="rotate(-24 62 64)" />
      <ellipse cx="80" cy="116" rx="27" ry="19" fill={L.belly} />
      {belly}
      {topFront}
      {/* má hồng, mắt, miệng cười */}
      <ellipse cx="54" cy="96" rx="8" ry="5" fill="#FF7FA3" opacity=".6" />
      <ellipse cx="106" cy="96" rx="8" ry="5" fill="#FF7FA3" opacity=".6" />
      <ellipse cx="66" cy="83" rx="6.5" ry="8" fill={INK} />
      <ellipse cx="94" cy="83" rx="6.5" ry="8" fill={INK} />
      <circle cx="68.5" cy="80" r="2.6" fill="#fff" />
      <circle cx="96.5" cy="80" r="2.6" fill="#fff" />
      <circle cx="64" cy="87" r="1.2" fill="#fff" opacity=".8" />
      <circle cx="92" cy="87" r="1.2" fill="#fff" opacity=".8" />
      <path d="M70 97 Q80 109 90 97 Z" fill="#7A2335" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M75 102 Q80 105 85 102 Q80 107 75 102 Z" fill="#FF8FB0" />
      {/* hai tay nhỏ */}
      <path d="M38 102 Q28 110 28 120" stroke={INK} strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M38 102 Q28 110 28 120" stroke={L.dark} strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M122 102 Q132 110 132 120" stroke={INK} strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M122 102 Q132 110 132 120" stroke={L.dark} strokeWidth="9" strokeLinecap="round" fill="none" />
    </>
  );
}

/** Một bạn của Bé Chớp dạng tròn (dùng như avatar: bảng xếp hạng, danh sách, phòng chờ). */
export const BuddyAvatar = memo(function BuddyAvatar({ value, size = 40, label }: { value: string; size?: number; label?: boolean }) {
  const b = buddyOf(value);
  const k = b?.key ?? 'may';
  const L = LOOKS[k];
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role={label ? 'img' : undefined} aria-label={label ? b?.name : undefined}
      aria-hidden={label ? undefined : true} style={{ display: 'block', flex: 'none' }}>
      <defs>
        <radialGradient id={`${id}bg`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity=".9" />
          <stop offset=".3" stopColor={b?.bg ?? '#FFE0EC'} />
          <stop offset="1" stopColor={b?.bg ?? '#FFE0EC'} />
        </radialGradient>
        <radialGradient id={`${id}body`} cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor={L.light} />
          <stop offset=".5" stopColor={L.mid} />
          <stop offset="1" stopColor={L.dark} />
        </radialGradient>
        <clipPath id={`${id}clip`}><circle cx="60" cy="60" r="60" /></clipPath>
      </defs>
      <circle cx="60" cy="60" r="60" fill={`url(#${id}bg)`} />
      <g clipPath={`url(#${id}clip)`}>
        {/* thu nhỏ và đặt mặt vào giữa vòng tròn */}
        <g transform="translate(-12 -16) scale(0.9)">
          <Figure k={k} fill={`url(#${id}body)`} />
        </g>
      </g>
      <circle cx="60" cy="60" r="57.5" fill="none" stroke="#fff" strokeWidth="5" />
    </svg>
  );
});
