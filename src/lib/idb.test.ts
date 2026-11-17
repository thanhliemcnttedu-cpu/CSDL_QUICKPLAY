import { describe, expect, it } from 'vitest';
import { dbName } from './idb';

describe('kho dữ liệu cục bộ theo tài khoản', () => {
  it('mỗi tài khoản có kho riêng, không đụng kho của tài khoản khác', () => {
    expect(dbName('gvthu1')).toBe('quizzi:gvthu1');
    expect(dbName('gvthu2')).toBe('quizzi:gvthu2');
    expect(dbName('gvthu1')).not.toBe(dbName('gvthu2'));
  });

  it('không đăng nhập thì dùng kho chung như trước', () => {
    expect(dbName('')).toBe('quizzi');
    expect(dbName(undefined)).toBe('quizzi');
  });

  it('tên đăng nhập không phân biệt hoa thường', () => {
    expect(dbName(' GVThu1 ')).toBe('quizzi:gvthu1');
  });
});
