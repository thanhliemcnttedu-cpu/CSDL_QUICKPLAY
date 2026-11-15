import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Cloud, HardDrive, PlugZap, Save, UploadCloud, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { loadSettings, saveSettings, isDesktop, type AppSettings } from '../lib/settings';
import { changePassword, currentAccount, saveVault } from '../lib/account';
import { testConnection } from '../lib/api';
import { kvGet, kvKeys } from '../lib/idb';
import type { Quiz } from '../lib/types';
import { useToast, askConfirm } from '../components/ui';

export default function Settings() {
  const toast = useToast();
  // Lần đầu sau khi đăng nhập: mở sẵn phần Google Drive để thầy cô dán hai đường link
  const [s, setS] = useState<AppSettings>(() => (location.hash.includes('first=1') ? { ...loadSettings(), backend: 'drive' } : loadSettings()));
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const set = (p: Partial<AppSettings>) => setS((x) => ({ ...x, ...p }));
  const [params] = useSearchParams();
  const first = params.get('first') === '1';
  const acc = currentAccount();
  const [pw, setPw] = useState({ old: '', next: '' });

  const test = async () => {
    setStatus(null);
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(s.scriptUrl.trim()))
      return setStatus({ tone: 'error', text: 'URL phải có dạng https://script.google.com/macros/s/…/exec' });
    setBusy(true);
    const prev = loadSettings();
    saveSettings({ ...prev, teacherKey: s.teacherKey }); // gửi khóa đang nhập để kiểm tra
    try {
      await testConnection(s.scriptUrl.trim());
      setStatus({ tone: 'ok', text: 'Kết nối thành công! Khóa giáo viên hợp lệ.' });
    } catch (e) {
      setStatus({ tone: 'error', text: (e as Error).message });
    } finally {
      saveSettings(prev);
      setBusy(false);
    }
  };

  const store = async () => {
    if (s.backend === 'drive' && !s.scriptUrl) return toast('Hãy dán URL Apps Script trước.', 'error');
    const next = { ...s, scriptUrl: s.scriptUrl.trim(), teacherKey: s.teacherKey.trim(), folderUrl: s.folderUrl.trim(), geminiKey: s.geminiKey.trim() };
    if (next.backend === 'drive' && next.folderUrl && !/drive\.google\.com\/.*(folders\/|id=)[\w-]{10,}/.test(next.folderUrl))
      return toast('Link thư mục Google Drive chưa đúng. Mở thư mục trên Drive rồi chép địa chỉ trên thanh trình duyệt.', 'error');
    setBusy(true);
    const prev = loadSettings();
    saveSettings(next);
    try {
      if (next.backend === 'drive' && next.folderUrl && next.folderUrl !== prev.folderUrl) {
        const { api } = await import('../lib/api');
        const r = await api.setRootFolder(next.folderUrl);
        toast(`Apps Script sẽ lưu dữ liệu vào thư mục “${r.name}”.`, 'ok');
      }
      // Cất cấu hình (đã mã hóa bằng mật khẩu của thầy cô) vào tài khoản để lần sau đăng nhập ở máy nào cũng nhớ
      if (acc && next.backend === 'drive') await saveVault({ scriptUrl: next.scriptUrl, teacherKey: next.teacherKey, folderUrl: next.folderUrl });
    } catch (e) {
      saveSettings(prev);
      setBusy(false);
      return toast((e as Error).message, 'error');
    }
    toast(acc ? 'Đã lưu. Tài khoản của thầy cô sẽ nhớ cấu hình này.' : 'Đã lưu cài đặt.', 'ok');
    setTimeout(() => (first ? location.replace(location.pathname + '#/teacher') : location.reload()), 700);
  };
  const changePw = async () => {
    if (pw.next.length < 6) return toast('Mật khẩu mới cần ít nhất 6 ký tự.', 'error');
    setBusy(true);
    try {
      await changePassword(pw.old, pw.next);
      setPw({ old: '', next: '' });
      toast('Đã đổi mật khẩu.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const migrate = async () => {
    const keys = (await kvKeys()).filter((k) => k.startsWith('quiz:'));
    if (!keys.length) return toast('Không có bộ đề nào lưu trong máy này.', 'info');
    if (!(await askConfirm(`Chép ${keys.length} bộ đề từ máy này lên Google Drive?`))) return;
    setBusy(true);
    const prev = loadSettings();
    saveSettings({ ...s, backend: 'drive' });
    let ok = 0;
    try {
      const { api } = await import('../lib/api');
      for (const k of keys) {
        const q = await kvGet<Quiz>(k);
        if (q) {
          await api.saveQuiz(q);
          ok++;
        }
      }
      toast(`Đã chép ${ok} bộ đề lên Drive.`, 'ok');
    } catch (e) {
      toast(`Đã chép ${ok}/${keys.length}. Lỗi: ${(e as Error).message}`, 'error');
    } finally {
      saveSettings(prev);
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 820 }}>
      <h1 style={{ margin: 0 }}>Cài đặt</h1>
      {first && (
        <div className="alert ok" role="status">
          <div>
            <b>Chào {acc?.name ?? 'thầy cô'}! Đây là lần đầu thầy cô dùng Quickplay.</b> Hãy làm một lần duy nhất: cài Apps Script vào Google Drive của mình
            (xem <code>apps-script/HUONG_DAN_CAI_DAT.md</code>), rồi dán <b>link thư mục lưu trữ</b>, <b>link Apps Script</b> và <b>khóa giáo viên</b> vào dưới đây và bấm Lưu.
            Từ lần sau, chỉ cần đăng nhập là phần mềm tự nhớ.
          </div>
        </div>
      )}

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Nơi lưu dữ liệu</h2>
        <div className="type-grid" role="radiogroup" aria-label="Nơi lưu dữ liệu">
          {([
            ['drive', Cloud, 'Google Drive (khuyên dùng)', 'Dùng chung cho web, bản cài .exe và mọi thiết bị. Học sinh vào phòng từ điện thoại của mình.'],
            ['local', HardDrive, 'Chỉ máy này', 'Chạy thử ngay không cần cấu hình. Phiên trực tiếp chỉ mở được trên các tab cùng trình duyệt.'],
          ] as const).map(([id, Ic, t, d]) => (
            <button key={id} type="button" role="radio" aria-checked={s.backend === id} className="type-btn" onClick={() => set({ backend: id })}
              style={s.backend === id ? { borderColor: 'var(--primary)', background: '#eff6ff' } : undefined}>
              <span className="ic" style={{ background: s.backend === id ? 'var(--primary)' : '#94a3b8' }}><Ic size={20} /></span>
              <span><b>{t}</b><br /><small className="muted">{d}</small></span>
            </button>
          ))}
        </div>

        {s.backend === 'drive' && (
          <div className="stack">
            <label className="field">
              <span>Link thư mục lưu trữ trên Google Drive của thầy cô</span>
              <input className="input" value={s.folderUrl} onChange={(e) => set({ folderUrl: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" />
              <small className="help">Tạo một thư mục riêng trên Drive của thầy cô rồi dán link vào đây. Mọi bộ câu hỏi và kết quả được lưu trong thư mục này, chỉ thầy cô quản lý. Để trống thì Apps Script tự tạo thư mục QUICKPLAY_DATA.</small>
            </label>
            <label className="field">
              <span>URL Web App Apps Script</span>
              <input className="input" value={s.scriptUrl} onChange={(e) => set({ scriptUrl: e.target.value })} placeholder="https://script.google.com/macros/s/AKfy…/exec" />
              <small className="help">Làm theo tệp <code>apps-script/HUONG_DAN_CAI_DAT.md</code>: dán mã Code.gs, chạy <code>setup()</code>, triển khai Web App (Bất kỳ ai) rồi chép URL vào đây.</small>
            </label>
            <label className="field">
              <span>Khóa giáo viên (TEACHER_KEY)</span>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" type={show ? 'text' : 'password'} value={s.teacherKey} onChange={(e) => set({ teacherKey: e.target.value })} autoComplete="off" />
                <button type="button" className="btn icon" onClick={() => setShow((x) => !x)} aria-label={show ? 'Ẩn khóa' : 'Hiện khóa'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
              <small className="help">Chỉ giáo viên biết khóa này mới soạn đề và mở phòng được. Học sinh không cần khóa.</small>
            </label>
            <div className="row">
              <button className="btn" onClick={test} disabled={busy}><PlugZap size={18} /> Kiểm tra kết nối</button>
              <button className="btn ghost" onClick={migrate} disabled={busy || !s.scriptUrl}><UploadCloud size={18} /> Chép đề từ máy này lên Drive</button>
            </div>
            {status && <div className={`alert ${status.tone}`} role="status">{status.text}</div>}
          </div>
        )}
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Trí tuệ nhân tạo (Google Gemini – miễn phí)</h2>
        <p className="muted" style={{ margin: 0 }}>
          {s.backend === 'drive'
            ? 'Ở chế độ Google Drive, khóa Gemini được cất an toàn trong Script Properties (GEMINI_API_KEY) của Apps Script. Ô dưới chỉ dùng khi chạy "Chỉ máy này".'
            : 'Dán khóa API lấy miễn phí tại Google AI Studio. Khóa chỉ lưu trong trình duyệt này.'}
        </p>
        <a className="btn ghost sm" style={{ alignSelf: 'flex-start' }} href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Lấy khóa tại aistudio.google.com</a>
        <div className="row">
          <label className="field grow">
            <span>Khóa Gemini API</span>
            <input className="input" type="password" value={s.geminiKey} onChange={(e) => set({ geminiKey: e.target.value })} autoComplete="off" placeholder="AIza…" />
          </label>
          <label className="field">
            <span>Mô hình</span>
            <input className="input" value={s.geminiModel} onChange={(e) => set({ geminiModel: e.target.value })} />
          </label>
        </div>
      </section>

      {acc && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Tài khoản: {acc.name} ({acc.username})</h2>
          <div className="row">
            <label className="field grow"><span>Mật khẩu hiện tại</span><input className="input" type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} autoComplete="current-password" /></label>
            <label className="field grow"><span>Mật khẩu mới</span><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></label>
          </div>
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={changePw} disabled={busy || !pw.old || !pw.next}>Đổi mật khẩu</button>
        </section>
      )}

      <div className="row end">
        <button className="btn primary lg" onClick={store} disabled={busy}><Save size={20} /> Lưu cài đặt</button>
      </div>
      {isDesktop() && <p className="help">Bạn đang dùng bản cài đặt máy tính. Nhập giọng nói chỉ có ở bản web trên Chrome/Edge.</p>}
    </div>
  );
}
