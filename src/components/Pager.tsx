// Thanh chia trang dùng chung: ‹ 1 … 4 5 6 … 10 › · "Bộ đề 13–24 / 100".
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Số trang hiện trên thanh chia trang: 1 … 4 5 6 … 10 (-1 là dấu …). */
export function pageList(cur: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const s = [...new Set([0, pages - 1, cur - 1, cur, cur + 1].filter((p) => p >= 0 && p < pages))].sort((a, b) => a - b);
  const out: number[] = [];
  s.forEach((p, i) => { if (i && p - s[i - 1] > 1) out.push(-1); out.push(p); });
  return out;
}

export function Pager({ page, pages, total, size, unit = 'mục', onPage, label = 'Chia trang' }: {
  page: number; pages: number; total: number; size: number; unit?: string; onPage: (p: number) => void; label?: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label={label}>
      <button type="button" className="btn sm ghost" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={16} /></button>
      {pageList(page, pages).map((p, i) => p < 0
        ? <span key={`gap${i}`} className="muted">…</span>
        : <button key={p} type="button" className={`btn sm ${p === page ? 'primary' : 'ghost'}`} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p + 1}</button>)}
      <button type="button" className="btn sm ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Trang sau"><ChevronRight size={16} /></button>
      <span className="small muted">{unit} {page * size + 1}–{Math.min(total, (page + 1) * size)} / {total}</span>
    </nav>
  );
}
