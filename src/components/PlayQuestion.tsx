import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, GripVertical, Send, X } from 'lucide-react';
import type { Option, Question } from '../lib/types';
import type { Answer } from '../lib/grading';
import { OPTION_LABELS, sanitizeHtml, shuffle } from '../lib/util';
import { OptImage, StemMedia } from './MediaView';
import { SHAPES, optColor } from './shapes';
import { sfx } from '../lib/sound';
import { OralAnswer } from './OralAnswer';
import '../playq.css';

interface Props {
  q: Question;
  seed: number; // xáo trộn ổn định theo học sinh + câu
  shuffleOptions: boolean;
  disabled: boolean;
  reveal?: boolean; // tô đáp án đúng sau khi chốt
  chosen?: Answer | null;
  onSubmit: (a: Answer) => void;
  draft?: Answer | null;
  onDraft?: (a: Answer) => void; // lưu nháp (giao bài về nhà)
  uploadAudio?: (blob: Blob) => Promise<string>; // câu trả lời miệng: gửi bản ghi âm lên máy chủ
  /** "Đề giấy": phương án đánh chữ A, B, C, D nền trắng như đề in */
  paper?: boolean;
  /** Nhãn đứng trước đề bài, ví dụ "Câu 1. (0,25 điểm)" */
  label?: ReactNode;
}

const Html = ({ html }: { html: string }) => <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;

export function OptionBody({ o }: { o: Option }) {
  return (
    <>
      <OptImage src={o.image_url} alt={o.text.replace(/<[^>]*>/g, '')} />
      {o.text && <Html html={o.text} />}
    </>
  );
}

export function PlayQuestion(props: Props) {
  const { q } = props;
  const hasBlanks = q.type === 'fill_blank' || q.type === 'drag_drop';
  return (
    <>
      {!hasBlanks && (
        <div className="stem-card">
          {props.label}
          <Html html={q.stem.text} />
          <StemMedia stem={q.stem} />
        </div>
      )}
      {hasBlanks && props.label && <div className="stem-card stem-label">{props.label}</div>}
      {q.type === 'single_choice' && <Choice {...props} />}
      {q.type === 'true_false' && <TrueFalse {...props} />}
      {q.type === 'multiple_select' && <MultiSelect {...props} />}
      {q.type === 'fill_blank' && (fillMode(q) === 'menu' ? <FillMenu {...props} /> : fillMode(q) === 'bank' ? <FillBank {...props} /> : <Fill {...props} />)}
      {q.type === 'oral' && <Oral {...props} />}
      {q.type === 'drag_drop' && <Drag {...props} />}
      {q.type === 'reorder' && <Reorder {...props} />}
      {q.type === 'matching' && <Match {...props} />}
    </>
  );
}

/** Cách trả lời câu điền chỗ trống: gõ chữ / kho từ / menu thả xuống. */
const fillMode = (q: Question) => q.fill_mode ?? ((q.distractors ?? []).length ? 'bank' : 'type');

const Hint = ({ children }: { children: ReactNode }) => <p className="pq-hint">{children}</p>;

function SubmitBar({ disabled, onClick, label = 'Gửi đáp án', hint }: { disabled: boolean; onClick: () => void; label?: string; hint?: ReactNode }) {
  return (
    <div className="play-actions row between">
      <span className="small muted" style={{ fontWeight: 600 }}>{hint}</span>
      <button className="btn primary lg" disabled={disabled} onClick={onClick}>
        <Send size={20} /> {label}
      </button>
    </div>
  );
}

// ---------- 1: một đáp án – bấm là chọn ----------
function Choice({ q, seed, shuffleOptions, disabled, reveal, chosen, onSubmit, paper }: Props) {
  const opts = useMemo(() => (shuffleOptions ? shuffle(q.options, seed) : q.options), [q, seed, shuffleOptions]);
  const picked = chosen?.kind === 'choice' ? chosen.option_ids : [];
  return (
    <div className={`answers ${q.plain_options || paper ? 'plain' : ''} ${paper ? 'paper' : ''}`} role="radiogroup" aria-label="Các phương án">
      {opts.map((o, pos) => {
        const i = q.options.indexOf(o);
        const Shape = SHAPES[i % 6];
        const isSel = picked.includes(o.option_id);
        const cls = reveal ? (o.is_correct ? 'correct' : isSel ? 'wrong' : 'dim') : isSel ? 'selected' : '';
        return (
          <button key={o.option_id} className={`ans ${cls}`} style={q.plain_options || paper ? undefined : { background: optColor(i) }} disabled={disabled} role="radio" aria-checked={isSel} aria-label={o.text.replace(/<[^>]*>/g, '') || 'Phương án có hình'}
            onClick={() => onSubmit({ kind: 'choice', option_ids: [o.option_id] })}>
            {/* đề giấy: chữ cái A, B, C, D theo vị trí hiển thị (như đề in); trò chơi: hình màu */}
            <span className="shape" aria-hidden>{paper ? OPTION_LABELS[pos] : <Shape size={18} fill="currentColor" />}</span>
            <OptionBody o={o} />
          </button>
        );
      })}
    </div>
  );
}

// ---------- 2: Đúng / Sai – hai nút lớn ----------
function TrueFalse({ q, disabled, reveal, chosen, onSubmit }: Props) {
  const picked = chosen?.kind === 'choice' ? chosen.option_ids : [];
  return (
    <div className="pq-tf" role="radiogroup" aria-label="Đúng hay sai">
      {q.options.map((o) => {
        const isSel = picked.includes(o.option_id);
        const cls = reveal ? (o.is_correct ? 'right' : isSel ? 'wrong' : 'dim') : isSel ? 'sel' : '';
        return (
          <button key={o.option_id} className={`pq-tf-btn ${cls}`} disabled={disabled} role="radio" aria-checked={isSel} aria-label={o.text.replace(/<[^>]*>/g, '')}
            onClick={() => onSubmit({ kind: 'choice', option_ids: [o.option_id] })}>
            {reveal && o.is_correct && <Check size={22} />}
            {reveal && !o.is_correct && isSel && <X size={22} />}
            <OptionBody o={o} />
          </button>
        );
      })}
    </div>
  );
}

// ---------- 3: nhiều đáp án – tích các ô rồi gửi ----------
function MultiSelect({ q, seed, shuffleOptions, disabled, reveal, chosen, onSubmit, draft }: Props) {
  const opts = useMemo(() => (shuffleOptions ? shuffle(q.options, seed) : q.options), [q, seed, shuffleOptions]);
  const [sel, setSel] = useState<string[]>(draft?.kind === 'choice' ? draft.option_ids : []); // chọn lại đáp án: giữ các ô đã tích
  const picked = chosen?.kind === 'choice' ? chosen.option_ids : sel;
  return (
    <>
      <Hint>Em hãy chọn các đáp án em cho là đúng:</Hint>
      <div className="pq-multi" role="group" aria-label="Các phương án">
        {opts.map((o, k) => {
          const isSel = picked.includes(o.option_id);
          const cls = reveal ? (o.is_correct ? 'right' : isSel ? 'wrong' : 'dim') : isSel ? 'on' : '';
          return (
            <button key={o.option_id} className={`pq-opt ${cls}`} disabled={disabled} role="checkbox" aria-checked={isSel} aria-label={o.text.replace(/<[^>]*>/g, '') || `Phương án ${OPTION_LABELS[k]} có hình`}
              onClick={() => (sfx.pop(), setSel((s) => (s.includes(o.option_id) ? s.filter((x) => x !== o.option_id) : [...s, o.option_id])))}>
              <span className="pq-letter" aria-hidden>{isSel && !reveal ? <Check size={18} /> : OPTION_LABELS[k]}</span>
              <span className="grow"><OptionBody o={o} /></span>
              {reveal && o.is_correct && <Check size={20} color="#129a4b" />}
              {reveal && !o.is_correct && isSel && <X size={20} color="#dc2626" />}
            </button>
          );
        })}
      </div>
      {!reveal && (
        <SubmitBar disabled={disabled || sel.length === 0} onClick={() => onSubmit({ kind: 'choice', option_ids: sel })}
          hint={sel.length ? `Đã chọn ${sel.length} đáp án` : 'Có thể chọn nhiều đáp án'} />
      )}
    </>
  );
}

/** Tách câu dẫn thành các đoạn HTML và ô trống [blank_n]. */
function splitStem(html: string) {
  return sanitizeHtml(html).split(/\[(blank_\d+)\]/);
}

// ---------- 4: điền khuyết bằng cách gõ ----------
function Fill({ q, disabled, reveal, chosen, onSubmit, draft, onDraft }: Props) {
  const init = (chosen?.kind === 'fill' ? chosen.values : draft?.kind === 'fill' ? draft.values : {}) as Record<string, string>;
  const [vals, setVals] = useState<Record<string, string>>(init);
  const parts = splitStem(q.stem.text);
  const set = (id: string, v: string) => {
    const next = { ...vals, [id]: v };
    setVals(next);
    onDraft?.({ kind: 'fill', values: next });
  };
  const blanks = q.blanks ?? [];
  return (
    <>
      <div className="stem-card">
        {parts.map((p, i) =>
          i % 2 === 0 ? (
            <span key={i} dangerouslySetInnerHTML={{ __html: p }} />
          ) : (
            <span key={i}>
              <input
                className="blank-input"
                aria-label={`Ô trống ${(i + 1) / 2}`}
                placeholder={`(${(i + 1) / 2})`}
                value={vals[p] ?? ''}
                disabled={disabled}
                onChange={(e) => set(p, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !disabled && onSubmit({ kind: 'fill', values: vals })}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {reveal && <small className="badge green" style={{ marginRight: 6 }}>{blanks.find((b) => b.blank_id === p)?.accepted[0]}</small>}
            </span>
          ),
        )}
        <StemMedia stem={q.stem} />
      </div>
      {!reveal && <Hint>Gõ từ còn thiếu vào từng chỗ trống rồi bấm Gửi đáp án.</Hint>}
      {!reveal && <SubmitBar disabled={disabled || !Object.values(vals).some((v) => v.trim())} onClick={() => onSubmit({ kind: 'fill', values: vals })} />}
    </>
  );
}

// ---------- 4c: điền chỗ trống bằng menu thả xuống ngay tại chỗ trống ----------
function FillMenu({ q, seed, disabled, reveal, chosen, onSubmit, draft, onDraft }: Props) {
  const blanks = q.blanks ?? [];
  const words = useMemo(() => {
    const list = [...blanks.map((b) => b.accepted[0] ?? '').filter(Boolean), ...(q.distractors ?? [])];
    return shuffle([...new Set(list)], seed);
  }, [q, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const init = (chosen?.kind === 'fill' ? chosen.values : draft?.kind === 'fill' ? draft.values : {}) as Record<string, string>;
  const [vals, setVals] = useState<Record<string, string>>(init);
  const parts = splitStem(q.stem.text);
  const zones = parts.filter((_, i) => i % 2 === 1);
  const set = (id: string, v: string) => {
    sfx.pop();
    const next = { ...vals, [id]: v };
    if (!v) delete next[id];
    setVals(next);
    onDraft?.({ kind: 'fill', values: next });
  };
  const left = zones.filter((z) => !vals[z]).length;
  return (
    <>
      <div className="stem-card">
        {parts.map((p, i) => {
          if (i % 2 === 0) return <span key={i} dangerouslySetInnerHTML={{ __html: p }} />;
          const n = (i + 1) / 2;
          const b = blanks.find((x) => x.blank_id === p);
          const ok = reveal && !!vals[p] && !!b?.accepted.some((a) => a.trim().toLowerCase() === vals[p].trim().toLowerCase());
          return (
            <span key={i}>
              <select className={`pq-select ${vals[p] ? 'filled' : ''} ${reveal ? (ok ? 'right' : 'wrong') : ''}`} aria-label={`Chỗ trống ${n}: chọn đáp án`}
                value={vals[p] ?? ''} disabled={disabled} onChange={(e) => set(p, e.target.value)}>
                <option value="">({n}) Chọn…</option>
                {words.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              {reveal && !ok && <small className="badge green" style={{ marginRight: 6 }}>{b?.accepted[0]}</small>}
            </span>
          );
        })}
        <StemMedia stem={q.stem} />
      </div>
      {!reveal && <Hint>Bấm vào từng chỗ trống và chọn đáp án phù hợp trong danh sách:</Hint>}
      {!reveal && (
        <SubmitBar disabled={disabled || !Object.keys(vals).length} onClick={() => onSubmit({ kind: 'fill', values: vals })}
          hint={left ? `Còn ${left} chỗ trống chưa chọn` : 'Đã chọn đủ, bấm Gửi đáp án'} />
      )}
    </>
  );
}

/**
 * Cách chơi chung cho "điền bằng kho từ" và "kéo thả vào ô trống":
 * bấm một từ → từ tự vào chỗ trống đang chờ (hoặc chỗ trống đầu tiên còn trống); bấm lại ô đã điền để bỏ.
 * Vẫn kéo thả được bằng chuột.
 */
function BlankBoard<T extends { id: string }>({ q, items, render, text, isRight, answerOf, init, disabled, reveal, onSubmit, onDraft }: {
  q: Question;
  items: T[];
  render: (x: T) => ReactNode;
  text: (x: T) => string;
  isRight: (blankId: string, x: T) => boolean;
  answerOf: (blankId: string) => string | undefined; // đáp án đúng để hiện khi chấm
  init: Record<string, string>; // blank_id -> id thẻ
  disabled: boolean;
  reveal?: boolean;
  onSubmit: (place: Record<string, string>) => void;
  onDraft: (place: Record<string, string>) => void;
}) {
  const parts = splitStem(q.stem.text);
  const zones = parts.filter((_, i) => i % 2 === 1);
  const [place, setPlace] = useState<Record<string, string>>(init);
  const [target, setTarget] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const used = new Set(Object.values(place));
  const commit = (next: Record<string, string>) => {
    setPlace(next);
    onDraft(next);
  };
  const put = (zone: string, id: string) => {
    const next = { ...place };
    for (const z of Object.keys(next)) if (next[z] === id) delete next[z];
    next[zone] = id;
    setTarget(null);
    commit(next);
  };
  const tapItem = (id: string) => {
    sfx.pop();
    const zone = target && !place[target] ? target : zones.find((z) => !place[z]);
    if (zone) put(zone, id);
  };
  const tapZone = (zone: string) => {
    if (place[zone]) {
      sfx.pop();
      commit(Object.fromEntries(Object.entries(place).filter(([k]) => k !== zone)));
    } else setTarget((t) => (t === zone ? null : zone));
  };
  const full = zones.every((z) => place[z]);
  return (
    <>
      <div className="stem-card">
        {parts.map((p, i) => {
          if (i % 2 === 0) return <span key={i} dangerouslySetInnerHTML={{ __html: p }} />;
          const n = (i + 1) / 2;
          const x = items.find((it) => it.id === place[p]);
          const ok = reveal && !!x && isRight(p, x);
          return (
            <button key={i} type="button" className={`drop-zone ${x ? 'filled' : ''} ${over === p || target === p ? 'over' : ''} ${reveal ? (ok ? 'right' : 'wrong') : ''}`} disabled={disabled}
              aria-label={x ? `Chỗ trống ${n}: ${text(x)}. Bấm để bỏ` : `Chỗ trống ${n}${target === p ? ', đang chờ điền' : ''}`}
              onClick={() => tapZone(p)}
              onDragOver={(e) => (e.preventDefault(), setOver(p))}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) put(p, id);
              }}>
              {x ? render(x) : <span className="pq-blank-no">({n})</span>}
              {reveal && !ok && answerOf(p) && <small className="badge green" style={{ marginLeft: 6 }}>{answerOf(p)}</small>}
            </button>
          );
        })}
        <StemMedia stem={q.stem} />
      </div>
      {!reveal && <Hint>Bấm từ để điền vào chỗ trống (bấm lại ô đã điền để bỏ):</Hint>}
      <div className="pq-bank" aria-label="Kho từ">
        {items.filter((x) => !used.has(x.id)).map((x) => (
          <button key={x.id} type="button" className="pq-word" draggable={!disabled} disabled={disabled || full}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', x.id)} onClick={() => tapItem(x.id)}>{render(x)}</button>
        ))}
        {items.every((x) => used.has(x.id)) && <span className="small muted">Đã dùng hết từ</span>}
      </div>
      {!reveal && (
        <SubmitBar disabled={disabled || !Object.keys(place).length} onClick={() => onSubmit(place)}
          hint={full ? 'Đã điền đủ, bấm Gửi đáp án' : `Còn ${zones.filter((z) => !place[z]).length} chỗ trống`} />
      )}
    </>
  );
}

// ---------- 4b: điền chỗ trống bằng kho từ (có từ gây nhiễu) ----------
function FillBank({ q, seed, disabled, reveal, chosen, onSubmit, draft, onDraft }: Props) {
  const blanks = q.blanks ?? [];
  const words = useMemo(() => {
    const list = [...blanks.map((b) => b.accepted[0] ?? '').filter(Boolean), ...(q.distractors ?? [])];
    return shuffle(list.map((w, i) => ({ id: `w${i}`, w })), seed);
  }, [q, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = chosen?.kind === 'fill' ? chosen.values : draft?.kind === 'fill' ? draft.values : {};
  // khôi phục vị trí thẻ từ giá trị chữ đã lưu
  const init = useMemo(() => {
    const used = new Set<string>();
    const out: Record<string, string> = {};
    for (const [bid, val] of Object.entries(saved)) {
      const w = words.find((x) => x.w === val && !used.has(x.id));
      if (w) {
        out[bid] = w.id;
        used.add(w.id);
      }
    }
    return out;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const values = (place: Record<string, string>) => Object.fromEntries(Object.entries(place).map(([b, id]) => [b, words.find((x) => x.id === id)?.w ?? '']));
  return (
    <BlankBoard
      q={q} items={words} init={init} disabled={disabled} reveal={reveal}
      render={(x) => x.w} text={(x) => x.w}
      isRight={(bid, x) => !!blanks.find((b) => b.blank_id === bid)?.accepted.some((a) => a.trim().toLowerCase() === x.w.trim().toLowerCase())}
      answerOf={(bid) => blanks.find((b) => b.blank_id === bid)?.accepted[0]}
      onSubmit={(place) => onSubmit({ kind: 'fill', values: values(place) })}
      onDraft={(place) => onDraft?.({ kind: 'fill', values: values(place) })}
    />
  );
}

// ---------- 5: kéo thả thẻ vào ô trống ----------
function Drag({ q, seed, disabled, reveal, chosen, onSubmit, draft, onDraft }: Props) {
  const cards = useMemo(() => shuffle(q.options, seed).map((o) => ({ id: o.option_id, o })), [q, seed]);
  const init = chosen?.kind === 'drag' ? chosen.placement : draft?.kind === 'drag' ? draft.placement : {};
  const plain = (o: Option) => o.text.replace(/<[^>]*>/g, '');
  return (
    <BlankBoard
      q={q} items={cards} init={init} disabled={disabled} reveal={reveal}
      render={(x) => <OptionBody o={x.o} />} text={(x) => plain(x.o)}
      isRight={(zone, x) => x.o.match_pair_id === zone}
      answerOf={(zone) => {
        const o = q.options.find((c) => c.match_pair_id === zone);
        return o ? plain(o) : undefined;
      }}
      onSubmit={(placement) => onSubmit({ kind: 'drag', placement })}
      onDraft={(placement) => onDraft?.({ kind: 'drag', placement })}
    />
  );
}

// ---------- Trả lời miệng: ghi âm / gõ chữ (xem OralAnswer.tsx) ----------
function Oral(p: Props) {
  return <OralAnswer disabled={p.disabled} reveal={p.reveal} chosen={p.chosen} draft={p.draft} onSubmit={p.onSubmit} onDraft={p.onDraft} uploadAudio={p.uploadAudio} />;
}

// ---------- 6: sắp xếp thứ tự – bấm lần lượt từ cột trái sang cột "Thứ tự của em" ----------
function Reorder({ q, seed, disabled, reveal, chosen, onSubmit, draft, onDraft }: Props) {
  const pool = useMemo(() => {
    let s = shuffle(q.options, seed);
    // tránh trường hợp xáo ra đúng thứ tự sẵn
    if (s.every((o, i) => o.order_index === i) && s.length > 1) s = [...s.slice(1), s[0]];
    return s;
  }, [q, seed]);
  const [items, setItems] = useState<Option[]>(() => {
    const saved = chosen?.kind === 'order' ? chosen.option_ids : draft?.kind === 'order' ? draft.option_ids : [];
    return saved.map((id) => q.options.find((o) => o.option_id === id)!).filter(Boolean);
  });
  const [dragI, setDragI] = useState<number | null>(null);
  const chosenIds = new Set(items.map((o) => o.option_id));
  const rest = pool.filter((o) => !chosenIds.has(o.option_id));
  const update = (arr: Option[]) => {
    setItems(arr);
    onDraft?.({ kind: 'order', option_ids: arr.map((o) => o.option_id) });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    sfx.pop();
    const arr = items.slice();
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    update(arr);
  };
  const full = items.length === q.options.length;
  return (
    <>
      <div className="pq-order">
        {!reveal && (
          <div className="stack" style={{ gap: 8 }}>
            <Hint>① Bấm lần lượt các bước theo thứ tự:</Hint>
            {rest.map((o) => (
              <button key={o.option_id} type="button" className="pq-step" disabled={disabled} onClick={() => (sfx.pop(), update([...items, o]))}>
                <OptionBody o={o} />
              </button>
            ))}
            {!rest.length && <p className="pq-empty">Đã chọn hết các bước</p>}
          </div>
        )}
        <div className="stack" style={{ gap: 8 }}>
          <Hint>② Thứ tự của em{items.length > 1 && !reveal && <span className="pq-sub"> (kéo thả hoặc ↑ ↓ để đổi chỗ)</span>}</Hint>
          {!items.length && <p className="pq-empty">Chưa chọn bước nào</p>}
          <ol className="order-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((o, i) => (
              <li
                key={o.option_id}
                className={`order-item pq-picked ${dragI === i ? 'dragging' : ''} ${reveal ? (o.order_index === i ? 'right' : 'wrong') : ''}`}
                draggable={!disabled}
                onDragStart={() => setDragI(i)}
                onDragEnd={() => setDragI(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragI !== null && dragI !== i) {
                    move(dragI, i);
                    setDragI(i);
                  }
                }}
              >
                {!reveal && <GripVertical size={20} aria-hidden style={{ color: '#94a3b8', cursor: 'grab', flex: 'none' }} />}
                <span className="pq-no">{i + 1}</span>
                <span className="grow"><OptionBody o={o} /></span>
                {!reveal && (
                  <>
                    <button className="btn icon sm ghost" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} aria-label="Đưa lên trên"><ArrowUp size={18} /></button>
                    <button className="btn icon sm ghost" disabled={disabled || i === items.length - 1} onClick={() => move(i, i + 1)} aria-label="Đưa xuống dưới"><ArrowDown size={18} /></button>
                    <button className="btn icon sm ghost" disabled={disabled} onClick={() => (sfx.pop(), update(items.filter((x) => x !== o)))} aria-label="Bỏ bước này" style={{ color: '#dc2626' }}><X size={18} /></button>
                  </>
                )}
                {reveal && (o.order_index === i ? <Check size={20} color="#129a4b" /> : <X size={20} color="#dc2626" />)}
              </li>
            ))}
          </ol>
        </div>
      </div>
      {!reveal && (
        <SubmitBar disabled={disabled || !full} label="Xác nhận" onClick={() => onSubmit({ kind: 'order', option_ids: items.map((o) => o.option_id) })}
          hint={full ? 'Đã đủ các bước, bấm Xác nhận' : `Còn ${q.options.length - items.length} bước chưa chọn`} />
      )}
    </>
  );
}

// ---------- 7: nối cột – bấm ô cột A rồi bấm ô cột B, có đường nối ----------
const PAIR_COLORS = ['#5b3df5', '#0e9aa7', '#d97706', '#129a4b', '#db2777', '#1668f2', '#b45309', '#64748b'];

function Match({ q, seed, disabled, reveal, chosen, onSubmit, draft, onDraft }: Props) {
  const lefts = useMemo(() => shuffle(q.options.filter((o) => o.side === 'left'), seed), [q, seed]);
  const rights = useMemo(() => shuffle(q.options.filter((o) => o.side === 'right'), seed + 7), [q, seed]);
  const init = chosen?.kind === 'match' ? chosen.pairs : draft?.kind === 'match' ? draft.pairs : {};
  const [pairs, setPairs] = useState<Record<string, string>>(init);
  const [selL, setSelL] = useState<string | null>(null);
  const colorOf = (leftId: string) => PAIR_COLORS[lefts.findIndex((l) => l.option_id === leftId) % PAIR_COLORS.length];
  const leftOfRight = (rid: string) => Object.keys(pairs).find((l) => pairs[l] === rid);
  const isOk = (leftId: string) => {
    const l = q.options.find((o) => o.option_id === leftId);
    return !!l && q.options.find((o) => o.option_id === pairs[leftId])?.match_pair_id === l.match_pair_id;
  };

  // Đường nối: đo vị trí các ô rồi vẽ đường cong SVG
  const box = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<{ id: string; d: string; x1: number; y1: number; x2: number; y2: number }[]>([]);
  const measure = useCallback(() => {
    const host = box.current;
    if (!host) return;
    const base = host.getBoundingClientRect();
    const out = [];
    for (const [l, r] of Object.entries(pairs)) {
      const a = els.current.get(l)?.getBoundingClientRect();
      const b = els.current.get(r)?.getBoundingClientRect();
      if (!a || !b) continue;
      const x1 = a.right - base.left, y1 = a.top + a.height / 2 - base.top;
      const x2 = b.left - base.left, y2 = b.top + b.height / 2 - base.top;
      const k = Math.max(16, (x2 - x1) / 2);
      out.push({ id: l, d: `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`, x1, y1, x2, y2 });
    }
    setLines(out);
  }, [pairs]);
  useLayoutEffect(() => {
    measure();
    const ro = typeof ResizeObserver !== 'undefined' && box.current ? new ResizeObserver(measure) : null;
    if (ro && box.current) ro.observe(box.current);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);
  const ref = (id: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  };

  const update = (next: Record<string, string>) => {
    setPairs(next);
    onDraft?.({ kind: 'match', pairs: next });
  };
  const clickLeft = (id: string) => {
    sfx.pop();
    if (pairs[id]) {
      // bấm lại ô A đã nối → gỡ để nối lại
      const n = { ...pairs };
      delete n[id];
      update(n);
    }
    setSelL((x) => (x === id ? null : id));
  };
  const clickRight = (rid: string) => {
    sfx.pop();
    const owner = leftOfRight(rid);
    if (!selL) {
      if (owner) {
        const n = { ...pairs };
        delete n[owner];
        update(n);
      }
      return;
    }
    const n = { ...pairs };
    if (owner) delete n[owner];
    n[selL] = rid;
    update(n);
    setSelL(null);
  };

  return (
    <>
      {!reveal && <Hint>Bấm một ô ở cột A, rồi bấm ô cần nối ở cột B (bấm lại ô A để nối lại):</Hint>}
      <div className="match-cols pq-match" ref={box}>
        <div className="stack" aria-label="Cột A">
          <b className="pq-col a">CỘT A</b>
          {lefts.map((l, i) => {
            const paired = !!pairs[l.option_id];
            const ok = reveal && isOk(l.option_id);
            return (
              <button key={l.option_id} ref={ref(l.option_id)} className={`match-item ${selL === l.option_id ? 'sel' : ''} ${reveal ? (ok ? 'right' : 'wrong') : ''}`} disabled={disabled}
                onClick={() => clickLeft(l.option_id)} aria-pressed={selL === l.option_id}
                style={!reveal && (paired || selL === l.option_id) ? { borderColor: colorOf(l.option_id) } : undefined}>
                <span className="pq-tag a">A{i + 1}</span>
                <span className="grow"><OptionBody o={l} /></span>
                {reveal && (ok ? <Check size={18} color="#129a4b" /> : <X size={18} color="#dc2626" />)}
              </button>
            );
          })}
        </div>
        <div className="stack" aria-label="Cột B">
          <b className="pq-col b">CỘT B</b>
          {rights.map((r, i) => {
            const owner = leftOfRight(r.option_id);
            return (
              <button key={r.option_id} ref={ref(r.option_id)} className="match-item" disabled={disabled} onClick={() => clickRight(r.option_id)}
                aria-label={owner ? undefined : selL ? 'Bấm để nối với ô đang chọn ở cột A' : undefined}
                style={owner ? { borderColor: reveal ? (isOk(owner) ? '#129a4b' : '#dc2626') : colorOf(owner) } : undefined}>
                <span className="pq-tag b">B{i + 1}</span>
                <span className="grow"><OptionBody o={r} /></span>
              </button>
            );
          })}
        </div>
        <svg aria-hidden>
          {lines.map((ln) => {
            const c = reveal ? (isOk(ln.id) ? '#129a4b' : '#dc2626') : colorOf(ln.id);
            return (
              <g key={ln.id} stroke={c} fill={c}>
                <path d={ln.d} fill="none" strokeWidth={4} strokeLinecap="round" />
                <circle cx={ln.x1} cy={ln.y1} r={5} />
                <circle cx={ln.x2} cy={ln.y2} r={5} />
              </g>
            );
          })}
        </svg>
      </div>
      {!reveal && (
        <SubmitBar
          disabled={disabled || !Object.keys(pairs).length}
          onClick={() => onSubmit({ kind: 'match', pairs })}
          hint={selL ? 'Bấm một ô ở cột B để nối' : `Đã nối ${Object.keys(pairs).length}/${lefts.length} cặp`}
        />
      )}
    </>
  );
}
