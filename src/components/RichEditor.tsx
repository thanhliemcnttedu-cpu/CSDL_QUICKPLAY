import { useEffect, useRef, type ReactNode } from 'react';
import { Bold, Italic, Underline, Superscript, Subscript, List, ListOrdered, Link2, Mic, MicOff } from 'lucide-react';
import { useSpeech } from '../lib/speech';
import { sanitizeHtml } from '../lib/util';
import { useToast } from './ui';

interface Props {
  value: string;
  onChange: (html: string) => void;
  onPasteImage?: (file: File) => void;
  placeholder?: string;
  compact?: boolean; // ô đáp án: thanh công cụ rút gọn
  label: string;
  extra?: ReactNode; // nút bổ sung trên thanh công cụ
}

/**
 * Ô soạn thảo định dạng: chữ đậm/nghiêng/gạch chân, chỉ số trên/dưới, danh sách, liên kết;
 * nhập bằng giọng nói (chèn tại con trỏ) và dán ảnh trực tiếp bằng Ctrl+V.
 */
export function RichEditor({ value, onChange, onPasteImage, placeholder, compact, label, extra }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const toast = useToast();

  // Chỉ đặt lại nội dung khi giá trị bên ngoài thật sự khác (tránh nhảy con trỏ)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value;
  }, [value]);

  const emit = () => ref.current && onChange(sanitizeHtml(ref.current.innerHTML));

  const saveRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) range.current = sel.getRangeAt(0).cloneRange();
  };

  const insertText = (t: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection()!;
    if (range.current) {
      sel.removeAllRanges();
      sel.addRange(range.current);
    } else {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    const before = el.textContent && !/\s$/.test(el.textContent) ? ' ' : '';
    document.execCommand('insertText', false, before + t);
    saveRange();
    emit();
  };

  const speech = useSpeech(insertText);
  useEffect(() => {
    if (speech.error) toast(speech.error, 'error');
  }, [speech.error, toast]);

  const cmd = (c: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(c, false, arg);
    emit();
  };

  const addLink = () => {
    const url = window.prompt('Dán đường liên kết tham khảo (https://…):', 'https://');
    if (!url || !/^https?:\/\/\S+\.\S+/.test(url)) {
      if (url) toast('Liên kết phải bắt đầu bằng http:// hoặc https://', 'error');
      return;
    }
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) cmd('createLink', url);
    else cmd('insertHTML', `<a href="${url.replace(/"/g, '%22')}">${url.replace(/</g, '&lt;')}</a>&nbsp;`);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const img = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (img && onPasteImage) {
      e.preventDefault();
      const f = img.getAsFile();
      if (f) onPasteImage(f);
      return;
    }
    // Không phải ảnh: dán dạng văn bản thuần (tránh mang theo định dạng/mã lạ)
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    emit();
  };

  const rec = speech.status === 'RECORDING';
  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) => (
    <button type="button" className="btn" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );

  return (
    <div className="rte-wrap">
      <div className="rte-toolbar" role="toolbar" aria-label={`Định dạng ${label}`}>
        <Btn title="Chữ đậm (Ctrl+B)" onClick={() => cmd('bold')}><Bold size={18} /></Btn>
        <Btn title="Chữ nghiêng (Ctrl+I)" onClick={() => cmd('italic')}><Italic size={18} /></Btn>
        <Btn title="Gạch chân (Ctrl+U)" onClick={() => cmd('underline')}><Underline size={18} /></Btn>
        {!compact && (
          <>
            <Btn title="Chỉ số trên (x²)" onClick={() => cmd('superscript')}><Superscript size={18} /></Btn>
            <Btn title="Chỉ số dưới (H₂O)" onClick={() => cmd('subscript')}><Subscript size={18} /></Btn>
            <Btn title="Danh sách chấm" onClick={() => cmd('insertUnorderedList')}><List size={18} /></Btn>
            <Btn title="Danh sách số" onClick={() => cmd('insertOrderedList')}><ListOrdered size={18} /></Btn>
            <Btn title="Chèn liên kết" onClick={addLink}><Link2 size={18} /></Btn>
          </>
        )}
        <span className="sep" />
        <button
          type="button"
          className={`btn ${rec ? 'rec' : ''}`}
          title={rec ? 'Dừng ghi (tự dừng sau 5 giây im lặng)' : 'Nhập bằng giọng nói'}
          aria-label={rec ? 'Dừng nhập giọng nói' : 'Nhập bằng giọng nói'}
          aria-pressed={rec}
          onMouseDown={(e) => {
            e.preventDefault();
            saveRange();
          }}
          onClick={speech.toggle}
        >
          {rec ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        {extra}
      </div>
      <div
        ref={ref}
        className={`rte ${compact ? 'small' : ''}`}
        contentEditable
        role="textbox"
        aria-multiline
        aria-label={label}
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={() => {
          saveRange();
          emit();
        }}
        onKeyUp={saveRange}
        onMouseUp={saveRange}
        onPaste={onPaste}
        suppressContentEditableWarning
      />
      {rec && <div className="interim" aria-live="polite">● Đang nghe… {speech.interim}</div>}
    </div>
  );
}
