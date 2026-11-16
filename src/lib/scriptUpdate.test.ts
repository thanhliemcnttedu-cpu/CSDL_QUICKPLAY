import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { googleDetail, googleLink, isFresh, reasonOf, versionState } from './scriptUpdate';
import { SCRIPT_VERSION } from './installer';

describe('tự cập nhật Apps Script', () => {
  it('đổi lỗi có mã của Apps Script thành lý do để chỉ đúng việc thầy cô cần làm', () => {
    expect(reasonOf('API_OFF: Chưa bật Google Apps Script API.')).toEqual({ reason: 'api_off', message: 'Chưa bật Google Apps Script API.' });
    expect(reasonOf('SCOPES: thiếu quyền').reason).toBe('scopes');
    expect(reasonOf('MANUAL: cần thêm quyền').reason).toBe('manual');
    expect(reasonOf('BUSY: đang có buổi học').reason).toBe('busy');
    expect(reasonOf('Không tải được Code.gs').reason).toBe('error');
    expect(reasonOf('CLOUD_API: Dự án Google Cloud…').reason).toBe('cloud_api');
  });
  it('lấy link và lỗi gốc Google gửi kèm để thầy cô bấm mở', () => {
    const msg = 'CLOUD_API: … Mở link bật API của Google: https://console.developers.google.com/apis/api/script.googleapis.com/overview?project=123456 , bấm Bật (Google: 403 { "error": { "code": 403 } })';
    expect(googleLink(msg)).toBe('https://console.developers.google.com/apis/api/script.googleapis.com/overview?project=123456');
    expect(googleDetail(msg)).toMatch(/^\(Google: 403/);
    expect(googleLink('SCOPES: … Hoặc mở link cấp quyền: https://script.google.com/macros/d/abc/usercallback?x=1')).toMatch(/^https:\/\/script\.google\.com\/macros/);
    expect(googleLink('API_OFF: Mở https://script.google.com/home/usersettings')).toBeUndefined();
  });
  it('bản mới nhất thì 6 giờ hỏi lại; chưa cập nhật được thì 15 phút thử lại; chưa thử thì thử ngay', () => {
    const now = 10 * 3600_000;
    expect(isFresh({ state: 'current', at: now - 3600_000 }, now)).toBe(true);
    expect(isFresh({ state: 'current', at: now - 7 * 3600_000 }, now)).toBe(false);
    expect(isFresh({ state: 'old', at: now - 10 * 60_000, reason: 'api_off' }, now)).toBe(true);
    expect(isFresh({ state: 'old', at: now - 20 * 60_000, reason: 'api_off' }, now)).toBe(false);
    expect(isFresh({ state: 'old', at: 0 }, now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });
  it('tệp cấu hình phát hành có đủ quyền tự cập nhật', () => {
    const scopes: string[] = JSON.parse(readFileSync('apps-script/appsscript.json', 'utf8')).oauthScopes;
    expect(scopes).toEqual(expect.arrayContaining(['https://www.googleapis.com/auth/script.projects', 'https://www.googleapis.com/auth/script.deployments']));
  });
});

describe('nhắc cập nhật Apps Script', () => {
  it('so phiên bản máy chủ với bản phần mềm cần', () => {
    expect(versionState(SCRIPT_VERSION)).toBe('current');
    expect(versionState('99.0.0')).toBe('current');
    expect(versionState('1.0.0')).toBe('old');
  });
  it('mã Apps Script trùng phiên bản phần mềm và không cài sẵn khóa', () => {
    const manifest = JSON.parse(readFileSync('apps-script/appsscript.json', 'utf8'));
    expect(manifest.webapp).toEqual({ executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
    const code = readFileSync('apps-script/Code.gs', 'utf8');
    expect(code).toContain(`var APP_VERSION = '${SCRIPT_VERSION}';`);
    expect(code).toContain("var PRESET_TEACHER_KEY = '';");
  });
});
