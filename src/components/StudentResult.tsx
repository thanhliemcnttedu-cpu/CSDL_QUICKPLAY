// Bảng tổng kết của học sinh khi làm xong: kết quả, mức đánh giá, cúp cho Top 3 và ảnh khen thưởng tải về máy.
import { useEffect, useState } from 'react';
import { Crown, Download, Trophy } from 'lucide-react';
import { api } from '../lib/api';
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
  const save = async () => {
    if (!r) return;
    const blob = await awardImage(p, r);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Quickplay-khen-thuong-${p.name.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
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
          <button className="btn primary" onClick={save}><Download size={18} /> {top3 && p.final ? 'Tải ảnh khen thưởng' : 'Tải phiếu kết quả'}</button>
        </>
      ) : (
        <p className="muted">Đang tổng hợp kết quả…</p>
      )}
    </div>
  );
}
