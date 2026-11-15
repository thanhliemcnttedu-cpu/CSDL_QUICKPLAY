// Chạy apps-script-admin/Code.gs ngoài Google (Node) với các dịch vụ Apps Script giả lập.
// Dùng cho kiểm thử tự động và máy chủ thử cục bộ (mock-server.cjs). KHÔNG dùng trong sản phẩm.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createAdmin() {
  const store = new Map();
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
  };
  const code = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
  const names = Object.keys(stubs);
  const api = new Function(...names, code + '\nreturn { doPost: doPost, doGet: doGet, setup: setup };')(...names.map((n) => stubs[n]));
  return {
    adminKey: api.setup(),
    post: (body) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).text),
    store,
  };
}

module.exports = { createAdmin };
