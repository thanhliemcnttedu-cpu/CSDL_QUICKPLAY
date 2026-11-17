// Chuyển một câu hỏi sang bộ đề khác (có thể ở môn, chương, bài khác): câu được thêm vào cuối bộ đề đích.
import { useEffect, useMemo, useState } from 'react';
import { FolderInput } from 'lucide-react';
import { api } from '../lib/api';
import { uid } from '../lib/util';
import type { Catalog, Question, QuizSummary } from '../lib/types';
import { namesOf, withPlace } from '../lib/share';
import { Modal, useToast } from './ui';

interface Props {
  question: Question;
  /** Bộ đề đang soạn (không hiện trong danh sách đích) */
  currentId: string;
  onClose: () => void;
  /** Gọi sau khi đã thêm câu vào bộ đề đích; bộ đề hiện tại phải bỏ câu này */
  onMoved: (targetTitle: string) => void;
}

/** Bộ đề đích có thể là bộ đề của mình (không gồm đề thi đã phát hành mã đề). */
export function MoveQuestionDialog({ question, currentId, onClose, onMoved }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<QuizSummary[] | null>(null);
  const [target, setTarget] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listQuizzes().then((list) => {
      const mine = list.filter((x) => x.id !== currentId && !x.paper_period);
      setItems(mine);
      setTarget(mine[0]?.id ?? '');
    }).catch((e) => { setItems([]); toast((e as Error).message, 'error'); });
  }, [currentId, toast]);

  // nhóm theo môn để dễ tìm bộ đề đích
  const groups = useMemo(() => {
    const m = new Map<string, QuizSummary[]>();
    for (const x of items ?? []) {
      const key = x.subject || 'Chưa phân loại';
      m.set(key, [...(m.get(key) ?? []), x]);
    }
    return [...m.entries()];
  }, [items]);

  const move = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const full = await api.getQuiz(target);
      const used = new Set(full.questions.map((x) => x.id));
      // mã câu phải không trùng trong bộ đề đích
      const copy: Question = JSON.parse(JSON.stringify(question));
      if (used.has(copy.id)) copy.id = uid('q');
      // nhãn môn, bài của câu theo bộ đích (câu chuyển sang môn khác phải mang nhãn môn mới)
      const cat: Catalog = (await api.getCatalog().catch(() => null)) ?? { subjects: [] };
      const n = namesOf(cat, full);
      const placed = withPlace(copy, n.subject || full.subject || '', n.lesson);
      await api.saveQuiz({ ...full, questions: [...full.questions, placed], updated_at: new Date().toISOString() });
      onMoved(full.title);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Chuyển câu hỏi sang bộ đề khác" onClose={onClose} footer={
      <button className="btn primary" onClick={move} disabled={!target || busy}><FolderInput size={18} /> {busy ? 'Đang chuyển…' : 'Chuyển câu'}</button>
    }>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>Câu hỏi sẽ được thêm vào cuối bộ đề bạn chọn, rồi bỏ khỏi bộ đề đang soạn. Muốn chuyển sang môn khác, hãy chọn bộ đề thuộc môn đó.</p>
        {items === null && <span className="muted">Đang tải danh sách bộ đề…</span>}
        {items?.length === 0 && <span className="muted">Chưa có bộ đề nào khác để chuyển tới.</span>}
        {groups.map(([subject, list]) => (
          <fieldset key={subject} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px' }}>
            <legend className="small"><b>{subject}</b></legend>
            <div className="stack" style={{ gap: 4 }}>
              {list.map((x) => (
                <label key={x.id} className="row" style={{ gap: 8 }}>
                  <input type="radio" name="move-target" checked={target === x.id} onChange={() => setTarget(x.id)} />
                  <span style={{ overflowWrap: 'anywhere' }}>{x.title} <span className="muted small">· {x.question_count} câu</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </Modal>
  );
}
