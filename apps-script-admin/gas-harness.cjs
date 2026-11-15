// Chạy apps-script-admin/Code.gs ngoài Google (Node) với các dịch vụ Apps Script giả lập.
// Dùng cho kiểm thử tự động và máy chủ thử cục bộ (mock-server.cjs). KHÔNG dùng trong sản phẩm.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createAdmin(opts = {}) {
  const store = new Map();
  // Google Drive giả lập: mỗi thư mục là một Map tên tệp → nội dung; dùng chung giữa các lần "cài lại" qua opts.drive
  const drive = opts.drive || new Map();
  const fileOf = (files, name) => ({
    setContent: (c) => void files.set(name, { content: String(c), at: Date.now() }),
    getBlob: () => ({ getDataAsString: () => files.get(name).content }),
    getUrl: () => 'https://drive.google.com/file/d/' + name,
    getLastUpdated: () => new Date(files.get(name).at),
  });
  const mails = []; // thư "đã gửi" (để kiểm thử và máy chủ thử in ra màn hình)
  const props = {
    getProperty: (k) => (store.has(k) ? store.get(k) : null),
    setProperty: (k, v) => void store.set(k, String(v)),
    deleteProperty: (k) => void store.delete(k),
    getProperties: () => Object.fromEntries(store),
  };
  const toSigned = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
  const stubs = {
    PropertiesService: { getScriptProperties: () => props },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => toSigned(crypto.createHash('sha256').update(String(text), 'utf8').digest()),
      getUuid: () => crypto.randomUUID(),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Logger: { log() {} },
    DriveApp: {
      getFolderById: (id) => {
        if (!/^[\w-]{10,}$/.test(id) || id === 'KHONG_CO_THU_MUC') throw new Error('not found');
        if (!drive.has(id)) drive.set(id, new Map());
        const files = drive.get(id);
        return {
          getName: () => 'Thư mục ' + id.slice(0, 6),
          getUrl: () => 'https://drive.google.com/drive/folders/' + id,
          getFilesByName: (name) => { let done = !files.has(name); return { hasNext: () => !done, next: () => { done = true; return fileOf(files, name); } }; },
          createFile: (name, content) => { files.set(name, { content: String(content), at: Date.now() }); return fileOf(files, name); },
        };
      },
    },
    MailApp: { sendEmail: (m) => { if (/@loi\./.test(m.to)) throw new Error('quota'); mails.push(m); } },
  };
  let code = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
  if (opts.folderId) code = code.replace("var PRESET_FOLDER_ID = '';", `var PRESET_FOLDER_ID = '${opts.folderId}';`);
  const names = Object.keys(stubs);
  const api = new Function(...names, code + '\nreturn { doPost: doPost, doGet: doGet, setup: setup };')(...names.map((n) => stubs[n]));
  return {
    adminKey: api.setup(),
    post: (body) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).text),
    store,
    mails,
    drive,
  };
}

module.exports = { createAdmin };
