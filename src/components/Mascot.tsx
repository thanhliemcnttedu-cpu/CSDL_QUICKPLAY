// "Bé Chớp" — linh vật riêng của Quickplay (vẽ bằng SVG trong mã, không dùng ảnh ngoài).
// Một cục tròn mũm mĩm màu xanh trời, ăng-ten tia chớp (quick = nhanh), bụng trắng có ngôi sao, má hồng, viền trắng như sticker.
// Năm tư thế theo tình huống: chờ (vẫy tay), đúng (reo mừng), sai (ối!), suy nghĩ, hoàn thành (ăn mừng với cúp).
import { memo, useId } from 'react';
import './mascot.css';

export type MascotPose = 'wave' | 'cheer' | 'oops' | 'think' | 'celebrate';

const POSE_LABEL: Record<MascotPose, string> = {
  wave: 'Bé Chớp vẫy tay chào',
  cheer: 'Bé Chớp reo mừng',
  oops: 'Bé Chớp ôm đầu tiếc nuối',
  think: 'Bé Chớp đang suy nghĩ',
  celebrate: 'Bé Chớp ăn mừng với cúp',
};

const INK = '#1B2A4A';
const ARM = '#2F86E0';

/** Cánh tay tròn từ vai (x1,y1) tới bàn tay (x2,y2): vẽ viền trắng sticker trước, rồi nét màu thân. */
function Arm({ d }: { d: string }) {
  return (
    <>
      <path d={d} stroke="#fff" strokeWidth="19" strokeLinecap="round" fill="none" />
      <path d={d} stroke={INK} strokeWidth="14" strokeLinecap="round" fill="none" />
      <path d={d} stroke={ARM} strokeWidth="10" strokeLinecap="round" fill="none" />
    </>
  );
}

function Spark({ x, y, s = 1, c = '#FFD43B' }: { x: number; y: number; s?: number; c?: string }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -9 L2.6 -2.6 L9 0 L2.6 2.6 L0 9 L-2.6 2.6 L-9 0 L-2.6 -2.6 Z" fill={c} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />;
}

export const Mascot = memo(function Mascot({ pose = 'wave', size = 120, className = '', still }: {
  pose?: MascotPose;
  size?: number;
  className?: string;
  /** không chuyển động (ví dụ trong danh sách) */
  still?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = (n: string) => `url(#${id}${n})`;
  const happy = pose === 'cheer' || pose === 'celebrate';

  // Tay theo tư thế: [tay trái, tay phải]
  const arms: Record<MascotPose, [string, string]> = {
    wave: ['M40 104 Q30 112 28 122', 'M120 96 Q134 84 138 64'],
    cheer: ['M40 96 Q26 82 22 62', 'M120 96 Q134 82 138 62'],
    oops: ['M40 104 Q30 112 28 122', 'M118 92 Q128 70 112 56'],
    think: ['M40 104 Q30 112 28 122', 'M118 104 Q112 118 98 116'],
    celebrate: ['M40 96 Q26 82 24 64', 'M120 94 Q132 78 134 60'],
  };

  return (
    <svg
      className={`mascot mascot-${pose} ${still ? 'still' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 160 160"
      role="img"
      aria-label={POSE_LABEL[pose]}
    >
      <defs>
        <radialGradient id={`${id}body`} cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#B9E4FF" />
          <stop offset=".45" stopColor="#6CC3FF" />
          <stop offset="1" stopColor="#3A97EE" />
        </radialGradient>
        <linearGradient id={`${id}bolt`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF3A6" />
          <stop offset="1" stopColor="#FFC21A" />
        </linearGradient>
        <linearGradient id={`${id}cup`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF0A0" />
          <stop offset="1" stopColor="#F5B400" />
        </linearGradient>
      </defs>

      {/* bóng dưới chân */}
      <ellipse className="m-shadow" cx="80" cy="150" rx="34" ry="5.5" fill="#1B2A4A" opacity=".14" />

      <g className="m-body">
        {/* ăng-ten tia chớp */}
        <path d="M80 50 Q78 38 84 30" stroke="#fff" strokeWidth="9" strokeLinecap="round" fill="none" />
        <path d="M80 50 Q78 38 84 30" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
        <path className="m-bolt" d="M86 8 L74 28 L84 28 L78 44 L96 20 L86 20 L92 8 Z" fill={g('bolt')} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" paintOrder="stroke" />

        {/* tay phía sau thân (tay trái) */}
        <Arm d={arms[pose][0]} />

        {/* chân */}
        <ellipse cx="64" cy="141" rx="13" ry="8" fill={INK} stroke="#fff" strokeWidth="4" paintOrder="stroke" />
        <ellipse cx="96" cy="141" rx="13" ry="8" fill={INK} stroke="#fff" strokeWidth="4" paintOrder="stroke" />

        {/* thân tròn: viền trắng sticker + viền đậm + màu */}
        <path d="M80 46 C112 46 128 70 128 96 C128 124 106 140 80 140 C54 140 32 124 32 96 C32 70 48 46 80 46 Z" fill="#fff" stroke="#fff" strokeWidth="10" />
        <path d="M80 46 C112 46 128 70 128 96 C128 124 106 140 80 140 C54 140 32 124 32 96 C32 70 48 46 80 46 Z" fill={g('body')} stroke={INK} strokeWidth="3" />
        {/* vệt sáng tạo khối */}
        <ellipse cx="62" cy="62" rx="15" ry="7" fill="#fff" opacity=".55" transform="rotate(-24 62 62)" />
        {/* bụng trắng + ngôi sao */}
        <ellipse cx="80" cy="116" rx="27" ry="19" fill="#EFF8FF" />
        <path d="M80 104 L83.5 112 L92 112.6 L85.5 118 L87.6 126.4 L80 121.8 L72.4 126.4 L74.5 118 L68 112.6 L76.5 112 Z" fill="#FFD43B" stroke="#E5A800" strokeWidth="1.6" strokeLinejoin="round" />

        {/* má hồng */}
        <ellipse cx="54" cy="96" rx="8" ry="5" fill="#FF7FA3" opacity=".6" />
        <ellipse cx="106" cy="96" rx="8" ry="5" fill="#FF7FA3" opacity=".6" />

        {/* mắt */}
        {happy ? (
          <>
            <path d="M58 84 Q66 74 74 84" stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none" />
            <path d="M86 84 Q94 74 102 84" stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none" />
          </>
        ) : pose === 'oops' ? (
          <>
            <path d="M57 70 L72 74 M103 70 L88 74" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="66" cy="84" r="6" fill={INK} /><circle cx="68" cy="82" r="2" fill="#fff" />
            <circle cx="94" cy="84" r="6" fill={INK} /><circle cx="96" cy="82" r="2" fill="#fff" />
          </>
        ) : (
          <>
            <ellipse cx="66" cy="83" rx="6.5" ry="8" fill={INK} />
            <ellipse cx="94" cy="83" rx="6.5" ry="8" fill={INK} />
            {/* đốm sáng: nhìn lên khi suy nghĩ */}
            <circle cx={pose === 'think' ? 67 : 68.5} cy={pose === 'think' ? 78 : 80} r="2.6" fill="#fff" />
            <circle cx={pose === 'think' ? 95 : 96.5} cy={pose === 'think' ? 78 : 80} r="2.6" fill="#fff" />
            <circle cx="64" cy="87" r="1.2" fill="#fff" opacity=".8" />
            <circle cx="92" cy="87" r="1.2" fill="#fff" opacity=".8" />
          </>
        )}

        {/* miệng */}
        {pose === 'oops' ? (
          <ellipse cx="80" cy="101" rx="5" ry="6" fill="#7A2335" stroke={INK} strokeWidth="2" />
        ) : pose === 'think' ? (
          <path d="M73 101 Q80 98 88 101" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
        ) : (
          <>
            <path d={happy ? 'M66 96 Q80 116 94 96 Z' : 'M70 97 Q80 109 90 97 Z'} fill="#7A2335" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
            <path d={happy ? 'M72 104 Q80 110 88 104 Q80 114 72 104 Z' : 'M75 102 Q80 105 85 102 Q80 107 75 102 Z'} fill="#FF8FB0" />
          </>
        )}

        {/* tay phía trước (tay phải) */}
        <Arm d={arms[pose][1]} />
      </g>

      {/* chi tiết theo tư thế */}
      {pose === 'wave' && (
        <g className="m-wave" stroke={ARM} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M146 54 Q152 60 150 68" />
          <path d="M152 46 Q160 56 157 68" opacity=".6" />
        </g>
      )}
      {pose === 'cheer' && (
        <g className="m-sparks">
          <Spark x={20} y={40} s={1.1} />
          <Spark x={142} y={40} s={1.1} c="#FF7FA3" />
          <Spark x={30} y={20} s={0.7} c="#7CE0B5" />
          <Spark x={128} y={18} s={0.7} />
        </g>
      )}
      {pose === 'oops' && (
        <path className="m-drop" d="M128 46 Q134 56 128 62 Q122 56 128 46 Z" fill="#9AD8FF" stroke={INK} strokeWidth="2" />
      )}
      {pose === 'think' && (
        <g className="m-think">
          <circle cx="126" cy="44" r="4" fill="#fff" stroke={INK} strokeWidth="2" />
          <circle cx="134" cy="32" r="6" fill="#fff" stroke={INK} strokeWidth="2" />
          <circle cx="146" cy="16" r="12" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <text x="146" y="22" textAnchor="middle" fontSize="17" fontWeight="900" fill="#2F86E0" fontFamily="Be Vietnam Pro, system-ui, sans-serif">?</text>
        </g>
      )}
      {pose === 'celebrate' && (
        <>
          {/* cúp vàng trên tay phải */}
          <g className="m-cup" transform="translate(134 44)">
            <path d="M-12 -14 L12 -14 L10 2 Q0 10 -10 2 Z" fill={g('cup')} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M-12 -10 Q-20 -10 -18 -2 Q-16 4 -9 2 M12 -10 Q20 -10 18 -2 Q16 4 9 2" stroke={INK} strokeWidth="2.5" fill="none" />
            <rect x="-3" y="5" width="6" height="7" fill="#F5B400" stroke={INK} strokeWidth="2" />
            <rect x="-9" y="12" width="18" height="5" rx="2" fill="#2F86E0" stroke={INK} strokeWidth="2" />
            <path d="M-4 -8 L0 -11 L4 -8" stroke="#fff" strokeWidth="2" fill="none" opacity=".8" />
          </g>
          <g className="m-confetti">
            <rect x="18" y="30" width="7" height="12" rx="2" fill="#FF7FA3" transform="rotate(-25 21 36)" />
            <rect x="40" y="14" width="6" height="11" rx="2" fill="#7CE0B5" transform="rotate(20 43 19)" />
            <rect x="104" y="12" width="6" height="11" rx="2" fill="#B794F6" transform="rotate(-15 107 17)" />
            <circle cx="30" cy="58" r="3.5" fill="#FFD43B" />
            <circle cx="150" cy="80" r="3.5" fill="#FF9F43" />
            <Spark x={58} y={22} s={0.7} />
          </g>
        </>
      )}
    </svg>
  );
});
