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

/** Tệp có phải ảnh không: theo kiểu tệp, hoặc theo đuôi tên khi trình duyệt không cho biết kiểu (ảnh chép từ thư mục, từ Zalo…). */
export function looksLikeImage(f: File | Blob): boolean {
  const name = (f as File).name ?? '';
  return f.type.startsWith('image/') || (!f.type && /\.(png|jpe?g|jfif|webp|gif|bmp|avif|heic|heif)$/i.test(name));
}

export function checkImage(f: File | Blob): string | null {
  if (!looksLikeImage(f)) return 'Tệp này không phải ảnh. Hãy chọn ảnh PNG, JPG, WEBP hoặc GIF.';
  if (f.size > LIMITS.image) return `Ảnh ${formatBytes(f.size)} vượt quá giới hạn 10 MB.`;
  return null;
}

/**
 * Đưa ảnh về kiểu máy chủ nhận được (PNG, JPG, WEBP, GIF). Ảnh kiểu khác (BMP, AVIF, JFIF, ảnh không ghi kiểu…)
 * được trình duyệt vẽ lại thành WebP. Ảnh trình duyệt không mở được (ví dụ HEIC trên Windows) thì báo lỗi rõ.
 */
export async function toWebImage(f: Blob): Promise<Blob> {
  if (IMAGE_TYPES.includes(f.type)) return f;
  try {
    const bmp = await createImageBitmap(f);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.9));
    if (out) return out;
  } catch { /* báo lỗi bên dưới */ }
  throw new Error('Trình duyệt không đọc được ảnh này (kiểu ảnh lạ như HEIC). Hãy mở ảnh, chụp lại màn hình hoặc lưu thành JPG / PNG rồi thử lại.');
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

/** Chất lượng WebP khi nén ảnh: 0.72 gần như không thấy khác bằng mắt trên màn hình lớp học, nhẹ hơn JPG cùng cỡ 30–60%. */
export const IMAGE_QUALITY = 0.72;
/** Ảnh dưới mức này đã đủ nhẹ, không nén lại (tránh làm mờ hình vẽ nhỏ). */
const IMAGE_SKIP_BYTES = 40 * 1024;

/** Thu nhỏ ảnh lớn (cạnh dài tối đa maxSide, giữ tỉ lệ) và đổi sang WebP để tốn ít dung lượng Drive, tải nhanh trên điện thoại học sinh.
 *  Chỉ dùng bản nén khi nhỏ hơn bản gốc. Ảnh GIF (có thể là ảnh động) giữ nguyên. */
export async function compressImage(f: Blob, maxSide = 1280, quality = IMAGE_QUALITY): Promise<Blob> {
  if (f.type === 'image/gif' || f.type === 'image/svg+xml' || f.size < IMAGE_SKIP_BYTES) return f;
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

/** Nén một tệp đa phương tiện theo loại: ảnh → WebP, âm thanh → Opus/WebM. Loại khác giữ nguyên. */
export async function shrinkMedia(f: Blob, onProgress?: (pct: number) => void): Promise<Blob> {
  if (f.type.startsWith('image/')) return compressImage(f);
  if (f.type.startsWith('audio/') && f.type !== 'audio/webm;codecs=opus') {
    const { compressAudio } = await import('./audioCompress');
    return (await compressAudio(f, onProgress)).blob;
  }
  return f;
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
function forgetUrl(hash: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, string>;
    delete all[hash];
    localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch { /* bỏ qua */ }
}
/** Ảnh ở đường dẫn này còn mở được không (tệp trên Drive có thể đã bị xóa, hoặc đã đổi sang Drive khác). */
function imageLoads(url: string, timeoutMs = 6000): Promise<boolean> {
  if (typeof Image === 'undefined') return Promise.resolve(true);
  return new Promise((resolve) => {
    const img = new Image();
    const t = window.setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => { clearTimeout(t); resolve(true); };
    img.onerror = () => { clearTimeout(t); resolve(false); };
    img.src = url;
  });
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

/** Cạnh dài tối đa của ảnh lưu kèm trong bộ đề khi Drive chặn chia sẻ (giữ bộ đề nhẹ). */
export const INLINE_MAX_SIDE = 960;
/** Lỗi do Drive không bật được chia sẻ bằng link (mã mới SHARE_BLOCKED hoặc câu báo của Apps Script cũ). */
export const isShareBlocked = (msg: string) => /^SHARE_BLOCKED:|Không bật được chia sẻ/i.test(msg);

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
  if (known && hash) {
    // Chỉ dùng lại đường dẫn cũ khi ảnh đó còn mở được; tệp đã bị xóa trên Drive thì tải lên lại
    if (await imageLoads(known)) {
      onProgress?.(100);
      return known;
    }
    forgetUrl(hash);
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
  } catch (e) {
    // Drive không cho bật chia sẻ bằng link (tài khoản trường chặn, hoặc Apps Script cũ báo lỗi chia sẻ):
    // ảnh vẫn dùng được — nén nhỏ rồi lưu kèm ngay trong bộ đề (học sinh tải cùng câu hỏi).
    if (f.type.startsWith('image/') && isShareBlocked((e as Error).message)) {
      const small = await compressImage(f, INLINE_MAX_SIDE, 0.78);
      const url = await fileToDataUrl(small);
      onProgress?.(100);
      window.dispatchEvent(new CustomEvent('quickplay-media-inline', { detail: (e as Error).message.replace(/^SHARE_BLOCKED:\s*/, '') }));
      return url;
    }
    throw new Error((e as Error).message.replace(/^SHARE_BLOCKED:\s*/, ''));
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
  // Link chuyển hướng của Google / Facebook… có kèm link video thật bên trong (?url=, ?q=, ?u=): lấy link đó
  for (const k of ['url', 'q', 'u', 'link']) {
    const inner = u.searchParams.get(k);
    if (inner && /^https?:\/\//i.test(inner) && inner !== raw) {
      const r = parseVideoUrl(inner);
      if (r) return r;
    }
  }
  return null;
}

/** Lời nhắc khi link video không dùng được (VD dán nhầm link trang tìm kiếm Google). */
export function videoUrlHint(raw: string): string {
  let host = '';
  try { host = new URL(raw.trim()).hostname.replace(/^www\./, ''); } catch { /* không phải link */ }
  if (/^google\./.test(host) || host.includes('.google.'))
    return 'Đây là link trang tìm kiếm Google, không phải link video. Bấm vào video để mở trên YouTube, rồi bấm Chia sẻ → Sao chép đường liên kết và dán vào đây.';
  if (/facebook\.com|fb\.watch|tiktok\.com|drive\.google/.test(host))
    return 'Video Facebook, TikTok hoặc Google Drive không nhúng được. Hãy dùng link YouTube, Vimeo, hoặc tải tệp video .mp4 lên bằng nút Chọn tệp.';
  return 'Link chưa hợp lệ. Hỗ trợ YouTube, Vimeo hoặc link trực tiếp tệp .mp4/.webm.';
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
