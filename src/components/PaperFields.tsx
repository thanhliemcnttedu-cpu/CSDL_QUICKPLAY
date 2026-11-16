// Ô thông tin đề thi: Khối lớp, Môn, Thời điểm kiểm tra, Mã đề (tự gợi ý, sửa được). Dùng ở hộp "Tạo đề thi từ kho" và trình soạn.
import { Wand2 } from 'lucide-react';
import type { Catalog, ExamPeriod } from '../lib/types';
import { PERIODS, PERIOD_LABEL, isSchoolYear, normalizeSchoolYear, rememberSchool, schoolYearChoices, schoolYearOf, suggestCode } from '../lib/examPaper';

/** school, year: tên trường và năm học in ở đầu "Đề giấy" (giáo viên nhập khi tạo đề) */
export interface PaperInfo { grade: string; subject: string; period: ExamPeriod; code: string; school?: string; year?: string }

const DEFAULT_GRADES = ['Lớp 1', 'Lớp 2', 'Lớp 3', 'Lớp 4', 'Lớp 5'];

export function PaperFields({ value, onChange, catalog, usedCodes, compact, placeFromQuiz }: {
  placeFromQuiz?: boolean; // trình soạn: Khối lớp và Môn lấy theo ô ở trên, không hỏi lại
  value: PaperInfo;
  onChange: (v: PaperInfo) => void;
  catalog: Catalog;
  usedCodes: string[]; // mã đề đã có trong thư viện (để gợi ý mã chưa trùng)
  compact?: boolean;
}) {
  const grades = catalog.grades?.length ? catalog.grades : DEFAULT_GRADES;
  const subjects = [...new Set(catalog.subjects.filter((s) => !value.grade || !s.grade || s.grade === value.grade).map((s) => s.name))];
  const set = (p: Partial<PaperInfo>) => onChange({ ...value, ...p });
  const auto = () => set({ code: suggestCode(value.subject, value.grade, value.period, usedCodes) });
  const yearBad = !!value.year?.trim() && !isSchoolYear(value.year);
  const dup = !!value.code && usedCodes.some((c) => c.toUpperCase() === value.code.trim().toUpperCase());
  return (
    <div className={`paper-fields ${compact ? 'compact' : ''}`}>
      {!placeFromQuiz && <>
      <label className="field">
        <span>Khối lớp</span>
        <select className="input" value={value.grade} onChange={(e) => set({ grade: e.target.value })}>
          <option value="">Chọn khối lớp…</option>
          {[...new Set([...grades, ...(value.grade ? [value.grade] : [])])].map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Môn học</span>
        <input className="input" list="paper-subjects" value={value.subject} maxLength={60} placeholder="VD: Tin học" onChange={(e) => set({ subject: e.target.value })} />
        <datalist id="paper-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
      </label>
      </>}
      <label className="field">
        <span>Thời điểm kiểm tra</span>
        <select className="input" value={value.period} onChange={(e) => set({ period: e.target.value as ExamPeriod })}>
          {PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Mã đề</span>
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <input className="input" value={value.code} maxLength={40} placeholder="VD: TIN3-CK1-01" aria-invalid={dup || undefined}
            onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s+/g, '') })} />
          <button type="button" className="btn icon ghost" onClick={auto} title="Gợi ý mã đề chưa dùng" aria-label="Gợi ý mã đề"><Wand2 size={18} /></button>
        </div>
        {dup && <small className="help" style={{ color: 'var(--danger)' }}>Mã đề này đã có trong thư viện. Nên đặt mã khác để dễ phân biệt.</small>}
      </label>
      {/* In ở đầu "Đề giấy" khi tổ chức thi */}
      <label className="field">
        <span>Tên trường</span>
        <input className="input" value={value.school ?? ''} maxLength={80} placeholder="VD: Trường Tiểu học Tân Uyên"
          onChange={(e) => { set({ school: e.target.value }); rememberSchool(e.target.value); }} />
      </label>
      {/* Năm học: thầy cô tự gõ (VD 2026-2027) hoặc chọn gợi ý; gõ "2026-2027" tự đổi thành "2026–2027" */}
      <label className="field">
        <span>Năm học</span>
        <input className="input" list="paper-years" value={value.year ?? ''} maxLength={20} placeholder={`VD: ${schoolYearOf()}`} inputMode="numeric"
          aria-invalid={yearBad || undefined}
          onChange={(e) => set({ year: e.target.value })}
          onBlur={(e) => set({ year: normalizeSchoolYear(e.target.value) || schoolYearOf() })} />
        <datalist id="paper-years">{schoolYearChoices().map((y) => <option key={y} value={y} />)}</datalist>
        {yearBad && <small className="help" style={{ color: 'var(--danger)' }}>Ghi năm học dạng 2026–2027 (năm sau lớn hơn năm trước 1).</small>}
      </label>
    </div>
  );
}
