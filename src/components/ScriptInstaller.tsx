// Trình cài đặt Apps Script 5 bước, dùng chung cho giáo viên (kho dữ liệu riêng) và quản trị (máy chủ tài khoản).
import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Code2, Copy, Download, ExternalLink, FolderOpen, Link2, Loader2, Pencil, Rocket, Save, Trash2, TriangleAlert, Upload, Wand2, X } from 'lucide-react';
import { ADMIN_SCRIPT_VERSION, SCRIPT_VERSION as TEACHER_SCRIPT_VERSION, compareVersion, buildLinkFile, fillAdminCode, fillTeacherCode, folderIdOf, isExecUrl, linkFileName, loadLink, loadScriptCode, parseLinkFile, pingScript, randomKey, saveLink, type InstallKind, type LinkInfo } from '../lib/installer';
import { pickFile } from './MediaTools';
import { downloadBlob } from '../lib/xlsx';
import { useToast } from './ui';
import { useCopyManifest } from './ScriptUpdate';
import '../installer.css';

export interface InstallResult { scriptUrl: string; key: string; folderUrl: string }
/** Kết quả kiểm tra khóa và thư mục do trang cha thực hiện (cần quyền của từng vai trò) */
export interface InstallCheck { folderName?: string; folderUrl?: string }
type CheckRow = { id: string; label: string; state: 'wait' | 'run' | 'ok' | 'fail'; note?: string };

interface Props {
  kind: InstallKind;
  /** Giá trị đang dùng (để cập nhật bản mới mà không đổi link, không đổi khóa) */
  current?: { scriptUrl?: string; key?: string; folderUrl?: string };
  /** Gọi khi link /exec đã trả lời đúng: trang cha kiểm tra khóa + thư mục rồi lưu kết nối. Ném lỗi để báo thất bại. */
  onDone: (r: InstallResult) => Promise<InstallCheck | void> | InstallCheck | void;
}

/** Chép văn bản vào bộ nhớ tạm; thử cách mới rồi tới cách cũ. Trả về false nếu trình duyệt chặn cả hai. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* thử cách cũ */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

const DRAFT = (kind: InstallKind) => `quickplay.install.${kind}`;
const Chip = ({ children, strong }: { children: React.ReactNode; strong?: boolean }) => <span className={`ins-chip ${strong ? 'go' : ''}`}>{children}</span>;
const Then = () => <span className="ins-then" aria-hidden>›</span>;

/** Nhắc tích "Chọn tất cả" trên màn hình đồng ý của Google: bỏ trống ô nào thì Google coi là từ chối quyền đó và không hỏi lại. */
const ConsentTip = () => (
  <div className="alert warn"><div><TriangleAlert size={16} /> Ở màn hình danh sách quyền của Google, <b>tích ô "Chọn tất cả"</b> rồi mới bấm Tiếp tục. Bỏ trống ô nào thì Google coi là thầy cô từ chối quyền đó và <b>không hỏi lại</b>; khi ấy Apps Script không tự cập nhật được.</div></div>
);

const Step = ({ n, icon, title, done, children }: { n: number; icon: React.ReactNode; title: string; done?: boolean; children: React.ReactNode }) => (
  <div className={`ins-step ${done ? 'done' : ''}`}>
    <div className="ins-head"><span className="ins-n" aria-hidden>{done ? <Check size={16} /> : n}</span>{icon}<b>{title}</b></div>
    <div className="ins-body">{children}</div>
  </div>
);


export function ScriptInstaller({ kind, current, onDone }: Props) {
  const toast = useToast();
  const copyManifest = useCopyManifest();
  const teacher = kind === 'teacher';
  const SCRIPT_VERSION = teacher ? TEACHER_SCRIPT_VERSION : ADMIN_SCRIPT_VERSION;
  const [mode, setMode] = useState<'new' | 'update'>(current?.scriptUrl ? 'update' : 'new');
  // Khóa tạo sẵn cho lần cài mới: giữ tạm trong phiên trình duyệt để lỡ tải lại trang vẫn khớp với mã đã dán
  const [draft, setDraft] = useState<{ key: string; folderUrl: string; saved?: boolean }>(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT(kind)) || 'null');
      if (d?.key) return d;
    } catch { /* bỏ qua */ }
    return { key: randomKey(), folderUrl: current?.folderUrl ?? '' };
  });
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT(kind), JSON.stringify(draft)); } catch { /* bỏ qua */ }
  }, [draft, kind]);
  const [url, setUrl] = useState(current?.scriptUrl ?? '');
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(''); // mã hiện ra để chép tay khi trình duyệt chặn sao chép tự động
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [checks, setChecks] = useState<CheckRow[] | null>(null); // bảng soát từng điều kiện liên kết
  const [link, setLink] = useState<LinkInfo | null>(() => loadLink(kind)); // lần liên kết thành công gần nhất trên máy này

  // Bước 1: link thư mục phải được bấm LƯU thì phần mềm mới ghi nhận địa chỉ và mã thư mục, và mới mở bước sao chép mã
  const folderId = folderIdOf(draft.folderUrl);
  const folderOk = !!folderId && !!draft.saved;
  const saveFolder = () => {
    if (!folderId) return toast('Link thư mục chưa đúng. Mở thư mục trên Google Drive rồi chép địa chỉ trên thanh trình duyệt.', 'error');
    setDraft({ ...draft, folderUrl: draft.folderUrl.trim(), saved: true });
    setCopied(false);
    toast('Đã lưu link thư mục. Sang bước 2 để sao chép mã.', 'ok');
  };
  const editFolder = () => { setDraft({ ...draft, saved: false }); setCopied(false); };
  const clearFolder = () => { setDraft({ ...draft, folderUrl: '', saved: false }); setCopied(false); setManual(''); };
  // Cập nhật: dán đè mã mới vào dự án cũ. Khóa và thư mục cũ đã được máy chủ ghi nhớ nên giữ nguyên.
  const keyToUse = mode === 'update' ? current?.key ?? '' : draft.key;

  const copy = async () => {
    if (mode === 'new' && !folderOk) return toast('Hãy dán link thư mục Google Drive ở bước 1 và bấm Lưu trước.', 'error');
    try {
      const raw = await loadScriptCode(kind);
      const fid = mode === 'new' ? folderId! : folderIdOf(current?.folderUrl ?? '') ?? '';
      const code = teacher ? fillTeacherCode(raw, keyToUse, fid) : fillAdminCode(raw, keyToUse, fid);
      if (await copyText(code)) {
        setManual('');
        setCopied(true);
        toast('Đã sao chép mã. Sang bước 3 để dán vào Apps Script.', 'ok');
      } else {
        // Trình duyệt chặn sao chép tự động: hiện mã ra để thầy cô tự chọn hết và chép
        setManual(code);
        setCopied(true);
        toast('Trình duyệt không cho sao chép tự động. Hãy bấm vào khung mã bên dưới, nhấn Ctrl + A rồi Ctrl + C.', 'info');
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  // Kiểm tra liên kết: soát lần lượt từng điều kiện, cái nào hỏng thì dừng ở đó và nói rõ lý do
  const verify = async (override?: { url: string; key: string; folderUrl: string }) => {
    const theUrl = (override?.url ?? url).trim();
    const theKey = override ? override.key : keyToUse;
    const theFolder = override ? override.folderUrl : mode === 'new' ? draft.folderUrl.trim() : current?.folderUrl ?? link?.folder_url ?? '';
    const rows: CheckRow[] = [
      { id: 'url', label: 'Link Apps Script đúng dạng …/exec', state: 'wait' },
      { id: 'ping', label: 'Máy chủ Apps Script trả lời', state: 'wait' },
      { id: 'ver', label: 'Phiên bản mã máy chủ', state: 'wait' },
      { id: 'folder', label: teacher ? 'Khóa giáo viên và thư mục Google Drive' : 'Quyền quản trị và thư mục Google Drive', state: 'wait' },
    ];
    const mark = (id: string, state: CheckRow['state'], note?: string) => {
      const r = rows.find((x) => x.id === id)!;
      r.state = state;
      r.note = note;
      setChecks(rows.map((x) => ({ ...x })));
    };
    setResult(null);
    setChecks(rows.map((x) => ({ ...x })));
    setBusy(true);
    let at = 'url';
    try {
      mark('url', 'run');
      if (!isExecUrl(theUrl)) throw new Error('Link phải có dạng https://script.google.com/macros/s/…/exec (kết thúc bằng /exec).');
      mark('url', 'ok');

      at = 'ping';
      mark('ping', 'run');
      const info = await pingScript(theUrl);
      const want = teacher ? 'Quickplay' : 'QUICKPLAY-ACCOUNTS';
      if (info.name !== want) throw new Error(teacher ? 'Link này là của máy chủ tài khoản (quản trị), không phải kho dữ liệu của giáo viên.' : 'Link này không phải máy chủ tài khoản. Hãy dán link của dự án vừa cài ở bước 3–4.');
      mark('ping', 'ok', info.name);

      at = 'ver';
      mark('ver', 'run');
      if (compareVersion(info.version, SCRIPT_VERSION) < 0) {
        throw new Error(`Link đang chạy mã cũ (phiên bản ${info.version}, phần mềm cần ${SCRIPT_VERSION}). Hãy làm lại bước 4: ${mode === 'update' ? 'chọn "Phiên bản mới" rồi Triển khai' : 'kiểm tra đã dán đúng mã vừa sao chép'}.`);
      }
      mark('ver', 'ok', `máy chủ ${info.version} · phần mềm ${SCRIPT_VERSION}`);

      at = 'folder';
      mark('folder', 'run');
      if (mode === 'update' && !override && !theKey && teacher) throw new Error('Máy này chưa nhớ khóa giáo viên của kho cũ. Hãy nạp tệp kết nối, đăng nhập lại, hoặc chọn "Cài mới (lần đầu)".');
      const got = (await onDone({ scriptUrl: theUrl, key: theKey, folderUrl: theFolder })) || {};
      const folderUrl = got.folderUrl || theFolder;
      mark('folder', 'ok', got.folderName ? `thư mục “${got.folderName}”` : folderUrl ? 'đã mở được thư mục' : 'đã xác nhận');

      const done: LinkInfo = {
        role: kind, script_url: theUrl, folder_url: folderUrl, folder_id: folderIdOf(folderUrl) ?? '', folder_name: got.folderName ?? '',
        key: teacher ? theKey : '', server_version: info.version, linked_at: new Date().toISOString(),
      };
      saveLink(done, kind);
      setLink(done);
      setUrl(theUrl);
      setResult({ tone: 'ok', text: 'Liên kết thành công.' });
      sessionStorage.removeItem(DRAFT(kind));
    } catch (e) {
      mark(at, 'fail', (e as Error).message);
      setResult({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const downloadLink = () => {
    if (!link) return;
    downloadBlob(linkFileName(kind), new Blob([buildLinkFile(link)], { type: 'application/json' }));
    toast(teacher ? 'Đã tải tệp kết nối. Tệp có khóa giáo viên: cất ở nơi chỉ thầy cô mở được.' : 'Đã tải tệp kết nối. Mang tệp này sang máy khác để nạp, không phải dán lại link.', 'ok');
  };
  // Máy khác: nạp tệp kết nối đã tải trước đó, phần mềm tự kiểm tra lại và nối luôn
  const uploadLink = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const info = parseLinkFile(await f.text(), kind);
      setMode('update');
      setUrl(info.script_url);
      await verify({ url: info.script_url, key: info.key, folderUrl: info.folder_url });
    } catch (e) {
      setChecks(null);
      setResult({ tone: 'error', text: (e as Error).message });
      toast((e as Error).message, 'error');
    }
  };
  const fmt = (iso: string) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

  return (
    <div className="ins">
      <div className="ins-top">
        <div>
          <b className="row" style={{ gap: 8 }}><Wand2 size={20} color="var(--primary)" /> Trình cài đặt Apps Script</b>
          <small className="muted">Mã trong phần mềm: <b>phiên bản {SCRIPT_VERSION}</b> · Làm lần lượt 5 bước, bước cuối phần mềm tự kiểm tra giúp.</small>
        </div>
        <button type="button" className="btn sm ghost" onClick={uploadLink} disabled={busy} title="Đã có tệp kết nối tải từ máy khác: nạp vào để không phải dán lại link"><Upload size={16} /> Nạp tệp kết nối (.json)</button>
        <div className="tabs" role="tablist" aria-label="Kiểu cài đặt">
          <button type="button" role="tab" aria-selected={mode === 'new'} className={`tab ${mode === 'new' ? 'on' : ''}`} onClick={() => { setMode('new'); setCopied(false); setResult(null); }}>Cài mới (lần đầu)</button>
          <button type="button" role="tab" aria-selected={mode === 'update'} className={`tab ${mode === 'update' ? 'on' : ''}`} onClick={() => { setMode('update'); setCopied(false); setResult(null); }}>Cập nhật bản mới</button>
        </div>
      </div>

      <div className="ins-grid">
        <div className="ins-col">
          <Step n={1} icon={<FolderOpen size={18} />} title={teacher ? 'Thư mục Google Drive lưu dữ liệu' : 'Thư mục Google Drive lưu trữ'} done={mode === 'update' ? true : folderOk}>
            {mode === 'new' ? (
              folderOk ? (
                <>
                  <p>Đã ghi nhận thư mục lưu trữ:</p>
                  <div className="ins-saved">
                    <span><small>Địa chỉ thư mục</small><a href={draft.folderUrl} target="_blank" rel="noopener noreferrer">{draft.folderUrl.replace(/^https?:\/\//, '')}</a></span>
                    <span><small>Mã thư mục (ID)</small><code>{folderId}</code></span>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn sm" onClick={editFolder}><Pencil size={14} /> Đổi link</button>
                    <button type="button" className="btn sm danger" onClick={clearFolder}><Trash2 size={14} /> Xóa link</button>
                  </div>
                </>
              ) : (
                <>
                  <p>{teacher
                    ? <>Tạo một thư mục trên Google Drive của thầy cô (ví dụ <b>Quickplay_DuLieu</b>), mở thư mục rồi sao chép link trên thanh địa chỉ.</>
                    : <>Tạo một thư mục trên Google Drive của quản trị (ví dụ <b>Quickplay_TaiKhoan</b>), mở thư mục rồi sao chép link trên thanh địa chỉ. Máy chủ ghi tệp sao lưu tài khoản vào thư mục này.</>}</p>
                  <input className="input" value={draft.folderUrl} onChange={(e) => setDraft({ ...draft, folderUrl: e.target.value, saved: false })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveFolder(); } }}
                    placeholder="https://drive.google.com/drive/folders/…" aria-label="Link thư mục Google Drive" />
                  {draft.folderUrl.trim() && !folderId && <small className="error-text">Link chưa đúng. Mở thư mục trên Drive rồi chép địa chỉ trên thanh trình duyệt.</small>}
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn sm success" onClick={saveFolder} disabled={!draft.folderUrl.trim()}><Save size={14} /> Lưu link</button>
                    {draft.folderUrl.trim() && <button type="button" className="btn sm danger" onClick={clearFolder}><Trash2 size={14} /> Xóa link</button>}
                    <a className="btn sm ghost" href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Mở Google Drive</a>
                  </div>
                </>
              )
            ) : (
              <p>{current?.folderUrl ? <>Giữ nguyên thư mục đang dùng. <a href={current.folderUrl} target="_blank" rel="noopener noreferrer">Mở thư mục</a></> : 'Giữ nguyên thư mục đang dùng (máy chủ đã ghi nhớ).'}</p>
            )}
          </Step>

          <Step n={2} icon={<Code2 size={18} />} title="Sao chép mã Apps Script" done={copied}>
            <p>{mode === 'new'
              ? folderOk ? (teacher ? 'Mã đã điền sẵn mã thư mục và khóa giáo viên của thầy cô.' : 'Mã đã điền sẵn mã thư mục và khóa quản trị, không phải chạy hàm setup().') : 'Lưu link thư mục ở bước 1 xong thì nút này mới mở.'
              : 'Mã mới giữ nguyên thư mục, khóa và link đang dùng.'} (phiên bản {SCRIPT_VERSION})</p>
            <button type="button" className="btn primary sm" onClick={copy} disabled={mode === 'new' && !folderOk}><Copy size={16} /> Sao chép mã</button>
            {manual && <textarea className="input ins-code" readOnly value={manual} onFocus={(e) => e.currentTarget.select()} aria-label="Mã Apps Script để chép tay" />}
          </Step>

          <Step n={3} icon={<ExternalLink size={18} />} title={mode === 'new' ? 'Mở Apps Script, dán mã và lưu' : 'Dán mã mới vào dự án Apps Script đang dùng'}>
            <a className="btn success sm" href="https://script.google.com/home" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} /> Mở trang chủ Apps Script
            </a>
            <ol>
              {mode === 'new' && <li>Ở trang chủ Apps Script, bấm <b>Dự án mới</b> (hoặc mở dự án muốn dùng).</li>}
              {mode === 'update' && <li>Mở đúng dự án đang dùng (dự án đã triển khai link /exec hiện tại).</li>}
              <li>Bấm vào vùng mã, chọn hết <kbd>Ctrl + A</kbd> rồi <kbd>Delete</kbd>.</li>
              <li>Dán mã vừa sao chép <kbd>Ctrl + V</kbd>, bấm Lưu <kbd>Ctrl + S</kbd>.</li>
              {mode === 'new' && <li>Đặt tên dự án, ví dụ <b>{teacher ? 'Quickplay Du lieu' : 'Quickplay Tai khoan'}</b>.</li>}
              {teacher && <>
                <li><b>Để các bản sau tự cập nhật</b> (làm một lần): bấm <b>⚙ Cài đặt dự án</b> ở cột trái (biểu tượng bánh răng, dưới cùng) → mục <b>Chung</b>, tích ô <b>Hiển thị tệp kê khai "appsscript.json" trong trình biên tập</b> → bấm <b>&lt;&gt; Trình biên tập</b> để quay lại. Cột Tệp giờ có thêm tệp <code>appsscript.json</code>: bấm vào <b>tệp đó</b>, chọn hết <kbd>Ctrl + A</kbd>, dán tệp cấu hình <button type="button" className="btn sm" onClick={copyManifest}><Copy size={14} /> Sao chép tệp cấu hình</button> rồi <kbd>Ctrl + S</kbd>.
                  <div className="alert warn" style={{ marginTop: 6 }}><div><TriangleAlert size={16} /> <b>Không</b> dán tệp cấu hình vào <code>Mã.gs</code> (sẽ báo "Lỗi cú pháp … Unexpected token ':'"). Lỡ dán rồi: mở <code>Mã.gs</code>, xóa khối bắt đầu bằng <code>{'{'}</code> và <code>"timeZone"</code> ở cuối tệp, lưu lại.</div></div>
                </li>
                <li><b>Cấp quyền tự cập nhật</b> (làm một lần, sau khi dán tệp cấu hình): bấm lại vào <code>Mã.gs</code>, ô chọn hàm trên thanh công cụ chọn <b>kiemTraTuCapNhat</b>, bấm <b>▷ Chạy</b> → <b>Xem xét quyền</b> → chọn Gmail → <b>Nâng cao</b> → <b>Đi tới … (không an toàn)</b> → <b>tích "Chọn tất cả"</b> → <b>Tiếp tục</b>. Nhật ký thực thi báo <b>"ĐỦ ĐIỀU KIỆN TỰ CẬP NHẬT"</b> là xong. Chỉ bấm Triển khai thì Google <b>không</b> hỏi quyền mới.</li>
                <li>Bật <b>Google Apps Script API</b> (một lần cho mỗi Gmail): <a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener noreferrer">mở trang cài đặt Apps Script</a> → gạt <b>Google Apps Script API</b> sang <b>Bật</b>.</li>
              </>}
            </ol>
          </Step>
        </div>

        <div className="ins-col">
          <Step n={4} icon={<Rocket size={18} />} title={mode === 'new' ? 'Triển khai thành ứng dụng web' : 'Tạo phiên bản mới (giữ nguyên link)'}>
            {mode === 'new' ? (
              <>
                <p className="ins-path"><Chip>Triển khai ▾</Chip><Then /><Chip>Tùy chọn triển khai mới</Chip><Then /><Chip>⚙ Chọn loại</Chip><Then /><Chip>Ứng dụng web</Chip></p>
                <p className="ins-path">Thực thi với tư cách: <Chip>Tôi</Chip> · Người có quyền truy cập: <Chip>Bất kỳ ai</Chip><Then /><Chip strong>Triển khai</Chip></p>
                <p className="ins-path">Lần đầu Google hỏi quyền: <Chip>Cấp quyền truy cập</Chip><Then />chọn tài khoản<Then /><Chip>Nâng cao</Chip><Then /><Chip>Đi tới … (không an toàn)</Chip><Then /><Chip strong>Chọn tất cả</Chip><Then /><Chip strong>Tiếp tục</Chip></p>
                {teacher && <ConsentTip />}
                <p>Cuối cùng sao chép <b>"URL ứng dụng web"</b> (đuôi /exec).</p>
                <small className="muted">Nên dùng Gmail cá nhân: tài khoản trường (Workspace) thường không cho chọn "Bất kỳ ai".</small>
              </>
            ) : (
              <>
                <p className="ins-path"><Chip>Triển khai ▾</Chip><Then /><Chip>Quản lý các tùy chọn triển khai</Chip><Then /><Chip>✎ (bút chì)</Chip></p>
                <p className="ins-path">Phiên bản: <Chip>Phiên bản mới</Chip><Then /><Chip strong>Triển khai</Chip></p>
                {teacher && <p className="muted small">Nếu Google hỏi quyền (tệp cấu hình mới thêm quyền tự cập nhật): <Chip>Cấp quyền truy cập</Chip><Then /><Chip>Nâng cao</Chip><Then /><Chip strong>Chọn tất cả</Chip><Then /><Chip strong>Tiếp tục</Chip>.</p>}
                {teacher && <ConsentTip />}
                <div className="alert warn"><div><TriangleAlert size={16} /> <b>Không</b> bấm "Tùy chọn triển khai mới": làm vậy Google tạo link khác và link cũ vẫn chạy mã cũ.</div></div>
              </>
            )}
          </Step>

          <Step n={5} icon={<Link2 size={18} />} title="Dán link /exec và kiểm tra liên kết" done={result?.tone === 'ok' || (!!link && !checks)}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id="ins-exec-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" aria-label="Link Apps Script đuôi /exec" />
              <button type="button" className="btn primary" onClick={() => verify()} disabled={busy || !url.trim()}><CheckCircle2 size={18} /> {busy ? 'Đang kiểm tra…' : 'Kiểm tra'}</button>
              {/* Xóa link trong ô để dán link mới (chỉ xóa chữ trong ô; kết nối đang lưu giữ nguyên tới khi kiểm tra link mới thành công) */}
              <button
                type="button" className="btn icon ghost" disabled={busy || !url} title="Xóa link để dán link mới" aria-label="Xóa link để dán link mới"
                onClick={() => { setUrl(''); setChecks(null); setResult(null); document.getElementById('ins-exec-url')?.focus(); }}
              ><Trash2 size={18} /></button>
            </div>
            {checks && (
              <ul className="ins-checks" aria-live="polite">
                {checks.map((c) => (
                  <li key={c.id} className={c.state}>
                    <span className="ins-mark" aria-hidden>{c.state === 'ok' ? <Check size={14} /> : c.state === 'fail' ? <X size={14} /> : c.state === 'run' ? <Loader2 size={14} className="spin" /> : null}</span>
                    <span><b>{c.label}</b>{c.note ? <small> {c.state === 'fail' ? '' : '· '}{c.note}</small> : null}</span>
                  </li>
                ))}
              </ul>
            )}
            {link && result?.tone !== 'error' && (
              <div className="ins-linked" role="status">
                <b><CheckCircle2 size={18} /> Đã liên kết thành công</b>
                <dl>
                  <div><dt>Phiên bản máy chủ đã liên kết</dt><dd>{link.server_version || '—'}</dd></div>
                  <div><dt>Phiên bản phần mềm hiện tại</dt><dd>{SCRIPT_VERSION}{link.server_version && compareVersion(link.server_version, SCRIPT_VERSION) < 0 ? ' (máy chủ cũ hơn: chọn thẻ Cập nhật bản mới)' : ''}</dd></div>
                  <div><dt>Thời gian liên kết</dt><dd>{fmt(link.linked_at) || '—'}</dd></div>
                  <div><dt>Thư mục Google Drive</dt><dd>{link.folder_url ? <a href={link.folder_url} target="_blank" rel="noopener noreferrer">{link.folder_name || link.folder_id || 'Mở thư mục'}</a> : 'chưa khai báo'}</dd></div>
                </dl>
                <button type="button" className="btn sm success" onClick={downloadLink}><Download size={16} /> Tải tệp kết nối (.json)</button>
                <small className="muted">Đăng nhập ở máy tính khác: bấm <b>Nạp tệp kết nối (.json)</b> ở đầu Trình cài đặt và chọn tệp này, không phải dán lại link thư mục và link Apps Script.{teacher ? ' Tệp có khóa giáo viên, hãy giữ kín.' : ' Tệp của quản trị không chứa khóa hay mật khẩu.'}</small>
              </div>
            )}
            {result?.tone === 'error' && !checks && <div className="alert error" role="alert">{result.text}</div>}
          </Step>
        </div>
      </div>
    </div>
  );
}
