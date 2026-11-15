// Trình cài đặt Apps Script 5 bước, dùng chung cho giáo viên (kho dữ liệu riêng) và quản trị (máy chủ tài khoản).
import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Code2, Copy, ExternalLink, FolderOpen, Link2, Rocket, TriangleAlert, Wand2 } from 'lucide-react';
import { ADMIN_SCRIPT_VERSION, SCRIPT_VERSION as TEACHER_SCRIPT_VERSION, compareVersion, fillAdminCode, fillTeacherCode, folderIdOf, isExecUrl, loadScriptCode, pingScript, randomKey, type InstallKind } from '../lib/installer';
import { useToast } from './ui';
import '../installer.css';

export interface InstallResult { scriptUrl: string; key: string; folderUrl: string }

interface Props {
  kind: InstallKind;
  /** Giá trị đang dùng (để cập nhật bản mới mà không đổi link, không đổi khóa) */
  current?: { scriptUrl?: string; key?: string; folderUrl?: string };
  /** Gọi khi link /exec đã qua kiểm tra. Ném lỗi để báo thất bại ở bước 5. */
  onDone: (r: InstallResult) => Promise<void> | void;
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

const Step = ({ n, icon, title, done, children }: { n: number; icon: React.ReactNode; title: string; done?: boolean; children: React.ReactNode }) => (
  <div className={`ins-step ${done ? 'done' : ''}`}>
    <div className="ins-head"><span className="ins-n" aria-hidden>{done ? <Check size={16} /> : n}</span>{icon}<b>{title}</b></div>
    <div className="ins-body">{children}</div>
  </div>
);


export function ScriptInstaller({ kind, current, onDone }: Props) {
  const toast = useToast();
  const teacher = kind === 'teacher';
  const SCRIPT_VERSION = teacher ? TEACHER_SCRIPT_VERSION : ADMIN_SCRIPT_VERSION;
  const [mode, setMode] = useState<'new' | 'update'>(current?.scriptUrl ? 'update' : 'new');
  // Khóa tạo sẵn cho lần cài mới: giữ tạm trong phiên trình duyệt để lỡ tải lại trang vẫn khớp với mã đã dán
  const [draft, setDraft] = useState<{ key: string; folderUrl: string }>(() => {
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

  const folderId = teacher ? folderIdOf(draft.folderUrl) : '';
  const folderOk = !teacher || !!folderId;
  // Cập nhật: dán đè mã mới vào dự án cũ. Khóa và thư mục cũ đã được máy chủ ghi nhớ nên giữ nguyên.
  const keyToUse = mode === 'update' ? current?.key ?? '' : draft.key;

  const copy = async () => {
    if (mode === 'new' && !folderOk) return toast('Hãy dán link thư mục Google Drive ở bước 1 trước.', 'error');
    try {
      const raw = await loadScriptCode(kind);
      const code = teacher ? fillTeacherCode(raw, keyToUse, mode === 'new' ? folderId! : folderIdOf(current?.folderUrl ?? '') ?? '') : fillAdminCode(raw, keyToUse);
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

  const verify = async () => {
    setResult(null);
    if (!isExecUrl(url)) return setResult({ tone: 'error', text: 'Link phải có dạng https://script.google.com/macros/s/…/exec (kết thúc bằng /exec).' });
    if (mode === 'update' && !keyToUse && teacher) return setResult({ tone: 'error', text: 'Máy này chưa nhớ khóa giáo viên của kho cũ. Hãy đăng nhập lại, hoặc chọn "Cài mới (lần đầu)".' });
    setBusy(true);
    try {
      const info = await pingScript(url);
      const want = teacher ? 'Quickplay' : 'QUICKPLAY-ACCOUNTS';
      if (info.name !== want) throw new Error(teacher ? 'Link này là của máy chủ tài khoản (quản trị), không phải kho dữ liệu của giáo viên.' : 'Link này không phải máy chủ tài khoản. Hãy dán link của dự án vừa cài ở bước 3–4.');
      if (compareVersion(info.version, SCRIPT_VERSION) < 0) {
        throw new Error(`Link đang chạy mã cũ (phiên bản ${info.version}, phần mềm cần ${SCRIPT_VERSION}). Hãy làm lại bước 4: ${mode === 'update' ? 'chọn "Phiên bản mới" rồi Triển khai' : 'kiểm tra đã dán đúng mã vừa sao chép'}.`);
      }
      await onDone({ scriptUrl: url.trim(), key: keyToUse, folderUrl: mode === 'new' ? draft.folderUrl.trim() : current?.folderUrl ?? '' });
      setResult({ tone: 'ok', text: `Đã kết nối. Máy chủ đang chạy phiên bản ${info.version}.` });
      sessionStorage.removeItem(DRAFT(kind));
    } catch (e) {
      setResult({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ins">
      <div className="ins-top">
        <div>
          <b className="row" style={{ gap: 8 }}><Wand2 size={20} color="var(--primary)" /> Trình cài đặt Apps Script</b>
          <small className="muted">Mã trong phần mềm: <b>phiên bản {SCRIPT_VERSION}</b> · Làm lần lượt 5 bước, bước cuối phần mềm tự kiểm tra giúp.</small>
        </div>
        <div className="tabs" role="tablist" aria-label="Kiểu cài đặt">
          <button type="button" role="tab" aria-selected={mode === 'new'} className={`tab ${mode === 'new' ? 'on' : ''}`} onClick={() => { setMode('new'); setCopied(false); setResult(null); }}>Cài mới (lần đầu)</button>
          <button type="button" role="tab" aria-selected={mode === 'update'} className={`tab ${mode === 'update' ? 'on' : ''}`} onClick={() => { setMode('update'); setCopied(false); setResult(null); }}>Cập nhật bản mới</button>
        </div>
      </div>

      <div className="ins-grid">
        <div className="ins-col">
          {teacher ? (
            <Step n={1} icon={<FolderOpen size={18} />} title="Thư mục Google Drive lưu dữ liệu" done={mode === 'update' ? !!current?.folderUrl : folderOk}>
              {mode === 'new' ? (
                <>
                  <p>Tạo một thư mục trên Google Drive của thầy cô (ví dụ <b>Quickplay_DuLieu</b>), mở thư mục rồi sao chép link trên thanh địa chỉ.</p>
                  <input className="input" value={draft.folderUrl} onChange={(e) => { setDraft({ ...draft, folderUrl: e.target.value }); setCopied(false); }} placeholder="https://drive.google.com/drive/folders/…" aria-label="Link thư mục Google Drive" />
                  {draft.folderUrl.trim() && (folderId ? <small className="ins-ok">✓ Mã thư mục: {folderId}</small> : <small className="error-text">Link chưa đúng. Mở thư mục trên Drive rồi chép địa chỉ trên thanh trình duyệt.</small>)}
                  <a className="btn sm ghost" href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Mở Google Drive</a>
                </>
              ) : (
                <p>{current?.folderUrl ? <>Giữ nguyên thư mục đang dùng. <a href={current.folderUrl} target="_blank" rel="noopener noreferrer">Mở thư mục</a></> : 'Giữ nguyên thư mục đang dùng.'}</p>
              )}
            </Step>
          ) : (
            <Step n={1} icon={<FolderOpen size={18} />} title="Nơi lưu tài khoản" done>
              <p>Không cần tạo thư mục. Danh sách tài khoản giáo viên được cất trong <b>kho riêng của chính dự án Apps Script</b> (Script Properties) thuộc tài khoản Google của quản trị, không ai khác mở được.</p>
            </Step>
          )}

          <Step n={2} icon={<Code2 size={18} />} title="Sao chép mã Apps Script" done={copied}>
            <p>{mode === 'new'
              ? teacher ? 'Mã đã điền sẵn mã thư mục và khóa giáo viên của thầy cô.' : 'Mã đã điền sẵn khóa quản trị, không phải chạy hàm setup().'
              : 'Mã mới giữ nguyên thư mục, khóa và link đang dùng.'} (phiên bản {SCRIPT_VERSION})</p>
            <button type="button" className="btn primary sm" onClick={copy}><Copy size={16} /> Sao chép mã</button>
            {manual && <textarea className="input ins-code" readOnly value={manual} onFocus={(e) => e.currentTarget.select()} aria-label="Mã Apps Script để chép tay" />}
          </Step>

          <Step n={3} icon={<ExternalLink size={18} />} title={mode === 'new' ? 'Mở Apps Script mới, dán mã và lưu' : 'Dán mã mới vào dự án Apps Script đang dùng'}>
            <a className="btn success sm" href={mode === 'new' ? 'https://script.new' : 'https://script.google.com/home'} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} /> {mode === 'new' ? 'Mở Apps Script mới (script.new)' : 'Mở danh sách dự án Apps Script'}
            </a>
            <ol>
              {mode === 'update' && <li>Mở đúng dự án đang dùng (dự án đã triển khai link /exec hiện tại).</li>}
              <li>Bấm vào vùng mã, chọn hết <kbd>Ctrl + A</kbd> rồi <kbd>Delete</kbd>.</li>
              <li>Dán mã vừa sao chép <kbd>Ctrl + V</kbd>, bấm Lưu <kbd>Ctrl + S</kbd>.</li>
              {mode === 'new' && <li>Đặt tên dự án, ví dụ <b>{teacher ? 'Quickplay Du lieu' : 'Quickplay Tai khoan'}</b>.</li>}
            </ol>
          </Step>
        </div>

        <div className="ins-col">
          <Step n={4} icon={<Rocket size={18} />} title={mode === 'new' ? 'Triển khai thành ứng dụng web' : 'Tạo phiên bản mới (giữ nguyên link)'}>
            {mode === 'new' ? (
              <>
                <p className="ins-path"><Chip>Triển khai ▾</Chip><Then /><Chip>Tùy chọn triển khai mới</Chip><Then /><Chip>⚙ Chọn loại</Chip><Then /><Chip>Ứng dụng web</Chip></p>
                <p className="ins-path">Thực thi với tư cách: <Chip>Tôi</Chip> · Người có quyền truy cập: <Chip>Bất kỳ ai</Chip><Then /><Chip strong>Triển khai</Chip></p>
                <p className="ins-path">Lần đầu Google hỏi quyền: <Chip>Cấp quyền truy cập</Chip><Then />chọn tài khoản<Then /><Chip>Nâng cao</Chip><Then /><Chip>Đi tới … (không an toàn)</Chip><Then /><Chip strong>Cho phép</Chip></p>
                <p>Cuối cùng sao chép <b>"URL ứng dụng web"</b> (đuôi /exec).</p>
                <small className="muted">Nên dùng Gmail cá nhân: tài khoản trường (Workspace) thường không cho chọn "Bất kỳ ai".</small>
              </>
            ) : (
              <>
                <p className="ins-path"><Chip>Triển khai ▾</Chip><Then /><Chip>Quản lý các tùy chọn triển khai</Chip><Then /><Chip>✎ (bút chì)</Chip></p>
                <p className="ins-path">Phiên bản: <Chip>Phiên bản mới</Chip><Then /><Chip strong>Triển khai</Chip></p>
                <div className="alert warn"><div><TriangleAlert size={16} /> <b>Không</b> bấm "Tùy chọn triển khai mới": làm vậy Google tạo link khác và link cũ vẫn chạy mã cũ.</div></div>
              </>
            )}
          </Step>

          <Step n={5} icon={<Link2 size={18} />} title="Dán link /exec và kiểm tra tự động" done={result?.tone === 'ok'}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" aria-label="Link Apps Script đuôi /exec" />
              <button type="button" className="btn primary" onClick={verify} disabled={busy || !url.trim()}><CheckCircle2 size={18} /> {busy ? 'Đang kiểm tra…' : 'Kiểm tra'}</button>
            </div>
            {result && <div className={`alert ${result.tone}`} role="status">{result.text}</div>}
          </Step>
        </div>
      </div>
    </div>
  );
}
