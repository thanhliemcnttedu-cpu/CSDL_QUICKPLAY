import DOMPurify from 'dompurify';

export const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const randomPin = () => String(Math.floor(100000 + Math.random() * 900000));

export function shuffle<T>(arr: T[], seed?: number): T[] {
  const a = arr.slice();
  let s = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rnd = () => {
    // mulberry32 – xáo trộn ổn định theo seed để học sinh tải lại trang vẫn thấy cùng thứ tự
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'sup', 'sub', 'ul', 'ol', 'li', 'a', 'br', 'p', 'div', 'span'];

/** Làm sạch HTML (chống XSS) – chỉ giữ định dạng cơ bản và liên kết http(s). */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html.replace(/<[^>]*>/g, '');
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
  });
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Chữ thuần (có xuống dòng) -> HTML an toàn để lưu. */
export const plainToHtml = (s: string) => escapeHtml(s).replace(/\r?\n/g, '<br>');

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const formatBytes = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(b >= 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export const formatDate = (iso: string | number) =>
  new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

export const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export const AVATARS = ['cat', 'dog', 'fox', 'owl', 'panda', 'rabbit', 'bear', 'frog', 'tiger', 'koala', 'penguin', 'unicorn'] as const;
export const AVATAR_EMOJI: Record<string, string> = {
  cat: '🐱', dog: '🐶', fox: '🦊', owl: '🦉', panda: '🐼', rabbit: '🐰',
  bear: '🐻', frog: '🐸', tiger: '🐯', koala: '🐨', penguin: '🐧', unicorn: '🦄',
};

/** Thời gian làm bài: "3 phút 05 giây" (dưới 1 phút: "42 giây"). */
export function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return m ? `${m} phút ${String(r).padStart(2, '0')} giây` : `${r} giây`;
}
