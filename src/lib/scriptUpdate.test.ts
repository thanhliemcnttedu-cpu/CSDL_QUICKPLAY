import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stateOf } from './scriptUpdate';
import { SCRIPT_VERSION } from './installer';

describe('tự cập nhật Apps Script', () => {
  it('đọc đúng mã lỗi trả về', () => {
    expect(stateOf('API_OFF: Chưa bật Google Apps Script API.')).toEqual({ state: 'api_off', message: 'Chưa bật Google Apps Script API.' });
    expect(stateOf('SCOPES: thiếu quyền').state).toBe('scopes');
    expect(stateOf('MANUAL: cần thêm quyền').state).toBe('manual');
    expect(stateOf('BUSY: đang dạy').state).toBe('busy');
    expect(stateOf('Lỗi mạng')).toEqual({ state: 'error', message: 'Lỗi mạng' });
  });
  it('tệp cấu hình có quyền tự cập nhật, mã Apps Script trùng phiên bản phần mềm và trỏ về trang phát hành', () => {
    const manifest = JSON.parse(readFileSync('apps-script/appsscript.json', 'utf8'));
    expect(manifest.oauthScopes).toEqual(expect.arrayContaining([
      'https://www.googleapis.com/auth/script.projects', 'https://www.googleapis.com/auth/script.deployments', 'https://www.googleapis.com/auth/script.external_request',
    ]));
    expect(manifest.webapp).toEqual({ executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
    const code = readFileSync('apps-script/Code.gs', 'utf8');
    expect(code).toContain(`var APP_VERSION = '${SCRIPT_VERSION}';`);
    expect(code).toContain("var UPDATE_BASE_DEFAULT = 'https://quickplay-delta.vercel.app/apps-script/';");
    expect(code).toContain("var PRESET_TEACHER_KEY = '';");
  });
});
