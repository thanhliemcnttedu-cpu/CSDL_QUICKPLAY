// Máy chủ Apps Script giáo viên giả lập (Google Drive ảo trong bộ nhớ) để thử giao diện sao lưu/khôi phục.
// node apps-script/mock-server.cjs  (cổng 5182)   — khóa giáo viên: dev-teacher-key
// GET /full=1 → Drive đầy (mọi lần ghi báo lỗi quota) ; /full=0 → bình thường ; /reset → Drive mới trống
const fs = require('fs');
const http = require('http');
const code = fs.readFileSync(process.argv[2] || require('path').join(__dirname, 'Code.gs'), 'utf8');
const PORT = Number(process.argv[3] || 5182);
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
  props = new Map([['ROOT_FOLDER_ID', root.id], ['TEACHER_KEY', 'dev-teacher-key']]);
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
  Utilities: { formatDate: () => '15_11_2026_12h50', base64Encode: (b) => Buffer.from(b).toString('base64'), base64Decode: (s) => Buffer.from(s, 'base64'), newBlob: (data, mime, name) => ({ name, data: Buffer.from(data), mime }), getUuid: () => require('crypto').randomUUID(), computeDigest: () => [], DigestAlgorithm: {}, sleep() {} },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
  Logger: { log() {} }, Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }, console: { log() {}, warn() {} },
  ScriptApp: { getProjectTriggers: () => [] }, UrlFetchApp: {}, MailApp: {},
};
const names = Object.keys(stubs);
const api = new Function(...names, code + '\nreturn { doPost };')(...names.map((n) => stubs[n]));

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method === 'GET') {
    if (req.url.includes('full=1')) full = true;
    if (req.url.includes('full=0')) full = false;
    if (req.url.includes('reset')) { full = false; reset(); }
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ full, files: Object.values(files).filter((f) => !f.trashed).map((f) => [f.name, f.content.length]), trashed: Object.values(files).filter((f) => f.trashed).length }));
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
