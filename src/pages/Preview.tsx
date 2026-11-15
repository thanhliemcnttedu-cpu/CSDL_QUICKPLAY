// Giáo viên chơi thử bộ câu hỏi của mình với vai trò học sinh: đúng giao diện trả lời của học sinh, không tạo phòng, không lưu kết quả.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Quiz } from '../lib/types';
import { api } from '../lib/api';
import { Spinner } from '../components/ui';
import { builtinQuiz, isBuiltinId } from '../lib/factory';
import { Tryout } from './Demo';

export default function Preview() {
  const { id = '' } = useParams();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    // Bộ mặc định của Quickplay (id builtin_…) dựng sẵn trong mã, không nằm trong kho
    if (isBuiltinId(id)) {
      const b = builtinQuiz(id);
      if (b) setQuiz(b);
      else setErr('Không tìm thấy bộ câu hỏi mặc định này.');
      return;
    }
    api.getQuiz(id).then(setQuiz).catch((e) => setErr((e as Error).message));
  }, [id]);
  if (err) return <div className="page stack"><div className="alert error"><div>{err}</div></div><Link className="btn" to="/teacher">Về thư viện</Link></div>;
  if (!quiz) return <div className="page"><Spinner label="Đang mở bộ câu hỏi…" /></div>;
  if (!quiz.questions.length)
    return <div className="page stack"><div className="alert warn"><div>Bộ câu hỏi này chưa có câu nào để chơi thử.</div></div><Link className="btn primary" to={`/teacher/edit/${id}`}>Thêm câu hỏi</Link></div>;
  return <Tryout key={id} quiz={quiz} previewId={id} readOnly={isBuiltinId(id)} />;
}
