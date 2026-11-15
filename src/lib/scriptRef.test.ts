import { describe, expect, it } from 'vitest';
import { scriptRef, scriptUrlOfRef } from './settings';

describe('link vào phòng: phần s= ghi gọn mã Apps Script', () => {
  const url = 'https://script.google.com/macros/s/AKfycbxCSQq4xKjDpiktzFQis74A8PJQnA5Fc4TVTRFcBP46uNVm0OHrHO_ShDCepdMshtt/exec';
  it('link Apps Script chuẩn chỉ ghi mã, ngắn hơn nhiều so với ghi nguyên địa chỉ', () => {
    const ref = scriptRef(url);
    expect(ref).toBe('AKfycbxCSQq4xKjDpiktzFQis74A8PJQnA5Fc4TVTRFcBP46uNVm0OHrHO_ShDCepdMshtt');
    expect(encodeURIComponent(url).length - ref.length).toBeGreaterThan(50);
    expect(scriptUrlOfRef(ref)).toBe(url);
  });
  it('vẫn đọc được link kiểu cũ ghi nguyên địa chỉ, và địa chỉ máy chủ thử', () => {
    expect(scriptUrlOfRef(encodeURIComponent(url))).toBe(url);
    expect(scriptUrlOfRef(url)).toBe(url);
    expect(scriptRef('http://localhost:5182')).toBe('http%3A%2F%2Flocalhost%3A5182');
    expect(scriptUrlOfRef('http%3A%2F%2Flocalhost%3A5182')).toBe('http://localhost:5182');
  });
  it('chuỗi lạ không được coi là mã Apps Script', () => {
    expect(scriptUrlOfRef('abc')).toBeNull();
    expect(scriptUrlOfRef('javascript:alert(1)')).toBeNull();
    expect(scriptUrlOfRef('a/b/../c'.repeat(5))).toBeNull();
  });
});
