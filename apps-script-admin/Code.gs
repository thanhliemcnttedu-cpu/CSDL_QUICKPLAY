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
var ADMIN_VERSION = '1.3.0';

// Trình cài đặt trong phần mềm điền sẵn khóa quản trị vào đây khi bấm "Sao chép mã" (không phải chạy setup()).
var PRESET_ADMIN_KEY = '';
// Mã thư mục Google Drive lưu trữ của quản trị (Trình cài đặt điền sẵn từ link thư mục đã lưu ở bước 1).
// Mỗi khi tài khoản thay đổi, máy chủ ghi một tệp sao lưu vào thư mục này; cài lại máy chủ vào cùng thư mục thì tự khôi phục.
var PRESET_FOLDER_ID = '';
var SNAPSHOT_FILE = 'quickplay-tai-khoan.json';
// Các hành động làm thay đổi tài khoản → ghi lại tệp sao lưu (đăng nhập, kiểm tra phiên thì không ghi để không chậm)
var MIRRORED = { adminInit: 1, adminChangePassword: 1, adminSetEmail: 1, adminForgotFinish: 1, adminCreate: 1, adminSetLocked: 1,
  adminResetPassword: 1, adminDelete: 1, saveVault: 1, changePassword: 1, setRecoveryEmail: 1, forgotFinish: 1 };
var HASH_ROUNDS = 1500;
var MAX_VAULT = 6000;          // ký tự – một thuộc tính Script Properties chứa tối đa ~9 KB
var MAX_FAILS = 8;             // sai mật khẩu quá số lần này thì tạm khóa đăng nhập
var FAIL_WINDOW_MS = 15 * 60 * 1000;
var MAX_ACCOUNTS = 400;
var ADMIN_SESSION_MS = 12 * 60 * 60 * 1000; // phiên đăng nhập của quản trị: 12 giờ
var ADMIN_MIN_PASSWORD = 8;
var RESET_TTL_MS = 15 * 60 * 1000;   // mã đặt lại mật khẩu có hiệu lực 15 phút
var RESET_GAP_MS = 60 * 1000;        // gửi lại mã sau ít nhất 1 phút
var RESET_MAX_TRIES = 5;             // nhập sai mã quá số lần này thì phải xin mã mới

function doGet() {
  return out_({ ok: true, data: { name: ADMIN_APP, version: ADMIN_VERSION, folder: !!folderId_() } });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var routes = {
      ping: function () { return { name: ADMIN_APP, version: ADMIN_VERSION, folder: !!folderId_() }; },
      adminStorage: admin_(actAdminStorage_),
      login: actLogin_,
      check: actCheck_,
      saveVault: actSaveVault_,
      changePassword: actChangePassword_,
      setRecoveryEmail: actSetRecoveryEmail_,
      forgotStart: actForgotStart_,
      forgotFinish: actForgotFinish_,
      adminStatus: actAdminStatus_,
      adminInit: actAdminInit_,
      adminLogin: actAdminLogin_,
      adminLogout: admin_(actAdminLogout_),
      adminChangePassword: admin_(actAdminChangePassword_),
      adminSetEmail: admin_(actAdminSetEmail_),
      adminForgotStart: actAdminForgotStart_,
      adminForgotFinish: actAdminForgotFinish_,
      adminList: admin_(actAdminList_),
      adminCreate: admin_(actAdminCreate_),
      adminSetLocked: admin_(actAdminSetLocked_),
      adminResetPassword: admin_(actAdminResetPassword_),
      adminDelete: admin_(actAdminDelete_)
    };
    var fn = Object.prototype.hasOwnProperty.call(routes, req.action) ? routes[req.action] : null;
    if (!fn) throw err_('Hành động không hợp lệ.');
    var data = fn(req);
    if (MIRRORED[req.action]) mirror_();
    return out_({ ok: true, data: data });
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
    return { username: acc.username, name: acc.name, token: token, vault: acc.vault || '', recovery_email: acc.email || '' };
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
  return { username: acc.username, name: acc.name, recovery_email: acc.email || '' };
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

// ---------------------------------------------------------------- email khôi phục và quên mật khẩu
function maskEmail_(email) {
  var p = String(email).split('@');
  var n = p[0];
  return (n.length <= 3 ? n.charAt(0) + '***' : n.slice(0, 2) + '***' + n.slice(-1)) + '@' + p[1];
}
function randomDigits_(len) {
  var out = '';
  while (out.length < len) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + Date.now() + ':' + Math.random());
    for (var i = 0; i < bytes.length && out.length < len; i++) {
      var b = (bytes[i] + 256) % 256;
      if (b < 250) out += String(b % 10); // bỏ 250–255 để 10 chữ số có xác suất bằng nhau
    }
  }
  return out;
}

/** Giáo viên đang đăng nhập khai báo (hoặc xóa) email khôi phục. Phải nhập lại mật khẩu hiện tại để xác nhận. */
function actSetRecoveryEmail_(req) {
  var email = String(req.email || '').trim().toLowerCase();
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) throw err_('Địa chỉ email chưa đúng.');
  return lock_(function () {
    var acc = session_(req);
    if (!safeEq_(hash_(acc.salt, String(req.password || '')), acc.hash)) throw err_('Mật khẩu hiện tại không đúng.');
    if (email) acc.email = email; else delete acc.email;
    delete acc.reset;
    save_(acc);
    return { recovery_email: acc.email || '' };
  });
}

/** Quên mật khẩu, bước 1: gửi mã 6 số tới email khôi phục đã khai báo. */
function actForgotStart_(req) {
  var username = normUser_(req.username);
  return lock_(function () {
    var acc = load_(username);
    // cùng một câu cho "không có tài khoản" và "chưa khai báo email" để không lộ tên tài khoản nào tồn tại
    if (!acc || !acc.email) throw err_('Tài khoản này chưa khai báo email khôi phục. Hãy liên hệ quản trị để được đặt lại mật khẩu (Zalo: 0888358363).');
    if (acc.locked) throw err_('Tài khoản này đang bị khóa. Hãy liên hệ quản trị (Zalo: 0888358363).');
    var now = Date.now();
    if (acc.reset && now - (acc.reset.at || 0) < RESET_GAP_MS) throw err_('Vừa gửi mã xong. Hãy chờ 1 phút rồi bấm gửi lại.');
    var code = randomDigits_(6);
    acc.reset = { hash: sha_(acc.salt + ':' + code), at: now, tries: 0 };
    save_(acc);
    try {
      MailApp.sendEmail({
        to: acc.email,
        name: 'Quickplay',
        subject: 'Quickplay – Mã đặt lại mật khẩu',
        body: 'Xin chào ' + acc.name + ',\n\nMã xác nhận đặt lại mật khẩu Quickplay của thầy cô là: ' + code +
          '\n\nMã có hiệu lực trong 15 phút. Không chia sẻ mã này cho bất kỳ ai.' +
          '\nNếu thầy cô không yêu cầu đặt lại mật khẩu, hãy bỏ qua thư này.\n\nTrân trọng,\nQuickplay'
      });
    } catch (e) {
      delete acc.reset;
      save_(acc);
      throw err_('Máy chủ chưa gửi được email (có thể đã hết lượt gửi thư trong ngày). Hãy thử lại sau hoặc liên hệ quản trị.');
    }
    return { sent: true, email: maskEmail_(acc.email) };
  });
}

/** Quên mật khẩu, bước 2: nhập mã trong email và đặt mật khẩu mới. */
function actForgotFinish_(req) {
  var username = normUser_(req.username);
  var code = String(req.code || '').replace(/\D/g, '');
  var next = String(req.new_password || '');
  checkPassword_(next);
  return lock_(function () {
    var acc = load_(username);
    if (!acc || !acc.reset) throw err_('Hãy bấm "Gửi mã về email khôi phục" trước.');
    var now = Date.now();
    if (now - (acc.reset.at || 0) > RESET_TTL_MS) { delete acc.reset; save_(acc); throw err_('Mã đã hết hạn. Hãy bấm gửi lại mã.'); }
    if ((acc.reset.tries || 0) >= RESET_MAX_TRIES) { delete acc.reset; save_(acc); throw err_('Nhập sai mã quá nhiều lần. Hãy bấm gửi lại mã.'); }
    if (!safeEq_(sha_(acc.salt + ':' + code), acc.reset.hash)) {
      acc.reset.tries = (acc.reset.tries || 0) + 1;
      save_(acc);
      throw err_('Mã xác nhận không đúng (còn ' + (RESET_MAX_TRIES - acc.reset.tries) + ' lần thử).');
    }
    acc.salt = randomKey_(16);
    acc.hash = hash_(acc.salt, next);
    acc.fails = 0;
    delete acc.reset;
    delete acc.token_hash; // đăng xuất khỏi mọi thiết bị
    delete acc.vault;      // két được mã hóa bằng mật khẩu cũ nên không còn mở được; giáo viên kết nối lại kho của mình một lần
    save_(acc);
    return { changed: true };
  });
}

// ---------------------------------------------------------------- quản trị
// Quản trị cao nhất đăng nhập bằng TÊN TÀI KHOẢN + MẬT KHẨU (trang /adminquantri).
// Mật khẩu không nằm trong mã nguồn: quản trị tự đặt ở lần thiết lập đầu tiên, có ADMIN_KEY mới đặt được.
// Máy chủ chỉ lưu bản băm có muối. Quên mật khẩu: dùng ADMIN_KEY (hàm setup() in ra) để đặt lại.
function adminAcc_() {
  var raw = PropertiesService.getScriptProperties().getProperty('ADMIN_ACC');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function saveAdminAcc_(acc) {
  PropertiesService.getScriptProperties().setProperty('ADMIN_ACC', JSON.stringify(acc));
}
function checkAdminKey_(key) {
  var props = PropertiesService.getScriptProperties();
  var expected = props.getProperty('ADMIN_KEY');
  if (!expected && PRESET_ADMIN_KEY) {
    expected = PRESET_ADMIN_KEY; // ghi nhớ để lần cập nhật mã sau vẫn giữ nguyên khóa
    props.setProperty('ADMIN_KEY', expected);
  }
  if (!expected) throw err_('Máy chủ chưa có ADMIN_KEY. Hãy cài bằng Trình cài đặt ở trang quản trị, hoặc chạy hàm setup() trong trình soạn thảo Apps Script.');
  return !!key && safeEq_(String(key), expected);
}
function checkAdminPassword_(p) {
  if (p.length < ADMIN_MIN_PASSWORD || p.length > 72) throw err_('Mật khẩu quản trị phải có từ ' + ADMIN_MIN_PASSWORD + ' đến 72 ký tự.');
}

/** Ai cũng gọi được: chỉ cho biết đã thiết lập tài khoản quản trị hay chưa (không lộ tên tài khoản). */
function actAdminStatus_() {
  restoreIfEmpty_(); // máy chủ vừa cài lại vào thư mục cũ: nạp lại tài khoản từ tệp sao lưu
  return { has_admin: !!adminAcc_(), folder: !!folderId_() };
}

// ---------------------------------------------------------------- thư mục lưu trữ trên Google Drive
function folderId_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (!id && PRESET_FOLDER_ID) {
    id = PRESET_FOLDER_ID; // ghi nhớ để lần cập nhật mã sau vẫn dùng đúng thư mục
    props.setProperty('FOLDER_ID', id);
  }
  return id || '';
}
function snapshotFile_(create) {
  var id = folderId_();
  if (!id) return null;
  var folder = DriveApp.getFolderById(id);
  var it = folder.getFilesByName(SNAPSHOT_FILE);
  if (it.hasNext()) return it.next();
  return create ? folder.createFile(SNAPSHOT_FILE, '{}', 'application/json') : null;
}
/** Bản ghi tài khoản để sao lưu: bỏ phiên đăng nhập và mã đặt lại mật khẩu (những thứ chỉ có ý nghĩa tức thời). */
function forSnapshot_(acc) {
  var o = {};
  Object.keys(acc).forEach(function (k) {
    if (k !== 'token_hash' && k !== 'token_at' && k !== 'reset' && k !== 'fails' && k !== 'fail_at') o[k] = acc[k];
  });
  return o;
}
/** Ghi toàn bộ tài khoản (mật khẩu đã băm, két đã mã hóa) vào tệp sao lưu trong thư mục. Lỗi ghi không làm hỏng thao tác chính. */
function mirror_() {
  var props = PropertiesService.getScriptProperties();
  try {
    if (!folderId_()) return;
    var all = props.getProperties();
    var out = { app: ADMIN_APP, version: ADMIN_VERSION, saved_at: new Date().toISOString(), admin: null, accounts: [] };
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('U_') !== 0) return;
      try { out.accounts.push(forSnapshot_(JSON.parse(all[k]))); } catch (e) { /* bỏ qua bản ghi hỏng */ }
    });
    var admin = adminAcc_();
    if (admin) out.admin = forSnapshot_(admin);
    snapshotFile_(true).setContent(JSON.stringify(out, null, 1));
    props.deleteProperty('MIRROR_ERR');
  } catch (e) {
    props.setProperty('MIRROR_ERR', String(e && e.message ? e.message : e).slice(0, 200));
  }
}
/** Máy chủ chưa có tài khoản nào mà thư mục đã có tệp sao lưu: nạp lại (dùng khi cài lại máy chủ). */
function restoreIfEmpty_() {
  try {
    if (!folderId_()) return false;
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    if (all.ADMIN_ACC || Object.keys(all).some(function (k) { return k.indexOf('U_') === 0; })) return false;
    var f = snapshotFile_(false);
    if (!f) return false;
    var d = JSON.parse(f.getBlob().getDataAsString());
    if (!d || d.app !== ADMIN_APP) return false;
    (d.accounts || []).forEach(function (a) {
      if (a && /^[a-z0-9._-]{3,32}$/.test(String(a.username)) && a.salt && a.hash) props.setProperty('U_' + a.username, JSON.stringify(a));
    });
    if (d.admin && d.admin.salt && d.admin.hash) props.setProperty('ADMIN_ACC', JSON.stringify(d.admin));
    return true;
  } catch (e) {
    return false;
  }
}
/** Quản trị xem nơi lưu trữ: tên và link thư mục, link tệp sao lưu, lỗi ghi gần nhất (nếu có). */
function actAdminStorage_() {
  var id = folderId_();
  var out = { folder_id: id, folder_name: '', folder_url: '', file_url: '', saved_at: '', error: PropertiesService.getScriptProperties().getProperty('MIRROR_ERR') || '' };
  if (!id) return out;
  try {
    var folder = DriveApp.getFolderById(id);
    out.folder_name = folder.getName();
    out.folder_url = folder.getUrl();
    var f = snapshotFile_(false);
    if (f) { out.file_url = f.getUrl(); out.saved_at = f.getLastUpdated().toISOString(); }
  } catch (e) {
    out.error = 'Máy chủ không mở được thư mục này. Thư mục phải nằm trong Google Drive của chính tài khoản đã cài máy chủ.';
  }
  return out;
}

/** Thiết lập (hoặc đặt lại) tài khoản quản trị. Bắt buộc có ADMIN_KEY. */
function actAdminInit_(req) {
  if (!checkAdminKey_(req.admin_key)) throw err_('Khóa quản trị (ADMIN_KEY) không đúng.');
  var username = normUser_(req.username);
  var password = String(req.password || '');
  checkAdminPassword_(password);
  return lock_(function () {
    var salt = randomKey_(16);
    var token = randomKey_(40);
    var old = adminAcc_();
    var acc = { username: username, salt: salt, hash: hash_(salt, password), token_hash: sha_(token), token_at: Date.now(), fails: 0 };
    if (old && old.email) acc.email = old.email; // đặt lại bằng ADMIN_KEY không làm mất email khôi phục
    saveAdminAcc_(acc);
    return { username: username, token: token, recovery_email: acc.email || '' };
  });
}

function actAdminLogin_(req) {
  var username = String(req.username || '').trim().toLowerCase();
  var password = String(req.password || '');
  return lock_(function () {
    var acc = adminAcc_();
    if (!acc) throw err_('Chưa thiết lập tài khoản quản trị. Hãy thiết lập lần đầu bằng ADMIN_KEY.');
    var now = Date.now();
    if ((acc.fails || 0) >= MAX_FAILS && now - (acc.fail_at || 0) < FAIL_WINDOW_MS) {
      throw err_('Nhập sai quá nhiều lần. Hãy thử lại sau 15 phút, hoặc đặt lại mật khẩu bằng ADMIN_KEY.');
    }
    // so cả tên lẫn mật khẩu, luôn tính băm để thời gian trả lời không lộ tên đúng hay sai
    var okPass = safeEq_(hash_(acc.salt, password), acc.hash);
    if (!safeEq_(username, acc.username) || !okPass) {
      acc.fails = now - (acc.fail_at || 0) < FAIL_WINDOW_MS ? (acc.fails || 0) + 1 : 1;
      acc.fail_at = now;
      saveAdminAcc_(acc);
      throw err_('Tên tài khoản hoặc mật khẩu quản trị không đúng.');
    }
    var token = randomKey_(40);
    acc.token_hash = sha_(token);
    acc.token_at = now;
    acc.fails = 0;
    saveAdminAcc_(acc);
    return { username: acc.username, token: token, recovery_email: acc.email || '' };
  });
}

function actAdminLogout_() {
  return lock_(function () {
    var acc = adminAcc_();
    if (acc) { delete acc.token_hash; saveAdminAcc_(acc); }
    return { ok: true };
  });
}

function actAdminChangePassword_(req) {
  var next = String(req.new_password || '');
  checkAdminPassword_(next);
  return lock_(function () {
    var acc = adminAcc_();
    if (!acc) throw err_('Chưa thiết lập tài khoản quản trị.');
    if (!safeEq_(hash_(acc.salt, String(req.password || '')), acc.hash)) throw err_('Mật khẩu hiện tại không đúng.');
    acc.salt = randomKey_(16);
    acc.hash = hash_(acc.salt, next);
    saveAdminAcc_(acc);
    return { changed: true };
  });
}

/** Quản trị khai báo (hoặc xóa) email khôi phục của chính mình. Phải nhập lại mật khẩu hiện tại. */
function actAdminSetEmail_(req) {
  var email = String(req.email || '').trim().toLowerCase();
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) throw err_('Địa chỉ email chưa đúng.');
  return lock_(function () {
    var acc = adminAcc_();
    if (!acc) throw err_('Chưa thiết lập tài khoản quản trị.');
    if (!safeEq_(hash_(acc.salt, String(req.password || '')), acc.hash)) throw err_('Mật khẩu hiện tại không đúng.');
    if (email) acc.email = email; else delete acc.email;
    delete acc.reset;
    saveAdminAcc_(acc);
    return { recovery_email: acc.email || '' };
  });
}

/** Quản trị quên mật khẩu, bước 1: gửi mã 6 số tới email khôi phục của quản trị. */
function actAdminForgotStart_(req) {
  var username = String(req.username || '').trim().toLowerCase();
  return lock_(function () {
    var acc = adminAcc_();
    // cùng một câu cho sai tên tài khoản và chưa khai báo email
    if (!acc || !acc.email || !safeEq_(username, acc.username)) {
      throw err_('Tài khoản quản trị này chưa khai báo email khôi phục. Hãy dùng "Đặt lại bằng ADMIN_KEY".');
    }
    var now = Date.now();
    if (acc.reset && now - (acc.reset.at || 0) < RESET_GAP_MS) throw err_('Vừa gửi mã xong. Hãy chờ 1 phút rồi bấm gửi lại.');
    var code = randomDigits_(6);
    acc.reset = { hash: sha_(acc.salt + ':' + code), at: now, tries: 0 };
    saveAdminAcc_(acc);
    try {
      MailApp.sendEmail({
        to: acc.email,
        name: 'Quickplay',
        subject: 'Quickplay – Mã đặt lại mật khẩu quản trị',
        body: 'Mã xác nhận đặt lại mật khẩu QUẢN TRỊ Quickplay là: ' + code +
          '\n\nMã có hiệu lực trong 15 phút. Không chia sẻ mã này cho bất kỳ ai.' +
          '\nNếu không phải bạn yêu cầu, hãy bỏ qua thư này và nên đổi mật khẩu quản trị.\n\nQuickplay'
      });
    } catch (e) {
      delete acc.reset;
      saveAdminAcc_(acc);
      throw err_('Máy chủ chưa gửi được email. Hãy thử lại sau hoặc dùng "Đặt lại bằng ADMIN_KEY".');
    }
    return { sent: true, email: maskEmail_(acc.email) };
  });
}

/** Quản trị quên mật khẩu, bước 2: nhập mã và mật khẩu mới. Trả về phiên đăng nhập mới. */
function actAdminForgotFinish_(req) {
  var username = String(req.username || '').trim().toLowerCase();
  var code = String(req.code || '').replace(/\D/g, '');
  var next = String(req.new_password || '');
  checkAdminPassword_(next);
  return lock_(function () {
    var acc = adminAcc_();
    if (!acc || !acc.reset || !safeEq_(username, acc.username)) throw err_('Hãy bấm "Gửi mã về email khôi phục" trước.');
    var now = Date.now();
    if (now - (acc.reset.at || 0) > RESET_TTL_MS) { delete acc.reset; saveAdminAcc_(acc); throw err_('Mã đã hết hạn. Hãy bấm gửi lại mã.'); }
    if ((acc.reset.tries || 0) >= RESET_MAX_TRIES) { delete acc.reset; saveAdminAcc_(acc); throw err_('Nhập sai mã quá nhiều lần. Hãy bấm gửi lại mã.'); }
    if (!safeEq_(sha_(acc.salt + ':' + code), acc.reset.hash)) {
      acc.reset.tries = (acc.reset.tries || 0) + 1;
      saveAdminAcc_(acc);
      throw err_('Mã xác nhận không đúng (còn ' + (RESET_MAX_TRIES - acc.reset.tries) + ' lần thử).');
    }
    var token = randomKey_(40);
    acc.salt = randomKey_(16);
    acc.hash = hash_(acc.salt, next);
    acc.token_hash = sha_(token);
    acc.token_at = now;
    acc.fails = 0;
    delete acc.reset;
    saveAdminAcc_(acc);
    return { username: acc.username, token: token, recovery_email: acc.email || '' };
  });
}

/** Chỉ quản trị: phiên đăng nhập còn hạn (admin_token) hoặc khóa ADMIN_KEY. */
function admin_(fn) {
  return function (req) {
    var token = String(req.admin_token || '');
    var acc = token ? adminAcc_() : null;
    var byToken = !!(acc && acc.token_hash && safeEq_(sha_(token), acc.token_hash) && Date.now() - (acc.token_at || 0) < ADMIN_SESSION_MS);
    if (!byToken && !(req.admin_key && checkAdminKey_(req.admin_key))) {
      throw err_(token ? 'Phiên quản trị đã hết hạn. Hãy đăng nhập lại.' : 'Khóa quản trị không đúng.');
    }
    return fn(req);
  };
}

function view_(acc) {
  return {
    username: acc.username, name: acc.name, locked: !!acc.locked, created_at: acc.created_at,
    last_login: acc.last_login || 0, configured: !!acc.vault, has_email: !!acc.email
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
