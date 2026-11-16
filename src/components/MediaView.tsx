import { useEffect, useRef, useState } from 'react';
import { ExternalLink, ZoomIn } from 'lucide-react';
import type { Stem } from '../lib/types';
import { embedUrl } from '../lib/media';
import { allowLeaveBriefly } from '../lib/anticheat';
import { useLightbox } from './ui';

/**
 * Ảnh tự tải lại khi lỗi mạng (sau 1,5 – 4 – 8 giây), để em không phải bấm F5 chỉ vì một tấm ảnh không hiện.
 * Mỗi lần thử thêm "_r=n" vào địa chỉ để trình duyệt tải mới thay vì dùng lại lần lỗi.
 */
export function useRetrySrc(src: string | undefined) {
  const [n, setN] = useState(0);
  const timer = useRef<number>();
  useEffect(() => {
    setN(0);
    return () => clearTimeout(timer.current);
  }, [src]);
  const url = !src || !n || src.startsWith('data:') || src.startsWith('blob:') ? src : `${src}${src.includes('?') ? '&' : '?'}_r=${n}`;
  const onError = () => {
    const wait = [1500, 4000, 8000][n];
    if (wait) timer.current = window.setTimeout(() => setN((x) => x + 1), wait);
  };
  return { url, onError };
}

/** Hiển thị media của câu hỏi cho học sinh: ảnh (bấm phóng to), âm thanh, video, liên kết tham khảo. */
export function StemMedia({ stem }: { stem: Stem }) {
  const zoom = useLightbox();
  const img = useRetrySrc(stem.image_url);
  const v = stem.video;
  const src = v ? embedUrl(v) : null;
  if (!stem.image_url && !stem.audio_url && !v && !stem.hyperlink) return null;
  return (
    <div className="media">
      {stem.image_url && (
        <div style={{ position: 'relative' }}>
          <img className="zoomable" src={img.url} onError={img.onError} alt={stem.image_alt || 'Hình minh họa câu hỏi'} onClick={() => zoom(stem.image_url!, stem.image_alt)} />
          <button className="btn icon sm zoom-btn" onClick={() => zoom(stem.image_url!, stem.image_alt)} aria-label="Phóng to ảnh">
            <ZoomIn size={18} />
          </button>
        </div>
      )}
      {v && src && (
        <iframe
          className="video-frame"
          src={src}
          title="Video câu hỏi"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      {v && !src && <video className="video-frame" src={v.url} controls preload="metadata" />}
      {stem.audio_url && <audio src={stem.audio_url} controls preload="metadata" style={{ width: 'min(100%, 420px)' }} />}
      {stem.hyperlink && (
        <a className="btn sm" href={stem.hyperlink} target="_blank" rel="noopener noreferrer" onClick={allowLeaveBriefly}>
          <ExternalLink size={16} /> Mở tài liệu tham khảo
        </a>
      )}
    </div>
  );
}

export function OptImage({ src, alt }: { src?: string; alt?: string }) {
  const zoom = useLightbox();
  const img = useRetrySrc(src);
  if (!src) return null;
  // Bấm vào ẢNH là chọn đáp án đó (em nhỏ thường bấm thẳng vào hình); muốn xem to thì bấm kính lúp ở góc ảnh.
  const open = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    zoom(src, alt);
  };
  return (
    <span className="opt-img">
      <img src={img.url} onError={img.onError} alt={alt || 'Ảnh phương án'} />
      <span
        role="button"
        tabIndex={-1}
        className="opt-zoom"
        aria-label="Phóng to ảnh đáp án"
        title="Phóng to ảnh"
        onClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(e); }}
      >
        <ZoomIn size={16} />
      </span>
    </span>
  );
}
