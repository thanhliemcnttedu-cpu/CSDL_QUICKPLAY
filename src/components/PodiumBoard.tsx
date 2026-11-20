// Vinh danh cuối buổi học: bục 1–2–3 và (tùy chọn) hạng 4–5 bên dưới.
import { Trophy } from 'lucide-react';

export interface PodiumEntry { name: string; detail: string; score: number }

export function PodiumBoard({ entries, size, onSize }: { entries: PodiumEntry[]; size: 3 | 5; onSize: (n: 3 | 5) => void }) {
  const top = entries.slice(0, size);
  const first = top[0], second = top[1], third = top[2];
  const slot = (e: PodiumEntry | undefined, rank: 1 | 2 | 3, h: number, color: string) => (
    <div key={rank} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
      {e ? (
        <>
          <div style={{ fontWeight: 800, fontSize: rank === 1 ? '1.3rem' : '1.1rem', overflowWrap: 'anywhere' }}>{e.name}</div>
          <div className="small muted" style={{ marginBottom: 6 }}>{e.detail} · {e.score} điểm</div>
        </>
      ) : <div className="muted small">—</div>}
      <div style={{ height: h, borderRadius: '14px 14px 0 0', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-head)', fontWeight: 900, fontSize: rank === 1 ? '3rem' : '2.4rem', boxShadow: 'inset 0 -6px 0 rgba(0,0,0,.12)' }}>{rank}</div>
    </div>
  );
  return (
    <section className="card stack" aria-label={`Vinh danh top ${size}`}>
      <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Trophy size={22} color="#f59e0b" /> Vinh danh top {size}</h2>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={`btn sm ${size === 3 ? 'primary' : 'ghost'}`} aria-pressed={size === 3} onClick={() => onSize(3)}>Top 3</button>
          <button type="button" className={`btn sm ${size === 5 ? 'primary' : 'ghost'}`} aria-pressed={size === 5} onClick={() => onSize(5)}>Top 5</button>
        </div>
      </div>
      {top.length === 0 ? (
        <span className="muted">Chưa có học sinh nào trả lời để xếp hạng.</span>
      ) : (
        <>
          <div className="row" style={{ gap: 10, alignItems: 'flex-end', justifyContent: 'center' }}>
            {slot(second, 2, 96, 'linear-gradient(180deg,#94a3b8,#64748b)')}
            {slot(first, 1, 128, 'linear-gradient(180deg,#f59e0b,#d97706)')}
            {slot(third, 3, 72, 'linear-gradient(180deg,#b45309,#92400e)')}
          </div>
          {size === 5 && top.length > 3 && (
            <ol start={4} className="stack" style={{ gap: 6, margin: 0, paddingLeft: 0, listStyle: 'none' }}>
              {top.slice(3).map((e, i) => (
                <li key={i} className="row between" style={{ gap: 10, padding: '8px 12px', borderRadius: 12, background: '#f4f8ff' }}>
                  <span><b>{i + 4}.</b> {e.name} <span className="small muted">· {e.detail}</span></span>
                  <b>{e.score} điểm</b>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
