// "Đề giấy": phần đầu tờ bài kiểm tra (trường, họ tên, lớp | ngày, kì kiểm tra, năm học, mã đề, môn, thời gian)
// và ô "Điểm | Lời phê của thầy cô" (trước khi nộp: "Chưa nộp bài"; sau khi nộp: điểm và lời phê tự động).
import type { ExamPeriod } from '../lib/types';
import { fmtPoint, sheetTitle, sheetYear, subjectLine, vnDate } from '../lib/paperSheet';
import { Mascot } from './Mascot';
import '../paper-sheet.css';

export interface SheetInfo {
  school?: string;
  name: string;
  className?: string;
  period?: ExamPeriod;
  year?: string;
  code?: string;
  subject?: string;
  grade?: string;
  minutes?: number;
  date: Date;
}

/** Huy hiệu mã đề: "DE05"/"Đề 5" → "ĐỀ 05"; mã khác (TIN3-CK1-02) → "MÃ ĐỀ TIN3-CK1-02". */
export function codeBadge(code: string): string {
  const m = code.trim().match(/^(?:đề|de)\s*[-.]?\s*(\d+)$/i);
  return m ? `ĐỀ ${m[1].padStart(2, '0')}` : `MÃ ĐỀ ${code.trim().toUpperCase()}`;
}

export function PaperSheetHead({ info, score }: {
  info: SheetInfo;
  /** null: chưa nộp bài */
  score: { mark: number; comment: string; note?: string } | null;
}) {
  const subj = subjectLine(info.subject, info.grade);
  return (
    <div className="ps-head-wrap">
      <span className="ps-pin" aria-hidden><Mascot pose={score ? 'celebrate' : 'wave'} size={58} still /></span>
      <div className="ps-head">
        <div className="ps-who">
          <div className="ps-line"><b>Trường:</b><span>{info.school || ' '}</span></div>
          <div className="ps-line"><b>Họ và tên:</b><span>{info.name}</span></div>
          <div className="ps-line"><b>Lớp:</b><span>{info.className || ' '}</span></div>
        </div>
        <div className="ps-title">
          <i>{vnDate(info.date)}</i>
          <h2>{sheetTitle(info.period)}</h2>
          <div className="ps-year">
            Năm học: {sheetYear(info.year, info.date)}
            {info.code && <span className="ps-code">{codeBadge(info.code)}</span>}
          </div>
          <i>{[subj, info.minutes ? `Thời gian: ${info.minutes} phút` : ''].filter(Boolean).join(' | ')}</i>
        </div>
      </div>
      <table className="ps-score">
        <thead>
          <tr><th>Điểm</th><th>Lời phê của thầy cô</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="ps-mark">
              {score ? <><b>{fmtPoint(score.mark)}</b><small> / 10</small>{score.note && <em>{score.note}</em>}</> : <span className="muted">Chưa nộp bài</span>}
            </td>
            <td className="ps-comment">
              {score ? <p>{score.comment}</p> : <p className="ps-wish">Chúc em bình tĩnh, tự tin và làm bài tốt!</p>}
              <span className="ps-rule" /><span className="ps-rule" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
