// Trước khi tổ chức bằng thẻ giấy: cho giáo viên biết câu nào dùng được (thẻ chỉ có A–D), câu nào bị bỏ qua, rồi chọn câu sẽ dùng.
import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
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

  return (
    <Modal title="Chọn câu dùng cho thẻ giấy" onClose={onClose} wide footer={
      <button className="btn primary" disabled={!ids.length} onClick={() => onConfirm(ids)}><Play size={18} /> Bắt đầu với {ids.length} câu</button>
    }>
      <div className="stack">
        <p style={{ margin: 0 }}>
          Bộ “<b>{quiz.title}</b>” có <b>{quiz.questions.length}</b> câu: <b style={{ color: 'var(--ok, #15994f)' }}>{suitable.length} câu phù hợp</b> với thẻ giấy, <b style={{ color: 'var(--bad, #dc2626)' }}>{unsuitable.length} câu không phù hợp</b> (sẽ không đưa vào buổi học).
        </p>
        <p className="muted small" style={{ margin: 0 }}>Thẻ giấy chỉ có chữ A–D và chọn một đáp án. Câu phù hợp: một đáp án đúng, từ 2 đến 4 phương án.</p>

        <h3 style={{ margin: '4px 0 0' }}>Câu phù hợp ({picked.size}/{suitable.length} đã chọn)</h3>
        <div className="stack" style={{ gap: 6, maxHeight: '36vh', overflow: 'auto' }}>
          {suitable.length === 0 && <span className="muted">Không có câu nào phù hợp. Hãy sửa câu trong bộ đề rồi thử lại.</span>}
          {suitable.map(({ q, i }) => (
            <label key={q.id} className="card row" style={{ gap: 10, padding: 10, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q.id)} aria-label={`Dùng câu ${i + 1}`} />
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <b>Câu {i + 1}</b> <span className="tag">{TYPE_LABELS[q.type]}</span> <span className="tag">{q.options.length} phương án</span>
                <br /><span className="small">{htmlToText(q.stem.text) || '(câu bằng ảnh hoặc âm thanh)'}</span>
              </span>
            </label>
          ))}
        </div>

        {unsuitable.length > 0 && (
          <>
            <h3 style={{ margin: '4px 0 0' }}>Câu không phù hợp (bỏ qua)</h3>
            <div className="stack" style={{ gap: 6, maxHeight: '24vh', overflow: 'auto' }}>
              {unsuitable.map(({ q, i, why }) => (
                <div key={q.id} className="card" style={{ padding: 10, opacity: 0.8 }}>
                  <b>Câu {i + 1}</b> <span className="tag">{TYPE_LABELS[q.type]}</span>
                  <span className="small" style={{ display: 'block', overflowWrap: 'anywhere' }}>{htmlToText(q.stem.text) || '(câu bằng ảnh hoặc âm thanh)'}</span>
                  <span className="small" style={{ color: 'var(--bad, #dc2626)' }}>Lý do: {why}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
