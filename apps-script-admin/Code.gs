/**
 * QUICKPLAY – MÁY CHỦ TÀI KHOẢN (chỉ tác giả/quản trị cài, MỘT lần)
 *
 * Việc của máy chủ này: cấp, khóa và kiểm tra tài khoản giáo viên. KHÔNG lưu bộ câu hỏi, KHÔNG lưu kết quả học sinh.
 * Dữ liệu dạy học của mỗi giáo viên nằm trong Google Drive riêng của giáo viên đó (Apps Script riêng của họ).
 *
 * Thứ duy nhất của giáo viên được cất ở đây là "két cấu hình" (link thư mục + link Apps Script + khóa giáo viên),
 * đã được MÃ HÓA ngay trên trình duyệt bằng mật khẩu của giáo viên. Quản trị không đọc được nội dung két.
 *
 * Cài đặt: xem apps-script-admin/HUONG_DAN_QUAN_TRI.md
 */

var ADMIN_APP = 'QUICKPLAY-ACCOUNTS';
var ADMIN_VERSION = '1.0.0';
var HASH_ROUNDS = 1500;
var MAX_VAULT = 6000;          // ký tự – một thuộc tính Script Properties chứa tối đa ~9 KB
var MAX_FAILS = 8;             // sai mật khẩu quá số lần này thì tạm khóa đăng nhập
var FAIL_WINDOW_MS = 15 * 60 * 1000;
var MAX_ACCOUNTS = 400;

function doGet() {
  return out_({ ok: true, data: { name: ADMIN_APP, version: ADMIN_VERSION } });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var routes = {
      ping: function () { return { name: ADMIN_APP, version: ADMIN_VERSION }; },
      login: actLogin_,
      check: actCheck_,
      saveVault: actSaveVault_,
      changePassword: actChangePassword_,
      adminList: admin_(actAdminList_),
      adminCreate: admin_(actAdminCreate_),
      adminSetLocked: admin_(actAdminSetLocked_),
      adminResetPassword: admin_(actAdminResetPassword_),
      adminDelete: admin_(actAdminDelete_)
    };
    var fn = Object.prototype.hasOwnProperty.call(routes, req.action) ? routes[req.action] : null;
    if (!fn) throw err_('Hành động không hợp lệ.');
    return out_({ ok: true, data: fn(req) });
  } catch (ex) {
    return out_({ ok: false, error: ex && ex.userMessage ? ex.userMessage : 'Lỗi máy chủ tài khoản: ' + (ex && ex.message ? ex.message : ex) });
  }
}

/** Chạy MỘT LẦN trong trình soạn thảo: tạo khóa quản trị (ADMIN_KEY) và in ra nhật ký. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ADMIN_KEY');
  if (!key) {
    key = randomKey_(32);
    props.setProperty('ADMIN_KEY', key);
  }
  Logger.log('ADMIN_KEY (giữ bí mật, chỉ quản trị dùng): ' + key);
  return key;
}

// ---------------------------------------------------------------- giáo viên
function actLogin_(req) {
  var username = normUser_(req.username);
  var password = String(req.password || '');
  return lock_(function () {
    var acc = load_(username);
    // Thông báo chung cho cả "không có tài khoản" và "sai mật khẩu" để không lộ tên tài khoản nào tồn tại
    var bad = err_('Tên tài khoản hoặc mật khẩu không đúng.');
    if (!acc) throw bad;
    var now = Date.now();
    if ((acc.fails || 0) >= MAX_FAILS && now - (acc.fail_at || 0) < FAIL_WINDOW_MS) {
      throw err_('Nhập sai mật khẩu quá nhiều lần. Hãy thử lại sau 15 phút hoặc liên hệ quản trị.');
    }
    if (!safeEq_(hash_(acc.salt, password), acc.hash)) {
      acc.fails = now - (acc.fail_at || 0) < FAIL_WINDOW_MS ? (acc.fails || 0) + 1 : 1;
      acc.fail_at = now;
      save_(acc);
      throw bad;
    }
    if (acc.locked) throw err_('Tài khoản này đang bị khóa. Hãy liên hệ quản trị (Zalo: 0888358363).');
    var token = randomKey_(40);
    acc.token_hash = sha_(token);
    acc.fails = 0;
    acc.last_login = now;
    save_(acc);
    return { username: acc.username, name: acc.name, token: token, vault: acc.vault || '' };
  });
}

function session_(req) {
  var acc = load_(normUser_(req.username));
  if (!acc || !acc.token_hash || !safeEq_(sha_(String(req.token || '')), acc.token_hash)) {
    throw err_('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
  }
  if (acc.locked) throw err_('Tài khoản này đang bị khóa. Hãy liên hệ quản trị (Zalo: 0888358363).');
  return acc;
}

function actCheck_(req) {
  var acc = session_(req);
  return { username: acc.username, name: acc.name };
}

function actSaveVault_(req) {
  var vault = String(req.vault || '');
  if (vault.length > MAX_VAULT) throw err_('Cấu hình quá dài, không lưu được.');
  return lock_(function () {
    var acc = session_(req);
    acc.vault = vault;
    save_(acc);
    return { saved: true };
  });
}

function actChangePassword_(req) {
  var next = String(req.new_password || '');
  checkPassword_(next);
  var vault = String(req.vault || '');
  if (vault.length > MAX_VAULT) throw err_('Cấu hình quá dài, không lưu được.');
  return lock_(function () {
    var acc = session_(req);
    if (!safeEq_(hash_(acc.salt, String(req.password || '')), acc.hash)) throw err_('Mật khẩu hiện tại không đúng.');
    acc.salt = randomKey_(16);
    acc.hash = hash_(acc.salt, next);
    acc.vault = vault; // trình duyệt đã mã hóa lại két bằng mật khẩu mới
    save_(acc);
    return { changed: true };
  });
}

// ---------------------------------------------------------------- quản trị
function admin_(fn) {
  return function (req) {
    var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
    if (!expected) throw err_('Máy chủ chưa có ADMIN_KEY. Hãy chạy hàm setup() trong trình soạn thảo Apps Script.');
    if (!safeEq_(String(req.admin_key || ''), expected)) throw err_('Khóa quản trị không đúng.');
    return fn(req);
  };
}

function view_(acc) {
  return {
    username: acc.username, name: acc.name, locked: !!acc.locked, created_at: acc.created_at,
    last_login: acc.last_login || 0, configured: !!acc.vault
  };
}

function actAdminList_() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var list = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('U_') !== 0) return;
    try { list.push(view_(JSON.parse(all[k]))); } catch (e) { /* bỏ qua bản ghi hỏng */ }
  });
  list.sort(function (a, b) { return a.username < b.username ? -1 : 1; });
  return list;
}

function actAdminCreate_(req) {
  var username = normUser_(req.username);
  var name = String(req.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) throw err_('Hãy nhập họ tên giáo viên.');
  var password = String(req.password || '');
  checkPassword_(password);
  return lock_(function () {
    if (load_(username)) throw err_('Tên tài khoản "' + username + '" đã tồn tại.');
    if (actAdminList_().length >= MAX_ACCOUNTS) throw err_('Đã đạt giới hạn ' + MAX_ACCOUNTS + ' tài khoản.');
    var salt = randomKey_(16);
    var acc = { username: username, name: name, salt: salt, hash: hash_(salt, password), locked: false, created_at: Date.now() };
    save_(acc);
    return view_(acc);
  });
}

function actAdminSetLocked_(req) {
  return lock_(function () {
    var acc = need_(req.username);
    acc.locked = !!req.locked;
    if (acc.locked) delete acc.token_hash; // đăng xuất khỏi mọi thiết bị
    save_(acc);
    return view_(acc);
  });
}

function actAdminResetPassword_(req) {
  var password = String(req.password || '');
  checkPassword_(password);
  return lock_(function () {
    var acc = need_(req.username);
    acc.salt = randomKey_(16);
    acc.hash = hash_(acc.salt, password);
    acc.fails = 0;
    delete acc.token_hash;
    delete acc.vault; // két được mã hóa bằng mật khẩu cũ nên không còn mở được; giáo viên nhập lại hai đường link
    save_(acc);
    return view_(acc);
  });
}

function actAdminDelete_(req) {
  return lock_(function () {
    var acc = need_(req.username);
    PropertiesService.getScriptProperties().deleteProperty('U_' + acc.username);
    return { username: acc.username };
  });
}

// ---------------------------------------------------------------- tiện ích
function normUser_(u) {
  var s = String(u || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(s)) throw err_('Tên tài khoản gồm 3–32 ký tự: chữ thường không dấu, số, dấu chấm, gạch nối.');
  return s;
}
function checkPassword_(p) {
  if (p.length < 6 || p.length > 72) throw err_('Mật khẩu phải có từ 6 đến 72 ký tự.');
}
function need_(username) {
  var acc = load_(normUser_(username));
  if (!acc) throw err_('Không tìm thấy tài khoản.');
  return acc;
}
function load_(username) {
  var raw = PropertiesService.getScriptProperties().getProperty('U_' + username);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function save_(acc) {
  PropertiesService.getScriptProperties().setProperty('U_' + acc.username, JSON.stringify(acc));
}
function hex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    s += (b < 16 ? '0' : '') + b.toString(16);
  }
  return s;
}
function sha_(text) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}
/** Băm mật khẩu có muối, lặp nhiều vòng để khó dò ngược nếu dữ liệu bị lộ. */
function hash_(salt, password) {
  var h = sha_(salt + ':' + password);
  for (var i = 0; i < HASH_ROUNDS; i++) h = sha_(h + salt);
  return h;
}
function safeEq_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < a.length && i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function randomKey_(len) {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var out = '';
  while (out.length < len) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + Date.now() + ':' + Math.random());
    for (var i = 0; i < bytes.length && out.length < len; i++) out += alphabet.charAt(((bytes[i] + 256) % 256) % alphabet.length);
  }
  return out;
}
function lock_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { throw err_('Máy chủ đang bận, hãy thử lại sau vài giây.'); }
  try { return fn(); } finally { lock.releaseLock(); }
}
function err_(msg) {
  var e = new Error(msg);
  e.userMessage = msg;
  return e;
}
function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
