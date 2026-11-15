import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BookOpen, X, CircleDot, ListChecks, Eye, TextCursorInput, ListOrdered, Link2, MessageSquareText, ImagePlus, ClipboardPaste,
  Upload, Link as LinkIcon, Music, Mic, MicOff, Square, Trash2, Plus, Check, ArrowUp, ArrowDown, Lightbulb, Play, Save,
  Youtube, AlertTriangle, RotateCcw,
} from 'lucide-react';
import type { Question, QuestionType } from '../lib/types';
import { COMPOSER_TYPES, SUBJECTS, TYPE_LABELS } from '../lib/factory';
import { BLANK, countBlanks, emptyDraft, fromQuestion, switchType, toQuestion, type Cell, type Draft } from '../lib/draft';
import { gradeRatio, validateQuestion, type Answer } from '../lib/grading';
import { uploadFile, embedUrl } from '../lib/media';
import { useSpeech } from '../lib/speech';
import { OPTION_LABELS, hashString } from '../lib/util';
import { checkAudio, IMAGE_ACCEPT, imageFromPaste, pickFile, readClipboardImage, useImageUpload, useRecorder, VideoUrlDialog } from './MediaTools';
import { useToast } from './ui';
import { PlayQuestion } from './PlayQuestion';

const TYPE_ICON: Record<string, typeof CircleDot> = {
  single_choice: CircleDot, multiple_select: ListChecks, true_false: Eye, fill_blank: TextCursorInput,
  reorder: ListOrdered, matching: Link2, oral: MessageSquareText,
};
const TIME_CHOICES = [10, 15, 20, 30, 45, 60, 90, 120, 180, 300];

interface Props {
  initial?: Question; // có = sửa câu, không = soạn mới
  defaultType?: QuestionType;
  lessons: string[]; // gợi ý bài học đã dùng trong bộ đề
  defaults?: { subject?: string; lesson?: string; coins?: number };
  onSave: (q: Question, next: boolean) => void;
  onClose: () => void;
}

export function QuestionComposer({ initial, defaultType = 'single_choice', lessons, defaults, onSave, onClose }: Props) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => (initial ? fromQuestion(initial) : emptyDraft(defaultType, defaults)));
  const [tried, setTried] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [videoDlg, setVideoDlg] = useState(false);
  const [saved, setSaved] = useState(0);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const focusTarget = useRef<string>('stem');
  const img = useImageUpload();
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const q = useMemo(() => toQuestion(d), [d]);
  const errors = validateQuestion(q);
  const nBlanks = countBlanks(d.text);

  // Giữ số ô "từ đúng" khớp số chỗ trống [___]
  useEffect(() => {
    if (d.type !== 'fill_blank' || d.blanks.length === nBlanks) return;
    setD((x) => ({ ...x, blanks: Array.from({ length: nBlanks }, (_, i) => x.blanks[i] ?? '') }));
  }, [nBlanks, d.type, d.blanks.length]);

  // ---------- Ảnh: dán / chọn / link vào đúng ô đang chọn ----------
  const putImage = (target: string, url: string) => {
    const [kind, id] = target.split(':');
    setD((x) => {
      if (kind === 'stem') return { ...x, image: url };
      if (kind === 'expl') return { ...x, explanation_image: url };
      if (kind === 'opt') return { ...x, options: x.options.map((o) => (o.id === id ? { ...o, image: url } : o)) };
      if (kind === 'step') return { ...x, steps: x.steps.map((o) => (o.id === id ? { ...o, image: url } : o)) };
      if (kind === 'L' || kind === 'R')
        return { ...x, pairs: x.pairs.map((p) => (p.pid === id ? (kind === 'L' ? { ...p, left: { ...p.left, image: url } } : { ...p, right: { ...p.right, image: url } }) : p)) };
      return x;
    });
  };
  const uploadTo = async (target: string, f: Blob | File | null) => {
    if (!f) return;
    const url = await img.upload(f, target.split(':')[0]);
    if (url) putImage(target, url);
  };
  const pasteFromClipboard = async (target: string) => {
    const blob = await readClipboardImage();
    if (blob) uploadTo(target, blob);
    else toast('Bộ nhớ tạm chưa có ảnh (hoặc trình duyệt chặn). Hãy chụp màn hình rồi bấm vào ô và nhấn Ctrl+V.', 'error');
  };
  const chooseFile = async (target: string) => uploadTo(target, await pickFile(IMAGE_ACCEPT));
  const linkImage = (target: string) => {
    const url = window.prompt('Dán đường link ảnh (https://…):', 'https://');
    if (url && /^https?:\/\/\S+$/.test(url)) putImage(target, url);
    else if (url) toast('Link ảnh phải bắt đầu bằng http:// hoặc https://', 'error');
  };

  // Ctrl+V ở bất kỳ đâu trong hộp: ảnh vào ô đang được chọn (mặc định: ảnh câu hỏi)
  const onPaste = (e: React.ClipboardEvent) => {
    const f = imageFromPaste(e);
    if (!f) return;
    e.preventDefault();
    const el = (e.target as HTMLElement).closest('[data-paste]') as HTMLElement | null;
    uploadTo(el?.dataset.paste ?? focusTarget.current, f);
  };
  const onFocusCapture = (e: React.FocusEvent) => {
    const el = (e.target as HTMLElement).closest('[data-paste]') as HTMLElement | null;
    if (el?.dataset.paste) focusTarget.current = el.dataset.paste;
  };

  // ---------- Âm thanh ----------
  const recorder = useRecorder(async (blob) => {
    try {
      set({ audio: await uploadFile(blob, `ghi-am-${Date.now()}.webm`) });
      toast('Đã lưu bản ghi âm.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }, 120);
  const chooseAudio = async () => {
    const f = await pickFile('.mp3,.wav,.ogg,audio/*');
    if (!f) return;
    const err = checkAudio(f);
    if (err) return toast(err, 'error');
    try {
      set({ audio: await uploadFile(f, f.name) });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  // ---------- Chèn chỗ trống [___] ----------
  const insertBlank = () => {
    const ta = textRef.current;
    const s = ta?.selectionStart ?? d.text.length;
    const e = ta?.selectionEnd ?? d.text.length;
    const word = d.text.slice(s, e).trim();
    const before = d.text.slice(0, s);
    const idx = countBlanks(before);
    const text = before + BLANK + d.text.slice(e);
    const blanks = [...d.blanks];
    blanks.splice(idx, 0, word); // từ được bôi đen thành đáp án của chỗ trống
    set({ text, blanks });
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(s + BLANK.length, s + BLANK.length);
    });
  };

  // ---------- Lưu ----------
  const save = (next: boolean) => {
    setTried(true);
    if (errors.length) {
      toast('Câu hỏi chưa hoàn chỉnh: ' + errors[0], 'error');
      return;
    }
    onSave(q, next);
    if (next) {
      setSaved((n) => n + 1);
      setTried(false);
      setD(emptyDraft(d.type, { subject: d.subject, lesson: d.lesson, coins: d.coins, points: d.points }));
      requestAnimationFrame(() => textRef.current?.focus());
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (playing || videoDlg) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        save(false);
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  const speech = useSpeech((t) => {
    const ta = textRef.current;
    const pos = ta?.selectionStart ?? d.text.length;
    setD((x) => {
      const sep = pos > 0 && !/\s$/.test(x.text.slice(0, pos)) ? ' ' : '';
      return { ...x, text: x.text.slice(0, pos) + sep + t + x.text.slice(pos) };
    });
  });
  useEffect(() => {
    if (speech.error) toast(speech.error, 'error');
  }, [speech.error, toast]);

  const title = initial ? 'SỬA CÂU HỎI' : 'SOẠN CÂU HỎI MỚI';
  const summary = `${TYPE_LABELS[d.type]} · ${d.subject || 'Chưa chọn môn'} · ${d.points} điểm`;

  return (
    <div className="cmp-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmp" role="dialog" aria-modal="true" aria-label={title} onPaste={onPaste} onFocusCapture={onFocusCapture}>
        <header className="cmp-head">
          <span className="cmp-ic" aria-hidden><BookOpen size={22} /></span>
          <div className="grow">
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{title}{saved > 0 && <span className="badge green" style={{ marginLeft: 8 }}>Đã lưu {saved} câu</span>}</h2>
            <small className="muted">Dán ảnh bằng <kbd>Ctrl+V</kbd> · lưu nhanh <kbd>Ctrl+Enter</kbd></small>
          </div>
          <button className="btn icon ghost" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        </header>

        <nav className="cmp-tabs" role="tablist" aria-label="Dạng câu hỏi">
          {COMPOSER_TYPES.map((t) => {
            const Ic = TYPE_ICON[t];
            return (
              <button key={t} role="tab" aria-selected={d.type === t} className={`cmp-tab ${d.type === t ? 'on' : ''}`} onClick={() => setD((x) => switchType(x, t))}>
                <Ic size={20} /> {TYPE_LABELS[t]}
              </button>
            );
          })}
        </nav>

        <div className="cmp-body">
          <div className="cmp-form">
            {/* ---- Nội dung câu hỏi ---- */}
            <div className="row between">
              <span className="cmp-label">Nội dung câu hỏi</span>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className={`btn sm ${speech.status === 'RECORDING' ? 'rec' : 'vout'}`} onClick={speech.toggle} title="Nói để nhập câu hỏi">
                  {speech.status === 'RECORDING' ? <MicOff size={16} /> : <Mic size={16} />} {speech.status === 'RECORDING' ? 'Đang nghe…' : 'Nói'}
                </button>
                {d.type === 'fill_blank' && (
                  <button type="button" className="btn sm violet" onMouseDown={(e) => e.preventDefault()} onClick={insertBlank}><Plus size={16} /> Chèn chỗ trống</button>
                )}
              </div>
            </div>
            <textarea
              ref={textRef}
              className="input cmp-text"
              data-paste="stem"
              value={d.text}
              onChange={(e) => set({ text: e.target.value })}
              placeholder={d.type === 'fill_blank' ? 'Ví dụ: Thủ đô của Việt Nam là [___]. (bôi đen một từ rồi bấm "Chèn chỗ trống")' : 'Nhập câu hỏi… (có thể bỏ trống nếu dùng ảnh / âm thanh làm câu hỏi)'}
              aria-label="Nội dung câu hỏi"
            />
            {speech.interim && <small className="muted">● {speech.interim}</small>}
            {d.type === 'fill_blank' && (
              <small className="muted">Chỗ trống ghi là <code>[___]</code>. Hiện có <b>{nBlanks}</b> chỗ trống.</small>
            )}

            <ImageZone
              target="stem"
              url={d.image}
              title="Ảnh câu hỏi / ảnh minh họa"
              hint={<>— bấm vào ô rồi <kbd>Ctrl+V</kbd> để dán, hoặc kéo thả ảnh</>}
              busy={img.busy}
              onPaste={pasteFromClipboard}
              onChoose={chooseFile}
              onLink={linkImage}
              onDropFile={(f) => uploadTo('stem', f)}
              onRemove={() => set({ image: undefined, image_alt: undefined })}
              alt={d.image_alt}
              onAlt={(v) => set({ image_alt: v })}
            />

            <div className="audio-row">
              <Music size={18} color="var(--violet)" />
              <span className="grow small">Âm thanh cho câu hỏi (đọc đề, nghe – chọn, tiếng Anh…) — tối đa 2 phút</span>
              <button type="button" className={`btn sm ${recorder.rec ? 'rec' : 'violet'}`} onClick={recorder.toggle}>
                {recorder.rec ? <Square size={14} /> : <Mic size={16} />} {recorder.rec ? `Dừng ${Math.floor(recorder.sec / 60)}:${String(recorder.sec % 60).padStart(2, '0')}` : 'Ghi âm'}
              </button>
              <button type="button" className="btn sm ghost" onClick={chooseAudio}><Upload size={16} /> Chọn tệp</button>
              <button type="button" className="btn sm ghost" onClick={() => setVideoDlg(true)} title="Nhúng video YouTube / Vimeo"><Youtube size={16} /> Video</button>
            </div>
            {d.audio && (
              <div className="row">
                <audio src={d.audio} controls preload="metadata" style={{ flex: 1, minWidth: 220 }} />
                <button type="button" className="btn icon sm danger" onClick={() => set({ audio: undefined })} aria-label="Xóa âm thanh"><Trash2 size={16} /></button>
              </div>
            )}
            {d.video && (
              <div className="row" style={{ alignItems: 'flex-start' }}>
                {embedUrl(d.video) ? <iframe className="video-frame" style={{ maxWidth: 320 }} src={embedUrl(d.video)!} title="Video" /> : <video className="video-frame" style={{ maxWidth: 320 }} src={d.video.url} controls />}
                <button type="button" className="btn sm danger" onClick={() => set({ video: undefined })}><Trash2 size={16} /> Xóa video</button>
              </div>
            )}

            {/* ---- Phần riêng từng dạng ---- */}
            {(d.type === 'single_choice' || d.type === 'multiple_select') && (
              <ChoiceSection d={d} setD={setD} onPaste={pasteFromClipboard} onChoose={chooseFile} onDrop={uploadTo} busy={img.busy} />
            )}
            {d.type === 'single_choice' && (
              <label className="switch" title="Dùng cho câu hỏi về màu sắc: màu của ô không còn trùng hay trái với chữ trong đáp án">
                <input type="checkbox" checked={d.plain} onChange={(e) => set({ plain: e.target.checked })} /> Ô đáp án nền trắng, không tô màu (nên bật với câu hỏi về màu sắc)
              </label>
            )}
            {d.type === 'true_false' && (
              <>
                <span className="cmp-label">Nhận định trên là</span>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button type="button" className={`tfbig ${d.tf ? 'on' : ''}`} aria-pressed={d.tf} onClick={() => set({ tf: true })}>{d.tf && <Check size={22} />} ĐÚNG</button>
                  <button type="button" className={`tfbig ${!d.tf ? 'on' : ''}`} aria-pressed={!d.tf} onClick={() => set({ tf: false })}>{!d.tf && <Check size={22} />} SAI</button>
                </div>
              </>
            )}
            {d.type === 'fill_blank' && <FillSection d={d} setD={setD} />}
            {d.type === 'reorder' && <StepsSection d={d} setD={setD} onPaste={pasteFromClipboard} onChoose={chooseFile} />}
            {d.type === 'matching' && <PairsSection d={d} setD={setD} onPaste={pasteFromClipboard} onChoose={chooseFile} />}
            {d.type === 'oral' && (
              <div className="alert"><MessageSquareText size={20} style={{ flex: 'none' }} /><div>Học sinh trả lời bằng lời, giáo viên chấm <b>Đúng / Sai</b> khi chơi. Ghi gợi ý đáp án ở mục bên dưới để đối chiếu.</div></div>
            )}

            {/* ---- Lời giải ---- */}
            <div className="expl">
              <span className="cmp-label row" style={{ gap: 6, color: '#92400e' }}><Lightbulb size={16} /> Đáp án / lời giải của giáo viên (không bắt buộc)</span>
              <textarea className="input" data-paste="expl" rows={2} value={d.explanation} onChange={(e) => set({ explanation: e.target.value })} placeholder="Giải thích ngắn để đọc cho cả lớp sau khi học sinh trả lời…" />
              <ImageZone small target="expl" url={d.explanation_image} title="Ảnh lời giải" busy={img.busy} onPaste={pasteFromClipboard} onChoose={chooseFile}
                onDropFile={(f) => uploadTo('expl', f)} onRemove={() => set({ explanation_image: undefined })} />
            </div>

            {/* ---- Thông tin ---- */}
            <div className="cmp-meta">
              <label className="field"><span className="cmp-label">Môn học</span>
                <select className="input" value={d.subject} onChange={(e) => set({ subject: e.target.value })}>
                  {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="field"><span className="cmp-label">Bài học (không bắt buộc)</span>
                <input className="input" list="cmp-lessons" value={d.lesson} onChange={(e) => set({ lesson: e.target.value })} placeholder="Chọn bài hoặc gõ tên bài mới" />
                <datalist id="cmp-lessons">{lessons.map((l) => <option key={l} value={l} />)}</datalist>
              </label>
              <label className="field"><span className="cmp-label">Thời gian suy nghĩ (riêng câu này)</span>
                <select className="input" value={d.time} onChange={(e) => set({ time: Number(e.target.value) })}>
                  {TIME_CHOICES.map((t) => <option key={t} value={t}>{t < 60 ? `${t} giây` : `${t / 60} phút`}</option>)}
                </select>
              </label>
              <label className="field"><span className="cmp-label">Điểm</span>
                <select className="input" value={d.points} onChange={(e) => set({ points: Number(e.target.value) })}>
                  {[0, 500, 1000, 2000].map((p) => <option key={p} value={p}>{p === 0 ? 'Không tính điểm' : p}</option>)}
                </select>
              </label>
              {['multiple_select', 'fill_blank', 'reorder', 'matching'].includes(d.type) && (
                <label className="field"><span className="cmp-label">Cách chấm</span>
                  <select className="input" value={d.scoring} onChange={(e) => set({ scoring: e.target.value as Draft['scoring'] })}>
                    <option value="partial">Chấm từng phần</option>
                    <option value="all_or_nothing">Đúng hết mới có điểm</option>
                  </select>
                </label>
              )}
            </div>

            {tried && errors.length > 0 && (
              <div className="alert warn" role="alert">
                <AlertTriangle size={20} style={{ flex: 'none' }} />
                <div>{errors.map((e) => <div key={e}>{e}</div>)}</div>
              </div>
            )}
          </div>

          <aside className="cmp-prev" aria-label="Xem trước">
            <span className="cmp-label row" style={{ gap: 6 }}><Eye size={16} /> Xem trước — đáp án đúng tô xanh</span>
            <p className="small muted" style={{ margin: '4px 0 12px' }}>Bấm <b>Chơi thử</b> để tự làm câu này như học sinh (thứ tự được xáo trộn như khi chơi).</p>
            <Preview q={q} d={d} />
          </aside>
        </div>

        <footer className="cmp-foot">
          <span className="grow small muted">{summary}</span>
          <button className="btn ghost" onClick={onClose}>Hủy</button>
          <button className="btn gout" onClick={() => setPlaying(true)}><Play size={16} /> Chơi thử</button>
          {!initial && <button className="btn vout" onClick={() => save(true)}><Plus size={16} /> Lưu &amp; soạn câu tiếp</button>}
          <button className="btn violet" onClick={() => save(false)}><Save size={16} /> Lưu câu hỏi</button>
        </footer>
      </div>
      {playing && <TryPlay q={q} onClose={() => setPlaying(false)} />}
      {videoDlg && <VideoUrlDialog initial={d.video?.source_type === 'internet_url' ? d.video : undefined} onClose={() => setVideoDlg(false)} onSave={(v) => (set({ video: v }), setVideoDlg(false))} />}
    </div>
  );
}

// ======================== Ô ảnh (nét đứt) ========================
function ImageZone(props: {
  target: string; url?: string; title: string; hint?: ReactNode; small?: boolean; busy?: boolean;
  onPaste: (t: string) => void; onChoose: (t: string) => void; onLink?: (t: string) => void; onDropFile: (f: File) => void; onRemove: () => void;
  alt?: string; onAlt?: (v: string) => void;
}) {
  const [over, setOver] = useState(false);
  const { target, url } = props;
  return (
    <div
      className={`izone ${props.small ? 'sm' : ''} ${over ? 'drag' : ''}`}
      data-paste={target}
      tabIndex={0}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) props.onDropFile(f);
      }}
    >
      {url ? (
        <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
          <img src={url} alt={props.alt || props.title} className="izone-img" />
          <div className="stack" style={{ gap: 6 }}>
            <button type="button" className="btn sm ghost" onClick={() => props.onPaste(target)}><ClipboardPaste size={14} /> Dán ảnh khác</button>
            <button type="button" className="btn sm ghost" onClick={() => props.onChoose(target)}><Upload size={14} /> Đổi ảnh</button>
            <button type="button" className="btn sm danger" onClick={props.onRemove}><Trash2 size={14} /> Xóa ảnh</button>
            {props.onAlt && <input className="input" style={{ minHeight: 36 }} value={props.alt ?? ''} onChange={(e) => props.onAlt!(e.target.value)} placeholder="Mô tả ảnh (alt)" aria-label="Mô tả ảnh" />}
          </div>
        </div>
      ) : (
        <>
          {!props.small && <ImagePlus size={26} color="var(--violet)" />}
          <span className="small"><b>{props.title}</b> {props.hint}</span>
          <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
            <button type="button" className="btn sm violet" disabled={props.busy} onClick={() => props.onPaste(target)}><ClipboardPaste size={14} /> Dán ảnh</button>
            <button type="button" className="btn sm ghost" disabled={props.busy} onClick={() => props.onChoose(target)}><Upload size={14} /> Chọn ảnh</button>
            {props.onLink && <button type="button" className="btn sm ghost" onClick={() => props.onLink!(target)}><LinkIcon size={14} /> Link ảnh</button>}
          </div>
        </>
      )}
    </div>
  );
}

/** Ô chữ một dòng có nút micro bên trong (nhập đáp án bằng giọng nói). */
function MicInput({ value, onChange, placeholder, paste, label }: { value: string; onChange: (v: string) => void; placeholder: string; paste: string; label: string }) {
  const sp = useSpeech((t) => onChange((value ? value.trimEnd() + ' ' : '') + t));
  const on = sp.status === 'RECORDING';
  return (
    <div className="mic-in grow">
      <input className="input" data-paste={paste} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
      <button type="button" className={`mic ${on ? 'on' : ''}`} onClick={sp.toggle} title={on ? 'Dừng' : 'Nói để nhập'} aria-label={`Nói để nhập ${label}`}>
        {on ? <MicOff size={15} /> : <Mic size={15} />}
      </button>
    </div>
  );
}

type SecProps = {
  d: Draft;
  setD: React.Dispatch<React.SetStateAction<Draft>>;
  onPaste?: (t: string) => void;
  onChoose?: (t: string) => void;
  onDrop?: (t: string, f: File) => void;
  busy?: boolean;
};

function ChoiceSection({ d, setD, onPaste, onChoose, onDrop, busy }: SecProps) {
  const multi = d.type === 'multiple_select';
  const toggle = (id: string) =>
    setD((x) => ({ ...x, options: x.options.map((o) => (multi ? (o.id === id ? { ...o, correct: !o.correct } : o) : { ...o, correct: o.id === id })) }));
  const upd = (id: string, p: Partial<Cell>) => setD((x) => ({ ...x, options: x.options.map((o) => (o.id === id ? { ...o, ...p } : o)) }));
  return (
    <>
      <div className="row between">
        <span className="cmp-label">Các phương án</span>
        <small className="muted">{multi ? 'Bấm chữ cái để đánh dấu các đáp án ĐÚNG' : 'Bấm chữ cái để chọn đáp án ĐÚNG'}</small>
      </div>
      <div className="ogrid">
        {d.options.map((o, i) => (
          <div key={o.id} className={`ocard ${o.correct ? 'ok' : ''}`}>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <button type="button" className={`letter ${o.correct ? 'ok' : ''}`} onClick={() => toggle(o.id)} aria-pressed={o.correct} aria-label={`Đánh dấu ${OPTION_LABELS[i]} là đáp án đúng`}>
                {o.correct ? <Check size={20} /> : OPTION_LABELS[i]}
              </button>
              <MicInput value={o.text} onChange={(v) => upd(o.id, { text: v })} placeholder={`Phương án ${OPTION_LABELS[i]}`} paste={`opt:${o.id}`} label={`phương án ${OPTION_LABELS[i]}`} />
              <button type="button" className="btn icon sm ghost" style={{ color: '#e11d48', border: 0 }} disabled={d.options.length <= 2}
                onClick={() => setD((x) => ({ ...x, options: x.options.filter((y) => y.id !== o.id) }))} aria-label={`Xóa phương án ${OPTION_LABELS[i]}`}><Trash2 size={16} /></button>
            </div>
            <ImageZone small target={`opt:${o.id}`} url={o.image} title={`Ảnh phương án ${OPTION_LABELS[i]}`} busy={busy} onPaste={onPaste!} onChoose={onChoose!}
              onDropFile={(f) => onDrop?.(`opt:${o.id}`, f)} onRemove={() => upd(o.id, { image: undefined })} />
          </div>
        ))}
      </div>
      {d.options.length < 6 && (
        <button type="button" className="btn sm dashed" onClick={() => setD((x) => ({ ...x, options: [...x.options, { id: `o${Date.now().toString(36)}`, text: '', correct: false }] }))}>
          <Plus size={16} /> Thêm phương án {OPTION_LABELS[d.options.length]}
        </button>
      )}
    </>
  );
}

const FILL_MODES: { id: Draft['fillMode']; title: string; desc: string }[] = [
  { id: 'type', title: 'Học sinh gõ chữ', desc: 'Em tự gõ đáp án vào chỗ trống.' },
  { id: 'bank', title: 'Chọn từ kho từ', desc: 'Em bấm từ trong kho từ để điền.' },
  { id: 'menu', title: 'Chọn từ menu', desc: 'Em bấm vào chỗ trống và chọn đáp án trong danh sách thả xuống.' },
];

function FillSection({ d, setD }: SecProps) {
  const [word, setWord] = useState('');
  const addWord = () => {
    const w = word.trim();
    if (!w) return;
    setD((x) => (x.distractors.includes(w) ? x : { ...x, distractors: [...x.distractors, w] }));
    setWord('');
  };
  const typing = d.fillMode === 'type';
  // Mỗi chỗ trống lưu "đáp án chính | cách viết khác | …"
  const partsOf = (i: number) => {
    const p = (d.blanks[i] ?? '').split('|').map((x) => x.trim());
    return p.length ? p : [''];
  };
  const setParts = (i: number, parts: string[]) => setD((x) => ({ ...x, blanks: x.blanks.map((y, k) => (k === i ? parts.join(' | ') : y)) }));
  return (
    <>
      <span className="cmp-label">Cách học sinh trả lời</span>
      <div className="row" role="radiogroup" aria-label="Cách học sinh trả lời">
        {FILL_MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={d.fillMode === m.id} className={`tab ${d.fillMode === m.id ? 'on' : ''}`} title={m.desc}
            onClick={() => setD((x) => ({ ...x, fillMode: m.id, distractors: m.id === 'type' ? [] : x.distractors }))}>{m.title}</button>
        ))}
      </div>
      <small className="muted">{FILL_MODES.find((m) => m.id === d.fillMode)!.desc}</small>

      <span className="cmp-label">{typing ? 'Đáp án cho từng chỗ trống' : 'Từ đúng cho từng chỗ trống'}</span>
      {d.blanks.length === 0 ? (
        <div className="alert warn"><div>Chưa có chỗ trống. Đặt con trỏ vào nội dung câu hỏi (hoặc bôi đen từ cần ẩn) rồi bấm <b>Chèn chỗ trống</b>.</div></div>
      ) : (
        d.blanks.map((_, i) => {
          const parts = partsOf(i);
          return (
            <div key={i} className="fill-blank-box">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <span className="blank-no">{i + 1}</span>
                <MicInput value={parts[0]} onChange={(v) => setParts(i, [v.replace(/\|/g, ' '), ...parts.slice(1)])}
                  placeholder={typing ? 'Đáp án chính xác, đúng dấu (VD: Hà Nội)' : 'Từ đúng (VD: Hà Nội)'} paste="stem" label={`đáp án chính xác chỗ trống ${i + 1}`} />
              </div>
              {typing && (
                <>
                  <label className="switch">
                    <input type="checkbox" checked={!!d.noAccent[i]}
                      onChange={(e) => setD((x) => ({ ...x, noAccent: Array.from({ length: x.blanks.length }, (_, k) => (k === i ? e.target.checked : !!x.noAccent[k])) }))} />
                    Vẫn tính điểm khi học sinh gõ không dấu{parts[0] && <span className="muted">&nbsp;(VD: {parts[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')})</span>}
                  </label>
                  {parts.slice(1).map((v, k) => (
                    <div key={k} className="row" style={{ flexWrap: 'nowrap' }}>
                      <input className="input" value={v} placeholder="Cách viết khác cũng được tính điểm (VD: Thủ đô Hà Nội)" aria-label={`Cách viết khác ${k + 1} của chỗ trống ${i + 1}`}
                        onChange={(e) => setParts(i, parts.map((y, j) => (j === k + 1 ? e.target.value.replace(/\|/g, ' ') : y)))} />
                      <button type="button" className="btn icon sm ghost" onClick={() => setParts(i, parts.filter((_, j) => j !== k + 1))} aria-label="Bỏ cách viết này"><X size={16} /></button>
                    </div>
                  ))}
                  <button type="button" className="btn sm dashed" onClick={() => setParts(i, [...parts, ''])}><Plus size={16} /> Thêm cách viết được chấp nhận</button>
                </>
              )}
            </div>
          );
        })
      )}
      {typing ? (
        <small className="muted">Không phân biệt chữ hoa, chữ thường. Học sinh gõ đúng một trong các cách viết thầy cô nhập thì được tính điểm.</small>
      ) : (
        <>
          <span className="cmp-label">Từ gây nhiễu (thêm lựa chọn sai để học sinh suy nghĩ)</span>
          <div className="chip-input">
            {d.distractors.map((w) => (
              <span key={w} className="wchip">{w}
                <button type="button" onClick={() => setD((x) => ({ ...x, distractors: x.distractors.filter((y) => y !== w) }))} aria-label={`Bỏ từ ${w}`}><X size={12} /></button>
              </span>
            ))}
            <input value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addWord();
              }
            }} onBlur={addWord} placeholder={d.distractors.length ? 'Thêm từ…' : 'Gõ từ rồi nhấn Enter…'} aria-label="Từ gây nhiễu" />
          </div>
          <small className="muted">
            {d.fillMode === 'menu' ? 'Danh sách thả xuống ở mỗi chỗ trống gồm các từ đúng và các từ gây nhiễu.' : 'Kho từ gồm các từ đúng và các từ gây nhiễu.'}
            {!d.distractors.length && ' Nên thêm ít nhất 2 từ gây nhiễu.'}
          </small>
        </>
      )}
    </>
  );
}

function CellTools({ target, onPaste, onChoose, image, onRemove }: { target: string; onPaste?: (t: string) => void; onChoose?: (t: string) => void; image?: string; onRemove: () => void }) {
  return image ? (
    <span className="cell-thumb"><img src={image} alt="" /><button type="button" onClick={onRemove} aria-label="Xóa ảnh"><X size={12} /></button></span>
  ) : (
    <>
      <button type="button" className="btn icon sm tool" onClick={() => onPaste?.(target)} title="Dán ảnh từ bộ nhớ tạm" aria-label="Dán ảnh"><ClipboardPaste size={16} /></button>
      <button type="button" className="btn icon sm tool" onClick={() => onChoose?.(target)} title="Chọn ảnh" aria-label="Chọn ảnh"><ImagePlus size={16} /></button>
    </>
  );
}

function StepsSection({ d, setD, onPaste, onChoose }: SecProps) {
  const upd = (id: string, p: Partial<Cell>) => setD((x) => ({ ...x, steps: x.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const move = (i: number, dir: number) =>
    setD((x) => {
      const a = x.steps.slice();
      [a[i], a[i + dir]] = [a[i + dir], a[i]];
      return { ...x, steps: a };
    });
  return (
    <>
      <span className="cmp-label">Các bước theo thứ tự đúng</span>
      <small className="muted">Khi chơi, phần mềm tự xáo trộn · mỗi bước có thể thêm ảnh (Ctrl+V trong ô chữ)</small>
      {d.steps.map((s, i) => (
        <div key={s.id} className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <span className="step-no">{i + 1}</span>
          <MicInput value={s.text} onChange={(v) => upd(s.id, { text: v })} placeholder={`Bước ${i + 1}`} paste={`step:${s.id}`} label={`bước ${i + 1}`} />
          <CellTools target={`step:${s.id}`} image={s.image} onPaste={onPaste} onChoose={onChoose} onRemove={() => upd(s.id, { image: undefined })} />
          <button type="button" className="btn icon sm ghost" style={{ border: 0 }} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Đưa bước ${i + 1} lên`}><ArrowUp size={16} /></button>
          <button type="button" className="btn icon sm ghost" style={{ border: 0 }} disabled={i === d.steps.length - 1} onClick={() => move(i, 1)} aria-label={`Đưa bước ${i + 1} xuống`}><ArrowDown size={16} /></button>
          <button type="button" className="btn icon sm ghost" style={{ border: 0, color: '#e11d48' }} disabled={d.steps.length <= 2}
            onClick={() => setD((x) => ({ ...x, steps: x.steps.filter((y) => y.id !== s.id) }))} aria-label={`Xóa bước ${i + 1}`}><Trash2 size={16} /></button>
        </div>
      ))}
      <button type="button" className="btn sm dashed" onClick={() => setD((x) => ({ ...x, steps: [...x.steps, { id: `o${Date.now().toString(36)}`, text: '' }] }))}><Plus size={16} /> Thêm bước</button>
    </>
  );
}

function PairsSection({ d, setD, onPaste, onChoose }: SecProps) {
  const upd = (pid: string, side: 'left' | 'right', p: Partial<Cell>) =>
    setD((x) => ({ ...x, pairs: x.pairs.map((q) => (q.pid === pid ? { ...q, [side]: { ...q[side], ...p } } : q)) }));
  return (
    <>
      <small className="muted">Mỗi ô có thể là chữ, ảnh hoặc cả hai (Ctrl+V trong ô chữ để dán ảnh). Khi chơi, cả hai cột được xáo trộn.</small>
      <div className="pair-head"><span className="cmp-label">Cột A</span><span /><span className="cmp-label">Cột B (nối đúng)</span><span /></div>
      {d.pairs.map((p, i) => (
        <div key={p.pid} className="pair-line">
          <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
            <MicInput value={p.left.text} onChange={(v) => upd(p.pid, 'left', { text: v })} placeholder={`A${i + 1}`} paste={`L:${p.pid}`} label={`cột A dòng ${i + 1}`} />
            <CellTools target={`L:${p.pid}`} image={p.left.image} onPaste={onPaste} onChoose={onChoose} onRemove={() => upd(p.pid, 'left', { image: undefined })} />
          </div>
          <Link2 size={16} color="#94a3b8" aria-hidden />
          <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
            <MicInput value={p.right.text} onChange={(v) => upd(p.pid, 'right', { text: v })} placeholder={`B${i + 1}`} paste={`R:${p.pid}`} label={`cột B dòng ${i + 1}`} />
            <CellTools target={`R:${p.pid}`} image={p.right.image} onPaste={onPaste} onChoose={onChoose} onRemove={() => upd(p.pid, 'right', { image: undefined })} />
          </div>
          <button type="button" className="btn icon sm ghost" style={{ border: 0, color: '#e11d48' }} disabled={d.pairs.length <= 2}
            onClick={() => setD((x) => ({ ...x, pairs: x.pairs.filter((y) => y.pid !== p.pid) }))} aria-label={`Xóa cặp ${i + 1}`}><Trash2 size={16} /></button>
        </div>
      ))}
      <button type="button" className="btn sm dashed" onClick={() => setD((x) => ({ ...x, pairs: [...x.pairs, { pid: `p${Date.now().toString(36)}`, left: { id: `l${Date.now().toString(36)}`, text: '' }, right: { id: `r${Date.now().toString(36)}`, text: '' } }] }))}>
        <Plus size={16} /> Thêm cặp nối
      </button>
    </>
  );
}

// ======================== Xem trước ========================
function Preview({ q, d }: { q: Question; d: Draft }) {
  const parts = d.text.split(BLANK);
  return (
    <div className="prev-card stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 6 }}>
        <span className="badge purple">{TYPE_LABELS[d.type]}</span>
        <span className="badge">{d.subject}</span>
        {d.lesson && <span className="badge">{d.lesson}</span>}
      </div>
      {d.text.trim() ? (
        <p style={{ margin: 0, fontWeight: 700, whiteSpace: 'pre-wrap' }}>
          {d.type === 'fill_blank'
            ? parts.map((p, i) => (
                <span key={i}>{p}{i < parts.length - 1 && <span className="pv-blank">{(d.blanks[i] ?? '').split('|')[0].trim() || '___'}</span>}</span>
              ))
            : d.text}
        </p>
      ) : (
        <p className="muted" style={{ margin: 0, fontStyle: 'italic' }}>(Chưa có nội dung câu hỏi)</p>
      )}
      {d.image && <img src={d.image} alt={d.image_alt || ''} style={{ maxHeight: 160, borderRadius: 12, objectFit: 'contain', alignSelf: 'flex-start' }} />}
      {d.audio && <audio src={d.audio} controls style={{ width: '100%' }} />}

      {(d.type === 'single_choice' || d.type === 'multiple_select') && (
        <div className="stack" style={{ gap: 6 }}>
          {d.options.map((o, i) => (
            <div key={o.id} className={`pv-opt ${o.correct ? 'ok' : ''}`}>
              <b>{OPTION_LABELS[i]}</b>
              <span className="grow">{o.text || <i className="muted">(trống)</i>}</span>
              {o.image && <img src={o.image} alt="" />}
              {o.correct && <Check size={16} />}
            </div>
          ))}
        </div>
      )}
      {d.type === 'true_false' && (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <div className={`pv-tf ${d.tf ? 'ok' : ''}`}>ĐÚNG</div>
          <div className={`pv-tf ${!d.tf ? 'ok' : ''}`}>SAI</div>
        </div>
      )}
      {d.type === 'fill_blank' && d.fillMode !== 'type' && d.distractors.length > 0 && (
        <div className="row" style={{ gap: 6 }}>
          {[...d.blanks.map((b) => b.split('|')[0].trim()).filter(Boolean), ...d.distractors].map((w, i) => (
            <span key={w + i} className={`wchip ${i < d.blanks.length ? 'ok' : ''}`}>{w}</span>
          ))}
        </div>
      )}
      {d.type === 'reorder' && (
        <ol style={{ margin: 0, paddingLeft: 22 }}>
          {d.steps.map((s) => <li key={s.id}>{s.text || <i className="muted">(trống)</i>}</li>)}
        </ol>
      )}
      {d.type === 'matching' && (
        <div className="stack" style={{ gap: 6 }}>
          {d.pairs.map((p) => (
            <div key={p.pid} className="pv-opt ok"><span className="grow">{p.left.text || '…'}</span><Link2 size={14} /><span className="grow" style={{ textAlign: 'right' }}>{p.right.text || '…'}</span></div>
          ))}
        </div>
      )}
      {d.type === 'oral' && <div className="pv-opt"><MessageSquareText size={16} /> Học sinh trả lời miệng – giáo viên chấm</div>}
      {(d.explanation || d.explanation_image) && (
        <div className="expl small">
          <b><Lightbulb size={14} /> Lời giải:</b> {d.explanation}
          {d.explanation_image && <img src={d.explanation_image} alt="Ảnh lời giải" style={{ maxHeight: 120, borderRadius: 8, objectFit: 'contain' }} />}
        </div>
      )}
      <small className="muted">⏱ {d.time < 60 ? `${d.time} giây` : `${d.time / 60} phút`} · {q.points} điểm</small>
    </div>
  );
}

// ======================== Chơi thử ========================
function TryPlay({ q, onClose }: { q: Question; onClose: () => void }) {
  const [round, setRound] = useState(0);
  const [res, setRes] = useState<{ ratio: number; a: Answer } | null>(null);
  return (
    <div className="modal-back" style={{ zIndex: 75 }}>
      <div className="play-bg" style={{ width: 'min(980px, 100%)', maxHeight: 'calc(100vh - 32px)', overflow: 'auto', borderRadius: 22, minHeight: 0 }}>
        <div className="play-wrap" style={{ minHeight: 0 }}>
          <div className="row between">
            <b>Chơi thử như học sinh</b>
            <div className="row">
              <button className="btn sm" onClick={() => (setRes(null), setRound((r) => r + 1))}><RotateCcw size={16} /> Làm lại</button>
              <button className="btn sm" onClick={onClose}><X size={16} /> Đóng</button>
            </div>
          </div>
          <PlayQuestion
            key={round}
            q={q}
            seed={hashString(q.id + round)}
            shuffleOptions
            disabled={!!res}
            reveal={!!res}
            chosen={res?.a ?? null}
            onSubmit={(a) => setRes({ ratio: gradeRatio(q, a), a })}
          />
          {res && (
            <div className={`feedback ${q.type === 'oral' ? '' : res.ratio === 1 ? 'ok' : 'bad'}`} style={q.type === 'oral' ? { background: '#475569' } : undefined}>
              {q.type === 'oral' ? 'Đã gửi – giáo viên sẽ chấm Đúng / Sai' : res.ratio === 1 ? 'Chính xác!' : res.ratio > 0 ? `Đúng ${Math.round(res.ratio * 100)}%` : 'Chưa đúng'}
              {q.explanation && <div style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', marginTop: 6 }}>{q.explanation}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
