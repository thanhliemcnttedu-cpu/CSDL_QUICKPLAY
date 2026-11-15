import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SCRIPT_VERSION, compareVersion, fillAdminCode, fillTeacherCode, folderIdOf, isExecUrl, randomKey } from './installer';
import { parseBackup } from './backup';
import { fileSlug } from './localFolder';

const teacherCode = readFileSync('apps-script/Code.gs', 'utf8');
const adminCode = readFileSync('apps-script-admin/Code.gs', 'utf8');

describe('trình cài đặt Apps Script', () => {
  it('phiên bản trong phần mềm trùng với hai tệp mã máy chủ', () => {
    expect(teacherCode).toContain(`var APP_VERSION = '${SCRIPT_VERSION}';`);
    expect(adminCode).toContain(`var ADMIN_VERSION = '${SCRIPT_VERSION}';`);
  });
  it('đọc mã thư mục từ các dạng link Google Drive', () => {
    expect(folderIdOf('https://drive.google.com/drive/folders/1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk?usp=sharing')).toBe('1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk');
    expect(folderIdOf('https://drive.google.com/open?id=1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk')).toBe('1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk');
    expect(folderIdOf(' 1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk ')).toBe('1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk');
    expect(folderIdOf('https://drive.google.com/drive/my-drive')).toBeNull();
  });
  it('nhận đúng link /exec', () => {
    expect(isExecUrl('https://script.google.com/macros/s/AKfycbzWDwdp9Q6/exec')).toBe(true);
    expect(isExecUrl('https://script.google.com/macros/s/AKfycbzWDwdp9Q6/dev')).toBe(false);
    expect(isExecUrl('https://example.com/macros/s/x/exec')).toBe(false);
  });
  it('điền sẵn khóa và thư mục vào mã, mã vẫn chạy được', () => {
    const key = randomKey();
    expect(key).toMatch(/^[A-Za-z0-9]{32}$/);
    const code = fillTeacherCode(teacherCode, key, '1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk');
    expect(code).toContain(`var PRESET_TEACHER_KEY = '${key}';`);
    expect(code).toContain("var PRESET_FOLDER_ID = '1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk';");
    expect(code.length).toBe(teacherCode.length + key.length + 33);
    expect(() => new Function(code)).not.toThrow();
    expect(() => new Function(fillAdminCode(adminCode, key))).not.toThrow();
    // giá trị lạ không được chèn vào mã
    expect(() => fillTeacherCode(teacherCode, "x'; evil(); '", 'abc')).toThrow();
  });
  it('so sánh phiên bản', () => {
    expect(compareVersion('1.0.0', '1.1.0')).toBeLessThan(0);
    expect(compareVersion('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersion('1.1', '1.1.0')).toBe(0);
  });
});

describe('tệp sao lưu', () => {
  it('đọc tệp sao lưu, tệp một bộ câu hỏi lẻ, và từ chối tệp lạ', () => {
    const quiz = { id: 'quiz_1', title: 'Đề 1', questions: [] };
    const b = parseBackup(JSON.stringify({ app: 'Quickplay', kind: 'backup', version: 1, quizzes: [quiz, { id: 5 }], catalog: { subjects: [] }, classes: [{ name: '1A1', students: ['An'] }, { name: 2 }] }));
    expect(b.quizzes).toHaveLength(1);
    expect(b.classes).toHaveLength(1);
    expect(b.catalog).not.toBeNull();
    expect(parseBackup(JSON.stringify(quiz)).quizzes).toHaveLength(1);
    expect(() => parseBackup('{"a":1}')).toThrow(/không phải tệp sao lưu/);
    expect(() => parseBackup('không phải json')).toThrow(/không phải tệp .json/);
  });
});

describe('tên tệp trong thư mục trên máy', () => {
  it('bỏ dấu tiếng Việt và ký tự không dùng được trong tên tệp', () => {
    expect(fileSlug('Tiếng Việt 1 – Đề số 2: "ôn tập"?')).toBe('Tieng-Viet-1-De-so-2-on-tap');
    expect(fileSlug('quiz_mwh0bwc84422kr')).toBe('quiz-mwh0bwc84422kr');
    expect(fileSlug('///')).toBe('khong-ten');
    expect(fileSlug('a'.repeat(200))).toHaveLength(60);
  });
});
