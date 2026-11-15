/**
 * Quickplay — Máy chủ Google Apps Script (Google Drive làm cơ sở dữ liệu)
 * ---------------------------------------------------------------------------
 * Hợp đồng API: docs/API.md   |   Kiểu dữ liệu: src/lib/types.ts
 *
 * - Web App (Vercel) và bản Electron gọi CÙNG một URL /exec này.
 * - Mọi phản hồi: { ok: true, data } hoặc { ok: false, error: "thông báo tiếng Việt" }.
 * - Bộ đề lưu ở QUICKPLAY_DATA/quizzes/<id>.json (+ _index.json).
 * - Phiên đang chạy giữ trong CacheService (khóa S_<pin>), ghi xuống
 *   QUICKPLAY_DATA/sessions/<pin>.json tối đa mỗi 10 giây và luôn ghi khi đổi trạng thái.
 * - Mọi thao tác ghi đều nằm trong LockService.getScriptLock().
 *
 * Chạy lần đầu: chọn hàm setup() rồi bấm "Chạy" để cấp quyền và tạo thư mục.
 * Runtime: V8, JavaScript thuần, không dùng thư viện ngoài.
 */

// ============================================================================
// HẰNG SỐ CẤU HÌNH
// ============================================================================
var APP_NAME = 'Quickplay';
var APP_VERSION = '1.4.0';
// Nơi phát hành mã mới để Apps Script TỰ CẬP NHẬT (xem phần TỰ CẬP NHẬT ở cuối tệp).
// Chỉ đổi được bằng Thuộc tính tập lệnh UPDATE_BASE trong trình soạn thảo (chủ dự án), không đổi được từ bên ngoài.
var UPDATE_BASE_DEFAULT = 'https://quickplay-delta.vercel.app/apps-script/';

// Trình cài đặt trong phần mềm Quickplay điền sẵn hai giá trị này khi thầy cô bấm "Sao chép mã",
// nhờ đó không phải chạy hàm setup() hay tìm khóa trong nhật ký. Để trống nếu cài thủ công theo hướng dẫn.
var PRESET_TEACHER_KEY = '';
var PRESET_FOLDER_ID = '';

var ROOT_FOLDER_NAME = 'QUICKPLAY_DATA';
var SUBFOLDERS = ['quizzes', 'sessions', 'media']; // lớp học (chế độ giấy) lưu ở classes.json trong thư mục gốc
var QUIZ_INDEX_FILE = '_index.json';
var SESSION_INDEX_FILE = '_index.json';

var CACHE_TTL_S = 21600;          // 6 giờ — mức tối đa của CacheService
var CHUNK_CHARS = 30000;          // 30.000 ký tự ≤ ~90KB kể cả chữ có dấu (≤ 3 byte/ký tự)
var MAX_CHUNKS = 60;              // ~1,8 triệu ký tự; vượt quá thì chỉ dùng tệp Drive
var PERSIST_INTERVAL_MS = 10000;  // ghi xuống Drive tối đa mỗi 10 giây
var SEEN_THROTTLE_MS = 15000;     // chỉ cập nhật last_seen nếu đã > 15 giây
var LOBBY_HIDE_MS = 60000;        // phòng chờ: ẩn người im lặng > 60 giây
var LOCK_WAIT_MS = 10000;

var MAX_PLAYERS = 300;
var MAX_NAME_LEN = 40;
var MAX_ANSWER_JSON = 5000;       // độ dài tối đa của 1 câu trả lời (JSON)
var MAX_DRAFT_JSON = 50000;       // bản nháp bài về nhà
var MAX_RECORD_SCORE = 100000;
var MAX_COINS = 100000;           // điểm thưởng tối đa của 1 câu (thưởng tốc độ + thưởng chuỗi)
var MAX_UPLOAD_BYTES = 45 * 1024 * 1024; // 45 MB — giới hạn thực tế của Apps Script
var COMPLETED_CACHE_KEEP_MS = 60 * 60 * 1000;      // giữ cache phiên đã kết thúc 1 giờ
var STALE_LIVE_SESSION_MS = 12 * 60 * 60 * 1000;   // phiên trực tiếp bỏ quên > 12 giờ → kết thúc

var DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

var STATE_LABEL = {
  LOBBY_WAITING: 'đang ở phòng chờ',
  IN_PROGRESS: 'đang diễn ra',
  PAUSED: 'đang tạm dừng',
  COMPLETED: 'đã kết thúc'
};

// Bộ nhớ tạm trong một lần thực thi (tránh gọi Drive lặp lại)
var MEMO_ = {};

// ============================================================================
// ĐIỂM VÀO WEB APP
// ============================================================================

/** GET: chỉ dùng để kiểm tra máy chủ (?action=ping). */
function doGet(e) {
  try {
    var action = e && e.parameter ? String(e.parameter.action || '') : '';
    if (action === 'ping') {
      return json_({ ok: true, data: { name: APP_NAME, version: APP_VERSION, self_update: true } });
    }
    return json_({
      ok: true,
      data: {
        name: APP_NAME,
        version: APP_VERSION,
        message: 'Máy chủ Quickplay đang hoạt động. Hãy dán địa chỉ /exec này vào màn hình Cài đặt của ứng dụng. ' +
          'Ứng dụng gửi yêu cầu bằng POST (JSON). Kiểm tra nhanh: thêm ?action=ping vào cuối địa chỉ.'
      }
    });
  } catch (err) {
    return json_({ ok: false, error: toMessage_(err) });
  }
}

/** POST: thân là JSON { action, teacher_key?, ...tham số }. */
function doPost(e) {
  var started = Date.now();
  var action = '';
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string' || !e.postData.contents) {
      throw userError_('Yêu cầu rỗng: không có dữ liệu gửi lên.');
    }
    var req;
    try {
      req = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      throw userError_('Dữ liệu gửi lên không phải JSON hợp lệ.');
    }
    if (!req || typeof req !== 'object' || Array.isArray(req)) {
      throw userError_('Dữ liệu gửi lên phải là một đối tượng JSON.');
    }
    action = String(req.action || '');
    var routes = getRoutes_();
    var route = Object.prototype.hasOwnProperty.call(routes, action) ? routes[action] : null;
    if (!route) throw userError_('Hành động không hợp lệ: "' + action + '".');
    if (route.teacher) requireTeacher_(req.teacher_key);

    var data = route.fn(req);
    logRequest_(action, started, true);
    return json_({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    logRequest_(action, started, false, err);
    return json_({ ok: false, error: toMessage_(err) });
  }
}

/** Bảng định tuyến: action → hàm xử lý; teacher=true là hành động 🔒. */
function getRoutes_() {
  return {
    ping: { teacher: false, fn: function () { return { name: APP_NAME, version: APP_VERSION, self_update: true }; } },
    updateCheck: { teacher: true, fn: actUpdateCheck_ },
    selfUpdate: { teacher: true, fn: actSelfUpdate_ },
    verifyTeacher: { teacher: true, fn: function () { return { ok: true }; } },

    listQuizzes: { teacher: true, fn: actListQuizzes_ },
    listPublicQuizzes: { teacher: false, fn: actListPublicQuizzes_ },
    getQuiz: { teacher: true, fn: actGetQuiz_ },
    saveQuiz: { teacher: true, fn: actSaveQuiz_ },
    deleteQuiz: { teacher: true, fn: actDeleteQuiz_ },
    uploadMedia: { teacher: true, fn: actUploadMedia_ },

    createSession: { teacher: true, fn: actCreateSession_ },
    hostState: { teacher: true, fn: actHostState_ },
    hostAction: { teacher: true, fn: actHostAction_ },
    listSessions: { teacher: true, fn: actListSessions_ },

    getSessionQuiz: { teacher: false, fn: actGetSessionQuiz_ },
    joinSession: { teacher: false, fn: actJoinSession_ },
    poll: { teacher: false, fn: actPoll_ },
    submitAnswer: { teacher: false, fn: actSubmitAnswer_ },
    saveProgress: { teacher: false, fn: actSaveProgress_ },
    getProgress: { teacher: false, fn: actGetProgress_ },
    finishPlayer: { teacher: false, fn: actFinishPlayer_ },
    reportViolation: { teacher: false, fn: actReportViolation_ },

    setRootFolder: { teacher: true, fn: actSetRootFolder_ },
    saveSnapshot: { teacher: true, fn: actSaveSnapshot_ },
    driveQuota: { teacher: true, fn: actDriveQuota_ },
    exportMedia: { teacher: true, fn: actExportMedia_ },
    exportSessions: { teacher: true, fn: actExportSessions_ },
    exportQuizzes: { teacher: true, fn: actExportQuizzes_ },
    restoreData: { teacher: true, fn: actRestoreData_ },
    swapMedia: { teacher: true, fn: actSwapMedia_ },
    getCatalog: { teacher: true, fn: actGetCatalog_ },
    saveCatalog: { teacher: true, fn: actSaveCatalog_ },
    listClasses: { teacher: true, fn: actListClasses_ },
    saveClass: { teacher: true, fn: actSaveClass_ },
    deleteClass: { teacher: true, fn: actDeleteClass_ },
    createPaperSession: { teacher: true, fn: actCreatePaperSession_ },
    paperAction: { teacher: false, fn: actPaperAction_ }, // xác thực bằng scan_key trong mã QR

    importGoogleForm: { teacher: true, fn: actImportGoogleForm_ },
    aiGenerate: { teacher: true, fn: actAiGenerate_ }
  };
}

// ============================================================================
// THIẾT LẬP LẦN ĐẦU & TIỆN ÍCH CHẠY TAY TRONG TRÌNH SOẠN THẢO
// ============================================================================

/**
 * Chạy MỘT LẦN trong trình soạn thảo: cấp quyền, tạo thư mục QUICKPLAY_DATA,
 * lưu ROOT_FOLDER_ID và tạo TEACHER_KEY ngẫu nhiên nếu chưa có.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();

  // Kiểm tra thư mục gốc cũ (nếu có), nếu mất thì tạo/tìm lại
  var root = null;
  var rootId = props.getProperty('ROOT_FOLDER_ID') || PRESET_FOLDER_ID;
  if (rootId) {
    try {
      root = DriveApp.getFolderById(rootId);
      if (root.isTrashed()) root = null;
    } catch (e) {
      root = null;
    }
  }
  if (!root) root = findOrCreateRootFolder_();
  props.setProperty('ROOT_FOLDER_ID', root.getId());

  SUBFOLDERS.forEach(function (name) {
    var sub = getOrCreateSubfolder_(root, name);
    props.setProperty(name.toUpperCase() + '_FOLDER_ID', sub.getId());
  });

  var key = props.getProperty('TEACHER_KEY');
  if (!key) {
    key = randomKey_(16);
    props.setProperty('TEACHER_KEY', key);
    Logger.log('Đã tạo TEACHER_KEY mới: ' + key);
  } else {
    Logger.log('TEACHER_KEY đã có sẵn (xem trong Cài đặt dự án > Thuộc tính tập lệnh).');
  }

  Logger.log('Thư mục dữ liệu: ' + root.getName() + ' — ' + root.getUrl());
  if (!props.getProperty('GEMINI_API_KEY')) {
    Logger.log('Chưa có GEMINI_API_KEY (không bắt buộc). Thêm khóa nếu muốn dùng AI tạo câu hỏi.');
  }
  Logger.log('HOÀN TẤT. Bước tiếp theo: Triển khai > Tùy chọn triển khai mới > Ứng dụng web.');
  return { root_folder_id: root.getId(), teacher_key: key };
}

/** In TEACHER_KEY hiện tại ra Nhật ký thực thi (khi quên khóa). */
function showTeacherKey() {
  var key = PropertiesService.getScriptProperties().getProperty('TEACHER_KEY');
  Logger.log(key ? ('TEACHER_KEY: ' + key) : 'Chưa có TEACHER_KEY — hãy chạy setup().');
}

/** Tạo trình kích hoạt chạy cleanupOldSessions() mỗi giờ (chạy tay 1 lần). */
function installCleanupTrigger() {
  removeCleanupTriggers();
  ScriptApp.newTrigger('cleanupOldSessions').timeBased().everyHours(1).create();
  Logger.log('Đã tạo trình kích hoạt: cleanupOldSessions chạy mỗi giờ.');
}

/** Xóa mọi trình kích hoạt cleanupOldSessions. */
function removeCleanupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cleanupOldSessions') ScriptApp.deleteTrigger(t);
  });
}

/** Dựng lại quizzes/_index.json từ các tệp bộ đề (khi chỉ mục bị hỏng). */
function rebuildQuizIndex() {
  var list = withLock_(function () { return rebuildQuizIndex_(); });
  Logger.log('Đã dựng lại chỉ mục: ' + list.length + ' bộ đề.');
  return list.length;
}

// ============================================================================
// BỘ ĐỀ (QUIZ)
// ============================================================================

function actListQuizzes_() {
  return readQuizIndex_();
}

function actListPublicQuizzes_() {
  return readQuizIndex_().filter(function (q) { return q.visibility === 'public'; });
}

function actGetQuiz_(req) {
  var id = requireId_(req.id, 'Mã bộ đề');
  var quiz = readJson_(folder_('quizzes'), id + '.json');
  if (!quiz) throw userError_('Không tìm thấy bộ đề (mã ' + id + ').');
  return quiz;
}

function actSaveQuiz_(req) {
  var quiz = req.quiz;
  if (!quiz || typeof quiz !== 'object' || Array.isArray(quiz)) {
    throw userError_('Thiếu dữ liệu bộ đề (quiz).');
  }
  var title = String(quiz.title || '').trim();
  if (!title) throw userError_('Bộ đề cần có tên.');
  if (!Array.isArray(quiz.questions)) throw userError_('Danh sách câu hỏi (questions) không hợp lệ.');
  quiz.title = title.slice(0, 200);
  if (quiz.id) {
    quiz.id = requireId_(quiz.id, 'Mã bộ đề');
  } else {
    quiz.id = newId_('qz');
  }
  quiz.visibility = quiz.visibility === 'public' ? 'public' : 'private';

  return withLock_(function () {
    var folder = folder_('quizzes');
    var now = new Date().toISOString();
    var existing = null;
    try { existing = readJson_(folder, quiz.id + '.json'); } catch (e) { existing = null; }
    quiz.created_at = (existing && existing.created_at) || quiz.created_at || now;
    quiz.updated_at = now;
    writeJson_(folder, quiz.id + '.json', quiz);

    var index = readQuizIndexRaw_(folder) || rebuildQuizIndex_();
    index = index.filter(function (s) { return s.id !== quiz.id; });
    index.push(quizSummary_(quiz));
    sortQuizIndex_(index);
    writeJson_(folder, QUIZ_INDEX_FILE, index);
    return quiz;
  });
}

function actDeleteQuiz_(req) {
  var id = requireId_(req.id, 'Mã bộ đề');
  return withLock_(function () {
    var folder = folder_('quizzes');
    var file = findFile_(folder, id + '.json');
    var index = readQuizIndexRaw_(folder) || rebuildQuizIndex_();
    var inIndex = index.some(function (s) { return s.id === id; });
    if (!file && !inIndex) throw userError_('Không tìm thấy bộ đề cần xóa (mã ' + id + ').');
    if (file) file.setTrashed(true); // chuyển vào thùng rác, khôi phục được trong 30 ngày
    if (inIndex) {
      writeJson_(folder, QUIZ_INDEX_FILE, index.filter(function (s) { return s.id !== id; }));
    }
    return { id: id };
  });
}

function quizSummary_(quiz) {
  var s = {
    id: quiz.id,
    title: quiz.title,
    visibility: quiz.visibility === 'public' ? 'public' : 'private',
    updated_at: quiz.updated_at,
    question_count: Array.isArray(quiz.questions) ? quiz.questions.length : 0
  };
  if (quiz.subject) s.subject = quiz.subject;
  if (quiz.subject_id) s.subject_id = quiz.subject_id;
  if (quiz.chapter_id) s.chapter_id = quiz.chapter_id;
  if (quiz.lesson_id) s.lesson_id = quiz.lesson_id;
  if (quiz.grade) s.grade = quiz.grade;
  if (quiz.cover_url) s.cover_url = quiz.cover_url;
  return s;
}

function sortQuizIndex_(list) {
  list.sort(function (a, b) { return String(b.updated_at || '').localeCompare(String(a.updated_at || '')); });
  return list;
}

/** Đọc chỉ mục; nếu chưa có thì dựng lại (có khóa). */
function readQuizIndex_() {
  var index = readQuizIndexRaw_(folder_('quizzes'));
  if (index) return index;
  return withLock_(function () {
    return readQuizIndexRaw_(folder_('quizzes')) || rebuildQuizIndex_();
  });
}

function readQuizIndexRaw_(folder) {
  var data;
  try { data = readJson_(folder, QUIZ_INDEX_FILE); } catch (e) { return null; }
  return Array.isArray(data) ? data : null;
}

/** Quét thư mục quizzes/ và ghi lại _index.json (gọi khi đang giữ khóa). */
function rebuildQuizIndex_() {
  var folder = folder_('quizzes');
  var list = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var name = f.getName();
    if (f.isTrashed() || name === QUIZ_INDEX_FILE || !/\.json$/i.test(name)) continue;
    try {
      var q = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
      if (q && q.id) list.push(quizSummary_(q));
    } catch (e) {
      console.warn('Bỏ qua tệp bộ đề hỏng: ' + name);
    }
  }
  sortQuizIndex_(list);
  writeJson_(folder, QUIZ_INDEX_FILE, list);
  return list;
}

// ============================================================================
// TẢI TỆP MEDIA
// ============================================================================

function actUploadMedia_(req) {
  var b64 = String(req.base64 || '');
  var mime = String(req.mime || '').trim().toLowerCase();

  // Bỏ tiền tố "data:<mime>;base64," nếu có
  if (b64.slice(0, 5) === 'data:') {
    var comma = b64.indexOf(',');
    if (comma < 0) throw userError_('Dữ liệu tệp (base64) không hợp lệ.');
    var header = b64.slice(5, comma);
    if (!mime) mime = header.split(';')[0].trim().toLowerCase();
    b64 = b64.slice(comma + 1);
  }
  b64 = b64.replace(/\s+/g, '');
  if (!b64) throw userError_('Thiếu nội dung tệp (base64).');

  var padding = b64.slice(-2) === '==' ? 2 : (b64.slice(-1) === '=' ? 1 : 0);
  var approxBytes = Math.floor(b64.length * 3 / 4) - padding;
  if (approxBytes > MAX_UPLOAD_BYTES) {
    throw userError_('Tệp quá lớn (' + (approxBytes / 1048576).toFixed(1) + ' MB). Apps Script chỉ nhận tối đa ' +
      '45 MB mỗi lần tải. Với video lớn, hãy dùng đường dẫn YouTube/Vimeo hoặc nén video trước khi tải.');
  }
  if (!/^(image|audio|video)\//.test(mime)) {
    throw userError_('Chỉ hỗ trợ tải ảnh, âm thanh hoặc video (kiểu tệp nhận được: "' + (mime || 'không rõ') + '").');
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(b64);
  } catch (e) {
    throw userError_('Không giải mã được dữ liệu tệp (base64 hỏng).');
  }

  var name = sanitizeFileName_(req.name || 'tep');
  var fileName = Date.now() + '_' + name;
  // Ảnh có kèm mã băm nội dung: đặt tên theo mã băm; đã có tệp cùng tên thì dùng lại, không lưu bản thứ hai
  var hash = String(req.hash || '').toLowerCase();
  var mediaFolder = folder_('media');
  if (/^[0-9a-f]{64}$/.test(hash) && mime.indexOf('image/') === 0) {
    fileName = 'h_' + hash.slice(0, 32) + '.' + (mime.split('/')[1] || 'img').replace(/[^a-z0-9]/g, '');
    var same = mediaFolder.getFilesByName(fileName);
    if (same.hasNext()) {
      var old = same.next();
      if (!old.isTrashed()) {
        return { url: 'https://lh3.googleusercontent.com/d/' + old.getId(), file_id: old.getId(), name: fileName, mime: mime, size: old.getSize(), reused: true };
      }
    }
  }
  var blob = Utilities.newBlob(bytes, mime, fileName);
  var file = mediaFolder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    try { file.setTrashed(true); } catch (ignore) { /* bỏ qua */ }
    throw userError_('Không bật được chia sẻ "Bất kỳ ai có đường liên kết" cho tệp. Tài khoản Google ' +
      '(thường là tài khoản trường/Workspace) có thể đang chặn chia sẻ ra ngoài. Hãy dùng tài khoản Gmail cá nhân.');
  }

  var id = file.getId();
  var url = mime.indexOf('image/') === 0
    ? 'https://lh3.googleusercontent.com/d/' + id
    : 'https://drive.google.com/uc?export=download&id=' + id;
  return { url: url, file_id: id, name: fileName, mime: mime, size: bytes.length };
}

function sanitizeFileName_(name) {
  var s = String(name).replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim();
  if (!s) s = 'tep';
  return s.slice(-120);
}

// ============================================================================
// PHIÊN TỔ CHỨC — HÀNH ĐỘNG CỦA GIÁO VIÊN
// ============================================================================

function actCreateSession_(req) {
  var quizId = requireId_(req.quiz_id, 'Mã bộ đề');
  var quiz = readJson_(folder_('quizzes'), quizId + '.json');
  if (!quiz) throw userError_('Không tìm thấy bộ đề (mã ' + quizId + ').');
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    throw userError_('Bộ đề chưa có câu hỏi nào, chưa thể tổ chức.');
  }
  var settings = normalizeSettings_(req.settings);

  return withLock_(function () {
    var index = readSessionIndex_();
    var pin = generatePin_(index);
    var now = Date.now();
    var session = {
      session_id: Utilities.getUuid(),
      pin: pin,
      quiz_id: quiz.id || quizId,
      quiz_title: String(quiz.title || ''),
      settings: settings,
      state: 'LOBBY_WAITING',
      created_at: now,
      paused_total_ms: 0,
      current_index: 0,
      question_locked: false,
      players: [],
      answers: [],
      question_count: quiz.questions.length
    };
    applyHomeworkRules_(session, now); // bài về nhà có thể tự mở ngay

    // Lưu ảnh chụp bộ đề vào cache để học sinh tải nhanh
    cachePutBig_('Q_' + pin, JSON.stringify(quiz));
    saveSession_(session, true);
    return { pin: pin, session_id: session.session_id };
  });
}

// ============================================================================
// CHẾ ĐỘ GIẤY (quét thẻ) — cùng quy tắc với src/lib/paper.ts
// ============================================================================
var CLASSES_FILE = 'classes.json';
var MAX_CARDS = 100;

// ----------------------------------------------------------------------------
// DANH MỤC: Môn học → Chương/Chủ đề → Bài (tệp catalog.json ở thư mục gốc) — cùng quy tắc với src/lib/catalog.ts
// ----------------------------------------------------------------------------
var CATALOG_FILE = 'catalog.json';
var MAX_CATALOG_NODES = 2000;

function cleanCatalog_(raw) {
  var count = 0;
  var node = function (x) {
    if (!x || typeof x.id !== 'string' || !/^[A-Za-z0-9_\-]{1,64}$/.test(x.id)) return null;
    var name = String(x.name == null ? '' : x.name).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!name || ++count > MAX_CATALOG_NODES) return null;
    return { id: x.id, name: name };
  };
  var list = function (arr, fn) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (x) { var n = fn(x); if (n) out.push(n); });
    return out;
  };
  return {
    subjects: list(raw && raw.subjects, function (s) {
      var sub = node(s);
      if (!sub) return null;
      sub.chapters = list(s.chapters, function (c) {
        var ch = node(c);
        if (!ch) return null;
        ch.lessons = list(c.lessons, node);
        return ch;
      });
      return sub;
    })
  };
}

function actGetCatalog_() {
  return cleanCatalog_(readJson_(folder_('root'), CATALOG_FILE));
}

function actSaveCatalog_(req) {
  var c = cleanCatalog_(req.catalog);
  c.updated_at = new Date().toISOString();
  return withLock_(function () {
    writeJson_(folder_('root'), CATALOG_FILE, c);
    return c;
  });
}

function readClasses_() {
  var list = readJson_(folder_('root'), CLASSES_FILE);
  return Array.isArray(list) ? list : [];
}

function actListClasses_() {
  return readClasses_().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'vi'); });
}

function cleanStudents_(raw) {
  if (!Array.isArray(raw)) return [];
  var out = [];
  for (var i = 0; i < raw.length && out.length < MAX_CARDS; i++) {
    var name = String(raw[i] == null ? '' : raw[i]).trim().slice(0, MAX_NAME_LEN);
    if (name) out.push(name);
  }
  return out;
}

function actSaveClass_(req) {
  var c = req.cls && typeof req.cls === 'object' ? req.cls : {};
  var name = String(c.name || '').trim().slice(0, 60);
  if (!name) throw userError_('Hãy nhập tên lớp.');
  var cls = {
    id: c.id ? requireId_(c.id, 'Mã lớp') : newId_('c_'),
    name: name,
    students: cleanStudents_(c.students),
    updated_at: new Date().toISOString()
  };
  return withLock_(function () {
    var list = readClasses_().filter(function (x) { return x.id !== cls.id; });
    list.push(cls);
    writeJson_(folder_('root'), CLASSES_FILE, list);
    return cls;
  });
}

function actDeleteClass_(req) {
  var id = requireId_(req.id, 'Mã lớp');
  return withLock_(function () {
    writeJson_(folder_('root'), CLASSES_FILE, readClasses_().filter(function (x) { return x.id !== id; }));
    return { id: id };
  });
}

function isPaperQuestion_(q) {
  if (!q || (q.type !== 'single_choice' && q.type !== 'true_false') || !Array.isArray(q.options)) return false;
  if (q.options.length < 2 || q.options.length > 4) return false;
  return q.options.some(function (o) { return o && o.is_correct; });
}

function actCreatePaperSession_(req) {
  var quizId = requireId_(req.quiz_id, 'Mã bộ đề');
  var quiz = readJson_(folder_('quizzes'), quizId + '.json');
  if (!quiz) throw userError_('Không tìm thấy bộ đề (mã ' + quizId + ').');
  quiz.questions = (Array.isArray(quiz.questions) ? quiz.questions : []).filter(isPaperQuestion_);
  if (!quiz.questions.length) {
    throw userError_('Bộ câu hỏi này chưa có câu nào dùng được với thẻ giấy (cần câu một đáp án, 2–4 phương án).');
  }
  var students = cleanStudents_(req.students);
  if (!students.length) throw userError_('Lớp chưa có học sinh nào.');

  return withLock_(function () {
    var pin = generatePin_(readSessionIndex_());
    var now = Date.now();
    var session = {
      session_id: Utilities.getUuid(),
      pin: pin,
      quiz_id: quiz.id || quizId,
      quiz_title: String(quiz.title || ''),
      settings: { mode: 'paper', music: false, shuffle_questions: false, shuffle_options: false, show_leaderboard: true, leaderboard_top: 0, power_ups: false },
      state: 'IN_PROGRESS',
      created_at: now,
      started_at: now,
      question_opened_at: now,
      paused_total_ms: 0,
      current_index: 0,
      question_locked: false,
      players: students.map(function (name, i) {
        return { player_id: 'c' + (i + 1), name: name, avatar: '', score: 0, correct: 0, answered: 0, current_index: 0, finished: false, last_seen: now };
      }),
      answers: [],
      question_count: quiz.questions.length,
      paper: { class_name: String(req.class_name || '').slice(0, 60), scan_key: randomKey_(24) }
    };
    var quizJson = JSON.stringify(quiz);
    cachePutBig_('Q_' + pin, quizJson);
    writeText_(folder_('sessions'), pin + '.quiz.json', quizJson); // đề đã lọc, dùng lại khi cache hết hạn
    saveSession_(session, true);
    return { pin: pin, session_id: session.session_id };
  });
}

/** Đề của phiên giấy (đã lọc): lấy từ cache, hết hạn thì đọc lại tệp <pin>.quiz.json. */
function paperQuiz_(pin) {
  var cached = cacheGetBig_('Q_' + pin);
  var quiz = null;
  if (cached) { try { quiz = JSON.parse(cached); } catch (e) { quiz = null; } }
  if (!quiz) {
    quiz = readJson_(folder_('sessions'), pin + '.quiz.json');
    if (quiz) cachePutBig_('Q_' + pin, JSON.stringify(quiz));
  }
  return quiz;
}

function paperView_(s) {
  var answers = {};
  s.answers.forEach(function (a) {
    if (a.q_index === s.current_index && a.answer) answers[Number(String(a.player_id).slice(1))] = a.answer.choice;
  });
  return {
    state: s.state, current_index: s.current_index, question_count: s.question_count,
    total: s.players.length, remind: !!(s.paper && s.paper.remind), reveal: !!(s.paper && s.paper.reveal), answers: answers
  };
}

function actPaperAction_(req) {
  var pin = normalizePin_(req.pin);
  var op = String(req.op || 'state');
  var check = function (s) {
    if (!s.settings || s.settings.mode !== 'paper' || !s.paper) throw userError_('Phòng này không ở chế độ giấy.');
    if (!req.key || !safeEqual_(String(req.key), String(s.paper.scan_key))) {
      throw userError_('Mã quét không hợp lệ. Hãy quét lại mã QR trên màn chiếu.');
    }
  };
  if (op === 'state') {
    var view = loadSession_(pin, false);
    check(view);
    return paperView_(view);
  }
  if (['hello', 'scan', 'remind', 'reveal', 'next', 'end'].indexOf(op) < 0) throw userError_('Thao tác không hợp lệ: "' + op + '".');
  var hits = Array.isArray(req.hits) ? req.hits.slice(0, MAX_CARDS) : [];
  var quiz = op === 'scan' ? paperQuiz_(pin) : null;
  var questions = quiz && Array.isArray(quiz.questions) ? quiz.questions : [];

  return withLock_(function () {
    var s = loadSession_(pin, true);
    check(s);
    var now = Date.now();
    if (op === 'scan') {
      if (s.state === 'IN_PROGRESS' && Number(req.q_index) === s.current_index) {
        var q = questions[s.current_index];
        hits.forEach(function (h) {
          var card = Math.floor(Number(h && h.card));
          var choice = Math.floor(Number(h && h.choice));
          var p = s.players[card - 1];
          if (!q || !p || !(choice >= 0) || choice >= q.options.length) return;
          var old = null;
          for (var i = 0; i < s.answers.length; i++) {
            if (s.answers[i].player_id === p.player_id && s.answers[i].q_index === s.current_index) { old = s.answers[i]; break; }
          }
          if (old && old.answer && old.answer.choice === choice) return;
          if (old) { // em xoay lại thẻ: lấy đáp án mới nhất
            p.score -= old.score;
            if (old.correct) p.correct -= 1;
            p.answered -= 1;
            s.answers.splice(s.answers.indexOf(old), 1);
          }
          var opt = q.options[choice];
          var correct = !!opt.is_correct;
          var score = correct ? round2_(clamp_(Number(q.points) || 0, 0, MAX_RECORD_SCORE)) : 0;
          s.answers.push({
            player_id: p.player_id, question_id: q.id, q_index: s.current_index,
            answer: { kind: 'choice', option_ids: [opt.option_id], choice: choice },
            correct: correct, ratio: correct ? 1 : 0, score: score,
            time_ms: Math.max(0, now - (s.question_opened_at || now)), at: now
          });
          p.score += score;
          if (correct) p.correct += 1;
          p.answered += 1;
          p.last_seen = now;
        });
      }
    } else if (op === 'hello') {
      s.paper.connected = true;
    } else if (op === 'reveal') {
      s.paper.reveal = !s.paper.reveal;
      s.paper.remind = false;
    } else if (op === 'remind') {
      s.paper.remind = !s.paper.remind;
    } else if (op === 'next') {
      if (s.state === 'IN_PROGRESS') {
        s.paper.remind = false;
        s.paper.reveal = false;
        if (s.current_index >= s.question_count - 1) completeSession_(s, now);
        else { s.current_index += 1; s.question_opened_at = now; }
      }
    } else if (op === 'end') {
      if (s.state !== 'COMPLETED') completeSession_(s, now);
    }
    saveSession_(s, op !== 'scan');
    return paperView_(s);
  });
}

/**
 * Giáo viên chọn thư mục Drive riêng làm nơi lưu dữ liệu (dán link thư mục trong phần Cài đặt của Quickplay).
 * Thư mục phải thuộc (hoặc được chia sẻ quyền chỉnh sửa cho) tài khoản Google đã cài Apps Script này.
 * Dữ liệu đang có ở thư mục cũ KHÔNG tự chuyển sang; muốn giữ thì kéo các thư mục con sang thư mục mới trên Drive.
 */
function actSetRootFolder_(req) {
  var url = String(req.folder_url || '');
  var m = url.match(/folders\/([\w-]{10,})/) || url.match(/[?&]id=([\w-]{10,})/) || url.match(/^([\w-]{20,})$/);
  if (!m) throw userError_('Link thư mục Google Drive không hợp lệ. Hãy mở thư mục trên Drive và chép địa chỉ trên thanh trình duyệt.');
  var folder;
  try {
    folder = DriveApp.getFolderById(m[1]);
    folder.getName();
  } catch (e) {
    throw userError_('Apps Script không mở được thư mục này. Thư mục phải nằm trong Google Drive của chính tài khoản đã cài Apps Script.');
  }
  if (folder.isTrashed()) throw userError_('Thư mục này đang nằm trong Thùng rác.');
  return withLock_(function () {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('ROOT_FOLDER_ID', folder.getId());
    SUBFOLDERS.forEach(function (n) { props.deleteProperty(n.toUpperCase() + '_FOLDER_ID'); });
    MEMO_ = {};
    SUBFOLDERS.forEach(function (n) { folder_(n); }); // tạo sẵn quizzes/, sessions/, media/
    return { id: folder.getId(), name: folder.getName() };
  });
}

function actHostState_(req) {
  var pin = normalizePin_(req.pin);
  var s = loadSession_(pin, false);
  if (homeworkNeedsUpdate_(s, Date.now())) {
    s = withLock_(function () {
      var t = loadSession_(pin, true);
      if (applyHomeworkRules_(t, Date.now())) saveSession_(t, true);
      return t;
    });
  } else {
    flushIfDirty_(pin);
  }
  return s;
}

function actHostAction_(req) {
  var pin = normalizePin_(req.pin);
  var op = String(req.op || '');
  var OPS = ['start', 'pause', 'resume', 'next', 'lock', 'end', 'kick', 'unlock', 'grade'];
  if (OPS.indexOf(op) < 0) throw userError_('Thao tác không hợp lệ: "' + op + '".');

  return withLock_(function () {
    var s = loadSession_(pin, true);
    var now = Date.now();
    var changed = applyHomeworkRules_(s, now);
    var mode = s.settings.mode;
    var deny = function (msg) {
      if (changed) saveSession_(s, true);
      throw userError_(msg);
    };

    switch (op) {
      case 'start':
        if (s.state === 'IN_PROGRESS') break; // đã bắt đầu — coi như thành công
        if (s.state !== 'LOBBY_WAITING') deny('Không thể bắt đầu khi phòng ' + STATE_LABEL[s.state] + '.');
        startSession_(s, now);
        break;

      case 'pause':
        if (s.state !== 'IN_PROGRESS') deny('Chỉ tạm dừng được khi phòng đang diễn ra (hiện ' + STATE_LABEL[s.state] + ').');
        s.state = 'PAUSED';
        s.paused_at = now;
        break;

      case 'resume':
        if (s.state !== 'PAUSED') deny('Phòng không ở trạng thái tạm dừng.');
        s.paused_total_ms = (s.paused_total_ms || 0) + Math.max(0, now - (s.paused_at || now));
        delete s.paused_at;
        s.state = 'IN_PROGRESS';
        break;

      case 'lock':
        if (mode !== 'instructor_paced') deny('Khóa câu hỏi chỉ dùng ở chế độ giáo viên điều khiển.');
        if (s.state !== 'IN_PROGRESS' && s.state !== 'PAUSED') deny('Không thể khóa câu hỏi khi phòng ' + STATE_LABEL[s.state] + '.');
        s.question_locked = true;
        break;

      case 'next':
        if (mode !== 'instructor_paced') deny('Chuyển câu chỉ dùng ở chế độ giáo viên điều khiển.');
        if (s.state !== 'IN_PROGRESS') deny('Chỉ chuyển câu được khi phòng đang diễn ra (hiện ' + STATE_LABEL[s.state] + ').');
        if (s.current_index >= s.question_count - 1) {
          completeSession_(s, now); // "next" ở câu cuối → kết thúc
        } else {
          s.current_index += 1;
          s.question_locked = false;
          s.question_opened_at = now;
        }
        break;

      case 'end':
        if (s.state !== 'COMPLETED') completeSession_(s, now);
        break;

      case 'kick':
        var pid = String(req.player_id || '');
        if (!pid) deny('Thiếu player_id của học sinh cần mời ra.');
        var p = findPlayer_(s, pid);
        if (!p) deny('Không tìm thấy học sinh cần mời ra.');
        p.kicked = true;
        if (mode === 'instructor_paced' && s.state === 'IN_PROGRESS') autoLockIfAllAnswered_(s);
        break;

      case 'unlock':
        // Mở khóa bài bị khóa do gian lận; đếm số lần vi phạm lại từ mốc hiện tại
        var upid = String(req.player_id || '');
        var up = upid ? findPlayer_(s, upid) : null;
        if (!up) deny('Không tìm thấy học sinh cần mở khóa.');
        up.locked = false;
        up.violation_base = up.violations || 0;
        break;

      case 'grade':
        // Giáo viên chấm câu trả lời miệng: player_id + q_index + correct (+ points, coins của câu)
        var gpid = String(req.player_id || '');
        var gqi = Number(req.q_index);
        var gp = gpid ? findPlayer_(s, gpid) : null;
        var grec = null;
        for (var gi = 0; gi < s.answers.length; gi++) {
          if (s.answers[gi].player_id === gpid && s.answers[gi].q_index === gqi) { grec = s.answers[gi]; break; }
        }
        if (!gp || !grec) deny('Không tìm thấy câu trả lời cần chấm.');
        if (!grec.pending) { // chấm lại: hoàn tác kết quả cũ
          gp.score = (gp.score || 0) - (grec.score || 0);
          gp.coins = (gp.coins || 0) - (grec.coins || 0);
          if (grec.correct) gp.correct = (gp.correct || 0) - 1;
        }
        var gok = req.correct === true;
        delete grec.pending;
        grec.correct = gok;
        grec.ratio = gok ? 1 : 0;
        grec.score = gok ? round2_(clamp_(Number(req.points) || 0, 0, MAX_RECORD_SCORE)) : 0;
        grec.coins = gok ? round2_(clamp_(Number(req.coins) || 0, 0, MAX_COINS)) : 0;
        gp.score = (gp.score || 0) + grec.score;
        gp.coins = (gp.coins || 0) + grec.coins;
        if (gok) gp.correct = (gp.correct || 0) + 1;
        break;
    }

    saveSession_(s, true);
    return s;
  });
}

function actListSessions_() {
  var index = readSessionIndex_().slice();
  index.sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });
  var liveChecks = 0;
  return index.map(function (e) {
    var item = {
      pin: e.pin,
      session_id: e.session_id,
      quiz_id: e.quiz_id,
      quiz_title: e.quiz_title,
      state: e.state,
      mode: e.mode,
      created_at: e.created_at,
      ended_at: e.ended_at,
      player_count: e.player_count || 0
    };
    if (e.archived_file) item.archived_file = e.archived_file;
    // Với phiên đang mở, lấy số liệu mới nhất từ cache (giới hạn 50 phiên)
    if (e.state !== 'COMPLETED' && !e.archived_file && liveChecks < 50) {
      liveChecks++;
      try {
        var str = cacheGetBig_('S_' + e.pin);
        if (str) {
          var s = JSON.parse(str);
          if (s.session_id === e.session_id) {
            item.state = s.state;
            item.player_count = countActivePlayers_(s);
          }
        }
      } catch (ignore) { /* dùng số liệu trong chỉ mục */ }
    }
    return item;
  });
}

// ============================================================================
// PHIÊN TỔ CHỨC — HÀNH ĐỘNG CỦA HỌC SINH
// ============================================================================

function actGetSessionQuiz_(req) {
  var pin = normalizePin_(req.pin);
  var s = loadSession_(pin, false);
  var now = Date.now();
  if (s.settings.mode === 'homework' && s.state !== 'COMPLETED') {
    var start = parseTime_(s.settings.start_time);
    if (start && now < start) throw userError_('Bài tập chưa mở. Thời gian mở: ' + formatTime_(start) + '.');
  }
  if (homeworkNeedsUpdate_(s, now)) applyHomeworkRules_(s, now); // chỉ để trả trạng thái đúng

  var quiz = null;
  if (s.settings.mode === 'paper') {
    quiz = paperQuiz_(pin); // đề đã lọc cho thẻ giấy – thứ tự câu phải khớp với phiên
    if (!quiz) throw userError_('Không tải được đề của phòng này.');
    return { quiz: quiz, settings: s.settings, state: s.state };
  }
  var cached = cacheGetBig_('Q_' + pin);
  if (cached) {
    try { quiz = JSON.parse(cached); } catch (e) { quiz = null; }
  }
  if (!quiz) {
    quiz = readJson_(folder_('quizzes'), s.quiz_id + '.json');
    if (!quiz) throw userError_('Bộ đề của phòng này không còn tồn tại (có thể đã bị xóa).');
  }
  return { quiz: quiz, settings: s.settings, state: s.state };
}

function actJoinSession_(req) {
  var pin = normalizePin_(req.pin);
  var name = String(req.name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
  var avatar = String(req.avatar || '').slice(0, 300);
  var className = String(req.class_name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  var pid = req.player_id ? String(req.player_id).slice(0, 64) : '';

  return withLock_(function () {
    var s = loadSession_(pin, true);
    var now = Date.now();
    var changed = applyHomeworkRules_(s, now);
    var deny = function (msg) {
      if (changed) saveSession_(s, true);
      throw userError_(msg);
    };

    // Khôi phục kết nối bằng player_id có sẵn
    if (pid) {
      var old = findPlayer_(s, pid);
      if (old) {
        if (old.kicked) deny('Bạn đã được giáo viên mời ra khỏi phòng này.');
        old.last_seen = now;
        saveSession_(s, changed);
        return { player_id: old.player_id, player: old };
      }
      // player_id không còn trong phòng → coi như vào mới
    }

    if (s.state === 'COMPLETED') deny('Phòng đã kết thúc, không thể tham gia.');
    if (s.settings.mode === 'paper') deny('Phòng này dùng thẻ trả lời giấy, học sinh không cần vào bằng thiết bị.');
    if (!name) deny('Vui lòng nhập tên của bạn.');
    if (!className) deny('Vui lòng nhập lớp của bạn.');
    if (s.settings.mode === 'homework') {
      var start = parseTime_(s.settings.start_time);
      if (start && now < start) deny('Bài tập chưa mở. Thời gian mở: ' + formatTime_(start) + '.');
    }
    var lower = name.toLowerCase();
    var lowerClass = className.toLowerCase();
    // Hai bạn trùng tên ở hai lớp khác nhau vẫn vào được
    // Cùng tên + cùng lớp: lần trước đã nộp bài hoặc bị khóa → đây là LẦN LÀM MỚI của em đó
    // (trực tiếp tự do, bài về nhà: làm lại không giới hạn). Lần trước còn đang làm dở → từ chối.
    var mine = s.players.filter(function (p) {
      return !p.kicked && String(p.name).toLowerCase() === lower && String(p.class_name || '').toLowerCase() === lowerClass;
    });
    var redo = s.settings.mode === 'classic_live' || s.settings.mode === 'homework';
    var busyOne = mine.some(function (p) { return !redo || (!p.finished && !p.locked); });
    if (busyOne) deny('Tên "' + name + '" đang có bạn cùng lớp dùng. Hãy thêm họ hoặc chọn tên khác.');
    // Tên + lớp này đã nộp bài ở lượt trước: báo cho học sinh, chỉ vào tiếp khi em xác nhận vẫn dùng tên cũ
    if (mine.length && req.reuse_name !== true) deny('[TEN_DA_DUNG] Tên "' + name + '" lớp ' + className + ' đã được dùng ở lượt làm trước.');
    mine.forEach(function (p) { p.superseded = true; });
    if (s.players.length >= MAX_PLAYERS) deny('Phòng đã đủ ' + MAX_PLAYERS + ' người tham gia.');

    var player = {
      player_id: newId_('p'),
      name: name,
      class_name: className,
      avatar: avatar,
      score: 0,
      correct: 0,
      answered: 0,
      current_index: s.settings.mode === 'instructor_paced' ? (s.current_index || 0) : 0,
      finished: false,
      last_seen: now,
      joined_at: now,
      streak: 0
    };
    if (mine.length) player.attempt_no = mine.length + 1;
    s.players.push(player);
    saveSession_(s, changed);
    return { player_id: player.player_id, player: player };
  });
}

function actPoll_(req) {
  var pin = normalizePin_(req.pin);
  var pid = req.player_id ? String(req.player_id) : '';
  var s = loadSession_(pin, false);
  var now = Date.now();
  var p = pid ? findPlayer_(s, pid) : null;

  var needHomework = homeworkNeedsUpdate_(s, now);
  var needSeen = !!(p && !p.kicked && now - (p.last_seen || 0) > SEEN_THROTTLE_MS);

  if (needHomework || needSeen) {
    // Ghi có điều tiết: nếu không lấy được khóa nhanh thì bỏ qua lần cập nhật last_seen này
    var updated = withLockTry_(function () {
      var t = loadSession_(pin, true);
      var tNow = Date.now();
      var changed = applyHomeworkRules_(t, tNow);
      var tp = pid ? findPlayer_(t, pid) : null;
      if (tp && !tp.kicked) tp.last_seen = tNow;
      saveSession_(t, changed);
      return t;
    }, needHomework ? LOCK_WAIT_MS : 2000);
    if (updated) {
      s = updated;
      p = pid ? findPlayer_(s, pid) : null;
    } else if (needHomework) {
      applyHomeworkRules_(s, now); // ít nhất trả về trạng thái đúng
    }
  } else {
    flushIfDirty_(pin);
  }
  return buildPollResult_(s, p, Date.now());
}

function actSubmitAnswer_(req) {
  var pin = normalizePin_(req.pin);
  var pid = String(req.player_id || '');
  if (!pid) throw userError_('Thiếu player_id.');
  var rec = req.record;
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) throw userError_('Thiếu dữ liệu câu trả lời (record).');
  var qi = Number(rec.q_index);
  if (!isFinite(qi) || Math.floor(qi) !== qi) throw userError_('Chỉ số câu hỏi (q_index) không hợp lệ.');
  var answerJson = '';
  try { answerJson = JSON.stringify(rec.answer === undefined ? null : rec.answer); } catch (e) { answerJson = ''; }
  if (!answerJson || answerJson.length > MAX_ANSWER_JSON) throw userError_('Câu trả lời không hợp lệ hoặc quá dài.');

  return withLock_(function () {
    var s = loadSession_(pin, true);
    var now = Date.now();
    var changed = applyHomeworkRules_(s, now);
    var deny = function (msg) {
      if (changed) saveSession_(s, true);
      throw userError_(msg);
    };

    var p = findPlayer_(s, pid);
    if (!p) deny('Không tìm thấy bạn trong phòng. Hãy vào lại phòng bằng mã PIN.');
    if (p.kicked) deny('Bạn đã được giáo viên mời ra khỏi phòng này.');
    if (p.locked) deny('Bài làm đang bị khóa do vi phạm quy chế. Hãy chờ giáo viên mở khóa.');
    if (s.state === 'LOBBY_WAITING') deny('Trò chơi chưa bắt đầu.');
    if (s.state === 'PAUSED') deny('Giáo viên đang tạm dừng, câu trả lời chưa được ghi nhận. Hãy gửi lại khi tiếp tục.');
    if (s.state === 'COMPLETED') deny('Phòng đã kết thúc, không thể nộp thêm câu trả lời.');
    if (qi < 0 || qi >= s.question_count) deny('Câu hỏi không tồn tại trong bộ đề.');

    // Chống nộp trùng: cùng player_id + q_index → bỏ qua, trả về trạng thái hiện tại
    var paced = s.settings.mode === 'instructor_paced';
    var old = null;
    for (var k = 0; k < s.answers.length; k++) {
      if (s.answers[k].player_id === pid && s.answers[k].q_index === qi) { old = s.answers[k]; break; }
    }
    var attempt = Math.floor(Number(rec.attempt) || 0);
    if (old) {
      // Chỉ thay câu trả lời cũ khi: (giáo viên điều khiển) chọn lại đáp án lúc câu còn mở;
      // hoặc (tự do / bài về nhà) lượt làm lại câu sai trong giới hạn giáo viên cho phép.
      var can = paced
        ? rec.change === true && qi === s.current_index && !s.question_locked
        : attempt > (old.attempt || 0) && attempt <= (s.settings.retry_rounds || 0) && !old.pending && (old.ratio || 0) < 1;
      if (!can) {
        if (changed) saveSession_(s, true);
        return { player: p, duplicate: true };
      }
    }

    if (paced) {
      if (qi !== s.current_index) deny('Câu hỏi này đã đóng, hãy theo câu giáo viên đang mở.');
      if (s.question_locked) deny('Đã hết thời gian trả lời câu này.');
    }
    if (old) {
      if (!old.pending) {
        p.score = (p.score || 0) - (old.score || 0);
        p.coins = (p.coins || 0) - (old.coins || 0);
        if (old.correct) p.correct = (p.correct || 0) - 1;
      }
      p.answered = (p.answered || 0) - 1;
      s.answers.splice(s.answers.indexOf(old), 1);
    }

    var pending = rec.pending === true; // trả lời miệng: chờ giáo viên chấm
    var correct = !pending && rec.correct === true;
    var ratio = rec.ratio === undefined || rec.ratio === null ? (correct ? 1 : 0) : clamp_(Number(rec.ratio) || 0, 0, 1);
    var record = {
      player_id: pid,
      question_id: String(rec.question_id || '').slice(0, 64),
      q_index: qi,
      answer: JSON.parse(answerJson),
      correct: correct,
      ratio: pending ? 0 : ratio,
      score: pending ? 0 : round2_(clamp_(Number(rec.score) || 0, 0, MAX_RECORD_SCORE)),
      coins: pending ? 0 : round2_(clamp_(Number(rec.coins) || 0, 0, MAX_COINS)),
      time_ms: Math.round(clamp_(Number(rec.time_ms) || 0, 0, 24 * 3600 * 1000)),
      at: now
    };
    if (pending) record.pending = true;
    if (old && !paced) record.attempt = attempt;
    s.answers.push(record);

    p.answered = (p.answered || 0) + 1;
    if (!pending) {
      p.score = (p.score || 0) + record.score;
      p.coins = (p.coins || 0) + record.coins;
      if (record.correct) {
        p.correct = (p.correct || 0) + 1;
        p.streak = (p.streak || 0) + 1;
      } else {
        p.streak = 0;
      }
    }
    p.current_index = Math.min(s.question_count, Math.max(p.current_index || 0, qi + 1));
    p.last_seen = now;
    // Đã trả lời hết → finished (KHÔNG tự kết thúc phòng; giáo viên bấm "Kết thúc")
    // Còn lượt làm lại hoặc học sinh tự bấm Nộp bài (tự do chọn câu) thì chờ finishPlayer.
    var selfSubmit = !paced && (s.settings.navigation === 'free' || (s.settings.retry_rounds || 0) > 0);
    if (!selfSubmit && p.answered >= s.question_count && !p.finished) {
      p.finished = true;
      p.finished_at = now;
    }
    // Giáo viên điều khiển: KHÔNG tự khóa câu khi cả lớp đã trả lời, để học sinh còn được chọn lại đáp án tới khi hết giờ.

    saveSession_(s, changed);
    return { player: p };
  });
}

function actSaveProgress_(req) {
  var pin = normalizePin_(req.pin);
  var pid = String(req.player_id || '');
  if (!pid) throw userError_('Thiếu player_id.');
  var draft = req.draft === undefined ? null : req.draft;
  var draftJson;
  try { draftJson = JSON.stringify(draft); } catch (e) { throw userError_('Bản nháp không hợp lệ.'); }
  if (draftJson.length > MAX_DRAFT_JSON) throw userError_('Bản nháp quá lớn, không thể lưu.');
  var ci = Number(req.current_index);
  if (!isFinite(ci)) ci = 0;

  return withLock_(function () {
    var s = loadSession_(pin, true);
    var now = Date.now();
    var changed = applyHomeworkRules_(s, now);
    var p = findPlayer_(s, pid);
    if (!p || p.kicked || s.state === 'COMPLETED') {
      if (changed) saveSession_(s, true);
      if (!p) throw userError_('Không tìm thấy bạn trong phòng.');
      if (p.kicked) throw userError_('Bạn đã được giáo viên mời ra khỏi phòng này.');
      throw userError_('Bài đã kết thúc hoặc đã hết hạn, không lưu được tiến độ.');
    }
    p.current_index = Math.floor(clamp_(ci, 0, s.question_count));
    p.draft = JSON.parse(draftJson);
    p.draft_saved_at = now;
    p.last_seen = now;
    saveSession_(s, changed);
    return { saved_at: now };
  });
}

function actGetProgress_(req) {
  var pin = normalizePin_(req.pin);
  var pid = String(req.player_id || '');
  if (!pid) throw userError_('Thiếu player_id.');
  var s = loadSession_(pin, false);
  var p = findPlayer_(s, pid);
  if (!p) throw userError_('Không tìm thấy bạn trong phòng.');
  if (p.kicked) throw userError_('Bạn đã được giáo viên mời ra khỏi phòng này.');
  return {
    current_index: p.current_index || 0,
    draft: p.draft === undefined ? null : p.draft,
    answers: s.answers.filter(function (a) { return a.player_id === pid; })
  };
}

function actFinishPlayer_(req) {
  var pin = normalizePin_(req.pin);
  var pid = String(req.player_id || '');
  if (!pid) throw userError_('Thiếu player_id.');
  return withLock_(function () {
    var s = loadSession_(pin, true);
    var now = Date.now();
    applyHomeworkRules_(s, now);
    var p = findPlayer_(s, pid);
    if (!p) throw userError_('Không tìm thấy bạn trong phòng.');
    if (p.kicked) throw userError_('Bạn đã được giáo viên mời ra khỏi phòng này.');
    if (!p.finished) {
      p.finished = true;
      p.finished_at = now;
    }
    p.last_seen = now;
    // Ghi có điều tiết (≤ 10 giây) để cả lớp nộp cùng lúc không tranh khóa; trạng thái đổi thì vẫn ghi ngay
    saveSession_(s, false);
    return { player: p };
  });
}

// ============================================================================
// LOGIC TRẠNG THÁI PHIÊN
// ============================================================================

// ============================================================================
// CHỐNG GIAN LẬN
// ============================================================================

var VIOLATION_KINDS = ['tab_hidden', 'window_blur', 'exit_fullscreen', 'right_click', 'copy_paste',
  'screenshot_key', 'devtools', 'shortcut', 'split_screen', 'open_link'];
var MAX_VIOLATION_LOG = 3000;
var VIOLATION_DEBOUNCE_MS = 3000;

/** Học sinh báo một lần vi phạm (chuyển tab, chuột phải, chụp màn hình…). Tự khóa bài khi đạt ngưỡng. */
function actReportViolation_(req) {
  var pin = normalizePin_(req.pin);
  var pid = String(req.player_id || '');
  var kind = String(req.kind || '');
  if (!pid) throw userError_('Thiếu player_id.');
  if (VIOLATION_KINDS.indexOf(kind) < 0) throw userError_('Loại vi phạm không hợp lệ.');
  var detail = String(req.detail || '').slice(0, 200);
  var qi = Number(req.q_index);

  return withLock_(function () {
    var s = loadSession_(pin, true);
    var now = Date.now();
    var p = findPlayer_(s, pid);
    if (!p) throw userError_('Không tìm thấy bạn trong phòng.');
    if (!Array.isArray(s.violations)) s.violations = [];

    var last = null;
    for (var i = s.violations.length - 1; i >= 0; i--) {
      var v = s.violations[i];
      if (v.player_id === pid && v.kind === kind) { last = v; break; }
    }
    if (!last || now - last.at > VIOLATION_DEBOUNCE_MS) {
      var rec = { player_id: pid, name: p.name, kind: kind, detail: detail, at: now };
      if (isFinite(qi) && qi >= 0) rec.q_index = Math.floor(qi);
      s.violations.push(rec);
      if (s.violations.length > MAX_VIOLATION_LOG) s.violations.splice(0, s.violations.length - MAX_VIOLATION_LOG);
      if (kind !== 'open_link') {
        p.violations = (p.violations || 0) + 1;
        var ac = s.settings.anti_cheat;
        var max = ac && ac.enabled ? Number(ac.max_violations) || 0 : 0;
        // Ngưỡng N: N lần đầu chỉ cảnh báo, lần thứ N+1 khóa lượt chơi
        if (max > 0 && p.violations - (p.violation_base || 0) > max) p.locked = true;
      }
      saveSession_(s, true); // giáo viên cần thấy ngay → ghi không điều tiết
    }
    return { violations: p.violations || 0, locked: !!p.locked };
  });
}

function normalizeSettings_(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var modes = ['classic_live', 'instructor_paced', 'homework'];
  var mode = String(raw.mode || 'classic_live');
  if (modes.indexOf(mode) < 0) throw userError_('Chế độ tổ chức không hợp lệ: "' + mode + '".');
  var bool = function (v, def) { return v === undefined || v === null ? def : !!v; };
  var s = {
    mode: mode,
    music: bool(raw.music, true),
    shuffle_questions: bool(raw.shuffle_questions, false),
    shuffle_options: bool(raw.shuffle_options, false),
    show_leaderboard: bool(raw.show_leaderboard, true),
    power_ups: bool(raw.power_ups, false),
    retry_rounds: mode === 'instructor_paced' ? 0 : clamp_(Math.floor(Number(raw.retry_rounds) || (raw.allow_retry ? 1 : 0)), 0, 20),
    navigation: raw.navigation === 'free' && mode !== 'instructor_paced' ? 'free' : 'sequential',
    require_all: bool(raw.require_all, false),
    auto_next: bool(raw.auto_next, true),
    leaderboard_top: [0, 3, 5, 10, 15].indexOf(Number(raw.leaderboard_top)) >= 0 ? Number(raw.leaderboard_top) : 10
  };
  var ac = raw.anti_cheat && typeof raw.anti_cheat === 'object' ? raw.anti_cheat : null;
  if (ac) {
    s.anti_cheat = {
      enabled: !!ac.enabled,
      block_right_click: bool(ac.block_right_click, true),
      block_copy: bool(ac.block_copy, true),
      detect_leave: bool(ac.detect_leave, true),
      require_fullscreen: bool(ac.require_fullscreen, false),
      max_violations: clamp_(Math.floor(Number(ac.max_violations) || 0), 0, 20)
    };
  }
  if (mode === 'homework') {
    if (raw.start_time) {
      if (!parseTime_(raw.start_time)) throw userError_('Thời gian bắt đầu không hợp lệ.');
      s.start_time = String(raw.start_time);
    }
    if (raw.deadline) {
      if (!parseTime_(raw.deadline)) throw userError_('Hạn nộp bài không hợp lệ.');
      s.deadline = String(raw.deadline);
    }
    if (s.start_time && s.deadline && parseTime_(s.deadline) <= parseTime_(s.start_time)) {
      throw userError_('Hạn nộp phải sau thời gian bắt đầu.');
    }
    if (s.deadline && parseTime_(s.deadline) <= Date.now()) {
      throw userError_('Hạn nộp bài đã qua, hãy chọn thời điểm trong tương lai.');
    }
  }
  return s;
}

function startSession_(s, now) {
  s.state = 'IN_PROGRESS';
  s.started_at = now;
  s.current_index = 0;
  s.question_opened_at = now;
  s.question_locked = false;
}

function completeSession_(s, now) {
  if (s.state === 'PAUSED' && s.paused_at) {
    s.paused_total_ms = (s.paused_total_ms || 0) + Math.max(0, now - s.paused_at);
    delete s.paused_at;
  }
  s.state = 'COMPLETED';
  s.ended_at = now;
}

/** Bài về nhà: tự mở khi tới start_time, tự kết thúc khi quá deadline. Trả về true nếu có thay đổi. */
function applyHomeworkRules_(s, now) {
  if (!homeworkNeedsUpdate_(s, now)) return false;
  var deadline = parseTime_(s.settings.deadline);
  if (deadline && now > deadline) {
    completeSession_(s, now);
  } else if (s.state === 'LOBBY_WAITING') {
    startSession_(s, now);
  }
  return true;
}

/** Kiểm tra (không thay đổi dữ liệu) xem bài về nhà có cần chuyển trạng thái không. */
function homeworkNeedsUpdate_(s, now) {
  if (!s || !s.settings || s.settings.mode !== 'homework' || s.state === 'COMPLETED') return false;
  var deadline = parseTime_(s.settings.deadline);
  if (deadline && now > deadline) return true;
  if (s.state === 'LOBBY_WAITING') {
    var start = parseTime_(s.settings.start_time);
    return !start || now >= start;
  }
  return false;
}

/** instructor_paced: khóa câu khi mọi học sinh (chưa bị mời ra) đã trả lời câu hiện tại. */
function autoLockIfAllAnswered_(s) {
  if (s.question_locked) return;
  var active = s.players.filter(function (p) { return !p.kicked; });
  if (!active.length) return;
  var answered = {};
  s.answers.forEach(function (a) { if (a.q_index === s.current_index) answered[a.player_id] = true; });
  var all = active.every(function (p) { return answered[p.player_id]; });
  if (all) s.question_locked = true;
}

function buildPollResult_(s, me, now) {
  var lobby = s.state === 'LOBBY_WAITING';
  // Giáo viên điều khiển, câu đang mở: chưa tính câu hiện tại vào điểm hiển thị (tránh lộ đúng/sai trước khi khóa)
  var hide = {};
  if (s.settings.mode === 'instructor_paced' && !s.question_locked && (s.state === 'IN_PROGRESS' || s.state === 'PAUSED')) {
    s.answers.forEach(function (a) {
      if (a.q_index === s.current_index && !a.pending) hide[a.player_id] = a;
    });
  }
  var players = s.players.filter(function (p) {
    if (p.kicked) return false;
    if (p.superseded && !(me && me.player_id === p.player_id)) return false; // đã có lần làm mới hơn
    if (lobby && now - (p.last_seen || 0) > LOBBY_HIDE_MS && !(me && me.player_id === p.player_id)) return false;
    return true;
  }).map(function (p) {
    var h = hide[p.player_id];
    return {
      player_id: p.player_id,
      name: p.name,
      class_name: p.class_name || '',
      avatar: p.avatar,
      score: round2_((p.score || 0) - (h ? h.score || 0 : 0)),
      correct: (p.correct || 0) - (h && h.correct ? 1 : 0),
      answered: p.answered || 0,
      finished: !!p.finished,
      current_index: p.current_index || 0,
      coins: round2_((p.coins || 0) - (h ? h.coins || 0 : 0)),
      joined_at: p.joined_at || 0,
      finished_at: p.finished_at || 0
    };
  });

  var r = {
    state: s.state,
    mode: s.settings.mode,
    current_index: s.current_index || 0,
    question_locked: !!s.question_locked,
    server_now: now,
    players: players
  };
  if (s.question_opened_at) r.question_opened_at = s.question_opened_at;
  if (s.started_at) r.started_at = s.started_at;
  if (s.paused_at) r.paused_at = s.paused_at;
  r.paused_total_ms = s.paused_total_ms || 0;
  if (me && me.kicked) r.kicked = true;
  if (me) {
    r.locked = !!me.locked;
    r.my_violations = me.violations || 0;
    r.my_pending = [];
    r.my_graded = {};
    s.answers.forEach(function (a) {
      if (a.player_id !== me.player_id) return;
      if (a.pending) r.my_pending.push(a.q_index);
      else if (a.answer && a.answer.kind === 'oral') r.my_graded[a.q_index] = !!a.correct;
    });
  }
  if (s.settings.mode === 'instructor_paced') r.question_stats = questionStats_(s, s.current_index || 0);
  return r;
}

/**
 * Thống kê đáp án câu đang mở:
 * - chuỗi/số (single_choice, true_false): đếm theo option_id;
 * - mảng giá trị đơn (multiple_select…): đếm từng phần tử;
 * - còn lại (fill_blank, matching…): đếm theo JSON của câu trả lời.
 */
function questionStats_(s, qIndex) {
  var stats = {};
  var add = function (k) { k = String(k); stats[k] = (stats[k] || 0) + 1; };
  s.answers.forEach(function (a) {
    if (a.q_index !== qIndex) return;
    var ans = a.answer;
    if (ans === null || ans === undefined) return;
    // Định dạng của giao diện Quickplay: { kind: 'choice', option_ids: [...] } → đếm từng phương án
    if (typeof ans === 'object' && ans.kind === 'choice' && Array.isArray(ans.option_ids)) {
      ans.option_ids.forEach(function (id) { add(id); });
      return;
    }
    if (typeof ans === 'object' && typeof ans.kind === 'string' && !Array.isArray(ans)) {
      add(ans.kind); // dạng khác: đếm theo loại câu trả lời
      return;
    }
    if (typeof ans === 'string' || typeof ans === 'number' || typeof ans === 'boolean') {
      add(ans);
    } else if (Array.isArray(ans) && ans.every(function (x) { return x === null || typeof x !== 'object'; })) {
      ans.forEach(function (x) { if (x !== null && x !== undefined) add(x); });
    } else {
      try { add(JSON.stringify(ans)); } catch (e) { /* bỏ qua */ }
    }
  });
  return stats;
}

function findPlayer_(s, pid) {
  if (!pid || !s || !Array.isArray(s.players)) return null;
  for (var i = 0; i < s.players.length; i++) {
    if (s.players[i].player_id === pid) return s.players[i];
  }
  return null;
}

function countActivePlayers_(s) {
  return (s.players || []).filter(function (p) { return !p.kicked; }).length;
}

// ============================================================================
// LƯU TRỮ PHIÊN: CACHE (NHANH) + DRIVE (BỀN VỮNG)
// ============================================================================

/**
 * Đọc phiên. Thứ tự: cache → tệp Drive sessions/<pin>.json.
 * Chỉ nạp lại cache khi đang giữ khóa (locked=true) để tránh ghi đè bản mới bằng bản cũ.
 */
function loadSession_(pin, locked) {
  var str = cacheGetBig_('S_' + pin);
  if (str) {
    try { return JSON.parse(str); } catch (e) { /* cache hỏng → đọc Drive */ }
  }
  var s = readJson_(folder_('sessions'), pin + '.json');
  if (!s) throw userError_('Không tìm thấy phòng với mã PIN ' + pin + '. Hãy kiểm tra lại mã.');
  if (!Array.isArray(s.players)) s.players = [];
  if (!Array.isArray(s.answers)) s.answers = [];
  if (locked) {
    cachePutBig_('S_' + pin, JSON.stringify(s));
    putPersistMeta_(pin, { t: Date.now(), d: 0, st: s.state });
  }
  return s;
}

/**
 * Ghi phiên (PHẢI gọi khi đang giữ khóa).
 * - Luôn ghi cache.
 * - Ghi Drive nếu: force, đổi trạng thái, cache không chứa nổi, hoặc đã ≥ 10 giây kể từ lần ghi trước.
 * - Nếu không ghi Drive, đánh dấu "bẩn" để lần thăm dò sau (hoặc trình kích hoạt dọn dẹp) ghi bù.
 */
function saveSession_(s, force) {
  var pin = s.pin;
  var str = JSON.stringify(s);
  var cachedOk = cachePutBig_('S_' + pin, str);
  var meta = getPersistMeta_(pin);
  var now = Date.now();
  var stateChanged = !meta || meta.st !== s.state;

  if (force || stateChanged || !cachedOk || now - (meta.t || 0) >= PERSIST_INTERVAL_MS) {
    writeText_(folder_('sessions'), pin + '.json', str);
    putPersistMeta_(pin, { t: now, d: 0, st: s.state });
    if (stateChanged) upsertSessionIndex_(s);
  } else {
    putPersistMeta_(pin, { t: meta.t, d: 1, st: s.state });
  }
}

/** Ghi bù xuống Drive nếu phiên có thay đổi chưa lưu và đã quá 10 giây (không chặn lâu). */
function flushIfDirty_(pin) {
  var meta = getPersistMeta_(pin);
  if (!meta || !meta.d || Date.now() - (meta.t || 0) < PERSIST_INTERVAL_MS) return;
  withLockTry_(function () {
    var m2 = getPersistMeta_(pin);
    if (!m2 || !m2.d) return null;
    var str = cacheGetBig_('S_' + pin);
    if (!str) return null;
    writeText_(folder_('sessions'), pin + '.json', str);
    putPersistMeta_(pin, { t: Date.now(), d: 0, st: m2.st });
    return null;
  }, 1500);
}

function getPersistMeta_(pin) {
  var raw = CacheService.getScriptCache().get('P_' + pin);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function putPersistMeta_(pin, meta) {
  CacheService.getScriptCache().put('P_' + pin, JSON.stringify(meta), CACHE_TTL_S);
}

function removeSessionCache_(pin) {
  cacheRemoveBig_('S_' + pin);
  cacheRemoveBig_('Q_' + pin);
  CacheService.getScriptCache().remove('P_' + pin);
}

// ---------- Chỉ mục phiên (sessions/_index.json) ----------

function readSessionIndex_() {
  var data;
  try { data = readJson_(folder_('sessions'), SESSION_INDEX_FILE); } catch (e) { data = null; }
  return Array.isArray(data) ? data : [];
}

/** Cập nhật mục của phiên trong chỉ mục (gọi khi đang giữ khóa). */
function upsertSessionIndex_(s) {
  var index = readSessionIndex_();
  var entry = {
    pin: s.pin,
    session_id: s.session_id,
    quiz_id: s.quiz_id,
    quiz_title: s.quiz_title,
    state: s.state,
    mode: s.settings.mode,
    created_at: s.created_at,
    player_count: countActivePlayers_(s)
  };
  if (s.ended_at) entry.ended_at = s.ended_at;
  var found = false;
  for (var i = 0; i < index.length; i++) {
    if (index[i].session_id === s.session_id) { index[i] = entry; found = true; break; }
  }
  if (!found) index.push(entry);
  writeJson_(folder_('sessions'), SESSION_INDEX_FILE, index);
}

/**
 * Sinh PIN 6 số không trùng phiên đang mở.
 * Ưu tiên PIN chưa từng dùng; trường hợp cực hiếm phải dùng lại PIN của phiên đã kết thúc
 * thì đổi tên tệp cũ thành <pin>_<session_id>.json để không mất kết quả.
 */
function generatePin_(index) {
  var used = {};
  index.forEach(function (e) { if (!e.archived_file) used[e.pin] = e; });
  var cache = CacheService.getScriptCache();
  var i, pin;
  for (i = 0; i < 300; i++) {
    pin = String(100000 + Math.floor(Math.random() * 900000));
    if (!used[pin] && !cache.get('S_' + pin) && !findFile_(folder_('sessions'), pin + '.json')) return pin;
  }
  for (i = 0; i < 300; i++) {
    pin = String(100000 + Math.floor(Math.random() * 900000));
    var e = used[pin];
    if (e && e.state === 'COMPLETED') {
      var archived = pin + '_' + e.session_id + '.json';
      var old = findFile_(folder_('sessions'), pin + '.json');
      if (old) old.setName(archived);
      removeSessionCache_(pin);
      e.archived_file = archived;
      writeJson_(folder_('sessions'), SESSION_INDEX_FILE, index);
      return pin;
    }
  }
  throw userError_('Không tạo được mã PIN mới, vui lòng thử lại.');
}

// ============================================================================
// DỌN DẸP ĐỊNH KỲ (chạy bằng trình kích hoạt theo thời gian)
// ============================================================================

/**
 * - Ghi bù xuống Drive các phiên còn thay đổi chưa lưu.
 * - Bài về nhà quá hạn → COMPLETED.
 * - Phiên trực tiếp bị bỏ quên > 12 giờ → COMPLETED.
 * - Phiên đã kết thúc > 1 giờ → xóa khỏi cache (GIỮ NGUYÊN tệp Drive).
 */
function cleanupOldSessions() {
  var index = readSessionIndex_();
  var cleaned = 0, flushed = 0, ended = 0;
  index.forEach(function (e) {
    if (e.archived_file) return;
    var pin = e.pin;
    try {
      withLock_(function () {
        var now = Date.now();
        var str = cacheGetBig_('S_' + pin);
        var s = null;
        if (str) {
          try { s = JSON.parse(str); } catch (err) { s = null; }
        }
        if (!s) {
          // Không còn trong cache: chỉ xử lý phiên chưa kết thúc trên Drive
          if (e.state === 'COMPLETED') return;
          s = readJson_(folder_('sessions'), pin + '.json');
          if (!s) return;
          var ch = applyHomeworkRules_(s, now);
          if (!ch && s.settings.mode !== 'homework' && s.state !== 'COMPLETED' && now - s.created_at > STALE_LIVE_SESSION_MS) {
            completeSession_(s, now);
            ch = true;
          }
          if (ch) {
            writeJson_(folder_('sessions'), pin + '.json', s);
            upsertSessionIndex_(s);
            ended++;
          }
          return;
        }

        var changed = applyHomeworkRules_(s, now);
        if (s.state !== 'COMPLETED' && s.settings.mode !== 'homework' && now - s.created_at > STALE_LIVE_SESSION_MS) {
          completeSession_(s, now);
          changed = true;
        }
        if (changed) ended++;

        if (s.state === 'COMPLETED' && now - (s.ended_at || now) > COMPLETED_CACHE_KEEP_MS) {
          writeJson_(folder_('sessions'), pin + '.json', s); // đảm bảo bản cuối nằm trên Drive
          if (changed || e.state !== 'COMPLETED') upsertSessionIndex_(s);
          removeSessionCache_(pin);
          cleaned++;
        } else if (changed) {
          saveSession_(s, true);
        } else {
          var meta = getPersistMeta_(pin);
          if (!meta || meta.d) {
            writeText_(folder_('sessions'), pin + '.json', str);
            putPersistMeta_(pin, { t: now, d: 0, st: s.state });
            flushed++;
          }
        }
      });
    } catch (err) {
      console.warn('cleanupOldSessions: lỗi với PIN ' + pin + ': ' + (err && err.message));
    }
  });
  Logger.log('Dọn dẹp xong: xóa cache ' + cleaned + ' phiên, ghi bù ' + flushed + ', kết thúc ' + ended + '.');
  return { cleaned: cleaned, flushed: flushed, ended: ended };
}

// ============================================================================
// AI — GEMINI
// ============================================================================

// ============================================================================
// NHẬP TỪ GOOGLE FORM — trả dữ liệu trung gian, src/lib/googleForm.ts chuyển thành câu hỏi
// ============================================================================
function actImportGoogleForm_(req) {
  var url = String(req.url || '').trim();
  if (!/^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)\S+$/i.test(url)) {
    throw userError_('Link Google Form không hợp lệ. Hãy dán link dạng https://docs.google.com/forms/d/…/edit hoặc https://forms.gle/…');
  }
  // 1) Form của chính thầy cô (link chỉnh sửa): đọc được cả đáp án đúng và điểm
  var form = null;
  try { form = FormApp.openByUrl(url); } catch (e) { form = null; }
  if (form) {
    var isQuiz = false;
    try { isQuiz = form.isQuiz(); } catch (e2) { isQuiz = false; }
    var T = FormApp.ItemType;
    var items = [];
    form.getItems().forEach(function (item) {
      var type = item.getType();
      var out = { title: String(item.getTitle() || '').trim(), help: String(item.getHelpText() || '').trim() || undefined };
      if (!out.title) return;
      var q = null;
      if (type === T.MULTIPLE_CHOICE) { q = item.asMultipleChoiceItem(); out.kind = 'choice'; }
      else if (type === T.LIST) { q = item.asListItem(); out.kind = 'choice'; }
      else if (type === T.CHECKBOX) { q = item.asCheckboxItem(); out.kind = 'checkbox'; }
      else if (type === T.TEXT) { q = item.asTextItem(); out.kind = 'text'; }
      else if (type === T.PARAGRAPH_TEXT) { q = item.asParagraphTextItem(); out.kind = 'paragraph'; }
      else return; // tiêu đề phần, ảnh, lưới, thang điểm… không chuyển được
      if (out.kind === 'choice' || out.kind === 'checkbox') {
        out.options = q.getChoices().map(function (c) {
          var correct = false;
          if (isQuiz) { try { correct = c.isCorrectAnswer(); } catch (e3) { correct = false; } }
          return { text: String(c.getValue() || '').trim(), correct: correct };
        });
      }
      if (isQuiz) { try { out.points = Number(q.getPoints()) || 0; } catch (e4) { /* không có điểm */ } }
      items.push(out);
    });
    if (!items.length) throw userError_('Form này không có câu hỏi dạng trắc nghiệm, hộp kiểm hoặc trả lời ngắn nào để nhập.');
    return { title: String(form.getTitle() || ''), source: 'editor', is_quiz: isQuiz, items: items };
  }

  // 2) Không có quyền chỉnh sửa: đọc trang công khai (không có đáp án đúng)
  var res;
  try {
    res = UrlFetchApp.fetch(url.replace(/\/edit(\?.*)?(#.*)?$/, '/viewform'), { muteHttpExceptions: true, followRedirects: true });
  } catch (e5) {
    throw userError_('Không mở được Google Form này. Hãy kiểm tra lại đường link.');
  }
  var html = res.getResponseCode() === 200 ? res.getContentText() : '';
  var m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
  if (!m) {
    throw userError_('Không đọc được Google Form này. Hãy dùng link chỉnh sửa (…/edit) của form do chính thầy cô tạo, hoặc mở form ở chế độ ai có link cũng xem được.');
  }
  return { title: '', source: 'public', raw: m[1] };
}

function actAiGenerate_(req) {
  var prompt = String(req.prompt || '');
  if (!prompt.trim()) throw userError_('Thiếu nội dung yêu cầu gửi cho AI (prompt).');
  if (prompt.length > 1000000) throw userError_('Nội dung gửi cho AI quá dài, hãy chia nhỏ tài liệu.');

  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  if (!key) {
    throw userError_('Chưa cấu hình GEMINI_API_KEY. Lấy khóa miễn phí tại aistudio.google.com rồi thêm vào ' +
      'Cài đặt dự án > Thuộc tính tập lệnh của Apps Script.');
  }
  var model = String(props.getProperty('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL).trim();
  if (!/^[A-Za-z0-9._\-]+$/.test(model)) throw userError_('Tên mô hình GEMINI_MODEL không hợp lệ: "' + model + '".');

  var body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  if (req.system) body.systemInstruction = { parts: [{ text: String(req.system) }] };

  // Khóa API gửi qua header x-goog-api-key (tương đương ?key=, nhưng không lộ khóa trong URL/nhật ký)
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
  var resp;
  try {
    resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': key },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  } catch (e) {
    throw userError_('Không kết nối được tới Gemini: ' + (e && e.message ? e.message : e));
  }

  var code = resp.getResponseCode();
  var text = resp.getContentText() || '';
  var data = null;
  try { data = JSON.parse(text); } catch (e) { data = null; }

  if (code !== 200) {
    var apiMsg = data && data.error && data.error.message ? data.error.message : text.slice(0, 300);
    var reason;
    if (code === 400) reason = 'Yêu cầu không hợp lệ hoặc GEMINI_API_KEY sai';
    else if (code === 401 || code === 403) reason = 'GEMINI_API_KEY không hợp lệ hoặc chưa được cấp quyền';
    else if (code === 404) reason = 'Không tìm thấy mô hình "' + model + '" (kiểm tra GEMINI_MODEL)';
    else if (code === 429) reason = 'Đã vượt hạn mức miễn phí của Gemini, hãy thử lại sau ít phút';
    else if (code >= 500) reason = 'Máy chủ Gemini đang lỗi hoặc quá tải, hãy thử lại sau';
    else reason = 'Gemini trả về lỗi';
    throw userError_(reason + ' (mã ' + code + '): ' + apiMsg);
  }
  if (!data) throw userError_('Phản hồi từ Gemini không đọc được.');
  if (data.promptFeedback && data.promptFeedback.blockReason) {
    throw userError_('Gemini từ chối xử lý nội dung này (lý do: ' + data.promptFeedback.blockReason + ').');
  }

  var candidates = Array.isArray(data.candidates) ? data.candidates : [];
  var out = candidates.map(function (c) {
    var parts = c && c.content && Array.isArray(c.content.parts) ? c.content.parts : [];
    return parts.map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; }).join('');
  }).filter(function (t) { return t; }).join('\n');

  var finish = candidates[0] && candidates[0].finishReason ? candidates[0].finishReason : '';
  if (!out) throw userError_('Gemini không trả về nội dung' + (finish ? ' (finishReason: ' + finish + ')' : '') + '.');
  return { text: out, model: model, finish_reason: finish };
}

// ============================================================================
// CACHE LỚN: chia khối khi vượt giới hạn 100KB/giá trị của CacheService
// ============================================================================
//  Giá trị ở khóa chính có tiền tố:
//   'J' + json            → dữ liệu nằm gọn trong 1 khóa
//   'C' + {"v":..,"n":..} → dữ liệu chia thành n khối: <khóa>~<v>~<i>
//   'D'                   → quá lớn cho cache, hãy đọc tệp Drive
//  Mỗi lần ghi dùng phiên bản (v) mới; ghi các khối trước rồi mới đổi khóa chính, nên
//  người đọc không bao giờ ghép nhầm khối của hai phiên bản khác nhau.

function cachePutBig_(key, str) {
  var cache = CacheService.getScriptCache();
  var prev = cache.get(key);
  var ok = true;
  if (str.length <= CHUNK_CHARS) {
    cache.put(key, 'J' + str, CACHE_TTL_S);
  } else {
    var parts = splitChunks_(str, CHUNK_CHARS);
    if (parts.length > MAX_CHUNKS) {
      cache.put(key, 'D', CACHE_TTL_S);
      ok = false;
    } else {
      var ver = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      var map = {};
      for (var i = 0; i < parts.length; i++) map[key + '~' + ver + '~' + i] = parts[i];
      cache.putAll(map, CACHE_TTL_S);
      cache.put(key, 'C' + JSON.stringify({ v: ver, n: parts.length }), CACHE_TTL_S);
    }
  }
  removeChunkKeys_(cache, key, prev);
  return ok;
}

function cacheGetBig_(key) {
  var cache = CacheService.getScriptCache();
  for (var attempt = 0; attempt < 3; attempt++) {
    var head = cache.get(key);
    if (!head) return null;
    var tag = head.charAt(0);
    if (tag === 'J') return head.substring(1);
    if (tag !== 'C') return null; // 'D' hoặc dữ liệu lạ → đọc Drive
    var meta;
    try { meta = JSON.parse(head.substring(1)); } catch (e) { return null; }
    var keys = chunkKeys_(key, meta);
    var got = cache.getAll(keys);
    var parts = [];
    var complete = true;
    for (var i = 0; i < keys.length; i++) {
      if (typeof got[keys[i]] !== 'string') { complete = false; break; }
      parts.push(got[keys[i]]);
    }
    if (complete) return parts.join('');
    // Khối vừa bị thay bởi phiên bản mới → đọc lại khóa chính
  }
  return null;
}

function cacheRemoveBig_(key) {
  var cache = CacheService.getScriptCache();
  var prev = cache.get(key);
  cache.remove(key);
  removeChunkKeys_(cache, key, prev);
}

function removeChunkKeys_(cache, key, head) {
  if (!head || head.charAt(0) !== 'C') return;
  try {
    var keys = chunkKeys_(key, JSON.parse(head.substring(1)));
    if (keys.length) cache.removeAll(keys);
  } catch (e) { /* bỏ qua */ }
}

function chunkKeys_(key, meta) {
  var keys = [];
  var n = Math.min(Number(meta && meta.n) || 0, MAX_CHUNKS);
  for (var i = 0; i < n; i++) keys.push(key + '~' + meta.v + '~' + i);
  return keys;
}

/** Cắt chuỗi thành khối, không cắt đôi cặp ký tự surrogate (emoji). */
function splitChunks_(str, size) {
  var parts = [];
  var i = 0;
  while (i < str.length) {
    var end = Math.min(i + size, str.length);
    if (end < str.length) {
      var c = str.charCodeAt(end - 1);
      if (c >= 0xD800 && c <= 0xDBFF) end--;
    }
    parts.push(str.substring(i, end));
    i = end;
  }
  return parts;
}

// ============================================================================
// DRIVE: THƯ MỤC & TỆP JSON
// ============================================================================

/** Lấy thư mục theo tên: 'root' | 'quizzes' | 'sessions' | 'media' (tự tạo nếu thiếu). */
function folder_(name) {
  if (MEMO_[name]) return MEMO_[name];
  var props = PropertiesService.getScriptProperties();
  var root = MEMO_.root;
  if (!root) {
    var rootId = props.getProperty('ROOT_FOLDER_ID') || PRESET_FOLDER_ID;
    if (rootId) {
      try {
        root = DriveApp.getFolderById(rootId);
        if (root.isTrashed()) root = null;
      } catch (e) {
        root = null;
      }
    }
    if (!root) {
      root = findOrCreateRootFolder_();
      props.setProperty('ROOT_FOLDER_ID', root.getId());
      SUBFOLDERS.forEach(function (n) { props.deleteProperty(n.toUpperCase() + '_FOLDER_ID'); });
    }
    MEMO_.root = root;
  }
  if (name === 'root') return root;

  var propKey = name.toUpperCase() + '_FOLDER_ID';
  var sub = null;
  var subId = props.getProperty(propKey);
  if (subId) {
    try {
      sub = DriveApp.getFolderById(subId);
      if (sub.isTrashed()) sub = null;
    } catch (e) {
      sub = null;
    }
  }
  if (!sub) {
    sub = getOrCreateSubfolder_(root, name);
    props.setProperty(propKey, sub.getId());
  }
  MEMO_[name] = sub;
  return sub;
}

function findOrCreateRootFolder_() {
  var it = DriveApp.getRootFolder().getFoldersByName(ROOT_FOLDER_NAME);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) return f;
  }
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

function getOrCreateSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) return f;
  }
  return parent.createFolder(name);
}

function findFile_(folder, name) {
  var it = folder.getFilesByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) return f;
  }
  return null;
}

/** Đọc tệp JSON; trả null nếu không có tệp. */
function readJson_(folder, name) {
  var f = findFile_(folder, name);
  if (!f) return null;
  var txt = f.getBlob().getDataAsString('UTF-8');
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw userError_('Tệp dữ liệu "' + name + '" trên Drive bị hỏng (không phải JSON hợp lệ).');
  }
}

function writeJson_(folder, name, obj) {
  writeText_(folder, name, JSON.stringify(obj));
}

/** Ghi đè nội dung nếu tệp đã có (setContent), ngược lại tạo tệp mới. */
function writeText_(folder, name, text) {
  var f = findFile_(folder, name);
  if (f) {
    f.setContent(text);
  } else {
    folder.createFile(name, text, 'application/json');
  }
}

// ============================================================================
// TỆP GỘP CỦA GIÁO VIÊN: một tệp .json duy nhất chứa toàn bộ dữ liệu
// Tên tệp: <tên đăng nhập>_<ngày>_<tháng>_<năm>_<giờ>h<phút>.json, nằm ở thư mục gốc.
// Mỗi lần lưu ghi tệp mới và chuyển các tệp gộp cũ của cùng tài khoản vào Thùng rác (khôi phục được trong 30 ngày).
// ============================================================================
var SNAPSHOT_MAX_CHARS = 40 * 1000 * 1000; // vượt mức này thì bỏ phần kết quả các buổi (vẫn còn trong thư mục sessions)

function snapshotOwner_(raw) {
  // giữ chữ, số và . _ - @ + ; ký tự khác (kể cả ký tự Windows không cho dùng trong tên tệp) thành gạch nối
  var s = String(raw || '').trim().replace(/[^0-9A-Za-z._@+-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'quickplay';
}

function readFolderJson_(folder, skip) {
  var out = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var name = f.getName();
    if (f.isTrashed() || !/\.json$/i.test(name) || name === skip) continue;
    try { out.push(JSON.parse(f.getBlob().getDataAsString('UTF-8'))); } catch (e) { /* bỏ qua tệp hỏng */ }
  }
  return out;
}

function actSaveSnapshot_(req) {
  var owner = snapshotOwner_(req.owner);
  var stamp = String(req.stamp || '');
  if (!/^\d{2}_\d{2}_\d{4}_\d{2}h\d{2}$/.test(stamp)) stamp = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', "dd_MM_yyyy_HH'h'mm");
  var root = folder_('root');
  var data = {
    app: APP_NAME, kind: 'backup', version: 1, owner: owner, server_version: APP_VERSION, exported_at: new Date().toISOString(),
    quizzes: readFolderJson_(folder_('quizzes'), QUIZ_INDEX_FILE),
    catalog: readJson_(root, CATALOG_FILE),
    classes: readClasses_(),
    sessions: readFolderJson_(folder_('sessions'), SESSION_INDEX_FILE).filter(function (s) { return s && s.session_id; }),
  };
  var text = JSON.stringify(data);
  if (text.length > SNAPSHOT_MAX_CHARS) {
    data.sessions = [];
    data.sessions_skipped = true;
    text = JSON.stringify(data);
  }
  var name = owner + '_' + stamp + '.json';
  return withLock_(function () {
    writeText_(root, name, text);
    // các tệp gộp cũ của cùng tài khoản → Thùng rác, để thư mục chỉ còn một tệp mới nhất
    var prefix = owner + '_';
    var it = root.getFiles();
    var removed = 0;
    while (it.hasNext()) {
      var f = it.next();
      var n = f.getName();
      if (n !== name && n.indexOf(prefix) === 0 && /_\d{2}_\d{2}_\d{4}_\d{2}h\d{2}\.json$/.test(n.slice(prefix.length - 1)) && !f.isTrashed()) {
        try { f.setTrashed(true); removed++; } catch (e) { /* bỏ qua */ }
      }
    }
    var file = findFile_(root, name);
    return {
      name: name, size: text.length, removed: removed, url: file ? file.getUrl() : '',
      counts: { quizzes: data.quizzes.length, classes: data.classes.length, sessions: data.sessions.length, sessions_skipped: !!data.sessions_skipped },
      content: req.with_content ? text : undefined,
    };
  });
}

// ============================================================================
// DUNG LƯỢNG DRIVE, SAO LƯU TOÀN BỘ VÀ KHÔI PHỤC (chuyển sang Google Drive mới)
// ============================================================================
// Lỗi bắt đầu bằng DRIVE_FULL: → phần mềm hiện cảnh báo "Drive đã đầy" kèm nút tải tệp sao lưu.
var DRIVE_FULL_MSG = 'DRIVE_FULL: Google Drive của thầy cô đã đầy, không còn chỗ để lưu dữ liệu. Hãy tải tệp sao lưu toàn bộ về máy tính (Cài đặt → Sao lưu và khôi phục), rồi chuyển sang một Google Drive còn trống.';
var MEDIA_EXPORT_BUDGET = 12 * 1024 * 1024; // mỗi lần gửi về tối đa ~12 MB tệp gốc (base64 ~16 MB)
var MEDIA_EXPORT_MAX_FILE = 30 * 1024 * 1024;
var SESSION_EXPORT_PAGE = 40;

function isDriveFull_(msg) {
  return /storage ?quota|storageQuotaExceeded|quota (has been )?exceeded for (this )?user|out of (storage|space)|insufficient storage|không đủ dung lượng|hết dung lượng|dung lượng lưu trữ (đã )?(đầy|hết)/i.test(String(msg));
}

/** Dung lượng Google Drive của tài khoản đang chạy Apps Script (byte). limit = 0 nghĩa là không giới hạn. */
function actDriveQuota_() {
  return { used: DriveApp.getStorageUsed(), limit: DriveApp.getStorageLimit() };
}

/** Gửi về nội dung các tệp ảnh/âm thanh (theo mã tệp Drive) để đóng gói vào tệp sao lưu. */
function actExportMedia_(req) {
  var ids = Array.isArray(req.ids) ? req.ids.slice(0, 60) : [];
  var out = [];
  var budget = 0;
  ids.forEach(function (raw) {
    var id = String(raw || '');
    if (!/^[\w-]{10,}$/.test(id)) return;
    if (budget >= MEDIA_EXPORT_BUDGET) { out.push({ id: id, later: true }); return; }
    try {
      var f = DriveApp.getFileById(id);
      var size = f.getSize();
      if (size > MEDIA_EXPORT_MAX_FILE) { out.push({ id: id, skipped: 'too_big', size: size }); return; }
      if (budget > 0 && budget + size > MEDIA_EXPORT_BUDGET) { out.push({ id: id, later: true }); return; }
      var blob = f.getBlob();
      budget += size;
      out.push({ id: id, mime: blob.getContentType(), name: f.getName(), size: size, base64: Utilities.base64Encode(blob.getBytes()) });
    } catch (e) {
      out.push({ id: id, missing: true });
    }
  });
  return out;
}

/** Gửi về đầy đủ các bộ câu hỏi, từng trang 40 bộ (chỉ đọc: vẫn chạy khi Drive đã đầy). */
function actExportQuizzes_(req) {
  var page = Math.max(0, Math.floor(Number(req.page) || 0));
  var files = [];
  var it = folder_('quizzes').getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var n = f.getName();
    if (f.isTrashed() || n === QUIZ_INDEX_FILE || !/\.json$/i.test(n)) continue;
    files.push(f);
  }
  files.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  var items = [];
  files.slice(page * SESSION_EXPORT_PAGE, (page + 1) * SESSION_EXPORT_PAGE).forEach(function (f) {
    try {
      var q = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
      if (q && q.id && Array.isArray(q.questions)) items.push(q);
    } catch (e) { /* bỏ qua tệp hỏng */ }
  });
  return { total: files.length, page: page, page_size: SESSION_EXPORT_PAGE, items: items };
}

/** Gửi về các tệp kết quả buổi học (thư mục sessions), từng trang 40 tệp. */
function actExportSessions_(req) {
  var page = Math.max(0, Math.floor(Number(req.page) || 0));
  var files = [];
  var it = folder_('sessions').getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var n = f.getName();
    if (f.isTrashed() || n === SESSION_INDEX_FILE || !/\.json$/i.test(n)) continue;
    files.push(f);
  }
  files.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  var items = [];
  files.slice(page * SESSION_EXPORT_PAGE, (page + 1) * SESSION_EXPORT_PAGE).forEach(function (f) {
    try { items.push({ name: f.getName(), data: JSON.parse(f.getBlob().getDataAsString('UTF-8')) }); } catch (e) { /* bỏ qua tệp hỏng */ }
  });
  return { total: files.length, page: page, page_size: SESSION_EXPORT_PAGE, items: items };
}

/** Mục chỉ mục của một phiên (dùng chung với upsertSessionIndex_). */
function sessionIndexEntry_(s, fileName) {
  var entry = {
    pin: s.pin, session_id: s.session_id, quiz_id: s.quiz_id, quiz_title: s.quiz_title, state: s.state,
    mode: s.settings && s.settings.mode, created_at: s.created_at, player_count: Array.isArray(s.players) ? countActivePlayers_(s) : 0
  };
  if (s.ended_at) entry.ended_at = s.ended_at;
  if (fileName && fileName !== s.pin + '.json') entry.archived_file = fileName;
  return entry;
}

/**
 * Khôi phục từ tệp sao lưu (gửi lên từng phần): bộ câu hỏi và tệp kết quả buổi học.
 * Bộ câu hỏi trùng mã được ghi đè. Tệp phiên trùng tên nhưng là buổi KHÁC thì bỏ qua (không xóa kết quả đang có).
 */
function actRestoreData_(req) {
  return withLock_(function () {
    var r = { quizzes: 0, sessions: 0, files: 0, skipped: 0 };
    var qs = Array.isArray(req.quizzes) ? req.quizzes : [];
    if (qs.length) {
      var qf = folder_('quizzes');
      qs.forEach(function (q) {
        if (!q || typeof q !== 'object' || !Array.isArray(q.questions) || !/^[\w-]{1,80}$/.test(String(q.id || ''))) { r.skipped++; return; }
        q.visibility = q.visibility === 'public' ? 'public' : 'private';
        if (!q.updated_at) q.updated_at = new Date().toISOString(); // giữ ngày cập nhật trong tệp sao lưu nếu có
        if (!q.created_at) q.created_at = q.updated_at;
        writeJson_(qf, q.id + '.json', q);
        r.quizzes++;
      });
    }
    if (req.rebuild_index) rebuildQuizIndex_();
    var files = Array.isArray(req.session_files) ? req.session_files : [];
    if (files.length) {
      var sf = folder_('sessions');
      var index = readSessionIndex_();
      var changed = false;
      files.forEach(function (it) {
        var name = String(it && it.name || '');
        var d = it && it.data;
        if (!/^[\w.-]{1,100}\.json$/i.test(name) || name === SESSION_INDEX_FILE || !d || typeof d !== 'object') { r.skipped++; return; }
        var old = findFile_(sf, name);
        if (old && d.session_id) {
          try {
            var cur = JSON.parse(old.getBlob().getDataAsString('UTF-8'));
            if (cur && cur.session_id && cur.session_id !== d.session_id) { r.skipped++; return; }
          } catch (e) { /* tệp cũ hỏng: ghi đè */ }
        }
        writeText_(sf, name, JSON.stringify(d));
        r.files++;
        if (d.session_id && d.pin) {
          var entry = sessionIndexEntry_(d, name);
          var found = false;
          for (var i = 0; i < index.length; i++) {
            if (index[i].session_id === d.session_id) { index[i] = entry; found = true; break; }
          }
          if (!found) index.push(entry);
          changed = true;
          r.sessions++;
        }
      });
      if (changed) writeJson_(sf, SESSION_INDEX_FILE, index);
    }
    return r;
  });
}

/**
 * Sau khi nén lại ảnh/âm thanh: thay link cũ bằng link mới trong các tệp kết quả buổi học (đề thẻ giấy, ảnh chụp đề),
 * rồi chuyển tệp gốc vào Thùng rác (khôi phục được trong 30 ngày).
 * map: { "<mã tệp cũ>": "<link mới>" }
 */
function actSwapMedia_(req) {
  var map = req.map && typeof req.map === 'object' ? req.map : {};
  var ids = Object.keys(map).filter(function (id) { return /^[\w-]{10,}$/.test(id) && typeof map[id] === 'string'; });
  var r = { rewritten: 0, trashed: 0 };
  if (!ids.length) return r;
  withLock_(function () {
    var it = folder_('sessions').getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (f.isTrashed() || !/\.json$/i.test(f.getName())) continue;
      var text = f.getBlob().getDataAsString('UTF-8');
      var next = text;
      ids.forEach(function (id) {
        if (next.indexOf(id) < 0) return;
        next = next.split('https://lh3.googleusercontent.com/d/' + id).join(map[id])
          .split('https://drive.google.com/uc?export=download&id=' + id).join(map[id])
          .split('https://drive.google.com/uc?export=download\\u0026id=' + id).join(map[id]);
      });
      if (next !== text) { f.setContent(next); r.rewritten++; }
    }
    return null;
  });
  if (req.trash) {
    ids.forEach(function (id) {
      try { DriveApp.getFileById(id).setTrashed(true); r.trashed++; } catch (e) { /* tệp không còn hoặc không phải của mình */ }
    });
  }
  return r;
}

// ============================================================================
// TỰ CẬP NHẬT: Apps Script tự thay mã của chính nó bằng bản mới do Quickplay phát hành
// ============================================================================
// Cách chạy: phần mềm thấy Apps Script cũ hơn bản cần → gửi selfUpdate (kèm khóa giáo viên) →
//   1. tải latest.json, Code.gs, appsscript.json từ UPDATE_BASE (địa chỉ cố định của Quickplay);
//   2. kiểm tra mã băm SHA-256, tên ứng dụng và số phiên bản;
//   3. dùng Apps Script API (quyền của chính chủ dự án) ghi đè mã, tạo phiên bản mới,
//      chuyển bản triển khai đang dùng sang phiên bản đó → link /exec giữ nguyên, dữ liệu và khóa giữ nguyên.
// Điều kiện (làm một lần): tệp appsscript.json có quyền script.projects và script.deployments,
// và chủ dự án đã bật "Google Apps Script API" tại https://script.google.com/home/usersettings
// Bản mới cần thêm quyền Google mới thì KHÔNG tự cập nhật (Google bắt chủ dự án tự cấp quyền): phần mềm báo cập nhật tay.
var SCRIPT_API = 'https://script.googleapis.com/v1/projects/';

function updateBase_() {
  var b = PropertiesService.getScriptProperties().getProperty('UPDATE_BASE') || UPDATE_BASE_DEFAULT;
  return b.charAt(b.length - 1) === '/' ? b : b + '/';
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function versionCmp_(a, b) {
  var x = String(a).split('.'), y = String(b).split('.');
  for (var i = 0; i < Math.max(x.length, y.length); i++) {
    var d = (Number(x[i]) || 0) - (Number(y[i]) || 0);
    if (d) return d;
  }
  return 0;
}

/** Gọi Apps Script API bằng quyền của chủ dự án. Lỗi được đổi thành thông báo có mã để phần mềm hướng dẫn. */
function scriptApi_(method, path, body) {
  var res = UrlFetchApp.fetch(SCRIPT_API + ScriptApp.getScriptId() + path, {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: body ? JSON.stringify(body) : undefined
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code >= 200 && code < 300) return text ? JSON.parse(text) : {};
  if (/has not been used|is disabled|has not enabled|SERVICE_DISABLED|User has not enabled the Apps Script API/i.test(text)) {
    throw userError_('API_OFF: Chưa bật Google Apps Script API. Mở https://script.google.com/home/usersettings bằng Gmail đang chạy Apps Script này và bật "Google Apps Script API", rồi bấm Kiểm tra lại.');
  }
  if (code === 403 || /insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT|PERMISSION_DENIED/i.test(text)) {
    throw userError_('SCOPES: Apps Script chưa có quyền tự cập nhật. Hãy cập nhật tay một lần bằng Trình cài đặt (dán cả mã và tệp cấu hình appsscript.json), sau đó các bản mới sẽ tự cập nhật.');
  }
  throw userError_('Apps Script API báo lỗi ' + code + ': ' + text.slice(0, 200));
}

/** Kiểm tra đã đủ điều kiện tự cập nhật chưa (bật API, có quyền). */
function actUpdateCheck_() {
  var content = scriptApi_('get', '/content');
  var dep = scriptApi_('get', '/deployments');
  return { ready: true, files: (content.files || []).length, deployments: (dep.deployments || []).length, version: APP_VERSION };
}

/** Có buổi học trực tiếp đang diễn ra không (bài tập về nhà không tính: cập nhật không ảnh hưởng). */
function hasLiveSession_() {
  var now = Date.now();
  return readSessionIndex_().some(function (e) {
    return e && e.state !== 'COMPLETED' && e.mode !== 'homework' && now - (e.created_at || 0) < STALE_LIVE_SESSION_MS;
  });
}

function actSelfUpdate_(req) {
  if (!req.force && hasLiveSession_()) {
    throw userError_('BUSY: Đang có buổi học trực tiếp, để buổi học xong rồi Apps Script mới tự cập nhật.');
  }
  var base = updateBase_();
  var get = function (name) {
    var r = UrlFetchApp.fetch(base + name + '?t=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) throw userError_('Không tải được ' + name + ' từ ' + base + ' (mã ' + r.getResponseCode() + ').');
    return r.getContentText('UTF-8');
  };
  var latest = JSON.parse(get('latest.json'));
  if (!latest || !latest.version) throw userError_('Tệp phát hành latest.json không hợp lệ.');
  if (versionCmp_(latest.version, APP_VERSION) <= 0) return { updated: false, from: APP_VERSION, to: APP_VERSION };
  var code = get('Code.gs');
  var manifest = get('appsscript.json');
  if (sha256Hex_(code) !== latest.code_sha256 || sha256Hex_(manifest) !== latest.manifest_sha256) {
    throw userError_('Mã tải về không khớp mã băm phát hành, đã dừng cập nhật để an toàn. Thử lại sau ít phút.');
  }
  var m = code.match(/var APP_NAME = '([^']+)';[\s\S]*?var APP_VERSION = '([\d.]+)';/);
  if (!m || m[1] !== APP_NAME || m[2] !== latest.version) throw userError_('Mã tải về không phải mã Apps Script giáo viên của Quickplay.');

  // quyền Google của bản mới phải nằm trong quyền đã cấp; thêm quyền mới thì chủ dự án phải tự cấp → cập nhật tay
  var current = scriptApi_('get', '/content');
  var curManifest = null;
  (current.files || []).forEach(function (f) { if (f.name === 'appsscript') curManifest = JSON.parse(f.source); });
  var have = (curManifest && curManifest.oauthScopes) || [];
  var want = JSON.parse(manifest).oauthScopes || [];
  var missing = want.filter(function (s) { return have.indexOf(s) < 0; });
  if (missing.length) {
    throw userError_('MANUAL: Bản ' + latest.version + ' cần thêm quyền Google (' + missing.join(', ') + '). Hãy cập nhật tay một lần bằng Trình cài đặt → Cập nhật bản mới.');
  }

  // giữ lại khóa giáo viên và thư mục đang dùng (mã mới không điền sẵn)
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TEACHER_KEY') && PRESET_TEACHER_KEY) props.setProperty('TEACHER_KEY', PRESET_TEACHER_KEY);
  if (!props.getProperty('ROOT_FOLDER_ID')) props.setProperty('ROOT_FOLDER_ID', folder_('root').getId());

  // bản triển khai cần chuyển: đúng link /exec phần mềm đang dùng (hoặc mọi bản triển khai ứng dụng web nếu không rõ)
  var deps = (scriptApi_('get', '/deployments').deployments || []).filter(function (d) {
    return (d.entryPoints || []).some(function (p) { return p.entryPointType === 'WEB_APP'; });
  });
  var execId = (String(req.exec_url || '').match(/\/macros\/s\/([\w-]+)\/exec/) || [])[1];
  var targets = execId ? deps.filter(function (d) { return d.deploymentId === execId; }) : deps;
  if (!targets.length) throw userError_('Không tìm thấy bản triển khai ứng dụng web của link đang dùng.');

  scriptApi_('put', '/content', { files: [
    { name: 'appsscript', type: 'JSON', source: manifest },
    { name: 'Code', type: 'SERVER_JS', source: code }
  ] });
  var ver = scriptApi_('post', '/versions', { description: 'Quickplay ' + latest.version + ' (tự cập nhật)' });
  targets.forEach(function (d) {
    scriptApi_('put', '/deployments/' + d.deploymentId, { deploymentConfig: {
      scriptId: ScriptApp.getScriptId(), versionNumber: ver.versionNumber, manifestFileName: 'appsscript',
      description: 'Quickplay ' + latest.version
    } });
  });
  props.setProperty('LAST_SELF_UPDATE', JSON.stringify({ from: APP_VERSION, to: latest.version, at: new Date().toISOString() }));
  return { updated: true, from: APP_VERSION, to: latest.version, version_number: ver.versionNumber, deployments: targets.length };
}

// ============================================================================
// TIỆN ÍCH CHUNG
// ============================================================================

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Lỗi có thông báo thân thiện, hiển thị nguyên văn cho người dùng. */
function userError_(msg) {
  var e = new Error(msg);
  e.userFacing = true;
  return e;
}

function toMessage_(err) {
  if (err && err.userFacing) return err.message;
  var msg = err && err.message ? String(err.message) : String(err);
  if (isDriveFull_(msg)) return DRIVE_FULL_MSG;
  if (/Service invoked too many times|quota|Quá nhiều/i.test(msg)) {
    return 'Đã vượt hạn mức dịch vụ của Google trong ngày. Vui lòng thử lại sau.';
  }
  if (/Lock timeout|lock/i.test(msg) && /timeout|time out/i.test(msg)) {
    return 'Máy chủ đang bận (nhiều người gửi cùng lúc). Vui lòng thử lại sau vài giây.';
  }
  return 'Lỗi máy chủ: ' + msg;
}

function logRequest_(action, started, ok, err) {
  try {
    var entry = { action: action, ok: ok, ms: Date.now() - started };
    if (!ok && err) entry.error = err.message;
    if (ok) console.log(JSON.stringify(entry)); else console.warn(JSON.stringify(entry));
  } catch (e) { /* bỏ qua */ }
}

/** Chạy hàm trong khóa toàn script; báo lỗi thân thiện nếu chờ quá 10 giây. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);
  } catch (e) {
    throw userError_('Máy chủ đang bận (nhiều người gửi cùng lúc). Vui lòng thử lại sau vài giây.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Như withLock_ nhưng không báo lỗi: trả null nếu không lấy được khóa trong ms. */
function withLockTry_(fn, ms) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(ms)) return null;
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Kiểm tra khóa giáo viên (so sánh thời gian gần như hằng số). */
function requireTeacher_(key) {
  var props = PropertiesService.getScriptProperties();
  var expected = props.getProperty('TEACHER_KEY');
  if (!expected && PRESET_TEACHER_KEY) {
    // Lần đầu dùng mã do trình cài đặt điền sẵn: ghi nhớ khóa để lần cập nhật mã sau (không điền sẵn) vẫn giữ nguyên khóa
    expected = PRESET_TEACHER_KEY;
    props.setProperty('TEACHER_KEY', expected);
  }
  if (!expected) {
    throw userError_('Máy chủ chưa có khóa giáo viên. Hãy cài lại bằng Trình cài đặt trong phần mềm, hoặc chạy hàm setup() trong trình soạn thảo Apps Script.');
  }
  if (!safeEqual_(String(key || ''), String(expected))) {
    throw userError_('Khóa giáo viên không đúng.');
  }
}

function safeEqual_(a, b) {
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function normalizePin_(pin) {
  var p = String(pin === undefined || pin === null ? '' : pin).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(p)) throw userError_('Mã PIN phải gồm đúng 6 chữ số.');
  return p;
}

function requireId_(id, label) {
  var s = String(id === undefined || id === null ? '' : id).trim();
  if (!s) throw userError_('Thiếu ' + label.toLowerCase() + '.');
  if (!/^[A-Za-z0-9_\-]{1,64}$/.test(s)) throw userError_(label + ' không hợp lệ.');
  return s;
}

function newId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 20);
}

function randomKey_(len) {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + ':' + Date.now() + ':' + Math.random());
  var out = '';
  for (var i = 0; i < len; i++) out += alphabet.charAt(((bytes[i % bytes.length] + 256) % 256) % alphabet.length);
  return out;
}

function parseTime_(v) {
  if (v === undefined || v === null || v === '') return 0;
  var t = typeof v === 'number' ? v : Date.parse(String(v));
  return isFinite(t) ? t : 0;
}

function formatTime_(ms) {
  return Utilities.formatDate(new Date(ms), 'Asia/Ho_Chi_Minh', 'HH:mm dd/MM/yyyy');
}

/** Làm tròn 2 chữ số thập phân (điểm có thể lẻ khi chia đều tổng điểm cả bài). */
function round2_(n) {
  return Math.round(n * 100) / 100;
}

function clamp_(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
