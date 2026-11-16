// Tự cập nhật Apps Script ở khung giáo viên: chạy ngầm khi thầy cô mở phần mềm; chỉ hiện thông báo khi vừa cập nhật xong
// hoặc khi cần thầy cô làm một việc (bật API, cập nhật tay một lần). Khối "Tự cập nhật" trong trang Cài đặt ở cuối tệp.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Copy, ExternalLink, RefreshCw, ShieldCheck, TriangleAlert, Zap } from 'lucide-react';
import { API_SETTINGS_URL, autoUpdateScript, needsScriptUpdate, checkSelfUpdateReady, googleDetail, googleLink, reasonText, scriptUpdateStatus, type UpdateStatus } from '../lib/scriptUpdate';
import { SCRIPT_VERSION } from '../lib/installer';
import { loadSettings } from '../lib/settings';
import { askConfirm, useToast } from './ui';

function useUpdateStatus() {
  const [st, setSt] = useState<UpdateStatus | null>(scriptUpdateStatus());
  useEffect(() => {
    const on = () => setSt(scriptUpdateStatus());
    // thẻ / khung khác (cùng trang web) vừa tự cập nhật hoặc kiểm tra: sự kiện "storage" báo sang để mọi thẻ hiện cùng một trạng thái
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key === 'quickplay.scriptUpdate') on(); };
    window.addEventListener('quickplay-script-update', on);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('quickplay-script-update', on);
      window.removeEventListener('storage', onStorage);
    };
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
  useEffect(() => {
    autoUpdateScript().then((r) => {
      if (r?.state === 'updated' && r.to && announced !== r.to && sessionStorage.getItem('quickplay.updatedShown') !== r.to) {
        announced = r.to;
        try { sessionStorage.setItem('quickplay.updatedShown', r.to); } catch { /* bỏ qua */ }
        toast(`Apps Script đã tự cập nhật lên phiên bản ${r.to}. Link, khóa và dữ liệu giữ nguyên.`, 'ok');
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Ở trang Cài đặt đã có hộp cập nhật, không nhắc hai lần
  const onSettings = useLocation().pathname.startsWith('/teacher/settings');
  // Luôn hiện (không có nút ẩn) ở mọi trang giáo viên cho tới khi Apps Script lên bản mới nhất.
  // Mặc định chỉ đường tới 5 bước cập nhật tay; lý do kỹ thuật chỉ hiện trong mục Nâng cao của trang Cài đặt.
  if (onSettings || loadSettings().backend !== 'drive' || !needsScriptUpdate(st)) return null;
  const busy = st!.reason === 'busy';
  return (
    <div className="script-notice" role="alert">
      <TriangleAlert size={22} />
      <span>
        <b>Đã có bản cập nhật. Thầy/Cô vui lòng thao tác cập nhật lên phiên bản mới nhất.</b>
        <small>
          Apps Script đang chạy bản {st!.server}, bản mới nhất là {SCRIPT_VERSION}.{' '}
          {busy ? 'Đang có buổi học trực tiếp: cập nhật sau khi buổi học kết thúc.' : 'Làm 5 bước, khoảng 3 phút; link và dữ liệu giữ nguyên.'}
        </small>
      </span>
      <Link className="btn sm primary" to="/teacher/settings#cap-nhat"><RefreshCw size={16} /> Cập nhật ngay</Link>
    </div>
  );
}

/** Trang Google quản lý các ứng dụng đã được cấp quyền (xóa quyền để Google hỏi lại từ đầu). */
export const GOOGLE_CONNECTIONS_URL = 'https://myaccount.google.com/connections';

/** Hướng dẫn cấp 2 quyền tự cập nhật: cách 1 chạy hàm kiểm tra; cách 2 (dự phòng) xóa quyền rồi cấp lại. */
export function ScopeFix() {
  return (
    <div className="scope-fix">
      <b>Cách cấp quyền tự cập nhật</b>
      <div>
        <b>Cách 1 (làm trước):</b> mở dự án Apps Script → bấm <code>Mã.gs</code> → ô chọn hàm chọn <b>kiemTraTuCapNhat</b> → <b>▷ Chạy</b>.
        Khi Google hỏi: <b>Xem xét quyền</b> → chọn Gmail → <b>Nâng cao</b> → <b>Đi tới … (không an toàn)</b> → <b>tích "Chọn tất cả"</b> → <b>Tiếp tục</b>.
        Nhật ký thực thi báo <b>"ĐỦ ĐIỀU KIỆN TỰ CẬP NHẬT"</b> là xong. (Mã Apps Script chưa có hàm này thì làm 5 bước cập nhật tay trước.)
      </div>
      <div>
        <b>Cách 2 (chỉ khi Google không hỏi lại):</b> trước đây có lần bỏ trống ô quyền nên Google không hỏi nữa. Xóa quyền cũ để Google hỏi lại từ đầu:
        <ol>
          <li>Mở trang quyền truy cập của Google bằng Gmail chạy Apps Script. <a className="btn sm" href={GOOGLE_CONNECTIONS_URL} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Mở trang quyền truy cập</a></li>
          <li>Tìm đúng <b>tên dự án Apps Script của mình</b> (tên ghi ở đầu trình biên tập Apps Script), bấm vào → <b>Xóa mọi quyền truy cập</b>. Không xóa ứng dụng khác.</li>
          <li>Quay lại Apps Script, chạy lại <b>kiemTraTuCapNhat</b> như cách 1 và nhớ <b>tích "Chọn tất cả"</b>.</li>
        </ol>
        <div className="alert warn"><div><TriangleAlert size={16} /> Từ lúc xóa quyền tới lúc cấp lại (khoảng 1 phút), link Apps Script <b>ngừng chạy</b>: học sinh không vào phòng được. Chỉ làm khi không có lớp.</div></div>
      </div>
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
  const [ready, setReady] = useState<{ ready: boolean; message?: string; link?: string; reason?: string } | null>(null);
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
    const google = googleDetail(r0.message);
    const link = googleLink(r0.message);
    const r = !r0.ready && r0.reason && r0.reason !== 'error' && r0.reason !== 'no_self' ? { ...r0, message: `${reasonText(r0.reason)} ${google}`.trim(), link } : { ...r0, link };
    setReady(r);
    setBusy('');
    toast(r.ready ? 'Đủ điều kiện: các bản sau Apps Script sẽ tự cập nhật.' : r.message ?? 'Chưa đủ điều kiện tự cập nhật.', r.ready ? 'ok' : 'error');
  };

  const reason = old ? st?.reason : undefined;
  const needApi = (old && reason === 'api_off') || (ready && !ready.ready && /Apps Script API/.test(ready.message ?? ''));
  const needManual = old && (reason === 'scopes' || reason === 'manual' || reason === 'no_self');
  return (
    <div className="folder-box">
      <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <b className="row" style={{ gap: 6 }}><RefreshCw size={18} color="var(--primary)" /> Tự cập nhật Apps Script (không bắt buộc)</b>
        {server && !old && <span className="badge green"><CheckCircle2 size={14} /> Đang chạy bản mới nhất {server}</span>}
        {old && <span className="badge amber"><TriangleAlert size={14} /> Đang chạy {server}, cần {SCRIPT_VERSION}</span>}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Không làm phần này thì thầy cô vẫn dùng Quickplay bình thường và cập nhật bằng <b>5 bước cập nhật tay</b>.
        Làm đủ 5 việc dưới đây (mỗi việc <b>một lần</b>, cần Gmail có xác thực hai bước) thì khi Quickplay có bản mới, Apps Script <b>tự cập nhật</b>
        lúc thầy cô mở phần mềm (không cập nhật khi đang có buổi học trực tiếp); link, khóa giáo viên và dữ liệu giữ nguyên.
      </p>
      <ol className="move-steps">
        <li>
          Bật <b>xác thực hai bước</b> cho Gmail chạy Apps Script (Google Cloud bắt buộc từ 10/2026): Tài khoản Google → <b>Bảo mật</b> → <b>Xác minh 2 bước</b>.{' '}
          <a className="btn sm" href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Mở trang xác minh 2 bước</a>
        </li>
        <li>
          Bật <b>Google Apps Script API</b> trong cài đặt của Gmail: gạt sang <b>Bật</b>.{' '}
          <a className="btn sm" href={API_SETTINGS_URL} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Mở trang bật API</a>
        </li>
        <li>
          Dán <b>tệp cấu hình</b> vào tệp <code>appsscript.json</code> của dự án (⚙ Cài đặt dự án → Chung → tích "Hiển thị tệp kê khai…"), <b>không</b> dán vào <code>Mã.gs</code>, rồi <kbd>Ctrl + S</kbd>.{' '}
          <button type="button" className="btn sm" onClick={copyManifest}><Copy size={14} /> Sao chép tệp cấu hình</button>
        </li>
        <li>
          Trong trình biên tập Apps Script, ô chọn hàm chọn <b>kiemTraTuCapNhat</b> → <b>▷ Chạy</b>. Google hỏi quyền thì <b>tích "Chọn tất cả"</b> → Tiếp tục.
        </li>
        <li>
          Nhật ký thực thi báo cần bật API cho <b>dự án Google Cloud</b> thì mở link trong nhật ký (hoặc nút "Mở trang bật API của Google Cloud" khi bấm Kiểm tra điều kiện),
          bấm <b>Chấp nhận</b> điều khoản rồi <b>Bật (Enable)</b>, đợi 2–3 phút, chạy lại hàm. Nhật ký báo <b>"ĐỦ ĐIỀU KIỆN TỰ CẬP NHẬT"</b> là xong; triển khai Phiên bản mới như mọi lần.
        </li>
      </ol>
      {old && st?.reason && (
        <div className={`alert ${st.reason === 'busy' ? 'ok' : 'warn'}`}>
          <div>
            {reasonText(st.reason)}{st.reason === 'error' && st.message ? ` ${st.message}` : st.reason !== 'busy' && googleDetail(st.message) ? ` ${googleDetail(st.message)}` : ''}
            {googleLink(st.message) && <> <a className="btn sm" href={googleLink(st.message)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> {/console\./.test(googleLink(st.message)!) ? 'Mở trang bật API của Google Cloud' : 'Mở trang cấp quyền của Google'}</a></>}
          </div>
        </div>
      )}
      {ready && (
        <div className={`alert ${ready.ready ? 'ok' : 'warn'}`}>
          <div>
            {ready.ready ? 'Đủ điều kiện: các bản sau Apps Script sẽ tự cập nhật.' : ready.message}
            {ready.link && <> <a className="btn sm" href={ready.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> {/console\./.test(ready.link) ? 'Mở trang bật API của Google Cloud' : 'Mở trang cấp quyền của Google'}</a></>}
          </div>
        </div>
      )}
      {((old && st?.reason === 'scopes') || (ready && !ready.ready && ready.reason === 'scopes')) && <ScopeFix />}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {old && !needManual && <button className="btn primary" onClick={updateNow} disabled={!!busy}><Zap size={18} /> {busy === 'update' ? 'Đang cập nhật… (khoảng 20 giây)' : needApi ? 'Đã bật API, cập nhật ngay' : 'Cập nhật ngay'}</button>}
        {(needManual || (old && reason === 'error')) && <button className="btn primary" onClick={onManual}>Xem 5 bước cập nhật tay</button>}
        <button className="btn" onClick={check} disabled={!!busy}><ShieldCheck size={18} /> {busy === 'check' ? 'Đang kiểm tra…' : 'Kiểm tra điều kiện'}</button>
      </div>
    </div>
  );
}
