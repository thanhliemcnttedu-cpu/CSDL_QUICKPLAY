// Tự cập nhật Apps Script ở khung giáo viên: chạy ngầm khi thầy cô mở phần mềm; chỉ hiện thông báo khi vừa cập nhật xong
// hoặc khi cần thầy cô làm một việc (bật API, cập nhật tay một lần). Khối "Tự cập nhật" trong trang Cài đặt ở cuối tệp.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Copy, ExternalLink, RefreshCw, ShieldCheck, TriangleAlert, X, Zap } from 'lucide-react';
import { API_SETTINGS_URL, autoUpdateScript, checkSelfUpdateReady, reasonText, scriptUpdateStatus, type UpdateStatus } from '../lib/scriptUpdate';
import { SCRIPT_VERSION } from '../lib/installer';
import { loadSettings } from '../lib/settings';
import { askConfirm, useToast } from './ui';

function useUpdateStatus() {
  const [st, setSt] = useState<UpdateStatus | null>(scriptUpdateStatus());
  useEffect(() => {
    const on = () => setSt(scriptUpdateStatus());
    window.addEventListener('quickplay-script-update', on);
    return () => window.removeEventListener('quickplay-script-update', on);
  }, []);
  return st;
}

/** Sao chép tệp cấu hình appsscript.json (quyền tự cập nhật) để dán vào dự án Apps Script. */
export function useCopyManifest() {
  const toast = useToast();
  return async () => {
    const m = (await import('../../apps-script/appsscript.json?raw')).default;
    try {
      await navigator.clipboard.writeText(m);
      toast('Đã sao chép tệp cấu hình. Dán vào tệp appsscript.json (KHÔNG dán vào Mã.gs).', 'ok');
    } catch {
      window.prompt('Sao chép nội dung dưới đây (Ctrl + C):', m);
    }
  };
}

let announced = ''; // mỗi lần cập nhật chỉ báo một lần

export function ScriptUpdateNotice() {
  const toast = useToast();
  const st = useUpdateStatus();
  const [hide, setHide] = useState(() => sessionStorage.getItem('quickplay.hideScriptNotice') === '1');
  useEffect(() => {
    autoUpdateScript().then((r) => {
      if (r?.state === 'updated' && r.to && announced !== r.to && sessionStorage.getItem('quickplay.updatedShown') !== r.to) {
        announced = r.to;
        try { sessionStorage.setItem('quickplay.updatedShown', r.to); } catch { /* bỏ qua */ }
        toast(`Apps Script đã tự cập nhật lên phiên bản ${r.to}. Link, khóa và dữ liệu giữ nguyên.`, 'ok');
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Ở trang Cài đặt đã có khối Tự cập nhật, không nhắc hai lần
  const onSettings = useLocation().pathname.startsWith('/teacher/settings');
  if (hide || onSettings || loadSettings().backend !== 'drive' || st?.state !== 'old') return null;
  // chưa thử tự cập nhật lần nào (vừa mở trang): đang tự cập nhật ngầm, chưa cần làm gì
  if (st.reason === undefined) return null;
  const busy = st.reason === 'busy';
  return (
    <div className="script-notice" role="status">
      <TriangleAlert size={20} />
      <span>
        Apps Script của thầy cô đang chạy bản <b>{st.server}</b>, phần mềm cần <b>{SCRIPT_VERSION}</b>. {reasonText(st.reason)}
        {st.reason === 'error' && st.message ? ` ${st.message}` : ''}
      </span>
      {!busy && <Link className="btn sm primary" to="/teacher/settings#tu-cap-nhat">{st.reason === 'api_off' ? 'Bật API' : 'Xem cách làm'}</Link>}
      <button className="btn icon ghost sm" aria-label="Ẩn thông báo" onClick={() => { sessionStorage.setItem('quickplay.hideScriptNotice', '1'); setHide(true); }}><X size={16} /></button>
    </div>
  );
}

/** Khối "Tự cập nhật Apps Script" trong trang Cài đặt: trạng thái, nút Cập nhật ngay, điều kiện cần làm một lần. */
export function ScriptUpdatePanel({ server, onManual, onServer }: {
  server: string | null; // phiên bản Apps Script đang chạy (null: chưa biết)
  onManual: () => void; // mở 5 bước cập nhật tay
  onServer: (v: string) => void;
}) {
  const toast = useToast();
  const st = useUpdateStatus();
  const copyManifest = useCopyManifest();
  const [busy, setBusy] = useState<'' | 'update' | 'check'>('');
  const [ready, setReady] = useState<{ ready: boolean; message?: string } | null>(null);
  const old = !!server && st?.state === 'old';

  const updateNow = async () => {
    setBusy('update');
    let r = await autoUpdateScript(true).catch(() => null);
    if (r?.state === 'old' && r.reason === 'busy') {
      const ok = await askConfirm('Đang có buổi học trực tiếp hoặc bài kiểm tra chưa kết thúc. Cập nhật ngay có thể làm học sinh đang làm bài bị gián đoạn vài giây. Vẫn cập nhật?', { okLabel: 'Vẫn cập nhật', danger: true });
      if (ok) r = await autoUpdateScript(true, true).catch(() => null);
    }
    setBusy('');
    if (!r) return toast('Không gọi được Apps Script. Hãy kiểm tra mạng Internet rồi bấm lại.', 'error');
    if (r.server) onServer(r.server);
    if (r.state === 'updated') return toast(`Đã cập nhật Apps Script lên phiên bản ${r.to}. Link và dữ liệu giữ nguyên.`, 'ok');
    if (r.state === 'current') return toast('Apps Script đang chạy bản mới nhất.', 'ok');
    toast(reasonText(r.reason) + (r.reason === 'error' && r.message ? ` ${r.message}` : ''), 'error');
  };
  const check = async () => {
    setBusy('check');
    const r0 = await checkSelfUpdateReady();
    // lý do đã biết (thiếu quyền, chưa bật API…): dùng câu hướng dẫn của phần mềm, mới hơn câu của Apps Script đang chạy
    // giữ phần lỗi gốc của Google (nếu Apps Script gửi kèm) để biết đúng nguyên nhân
    const google = (r0.message ?? '').match(/\(Google:[^)]*\)/)?.[0] ?? '';
    const r = !r0.ready && r0.reason && r0.reason !== 'error' && r0.reason !== 'no_self' ? { ...r0, message: `${reasonText(r0.reason)} ${google}`.trim() } : r0;
    setReady(r);
    setBusy('');
    toast(r.ready ? 'Đủ điều kiện: các bản sau Apps Script sẽ tự cập nhật.' : r.message ?? 'Chưa đủ điều kiện tự cập nhật.', r.ready ? 'ok' : 'error');
  };

  const reason = old ? st?.reason : undefined;
  const needApi = (old && reason === 'api_off') || (ready && !ready.ready && /Apps Script API/.test(ready.message ?? ''));
  const needManual = old && (reason === 'scopes' || reason === 'manual' || reason === 'no_self');
  return (
    <div className="folder-box" id="tu-cap-nhat">
      <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <b className="row" style={{ gap: 6 }}><RefreshCw size={18} color="var(--primary)" /> Tự cập nhật Apps Script</b>
        {server && !old && <span className="badge green"><CheckCircle2 size={14} /> Đang chạy bản mới nhất {server}</span>}
        {old && <span className="badge amber"><TriangleAlert size={14} /> Đang chạy {server}, cần {SCRIPT_VERSION}</span>}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Khi Quickplay có bản mới, Apps Script của thầy cô <b>tự cập nhật</b> lúc thầy cô mở phần mềm (không cập nhật khi đang có buổi học trực tiếp).
        Link, khóa giáo viên và dữ liệu giữ nguyên. Cần hai điều kiện, mỗi điều làm <b>một lần</b>:
      </p>
      <ol className="move-steps">
        <li>
          Bật <b>Google Apps Script API</b> cho Gmail đang chạy Apps Script: mở trang cài đặt, gạt <b>Google Apps Script API</b> sang <b>Bật</b>.{' '}
          <a className="btn sm" href={API_SETTINGS_URL} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Mở trang bật API</a>
        </li>
        <li>
          Dự án Apps Script có <b>tệp cấu hình appsscript.json</b> của Quickplay (quyền tự cập nhật). Làm khi cập nhật tay: bước 3 của 5 bước có hướng dẫn dán tệp này
          — dán vào tệp <code>appsscript.json</code>, <b>không</b> dán vào <code>Mã.gs</code>.{' '}
          <button type="button" className="btn sm" onClick={copyManifest}><Copy size={14} /> Sao chép tệp cấu hình</button>
        </li>
      </ol>
      {old && st?.reason && (
        <div className={`alert ${st.reason === 'busy' ? 'ok' : 'warn'}`}>
          <div>{reasonText(st.reason)}{st.reason === 'error' && st.message ? ` ${st.message}` : ''}</div>
        </div>
      )}
      {ready && <div className={`alert ${ready.ready ? 'ok' : 'warn'}`}><div>{ready.ready ? 'Đủ hai điều kiện: các bản sau Apps Script sẽ tự cập nhật.' : ready.message}</div></div>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {old && !needManual && <button className="btn primary" onClick={updateNow} disabled={!!busy}><Zap size={18} /> {busy === 'update' ? 'Đang cập nhật… (khoảng 20 giây)' : needApi ? 'Đã bật API, cập nhật ngay' : 'Cập nhật ngay'}</button>}
        {(needManual || (old && reason === 'error')) && <button className="btn primary" onClick={onManual}>Xem 5 bước cập nhật tay</button>}
        <button className="btn" onClick={check} disabled={!!busy}><ShieldCheck size={18} /> {busy === 'check' ? 'Đang kiểm tra…' : 'Kiểm tra điều kiện'}</button>
      </div>
    </div>
  );
}
