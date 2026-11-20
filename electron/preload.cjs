'use strict';
/**
 * Preload (sandbox): toàn bộ API mà trang web của Quickplay nhìn thấy từ bản desktop.
 * Không lộ ipcRenderer, không lộ Node. Chỉ thông tin đọc.
 *
 * Lưu ý: Web Speech API (webkitSpeechRecognition) KHÔNG hoạt động trong Electron
 * (không có khóa Google API) – trang web tự phát hiện và hiển thị thông báo.
 */
const { contextBridge, ipcRenderer } = require('electron');

let version = null;
try {
  version = ipcRenderer.sendSync('quizzi:get-version');
} catch {
  version = null;
}

contextBridge.exposeInMainWorld(
  'quizziDesktop',
  Object.freeze({
    isDesktop: true,
    version: typeof version === 'string' ? version : '',
  }),
);
