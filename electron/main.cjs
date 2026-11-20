'use strict';
/**
 * Quickplay – tiến trình chính (main process) của bản cài đặt Windows.
 *
 * Nguyên tắc bảo mật:
 *  - Renderer là nội dung web không tin cậy: contextIsolation, sandbox, không nodeIntegration.
 *  - Cửa sổ chính chỉ được hiển thị trang của ứng dụng (dist/index.html hoặc dev server).
 *    Mọi liên kết http(s) khác mở bằng trình duyệt hệ thống.
 *  - Chỉ cấp quyền micro (media/audio) và clipboard cho chính trang ứng dụng; từ chối mọi quyền khác.
 *  - Cầu nối duy nhất: preload.cjs -> window.quizziDesktop = { isDesktop, version }.
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, ipcMain, session, shell, dialog } = require('electron');

const APP_TITLE = 'Quickplay';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');
const DIST_URL_PREFIX = pathToFileURL(DIST_DIR + path.sep).href; // file:///.../dist/

// Chỉ dùng dev server khi chạy chưa đóng gói, tránh việc biến môi trường điều hướng bản cài đặt.
const DEV_SERVER_URL = !app.isPackaged && process.env.VITE_DEV_SERVER_URL
  ? process.env.VITE_DEV_SERVER_URL
  : null;
const DEV_ORIGIN = DEV_SERVER_URL ? safeOrigin(DEV_SERVER_URL) : null;

// Quyền được phép (chỉ cho trang của ứng dụng, không cho iframe bên thứ ba).
const ALLOWED_PERMISSIONS = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write']);

/** @type {BrowserWindow | null} */
let mainWindow = null;

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** URL có thuộc về chính ứng dụng (trang được phép chạy trong cửa sổ chính) không. */
function isAppUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  if (DEV_ORIGIN) return safeOrigin(url) === DEV_ORIGIN;
  // file:// – chỉ chấp nhận tệp nằm trong thư mục dist đã đóng gói.
  return url.startsWith(DIST_URL_PREFIX) || url === pathToFileURL(INDEX_HTML).href;
}

function isHttpUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

function openExternalSafely(url) {
  // Chỉ mở http(s) và mailto ra ngoài; không bao giờ chuyển file:, javascript:, ms-*… cho hệ điều hành.
  let protocol;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return;
  }
  if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:') {
    shell.openExternal(url).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Một phiên bản duy nhất
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('vn.edu.quizzi');
    configureSession(session.defaultSession);
    registerIpc();
    Menu.setApplicationMenu(buildMenu());
    createMainWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

// ---------------------------------------------------------------------------
// Phiên (session): quyền + header cho video nhúng
// ---------------------------------------------------------------------------
function configureSession(ses) {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = (details && details.requestingUrl) || webContents.getURL();
    if (!ALLOWED_PERMISSIONS.has(permission) || !isAppUrl(requestingUrl)) {
      return callback(false);
    }
    if (permission === 'media') {
      // Chỉ micro. Không cho camera / chia sẻ màn hình.
      const types = (details && details.mediaTypes) || [];
      const audioOnly = types.length > 0 && types.every((t) => t === 'audio');
      return callback(audioOnly);
    }
    return callback(true);
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (!ALLOWED_PERMISSIONS.has(permission)) return false;
    if (permission === 'media' && details && details.mediaType && details.mediaType !== 'audio') {
      return false;
    }
    if (details && details.requestingUrl) return isAppUrl(details.requestingUrl);
    // Không có requestingUrl: trang trên cùng phải là ứng dụng và origin yêu cầu phải trùng nó.
    const topUrl = webContents ? webContents.getURL() : '';
    if (!isAppUrl(topUrl)) return false;
    const origin = requestingOrigin || '';
    return DEV_ORIGIN ? origin === DEV_ORIGIN : origin.startsWith('file://') || origin === 'null';
  });

  // Không bao giờ cho phép thiết bị USB/HID/Serial.
  ses.setDevicePermissionHandler(() => false);

  // YouTube từ chối trình phát nhúng khi trang gốc là file:// (không có Referer) – lỗi 153.
  // Gắn Referer hợp lệ cho các yêu cầu trình phát nhúng.
  ses.webRequest.onBeforeSendHeaders(
    {
      urls: [
        'https://www.youtube.com/embed/*',
        'https://youtube.com/embed/*',
        'https://www.youtube-nocookie.com/embed/*',
        'https://player.vimeo.com/video/*',
      ],
    },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      if (!headers.Referer && !headers.referer) {
        headers.Referer = 'https://quizzi.app/';
      }
      callback({ requestHeaders: headers });
    },
  );
}

// ---------------------------------------------------------------------------
// IPC: chỉ một kênh, chỉ đọc
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.on('quizzi:get-version', (event) => {
    const frameUrl = event.senderFrame ? event.senderFrame.url : '';
    event.returnValue = isAppUrl(frameUrl) ? app.getVersion() : null;
  });
}

// ---------------------------------------------------------------------------
// Cửa sổ chính
// ---------------------------------------------------------------------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#FFFFFF',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false, // tránh tải từ điển từ máy chủ Google
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Giữ tiêu đề cố định "Quickplay" thay vì <title> của trang.
  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const wc = mainWindow.webContents;

  wc.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      title: APP_TITLE,
      message: 'Quickplay gặp sự cố và cần tải lại.',
      buttons: ['Tải lại', 'Đóng'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) loadApp(mainWindow);
    else mainWindow.close();
  });

  wc.on('context-menu', (_event, params) => {
    const template = [];
    if (params.isEditable) {
      template.push(
        { role: 'undo', label: 'Hoàn tác' },
        { role: 'redo', label: 'Làm lại' },
        { type: 'separator' },
        { role: 'cut', label: 'Cắt' },
        { role: 'copy', label: 'Sao chép' },
        { role: 'paste', label: 'Dán' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Chọn tất cả' },
      );
    } else if (params.selectionText && params.selectionText.trim()) {
      template.push({ role: 'copy', label: 'Sao chép' });
    }
    if (template.length) Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });

  loadApp(mainWindow);
}

function loadApp(win) {
  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(INDEX_HTML);
  }
}

// Áp dụng cho MỌI webContents (cửa sổ, iframe đều thuộc webContents của cửa sổ).
app.on('web-contents-created', (_event, contents) => {
  // Không cho tạo <webview>.
  contents.on('will-attach-webview', (event) => event.preventDefault());

  // target=_blank / window.open: không mở cửa sổ Electron mới; liên kết ngoài -> trình duyệt hệ thống.
  contents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url)) openExternalSafely(url);
    return { action: 'deny' };
  });

  // Khung chính không được rời khỏi trang ứng dụng.
  contents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternalSafely(url);
  });
  contents.on('will-redirect', (event, url) => {
    if (event.isMainFrame === false) return;
    if (!isAppUrl(url)) event.preventDefault();
  });

  // Iframe (YouTube/Vimeo, trình xem Drive…): được hiển thị trong trang nhưng không có preload,
  // không được cấp quyền (xem setPermission*Handler). Chặn iframe trỏ tới file:// ngoài dist
  // hoặc các giao thức lạ.
  contents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) return;
    const url = event.url;
    if (isAppUrl(url) || isHttpUrl(url) || /^(about:|blob:|data:)/.test(url)) return;
    event.preventDefault();
  });
});

// ---------------------------------------------------------------------------
// Menu tối giản tiếng Việt (ẩn, nhấn Alt để hiện)
// ---------------------------------------------------------------------------
function buildMenu() {
  const viewSubmenu = [
    { role: 'reload', label: 'Tải lại' },
    { type: 'separator' },
    { role: 'resetZoom', label: 'Cỡ chữ mặc định' },
    { role: 'zoomIn', label: 'Phóng to' },
    { role: 'zoomOut', label: 'Thu nhỏ' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: 'Toàn màn hình' },
  ];
  if (!app.isPackaged) {
    viewSubmenu.push({ type: 'separator' }, { role: 'toggleDevTools', label: 'Công cụ nhà phát triển' });
  }

  return Menu.buildFromTemplate([
    {
      label: 'Tệp',
      submenu: [{ role: 'quit', label: 'Thoát' }],
    },
    {
      label: 'Chỉnh sửa',
      submenu: [
        { role: 'undo', label: 'Hoàn tác' },
        { role: 'redo', label: 'Làm lại' },
        { type: 'separator' },
        { role: 'cut', label: 'Cắt' },
        { role: 'copy', label: 'Sao chép' },
        { role: 'paste', label: 'Dán' },
        { role: 'selectAll', label: 'Chọn tất cả' },
      ],
    },
    { label: 'Hiển thị', submenu: viewSubmenu },
    {
      label: 'Trợ giúp',
      submenu: [
        {
          label: 'Giới thiệu Quickplay',
          click: () => {
            dialog.showMessageBox(mainWindow ?? undefined, {
              type: 'info',
              title: APP_TITLE,
              message: `Quickplay ${app.getVersion()}`,
              detail: 'Phần mềm kiểm tra đánh giá tương tác cho giáo viên.\nDữ liệu lưu trên Google Drive của bạn.',
            });
          },
        },
      ],
    },
  ]);
}
