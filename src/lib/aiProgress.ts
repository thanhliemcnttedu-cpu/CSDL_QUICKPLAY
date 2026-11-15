// AI soạn / bóc tách câu hỏi CÓ TIẾN ĐỘ: xin AI theo từng đợt nhỏ và nhận câu trả lời dần dần (streaming),
// nhờ đó biết đang soạn câu thứ mấy, dạng nào, bao nhiêu %, còn khoảng bao lâu; bấm Dừng thì giữ các câu đã xong.
import type { Question, QuestionType } from './types';
import { api, ApiError } from './api';
import { loadSettings, saveSettings } from './settings';
import { generateStream, listModels, pickModel, type KeyCheck } from './gemini';
import { aiItemsToQuestions, buildPrompt, extractJsonArray, type AiMode, type Level } from './ai';
import { COMPOSER_TYPES } from './factory';

export const BATCH_SIZE = 10; // số câu xin AI mỗi đợt (đợt nhỏ thì ít bị cắt giữa chừng và báo tiến độ mịn hơn)

export interface AiProgress {
  done: number; // số câu đã soạn xong (trọn vẹn)
  total: number; // tổng số câu cần soạn (0 = chưa biết, khi bóc tách đề có sẵn)
  current: number; // đang soạn câu thứ mấy (done + 1), 0 khi đang chờ AI bắt đầu
  currentType?: QuestionType; // dạng của câu đang soạn (nếu AI đã ghi)
  byType: Partial<Record<QuestionType, number>>; // số câu đã xong theo từng dạng
  pct: number; // 0–100
  elapsedMs: number;
  etaMs?: number; // ước lượng thời gian còn lại
  batch: number; // đợt đang chạy (từ 1)
  batches: number;
}

export interface AiRunOptions {
  mode: AiMode;
  source: string;
  count: number;
  types: QuestionType[];
  level: Level;
  grade?: string;
  meta?: { subject?: string; lesson?: string };
  onProgress?: (p: AiProgress) => void;
  signal?: AbortSignal;
}
export interface AiRunResult { questions: Question[]; stopped: boolean; warning?: string }

/** Các phần tử TRỌN VẸN đã có trong một mảng JSON đang được gửi dở, và phần đuôi chưa xong. */
export function scanItems(text: string): { items: unknown[]; tail: string } {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('[');
  if (start < 0) return { items: [], tail: cleaned };
  const items: unknown[] = [];
  let depth = 0, inStr = false, esc = false, objStart = -1, lastEnd = start;
  for (let i = start + 1; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') {
      if (depth === 0 && ch === '{') objStart = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0 && ch === '}' && objStart >= 0) {
        try { items.push(JSON.parse(cleaned.slice(objStart, i + 1))); } catch { /* bỏ phần tử hỏng */ }
        lastEnd = i;
        objStart = -1;
      }
      if (depth < 0) break; // hết mảng
    }
  }
  return { items, tail: cleaned.slice(lastEnd + 1) };
}

const typeOf = (x: unknown): QuestionType | undefined => {
  const t = (x as { type?: string } | null)?.type;
  return t === 'drag_drop' ? 'fill_blank' : COMPOSER_TYPES.includes(t as QuestionType) ? (t as QuestionType) : undefined;
};

/** Gọi Gemini trực tiếp có nhận dần; mô hình đã lưu bị ngừng thì tự chọn mô hình khác rồi gọi lại một lần. */
async function streamDirect(prompt: string, system: string, onText: (acc: string) => void, signal?: AbortSignal): Promise<string> {
  const s = loadSettings();
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
  };
  const explain = (e: unknown) => new ApiError((e as { check?: KeyCheck }).check?.message ?? 'Không kết nối được tới Google Gemini. Hãy kiểm tra mạng Internet.');
  try {
    return await generateStream(s.geminiKey, s.geminiModel || 'gemini-flash-latest', body, onText, signal);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    const http = (e as { httpStatus?: number }).httpStatus;
    const st = (e as { check?: KeyCheck }).check?.status;
    if (http === 404 || (http === 400 && st === 'error')) {
      try {
        const model = pickModel(await listModels(s.geminiKey));
        if (model && model !== s.geminiModel) {
          saveSettings({ ...loadSettings(), geminiModel: model });
          return await generateStream(s.geminiKey, model, body, onText, signal);
        }
      } catch (e2) {
        if ((e2 as Error).name === 'AbortError') throw e2;
        throw explain(e2);
      }
    }
    throw explain(e);
  }
}

/** Một lượt gọi AI: có khóa trong Cài đặt thì nhận dần; không thì nhờ Apps Script (chỉ biết kết quả khi xong cả đợt). */
async function callOnce(prompt: string, system: string, onText: (acc: string) => void, signal?: AbortSignal): Promise<string> {
  if (loadSettings().geminiKey) return streamDirect(prompt, system, onText, signal);
  try {
    const text = (await api.aiGenerate(prompt, system)).text;
    onText(text);
    return text;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'AI_LOCAL' || /GEMINI_API_KEY/.test(msg)) throw new ApiError('Chưa có khóa API Gemini. Vào Cài đặt → Trí tuệ nhân tạo, dán khóa rồi bấm Lưu khóa.');
    throw e;
  }
}

export async function runAiWithProgress(o: AiRunOptions): Promise<AiRunResult> {
  const started = Date.now();
  const generate = o.mode === 'generate';
  const total = generate ? Math.max(1, Math.round(o.count)) : 0;
  const batches = generate ? Math.ceil(total / BATCH_SIZE) : 1;
  const all: Question[] = [];
  let warning: string | undefined;
  let stopped = false;

  const report = (batch: number, partial: unknown[], tail: string) => {
    const doneItems = partial.map(typeOf);
    const done = Math.min(total || Infinity, all.length + partial.length);
    const byType: AiProgress['byType'] = {};
    for (const q of all) byType[q.type] = (byType[q.type] ?? 0) + 1;
    for (const t of doneItems) if (t) byType[t] = (byType[t] ?? 0) + 1;
    const m = tail.match(/"type"\s*:\s*"([a-z_]+)"/);
    const working = total ? done < total : true;
    const elapsedMs = Date.now() - started;
    // Câu đang soạn dở tính là nửa câu để thanh tiến độ không đứng im
    const frac = total ? Math.min(1, (done + (working && tail.includes('{') ? 0.5 : 0)) / total) : 0;
    o.onProgress?.({
      done, total, current: working ? done + 1 : done, currentType: m ? typeOf({ type: m[1] }) : undefined, byType,
      pct: Math.round(frac * 100), elapsedMs, etaMs: total && done >= 1 ? Math.max(0, Math.round((elapsedMs / (done + (frac * total - done))) * (total - done))) : undefined,
      batch, batches,
    });
  };

  for (let b = 0; b < batches; b++) {
    const want = generate ? Math.min(BATCH_SIZE, total - all.length) : o.count;
    if (generate && want <= 0) break;
    const p = buildPrompt(o.mode, o.source, { count: want, types: o.types, level: o.level, grade: o.grade });
    // Các đợt sau: nhắc AI không lặp lại câu đã soạn
    const prev = all.slice(-60).map((q) => '- ' + q.stem.text.replace(/<[^>]*>/g, '').slice(0, 90)).join('\n');
    const prompt = generate && prev ? `${p.prompt}\n\nCÁC CÂU ĐÃ SOẠN (KHÔNG soạn lại, không soạn câu trùng ý):\n${prev}` : p.prompt;
    let acc = '';
    report(b + 1, [], '');
    try {
      const text = await callOnce(prompt, p.system, (t) => {
        acc = t;
        const s = scanItems(t);
        report(b + 1, s.items, s.tail);
      }, o.signal);
      const qs = aiItemsToQuestions(extractJsonArray(text), o.meta);
      all.push(...(generate ? qs.slice(0, want) : qs));
    } catch (e) {
      // Giữ các câu đã trọn vẹn của đợt đang chạy dở
      const kept = aiItemsToQuestions(scanItems(acc).items, o.meta);
      all.push(...(generate ? kept.slice(0, want) : kept));
      if ((e as Error).name === 'AbortError') { stopped = true; break; }
      if (!all.length) throw e;
      warning = `Mới soạn được ${all.length}${total ? `/${total}` : ''} câu thì gặp lỗi: ${(e as Error).message}`;
      break;
    }
    report(b + 1, [], '');
    if (o.signal?.aborted) { stopped = true; break; }
  }
  return { questions: all, stopped, warning };
}
