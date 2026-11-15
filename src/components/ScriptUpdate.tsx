// Giao diện tự cập nhật Apps Script của giáo viên: thông báo ở khung giáo viên + khối trạng thái trong Cài đặt.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Copy, ExternalLink, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { API_SETTINGS_URL, autoUpdateScript, checkSelfUpdateReady, scriptUpdateStatus, type UpdateStatus } from '../lib/scriptUpdate';
import { SCRIPT_VERSION } from '../lib/installer';
import { loadSettings } from '../lib/settings';
import { useToast } from './ui';

function useUpdateStatus() {
  const [st, setSt] = useState<UpdateStatus | null>(scriptUpdateStatus());
  useEffect(() => {
    const on = () => setSt(scriptUpdateStatus());
    window.addEventListener('quickplay-script-update', on);
    return () => window.removeEventListener('quickplay-script-update', on);
  }, []);
  return st;
}

/** Sao chép nội dung appsscript.json (tệp cấu hình quyền) để dán vào dự án Apps Script */
export function useCopyManifest() {
  const toast = useToast();
  return async () => {
    const m = (await import('../../apps-script/appsscript.json?raw')).default;
    try {
      await navigator.clipboard.writeText(m);
      toast('Đã sao chép tệp cấu hình appsscript.json.', 'ok');
    } catch {
      window.prompt('Sao chép nội dung dưới đây (Ctrl + C):', m);
    }
  };
}

let announced = ''; // mỗi lần cập nhật chỉ báo một lần

/** Chạy ngầm khi giáo viên mở phần mềm; chỉ hiện thông báo khi vừa cập nhật hoặc cần thầy cô làm một việc. */
export function ScriptUpdateNotice() {
  const toast = useToast();
  const st = useUpdateStatus();
  const [hide, setHide] = useState(() => sessionStorage.getItem('quickplay.hideScriptNotice') === '1');
  useEffect(() => {
    const before = scriptUpdateStatus();
    autoUpdateScript().then((r) => {
      if (r?.state === 'updated' && r.to && announced !== r.to && !(before?.state === 'updated' && before.to === r.to)) {
        announced = r.to;
        toast(`Apps Script đã tự cập nhật lên phiên bản ${r.to}. Dữ liệu và link giữ nguyên.`, 'ok');
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Ở trang Cài đặt đã có sẵn hộp cập nhật, không nhắc hai lần
  const onSettings = useLocation().pathname.startsWith('/teacher/settings');
  if (hide || onSettings || loadSettings().backend !== 'drive' || !st || !['old', 'api_off', 'scopes', 'manual'].includes(st.state)) return null;
  const text = st.state === 'api_off'
    ? <>Apps Script của thầy cô chưa tự cập nhật được vì <b>chưa bật Google Apps Script API</b> (bật một lần, mất 10 giây).</>
    : st.state === 'old'
      ? <>Apps Script của thầy cô đang chạy bản <b>{st.server}</b>, phần mềm cần <b>{SCRIPT_VERSION}</b>. Cập nhật tay <b>một lần cuối</b>, từ đó các bản sau tự cập nhật.</>
      : <>Apps Script của thầy cô cần <b>cập nhật tay một lần</b> (bản mới cần thêm quyền Google).</>;
  return (
    <div className="script-notice" role="status">
      <TriangleAlert size={20} />
      <span>{text}</span>
      <Link className="btn sm primary" to="/teacher/settings#tu-cap-nhat">Xem cách làm</Link>
      <button className="btn icon ghost sm" aria-label="Ẩn thông báo" onClick={() => { sessionStorage.setItem('quickplay.hideScriptNotice', '1'); setHide(true); }}><X size={16} /></button>
    </div>
  );
}

/** Khối "Tự cập nhật Apps Script" trong trang Cài đặt */
export function ScriptUpdatePanel() {
  const toast = useToast();
  const st = useUpdateStatus();
  const copyManifest = useCopyManifest();
  const [busy, setBusy] = useState('');
  const [ready, setReady] = useState<{ ready: boolean; message?: string } | null>(st?.ready ? { ready: true } : null);
  const check = async () => {
    setBusy('check');
    const r = await checkSelfUpdateReady();
    setReady(r);
    setBusy('');
    toast(r.ready ? 'Apps Script đã sẵn sàng tự cập nhật.' : r.message ?? 'Chưa sẵn sàng tự cập nhật.', r.ready ? 'ok' : 'error');
  };
  const ok = ready?.ready || st?.state === 'updated';
  return (
    <div className="folder-box">
      <p className="muted" style={{ margin: 0 }}>
        Khi Quickplay có bản mới, Apps Script của thầy cô <b>tự cập nhật</b> (giữ nguyên link, khóa và dữ liệu). Cần hai điều kiện, mỗi điều làm <b>một lần</b>:
      </p>
      <ol className="move-steps">
        <li>
          <b>Apps Script có tệp cấu hình quyền</b> (<code>appsscript.json</code>): trong dự án Apps Script bấm <b>⚙ Cài đặt dự án</b> → tích
          <b> Hiển thị tệp kê khai "appsscript.json"</b> → quay lại <b>Trình chỉnh sửa</b>, mở tệp <code>appsscript.json</code>, xóa hết và dán nội dung dưới đây → <kbd>Ctrl + S</kbd>
          → <b>Triển khai ▾ → Quản lý các tùy chọn triển khai → ✎ → Phiên bản mới → Triển khai</b>, Google hỏi quyền thì bấm <b>Cho phép</b>.
          <div className="row" style={{ gap: 6, marginTop: 6 }}><button type="button" className="btn sm" onClick={copyManifest}><Copy size={14} /> Sao chép tệp cấu hình</button></div>
        </li>
        <li>
          <b>Bật Google Apps Script API</b> cho Gmail đang chạy Apps Script: mở trang cài đặt, gạt <b>Google Apps Script API</b> sang <b>Bật</b>.
          <div className="row" style={{ gap: 6, marginTop: 6 }}><a className="btn sm" href={API_SETTINGS_URL} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Mở trang bật API</a></div>
        </li>
      </ol>
      <div className={`snap-card ${ok ? 'ok' : st && ['api_off', 'scopes', 'manual', 'old', 'error'].includes(st.state) ? 'bad' : ''}`}>
        <small>Trạng thái</small>
        {ok ? <span><CheckCircle2 size={16} /> Sẵn sàng tự cập nhật{st?.server ? ` · đang chạy ${st.server}` : ''}{st?.state === 'updated' && st.from ? ` (vừa cập nhật từ ${st.from})` : ''}</span>
          : st?.state === 'current' ? <span>Đang chạy bản mới nhất {st.server}. Bấm "Kiểm tra" để biết lần sau có tự cập nhật được không.</span>
          : st?.message || ready?.message ? <span><TriangleAlert size={16} /> {ready?.message ?? st?.message}</span>
          : st?.state === 'old' ? <span><TriangleAlert size={16} /> Bản {st.server} chưa có chức năng tự cập nhật: cập nhật tay một lần bằng Trình cài đặt (thẻ Cập nhật bản mới).</span>
          : <span>Chưa kiểm tra</span>}
      </div>
      <div className="row">
        <button className="btn" onClick={check} disabled={!!busy}><RefreshCw size={16} /> {busy === 'check' ? 'Đang kiểm tra…' : 'Kiểm tra'}</button>
      </div>
    </div>
  );
}
