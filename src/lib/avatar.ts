// Nhân vật học sinh tự thiết kế (SVG). Lưu gọn trong 1 chuỗi, ví dụ "v2-f-1-0-2-3-1-0":
// v2 - giới tính (m|f) - da - kiểu tóc - màu tóc - màu áo - phụ kiện - nét mặt
export type Gender = 'm' | 'f';

export interface AvatarCfg {
  gender: Gender;
  skin: number;
  hair: number; // kiểu tóc (0..1, theo giới tính)
  hairColor: number;
  shirt: number;
  acc: number; // phụ kiện
  face: number; // nét mặt
}

export const SKINS = ['#FFDBB4', '#F1C27D', '#D7A06A', '#A86B3C'];
export const SKIN_NAMES = ['Sáng', 'Vàng', 'Ngăm', 'Nâu'];
export const HAIR_COLORS = ['#2B2118', '#6B4226', '#C68B2C', '#B5482A', '#5B5FEF'];
export const HAIR_COLOR_NAMES = ['Đen', 'Nâu', 'Vàng', 'Đỏ', 'Tím'];
export const SHIRTS = ['#2563EB', '#E11D48', '#16A34A', '#F59E0B', '#7C3AED', '#0891B2'];
export const SHIRT_NAMES = ['Xanh dương', 'Đỏ', 'Xanh lá', 'Vàng cam', 'Tím', 'Xanh ngọc'];
export const HAIR_STYLES: Record<Gender, string[]> = { m: ['Tóc ngắn', 'Tóc xù'], f: ['Tóc dài', 'Buộc hai bên'] };
export const ACCESSORIES = ['Không có', 'Kính tròn', 'Mũ lưỡi trai', 'Nơ xinh', 'Vương miện'];
export const FACES = ['Cười tươi', 'Nháy mắt', 'Ngạc nhiên'];

export const DEFAULT_AVATAR: AvatarCfg = { gender: 'm', skin: 0, hair: 0, hairColor: 0, shirt: 0, acc: 0, face: 0 };

const clampIdx = (n: number, len: number) => (Number.isInteger(n) && n >= 0 && n < len ? n : 0);

export function encodeAvatar(c: AvatarCfg): string {
  return ['v2', c.gender, c.skin, c.hair, c.hairColor, c.shirt, c.acc, c.face].join('-');
}

/** Đọc chuỗi nhân vật; trả về null với giá trị cũ (tên con vật) để hiển thị kiểu cũ. */
export function decodeAvatar(v: string | undefined | null): AvatarCfg | null {
  if (!v || !v.startsWith('v2-')) return null;
  const p = v.split('-');
  const gender: Gender = p[1] === 'f' ? 'f' : 'm';
  const n = (i: number) => Number(p[i]);
  return {
    gender,
    skin: clampIdx(n(2), SKINS.length),
    hair: clampIdx(n(3), HAIR_STYLES[gender].length),
    hairColor: clampIdx(n(4), HAIR_COLORS.length),
    shirt: clampIdx(n(5), SHIRTS.length),
    acc: clampIdx(n(6), ACCESSORIES.length),
    face: clampIdx(n(7), FACES.length),
  };
}

export function randomAvatar(gender?: Gender): AvatarCfg {
  const r = (len: number) => Math.floor(Math.random() * len);
  const g: Gender = gender ?? (Math.random() < 0.5 ? 'm' : 'f');
  return {
    gender: g,
    skin: r(SKINS.length),
    hair: r(HAIR_STYLES[g].length),
    hairColor: r(HAIR_COLORS.length - 1), // màu tím vui nhộn chỉ khi em tự chọn
    shirt: r(SHIRTS.length),
    acc: Math.random() < 0.5 ? 0 : 1 + r(ACCESSORIES.length - 1),
    face: r(FACES.length),
  };
}

/** Mô tả bằng lời cho trình đọc màn hình. */
export function describeAvatar(c: AvatarCfg): string {
  return `${c.gender === 'f' ? 'Bạn nữ' : 'Bạn nam'}, ${HAIR_STYLES[c.gender][c.hair].toLowerCase()} màu ${HAIR_COLOR_NAMES[c.hairColor].toLowerCase()}, áo ${SHIRT_NAMES[c.shirt].toLowerCase()}${c.acc ? `, ${ACCESSORIES[c.acc].toLowerCase()}` : ''}`;
}

// ---------------- Hai nhóm biểu tượng: "Bạn học sinh" và "Con vật" ----------------
export interface Animal { key: string; name: string; bg: string }
/** Con vật chibi. 12 khóa đầu trùng với avatar con vật đời cũ nên giá trị cũ tự hiện bằng hình mới. */
export const ANIMALS: Animal[] = [
  { key: 'cat', name: 'Mèo', bg: '#FFD9A8' },
  { key: 'dog', name: 'Chó', bg: '#BFE3FF' },
  { key: 'fox', name: 'Cáo', bg: '#C9F0D0' },
  { key: 'panda', name: 'Gấu trúc', bg: '#CFF3E4' },
  { key: 'rabbit', name: 'Thỏ', bg: '#FFD3E2' },
  { key: 'bear', name: 'Gấu', bg: '#FFE7A8' },
  { key: 'frog', name: 'Ếch', bg: '#FFF1A8' },
  { key: 'tiger', name: 'Hổ', bg: '#CDE4FF' },
  { key: 'koala', name: 'Koala', bg: '#D9F2C4' },
  { key: 'penguin', name: 'Chim cánh cụt', bg: '#BDEBFF' },
  { key: 'owl', name: 'Cú', bg: '#E2D6FF' },
  { key: 'unicorn', name: 'Kỳ lân', bg: '#E9D5FF' },
  { key: 'lion', name: 'Sư tử', bg: '#C8ECFF' },
  { key: 'monkey', name: 'Khỉ', bg: '#D6F5C9' },
  { key: 'elephant', name: 'Voi', bg: '#FFE0C2' },
  { key: 'chick', name: 'Gà con', bg: '#CFE9FF' },
];
const ANIMAL_KEYS = new Set(ANIMALS.map((a) => a.key));
export const isAnimal = (v: string | undefined | null): v is string => !!v && ANIMAL_KEYS.has(v);
export const animalOf = (v: string | undefined | null) => ANIMALS.find((a) => a.key === v);

/** Phân loại một giá trị avatar bất kỳ (kể cả rỗng/lạ) – không bao giờ ném lỗi. */
export function avatarKind(v: unknown): 'kid' | 'animal' | 'none' {
  if (typeof v !== 'string') return 'none';
  if (decodeAvatar(v)) return 'kid';
  return isAnimal(v) ? 'animal' : 'none';
}

/** 12 bạn học sinh dựng sẵn (6 nam, 6 nữ) để bấm là chọn ngay. */
export const PRESET_KIDS: { value: string; name: string }[] = [
  { value: 'v2-m-0-0-0-0-0-0', name: 'Bạn nam tóc ngắn áo xanh' },
  { value: 'v2-m-1-1-1-2-0-1', name: 'Bạn nam tóc xù nháy mắt' },
  { value: 'v2-m-2-0-0-3-2-0', name: 'Bạn nam đội mũ lưỡi trai' },
  { value: 'v2-m-0-1-2-5-1-0', name: 'Bạn nam đeo kính tròn' },
  { value: 'v2-m-3-0-0-1-0-2', name: 'Bạn nam áo đỏ ngạc nhiên' },
  { value: 'v2-m-1-1-3-4-4-0', name: 'Bạn nam đội vương miện' },
  { value: 'v2-f-0-0-0-1-3-0', name: 'Bạn nữ tóc dài cài nơ' },
  { value: 'v2-f-1-1-1-4-0-0', name: 'Bạn nữ buộc tóc hai bên' },
  { value: 'v2-f-2-0-2-2-1-1', name: 'Bạn nữ đeo kính nháy mắt' },
  { value: 'v2-f-0-1-3-5-0-2', name: 'Bạn nữ tóc đỏ ngạc nhiên' },
  { value: 'v2-f-3-0-0-3-4-0', name: 'Bạn nữ đội vương miện' },
  { value: 'v2-f-1-1-0-0-3-1', name: 'Bạn nữ áo xanh cài nơ' },
];

export const randomAnimal = () => ANIMALS[Math.floor(Math.random() * ANIMALS.length)].key;
/** Ngẫu nhiên trong cả hai nhóm. */
export const randomAnyAvatar = () => (Math.random() < 0.5 ? randomAnimal() : encodeAvatar(randomAvatar()));

/** Mô tả bằng lời một giá trị avatar bất kỳ. */
export function describeAvatarValue(v: string | undefined | null): string {
  const c = decodeAvatar(v);
  if (c) return describeAvatar(c);
  const a = animalOf(v);
  return a ? `Bạn ${a.name.toLowerCase()}` : 'Nhân vật';
}
