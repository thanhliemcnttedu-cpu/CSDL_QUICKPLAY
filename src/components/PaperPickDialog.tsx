// Trước khi tổ chức bằng thẻ giấy: cho giáo viên biết câu nào dùng được (thẻ chỉ có A–D), câu nào bị bỏ qua, rồi chọn câu sẽ dùng.
import { useEffect, useMemo, useState } from 'react';
import { Check, Play } from 'lucide-react';
import { paperReason } from '../lib/paper';
import { TYPE_LABELS } from '../lib/factory';
import { htmlToText } from '../lib/util';
import type { Quiz } from '../lib/types';
import { Modal } from './ui';

interface Props {
  quiz: Quiz;
  onConfirm: (questionIds: string[]) => void;
  onClose: () => void;
}

export function PaperPickDialog({ quiz, onConfirm, onClose }: Props) {
  const suitable = useMemo(() => quiz.questions.map((q, i) => ({ q, i })).filter(({ q }) => paperReason(q) === null), [quiz]);
  const unsuitable = useMemo(() => quiz.questions.map((q, i) => ({ q, i, why: paperReason(q) })).filter((x) => x.why !== null), [quiz]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(suitable.map(({ q }) => q.id)));
  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const ids = suitable.filter(({ q }) => picked.has(q.id)).map(({ q }) => q.id);
  // Đang mở hộp thoại thì trang phía sau không cuộn theo chuột
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = old; };
  }, []);
  const allOn = ids.length === suitable.length;
  const text = (q: Quiz['questions'][number]) => htmlToText(q.stem.text) || 'Câu có hình ảnh hoặc âm thanh';

  return (
    <Modal title="Chọn câu dùng cho thẻ giấy" onClose={onClose} wide footer={
      <>
        <span className="muted small pp-pick-sum">Đã chọn <b>{ids.length}</b> / {suitable.length} câu</span>
        <button className="btn primary" disabled={!ids.length} onClick={() => onConfirm(ids)}><Play size={18} /> Bắt đầu với {ids.length} câu</button>
      </>
    }>
      <div className="pp-pick">
        <div className="pp-pick-top">
          <p className="pp-pick-title">Bộ đề: <span className="pp-pick-name">“{quiz.title}”</span> · {quiz.questions.length} câu</p>
          <div className="pp-pick-chips">
            <span className="pp-chip ok">{suitable.length} câu dùng được</span>
            <span className="pp-chip bad">{unsuitable.length} câu bỏ qua</span>
          </div>
          <div className="pp-pick-actions">
            <button type="button" className="btn ghost sm" disabled={allOn} onClick={() => setPicked(new Set(suitable.map(({ q }) => q.id)))}>Chọn tất cả</button>
            <button type="button" className="btn ghost sm" disabled={!ids.length} onClick={() => setPicked(new Set())}>Bỏ chọn tất cả</button>
          </div>
        </div>
        <p className="pp-pick-rule">Thẻ giấy chỉ có chữ A–D và một đáp án. Câu dùng được: một đáp án đúng, 2 đến 4 phương án.</p>

        <div className="pp-pick-scroll">
          {suitable.length === 0 && <p className="muted" style={{ margin: 0 }}>Không có câu nào dùng được. Hãy sửa câu trong bộ đề rồi thử lại.</p>}
          {suitable.map(({ q, i }) => {
            const on = picked.has(q.id);
            return (
              <label key={q.id} className={`pp-pick-row ${on ? 'on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(q.id)} aria-label={`Dùng câu ${i + 1}`} />
                <span className="pp-pick-box" aria-hidden>{on && <Check size={14} strokeWidth={3} />}</span>
                <span className="pp-pick-no">{i + 1}</span>
                <span className="pp-pick-main">
                  <span className="pp-pick-stem">{text(q)}</span>
                  <span className="pp-pick-meta">{TYPE_LABELS[q.type]} · {q.options.length} phương án</span>
                </span>
              </label>
            );
          })}
        </div>

        {unsuitable.length > 0 && (
          <details className="pp-pick-skip">
            <summary>Xem {unsuitable.length} câu bị bỏ qua và lý do</summary>
            <ul>
              {unsuitable.map(({ q, i, why }) => (
                <li key={q.id}><b>Câu {i + 1}:</b> {text(q)} <span className="bad-text">— {why}</span></li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Modal>
  );
}
