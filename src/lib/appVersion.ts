// Phiên bản phần mềm và thời điểm cập nhật (thời điểm build) — hiện ở chân trang.
export const APP_VERSION = '1.1.2';
export const APP_BUILD_TIME: string = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : new Date().toISOString();

/** "Phiên bản cập nhật V1.1.2 · cập nhật lúc 13:31, ngày 20/11/2026" */
export function versionLine(): string {
  const d = new Date(APP_BUILD_TIME);
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `Phiên bản cập nhật V${APP_VERSION} · cập nhật lúc ${time}, ngày ${date}`;
}
