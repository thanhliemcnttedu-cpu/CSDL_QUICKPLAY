import { describe, expect, it } from 'vitest';
import { ANIMALS, PRESET_KIDS, avatarKind, decodeAvatar, describeAvatarValue, encodeAvatar, isAnimal, randomAnimal, randomAnyAvatar } from './avatar';
import { AVATARS } from './util';

const SAFE = /^[a-z0-9-]{1,40}$/;

describe('avatar hai nhóm', () => {
  it('bạn học sinh: mã hóa/giải mã giữ tương thích, bạn dựng sẵn đều hợp lệ', () => {
    expect(decodeAvatar('v2-f-1-0-2-3-1-0')).toEqual({ gender: 'f', skin: 1, hair: 0, hairColor: 2, shirt: 3, acc: 1, face: 0 });
    expect(PRESET_KIDS).toHaveLength(12);
    expect(PRESET_KIDS.filter((k) => k.value.startsWith('v2-m-'))).toHaveLength(6);
    for (const k of PRESET_KIDS) {
      expect(k.value).toMatch(SAFE);
      expect(encodeAvatar(decodeAvatar(k.value)!)).toBe(k.value); // không có chỉ số ngoài phạm vi
    }
    expect(new Set(PRESET_KIDS.map((k) => k.value)).size).toBe(12);
  });

  it('con vật: khóa hợp lệ, không trùng, gồm đủ 12 khóa đời cũ', () => {
    expect(ANIMALS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ANIMALS.map((a) => a.key)).size).toBe(ANIMALS.length);
    for (const a of ANIMALS) {
      expect(a.key).toMatch(SAFE);
      expect(a.key.startsWith('v2-')).toBe(false);
      expect(a.name).toBeTruthy();
    }
    for (const old of AVATARS) expect(isAnimal(old)).toBe(true);
  });

  it('phân loại và mô tả không lỗi với giá trị lạ', () => {
    expect(avatarKind('v2-m-0-0-0-0-0-0')).toBe('kid');
    expect(avatarKind('panda')).toBe('animal');
    for (const v of ['', undefined, null, 42, {}, 'dragon', 'v3-x', '<script>', 'CAT']) expect(avatarKind(v)).toBe('none');
    expect(describeAvatarValue('cat')).toBe('Bạn mèo');
    expect(describeAvatarValue('')).toBe('Nhân vật');
    expect(describeAvatarValue('v2-f-0-0-0-1-3-0')).toMatch(/^Bạn nữ/);
    for (let i = 0; i < 40; i++) {
      expect(isAnimal(randomAnimal())).toBe(true);
      const v = randomAnyAvatar();
      expect(v).toMatch(SAFE);
      expect(avatarKind(v)).not.toBe('none');
    }
  });
});
