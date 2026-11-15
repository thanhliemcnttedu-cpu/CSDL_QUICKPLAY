// Bảng tổng kết của học sinh khi làm xong: kết quả, mức đánh giá, cúp cho Top 3 và ảnh khen thưởng tải về máy.
import { useEffect, useState } from 'react';
import { Check, Copy, Crown, Download, Globe, Hand, Share2, Trophy, X } from 'lucide-react';
import { api } from '../lib/api';
import { inAppBrowser, openInBrowserHint, toB64Url, withHashParam } from '../lib/inApp';
import { LEVEL_LABEL, summarize, type ResultSummary } from '../lib/cheer';
import { formatDuration } from '../lib/util';
import { Avatar } from './Avatar';
import '../result.css';

interface Props {
  pin: string;
  playerId: string;
  name: string;
  className?: string;
  avatar: string;
  quizTitle: string;
  total: number;
  score: number;
  coins: number;
  rank: number; // 0 = không hiện hạng
  players: number;
  final: boolean; // phiên đã kết thúc → thứ hạng chính thức
  pending: number; // số câu trả lời miệng chờ chấm
  durationMs?: number | null; // thời gian làm cả bài
}

const RANK_LABEL = ['', 'Hạng Nhất', 'Hạng Nhì', 'Hạng Ba'];
const RANK_COLOR = ['', '#d97706', '#64748b', '#b45309'];

function drawCup(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = s * 0.09;
  // thân cúp
  g.beginPath();
  g.moveTo(cx - s * 0.5, cy - s * 0.6);
  g.lineTo(cx + s * 0.5, cy - s * 0.6);
  g.quadraticCurveTo(cx + s * 0.48, cy + s * 0.15, cx, cy + s * 0.25);
  g.quadraticCurveTo(cx - s * 0.48, cy + s * 0.15, cx - s * 0.5, cy - s * 0.6);
  g.fill();
  // hai quai
  for (const d of [-1, 1]) {
    g.beginPath();
    g.arc(cx + d * s * 0.55, cy - s * 0.3, s * 0.22, d === 1 ? -Math.PI / 2 : Math.PI / 2, d === 1 ? Math.PI / 2 : (3 * Math.PI) / 2);
    g.stroke();
  }
  // chân đế
  g.fillRect(cx - s * 0.07, cy + s * 0.2, s * 0.14, s * 0.25);
  g.fillRect(cx - s * 0.32, cy + s * 0.42, s * 0.64, s * 0.14);
}

/** Vẽ ảnh khen thưởng 1200×800 (PNG) để học sinh tải về máy tính hoặc điện thoại. */
async function awardImage(p: Props, r: ResultSummary): Promise<Blob | null> {
  try {
    await document.fonts?.load("800 60px 'Be Vietnam Pro'");
  } catch { /* dùng phông hệ thống */ }
  const W = 1200, H = 800;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  if (!g) return null;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#eaf3ff');
  bg.addColorStop(1, '#ffffff');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1668f2';
  g.lineWidth = 10;
  g.strokeRect(24, 24, W - 48, H - 48);
  g.strokeStyle = '#bcd5ff';
  g.lineWidth = 3;
  g.strokeRect(44, 44, W - 88, H - 88);
  const font = (w: number, s: number) => `${w} ${s}px 'Be Vietnam Pro', system-ui, sans-serif`;
  g.textAlign = 'center';
  const top3 = p.final && p.rank >= 1 && p.rank <= 3;
  drawCup(g, W / 2, 190, 150, top3 ? RANK_COLOR[p.rank] : '#1668f2');
  g.fillStyle = '#0b4fd0';
  g.font = font(800, 30);
  g.fillText('QUICKPLAY', W / 2, 96);
  g.fillStyle = '#0a1730';
  g.font = font(800, 58);
  g.fillText(top3 ? `KHEN THƯỞNG ${RANK_LABEL[p.rank].toUpperCase()}` : 'PHIẾU KẾT QUẢ', W / 2, 372);
  g.font = font(800, 66);
  g.fillStyle = '#1668f2';
  g.fillText(p.name.slice(0, 28), W / 2, 462);
  g.fillStyle = '#46556e';
  g.font = font(600, 32);
  g.fillText(`${p.className ? `Lớp ${p.className} · ` : ''}${p.quizTitle}`.slice(0, 60), W / 2, 516);
  g.fillStyle = '#0a1730';
  g.font = font(700, 36);
  g.fillText(`Đúng ${r.correct}/${r.total} câu${r.partial ? ` · đúng một phần ${r.partial} câu` : ''} · ${p.score.toLocaleString('vi-VN')} điểm`, W / 2, 592);
  g.fillStyle = '#129a4b';
  g.font = font(800, 44);
  g.fillText(LEVEL_LABEL[r.level], W / 2, 662);
  g.fillStyle = '#46556e';
  g.font = font(500, 24);
  g.fillText(`${p.final && p.rank ? `Xếp hạng ${p.rank}/${p.players} · ` : ''}${p.durationMs ? `Thời gian ${formatDuration(p.durationMs)} · ` : ''}${new Date().toLocaleDateString('vi-VN')}`, W / 2, 722);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

export function StudentResult(p: Props) {
  const [r, setR] = useState<ResultSummary | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      api.getProgress(p.pin, p.playerId).then((x) => live && setR(summarize(p.total, x.answers as { ratio: number; pending?: boolean; answer?: unknown }[]))).catch(() => {});
    load();
    const id = window.setInterval(load, 8000); // cập nhật khi giáo viên chấm xong câu trả lời miệng
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [p.pin, p.playerId, p.total]);

  const top3 = p.rank >= 1 && p.rank <= 3;
  const app = inAppBrowser();
  // Đường dẫn mở lại đúng phiếu này ở trình duyệt khác (mang theo thông tin em, chỉ gắn khi đã làm xong bài)
  const browserLink = withHashParam(location.href, 'me', toB64Url({ pin: p.pin, player_id: p.playerId, name: p.name, avatar: p.avatar, class_name: p.className }));
  useEffect(() => {
    // Gắn sẵn vào thanh địa chỉ: em chọn "Mở bằng trình duyệt" trong menu Zalo là sang thẳng phiếu kết quả
    if (app) try { history.replaceState(history.state, '', browserLink); } catch { /* bỏ qua */ }
  }, [app, browserLink]);
  const [sheet, setSheet] = useState<{ url: string; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileName = `Quickplay-${top3 && p.final ? 'khen-thuong' : 'phieu-ket-qua'}-${p.name.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.png`;
  const save = async () => {
    if (!r || busy) return;
    setBusy(true);
    try {
      const blob = await awardImage(p, r);
      if (!blob) return;
      const file = new File([blob], fileName, { type: 'image/png' });
      if (app) {
        // Trình duyệt trong Zalo/Facebook không tải tệp được: hiện ảnh để em nhấn giữ lưu, hoặc chia sẻ / mở trình duyệt
        setSheet({ url: await blobToDataUrl(blob), file });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setBusy(false);
    }
  };
  const canShare = !!sheet && typeof navigator.canShare === 'function' && navigator.canShare({ files: [sheet.file] });
  const share = async () => {
    if (!sheet) return;
    try {
      await navigator.share({ files: [sheet.file], title: 'Phiếu kết quả Quickplay' });
    } catch { /* em bấm hủy */ }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(browserLink);
    } catch {
      // Ứng dụng chặn bộ nhớ tạm: chọn sẵn chữ trong ô để em tự sao chép
      (document.getElementById('sr-link') as HTMLInputElement | null)?.select();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="sr card">
      <div className="sr-head">
        {top3 ? (
          <span className="sr-cup" style={{ color: RANK_COLOR[p.rank] }}>
            {p.rank === 1 ? <Crown size={64} /> : <Trophy size={64} />}
            <b>{RANK_LABEL[p.rank]}{p.final ? '' : ' (tạm thời)'}</b>
          </span>
        ) : (
          <Avatar value={p.avatar} size={84} />
        )}
        <div>
          <h2 style={{ margin: 0 }}>{p.name}</h2>
          <div className="muted">{p.className ? `Lớp ${p.className} · ` : ''}{p.quizTitle}</div>
        </div>
      </div>

      {r ? (
        <>
          <div className={`sr-level ${r.level}`}>{LEVEL_LABEL[r.level]}</div>
          <div className="sr-grid">
            <div className="ok"><b>{r.correct}</b><span>câu đúng</span></div>
            <div className="part"><b>{r.partial}</b><span>đúng một phần</span></div>
            <div className="bad"><b>{r.wrong}</b><span>câu sai</span></div>
            <div><b>{p.score.toLocaleString('vi-VN')}</b><span>điểm</span></div>
            <div><b>{p.coins}</b><span>điểm thưởng</span></div>
            {p.rank > 0 && <div><b>{p.rank}/{p.players}</b><span>{p.final ? 'xếp hạng' : 'hạng tạm thời'}</span></div>}
            {!!p.durationMs && <div style={{ gridColumn: '1 / -1' }}><b style={{ fontSize: '1.25rem' }}>{formatDuration(p.durationMs)}</b><span>thời gian làm cả bài</span></div>}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Tổng {r.total} câu: đúng hoàn toàn <b>{r.pct_full}%</b>, đúng một phần <b>{r.pct_partial}%</b>, đạt <b>{r.pct}%</b> số điểm.
            {r.blank > 0 && ` Có ${r.blank} câu chưa trả lời.`}
            {p.pending > 0 && ` ${p.pending} câu trả lời miệng đang chờ thầy cô chấm.`}
          </p>
          <button className="btn primary" onClick={save} disabled={busy}><Download size={18} /> {busy ? 'Đang tạo ảnh…' : top3 && p.final ? 'Tải ảnh khen thưởng' : 'Tải phiếu kết quả'}</button>
        </>
      ) : (
        <p className="muted">Đang tổng hợp kết quả…</p>
      )}
      {sheet && app && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="modal sr-sheet" role="dialog" aria-label="Lưu phiếu kết quả">
            <div className="row between">
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Lưu phiếu kết quả</h2>
              <button className="btn icon ghost" onClick={() => setSheet(null)} aria-label="Đóng"><X size={20} /></button>
            </div>
            <img src={sheet.url} alt={`Phiếu kết quả của ${p.name}`} className="sr-sheet-img" />
            <div className="alert">
              <Hand size={20} style={{ flex: 'none' }} />
              <div><b>Cách 1:</b> nhấn giữ vào ảnh ở trên, rồi chọn <b>Lưu hình ảnh</b> (hoặc <b>Tải ảnh xuống</b>).</div>
            </div>
            {canShare && (
              <button className="btn primary" onClick={share}><Share2 size={18} /> Chia sẻ hoặc lưu ảnh</button>
            )}
            <div className="alert warn">
              <Globe size={20} style={{ flex: 'none' }} />
              <div>
                <b>Cách {canShare ? 3 : 2}:</b> {app} không cho tải tệp trực tiếp. {openInBrowserHint(app)} Trình duyệt sẽ mở đúng phiếu này, em bấm <b>Tải phiếu kết quả</b> lần nữa.
              </div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <input id="sr-link" className="input" readOnly value={browserLink} onFocus={(e) => e.currentTarget.select()} aria-label="Liên kết mở phiếu kết quả" style={{ minWidth: 0 }} />
              <button className="btn ghost" onClick={copyLink}>{copied ? <><Check size={18} /> Đã chép</> : <><Copy size={18} /> Sao chép</>}</button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Hoặc sao chép liên kết rồi dán vào Chrome / Safari.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(b);
  });
}
