// Máy chủ Apps Script giáo viên giả lập (Google Drive ảo trong bộ nhớ) để thử giao diện sao lưu/khôi phục.
// node apps-script/mock-server.cjs  (cổng 5182)   — khóa giáo viên: dev-teacher-key
// GET /full=1 → Drive đầy (mọi lần ghi báo lỗi quota) ; /full=0 → bình thường ; /reset → Drive mới trống
// Tự cập nhật: OLD_VERSION=1.3.9 → chạy mã với số phiên bản cũ hơn bản trong kho để thử selfUpdate;
//   GET /api=0 → giả lập chưa bật Google Apps Script API ; /api=1 → đã bật ; /scopes=0 → dự án chưa có tệp cấu hình quyền
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const OLD = process.env.OLD_VERSION || (process.argv.find((a) => a.startsWith('--old=')) || '').slice(6);
const REPO_CODE = fs.readFileSync(ARGS[0] || path.join(__dirname, 'Code.gs'), 'utf8');
const REPO_MANIFEST = fs.readFileSync(path.join(__dirname, 'appsscript.json'), 'utf8');
let code = OLD ? REPO_CODE.replace(/var APP_VERSION = '[\d.]+';/, `var APP_VERSION = '${OLD}';`) : REPO_CODE;
// Apps Script API giả lập
let apiOn = true, scopesOn = true, pendingFiles = null, versionNo = 0;
const manifestNow = () => (scopesOn ? REPO_MANIFEST : JSON.stringify({ ...JSON.parse(REPO_MANIFEST), oauthScopes: JSON.parse(REPO_MANIFEST).oauthScopes.filter((x) => !/script\.(projects|deployments)/.test(x)) }));
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const reply = (code_, obj) => ({ getResponseCode: () => code_, getContentText: () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
function fakeFetch(url, opts = {}) {
  const u = String(url);
  if (u.startsWith('http://mock-update/')) {
    const name = u.slice('http://mock-update/'.length).split('?')[0];
    if (name === 'Code.gs') return reply(200, REPO_CODE);
    if (name === 'appsscript.json') return reply(200, REPO_MANIFEST);
    if (name === 'latest.json') return reply(200, { version: REPO_CODE.match(/var APP_VERSION = '([\d.]+)';/)[1], code_sha256: sha(REPO_CODE), manifest_sha256: sha(REPO_MANIFEST) });
    return reply(404, 'not found');
  }
  if (u.startsWith('https://script.googleapis.com/v1/projects/')) {
    if (!apiOn) return reply(403, { error: { code: 403, message: 'User has not enabled the Apps Script API. Enable it by visiting https://script.google.com/home/usersettings', status: 'PERMISSION_DENIED' } });
    if (!scopesOn) return reply(403, { error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED', details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } });
    const rest = u.replace(/^https:\/\/script\.googleapis\.com\/v1\/projects\/[^/]+/, '');
    const m = String(opts.method || 'get').toLowerCase();
    const body = opts.payload ? JSON.parse(opts.payload) : null;
    if (rest === '/content' && m === 'get') return reply(200, { files: [{ name: 'appsscript', type: 'JSON', source: manifestNow() }, { name: 'Code', type: 'SERVER_JS', source: code }] });
    if (rest === '/content' && m === 'put') { pendingFiles = body.files; return reply(200, body); }
    if (rest === '/versions' && m === 'post') return reply(200, { versionNumber: ++versionNo });
    if (rest === '/deployments' && m === 'get') return reply(200, { deployments: [{ deploymentId: 'HEAD-x', entryPoints: [] }, { deploymentId: 'AKfyMOCK', entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url: 'http://localhost:' + PORT } }] }] });
    if (rest.startsWith('/deployments/') && m === 'put') {
      // bản triển khai chuyển sang phiên bản mới: từ yêu cầu sau, máy chủ chạy mã mới
      const next = pendingFiles.find((f) => f.name === 'Code').source;
      setTimeout(() => { code = next; api = build(); console.log('*** Đã chuyển sang mã mới', code.match(/var APP_VERSION = '([\d.]+)';/)[1]); }, 0);
      return reply(200, { deploymentId: rest.split('/')[2], deploymentConfig: body.deploymentConfig });
    }
    return reply(400, 'unsupported ' + m + ' ' + rest);
  }
  // Google Form giả để thử "Từ Google Form": link công khai MOCKPUBLIC (không có đáp án)
  if (/docs\.google\.com\/forms\/.*MOCKPUBLIC/.test(u)) {
    const raw = JSON.stringify([null, ['Mô tả', [
      [101, 'Màu của lá cây?', null, 2, [[201, [['Xanh', null, null, null, 0], ['Đỏ', null, null, null, 0]], 1]]],
      [103, 'Chọn các số lẻ', 'Có thể chọn nhiều', 4, [[203, [['1'], ['2'], ['3']], 0]]],
      [104, 'Họ tên của em', null, 0, [[204, null, 1]]],
    ], null, null, null, null, null, null, 'Tên tệp form'], '/forms', 'Bài ôn tập (form công khai)']);
    return reply(200, '<html><script>var FB_PUBLIC_LOAD_DATA_ = ' + raw + ';</script></html>');
  }
  if (/docs\.google\.com\/forms\//.test(u)) return reply(404, 'not found');
  throw new Error('Không có mạng trong máy chủ giả lập: ' + u);
}
// FormApp giả: link chỉnh sửa MOCKEDIT là form bài kiểm tra của chính giáo viên (có đáp án đúng và điểm)
const T = { MULTIPLE_CHOICE: 'mc', LIST: 'list', CHECKBOX: 'cb', TEXT: 'text', PARAGRAPH_TEXT: 'para', SECTION_HEADER: 'sec' };
const choice = (v, ok) => ({ getValue: () => v, isCorrectAnswer: () => !!ok });
const item = (type, title, choices, points) => {
  const q = { getChoices: () => choices || [], getPoints: () => points || 0 };
  return { getType: () => type, getTitle: () => title, getHelpText: () => '', asMultipleChoiceItem: () => q, asListItem: () => q, asCheckboxItem: () => q, asTextItem: () => q, asParagraphTextItem: () => q };
};
const FormAppMock = {
  ItemType: T,
  openByUrl: (url) => {
    if (!/MOCKEDIT/.test(url)) throw new Error('No permission');
    return { isQuiz: () => true, getTitle: () => 'Kiểm tra 15 phút (form của giáo viên)', getItems: () => [
      item(T.MULTIPLE_CHOICE, '2 + 2 = ?', [choice('3'), choice('4', true), choice('5')], 1),
      item(T.SECTION_HEADER, 'Phần 2'),
      item(T.CHECKBOX, 'Số nào là số chẵn?', [choice('2', true), choice('3'), choice('4', true)], 2),
      item(T.MULTIPLE_CHOICE, 'Trái Đất hình cầu', [choice('Đúng', true), choice('Sai')], 1),
      item(T.PARAGRAPH_TEXT, 'Nêu cảm nghĩ của em về ngôi trường'),
    ] };
  },
};
const PORT = Number(process.argv.slice(2).filter((a) => !a.startsWith('--'))[1] || 5182);
let idn = 0, files, byId, root, props, full = false;
const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
function guard() { if (full) throw new Error("Exception: The user's Drive storage quota has been exceeded."); }
function mkFile(folder, name, content, mime) {
  guard();
  const f = { id: '1' + String(++idn).padStart(15, 'x'), name, content: content instanceof Buffer ? content : Buffer.from(String(content)), trashed: false, mime: mime || 'application/json',
    getName: () => f.name, getId: () => f.id, isTrashed: () => f.trashed, setTrashed: (v) => { f.trashed = v; }, getSize: () => f.content.length,
    getBlob: () => ({ getDataAsString: () => f.content.toString('utf8'), getContentType: () => f.mime, getBytes: () => f.content }),
    setContent: (c) => { guard(); f.content = Buffer.from(String(c)); }, getUrl: () => 'https://drive.google.com/file/d/' + f.id, setSharing() {}, getLastUpdated: () => new Date() };
  folder.files.push(f); files[f.id] = f;
  return f;
}
function mkFolder(name) {
  const fo = { name, files: [], subs: [], id: '0' + String(++idn).padStart(15, 'd'), getName: () => name, getId: () => fo.id, isTrashed: () => false, getUrl: () => 'https://drive.google.com/drive/folders/' + fo.id,
    getFiles: () => iter(fo.files.slice()), getFilesByName: (n) => iter(fo.files.filter((f) => f.name === n)),
    createFile: (n, c, m) => (typeof n === 'object' ? mkFile(fo, n.name, n.data, n.mime) : mkFile(fo, n, c, m)),
    getFoldersByName: (n) => iter(fo.subs.filter((s) => s.name === n)),
    createFolder: (n) => { const s = mkFolder(n); fo.subs.push(s); byId[s.id] = s; return s; }, addFile() {} };
  return fo;
}
function reset() {
  files = {}; byId = {};
  root = mkFolder('QUICKPLAY_DATA'); byId[root.id] = root;
  props = new Map([['ROOT_FOLDER_ID', root.id], ['TEACHER_KEY', 'dev-teacher-key'], ['UPDATE_BASE', 'http://mock-update/']]);
}
reset();
const cache = new Map();
const used = () => Object.values(files).filter((f) => !f.trashed).reduce((s, f) => s + f.content.length, 0);
const stubs = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: (k) => props.delete(k), getProperties: () => Object.fromEntries(props) }) },
  DriveApp: { getFolderById: (id) => { if (!byId[id]) throw new Error('Không tìm thấy thư mục'); return byId[id]; }, getRootFolder: () => root,
    getFileById: (id) => { if (!files[id]) throw new Error('nf'); return files[id]; },
    getStorageUsed: () => (full ? 15 * 1024 ** 3 : 12.4 * 1024 ** 3 + used()), getStorageLimit: () => 15 * 1024 ** 3,
    Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 } },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k), getAll: (ks) => Object.fromEntries(ks.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)])), putAll: (o) => Object.entries(o).forEach(([k, v]) => cache.set(k, v)), removeAll: (ks) => ks.forEach((k) => cache.delete(k)) }) },
  Utilities: { formatDate: () => '15_11_2026_12h50', base64Encode: (b) => Buffer.from(b).toString('base64'), base64Decode: (s) => Buffer.from(s, 'base64'), newBlob: (data, mime, name) => ({ name, data: Buffer.from(data), mime }), getUuid: () => require('crypto').randomUUID(), computeDigest: (alg, text) => Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, sleep() {} },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
  Logger: { log() {} }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }, console: { log() {}, warn() {} },
  ScriptApp: { getProjectTriggers: () => [], getScriptId: () => 'mock-script', getOAuthToken: () => 'mock-token' }, UrlFetchApp: { fetch: fakeFetch }, MailApp: {}, FormApp: FormAppMock,
};
const names = Object.keys(stubs);
const build = () => new Function(...names, code + '\nreturn { doPost };')(...names.map((n) => stubs[n]));
let api = build();

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method === 'GET') {
    if (req.url.includes('full=1')) full = true;
    if (req.url.includes('full=0')) full = false;
    if (req.url.includes('reset')) { full = false; reset(); }
    if (req.url.includes('api=0')) apiOn = false;
    if (req.url.includes('api=1')) apiOn = true;
    if (req.url.includes('scopes=0')) scopesOn = false;
    if (req.url.includes('scopes=1')) scopesOn = true;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ version: code.match(/var APP_VERSION = '([\d.]+)';/)[1], apiOn, scopesOn, full, files: Object.values(files).filter((f) => !f.trashed).map((f) => [f.name, f.content.length]), trashed: Object.values(files).filter((f) => f.trashed).length }));
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const out = api.doPost({ postData: { contents: body } }).t;
    try { const j = JSON.parse(body); if (!j.action?.match(/^(poll|hostState)$/)) console.log(j.action, out.slice(0, 120)); } catch {}
    res.setHeader('Content-Type', 'application/json');
    res.end(out);
  });
}).listen(PORT, () => console.log('Apps Script giáo viên giả lập: http://localhost:' + PORT));
