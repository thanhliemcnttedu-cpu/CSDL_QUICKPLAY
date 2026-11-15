import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Cloud, HardDrive, PlugZap, Save, UploadCloud, Eye, EyeOff, ExternalLink, CheckCircle2, TriangleAlert, Download, Upload, FolderOpen, DatabaseBackup, FolderCog, HardDriveDownload, Minimize2, ArrowRightLeft, ChevronRight, KeyRound, Mail, Wand2, Wrench, Info } from 'lucide-react';
import { loadSettings, saveSettings, isDesktop, type AppSettings } from '../lib/settings';
import { GeminiKeyPanel } from '../components/GeminiKeyPanel';
import { changePassword, currentAccount, saveVault, setRecoveryEmail } from '../lib/account';
import { testConnection } from '../lib/api';
import { kvGet, kvKeys } from '../lib/idb';
import type { Quiz } from '../lib/types';
import { useToast, askConfirm } from '../components/ui';
import { ScriptInstaller, type InstallResult } from '../components/ScriptInstaller';
import { SCRIPT_VERSION, compareVersion, pingScript } from '../lib/installer';
import { noteScriptVersion } from '../lib/scriptUpdate';
import { ProgressLine, lastFullBackup, useFullBackup, useRestore } from '../components/BackupTools';
import { checkDriveSpace, driveSpace, fmtGB, type DriveSpace } from '../lib/driveFull';
import { formatBytes } from '../lib/util';
import { allowFolder, chooseFolder, folderMeta, folderState, forgetFolder, type FolderState } from '../lib/localFolder';
import { runSnapshot, snapshotName, snapshotOwner, snapshotStamp, snapshotStatus, type SnapshotStatus } from '../lib/autoSnapshot';
import '../installer.css';

/** Mục gập: chỉ hiện một dòng tiêu đề + trạng thái ngắn; bấm mới mở phần chi tiết. */
function Fold({ id, icon, title, note, open, locked, onToggle, children }: {
  id: string; icon: ReactNode; title: string; note?: ReactNode; open: boolean; locked?: boolean; onToggle: (open: boolean) => void; children: ReactNode;
}) {
  return (
    <details id={id} className="fold" open={open || locked} onToggle={(e) => { if (!locked) onToggle(e.currentTarget.open); }}>
      <summary onClick={(e) => { if (locked) e.preventDefault(); }}>
        {!locked && <ChevronRight size={18} className="chev" aria-hidden />}
        {icon}
        <span>{title}</span>
        {note && <small className="fold-note">{note}</small>}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

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
    pingScript(saved.scriptUrl).then((r) => { setServer({ version: r.version }); noteScriptVersion(r.version); }).catch((e) => setServer({ error: (e as Error).message }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const outdated = !!server && 'version' in server && compareVersion(server.version, SCRIPT_VERSION) < 0;

  // Các mục gập đang mở. Mở từ thông báo (…#cap-nhat, …#chuyen-kho) thì mở sẵn đúng mục.
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const h = location.hash;
    if (h.includes('chuyen-kho')) return new Set(['chuyen-kho']);
    if (h.includes('cap-nhat')) return new Set(['cai-dat-5-buoc']);
    return new Set();
  });
  const fold = (id: string) => ({
    id, open: openIds.has(id),
    onToggle: (o: boolean) => setOpenIds((prev) => { const n = new Set(prev); if (o) n.add(id); else n.delete(id); return n; }),
  });
  const openFold = (id: string) => {
    setOpenIds((prev) => new Set(prev).add(id));
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };
  useEffect(() => {
    const id = location.hash.includes('chuyen-kho') ? 'chuyen-kho' : location.hash.includes('cap-nhat') ? 'ket-noi' : '';
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, []);


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
    pingScript(next.scriptUrl).then((r) => { setServer({ version: r.version }); noteScriptVersion(r.version); }).catch(() => {});
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

  // Đã kết nối xong: chỉ hiện dòng trạng thái, mọi thứ còn lại gập lại
  const compact = connected && s.backend === 'drive' && !first;
  const dirty = (s.backend !== saved.backend || s.scriptUrl.trim() !== saved.scriptUrl || s.teacherKey.trim() !== saved.teacherKey || s.folderUrl.trim() !== saved.folderUrl)
    && !(s.backend === 'drive' && !s.scriptUrl.trim());
  const chooser = (
    <div className="type-grid" role="radiogroup" aria-label="Nơi lưu dữ liệu">
      {([
        ['drive', Cloud, 'Google Drive (khuyên dùng)', 'Dùng được trên mọi thiết bị. Học sinh vào phòng từ điện thoại của mình.'],
        ['local', HardDrive, 'Chỉ máy này', 'Chạy thử ngay không cần cấu hình. Chỉ dùng được trên trình duyệt này.'],
      ] as const).map(([id, Ic, t, d]) => (
        <button key={id} type="button" role="radio" aria-checked={s.backend === id} className="type-btn" onClick={() => set({ backend: id })}
          style={s.backend === id ? { borderColor: 'var(--primary)', background: '#eff6ff' } : undefined}>
          <span className="ic" style={{ background: s.backend === id ? 'var(--primary)' : '#94a3b8' }}><Ic size={20} /></span>
          <span><b>{t}</b><br /><small className="muted">{d}</small></span>
        </button>
      ))}
    </div>
  );
  const when = (t: number) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 1040 }}>
      <h1 style={{ margin: 0 }}>Cài đặt</h1>
      {first && (
        <div className="alert ok" role="status">
          <div>
            <b>Chào {acc?.name ?? 'thầy cô'}! Đây là lần đầu thầy cô dùng Quickplay.</b> Hãy làm một lần duy nhất (khoảng 10 phút): đi hết <b>5 bước</b> bên dưới
            để dữ liệu được lưu vào Google Drive của chính thầy cô. Từ lần sau, đăng nhập ở máy nào phần mềm cũng tự kết nối lại.
          </div>
        </div>
      )}

      <section className="card stack" id="ket-noi">
        <h2 style={{ margin: 0 }}>Nơi lưu dữ liệu</h2>
        {!compact && chooser}

        {s.backend === 'drive' && (
          <div className="stack">
            {connected ? (
              <div className="conn-ok" role="status">
                <CheckCircle2 size={22} />
                <span className="grow">Đã kết nối Google Drive{server && 'version' in server ? ` · Apps Script phiên bản ${server.version}${outdated ? '' : ' (mới nhất)'}` : ''}</span>
                {saved.folderUrl && <a className="btn sm" href={saved.folderUrl} target="_blank" rel="noopener noreferrer"><FolderOpen size={16} /> Mở thư mục</a>}
              </div>
            ) : (
              <div className="conn-off" role="status"><TriangleAlert size={22} /> Chưa kết nối Google Drive. Làm lần lượt 5 bước bên dưới.</div>
            )}
            {server && 'error' in server && <div className="alert error" role="alert">Không gọi được Apps Script đang lưu: {server.error}</div>}

            {connected && outdated && (
              <div className="upd-box" role="status">
                <div className="grow">
                  <b>Có bản cập nhật Apps Script {SCRIPT_VERSION}</b> (đang chạy {(server as { version: string }).version}).
                  <small>Làm 5 bước bên dưới, khoảng 3 phút. Link và dữ liệu giữ nguyên.</small>
                </div>
                <button className="btn primary" onClick={() => openFold('cai-dat-5-buoc')}><Wand2 size={18} /> Xem 5 bước cập nhật</button>
              </div>
            )}

            <Fold key="cai-dat" {...fold('cai-dat-5-buoc')} locked={!compact} icon={<Wand2 size={18} color="var(--primary)" />}
              title={compact ? 'Cập nhật hoặc cài đặt lại Apps Script (5 bước)' : 'Kết nối Google Drive (5 bước)'} note={compact ? (outdated ? 'Cần làm: có bản mới' : 'Khi có bản mới, đổi Gmail hoặc đổi thư mục') : undefined}>
              <ScriptInstaller kind="teacher" current={{ scriptUrl: saved.scriptUrl, key: saved.teacherKey, folderUrl: saved.folderUrl }} onDone={installed} />
            </Fold>


            <Fold key="sua-tay" {...fold('sua-tay')} icon={<Wrench size={18} color="var(--primary)" />} title="Sửa tay link và khóa" note="Ít khi cần dùng">
              <label className="field">
                <span className="row between">Link thư mục Google Drive lưu dữ liệu {s.folderUrl && <a href={s.folderUrl} target="_blank" rel="noopener noreferrer">Mở Drive <ExternalLink size={13} /></a>}</span>
                <input className="input" value={s.folderUrl} onChange={(e) => set({ folderUrl: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" />
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
                <small className="help">Phần mềm tự tạo và tự điền khóa này. Học sinh không cần khóa.</small>
              </label>
              <div className="row">
                <button className="btn success" onClick={store} disabled={busy}><Save size={18} /> Lưu kết nối</button>
                <button className="btn" onClick={test} disabled={busy}><PlugZap size={18} /> Kiểm tra link</button>
                <button className="btn ghost" onClick={migrate} disabled={busy || !s.scriptUrl}><UploadCloud size={18} /> Chép đề từ máy này lên Drive</button>
              </div>
              {status && <div className={`alert ${status.tone}`} role="status">{status.text}</div>}
            </Fold>

            {compact && (
              <Fold key="noi-luu" {...fold('noi-luu')} icon={<HardDrive size={18} color="var(--primary)" />} title="Đổi nơi lưu dữ liệu" note="Đang dùng Google Drive">
                {chooser}
              </Fold>
            )}
          </div>
        )}
      </section>

      <section className="card stack" id="sao-luu">
        <h2 className="row" style={{ margin: 0, gap: 8 }}><DatabaseBackup size={22} color="var(--primary)" /> Sao lưu và khôi phục</h2>
        {connected && space?.used !== undefined && space.limit ? (
          <div className="space-meter">
            <div className="row between"><b>Dung lượng Google Drive</b><small>{fmtGB(space.used)} / {fmtGB(space.limit)} ({Math.round((space.used / space.limit) * 100)}%)</small></div>
            <div className={`progress ${space.level}`} aria-hidden><i style={{ width: `${Math.min(100, (space.used / space.limit) * 100)}%` }} /></div>
          </div>
        ) : null}

        <div className="row">
          <button className="btn primary" onClick={full.run} disabled={!!full.prog || busy}><Download size={18} /> Tải file sao lưu toàn bộ</button>
          <button className="btn" onClick={restoreTool.open} disabled={!!full.prog || busy}><Upload size={18} /> Khôi phục từ file .json</button>
        </div>
        <small className="muted">
          Một tệp <code>.json</code> chứa tất cả: lớp, học sinh, bộ câu hỏi, kết quả, ảnh và âm thanh. Khi khôi phục, phần mềm cho xem trước và cho chọn nơi đưa dữ liệu vào.
          {last && <> Lần tải gần nhất: {last.name} ({formatBytes(last.size)}), {when(last.at)}.</>}
        </small>
        <ProgressLine prog={full.prog} />
        {restoreTool.dialog}

        <div className="folder-box">
          <div className="row between" style={{ width: '100%' }}>
            <b className="row" style={{ gap: 8 }}><FolderCog size={20} color="var(--primary)" /> Tự lưu khi dữ liệu thay đổi</b>
            <button className="btn sm primary" onClick={saveNow} disabled={busy}><HardDriveDownload size={16} /> Lưu ngay</button>
          </div>
          <div className="snap-grid">
            <div className={`snap-card ${snap?.drive === 'ok' ? 'ok' : connected ? (snap?.drive === 'old' || snap?.drive === 'error' ? 'bad' : '') : 'off'}`}>
              <small>Trên Google Drive</small>
              {!connected ? <span>Chưa kết nối Google Drive</span>
                : snap?.drive === 'ok' ? <span><CheckCircle2 size={16} /> Đã lưu {snap.driveUrl ? <a href={snap.driveUrl} target="_blank" rel="noopener noreferrer">{snap.name}</a> : snap.name}</span>
                : snap?.drive === 'old' ? <span><TriangleAlert size={16} /> Cần cập nhật Apps Script (mục Nơi lưu dữ liệu ở trên)</span>
                : snap?.drive === 'error' ? <span><TriangleAlert size={16} /> Lần lưu gần nhất bị lỗi</span>
                : <span>Chưa lưu lần nào</span>}
            </div>
            <div className={`snap-card ${snap?.local === 'ok' && folder.state === 'granted' ? 'ok' : folder.state === 'none' || folder.state === 'unsupported' ? 'off' : folder.state !== 'granted' ? 'bad' : ''}`}>
              <small>Trên máy tính này</small>
              {folder.state === 'unsupported' ? <span>Trình duyệt này không ghi được vào thư mục trên máy (dùng Chrome, Edge hoặc Cốc Cốc trên máy tính)</span>
                : folder.state === 'none' ? <span>Chưa chọn thư mục</span>
                : folder.state !== 'granted' ? <span><TriangleAlert size={16} /> Cần cho phép ghi lại vào “{folder.name}”</span>
                : snap?.local === 'ok' ? <span><CheckCircle2 size={16} /> Đã lưu vào “{folder.name}”</span>
                : <span>Thư mục “{folder.name}”, chưa lưu lần nào</span>}
              <div className="row" style={{ gap: 6 }}>
                {folder.state === 'none' && <button className="btn sm" onClick={pickFolder}><FolderOpen size={14} /> Chọn thư mục</button>}
                {(folder.state === 'prompt' || folder.state === 'denied') && <button className="btn sm primary" onClick={async () => { if (await allowFolder()) saveNow(); else toast('Trình duyệt chưa cho phép. Hãy bấm lại và chọn "Cho phép".', 'error'); }}>Cho phép ghi lại</button>}
                {folder.state !== 'unsupported' && folder.state !== 'none' && <>
                  <button className="btn sm" onClick={pickFolder}>Đổi thư mục</button>
                  <button className="btn sm ghost" onClick={async () => { if (await askConfirm('Ngừng tự lưu vào thư mục này trên máy? Tệp đã ghi vẫn nằm nguyên trong thư mục.')) await forgetFolder(); }}>Ngừng lưu</button>
                </>}
              </div>
            </div>
          </div>
          {snap && <small className="muted">Lần lưu gần nhất: {new Date(snap.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}{snap.counts ? ` · ${snap.counts.quizzes} bộ câu hỏi, ${snap.counts.classes} lớp, ${snap.counts.sessions} buổi đã tổ chức` : ''}</small>}
          {snap?.error && <div className="alert error" role="alert"><div>{snap.error}</div></div>}
        </div>

        <Fold {...fold('tu-luu')} icon={<Info size={18} color="var(--primary)" />} title="Tự lưu hoạt động thế nào?">
          <ul className="help" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Mỗi khi thầy cô thêm, sửa, xóa bộ câu hỏi, lớp, học sinh hay tổ chức một buổi, phần mềm tự ghi <b>một tệp .json duy nhất</b> chứa toàn bộ dữ liệu, ví dụ <code>{nextName}</code>.</li>
            <li>Tệp được ghi sau khoảng 15 giây kể từ thay đổi cuối, hai lần lưu cách nhau ít nhất 3 phút; trong giờ học chỉ lưu khi bấm Kết thúc.</li>
            <li>Mỗi nơi chỉ giữ tệp mới nhất. Trên Google Drive, tệp cũ vào Thùng rác (khôi phục được trong 30 ngày).</li>
            <li>Trên máy tính nên chọn thư mục ở <b>ổ D hoặc E</b> (cài lại Windows thường xóa ổ C). Mỗi lần mở lại trình duyệt, trình duyệt hỏi lại quyền ghi.</li>
            <li>Nơi lưu chính vẫn là {connected ? 'Google Drive của thầy cô' : 'trình duyệt của máy này'}; tệp này là bản sao lưu, khôi phục bằng nút <b>Khôi phục từ file .json</b>.</li>
          </ul>
        </Fold>

        {connected && (
          <Fold {...fold('nen')} icon={<Minimize2 size={18} color="var(--primary)" />} title="Nén ảnh, âm thanh đã tải lên" note="Lấy lại dung lượng Drive">
            <p className="muted" style={{ margin: 0 }}>
              Ảnh và âm thanh mới đã <b>tự được nén trước khi tải lên</b>. Nút dưới đây nén lại các tệp tải lên từ trước; tệp gốc vào Thùng rác của Drive (khôi phục được trong 30 ngày).
              Video nên nhúng từ YouTube để không tốn dung lượng Drive.
            </p>
            <ProgressLine prog={opt} />
            <div className="row"><button className="btn" onClick={optimize} disabled={!!opt || busy}><Minimize2 size={18} /> Nén lại ảnh, âm thanh đã tải lên</button></div>
          </Fold>
        )}

        <Fold {...fold('chuyen-kho')} icon={<ArrowRightLeft size={18} color="var(--primary)" />} title="Khi Google Drive đã đầy" note="Chuyển sang Drive mới trong 5 bước">
          <ol className="move-steps">
            <li><b>Tải file sao lưu toàn bộ</b> bằng nút ở trên (vẫn tải được khi Drive đã đầy). Cất tệp vào ổ D, USB hoặc gửi vào email của mình.</li>
            <li><b>Tạo thư mục trong Google Drive mới</b> (một Gmail khác còn trống, hoặc tài khoản có dung lượng lớn hơn) và chép link thư mục.</li>
            <li>Mở mục <b>Cập nhật hoặc cài đặt lại Apps Script (5 bước)</b> ở phần Nơi lưu dữ liệu, chọn <b>Cài mới</b>, đăng nhập Apps Script bằng Gmail mới và dán link thư mục mới.</li>
            <li><b>Khôi phục từ file .json</b> → chọn tệp vừa tải → <b>Google Drive đang kết nối</b>. Toàn bộ dữ liệu, ảnh và âm thanh được đưa lên Drive mới.</li>
            <li>Kiểm tra Thư viện, Lớp và Báo cáo. Drive cũ có thể giữ lại làm bản lưu trữ hoặc dọn đi.</li>
          </ol>
          <small className="muted">Chưa kịp có Drive mới? Khi khôi phục chọn <b>Chỉ máy này</b>: dữ liệu dùng ngay trên máy tính, sau này đưa lên Drive mới cũng được.</small>
        </Fold>
      </section>

      <GeminiKeyPanel onChange={(k, m) => set({ geminiKey: k, geminiModel: m })} />

      {acc && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Tài khoản: {acc.name} ({acc.username})</h2>
          <Fold {...fold('mat-khau')} icon={<KeyRound size={18} color="var(--primary)" />} title="Đổi mật khẩu" note="Có thể giữ nguyên mật khẩu được cấp">
            <div className="row">
              <label className="field grow"><span>Mật khẩu hiện tại</span><input className="input" type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} autoComplete="current-password" /></label>
              <label className="field grow"><span>Mật khẩu mới (từ 6 ký tự)</span><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></label>
              <label className="field grow"><span>Email của thầy cô</span><input className="input" type="email" inputMode="email" value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} placeholder="tenthayco@gmail.com" autoComplete="email" /></label>
            </div>
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={changePw} disabled={busy || !pw.old || !pw.next || !mail.email.trim()}>Đổi mật khẩu</button>
            <small className="help">Mật khẩu mới được <b>gửi về email này</b> và được <b>lưu ở hồ sơ của quản trị</b> để hỗ trợ khi thầy cô quên. Vì vậy đừng dùng lại mật khẩu của Gmail, ngân hàng hay tài khoản quan trọng khác.</small>
          </Fold>
          <Fold {...fold('email')} icon={<Mail size={18} color="var(--primary)" />} title="Email khôi phục" note={mail.saved || 'Chưa khai báo'}>
            <p className="muted" style={{ margin: 0 }}>Khi quên mật khẩu, bấm <b>Quên mật khẩu?</b> ở màn đăng nhập: phần mềm gửi mã 6 số tới email này để thầy cô đặt mật khẩu mới.</p>
            <div className="row">
              <label className="field grow"><span>Email khôi phục (để trống = xóa)</span><input className="input" type="email" inputMode="email" value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} placeholder="tenthayco@gmail.com" autoComplete="email" /></label>
              <label className="field grow"><span>Mật khẩu hiện tại (để xác nhận)</span><input className="input" type="password" value={mail.password} onChange={(e) => setMail({ ...mail, password: e.target.value })} autoComplete="current-password" /></label>
            </div>
            <button className="btn success" style={{ alignSelf: 'flex-start' }} onClick={saveMail} disabled={busy || !mail.password}>Lưu email khôi phục</button>
            <small className="help">Nên dùng email cá nhân mà chỉ thầy cô mở được. Sau khi đặt lại mật khẩu bằng mã, thầy cô cần kết nối lại Google Drive một lần (nạp tệp kết nối, hoặc dán lại link và khóa giáo viên).</small>
          </Fold>
        </section>
      )}

      {dirty && (
        <div className="save-bar" role="status">
          <span>Có thay đổi chưa lưu ở mục Nơi lưu dữ liệu.</span>
          <button className="btn primary" onClick={store} disabled={busy}><Save size={18} /> Lưu cài đặt</button>
        </div>
      )}
      {isDesktop() && <p className="help">Bạn đang dùng bản cài đặt máy tính. Nhập giọng nói chỉ có ở bản web trên Chrome/Edge.</p>}
    </div>
  );
}
