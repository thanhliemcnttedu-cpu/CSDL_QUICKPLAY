import { ExternalLink, ZoomIn } from 'lucide-react';
import type { Stem } from '../lib/types';
import { embedUrl } from '../lib/media';
import { allowLeaveBriefly } from '../lib/anticheat';
import { useLightbox } from './ui';

/** Hiển thị media của câu hỏi cho học sinh: ảnh (bấm phóng to), âm thanh, video, liên kết tham khảo. */
export function StemMedia({ stem }: { stem: Stem }) {
  const zoom = useLightbox();
  const v = stem.video;
  const src = v ? embedUrl(v) : null;
  if (!stem.image_url && !stem.audio_url && !v && !stem.hyperlink) return null;
  return (
    <div className="media">
      {stem.image_url && (
        <div style={{ position: 'relative' }}>
          <img className="zoomable" src={stem.image_url} alt={stem.image_alt || 'Hình minh họa câu hỏi'} onClick={() => zoom(stem.image_url!, stem.image_alt)} />
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
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt || 'Ảnh phương án'}
      onClick={(e) => {
        e.stopPropagation();
        zoom(src, alt);
      }}
      style={{ cursor: 'zoom-in' }}
    />
  );
}
