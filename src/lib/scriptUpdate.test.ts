import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { versionState } from './scriptUpdate';
import { SCRIPT_VERSION } from './installer';

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
