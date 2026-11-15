// Bảng xếp hạng trực quan: khi điểm thay đổi, các dòng trượt tới vị trí mới và hiện mũi tên lên/xuống hạng.
import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { PollResult } from '../lib/types';
import { totalOf } from '../lib/report';
import { Avatar } from './Avatar';
import '../leaderboard.css';

type Row = PollResult['players'][number];
const fmt = (n: number) => n.toLocaleString('vi-VN');

export function Leaderboard({ rows, meId }: { rows: Row[]; meId?: string }) {
  const max = Math.max(1, ...rows.map(totalOf));
  const els = useRef(new Map<string, HTMLDivElement>());
  const prevTop = useRef(new Map<string, number>());
  const prevRank = useRef(new Map<string, number>());
  const [moves, setMoves] = useState<Record<string, number>>({}); // người chơi -> số bậc vừa tăng (+) / giảm (−)
  const order = rows.map((r) => r.player_id).join('|');

  useLayoutEffect(() => {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delta: Record<string, number> = {};
    rows.forEach((r, i) => {
      const el = els.current.get(r.player_id);
      if (!el) return;
      const top = el.offsetTop;
      const before = prevTop.current.get(r.player_id);
      const rankBefore = prevRank.current.get(r.player_id);
      if (rankBefore !== undefined && rankBefore !== i) delta[r.player_id] = rankBefore - i;
      // FLIP: đặt dòng về vị trí cũ rồi cho trượt tới vị trí mới
      if (!reduce && before !== undefined && before !== top && el.animate) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }], { duration: 550, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      }
      prevTop.current.set(r.player_id, top);
      prevRank.current.set(r.player_id, i);
    });
    if (Object.keys(delta).length) {
      setMoves(delta);
      const t = window.setTimeout(() => setMoves({}), 3500);
      return () => clearTimeout(t);
    }
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="lb" style={{ width: '100%' }} aria-live="polite">
      {rows.map((p, i) => {
        const mv = moves[p.player_id] ?? 0;
        const bonus = p.coins ?? 0;
        return (
          <div
            key={p.player_id}
            ref={(el) => { if (el) els.current.set(p.player_id, el); else els.current.delete(p.player_id); }}
            className={`lb-row ${p.player_id === meId ? 'me' : ''} ${mv > 0 ? 'up' : mv < 0 ? 'down' : ''}`}
          >
            <span className="rank">{i + 1}</span>
            <Avatar value={p.avatar} size={38} />
            <span className="lb-name">
              <b>{p.name}{p.class_name && <small className="muted"> · {p.class_name}</small>}</b>
              <div className="bar"><i style={{ width: `${(totalOf(p) / max) * 100}%` }} /></div>
            </span>
            <span className="lb-move" aria-label={mv > 0 ? `lên ${mv} hạng` : mv < 0 ? `xuống ${-mv} hạng` : undefined}>
              {mv > 0 && <><ChevronUp size={16} />{mv}</>}
              {mv < 0 && <><ChevronDown size={16} />{-mv}</>}
            </span>
            <span className="lb-score">
              <b>{fmt(totalOf(p))}</b>
              <small>{fmt(p.score)} điểm{bonus ? ` + ${fmt(bonus)} thưởng` : ''}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}
