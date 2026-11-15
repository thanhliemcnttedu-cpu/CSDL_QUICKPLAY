import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Cloud, HardDrive, PlugZap, Save, UploadCloud, Eye, EyeOff, ExternalLink, CheckCircle2, TriangleAlert, Download, Upload, FolderOpen, DatabaseBackup, FolderCog, HardDriveDownload, Minimize2, ArrowRightLeft } from 'lucide-react';
import { loadSettings, saveSettings, isDesktop, type AppSettings } from '../lib/settings';
import { changePassword, currentAccount, saveVault, setRecoveryEmail } from '../lib/account';
import { testConnection } from '../lib/api';
import { kvGet, kvKeys } from '../lib/idb';
import type { Quiz } from '../lib/types';
import { useToast, askConfirm } from '../components/ui';
import { ScriptInstaller, type InstallResult } from '../components/ScriptInstaller';
import { SCRIPT_VERSION, compareVersion, pingScript } from '../lib/installer';
import { ScriptUpdatePanel } from '../components/ScriptUpdate';
import { ProgressLine, lastFullBackup, useFullBackup, useRestore } from '../components/BackupTools';
import { checkDriveSpace, driveSpace, fmtGB, type DriveSpace } from '../lib/driveFull';
import { formatBytes } from '../lib/util';
import { allowFolder, chooseFolder, folderMeta, folderState, forgetFolder, type FolderState } from '../lib/localFolder';
import { runSnapshot, snapshotName, snapshotOwner, snapshotStamp, snapshotStatus, type SnapshotStatus } from '../lib/autoSnapshot';
import '../installer.css';

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
  const [mail, setMail] = useState({ email: acc?.email ?? '', password: '', saved: acc?.email ?? '' });
  const saveMail = async () => {
    setBusy(true);
    try {
      const e = await setRecoveryEmail(mail.email, mail.password);
      setMail({ email: e, password: '', saved: e });
      toast(e ? 'Đã lưu email khôi phục.' : 'Đã xóa email khôi phục.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const saved = loadSettings();
  const connected = saved.backend === 'drive' && !!saved.scriptUrl;
  // Máy chủ Apps Script đang chạy phiên bản nào (để nhắc cập nhật khi phần mềm có mã mới)
  const [server, setServer] = useState<{ version: string } | { error: string } | null>(null);
  useEffect(() => {
    if (!connected) return;
    pingScript(saved.scriptUrl).then((r) => setServer({ version: r.version })).catch((e) => setServer({ error: (e as Error).message }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const outdated = !!server && 'version' in server && compareVersion(server.version, SCRIPT_VERSION) < 0;

  // Thư mục trên máy tính để tự lưu thêm một bản
  const [folder, setFolder] = useState<{ state: FolderState; name: string; last?: number; error?: string }>({ state: 'none', name: '' });
  const refreshFolder = async () => {
    const m = folderMeta();
    setFolder({ state: await folderState(), name: m?.name ?? '', last: m?.last, error: m?.error });
  };
  useEffect(() => {
    refreshFolder();
    window.addEventListener('quickplay-folder', refreshFolder);
    return () => window.removeEventListener('quickplay-folder', refreshFolder);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pickFolder = async () => {
    try {
      const m = await chooseFolder();
      if (m) {
        toast(`Đã chọn thư mục “${m.name}”. Phần mềm ghi ngay tệp gộp vào đây và tự cập nhật mỗi khi dữ liệu thay đổi.`, 'ok');
        saveNow();
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  // Tệp gộp: một tệp .json duy nhất mang tên đăng nhập + ngày giờ, tự lưu lên Drive và vào thư mục trên máy
  const [snap, setSnap] = useState<SnapshotStatus | null>(snapshotStatus());
  useEffect(() => {
    const on = () => setSnap(snapshotStatus());
    window.addEventListener('quickplay-snapshot', on);
    return () => window.removeEventListener('quickplay-snapshot', on);
  }, []);
  const saveNow = async () => {
    setBusy(true);
    try {
      const r = await runSnapshot();
      if (!r) return toast('Chưa có nơi nào để lưu: hãy kết nối Google Drive hoặc chọn thư mục trên máy tính.', 'info');
      if (r.error) toast(r.error, 'error');
      else toast(`Đã lưu tệp ${r.name}.`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const nextName = snapshotName(snapshotOwner(acc?.username), snapshotStamp());

  // Trình cài đặt đã kiểm tra xong link /exec: lưu kết nối, gắn thư mục, cất vào tài khoản để máy khác tự nhớ
  const installed = async (r: InstallResult) => {
    const prev = loadSettings();
    const next: AppSettings = { ...prev, backend: 'drive', scriptUrl: r.scriptUrl, teacherKey: r.key || prev.teacherKey, folderUrl: r.folderUrl || prev.folderUrl };
    saveSettings(next);
    let folderName = '';
    try {
      const { api } = await import('../lib/api');
      if (next.folderUrl) folderName = (await api.setRootFolder(next.folderUrl)).name;
      else await testConnection(next.scriptUrl);
      if (acc) await saveVault({ scriptUrl: next.scriptUrl, teacherKey: next.teacherKey, folderUrl: next.folderUrl });
    } catch (e) {
      saveSettings(prev);
      throw e;
    }
    setS(next);
    toast(acc ? 'Đã kết nối Google Drive. Tài khoản của thầy cô sẽ nhớ cấu hình này trên mọi máy.' : 'Đã kết nối Google Drive.', 'ok');
    // để thầy cô kịp thấy tích xanh và tải tệp kết nối rồi mới tải lại trang
    if (first) setTimeout(() => location.replace(location.pathname + '#/teacher'), 6000);
    return { folderName, folderUrl: next.folderUrl };
  };

  const full = useFullBackup();
  const restoreTool = useRestore();
  const [space, setSpace] = useState<DriveSpace | null>(driveSpace());
  useEffect(() => {
    if (connected) checkDriveSpace(true).then(setSpace).catch(() => {});
    const on = () => setSpace(driveSpace());
    window.addEventListener('quickplay-drive-space', on);
    return () => window.removeEventListener('quickplay-drive-space', on);
  }, [connected]);
  // nhảy tới mục hướng dẫn khi mở từ cảnh báo "Drive đã đầy"
  useEffect(() => {
    if (location.hash.includes('chuyen-kho')) setTimeout(() => document.getElementById('chuyen-kho')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, []);
  const [opt, setOpt] = useState<{ text: string; pct: number } | null>(null);
  const optimize = async () => {
    if (!(await askConfirm('Nén lại toàn bộ ảnh và âm thanh đã tải lên Google Drive?\n\nẢnh được đổi sang WebP, âm thanh sang Opus. Chỉ tệp nào nhẹ đi rõ rệt mới được thay; tệp gốc chuyển vào Thùng rác của Drive (khôi phục được trong 30 ngày, sau đó Drive mới thật sự trống ra). Việc này có thể mất vài phút, hãy giữ trang này mở.', { okLabel: 'Bắt đầu nén' }))) return;
    setOpt({ text: 'Đang bắt đầu…', pct: 0 });
    try {
      const { optimizeDriveMedia } = await import('../lib/mediaOptimize');
      const r = await optimizeDriveMedia((text, pct) => setOpt({ text, pct: pct ?? 0 }));
      toast(r.shrunk ? `Đã nén ${r.shrunk}/${r.checked} tệp: ${formatBytes(r.before)} → ${formatBytes(r.after)} (tiết kiệm ${formatBytes(r.before - r.after)}). Dọn Thùng rác của Drive để lấy lại dung lượng ngay.` : `Đã xem ${r.checked} tệp: tất cả đều đã gọn, không cần nén thêm.`, 'ok');
      checkDriveSpace(true).then(setSpace).catch(() => {});
    } catch (e) {
      toast(/không hợp lệ|Hành động/.test((e as Error).message) ? 'Apps Script của thầy cô đang chạy bản cũ. Hãy cập nhật (Trình cài đặt → Cập nhật bản mới) rồi chạy lại.' : (e as Error).message, 'error');
    } finally {
      setOpt(null);
    }
  };
  const last = lastFullBackup();

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail.email.trim())) return toast('Muốn đổi mật khẩu, hãy điền địa chỉ email của thầy cô ở ô Email.', 'error');
    setBusy(true);
    try {
      const r = await changePassword(pw.old, pw.next, mail.email);
      setPw({ old: '', next: '' });
      setMail({ email: r.email, password: '', saved: r.email });
      toast(r.mailed ? `Đã đổi mật khẩu. Mật khẩu mới đã được gửi tới ${r.email}.` : 'Đã đổi mật khẩu. Chưa gửi được thư báo (máy chủ hết lượt gửi thư hôm nay).', 'ok');
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
    <div className="stack" style={{ gap: 20, maxWidth: 1040 }}>
      <h1 style={{ margin: 0 }}>Cài đặt</h1>
      {first && (
        <div className="alert ok" role="status">
          <div>
            <b>Chào {acc?.name ?? 'thầy cô'}! Đây là lần đầu thầy cô dùng Quickplay.</b> Hãy làm một lần duy nhất (khoảng 10 phút): đi hết <b>5 bước của Trình cài đặt</b> bên dưới
            để dữ liệu được lưu vào Google Drive của chính thầy cô. Từ lần sau, đăng nhập ở máy nào phần mềm cũng tự kết nối lại.
            Mật khẩu được cấp có thể giữ nguyên, hoặc đổi ở mục <b>Tài khoản</b> cuối trang này.
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
            {connected ? (
              <div className="conn-ok" role="status"><CheckCircle2 size={22} /> Dữ liệu của thầy cô đã được kết nối với Google Drive{server && 'version' in server ? ` (máy chủ phiên bản ${server.version})` : ''}</div>
            ) : (
              <div className="conn-off" role="status"><TriangleAlert size={22} /> Chưa kết nối Google Drive. Làm theo Trình cài đặt 5 bước bên dưới.</div>
            )}
            {server && 'error' in server && <div className="alert error" role="alert">Không gọi được Apps Script đang lưu: {server.error}</div>}
            {outdated && <div className="alert warn" role="status"><div><b>Apps Script của thầy cô đang chạy mã cũ</b> (phiên bản {(server as { version: string }).version}, phần mềm cần {SCRIPT_VERSION}). Chọn thẻ <b>Cập nhật bản mới</b> trong Trình cài đặt bên dưới và làm 5 bước; link và dữ liệu giữ nguyên.</div></div>}

            <ScriptInstaller kind="teacher" current={{ scriptUrl: saved.scriptUrl, key: saved.teacherKey, folderUrl: saved.folderUrl }} onDone={installed} />
            {connected && <ScriptUpdatePanel />}

            <details className="card tight" open={connected && !first}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}><FolderOpen size={16} style={{ verticalAlign: '-2px' }} /> Thư mục và Apps Script đang dùng (sửa tay)</summary>
              <div className="stack" style={{ marginTop: 10 }}>
                <label className="field">
                  <span className="row between">Link thư mục Google Drive lưu dữ liệu {s.folderUrl && <a href={s.folderUrl} target="_blank" rel="noopener noreferrer">Mở Drive <ExternalLink size={13} /></a>}</span>
                  <input className="input" value={s.folderUrl} onChange={(e) => set({ folderUrl: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" />
                  <small className="help">Mọi bộ câu hỏi và kết quả được lưu trong thư mục này, chỉ thầy cô quản lý. Để trống thì Apps Script tự tạo thư mục QUICKPLAY_DATA.</small>
                </label>
                <label className="field">
                  <span>Link Apps Script (đuôi /exec)</span>
                  <input className="input" value={s.scriptUrl} onChange={(e) => set({ scriptUrl: e.target.value })} placeholder="https://script.google.com/macros/s/AKfy…/exec" />
                </label>
                <label className="field">
                  <span>Khóa giáo viên</span>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input className="input" type={show ? 'text' : 'password'} value={s.teacherKey} onChange={(e) => set({ teacherKey: e.target.value })} autoComplete="off" />
                    <button type="button" className="btn icon" onClick={() => setShow((x) => !x)} aria-label={show ? 'Ẩn khóa' : 'Hiện khóa'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                  <small className="help">Trình cài đặt tự tạo và tự điền khóa này. Chỉ giáo viên có khóa mới soạn đề và mở phòng được; học sinh không cần khóa.</small>
                </label>
                <div className="row">
                  <button className="btn success" onClick={store} disabled={busy}><Save size={18} /> Lưu kết nối</button>
                  <button className="btn" onClick={test} disabled={busy}><PlugZap size={18} /> Kiểm tra link</button>
                  <button className="btn ghost" onClick={migrate} disabled={busy || !s.scriptUrl}><UploadCloud size={18} /> Chép đề từ máy này lên Drive</button>
                </div>
                {status && <div className={`alert ${status.tone}`} role="status">{status.text}</div>}
              </div>
            </details>
            <ul className="help" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Mọi thay đổi (bộ câu hỏi, lớp, kết quả) được ghi thẳng lên Google Drive của thầy cô ngay khi lưu, không cần bấm đồng bộ.</li>
              <li>Đổi máy tính: chỉ cần đăng nhập đúng tài khoản và mật khẩu, phần mềm tự kết nối lại thư mục và Apps Script này.</li>
            </ul>
          </div>
        )}
      </section>

      <section className="card stack" id="sao-luu">
        <h2 className="row" style={{ margin: 0, gap: 8 }}><DatabaseBackup size={22} color="var(--primary)" /> Sao lưu và khôi phục</h2>
        {connected && space?.used !== undefined && space.limit ? (
          <div className="space-meter">
            <div className="row between"><b>Dung lượng Google Drive</b><small>{fmtGB(space.used)} / {fmtGB(space.limit)} ({Math.round((space.used / space.limit) * 100)}%)</small></div>
            <div className={`progress ${space.level}`} aria-hidden><i style={{ width: `${Math.min(100, (space.used / space.limit) * 100)}%` }} /></div>
            <small className="muted">Tài khoản Gmail miễn phí có 15 GB dùng chung cho Drive, Gmail và Ảnh. Khi dùng từ 90% trở lên, phần mềm sẽ nhắc tải tệp sao lưu.</small>
          </div>
        ) : null}
        <div className="backup-grid">
          <div>
            <b>Tải file sao lưu toàn bộ về máy tính</b>
            <p className="muted small">Một tệp <code>.json</code> duy nhất chứa: thông tin tài khoản (tên đăng nhập, họ tên, email), môn học – chương – bài, lớp và danh sách học sinh,
              tất cả bộ câu hỏi (ngân hàng câu hỏi), kết quả các buổi đã tổ chức, và <b>ảnh, âm thanh trong câu hỏi</b> (đóng gói ngay trong tệp nên không phụ thuộc Drive cũ).</p>
            <button className="btn primary" onClick={full.run} disabled={!!full.prog || busy}><Download size={18} /> Tải file sao lưu toàn bộ</button>
            {last && <small className="muted" style={{ display: 'block', marginTop: 6 }}>Lần tải gần nhất trên máy này: {last.name} ({formatBytes(last.size)}), {new Date(last.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</small>}
          </div>
          <div>
            <b>Khôi phục từ file sao lưu</b>
            <p className="muted small">Chọn file sao lưu toàn bộ, file gộp tự lưu, hoặc file một bộ câu hỏi lẻ. Phần mềm cho xem số lượng và cho chọn nơi khôi phục: Google Drive đang kết nối, hoặc <b>chạy độc lập trên máy này</b>.</p>
            <button className="btn" onClick={restoreTool.open} disabled={!!full.prog || busy}><Upload size={18} /> Chọn file .json để khôi phục</button>
          </div>
        </div>
        <ProgressLine prog={full.prog} />
        {restoreTool.dialog}

        {connected && (
          <div className="folder-box">
            <b className="row" style={{ gap: 8 }}><Minimize2 size={20} color="var(--primary)" /> Nén ảnh, âm thanh để tiết kiệm dung lượng</b>
            <p className="muted" style={{ margin: 0 }}>
              Từ nay ảnh và âm thanh <b>tự được nén trước khi tải lên</b>: ảnh đổi sang WebP (cạnh dài tối đa 1280 điểm ảnh), âm thanh đổi sang Opus 24 kbit/s một kênh
              (1 phút chỉ còn khoảng 180 KB, nhỏ hơn MP3 khoảng 5 lần). Ảnh trùng nhau chỉ lưu một lần. Video nên nhúng từ YouTube (không tốn dung lượng Drive, phát mượt hơn trên điện thoại).
              Ảnh và âm thanh tải lên từ trước có thể nén lại bằng nút dưới đây.
            </p>
            <ProgressLine prog={opt} />
            <div className="row"><button className="btn" onClick={optimize} disabled={!!opt || busy}><Minimize2 size={18} /> Nén lại ảnh, âm thanh đã tải lên</button></div>
          </div>
        )}

        <div className="folder-box" id="chuyen-kho">
          <b className="row" style={{ gap: 8 }}><ArrowRightLeft size={20} color="var(--primary)" /> Khi Google Drive đã đầy: chuyển sang kho lưu trữ mới</b>
          <ol className="move-steps">
            <li><b>Tải file sao lưu toàn bộ</b> bằng nút ở trên (vẫn tải được khi Drive đã đầy). Cất tệp vào ổ D, USB hoặc gửi vào email của mình.</li>
            <li><b>Tạo thư mục trong Google Drive mới</b> (một Gmail khác còn trống, hoặc tài khoản Google One có dung lượng lớn hơn) và chép link thư mục.</li>
            <li><b>Chạy lại Trình cài đặt</b> ở mục <b>Nơi lưu dữ liệu</b> phía trên, đăng nhập Apps Script bằng Gmail mới và dán link thư mục mới. Tài khoản Quickplay tự nhớ kết nối mới trên mọi máy.</li>
            <li><b>Khôi phục từ file sao lưu</b> → chọn tệp vừa tải → <b>Google Drive đang kết nối</b>. Toàn bộ lớp học, học sinh, môn học, bộ câu hỏi, kết quả và ảnh/âm thanh được đưa lên Drive mới, link tự đổi theo.</li>
            <li>Kiểm tra Thư viện, Lớp và Báo cáo. Drive cũ có thể giữ lại làm bản lưu trữ hoặc dọn đi.</li>
          </ol>
          <small className="muted">Không có Internet hoặc chưa kịp có Drive mới? Chọn <b>Chỉ máy này (chạy độc lập)</b> khi khôi phục: dữ liệu mở và dùng ngay trên máy tính, sau này khôi phục lại lên Drive mới cũng được.</small>
        </div>

        <div className="folder-box">
          <b className="row" style={{ gap: 8 }}><FolderCog size={20} color="var(--primary)" /> Tự lưu một tệp gộp mỗi khi dữ liệu thay đổi</b>
          <p className="muted" style={{ margin: 0 }}>
            Mỗi lần thầy cô thêm, sửa, xóa bộ câu hỏi, câu hỏi, môn học – chương – bài, lớp và học sinh, hay tổ chức một buổi, phần mềm tự ghi lại
            <b> một tệp .json duy nhất</b> chứa toàn bộ dữ liệu (sau khoảng 15 giây kể từ thay đổi cuối, hai lần lưu cách nhau ít nhất 3 phút; trong giờ học chỉ lưu khi bấm Kết thúc), đặt tên theo tên đăng nhập và thời điểm lưu, ví dụ <code>{nextName}</code>.
            Mỗi nơi chỉ giữ tệp mới nhất; tệp này khôi phục được bằng nút <b>Chọn file .json để khôi phục</b> ở trên.
          </p>

          <div className="snap-grid">
            <div className={`snap-card ${snap?.drive === 'ok' ? 'ok' : connected ? (snap?.drive === 'old' || snap?.drive === 'error' ? 'bad' : '') : 'off'}`}>
              <small>Thư mục Google Drive</small>
              {!connected ? <span>Chưa kết nối Google Drive</span>
                : snap?.drive === 'ok' ? <span><CheckCircle2 size={16} /> Đã lưu {snap.driveUrl ? <a href={snap.driveUrl} target="_blank" rel="noopener noreferrer">{snap.name}</a> : snap.name}</span>
                : snap?.drive === 'old' ? <span><TriangleAlert size={16} /> Cần cập nhật Apps Script (Trình cài đặt → Cập nhật bản mới)</span>
                : snap?.drive === 'error' ? <span><TriangleAlert size={16} /> Lần lưu gần nhất bị lỗi</span>
                : <span>Chưa lưu lần nào</span>}
            </div>
            <div className={`snap-card ${snap?.local === 'ok' && folder.state === 'granted' ? 'ok' : folder.state === 'none' || folder.state === 'unsupported' ? 'off' : folder.state !== 'granted' ? 'bad' : ''}`}>
              <small>Thư mục trên máy tính này</small>
              {folder.state === 'unsupported' ? <span>Trình duyệt này không ghi được vào thư mục trên máy (dùng Chrome, Edge hoặc Cốc Cốc trên máy tính)</span>
                : folder.state === 'none' ? <span>Chưa chọn thư mục</span>
                : folder.state !== 'granted' ? <span><TriangleAlert size={16} /> Cần cho phép ghi lại vào “{folder.name}”</span>
                : snap?.local === 'ok' ? <span><CheckCircle2 size={16} /> Đã lưu vào “{folder.name}”</span>
                : <span>Thư mục “{folder.name}”, chưa lưu lần nào</span>}
            </div>
          </div>
          {snap && <small className="muted">Lần lưu gần nhất: <b>{snap.name}</b> lúc {new Date(snap.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}{snap.counts ? ` · ${snap.counts.quizzes} bộ câu hỏi, ${snap.counts.classes} lớp, ${snap.counts.sessions} buổi đã tổ chức` : ''}</small>}
          {snap?.error && <div className="alert error" role="alert"><div>{snap.error}</div></div>}

          <div className="row">
            <button className="btn primary" onClick={saveNow} disabled={busy}><HardDriveDownload size={18} /> Lưu ngay</button>
            {folder.state === 'none' && <button className="btn accent" onClick={pickFolder}><FolderOpen size={18} /> Chọn thư mục trên máy tính</button>}
            {(folder.state === 'prompt' || folder.state === 'denied') && <button className="btn sm primary" onClick={async () => { if (await allowFolder()) saveNow(); else toast('Trình duyệt chưa cho phép. Hãy bấm lại và chọn "Cho phép".', 'error'); }}>Cho phép ghi lại</button>}
            {folder.state !== 'unsupported' && folder.state !== 'none' && <>
              <button className="btn sm" onClick={pickFolder}>Đổi thư mục</button>
              <button className="btn sm ghost" onClick={async () => { if (await askConfirm('Ngừng tự lưu vào thư mục này trên máy? Tệp đã ghi vẫn nằm nguyên trong thư mục.')) await forgetFolder(); }}>Ngừng lưu vào máy</button>
            </>}
          </div>
          <ul className="help" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Trên Google Drive, tệp nằm ở <b>thư mục lưu trữ đã kết nối</b>; tệp cũ được chuyển vào Thùng rác (khôi phục được trong 30 ngày).</li>
            <li>Trên máy tính, nên chọn thư mục ở <b>ổ D hoặc E</b>: khi cài lại Windows, ổ C thường bị xóa. Mỗi lần mở lại trình duyệt, trình duyệt hỏi lại quyền ghi.</li>
            <li>Nơi lưu chính vẫn là {connected ? 'Google Drive của thầy cô' : 'trình duyệt của máy này'}; tệp gộp là bản sao lưu để mang đi hoặc khôi phục.</li>
          </ul>
        </div>
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
          <h3 style={{ margin: 0 }}>Mật khẩu</h3>
          <p className="muted" style={{ margin: 0 }}>Thầy cô <b>có thể giữ nguyên mật khẩu được quản trị cấp</b>, hoặc đổi sang mật khẩu của riêng mình (từ 6 ký tự: chỉ số, chữ, hoặc kết hợp chữ hoa, chữ thường, số, ký tự đặc biệt đều được).</p>
          <div className="row">
            <label className="field grow"><span>Mật khẩu hiện tại</span><input className="input" type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} autoComplete="current-password" /></label>
            <label className="field grow"><span>Mật khẩu mới</span><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></label>
            <label className="field grow"><span>Email của thầy cô (bắt buộc khi đổi)</span><input className="input" type="email" inputMode="email" value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} placeholder="tenthayco@gmail.com" autoComplete="email" /></label>
          </div>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={changePw} disabled={busy || !pw.old || !pw.next || !mail.email.trim()}>Đổi mật khẩu</button>
          <small className="help">Khi đổi, mật khẩu mới được <b>gửi về email này</b> và được <b>lưu ở hồ sơ của quản trị</b> để quản trị hỗ trợ khi thầy cô quên. Vì vậy đừng dùng lại mật khẩu của Gmail, ngân hàng hay tài khoản quan trọng khác.</small>

          <h3 style={{ margin: '8px 0 0' }}>Email khôi phục</h3>
          <p className="muted" style={{ margin: 0 }}>
            Khi quên mật khẩu, bấm <b>Quên mật khẩu?</b> ở màn đăng nhập: phần mềm gửi mã 6 số tới email này để thầy cô đặt mật khẩu mới.
            {mail.saved ? <> Email đang dùng: <b>{mail.saved}</b>.</> : <> Hiện <b>chưa khai báo</b>.</>}
          </p>
          <div className="row">
            <label className="field grow"><span>Email khôi phục (để trống = xóa)</span><input className="input" type="email" inputMode="email" value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} placeholder="tenthayco@gmail.com" autoComplete="email" /></label>
            <label className="field grow"><span>Mật khẩu hiện tại (để xác nhận)</span><input className="input" type="password" value={mail.password} onChange={(e) => setMail({ ...mail, password: e.target.value })} autoComplete="current-password" /></label>
          </div>
          <button className="btn success" style={{ alignSelf: 'flex-start' }} onClick={saveMail} disabled={busy || !mail.password}>Lưu email khôi phục</button>
          <small className="help">Nên dùng email cá nhân mà chỉ thầy cô mở được. Sau khi đặt lại mật khẩu bằng mã, thầy cô cần kết nối lại Google Drive một lần (dán lại link thư mục, link Apps Script và khóa giáo viên; khóa xem được trong Apps Script → Cài đặt dự án → Thuộc tính tập lệnh → TEACHER_KEY).</small>
        </section>
      )}

      <div className="row end">
        <button className="btn primary lg" onClick={store} disabled={busy}><Save size={20} /> Lưu cài đặt</button>
      </div>
      {isDesktop() && <p className="help">Bạn đang dùng bản cài đặt máy tính. Nhập giọng nói chỉ có ở bản web trên Chrome/Edge.</p>}
    </div>
  );
}
