// Mô-đun AI sinh đề (SRS mục 4.2): Chế độ 1 – sinh câu hỏi mới; Chế độ 2 – trích nguyên văn.
// Chế độ Drive: gọi qua Apps Script (khóa Gemini cất trong Script Properties, học sinh không thấy).
// Chế độ cục bộ: gọi thẳng Gemini bằng khóa giáo viên dán trong Cài đặt.
import type { Question, QuestionType } from './types';
import { api, ApiError } from './api';
import { loadSettings } from './settings';
import { COMPOSER_TYPES, newQuestion, opt, TYPE_LABELS } from './factory';
import { plainToHtml, uid } from './util';

export type AiMode = 'generate' | 'extract';
export type Level = 'nhan_biet' | 'thong_hieu' | 'van_dung' | 'van_dung_cao';
export const LEVEL_LABELS: Record<Level, string> = {
  nhan_biet: 'Nhận biết',
  thong_hieu: 'Thông hiểu',
  van_dung: 'Vận dụng',
  van_dung_cao: 'Vận dụng cao',
};

const SCHEMA = `Trả về DUY NHẤT một mảng JSON (không markdown, không giải thích). Chỉ dùng 7 dạng sau:
- "single_choice"  (Một đáp án): "options": 2–6 phương án, đúng 1 phương án "correct": true
- "multiple_select" (Nhiều đáp án): "options": 3–6 phương án, từ 2 phương án đúng trở lên
- "true_false"     (Đúng / Sai): "options": [{"text":"Đúng","correct":...},{"text":"Sai","correct":...}]
- "fill_blank"     (Điền chỗ trống): câu dẫn ghi chỗ trống là [blank_1], [blank_2]…; "blanks": [{"id":"blank_1","accepted":["từ đúng","cách viết khác"]}]; "distractors": ["từ gây nhiễu", ...] (2–4 từ sai cùng loại, có thể để trống)
- "reorder"        (Sắp xếp): "steps": ["bước 1", "bước 2", ...] theo ĐÚNG thứ tự
- "matching"       (Nối cột): "pairs": [{"left":"...","right":"..."}] (3–6 cặp)
- "oral"           (Trả lời miệng): câu hỏi mở để học sinh trả lời bằng lời; "answer": "gợi ý đáp án cho giáo viên"
Mỗi phần tử: {"type": "...", "question": "...", <trường riêng của dạng>, "time": 30, "explanation": "lời giải ngắn"}
Nếu không xác định được đáp án đúng, đặt mọi "correct": false (hoặc "accepted": []).`;

export function buildPrompt(mode: AiMode, source: string, opts: { count: number; types: QuestionType[]; level: Level; grade?: string }) {
  if (mode === 'extract') {
    return {
      system:
        'Bạn là trợ lý số hóa đề kiểm tra cho giáo viên Việt Nam. Nhiệm vụ: TRÍCH XUẤT NGUYÊN VĂN 100% các câu hỏi có trong tài liệu. ' +
        'Không sửa câu chữ, không thêm hay bớt câu hỏi, không tự sáng tác phương án. Chỉ được: tách đúng ranh giới câu dẫn/phương án, ' +
        'bỏ nhãn A./B./C./D. và số thứ tự, ghép các dòng bị ngắt sai, ánh xạ đáp án đúng (kể cả khi đáp án nằm ở bảng đáp án cuối tài liệu, ' +
        'hoặc được đánh dấu bằng **chữ đậm**, gạch chân, dấu *).',
      prompt: `${SCHEMA}\n\nTÀI LIỆU:\n"""\n${source.slice(0, 60000)}\n"""`,
    };
  }
  return {
    system:
      'Bạn là giáo viên giỏi, soạn câu hỏi kiểm tra đánh giá theo chương trình GDPT 2018 cho học sinh tiểu học và THCS. ' +
      'Câu hỏi bám sát kiến thức trong tài liệu, ngôn ngữ trong sáng phù hợp lứa tuổi, phương án nhiễu hợp lý (cùng loại, độ dài tương đương), ' +
      'không có hai đáp án cùng đúng ở dạng một đáp án, không dùng "Tất cả các đáp án trên".',
    prompt:
      `Soạn ${opts.count} câu hỏi MỚI ở mức độ "${LEVEL_LABELS[opts.level]}"${opts.grade ? ` cho học sinh ${opts.grade}` : ''}, ` +
      `phân bổ đều các dạng: ${opts.types.map((t) => `${t} (${TYPE_LABELS[t]})`).join(', ')}. Xáo trộn vị trí đáp án đúng.\n\n${SCHEMA}\n\nTÀI LIỆU NGUỒN:\n"""\n${source.slice(0, 60000)}\n"""`,
  };
}

async function callGeminiDirect(prompt: string, system: string): Promise<string> {
  const s = loadSettings();
  if (!s.geminiKey)
    throw new ApiError('Chưa có khóa Gemini. Vào Cài đặt để dán khóa API miễn phí lấy tại aistudio.google.com.');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.geminiModel || 'gemini-2.0-flash')}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
      }),
    },
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError('Gemini báo lỗi: ' + (j?.error?.message ?? res.status));
  return (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
}

export async function runAi(prompt: string, system: string): Promise<string> {
  try {
    return (await api.aiGenerate(prompt, system)).text;
  } catch (e) {
    if ((e as Error).message === 'AI_LOCAL') return callGeminiDirect(prompt, system);
    throw e;
  }
}

/** Lấy mảng JSON ra khỏi phản hồi (kể cả khi AI bọc trong ```json). */
export function extractJsonArray(text: string): unknown[] {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('AI không trả về danh sách câu hỏi hợp lệ. Hãy thử lại.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

type AiItem = {
  type?: string;
  question?: string;
  options?: { text: string; correct?: boolean }[];
  blanks?: { id?: string; accepted?: string[] }[];
  cards?: { text: string; zone?: string | null }[];
  distractors?: string[];
  steps?: string[];
  pairs?: { left: string; right: string }[];
  answer?: string;
  time?: number;
  explanation?: string;
};

export function aiItemsToQuestions(items: unknown[], meta: { subject?: string; lesson?: string } = {}): Question[] {
  const out: Question[] = [];
  for (const raw of items as AiItem[]) {
    let type = (raw.type ?? 'single_choice') as QuestionType;
    if (type === 'drag_drop') {
      // dạng cũ → Điền chỗ trống có kho từ
      type = 'fill_blank';
      const zones = [...String(raw.question ?? '').matchAll(/\[(blank_\d+)\]/g)].map((m) => m[1]);
      raw.blanks = zones.map((z) => ({ id: z, accepted: (raw.cards ?? []).filter((c) => c.zone === z).map((c) => String(c.text)) }));
      raw.distractors = (raw.cards ?? []).filter((c) => !c.zone).map((c) => String(c.text));
    }
    const q = newQuestion(TYPES.includes(type) ? type : 'single_choice');
    q.stem.text = plainToHtml(String(raw.question ?? '').trim());
    if (meta.subject) q.subject = meta.subject;
    if (meta.lesson) q.lesson = meta.lesson;
    if (raw.time && raw.time >= 5 && raw.time <= 300) q.time_limit_seconds = Math.round(raw.time);
    if (raw.explanation) q.explanation = raw.explanation;
    switch (q.type) {
      case 'single_choice':
      case 'multiple_select':
      case 'true_false': {
        const o = (raw.options ?? []).slice(0, 6);
        if (o.length >= 2) q.options = o.map((x) => opt(plainToHtml(String(x.text ?? '')), { is_correct: !!x.correct }));
        const n = q.options.filter((x) => x.is_correct).length;
        if (q.type === 'single_choice' && n > 1) q.type = 'multiple_select';
        q.needs_review = n === 0;
        break;
      }
      case 'fill_blank': {
        q.blanks = (raw.blanks ?? []).map((b, i) => ({
          blank_id: b.id || `blank_${i + 1}`,
          accepted: (b.accepted ?? []).map(String),
          match_rule: 'ignore_case' as const,
        }));
        // chỉ giữ chỗ trống thật sự có trong câu, đánh lại số theo thứ tự xuất hiện
        const order = [...q.stem.text.matchAll(/\[(blank_\d+)\]/g)].map((m) => m[1]);
        const byId = new Map(q.blanks.map((b) => [b.blank_id, b]));
        let n = 0;
        q.stem.text = q.stem.text.replace(/\[blank_\d+\]/g, () => `[blank_${++n}]`);
        q.blanks = order.map((id, i) => ({ ...(byId.get(id) ?? { accepted: [], match_rule: 'ignore_case' as const }), blank_id: `blank_${i + 1}` }));
        const dis = (raw.distractors ?? []).map(String).map((x) => x.trim()).filter(Boolean);
        if (dis.length) q.distractors = dis;
        q.needs_review = !q.blanks.length || q.blanks.some((b) => !b.accepted.length);
        break;
      }
      case 'oral':
        if (raw.answer) q.explanation = String(raw.answer);
        break;
      case 'reorder':
        q.options = (raw.steps ?? []).map((t, i) => opt(plainToHtml(String(t)), { order_index: i }));
        break;
      case 'matching': {
        const pairs = raw.pairs ?? [];
        const ids = pairs.map(() => uid('p'));
        q.options = [
          ...pairs.map((p, i) => opt(plainToHtml(String(p.left)), { side: 'left', match_pair_id: ids[i] })),
          ...pairs.map((p, i) => opt(plainToHtml(String(p.right)), { side: 'right', match_pair_id: ids[i] })),
        ];
        break;
      }
    }
    if (q.stem.text) out.push(q);
  }
  return out;
}

const TYPES: QuestionType[] = COMPOSER_TYPES;
