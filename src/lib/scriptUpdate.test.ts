import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { googleDetail, googleLink, isFresh, needsScriptUpdate, reasonOf, versionState } from './scriptUpdate';
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
  it('bản mới nhất thì 6 giờ hỏi lại; tạm chưa được (đang có buổi học) thì 15 phút thử lại; chưa thử thì thử ngay', () => {
    const now = 10 * 3600_000;
    expect(isFresh({ state: 'current', at: now - 3600_000 }, now)).toBe(true);
    expect(isFresh({ state: 'current', at: now - 7 * 3600_000 }, now)).toBe(false);
    expect(isFresh({ state: 'old', at: now - 10 * 60_000, reason: 'busy' }, now)).toBe(true);
    expect(isFresh({ state: 'old', at: now - 20 * 60_000, reason: 'busy' }, now)).toBe(false);
    // chưa thiết lập tự cập nhật (mục Nâng cao): 6 giờ mới thử lại
    expect(isFresh({ state: 'old', at: now - 20 * 60_000, reason: 'cloud_api' }, now)).toBe(true);
    expect(isFresh({ state: 'old', at: now - 7 * 3600_000, reason: 'api_off' }, now)).toBe(false);
    expect(isFresh({ state: 'old', at: 0 }, now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
    // phần mềm vừa lên bản mới: kết quả "mới nhất" ghi với Apps Script cũ hết giá trị, hỏi lại ngay
    expect(isFresh({ state: 'current', at: now - 60_000, server: '1.0.0' }, now)).toBe(false);
    expect(isFresh({ state: 'current', at: now - 60_000, server: SCRIPT_VERSION }, now)).toBe(true);
  });
  it('cảnh báo cập nhật hiện khi Apps Script cũ hơn bản phần mềm hiện tại (kể cả kết quả cũ ghi "mới nhất")', () => {
    expect(needsScriptUpdate({ state: 'current', at: 0, server: '1.0.0' })).toBe(true);
    expect(needsScriptUpdate({ state: 'old', at: 0, server: '1.0.0' })).toBe(true);
    expect(needsScriptUpdate({ state: 'current', at: 0, server: SCRIPT_VERSION })).toBe(false);
    expect(needsScriptUpdate({ state: 'old', at: 0 })).toBe(true);
    expect(needsScriptUpdate(null)).toBe(false);
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
