import type { VideoMedia } from './types';
import { api } from './api';
import { formatBytes } from './util';

export const LIMITS = {
  image: 10 * 1024 * 1024, // 10 MB
  audio: 20 * 1024 * 1024, // 20 MB
  video: 300 * 1024 * 1024, // < 300 MB (SRS)
  videoSeconds: 60, // < 60 giây (SRS)
  transport: 45 * 1024 * 1024, // giới hạn gói tin Apps Script
};

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export function checkImage(f: File | Blob): string | null {
  if (!IMAGE_TYPES.includes(f.type)) return 'Chỉ hỗ trợ ảnh PNG, JPG, WEBP hoặc GIF.';
  if (f.size > LIMITS.image) return `Ảnh ${formatBytes(f.size)} vượt quá giới hạn 10 MB.`;
  return null;
}

export function checkAudio(f: File | Blob): string | null {
  const name = (f as File).name ?? '';
  if (!AUDIO_TYPES.includes(f.type) && !/\.(mp3|wav|ogg)$/i.test(name)) return 'Chỉ hỗ trợ âm thanh .mp3, .wav, .ogg.';
  if (f.size > LIMITS.audio) return `Tệp âm thanh ${formatBytes(f.size)} vượt quá giới hạn 20 MB.`;
  return null;
}

/** Đọc thời lượng video ngay tại trình duyệt (HTML5 video metadata) trước khi tải lên. */
export function readVideoDuration(f: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được thông tin video. Tệp có thể bị hỏng hoặc định dạng không hỗ trợ.'));
    };
    v.src = url;
  });
}

export async function checkVideo(f: File): Promise<{ error: string | null; duration: number }> {
  if (!VIDEO_TYPES.includes(f.type) && !/\.(mp4|webm|mov)$/i.test(f.name))
    return { error: 'Chỉ hỗ trợ video .mp4, .webm, .mov.', duration: 0 };
  const sizeMb = Math.round(f.size / 1048576);
  if (f.size >= LIMITS.video) return { error: `Dung lượng ${sizeMb} MB vượt quá 300 MB.`, duration: 0 };
  const d = await readVideoDuration(f);
  if (!(d < LIMITS.videoSeconds))
    return { error: `Video dài ${Math.round(d)} giây, vượt quá giới hạn 60 giây quy định.`, duration: d };
  return { error: null, duration: d };
}

export const fileToDataUrl = (f: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

/** Thu nhỏ ảnh lớn (giữ tỉ lệ) để tệp JSON nhẹ, tải nhanh trên điện thoại học sinh. */
export async function compressImage(f: Blob, maxSide = 1280, quality = 0.8): Promise<Blob> {
  if (f.type === 'image/gif' || f.type === 'image/svg+xml' || f.size < 120 * 1024) return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', quality));
    return out && out.size < f.size ? out : f;
  } catch {
    return f;
  }
}

/** Mã băm SHA-256 (dạng hex) của nội dung tệp: hai tệp giống hệt nhau có cùng mã → nhận ra ảnh trùng. */
export async function hashBlob(f: Blob): Promise<string | null> {
  try {
    const d = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null; // trình duyệt cũ / trang không chạy https: bỏ qua, vẫn tải lên bình thường
  }
}

// Sổ ghi "mã băm → đường dẫn" của các ảnh đã tải lên từ máy này: gặp lại ảnh cũ thì dùng ngay, không gửi gì lên máy chủ
const SEEN_KEY = 'qp.media.seen';
const SEEN_MAX = 300;
function seenUrl(hash: string): string | null {
  try { return (JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, string>)[hash] ?? null; } catch { return null; }
}
function rememberUrl(hash: string, url: string) {
  if (url.startsWith('data:')) return; // lưu trên máy: ảnh nằm ngay trong tệp JSON, không có gì để dùng lại
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, string>;
    delete all[hash];
    all[hash] = url;
    const keys = Object.keys(all);
    keys.slice(0, Math.max(0, keys.length - SEEN_MAX)).forEach((k) => delete all[k]);
    localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch { /* bộ nhớ đầy: bỏ qua */ }
}

/** Tải lên kho (Drive hoặc cục bộ) và trả về URL. onProgress mô phỏng tiến trình đọc + gửi. */
export async function uploadFile(f: Blob, name: string, onProgress?: (pct: number) => void): Promise<string> {
  if (f.size > LIMITS.transport)
    throw new Error(
      `Tệp ${formatBytes(f.size)} lớn hơn mức Apps Script nhận được (45 MB). Hãy tải video lên Google Drive/YouTube rồi dán đường link.`,
    );
  onProgress?.(10);
  // Ảnh: tính mã băm để không tải trùng (máy này đã tải → dùng lại ngay; máy chủ đã có → máy chủ trả lại tệp cũ)
  const hash = f.type.startsWith('image/') ? await hashBlob(f) : null;
  const known = hash ? seenUrl(hash) : null;
  if (known) {
    onProgress?.(100);
    return known;
  }
  const dataUrl = await fileToDataUrl(f);
  onProgress?.(40);
  let pct = 40;
  const timer = window.setInterval(() => {
    pct = Math.min(95, pct + 5);
    onProgress?.(pct);
  }, 400);
  try {
    const r = await api.uploadMedia(name, f.type || 'application/octet-stream', dataUrl, hash ?? undefined);
    if (hash) rememberUrl(hash, r.url);
    onProgress?.(100);
    return r.url;
  } finally {
    clearInterval(timer);
  }
}

/** Nhận diện link YouTube / Vimeo / tệp video công khai. */
export function parseVideoUrl(raw: string): Pick<VideoMedia, 'provider' | 'embed_id' | 'url'> | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return /^[\w-]{11}$/.test(id) ? { provider: 'youtube', embed_id: id, url: raw } : null;
  }
  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const id = u.searchParams.get('v') || u.pathname.match(/\/(embed|shorts|live)\/([\w-]{11})/)?.[2] || '';
    return /^[\w-]{11}$/.test(id) ? { provider: 'youtube', embed_id: id, url: raw } : null;
  }
  if (host.endsWith('vimeo.com')) {
    const id = u.pathname.match(/(\d{6,})/)?.[1];
    return id ? { provider: 'vimeo', embed_id: id, url: raw } : null;
  }
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u.pathname)) return { provider: 'file', url: raw };
  return null;
}

export function embedUrl(v: VideoMedia): string | null {
  if (v.provider === 'youtube' && v.embed_id) {
    const p = new URLSearchParams({ rel: '0', modestbranding: '1' });
    if (v.start_time) p.set('start', String(Math.floor(v.start_time)));
    if (v.end_time) p.set('end', String(Math.floor(v.end_time)));
    return `https://www.youtube-nocookie.com/embed/${v.embed_id}?${p}`;
  }
  if (v.provider === 'vimeo' && v.embed_id) return `https://player.vimeo.com/video/${v.embed_id}${v.start_time ? `#t=${Math.floor(v.start_time)}s` : ''}`;
  return null;
}

/** Kiểm tra video YouTube còn tồn tại và cho phép nhúng (qua oEmbed công khai). */
export async function checkEmbeddable(v: VideoMedia): Promise<string | null> {
  if (v.provider !== 'youtube' && v.provider !== 'vimeo') return null;
  const endpoint =
    v.provider === 'youtube'
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v.embed_id}`)}`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${v.embed_id}`)}`;
  try {
    const r = await fetch(endpoint);
    if (r.status === 401 || r.status === 403) return 'Video này đã tắt tính năng nhúng. Hãy chọn video khác.';
    if (!r.ok) return 'Không tìm thấy video (link hỏng hoặc video riêng tư).';
    return null;
  } catch {
    return null; // mất mạng/CORS: không chặn giáo viên
  }
}
