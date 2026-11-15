// Sau khi build: đưa mã Apps Script giáo viên lên trang web để các Apps Script đã cài TỰ CẬP NHẬT.
//   dist/apps-script/Code.gs          mã gốc (không điền sẵn khóa / thư mục: Apps Script đã nhớ trong Thuộc tính tập lệnh)
//   dist/apps-script/appsscript.json  tệp cấu hình (quyền Google)
//   dist/apps-script/latest.json      số phiên bản + mã băm SHA-256 để Apps Script kiểm tra trước khi ghi đè
// Apps Script tải từ https://quickplay-delta.vercel.app/apps-script/ (UPDATE_BASE_DEFAULT trong apps-script/Code.gs).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, process.argv[2] || 'dist', 'apps-script');
const code = readFileSync(join(root, 'apps-script', 'Code.gs'), 'utf8');
const manifest = readFileSync(join(root, 'apps-script', 'appsscript.json'), 'utf8');
const version = code.match(/var APP_VERSION = '([\d.]+)';/)?.[1];
if (!version) throw new Error('Không đọc được APP_VERSION trong apps-script/Code.gs');
if (/var PRESET_TEACHER_KEY = '[^']+'/.test(code)) throw new Error('Code.gs đang điền sẵn khóa giáo viên: không được phát hành.');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'Code.gs'), code);
writeFileSync(join(out, 'appsscript.json'), manifest);
writeFileSync(join(out, 'latest.json'), JSON.stringify({ app: 'Quickplay', version, code_sha256: sha(code), manifest_sha256: sha(manifest), published_at: new Date().toISOString() }, null, 1));
console.log(`Đã phát hành Apps Script giáo viên ${version} → ${out}`);
