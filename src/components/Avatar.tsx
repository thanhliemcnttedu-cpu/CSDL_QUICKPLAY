import { memo, useId } from 'react';
import { ACCESSORIES, decodeAvatar, describeAvatar, HAIR_COLORS, isAnimal, isBuddy, SHIRTS, SKINS, type AvatarCfg } from '../lib/avatar';
import { AnimalAvatar } from './AnimalAvatar';
import { BuddyAvatar } from './BuddyAvatar';

/** Làm tối/nhạt một mã màu hex (amt âm = tối hơn). */
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Nhân vật học sinh dạng SVG (nét vẽ riêng của Quickplay). Giá trị cũ (tên con vật) vẫn hiện được. */
export const Avatar = memo(function Avatar({ value, size = 40, label }: { value?: string; size?: number; label?: boolean }) {
  const c = decodeAvatar(value);
  if (c) return <AvatarSvg c={c} size={size} label={label} />;
  if (isBuddy(value)) return <BuddyAvatar value={value} size={size} label={label} />;
  if (isAnimal(value)) return <AnimalAvatar animal={value} size={size} label={label} />;
  // Giá trị rỗng hoặc lạ (ví dụ học sinh của chế độ giấy): hình trung tính
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden style={{ display: 'block', flex: 'none' }}>
      <circle cx="60" cy="60" r="60" fill="#DCE8FB" />
      <circle cx="60" cy="47" r="22" fill="#9DB8E3" />
      <path d="M18 120 Q22 78 60 78 Q98 78 102 120 Z" fill="#9DB8E3" />
    </svg>
  );
});

export function AvatarSvg({ c, size = 40, label }: { c: AvatarCfg; size?: number; label?: boolean }) {
  const skin = SKINS[c.skin];
  const hair = HAIR_COLORS[c.hairColor];
  const shirt = SHIRTS[c.shirt];
  const ink = '#2A2230';
  const girl = c.gender === 'f';
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = (n: string) => `url(#${id}${n})`;
  const hairFill = g('hair');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={label ? 'img' : undefined}
      aria-label={label ? describeAvatar(c) : undefined}
      aria-hidden={label ? undefined : true}
      style={{ display: 'block', flex: 'none' }}
    >
      <defs>
        <radialGradient id={`${id}bg`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset=".5" stopColor={shade(shirt, 0.42)} />
          <stop offset="1" stopColor={shade(shirt, 0.34)} />
        </radialGradient>
        <radialGradient id={`${id}skin`} cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor={shade(skin, 0.1)} />
          <stop offset=".6" stopColor={skin} />
          <stop offset="1" stopColor={shade(skin, -0.12)} />
        </radialGradient>
        <linearGradient id={`${id}hair`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(hair, 0.16)} />
          <stop offset="1" stopColor={shade(hair, -0.06)} />
        </linearGradient>
        <linearGradient id={`${id}shirt`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(shirt, 0.12)} />
          <stop offset="1" stopColor={shade(shirt, -0.14)} />
        </linearGradient>
        <clipPath id={`${id}clip`}><circle cx="60" cy="60" r="60" /></clipPath>
      </defs>
      <circle cx="60" cy="60" r="60" fill={g('bg')} />
      <g clipPath={g('clip')} transform="translate(60 62) scale(1.12) translate(-60 -58)">
      {/* Tóc phía sau (bạn nữ) */}
      {girl && c.hair === 0 && <path d="M25 54 Q24 20 60 20 Q96 20 95 54 L96 96 Q84 102 79 88 L79 62 L41 62 L41 88 Q36 102 24 96 Z" fill={hairFill} />}
      {girl && c.hair === 1 && (
        <>
          <circle cx="25" cy="64" r="13" fill={hairFill} />
          <circle cx="95" cy="64" r="13" fill={hairFill} />
          <circle cx="33" cy="54" r="4" fill="#EC4899" />
          <circle cx="87" cy="54" r="4" fill="#EC4899" />
        </>
      )}
      {/* Áo + cổ */}
      <path d="M24 122 Q26 92 60 90 Q94 92 96 122 Z" fill={g('shirt')} />
      <path d="M50 89 L60 101 L70 89 Z" fill="#fff" opacity=".9" />
      <rect x="52" y="74" width="16" height="16" rx="6" fill={shade(skin, -0.1)} />
      <ellipse cx="60" cy="84" rx="20" ry="5" fill="#000" opacity=".14" />
      {/* Đầu */}
      <circle cx="30" cy="58" r="6.5" fill={shade(skin, -0.05)} />
      <circle cx="90" cy="58" r="6.5" fill={shade(skin, -0.05)} />
      <ellipse cx="60" cy="54" rx="30" ry="29.5" fill={g('skin')} />
      {/* Tóc phía trước */}
      {!girl && c.hair === 0 && <path d="M31 51 Q29 23 60 23 Q91 23 89 51 Q82 37 67 39 Q57 33 45 41 Q38 43 31 51 Z" fill={hairFill} />}
      {!girl && c.hair === 1 && <path d="M31 53 L29 36 L38 40 L40 25 L50 33 L57 21 L64 32 L72 22 L76 34 L87 29 L85 42 L90 51 Q78 40 60 41 Q42 40 31 53 Z" fill={hairFill} />}
      {girl && <path d="M32 54 Q29 23 60 23 Q91 23 88 54 Q80 38 66 37 Q63 44 52 41 Q40 41 32 54 Z" fill={hairFill} />}
      {/* Vệt sáng trên tóc tạo khối */}
      <path d="M42 31 Q52 25 64 27" stroke="#fff" strokeOpacity=".5" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* Má hồng */}
      <ellipse cx="41" cy="66" rx="5.5" ry="3.8" fill="#FF7A9A" opacity=".45" />
      <ellipse cx="79" cy="66" rx="5.5" ry="3.8" fill="#FF7A9A" opacity=".45" />
      {/* Mắt & miệng theo nét mặt */}
      {c.face === 2 ? (
        <>
          <circle cx="49" cy="55" r="5" fill={ink} /><circle cx="50.5" cy="53.5" r="1.6" fill="#fff" />
          <circle cx="71" cy="55" r="5" fill={ink} /><circle cx="72.5" cy="53.5" r="1.6" fill="#fff" />
          <path d="M43 45 Q49 41 55 45 M65 45 Q71 41 77 45" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <ellipse cx="60" cy="70" rx="4.5" ry="5.5" fill="#7A2E1F" />
        </>
      ) : (
        <>
          <ellipse cx="48" cy="56" rx="5.4" ry="6.4" fill={ink} /><circle cx="50" cy="53.6" r="2.1" fill="#fff" /><circle cx="46.2" cy="58.6" r="1" fill="#fff" opacity=".85" />
          {c.face === 1 ? (
            <path d="M66 57 Q72 51 78 57" stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          ) : (
            <><ellipse cx="72" cy="56" rx="5.4" ry="6.4" fill={ink} /><circle cx="74" cy="53.6" r="2.1" fill="#fff" /><circle cx="70.2" cy="58.6" r="1" fill="#fff" opacity=".85" /></>
          )}
          <path d="M52 68 Q60 77 68 68 Z" fill="#7A2E1F" />
          <path d="M55 71.5 Q60 74.5 65 71.5 Q60 76.5 55 71.5 Z" fill="#F472B6" />
        </>
      )}
      {/* Phụ kiện */}
      {c.acc === 1 && (
        <g stroke="#1F2937" strokeWidth="2.4" fill="#fff" fillOpacity=".18">
          <circle cx="48" cy="56" r="9.5" /><circle cx="72" cy="56" r="9.5" /><path d="M57.5 56 L62.5 56" fill="none" />
        </g>
      )}
      {c.acc === 2 && (
        <>
          <path d="M29 45 Q29 18 60 18 Q91 18 91 45 Q60 37 29 45 Z" fill={c.shirt === 3 ? '#2563EB' : '#F59E0B'} />
          <path d="M60 42 Q92 38 106 46 Q92 51 62 47 Z" fill={shade(c.shirt === 3 ? '#2563EB' : '#F59E0B', -0.15)} />
          <circle cx="60" cy="19" r="3" fill="#fff" />
        </>
      )}
      {c.acc === 3 && (
        <g transform="translate(82 26) rotate(18)">
          <path d="M0 0 L-12 -8 L-12 8 Z M0 0 L12 -8 L12 8 Z" fill="#EC4899" />
          <circle r="3.5" fill="#BE185D" />
        </g>
      )}
      {c.acc === 4 && <path d="M40 27 L44 12 L52 22 L60 9 L68 22 L76 12 L80 27 Z" fill="#FACC15" stroke="#CA8A04" strokeWidth="2" strokeLinejoin="round" />}
      </g>
      <circle cx="60" cy="60" r="58.5" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="3" />
    </svg>
  );
}

export { ACCESSORIES };
