// Nhận biết trình duyệt nhúng trong ứng dụng (Zalo, Facebook, Messenger, Instagram, TikTok, LINE, WeChat…).
// Các trình duyệt này thường KHÔNG tải được tệp bằng thẻ <a download> (Zalo báo "Không tìm thấy ứng dụng"),
// nên phần mềm phải đổi cách: hiện ảnh để em nhấn giữ lưu, hoặc hướng dẫn mở bằng trình duyệt của máy.

export type InAppName = 'Zalo' | 'Facebook' | 'Messenger' | 'Instagram' | 'TikTok' | 'LINE' | 'WeChat' | 'ứng dụng';

export function inAppBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): InAppName | null {
  if (/Zalo/i.test(ua)) return 'Zalo';
  if (/Messenger|FB_IAB\/MESSENGER/i.test(ua)) return 'Messenger';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'TikTok';
  if (/\bLine\//i.test(ua)) return 'LINE';
  if (/MicroMessenger/i.test(ua)) return 'WeChat';
  // WebView Android chung (có "; wv)") – trình duyệt của ứng dụng khác
  if (/Android.*; wv\)/i.test(ua)) return 'ứng dụng';
  return null;
}

export const isIOS = (ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) =>
  /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);

/** Lời hướng dẫn mở trang đang xem bằng trình duyệt của điện thoại. */
export function openInBrowserHint(app: InAppName, ios = isIOS()): string {
  if (app === 'Zalo') return `Bấm nút ⋯ (ba chấm) ở góc trên bên phải của Zalo, rồi chọn "Mở bằng trình duyệt"${ios ? ' (Safari)' : ''}.`;
  if (app === 'Facebook' || app === 'Messenger' || app === 'Instagram') return `Bấm nút ⋯ ở góc trên bên phải, rồi chọn "Mở trong trình duyệt"${ios ? ' (Safari)' : ' (Chrome)'}.`;
  return `Mở menu của ứng dụng (nút ⋯ hoặc ⋮) và chọn "Mở bằng trình duyệt".`;
}

/** Thêm/thay tham số trong phần sau dấu # của đường dẫn (HashRouter). */
export function withHashParam(href: string, key: string, value: string): string {
  const [base, hash = ''] = href.split('#');
  const [path, query = ''] = hash.split('?');
  const qs = new URLSearchParams(query);
  qs.set(key, value);
  return `${base}#${path}?${qs.toString()}`;
}

/** Mã hóa/giải mã chuỗi JSON sang base64 an toàn cho đường dẫn (có dấu tiếng Việt). */
export function toB64Url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64Url<T>(s: string): T | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as T;
  } catch {
    return null;
  }
}
