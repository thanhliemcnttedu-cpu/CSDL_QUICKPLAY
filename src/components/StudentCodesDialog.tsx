// Mã số học sinh của một lớp: giáo viên tự đặt từng mã, hoặc tạo tự động theo tiền tố + số thứ tự, rồi xuất Excel để phát cho học sinh.
// Mã này là "chìa khóa" để học sinh vào bài kiểm tra giao cho lớp.
import { useMemo, useState } from 'react';
import { FileSpreadsheet, Save, Wand2 } from 'lucide-react';
import type { ClassRoom } from '../lib/types';
import { api } from '../lib/api';
import { normCode } from '../lib/sessionLogic';
import { buildXlsx, downloadBlob } from '../lib/xlsx';
import { Modal, useToast, askConfirm } from './ui';

/** Tạo mã theo tiền tố + số thứ tự: HS1, HS2… (pad = số chữ số tối thiểu, ví dụ 2 → HS01). */
export function makeCodes(count: number, prefix: string, start: number, pad = 0): string[] {
  return Array.from({ length: count }, (_, i) => normCode(prefix + String(start + i).padStart(pad, '0')));
}

/** Các dòng của tệp Excel danh sách mã số học sinh. */
export function codeSheetRows(className: string, students: string[], codes: string[]): (string | number)[][] {
  return [
    [`Danh sách mã số học sinh lớp ${className}`],
    [],
    ['STT', 'Họ và tên', 'Lớp', 'Mã số học sinh'],
    ...students.map((name, i) => [i + 1, name, className, codes[i] ?? '']),
  ];
}

export function StudentCodesDialog({ cls, onClose, onSaved }: { cls: ClassRoom; onClose: () => void; onSaved: (c: ClassRoom) => void }) {
  const toast = useToast();
  const [codes, setCodes] = useState<string[]>(() => cls.students.map((_, i) => cls.codes?.[i] ?? ''));
  const [prefix, setPrefix] = useState('HS');
  const [start, setStart] = useState('1');
  const [busy, setBusy] = useState(false);
  const clean = useMemo(() => codes.map(normCode), [codes]);
  const dup = useMemo(() => {
    const n = new Map<string, number>();
    clean.forEach((c) => c && n.set(c, (n.get(c) ?? 0) + 1));
    return new Set([...n].filter(([, k]) => k > 1).map(([c]) => c));
  }, [clean]);
  const missing = clean.filter((c) => !c).length;
  const dirty = clean.some((c, i) => c !== (cls.codes?.[i] ?? ''));

  const auto = async () => {
    const from = Math.round(Number(start));
    if (!Number.isFinite(from) || from < 0 || start.trim() === '') return toast('"Bắt đầu từ số" phải là một số từ 0 trở lên.', 'error');
    if (clean.some(Boolean) && !(await askConfirm('Tạo lại mã cho cả lớp? Các mã đang có sẽ được thay bằng mã mới.', { okLabel: 'Tạo lại mã' }))) return;
    setCodes(makeCodes(cls.students.length, prefix, from));
  };

  const save = async (): Promise<ClassRoom | null> => {
    if (dup.size) {
      toast(`Mã ${[...dup].join(', ')} đang bị trùng. Mỗi học sinh cần một mã riêng.`, 'error');
      return null;
    }
    setBusy(true);
    try {
      const saved = await api.saveClass({ id: cls.id, name: cls.name, students: cls.students, codes: clean });
      toast(missing ? `Đã lưu mã. Còn ${missing} em chưa có mã.` : `Đã lưu mã cho ${saved.students.length} học sinh lớp ${saved.name}.`, 'ok');
      onSaved(saved);
      return saved;
    } catch (e) {
      const m = (e as Error).message;
      toast(/không hợp lệ|Hành động/.test(m) ? 'Apps Script đang chạy bản cũ. Vào Cài đặt → Xem 5 bước cập nhật rồi lưu lại.' : m, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = async () => {
    if (!clean.some(Boolean)) return toast('Chưa có mã nào để xuất. Hãy đặt mã hoặc bấm "Tạo mã tự động" trước.', 'error');
    if (dirty && !(await save())) return; // xuất đúng những gì đã lưu
    const blob = await buildXlsx([{ name: `Lớp ${cls.name}`, rows: codeSheetRows(cls.name, cls.students, clean) }]);
    downloadBlob(`Ma-so-hoc-sinh-lop-${cls.name.replace(/[\\/:*?"<>|\s]+/g, '-')}.xlsx`, blob);
    toast('Đã tải tệp Excel danh sách mã số học sinh.', 'ok');
  };

  return (
    <Modal
      wide
      title={`Mã số học sinh lớp ${cls.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Đóng</button>
          <button className="btn" onClick={exportExcel} disabled={busy}><FileSpreadsheet size={18} /> Xuất Excel</button>
          <button className="btn primary" onClick={save} disabled={busy || !dirty}><Save size={18} /> {busy ? 'Đang lưu…' : 'Lưu mã'}</button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          Mỗi học sinh một mã riêng. Khi làm <b>bài kiểm tra</b> giao cho lớp này, em nhập mã PIN của phòng rồi nhập mã số của mình.
          Thầy cô tự gõ mã vào từng ô, hoặc tạo tự động theo số thứ tự.
        </p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 150 }}><span>Chữ đứng đầu mã</span><input className="input" value={prefix} maxLength={10} onChange={(e) => setPrefix(e.target.value)} placeholder="HS" /></label>
          <label className="field" style={{ width: 150 }}><span>Bắt đầu từ số</span><input className="input" type="number" inputMode="numeric" min={0} value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <button type="button" className="btn accent" onClick={auto}><Wand2 size={18} /> Tạo mã tự động</button>
          <span className="muted small">Ví dụ: {makeCodes(Math.min(3, cls.students.length), prefix, Math.max(0, Math.round(Number(start)) || 0)).join(', ')}…</span>
        </div>
        <div className="table-wrap code-table">
          <table className="table">
            <thead><tr><th style={{ width: 60 }}>STT</th><th>Họ và tên</th><th style={{ width: 200 }}>Mã số học sinh</th></tr></thead>
            <tbody>
              {cls.students.map((name, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{name}</td>
                  <td>
                    <input className="input" value={codes[i]} maxLength={20} aria-label={`Mã số của ${name}`} aria-invalid={dup.has(clean[i]) || undefined}
                      style={dup.has(clean[i]) ? { borderColor: '#dc2626', background: '#fff1f1' } : undefined}
                      onChange={(e) => setCodes((x) => x.map((c, k) => (k === i ? e.target.value : c)))}
                      onBlur={() => setCodes((x) => x.map((c, k) => (k === i ? normCode(c) : c)))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={`alert ${dup.size ? 'error' : missing ? 'warn' : 'ok'}`} role="status">
          <div>
            {dup.size ? <>Mã <b>{[...dup].join(', ')}</b> đang bị trùng (ô tô đỏ). Mỗi học sinh cần một mã riêng.</>
              : missing ? <>Còn <b>{missing}</b>/{cls.students.length} em chưa có mã. Lớp phải đủ mã thì mới giao được bài kiểm tra.</>
              : <>Cả {cls.students.length} em đã có mã. Bấm <b>Xuất Excel</b> để in hoặc gửi danh sách mã cho học sinh.</>}
            {' '}Mã không phân biệt chữ hoa, chữ thường và không có khoảng trắng.
          </div>
        </div>
      </div>
    </Modal>
  );
}
