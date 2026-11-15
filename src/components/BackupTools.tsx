// Sao lưu toàn bộ / khôi phục từ tệp / cảnh báo Google Drive đầy — dùng chung cho trang Cài đặt và khung giáo viên.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, Download, HardDrive, RefreshCw, TriangleAlert, Upload, X } from 'lucide-react';
import { backupFileName, backupSummary, exportAll, importAll, parseBackup, type BackupFile, type RestoreResult } from '../lib/backup';
import { checkDriveSpace, driveSpace, fmtGB, type DriveSpace } from '../lib/driveFull';
import { currentAccount } from '../lib/account';
import { loadSettings, saveSettings } from '../lib/settings';
import { downloadBlob } from '../lib/xlsx';
import { formatBytes } from '../lib/util';
import { Modal, useToast } from './ui';
import { pickFile } from './MediaTools';

/** Chạy sao lưu toàn bộ và tải tệp về máy. Trả về hàm chạy + tiến trình để hiện thanh tiến độ. */
export function useFullBackup() {
  const toast = useToast();
  const [prog, setProg] = useState<{ text: string; pct: number } | null>(null);
  const run = async () => {
    if (prog) return;
    setProg({ text: 'Đang chuẩn bị…', pct: 0 });
    try {
      const data = await exportAll({ media: true, sessions: true, onProgress: (text, pct) => setProg({ text, pct: pct ?? 0 }) });
      const name = backupFileName(data.owner?.username ?? currentAccount()?.username);
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      downloadBlob(name, blob);
      const s = backupSummary(data);
      toast(`Đã tải về ${name} (${formatBytes(blob.size)}): ${s.quizzes} bộ câu hỏi, ${s.classes} lớp, ${s.sessions} buổi đã tổ chức, ${s.media} ảnh/âm thanh.`, 'ok');
      try { localStorage.setItem('quickplay.lastFullBackup', JSON.stringify({ at: Date.now(), name, size: blob.size })); } catch { /* bỏ qua */ }
      return data;
    } catch (e) {
      toast((e as Error).message, 'error');
      return null;
    } finally {
      setProg(null);
    }
  };
  return { run, prog };
}

export function lastFullBackup(): { at: number; name: string; size: number } | null {
  try { return JSON.parse(localStorage.getItem('quickplay.lastFullBackup') || 'null'); } catch { return null; }
}

export function ProgressLine({ prog }: { prog: { text: string; pct: number } | null }) {
  if (!prog) return null;
  return (
    <div className="stack" style={{ gap: 6 }} role="status" aria-live="polite">
      <div className="progress" aria-hidden><i style={{ width: `${Math.max(3, prog.pct)}%` }} /></div>
      <small className="muted">{prog.text}</small>
    </div>
  );
}

// ---------------- Cảnh báo Drive đầy (hiện ở mọi trang của giáo viên) ----------------
export function DriveFullBanner() {
  const [sp, setSp] = useState<DriveSpace | null>(driveSpace());
  const [hide, setHide] = useState(() => sessionStorage.getItem('quickplay.hideNearFull') === '1');
  const [checking, setChecking] = useState(false);
  const { run, prog } = useFullBackup();
  useEffect(() => {
    const on = () => setSp(driveSpace());
    window.addEventListener('quickplay-drive-space', on);
    checkDriveSpace().then(setSp).catch(() => {});
    return () => window.removeEventListener('quickplay-drive-space', on);
  }, []);
  if (loadSettings().backend !== 'drive' || !sp || sp.level === 'ok') return null;
  const full = sp.level === 'full';
  if (!full && hide) return null;
  const pct = sp.used !== undefined && sp.limit ? Math.min(100, Math.round((sp.used / sp.limit) * 100)) : undefined;
  return (
    <div className={`drive-full ${full ? 'full' : 'near'}`} role="alert">
      <TriangleAlert size={26} className="df-ic" />
      <div className="stack" style={{ gap: 8, flex: 1, minWidth: 0 }}>
        <b className="df-title">{full ? 'Thư mục Google Drive của bạn đã đầy và không còn khoảng trống để lưu trữ dữ liệu.' : `Google Drive của bạn sắp đầy (${pct}%).`}</b>
        <span>
          {full
            ? 'Bạn cần tải file sao lưu về máy tính để lưu trữ, và dùng chính file đó để khôi phục dữ liệu sau này khi chuyển sang kho lưu trữ mới.'
            : 'Hãy tải file sao lưu về máy tính ngay để phòng khi Drive đầy, và nén lại ảnh/âm thanh cũ trong Cài đặt để lấy lại dung lượng.'}
          {sp.used !== undefined && sp.limit ? <> Đã dùng <b>{fmtGB(sp.used)}</b> / {fmtGB(sp.limit)}.</> : null}
        </span>
        <ProgressLine prog={prog} />
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" onClick={run} disabled={!!prog}><Download size={18} /> Tải file sao lưu toàn bộ</button>
          <Link className="btn" to="/teacher/settings#chuyen-kho">Hướng dẫn chuyển sang Drive mới</Link>
          <button className="btn ghost sm" disabled={checking} onClick={async () => { setChecking(true); setSp(await checkDriveSpace(true)); setChecking(false); }}>
            <RefreshCw size={16} /> {checking ? 'Đang kiểm tra…' : 'Kiểm tra lại dung lượng'}
          </button>
        </div>
      </div>
      {!full && <button className="btn icon ghost" aria-label="Ẩn cảnh báo" onClick={() => { sessionStorage.setItem('quickplay.hideNearFull', '1'); setHide(true); }}><X size={18} /></button>}
    </div>
  );
}

// ---------------- Khôi phục từ tệp ----------------
export function useRestore() {
  const toast = useToast();
  const [file, setFile] = useState<{ data: BackupFile; name: string; size: number } | null>(null);
  const open = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      setFile({ data: parseBackup(await f.text()), name: f.name, size: f.size });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const dialog = file ? <RestoreDialog file={file} onClose={() => setFile(null)} /> : null;
  return { open, dialog };
}

function RestoreDialog({ file, onClose }: { file: { data: BackupFile; name: string; size: number }; onClose: () => void }) {
  const toast = useToast();
  const s = loadSettings();
  const connected = s.backend === 'drive' && !!s.scriptUrl;
  const [target, setTarget] = useState<'drive' | 'local'>(connected ? 'drive' : 'local');
  const [prog, setProg] = useState<{ text: string; pct: number } | null>(null);
  const [done, setDone] = useState<RestoreResult | null>(null);
  const sum = backupSummary(file.data);
  const acc = currentAccount();
  const other = file.data.owner && acc && file.data.owner.username !== acc.username;
  const when = file.data.exported_at ? new Date(file.data.exported_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  const go = async () => {
    const prev = loadSettings();
    if (target === 'local' && prev.backend !== 'local') saveSettings({ ...prev, backend: 'local' }); // giữ nguyên link Drive để chuyển lại sau
    setProg({ text: 'Đang bắt đầu…', pct: 0 });
    try {
      const r = await importAll(file.data, (text, pct) => setProg({ text, pct: pct ?? 0 }));
      setDone(r);
      toast('Đã khôi phục xong dữ liệu.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setProg(null);
    }
  };

  return (
    <Modal title="Khôi phục dữ liệu từ tệp sao lưu" wide onClose={() => (prog ? undefined : done ? location.reload() : onClose())}
      footer={done
        ? <button className="btn primary" onClick={() => location.replace(location.pathname + '#/teacher')}>Mở Thư viện</button>
        : <>
          <button className="btn ghost" onClick={onClose} disabled={!!prog}>Hủy</button>
          <button className="btn primary" onClick={go} disabled={!!prog}><Upload size={18} /> {prog ? 'Đang khôi phục…' : 'Khôi phục'}</button>
        </>}>
      <div className="stack">
        <div className="restore-file">
          <b>{file.name}</b>
          <small className="muted">{formatBytes(file.size)}{when ? ` · tạo lúc ${when}` : ''}{file.data.owner ? ` · tài khoản ${file.data.owner.name} (${file.data.owner.username})` : ''}</small>
        </div>
        <div className="restore-grid">
          <div><b>{sum.quizzes}</b><span>bộ câu hỏi<br /><small>{sum.questions} câu hỏi</small></span></div>
          <div><b>{sum.subjects}</b><span>môn học<br /><small>kèm chương – bài</small></span></div>
          <div><b>{sum.classes}</b><span>lớp học<br /><small>{sum.students} học sinh</small></span></div>
          <div><b>{sum.sessions}</b><span>buổi đã tổ chức<br /><small>kết quả học sinh</small></span></div>
          <div><b>{sum.media}</b><span>ảnh, âm thanh<br /><small>{formatBytes(sum.mediaBytes)}</small></span></div>
        </div>
        {other && <div className="alert warn"><TriangleAlert size={18} /> Tệp này của tài khoản <b>{file.data.owner!.username}</b>, khác tài khoản đang đăng nhập ({acc!.username}). Vẫn khôi phục được nếu đây là dữ liệu của thầy cô.</div>}
        {sum.missing > 0 && <div className="alert warn"><TriangleAlert size={18} /> {sum.missing} ảnh/âm thanh không có trong tệp (tệp gốc đã bị xóa hoặc quá lớn); câu hỏi đó vẫn giữ link cũ.</div>}
        {file.data.version === 1 && !sum.media && <div className="alert warn"><TriangleAlert size={18} /> Tệp sao lưu kiểu cũ: không kèm ảnh/âm thanh. Câu hỏi vẫn mở ảnh từ Drive cũ chừng nào Drive cũ còn giữ tệp.</div>}

        {!done && <>
          <b>Khôi phục vào đâu?</b>
          <div className="type-grid" role="radiogroup" aria-label="Nơi khôi phục">
            <button type="button" role="radio" aria-checked={target === 'drive'} className="type-btn" disabled={!connected || !!prog} onClick={() => setTarget('drive')}
              style={target === 'drive' ? { borderColor: 'var(--primary)', background: '#eff6ff' } : undefined}>
              <span className="ic" style={{ background: target === 'drive' ? 'var(--primary)' : '#94a3b8' }}><Cloud size={20} /></span>
              <span><b>Google Drive đang kết nối</b><br /><small className="muted">{connected ? 'Ảnh, âm thanh được tải lên Drive này; mọi link trong câu hỏi tự đổi theo. Dùng khi vừa chuyển sang Drive mới.' : 'Chưa kết nối Google Drive. Làm Trình cài đặt ở mục Nơi lưu dữ liệu trước.'}</small></span>
            </button>
            <button type="button" role="radio" aria-checked={target === 'local'} className="type-btn" disabled={!!prog} onClick={() => setTarget('local')}
              style={target === 'local' ? { borderColor: 'var(--primary)', background: '#eff6ff' } : undefined}>
              <span className="ic" style={{ background: target === 'local' ? 'var(--primary)' : '#94a3b8' }}><HardDrive size={20} /></span>
              <span><b>Chỉ máy này (chạy độc lập)</b><br /><small className="muted">Mở và dùng toàn bộ dữ liệu ngay trên máy tính này, không cần Google Drive. Ảnh, âm thanh nằm sẵn trong dữ liệu.</small></span>
            </button>
          </div>
          <small className="muted">Bộ câu hỏi trùng mã được thay bằng bản trong tệp; lớp trùng tên được cập nhật danh sách học sinh; kết quả buổi học đang có không bị xóa.</small>
        </>}
        <ProgressLine prog={prog} />
        {done && (
          <div className="alert ok" role="status">
            <div>
              <b>Đã khôi phục:</b> {done.quizzes} bộ câu hỏi, {done.classes} lớp{done.catalog ? ', danh mục môn học – chương – bài' : ''}, {done.sessions} buổi đã tổ chức, {done.media} ảnh/âm thanh.
              {done.mediaFailed ? ` ${done.mediaFailed} ảnh/âm thanh chưa đưa lên được.` : ''}
              {done.sessionsSkipped ? ` Bỏ qua ${done.sessionsSkipped} buổi vì trùng mã phòng với buổi đang có.` : ''}
              {done.note ? <><br />{done.note}</> : null}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
