// Ô khóa API Gemini trong Cài đặt: Lưu (kèm kiểm tra khóa), Kiểm tra lại, Xóa; có dấu tích xanh khi khóa dùng được.
import { useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, RefreshCw, Save, Trash2, TriangleAlert } from 'lucide-react';
import { verifyKey, type KeyCheck } from '../lib/gemini';
import { loadSettings, saveSettings } from '../lib/settings';
import { askConfirm, useToast } from './ui';

const LAST = 'quickplay.geminiCheck'; // kết quả kiểm tra gần nhất (không chứa khóa)

function lastCheck(): (KeyCheck & { at: number }) | null {
  try { return JSON.parse(localStorage.getItem(LAST) || 'null'); } catch { return null; }
}

export function GeminiKeyPanel({ onChange }: { onChange: (key: string, model: string) => void }) {
  const toast = useToast();
  const saved = loadSettings();
  const [key, setKey] = useState(saved.geminiKey);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<(KeyCheck & { at?: number }) | null>(() => (saved.geminiKey ? lastCheck() : null));
  const dirty = key.trim() !== saved.geminiKey;

  const store = (k: string, model: string, c: KeyCheck | null) => {
    saveSettings({ ...loadSettings(), geminiKey: k, geminiModel: model });
    try { c ? localStorage.setItem(LAST, JSON.stringify({ ...c, at: Date.now() })) : localStorage.removeItem(LAST); } catch { /* bỏ qua */ }
    onChange(k, model);
  };

  // Lưu = kiểm tra khóa với Google trước; khóa sai thì không lưu
  const save = async () => {
    const k = key.trim();
    setBusy(true);
    const c = await verifyKey(k);
    setBusy(false);
    setCheck(c);
    if (c.status === 'invalid' || c.status === 'blocked') return toast(c.message, 'error');
    // Hết hạn mức / mất mạng: vẫn lưu (khóa có thể dùng lại khi hạn mức được cấp lại), nhưng báo rõ
    store(k, c.model ?? loadSettings().geminiModel, c);
    setKey(k);
    toast(c.status === 'ok' ? 'Đã lưu khóa API. Khóa hợp lệ và còn hạn mức.' : `Đã lưu khóa API, nhưng: ${c.message}`, c.status === 'ok' ? 'ok' : 'error');
  };
  const recheck = async () => {
    setBusy(true);
    const c = await verifyKey(saved.geminiKey);
    setBusy(false);
    setCheck(c);
    if (c.status === 'ok' && c.model) store(saved.geminiKey, c.model, c);
    else try { localStorage.setItem(LAST, JSON.stringify({ ...c, at: Date.now() })); } catch { /* bỏ qua */ }
  };
  const remove = async () => {
    if (!(await askConfirm('Xóa khóa API Gemini khỏi trình duyệt này? Các chức năng AI sẽ không chạy cho tới khi thầy cô lưu khóa khác.'))) return;
    store('', loadSettings().geminiModel, null);
    setKey('');
    setCheck(null);
    toast('Đã xóa khóa API.', 'ok');
  };

  const tone = check?.status === 'ok' ? 'ok' : check ? (check.status === 'network' ? 'warn' : 'error') : '';
  return (
    <section className="card stack" id="khoa-ai">
      <h2 style={{ margin: 0 }}>Trí tuệ nhân tạo (Google Gemini – miễn phí)</h2>
      <p className="muted" style={{ margin: 0 }}>
        Dán khóa API lấy miễn phí tại Google AI Studio rồi bấm <b>Lưu khóa</b>. Phần mềm kiểm tra khóa ngay và tự chọn mô hình Gemini còn hoạt động.
        Khóa chỉ lưu trong trình duyệt này và chỉ gửi thẳng tới Google; máy khác cần dán lại khóa.
      </p>
      <a className="btn ghost sm" style={{ alignSelf: 'flex-start' }} href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Lấy khóa tại aistudio.google.com</a>
      <label className="field">
        <span>Khóa Gemini API</span>
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <input className="input" type={show ? 'text' : 'password'} value={key} onChange={(e) => { setKey(e.target.value); setCheck(null); }} autoComplete="off" spellCheck={false} placeholder="AIza…" style={{ minWidth: 0 }} />
          <button type="button" className="btn icon ghost" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ẩn khóa' : 'Hiện khóa'} title={show ? 'Ẩn khóa' : 'Hiện khóa'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" onClick={save} disabled={busy || !key.trim() || (!dirty && check?.status === 'ok')}>
          {busy ? <Loader2 size={18} className="spin" /> : <Save size={18} />} {busy ? 'Đang kiểm tra khóa…' : 'Lưu khóa'}
        </button>
        <button className="btn" onClick={recheck} disabled={busy || !saved.geminiKey || dirty}><RefreshCw size={18} /> Kiểm tra lại</button>
        <button className="btn danger" onClick={remove} disabled={busy || (!saved.geminiKey && !key)}><Trash2 size={18} /> Xóa khóa</button>
      </div>
      {check ? (
        <div className={`alert ${tone}`} role="status">
          {check.status === 'ok' ? <CheckCircle2 size={20} style={{ flex: 'none' }} /> : <TriangleAlert size={20} style={{ flex: 'none' }} />}
          <div>
            <b>{check.status === 'ok' ? 'Khóa API dùng được' : check.status === 'quota' ? 'Khóa API đã hết hạn mức' : check.status === 'network' ? 'Chưa kiểm tra được' : 'Khóa API chưa dùng được'}</b>
            <div>{check.message}</div>
            {check.at ? <small>Kiểm tra lúc {new Date(check.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</small> : null}
          </div>
        </div>
      ) : saved.geminiKey && !dirty ? (
        <div className="alert" role="status"><div>Đã có khóa lưu trong trình duyệt này nhưng chưa kiểm tra. Bấm <b>Kiểm tra lại</b>.</div></div>
      ) : dirty && key.trim() ? (
        <div className="alert warn" role="status"><div>Khóa vừa nhập <b>chưa được lưu</b>. Bấm <b>Lưu khóa</b> để kiểm tra và lưu.</div></div>
      ) : null}
    </section>
  );
}
