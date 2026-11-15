// Con vật chibi kiểu 3D (SVG tự vẽ của Quickplay): đầu to, mắt to có đốm sáng, má hồng, đổ khối bằng gradient.
import { memo, useId, type ReactNode } from 'react';
import { animalOf } from '../lib/avatar';

interface Look {
  fur: string; // màu lông chính
  dark: string; // màu tối hơn (tai trong, vằn, bóng)
  face?: string; // mảng sáng quanh mõm/bụng
  ears: 'cat' | 'round' | 'long' | 'floppy' | 'tuft' | 'big' | 'none';
  earIn?: string;
  nose?: string;
}

const LOOKS: Record<string, Look> = {
  cat: { fur: '#F6A23C', dark: '#D97B14', face: '#FFF3DF', ears: 'cat', earIn: '#FFB8C6', nose: '#F472B6' },
  dog: { fur: '#C98B52', dark: '#8A5527', face: '#FFF1DC', ears: 'floppy', nose: '#3B2A20' },
  fox: { fur: '#F2762E', dark: '#C4501A', face: '#FFFFFF', ears: 'cat', earIn: '#3B2A20', nose: '#3B2A20' },
  panda: { fur: '#FFFFFF', dark: '#2B2B33', ears: 'round', nose: '#2B2B33' },
  rabbit: { fur: '#FFFFFF', dark: '#E5DCE8', ears: 'long', earIn: '#FFB8C6', nose: '#F472B6' },
  bear: { fur: '#A9703F', dark: '#7A4B24', face: '#F3D9B5', ears: 'round', earIn: '#F3D9B5', nose: '#3B2A20' },
  frog: { fur: '#5CC84A', dark: '#3A9A2C', face: '#D8F5B8', ears: 'none' },
  tiger: { fur: '#F59A2E', dark: '#3B2A20', face: '#FFF6E6', ears: 'round', earIn: '#FFF6E6', nose: '#F472B6' },
  koala: { fur: '#A7B0BC', dark: '#77818F', face: '#E9EDF2', ears: 'big', earIn: '#F4D7E0', nose: '#3B3F48' },
  penguin: { fur: '#33435C', dark: '#1F2A3D', face: '#FFFFFF', ears: 'none' },
  owl: { fur: '#9A6B45', dark: '#6F4628', face: '#F5E3C8', ears: 'tuft' },
  unicorn: { fur: '#FFFFFF', dark: '#E6DDF5', ears: 'cat', earIn: '#FFC4DD', nose: '#F9A8D4' },
  lion: { fur: '#F7C352', dark: '#C2701C', face: '#FFF3D6', ears: 'round', earIn: '#F7C352', nose: '#7A3E1D' },
  monkey: { fur: '#9A6238', dark: '#6E4222', face: '#F6D7B0', ears: 'big', earIn: '#F6D7B0', nose: '#6E4222' },
  elephant: { fur: '#9FB4CC', dark: '#7C93AE', ears: 'big', earIn: '#F7C6D4' },
  chick: { fur: '#FFD43B', dark: '#F0A500', ears: 'none' },
};

const INK = '#2A2230';

export const AnimalAvatar = memo(function AnimalAvatar({ animal, size = 40, label }: { animal: string; size?: number; label?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const meta = animalOf(animal);
  const L = LOOKS[animal] ?? LOOKS.cat;
  const g = (n: string) => `url(#${id}${n})`;
  const fur = g('fur');

  // ---- Tai (vẽ sau đầu) ----
  let ears: ReactNode = null;
  if (L.ears === 'cat')
    ears = (
      <>
        <path d="M27 44 L30 12 L52 30 Z" fill={fur} stroke={L.dark} strokeOpacity=".25" />
        <path d="M93 44 L90 12 L68 30 Z" fill={fur} stroke={L.dark} strokeOpacity=".25" />
        <path d="M32 36 L33 20 L45 31 Z" fill={L.earIn} />
        <path d="M88 36 L87 20 L75 31 Z" fill={L.earIn} />
      </>
    );
  if (L.ears === 'round')
    ears = (
      <>
        <circle cx="31" cy="27" r="13" fill={animal === 'panda' ? L.dark : fur} />
        <circle cx="89" cy="27" r="13" fill={animal === 'panda' ? L.dark : fur} />
        {L.earIn && <><circle cx="31" cy="28" r="7" fill={L.earIn} /><circle cx="89" cy="28" r="7" fill={L.earIn} /></>}
      </>
    );
  if (L.ears === 'big')
    ears = (
      <>
        <ellipse cx="22" cy="46" rx={animal === 'elephant' ? 19 : 15} ry={animal === 'elephant' ? 24 : 16} fill={fur} />
        <ellipse cx="98" cy="46" rx={animal === 'elephant' ? 19 : 15} ry={animal === 'elephant' ? 24 : 16} fill={fur} />
        <ellipse cx="23" cy="47" rx={animal === 'elephant' ? 11 : 8} ry={animal === 'elephant' ? 16 : 9} fill={L.earIn} />
        <ellipse cx="97" cy="47" rx={animal === 'elephant' ? 11 : 8} ry={animal === 'elephant' ? 16 : 9} fill={L.earIn} />
      </>
    );
  if (L.ears === 'long')
    ears = (
      <>
        <ellipse cx="44" cy="20" rx="9" ry="24" fill={fur} stroke={L.dark} transform="rotate(-8 44 20)" />
        <ellipse cx="76" cy="20" rx="9" ry="24" fill={fur} stroke={L.dark} transform="rotate(8 76 20)" />
        <ellipse cx="44" cy="22" rx="4.5" ry="16" fill={L.earIn} transform="rotate(-8 44 22)" />
        <ellipse cx="76" cy="22" rx="4.5" ry="16" fill={L.earIn} transform="rotate(8 76 22)" />
      </>
    );
  if (L.ears === 'tuft')
    ears = (
      <>
        <path d="M30 40 L26 14 L50 28 Z" fill={L.dark} />
        <path d="M90 40 L94 14 L70 28 Z" fill={L.dark} />
      </>
    );

  // ---- Chi tiết riêng từng con (vẽ trên đầu) ----
  const eyeY = animal === 'frog' ? 34 : 56;
  const eye = (cx: number) => (
    <g key={cx}>
      {animal === 'panda' && <ellipse cx={cx} cy={eyeY} rx="8" ry="9" fill="#fff" />}
      <ellipse cx={cx} cy={eyeY} rx={animal === 'panda' ? 5.5 : 7} ry={animal === 'panda' ? 6.5 : 8} fill={INK} />
      <circle cx={cx + 2.4} cy={eyeY - 3} r="2.8" fill="#fff" />
      <circle cx={cx - 2.4} cy={eyeY + 3} r="1.3" fill="#fff" opacity=".85" />
    </g>
  );
  const smile = <path d="M54 72 Q60 78 66 72" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
  const muzzle = L.face && !['frog', 'penguin', 'owl'].includes(animal) ? <ellipse cx="60" cy="70" rx="17" ry="13" fill={L.face} /> : null;
  const nose = L.nose ? <path d="M55 64 Q60 61 65 64 Q63 69 60 69.5 Q57 69 55 64 Z" fill={L.nose} /> : null;

  let under: ReactNode = null; // dưới mắt mũi
  let over: ReactNode = null; // trên cùng
  let mouth: ReactNode = smile;
  switch (animal) {
    case 'cat':
      over = <path d="M26 66 L40 68 M26 73 L40 72 M94 66 L80 68 M94 73 L80 72" stroke={L.dark} strokeWidth="1.8" strokeLinecap="round" />;
      under = <path d="M52 27 L56 37 M60 25 L60 36 M68 27 L64 37" stroke={L.dark} strokeWidth="3" strokeLinecap="round" opacity=".7" />;
      break;
    case 'dog':
      over = (
        <>
          <path d="M26 30 Q14 36 18 62 Q24 70 34 58 Q36 40 40 30 Z" fill={L.dark} />
          <path d="M94 30 Q106 36 102 62 Q96 70 86 58 Q84 40 80 30 Z" fill={L.dark} />
          <path d="M56 76 Q60 86 64 76 Z" fill="#F472B6" />
        </>
      );
      under = <ellipse cx="74" cy="52" rx="13" ry="14" fill={L.dark} opacity=".35" />;
      break;
    case 'fox':
      under = <path d="M24 60 Q40 62 60 84 Q80 62 96 60 Q92 86 60 90 Q28 86 24 60 Z" fill="#fff" />;
      break;
    case 'panda':
      under = (
        <>
          <ellipse cx="45" cy="56" rx="12" ry="14" fill={L.dark} transform="rotate(-14 45 56)" />
          <ellipse cx="75" cy="56" rx="12" ry="14" fill={L.dark} transform="rotate(14 75 56)" />
        </>
      );
      break;
    case 'rabbit':
      mouth = (
        <>
          {smile}
          <rect x="57" y="73" width="6" height="6" rx="1.5" fill="#fff" stroke={L.dark} />
        </>
      );
      break;
    case 'frog':
      under = (
        <>
          <circle cx="42" cy="33" r="14" fill={fur} />
          <circle cx="78" cy="33" r="14" fill={fur} />
          <circle cx="42" cy="34" r="10" fill="#fff" />
          <circle cx="78" cy="34" r="10" fill="#fff" />
          <ellipse cx="60" cy="74" rx="22" ry="12" fill={L.face} opacity=".7" />
        </>
      );
      mouth = <path d="M40 68 Q60 84 80 68" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />;
      break;
    case 'tiger':
      under = (
        <path d="M52 27 L56 38 M60 25 L60 37 M68 27 L64 38 M25 52 L36 55 M25 62 L35 62 M95 52 L84 55 M95 62 L85 62"
          stroke={L.dark} strokeWidth="3.4" strokeLinecap="round" />
      );
      break;
    case 'koala':
      over = <ellipse cx="60" cy="66" rx="7.5" ry="10" fill={L.nose} />;
      mouth = <path d="M55 80 Q60 84 65 80" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
      break;
    case 'penguin':
      under = <path d="M60 34 Q38 30 32 56 Q30 84 60 88 Q90 84 88 56 Q82 30 60 34 Z" fill="#fff" />;
      mouth = <path d="M52 65 L68 65 L60 76 Z" fill="#FDBA3B" stroke="#E08A00" strokeLinejoin="round" />;
      break;
    case 'owl':
      under = (
        <>
          <circle cx="45" cy="56" r="15" fill={L.face} />
          <circle cx="75" cy="56" r="15" fill={L.face} />
        </>
      );
      mouth = <path d="M54 66 L66 66 L60 77 Z" fill="#FDBA3B" stroke="#E08A00" strokeLinejoin="round" />;
      break;
    case 'unicorn':
      over = (
        <>
          <path d="M60 2 L53 28 L67 28 Z" fill={g('horn')} stroke="#E0A400" strokeLinejoin="round" />
          <path d="M56 17 L64 14 M55 23 L66 20" stroke="#E0A400" strokeWidth="1.5" />
          <path d="M30 34 Q22 50 28 70 Q36 58 38 40 Z" fill="#F9A8D4" />
          <path d="M34 28 Q40 22 52 26 Q44 30 40 40 Z" fill="#A78BFA" />
          <path d="M44 24 Q54 20 62 27 Q52 28 48 34 Z" fill="#60A5FA" />
        </>
      );
      break;
    case 'lion':
      mouth = smile;
      break;
    case 'monkey':
      under = <path d="M60 30 Q34 30 34 56 Q34 66 44 66 Q40 86 60 88 Q80 86 76 66 Q86 66 86 56 Q86 30 60 30 Z" fill={L.face} />;
      break;
    case 'elephant':
      over = <path d="M52 62 Q50 84 58 92 Q66 96 68 88 Q62 88 64 80 Q68 70 68 62 Z" fill={fur} stroke={L.dark} strokeOpacity=".5" />;
      mouth = null;
      break;
    case 'chick':
      over = <path d="M54 20 Q56 8 60 16 Q64 6 66 20 Z" fill={L.dark} />;
      mouth = <path d="M52 66 L68 66 L60 76 Z" fill="#FB923C" stroke="#EA6A0A" strokeLinejoin="round" />;
      break;
  }

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role={label ? 'img' : undefined} aria-label={label ? `Bạn ${(meta?.name ?? 'thú cưng').toLowerCase()}` : undefined}
      aria-hidden={label ? undefined : true} style={{ display: 'block', flex: 'none' }}>
      <defs>
        <radialGradient id={`${id}bg`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset=".45" stopColor={meta?.bg ?? '#DCEBFF'} />
          <stop offset="1" stopColor={meta?.bg ?? '#DCEBFF'} />
        </radialGradient>
        <radialGradient id={`${id}fur`} cx="38%" cy="28%" r="78%">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".3" stopColor={L.fur} />
          <stop offset="1" stopColor={L.dark} stopOpacity={L.fur === '#FFFFFF' ? 1 : 0.85} />
        </radialGradient>
        <linearGradient id={`${id}horn`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF3B0" />
          <stop offset="1" stopColor="#FBBF24" />
        </linearGradient>
        <clipPath id={`${id}clip`}><circle cx="60" cy="60" r="60" /></clipPath>
      </defs>
      <circle cx="60" cy="60" r="60" fill={g('bg')} />
      <g clipPath={g('clip')}>
        {/* thân nhỏ + bóng dưới cằm */}
        <ellipse cx="60" cy="112" rx="27" ry="24" fill={fur} />
        {L.face && <ellipse cx="60" cy="114" rx="15" ry="18" fill={L.face} opacity=".9" />}
        <ellipse cx="60" cy="90" rx="26" ry="6" fill="#000" opacity=".16" />
        {animal === 'lion' && <circle cx="60" cy="56" r="46" fill={L.dark} />}
        {animal === 'lion' && <path d="M60 8 l7 10 l11 -6 l2 12 l12 0 l-3 12 l11 5 l-7 10 l8 9 l-10 6 l4 11 l-12 2 l-1 12 l-11 -4 l-6 10 l-8 -9 l-10 6 l-4 -11 l-12 1 l2 -12 l-11 -5 l7 -10 l-8 -9 l10 -6 l-4 -11 l12 -2 l1 -12 l11 4 Z" fill={L.dark} opacity=".55" />}
        {ears}
        {/* đầu to */}
        <ellipse cx="60" cy="56" rx="37" ry="34" fill={fur} />
        {under}
        {muzzle}
        {/* vệt sáng tạo khối */}
        <ellipse cx="46" cy="33" rx="15" ry="7" fill="#fff" opacity=".38" transform="rotate(-20 46 33)" />
        {/* má hồng */}
        <ellipse cx="33" cy="68" rx="6" ry="4" fill="#FF7A9A" opacity=".45" />
        <ellipse cx="87" cy="68" rx="6" ry="4" fill="#FF7A9A" opacity=".45" />
        {[44, 76].map(eye)}
        {nose}
        {mouth}
        {over}
      </g>
      <circle cx="60" cy="60" r="58.5" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="3" />
    </svg>
  );
});
