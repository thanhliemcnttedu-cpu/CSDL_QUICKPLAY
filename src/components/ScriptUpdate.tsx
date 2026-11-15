// Lời nhắc ở khung giáo viên khi Apps Script đang chạy bản cũ hơn bản phần mềm cần.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TriangleAlert, X } from 'lucide-react';
import { checkScriptVersion, scriptUpdateStatus, type UpdateStatus } from '../lib/scriptUpdate';
import { SCRIPT_VERSION } from '../lib/installer';
import { loadSettings } from '../lib/settings';

/** Chạy ngầm khi giáo viên mở phần mềm; chỉ hiện khi Apps Script cần cập nhật. */
export function ScriptUpdateNotice() {
  const [st, setSt] = useState<UpdateStatus | null>(scriptUpdateStatus());
  const [hide, setHide] = useState(() => sessionStorage.getItem('quickplay.hideScriptNotice') === '1');
  useEffect(() => {
    const on = () => setSt(scriptUpdateStatus());
    window.addEventListener('quickplay-script-update', on);
    checkScriptVersion().catch(() => {});
    return () => window.removeEventListener('quickplay-script-update', on);
  }, []);
  // Ở trang Cài đặt đã có sẵn hộp cập nhật, không nhắc hai lần
  const onSettings = useLocation().pathname.startsWith('/teacher/settings');
  if (hide || onSettings || loadSettings().backend !== 'drive' || st?.state !== 'old') return null;
  return (
    <div className="script-notice" role="status">
      <TriangleAlert size={20} />
      <span>Apps Script của thầy cô đang chạy bản <b>{st.server}</b>, phần mềm cần <b>{SCRIPT_VERSION}</b>. Cập nhật mất khoảng 3 phút; link và dữ liệu giữ nguyên.</span>
      <Link className="btn sm primary" to="/teacher/settings#cap-nhat">Xem cách làm</Link>
      <button className="btn icon ghost sm" aria-label="Ẩn thông báo" onClick={() => { sessionStorage.setItem('quickplay.hideScriptNotice', '1'); setHide(true); }}><X size={16} /></button>
    </div>
  );
}
