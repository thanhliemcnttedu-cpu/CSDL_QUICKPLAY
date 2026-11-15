import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ADMIN_SCRIPT_VERSION, SCRIPT_VERSION, buildLinkFile, parseLinkFile, compareVersion, fillAdminCode, fillTeacherCode, folderIdOf, isExecUrl, randomKey } from './installer';
import { parseBackup } from './backup';

const teacherCode = readFileSync('apps-script/Code.gs', 'utf8');
const adminCode = readFileSync('apps-script-admin/Code.gs', 'utf8');

describe('trình cài đặt Apps Script', () => {
  it('phiên bản trong phần mềm trùng với hai tệp mã máy chủ', () => {
    expect(teacherCode).toContain(`var APP_VERSION = '${SCRIPT_VERSION}';`);
    expect(adminCode).toContain(`var ADMIN_VERSION = '${ADMIN_SCRIPT_VERSION}';`);
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
    const admin = fillAdminCode(adminCode, key, '1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk');
    expect(admin).toContain(`var PRESET_ADMIN_KEY = '${key}';`);
    expect(admin).toContain("var PRESET_FOLDER_ID = '1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk';");
    expect(() => new Function(admin)).not.toThrow();
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

describe('tệp kết nối', () => {
  const base = { script_url: 'https://script.google.com/macros/s/AKfycbzWDwdp9Q6/exec', folder_url: 'https://drive.google.com/drive/folders/1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk', folder_id: '1ZVJkapI-ikPsp2rdd6kuvXSGu-zzgJEk', folder_name: 'Quickplay_DuLieu', server_version: '1.1.0', linked_at: '2026-11-15T04:00:00.000Z' };
  it('tệp của giáo viên giữ khóa; tệp của quản trị không chứa khóa', () => {
    const teacher = buildLinkFile({ role: 'teacher', key: 'KhoaGiaoVien123', ...base });
    expect(parseLinkFile(teacher, 'teacher')).toMatchObject({ role: 'teacher', key: 'KhoaGiaoVien123', script_url: base.script_url, folder_id: base.folder_id, server_version: '1.1.0' });
    const admin = buildLinkFile({ role: 'admin', key: 'KhoaQuanTriBiMat', ...base });
    expect(admin).not.toContain('KhoaQuanTriBiMat');
    expect(parseLinkFile(admin, 'admin')).toMatchObject({ role: 'admin', key: '', script_url: base.script_url });
  });
  it('từ chối tệp sai vai trò, sai loại hoặc link lạ', () => {
    const teacher = buildLinkFile({ role: 'teacher', key: 'k', ...base });
    expect(() => parseLinkFile(teacher, 'admin')).toThrow(/của giáo viên/);
    expect(() => parseLinkFile('{"app":"Quickplay","kind":"backup"}', 'teacher')).toThrow(/không phải tệp kết nối/);
    expect(() => parseLinkFile('xyz', 'teacher')).toThrow(/không phải tệp .json/);
    expect(() => parseLinkFile(buildLinkFile({ role: 'teacher', key: 'k', ...base, script_url: 'https://example.com/exec' }), 'teacher')).toThrow(/không đúng dạng/);
    expect(() => parseLinkFile(JSON.stringify({ app: 'Quickplay', kind: 'connection', role: 'teacher', script_url: base.script_url, key: "a'; evil()" }), 'teacher')).toThrow(/ký tự không hợp lệ/);
  });
});
