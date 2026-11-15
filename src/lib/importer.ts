// Bóc tách đề từ tệp (Word/PDF/PowerPoint/Excel/CSV/văn bản) và tự sửa lỗi định dạng phổ biến (SRS mục 4.3).
import type { Question, QuestionType } from './types';
import { newQuestion, opt } from './factory';
import { uid } from './util';
import { parseVideoUrl } from './media';

// ---------- 1. Lấy văn bản thô từ tệp ----------
export async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (file.name.startsWith('~$')) throw new Error('Đây là tệp tạm do Word/Excel tạo ra khi tài liệu đang mở (tên bắt đầu bằng "~$"). Hãy chọn tệp gốc cùng thư mục, tên không có "~$".');
  if (!file.size) throw new Error('Tệp rỗng (0 KB). Nếu tệp nằm trên OneDrive / Google Drive, hãy tải về máy trước; nếu đang mở trong Word, hãy bấm Lưu rồi chọn lại.');
  if (ext === 'doc' || ext === 'xls' || ext === 'ppt') throw new Error(oldOfficeMessage(ext));
  if (ext === 'docx' || ext === 'pptx' || ext === 'xlsx') {
    // Tệp Office mới thực chất là tệp nén ZIP (bắt đầu bằng "PK"). Kiểm tra trước để báo lỗi dễ hiểu thay cho lỗi tiếng Anh của bộ giải nén.
    const kind = await sniff(file);
    if (kind !== 'zip') {
      if (kind === 'ole') throw new Error(oldOfficeMessage(ext));
      if (kind === 'rtf') throw new Error('Tệp này là văn bản RTF mang đuôi .' + ext + '. Hãy mở bằng Word → Tệp → Lưu thành → chọn kiểu "Word Document (*.docx)" rồi tải lên lại.');
      // Một số phần mềm xuất trang web hoặc văn bản thường nhưng đặt đuôi .docx: vẫn đọc được nội dung
      if (ext === 'docx' && kind === 'html') return htmlToMarkedText(await file.text());
      if (ext === 'docx' && kind === 'text') return file.text();
      throw new Error('Tệp "' + file.name + '" không đúng định dạng .' + ext + ' (có thể bị hỏng khi tải về hoặc bị đổi đuôi). Hãy mở tệp bằng ' +
        (ext === 'docx' ? 'Word' : ext === 'xlsx' ? 'Excel' : 'PowerPoint') + ' → Lưu thành tệp .' + ext + ' mới rồi tải lên lại.');
    }
  }
  try {
    if (ext === 'docx') {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      return docxHtmlToText(value);
    }
    if (ext === 'pdf') return await extractPdf(file);
    if (ext === 'pptx') return await extractPptx(file);
    if (ext === 'xlsx') return await extractXlsx(file);
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (/NotReadable|could not be read|permission/i.test(msg)) throw new Error('Không đọc được tệp. Hãy đóng tệp trong Word/Excel (hoặc tải tệp về máy nếu đang ở trên mạng) rồi chọn lại.');
    if (/password|encrypt/i.test(msg)) throw new Error('Tệp có đặt mật khẩu. Hãy bỏ mật khẩu (Tệp → Thông tin → Bảo vệ tài liệu) rồi tải lên lại.');
    throw new Error('Không đọc được tệp "' + file.name + '": tệp có thể bị hỏng. Hãy mở tệp, Lưu thành một tệp mới rồi thử lại. (Chi tiết: ' + msg.slice(0, 120) + ')');
  }
  if (ext === 'csv' || ext === 'txt' || ext === 'md') return file.text();
  throw new Error('Định dạng chưa hỗ trợ. Hãy dùng .docx, .pdf, .pptx, .xlsx, .csv hoặc .txt.');
}

const oldOfficeMessage = (ext: string) => {
  const app = /doc/.test(ext) ? 'Word' : /xls/.test(ext) ? 'Excel' : 'PowerPoint';
  const next = /doc/.test(ext) ? '.docx' : /xls/.test(ext) ? '.xlsx' : '.pptx';
  return `Tệp này là ${app} đời cũ (97–2003) hoặc có đặt mật khẩu nên chưa đọc được. Hãy mở bằng ${app} → Tệp → Lưu thành → chọn kiểu "${next}" (bỏ mật khẩu nếu có) rồi tải lên lại.`;
};

/** Nhận dạng loại tệp theo vài byte đầu: zip (Office mới) · ole (Office 97–2003 / có mật khẩu) · rtf · html · text · unknown. */
export async function sniff(file: Blob): Promise<'zip' | 'ole' | 'rtf' | 'html' | 'text' | 'unknown'> {
  const b = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (b[0] === 0x50 && b[1] === 0x4b) return 'zip';
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole';
  const head = new TextDecoder('utf-8').decode(b).replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('{\\rtf')) return 'rtf';
  if (/^<(!doctype|html|\?xml|head|body|meta|p|div|table)\b/i.test(head)) return 'html';
  // Văn bản thường: không có byte điều khiển (ngoài tab, xuống dòng)
  if (b.length && !b.some((x) => x < 9 || (x > 13 && x < 32))) return 'text';
  return 'unknown';
}

// Ảnh nhúng trong tệp Word: giữ tạm ở đây, văn bản chỉ chứa dòng đánh dấu [[IMG:n]].
// Khi lưu, resolveImportedImages() tải ảnh lên kho và thay bằng URL thật.
const IMG_PREFIX = 'import-img:';
const importedImages = new Map<string, string>();
let imgSeq = 0;

/** HTML do mammoth tạo từ .docx -> văn bản có đánh dấu chữ đậm và vị trí ảnh. */
export function docxHtmlToText(html: string): string {
  const withImages = html.replace(/<img\b[^>]*\bsrc="(data:image\/[^"]+)"[^>]*>/gi, (_m, src: string) => {
    const id = String(++imgSeq);
    importedImages.set(id, src);
    return `<br>[[IMG:${id}]]<br>`;
  });
  return htmlToMarkedText(withImages);
}

const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();

/** Thay các ảnh tạm (import-img:n) bằng URL sau khi tải lên. `upload` nhận ảnh và trả về URL. */
export async function resolveImportedImages(questions: Question[], upload: (blob: Blob, name: string) => Promise<string>): Promise<Question[]> {
  const done = new Map<string, string>();
  const fix = async (url?: string) => {
    if (!url || !url.startsWith(IMG_PREFIX)) return url;
    const id = url.slice(IMG_PREFIX.length);
    if (!done.has(id)) {
      const data = importedImages.get(id);
      if (!data) return undefined;
      done.set(id, await upload(await dataUrlToBlob(data), `anh-${id}.png`));
    }
    return done.get(id);
  };
  const out: Question[] = [];
  for (const q of questions) {
    const stem = { ...q.stem, image_url: await fix(q.stem.image_url) };
    const options = [];
    for (const o of q.options) options.push({ ...o, image_url: await fix(o.image_url) });
    out.push({ ...q, stem, options });
  }
  return out;
}
export const hasImportedImages = (qs: Question[]) =>
  qs.some((q) => q.stem.image_url?.startsWith(IMG_PREFIX) || q.options.some((o) => o.image_url?.startsWith(IMG_PREFIX)));

/** HTML từ Word -> văn bản, chữ đậm/gạch chân/tô màu được bọc ** ** để nhận diện đáp án đúng. */
export function htmlToMarkedText(html: string): string {
  return html
    .replace(/<(strong|b|u|mark)>(.*?)<\/\1>/gi, (_m, _t, inner) => (inner.replace(/<[^>]*>/g, '').trim() ? `**${inner}**` : inner))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d|tr)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\*\*\s*\*\*/g, '');
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = '';
    for (const it of content.items as { str: string; transform: number[]; fontName?: string }[]) {
      const y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        out.push(line);
        line = '';
      }
      line += it.str;
      lastY = y;
    }
    out.push(line);
  }
  return out.join('\n');
}

async function extractPptx(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const parts: string[] = [];
  for (const n of slides) {
    const xml = await zip.file(n)!.async('string');
    const paras = xml.split(/<\/a:p>/).map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(''));
    parts.push(paras.filter(Boolean).join('\n'));
  }
  return parts.join('\n\n');
}

async function extractXlsx(file: File): Promise<string> {
  const readXlsx = (await import('read-excel-file')).default;
  const rows = await readXlsx(file);
  return rows.map((r) => r.map((c) => (c ?? '').toString()).join('\t')).join('\n');
}

// ---------- 2. Bảng tính: mỗi dòng là một câu ----------
// Cột: Câu hỏi | A | B | C | D | (E) | (F) | Đáp án (VD: "B" hoặc "A,C") | (Thời gian) | (Điểm)
export function parseTable(text: string): Question[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 1) return null;
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const rows = lines.map((l) => splitCsv(l, sep));
  if (rows[0].length < 3) return null;
  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader = header.some((h) => /câu hỏi|question|đáp án|answer/.test(h));
  const ansCol = hasHeader ? header.findIndex((h) => /đáp án|answer|correct/.test(h)) : -1;
  const timeCol = hasHeader ? header.findIndex((h) => /thời gian|time/.test(h)) : -1;
  const out: Question[] = [];
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const stem = r[0]?.trim();
    if (!stem) continue;
    const end = ansCol > 0 ? ansCol : r.length - 1;
    const optTexts = r.slice(1, end).map((x) => x.trim()).filter(Boolean).slice(0, 6);
    const key = (r[ansCol > 0 ? ansCol : r.length - 1] ?? '').toUpperCase();
    const letters: string[] = key.match(/[A-F]/g) ?? [];
    if (optTexts.length < 2) continue;
    const q = newQuestion(letters.length > 1 ? 'multiple_select' : 'single_choice');
    q.stem.text = stem;
    q.options = optTexts.map((t, i) => opt(t, { is_correct: letters.includes('ABCDEF'[i]) }));
    if (timeCol > 0 && Number(r[timeCol])) q.time_limit_seconds = Number(r[timeCol]);
    q.needs_review = letters.length === 0;
    out.push(q);
  }
  return out.length ? out : null;
}

function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// ---------- 3. Văn bản tự do: bộ phân tích có tự phục hồi lỗi ----------
const Q_START = /^\s*(?:\*\*)?\s*(?:câu|bài|question|q)\s*(\d+)\s*[.:)\-–]?\s*(?:\*\*)?\s*(.*)$/i;
const NUM_START = /^\s*(\d{1,3})\s*[.)]\s+(.*)$/;
const OPT = /^\s*(\*|\*\*)?\s*([A-Fa-f])\s*[.):/]\s*(.*)$/;
const ANS_LINE = /^\s*(?:\*\*)?\s*(?:đáp\s*án(?:\s*đúng)?|đa|answer|key)\s*(?:\*\*)?\s*[:：\-]?\s*(?:\*\*)?\s*([A-F](?:\s*[,;&và]+\s*[A-F])*)\b/i;
const KEY_HEADER = /^\s*(?:\*\*)?\s*(?:bảng\s*)?(?:đáp\s*án|answer\s*key|key)\s*(?:\*\*)?\s*:?\s*$/i;

// ----- Nhãn của file Word mẫu (mỗi nhãn một dòng, nằm trong câu hỏi) -----
export const ZONE_START = /^\s*=+\s*BẮT ĐẦU CÂU HỎI\s*=+\s*$/i;
export const ZONE_END = /^\s*=+\s*KẾT THÚC CÂU HỎI\s*=+\s*$/i;
const L_TYPE = /^(?:dạng|loại|type)\s*[:：]\s*(.+)$/i;
const L_TIME = /^thời\s*gian\s*[:：]\s*(\d+)/i;
const L_POINTS = /^điểm\s*[:：]\s*(\d+)/i;
const L_EXPLAIN = /^(?:giải\s*thích|lời\s*giải)\s*[:：]\s*(.+)$/i;
const L_DISTRACT = /^từ\s*(?:gây\s*)?nhiễu\s*[:：]\s*(.+)$/i;
const L_VIDEO = /^video\s*[:：]\s*(\S+)/i;
const L_AUDIO = /^(?:âm\s*thanh|audio)\s*[:：]\s*(https?:\S+)/i;
const L_IMAGE = /^(?:hình(?:\s*ảnh)?|ảnh|image)\s*[:：]\s*(https?:\S+)/i;
const L_IMG_TOKEN = /^\[\[IMG:(\d+)\]\]$/;
const IS_LABEL = /^\s*(?:\*\*)?\s*(?:dạng|loại|type|thời\s*gian|điểm|giải\s*thích|lời\s*giải|từ\s*(?:gây\s*)?nhiễu|video|âm\s*thanh|audio|hình(?:\s*ảnh)?|ảnh|image)\s*(?:\*\*)?\s*[:：]/i;
const PAIR_SEP = /\s*(?:=>|->|→|=)\s*/;

function typeFromLabel(v: string): QuestionType | undefined {
  const t = v.toLowerCase();
  if (/nhiều/.test(t)) return 'multiple_select';
  if (/đúng.*sai|true.*false/.test(t)) return 'true_false';
  if (/điền|chỗ trống|khuyết/.test(t)) return 'fill_blank';
  if (/sắp xếp|thứ tự/.test(t)) return 'reorder';
  if (/nối/.test(t)) return 'matching';
  if (/miệng|tự luận/.test(t)) return 'oral';
  if (/một|1 đáp án|trắc nghiệm/.test(t)) return 'single_choice';
  return undefined;
}

/** Tách các phương án A. B. C. D. nằm cùng một dòng (kể cả thiếu dấu chấm). */
export function splitInlineOptions(line: string): string[] {
  const withPunct = /(?:^|\s)(\*{0,2}[A-F]\s*[.):])\s/g;
  const marks = [...line.matchAll(withPunct)];
  if (marks.length >= 2) {
    const parts: string[] = [];
    const idx = marks.map((m) => m.index! + (m[0].startsWith(' ') || m[0].startsWith('\t') ? 1 : 0));
    if (idx[0] > 0 && line.slice(0, idx[0]).trim()) parts.push(line.slice(0, idx[0]).trim());
    idx.forEach((s, i) => parts.push(line.slice(s, idx[i + 1] ?? line.length).trim()));
    return parts;
  }
  // Thiếu dấu: "A Hà Nội B Huế C Đà Nẵng D Cần Thơ" – chỉ tách khi đủ A,B,C theo thứ tự
  const loose = line.match(/^\s*A\s+(.+?)\s+B\s+(.+?)\s+C\s+(.+?)(?:\s+D\s+(.+?))?\s*$/);
  if (loose && /^\s*A\s/.test(line)) {
    return loose.slice(1).filter(Boolean).map((t, i) => `${'ABCD'[i]}. ${t}`);
  }
  return [line];
}

/** Các cách viết được chấp nhận cho một chỗ trống, ngăn bằng dấu "/". */
const alts = (s: string) => s.split(/\s*\/\s*/).map((x) => x.trim()).filter(Boolean);

function stripMarks(s: string) {
  return s.replace(/\*\*/g, '').trim();
}

export interface ParseReport {
  questions: Question[];
  warnings: string[];
}

export function parseFreeText(raw: string): ParseReport {
  const warnings: string[] = [];
  let text = raw.replace(/\r/g, '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n');

  // File Word mẫu: chỉ đọc phần giữa hai dòng đánh dấu; dòng bắt đầu bằng # là ghi chú
  const all = text.split('\n');
  const zs = all.findIndex((l) => ZONE_START.test(stripMarks(l)));
  if (zs >= 0) {
    const ze = all.findIndex((l, i) => i > zs && ZONE_END.test(stripMarks(l)));
    text = all.slice(zs + 1, ze > zs ? ze : all.length).join('\n');
  }
  text = text.split('\n').filter((l) => !/^\s*(?:\*\*)?\s*#/.test(l)).join('\n');

  // Bảng đáp án ở cuối tệp: "Đáp án: 1A 2C 3B" hoặc nhiều dòng "1-A", "Câu 2: C"
  const keyMap = new Map<number, string[]>();
  const keyHeaderIdx = text.split('\n').findIndex((l) => KEY_HEADER.test(l));
  const lines0 = text.split('\n');
  const tailStart = keyHeaderIdx >= 0 ? keyHeaderIdx : Math.max(0, lines0.length - 1);
  const tail = lines0.slice(tailStart).join(' ');
  const pairRe = /(?:câu\s*)?(\d{1,3})\s*[.:\-–)]?\s*([A-F](?:\s*,\s*[A-F])*)(?![a-zà-ỹ])/gi;
  const pairs = [...tail.matchAll(pairRe)];
  if (pairs.length >= 3 || (keyHeaderIdx >= 0 && pairs.length)) {
    pairs.forEach((m) => keyMap.set(Number(m[1]), m[2].toUpperCase().match(/[A-F]/g)!));
    text = lines0.slice(0, keyHeaderIdx >= 0 ? keyHeaderIdx : lines0.length - 1).join('\n');
  }

  const lines = text
    .split('\n')
    .flatMap((l) => (IS_LABEL.test(l) ? [l] : splitInlineOptions(l)))
    .map((l) => l.trim())
    .filter((l) => l && !/^\*\*\s*\*\*$/.test(l));

  type Draft = {
    num?: number; stem: string[]; options: { text: string; correct: boolean; image?: string }[]; answer?: string[]; answerText?: string;
    type?: QuestionType; time?: number; points?: number; explain?: string; distractors?: string[]; video?: string; audio?: string; image?: string;
  };
  const ANS_TEXT = /^\s*(?:\*\*)?\s*(?:đáp\s*án(?:\s*đúng)?|đa|trả\s*lời|answer|gợi\s*ý)\s*(?:\*\*)?\s*[:：]\s*(.+)$/i;
  const drafts: Draft[] = [];
  let cur = null as Draft | null;
  const push = () => {
    if (cur && (cur.stem.join(' ').trim() || cur.options.length)) drafts.push(cur);
  };

  for (const line of lines) {
    if (cur) {
      // Nhãn của file mẫu
      const plain = stripMarks(line);
      let m: RegExpMatchArray | null;
      if ((m = plain.match(L_TYPE))) { cur.type = typeFromLabel(m[1]) ?? cur.type; continue; }
      if ((m = plain.match(L_TIME))) { cur.time = Math.min(600, Math.max(5, Number(m[1]))); continue; }
      if ((m = plain.match(L_POINTS))) { cur.points = Math.min(100000, Math.max(0, Number(m[1]))); continue; }
      if ((m = plain.match(L_EXPLAIN))) { cur.explain = m[1].trim(); continue; }
      if ((m = plain.match(L_DISTRACT))) { cur.distractors = m[1].split(/\s*[;,|]\s*/).map((x) => x.trim()).filter(Boolean); continue; }
      if ((m = plain.match(L_VIDEO))) { cur.video = m[1]; continue; }
      if ((m = plain.match(L_AUDIO))) { cur.audio = m[1]; continue; }
      if ((m = plain.match(L_IMAGE))) { cur.image = m[1]; continue; }
      if ((m = plain.match(L_IMG_TOKEN))) {
        const url = IMG_PREFIX + m[1];
        if (cur.options.length) cur.options[cur.options.length - 1].image = url; // ảnh ngay dưới phương án
        else cur.image = url; // ảnh ngay dưới câu hỏi
        continue;
      }
    } else if (L_IMG_TOKEN.test(stripMarks(line))) continue;
    const ans = line.match(ANS_LINE);
    const ansText = line.match(ANS_TEXT);
    if (cur && cur.options.length === 0 && ansText && !/^[A-F](\s*[,;]\s*[A-F])*\s*$/i.test(stripMarks(ansText[1]))) {
      cur.answerText = stripMarks(ansText[1]); // câu không có phương án: đáp án dạng chữ
      continue;
    }
    if (ans && cur && cur.options.length) {
      cur.answer = ans[1].toUpperCase().match(/[A-F]/g)!;
      continue;
    }
    if (ans && cur) continue; // "Đáp án: B" nhưng câu chưa có phương án nào → bỏ qua
    const c: Draft | null = cur;
    const qm: RegExpMatchArray | null = line.match(Q_START) || (!(c && c.options.length === 0 && c.stem.length === 0) ? line.match(NUM_START) : null);
    if (qm) {
      push();
      cur = { num: Number(qm[1]), stem: qm[2] ? [qm[2]] : [], options: [] };
      continue;
    }
    const om = line.match(OPT);
    if (om && cur) {
      const body = om[3];
      const correct =
        !!om[1] ||
        /^\*\*.*\*\*$/.test(body.trim()) ||
        /\*\*/.test(line.slice(0, 4)) ||
        /\((?:đúng|đ|x|correct)\)\s*$/i.test(body) ||
        /[✓✔]\s*$/.test(body);
      cur.options.push({ text: stripMarks(body.replace(/\((?:đúng|đ|x|correct)\)\s*$/i, '').replace(/[✓✔]\s*$/, '')), correct });
      continue;
    }
    // Dòng thường
    if (!cur) {
      cur = { stem: [line], options: [] };
    } else if (cur.options.length >= 2 && !/^[a-zà-ỹ,;)]/.test(line)) {
      // Không đánh số: dòng mới sau các phương án -> câu hỏi mới
      push();
      cur = { stem: [line], options: [] };
    } else if (cur.options.length) {
      // Dòng bị ngắt giữa phương án -> nối vào phương án cuối
      cur.options[cur.options.length - 1].text += ' ' + stripMarks(line);
    } else {
      cur.stem.push(line); // ghép các dòng bị ngắt sai giữa câu dẫn
    }
  }
  push();

  /** Áp các nhãn chung (thời gian, điểm, giải thích, hình, video, âm thanh) lên câu hỏi. */
  const finish = (q: Question, d: Draft, num: number): Question => {
    if (d.time) q.time_limit_seconds = d.time;
    if (d.points !== undefined) q.points = d.points;
    if (d.explain) q.explanation = q.explanation ? `${q.explanation} ${d.explain}` : d.explain;
    if (d.image) q.stem.image_url = d.image;
    if (d.audio) q.stem.audio_url = d.audio;
    if (d.video) {
      const v = parseVideoUrl(d.video);
      if (v) q.stem.video = { source_type: 'internet_url', ...v };
      else warnings.push(`Câu ${num}: không nhận ra link video "${d.video}".`);
    }
    return q;
  };

  const questions: Question[] = drafts.map((d, i) => finish(build(d, i), d, d.num ?? i + 1));

  function build(d: Draft, i: number): Question {
    const num = d.num ?? i + 1;
    const stem = d.stem.join(' ').replace(/\s+/g, ' ').trim();
    const stemClean = stripMarks(stem);
    const letters = d.answer ?? keyMap.get(num);
    const opts = d.options.map((o, k) => ({ ...o, correct: letters ? letters.includes('ABCDEF'[k]) : o.correct }));
    const isTF = opts.length === 2 && opts.every((o) => /^(đúng|sai|true|false)$/i.test(o.text.trim()));
    // Sắp xếp: các phương án được gõ theo ĐÚNG thứ tự
    if (d.type === 'reorder' && opts.length >= 2) {
      const q = newQuestion('reorder');
      q.stem.text = stemClean;
      q.options = opts.slice(0, 6).map((o, k) => opt(o.text, { order_index: k, image_url: o.image }));
      return q;
    }
    // Nối cột: mỗi phương án là một cặp "vế trái = vế phải"
    const pairable = opts.length >= 2 && opts.every((o) => PAIR_SEP.test(o.text));
    if (pairable && (d.type === 'matching' || (!d.type && !letters && !opts.some((o) => o.correct)))) {
      const q = newQuestion('matching');
      q.stem.text = stemClean;
      const pairs = opts.slice(0, 6).map((o) => {
        const [left, ...rest] = o.text.split(PAIR_SEP);
        return { pid: uid('p'), left: left.trim(), right: rest.join(' = ').trim() };
      });
      q.options = [
        ...pairs.map((x) => opt(x.left, { side: 'left', match_pair_id: x.pid })),
        ...pairs.map((x) => opt(x.right, { side: 'right', match_pair_id: x.pid })),
      ];
      return q;
    }
    if (d.type === 'matching') warnings.push(`Câu ${num}: nối cột cần mỗi dòng dạng "A. vế trái = vế phải".`);
    if (opts.length === 0) {
      const answers = (d.answerText ?? '').split(/\s*[;|]\s*/).map((x) => x.trim()).filter(Boolean);
      // Đúng/Sai không cần gõ phương án: "Đáp án: Đúng" hoặc "Đáp án: Sai"
      const tf = /^(đúng|sai|true|false)$/i.exec((d.answerText ?? '').trim());
      const blankRe = /_{3,}|\.{4,}|…{2,}/;
      if ((d.type === 'true_false' || (!d.type && tf && !blankRe.test(stemClean)))) {
        const q = newQuestion('true_false');
        q.stem.text = stemClean;
        const yes = !!tf && /^(đúng|true)$/i.test(tf[1]);
        q.options = [opt('Đúng', { is_correct: !!tf && yes }), opt('Sai', { is_correct: !!tf && !yes })];
        if (!tf) {
          q.needs_review = true;
          warnings.push(`Câu ${num}: Đúng/Sai – thiếu dòng "Đáp án: Đúng" hoặc "Đáp án: Sai".`);
        }
        return q;
      }
      if (blankRe.test(stemClean) && d.type !== 'oral') {
        // Có chỗ trống ___ / .... → Điền chỗ trống
        const q = newQuestion('fill_blank');
        let n = 0;
        q.stem.text = stemClean.replace(/_{3,}|\.{4,}|…{2,}/g, () => `[blank_${++n}]`);
        q.blanks = Array.from({ length: n }, (_, j) => ({
          blank_id: `blank_${j + 1}`,
          accepted: n === 1 ? answers.flatMap(alts) : answers[j] ? alts(answers[j]) : [],
          match_rule: 'ignore_case' as const,
        }));
        if (d.distractors?.length) q.distractors = d.distractors;
        q.needs_review = q.blanks.some((b) => !b.accepted.length);
        if (q.needs_review) warnings.push(`Câu ${num}: điền chỗ trống – cần nhập từ đúng.`);
        return q;
      }
      // Không có phương án, không có chỗ trống → Trả lời miệng (giáo viên chấm)
      const q = newQuestion('oral');
      q.stem.text = stemClean;
      if (d.answerText) q.explanation = d.answerText;
      return q;
    }
    const nCorrect = opts.filter((o) => o.correct).length;
    const q = newQuestion(isTF ? 'true_false' : nCorrect > 1 || d.type === 'multiple_select' ? 'multiple_select' : 'single_choice');
    q.stem.text = stemClean;
    q.options = opts.slice(0, 6).map((o) => opt(o.text, { is_correct: o.correct, image_url: o.image }));
    if (opts.length > 6) warnings.push(`Câu ${num}: có hơn 6 phương án, đã giữ 6 phương án đầu.`);
    if (opts.length === 1) warnings.push(`Câu ${num}: chỉ tìm thấy 1 phương án.`);
    if (nCorrect === 0) {
      q.needs_review = true;
      warnings.push(`Câu ${num}: không tìm thấy đáp án đúng trong tệp.`);
    }
    q.id = uid('q');
    return q;
  }
  return { questions, warnings };
}

/** Điểm vào chung: thử dạng bảng trước (CSV/Excel), sau đó văn bản tự do. */
export function parseQuestions(text: string, fileName = ''): ParseReport {
  if (/\.(csv|xlsx)$/i.test(fileName) || /^[^\n]*\t[^\n]*\t/.test(text)) {
    const t = parseTable(text);
    if (t) return { questions: t, warnings: t.filter((q) => q.needs_review).map((_, i) => `Dòng ${i + 1}: thiếu cột đáp án.`) };
  }
  return parseFreeText(text);
}
