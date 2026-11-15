// Khóa API Google Gemini của giáo viên: kiểm tra khóa, tự chọn mô hình còn dùng được, đổi lỗi của Google sang lời dễ hiểu.
// Khóa chỉ gửi thẳng tới máy chủ Gemini của Google (generativelanguage.googleapis.com), không đi qua nơi nào khác.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type KeyStatus = 'ok' | 'invalid' | 'quota' | 'blocked' | 'network' | 'busy' | 'error';
export const BUSY_MESSAGE = 'Máy chủ Gemini của Google đang quá tải. Khóa API của thầy cô vẫn dùng được: hãy chờ khoảng một phút rồi bấm lại, hoặc dùng cách "Dùng Gemini trên trình duyệt" ngay bên dưới.';
export interface KeyCheck { status: KeyStatus; message: string; model?: string }

interface GError { error?: { code?: number; message?: string; status?: string; details?: { reason?: string }[] } }

/** Đổi phản hồi lỗi của Gemini sang trạng thái + lời nhắn tiếng Việt. */
export function explainGeminiError(httpStatus: number, body: GError | null): KeyCheck {
  const e = body?.error ?? {};
  const msg = e.message ?? '';
  const reason = (e.details ?? []).map((d) => d.reason).filter(Boolean).join(' ');
  if (httpStatus === 429 || e.status === 'RESOURCE_EXHAUSTED' || /quota|exceeded|exhausted|billing/i.test(msg))
    return { status: 'quota', message: 'Khóa API đã hết hạn mức sử dụng (hết tín dụng miễn phí). Hãy đổi khóa API khác, hoặc chờ hạn mức được cấp lại (khoảng 1 phút với giới hạn theo phút, sang ngày hôm sau với giới hạn theo ngày).' };
  if (httpStatus === 400 && /API key not valid|API_KEY_INVALID|api key/i.test(msg + ' ' + reason))
    return { status: 'invalid', message: 'Khóa API không hợp lệ. Hãy kiểm tra đã chép đủ cả khóa (thường bắt đầu bằng "AIza…"), không thừa dấu cách, rồi lưu lại.' };
  // Google quá tải hoặc trục trặc tạm thời (không phải lỗi của khóa): thử lại hoặc đổi mô hình là được
  if (httpStatus >= 500 || e.status === 'UNAVAILABLE' || e.status === 'INTERNAL' || /overloaded|high demand|unavailable|try again later/i.test(msg))
    return { status: 'busy', message: BUSY_MESSAGE };
  if (httpStatus === 401 || httpStatus === 403)
    return { status: 'blocked', message: 'Khóa API bị từ chối: khóa đã bị xóa, bị giới hạn nơi được dùng, hoặc tài khoản Google chưa bật Gemini API. Hãy tạo khóa mới tại aistudio.google.com.' };
  return { status: 'error', message: `Gemini báo lỗi (${httpStatus}): ${msg.slice(0, 200) || 'không rõ nguyên nhân'}` };
}

export interface ModelInfo { name: string; supportedGenerationMethods?: string[] }

/** Chọn mô hình soạn câu hỏi: ưu tiên dòng "flash" bản chính thức, số phiên bản cao nhất. */
export function pickModel(models: ModelInfo[]): string | undefined {
  return rankModels(models)[0];
}

/** Các mô hình dùng được, xếp từ nên dùng nhất (để đổi sang mô hình khác khi mô hình đang dùng quá tải). */
export function rankModels(models: ModelInfo[]): string[] {
  const usable = models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-/.test(n) && !/(image|tts|audio|live|embedding|vision|thinking|native|robotics|computer-use)/i.test(n));
  const ver = (n: string) => Number((n.match(/^gemini-(\d+(?:\.\d+)?)/) ?? [])[1] ?? 0);
  const kind = (n: string) =>
    /^gemini-\d+(\.\d+)?-flash$/.test(n) ? 4000
      : /flash-latest$/.test(n) ? 3500
      : /flash/.test(n) && !/lite|preview|exp/.test(n) ? 3000
      : /flash-lite/.test(n) && !/preview|exp/.test(n) ? 2000
      : /flash/.test(n) ? 1000
      : /pro/.test(n) && !/preview|exp/.test(n) ? 500 : 0;
  const rank = (n: string) => kind(n) + ver(n) * 10;
  return usable.sort((a, b) => rank(b) - rank(a));
}

type Reply = { ok: boolean; status: number; body: GError & { models?: ModelInfo[]; candidates?: { content?: { parts?: { text?: string }[] } }[] } | null };
async function call(url: string, key: string, init?: RequestInit): Promise<Reply> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key } });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}
const fail = (r: Reply) => Object.assign(new Error('gemini'), { check: explainGeminiError(r.status, r.body), httpStatus: r.status });

/** Danh sách mô hình khóa này dùng được (cũng là cách kiểm tra khóa có hợp lệ không). */
export async function listModels(key: string): Promise<ModelInfo[]> {
  const r = await call(`${BASE}/models?pageSize=200`, key);
  if (!r.ok) throw fail(r);
  return r.body?.models ?? [];
}

/** Gọi sinh nội dung. Ném lỗi kèm `check` (trạng thái + lời nhắn) và `httpStatus` khi Gemini từ chối. */
export async function generate(key: string, model: string, body: unknown): Promise<string> {
  const r = await call(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, key, { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) throw fail(r);
  return (r.body?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

/**
 * Gọi sinh nội dung và nhận câu trả lời DẦN DẦN (server-sent events). `onText` nhận toàn bộ phần chữ đã có tới lúc đó.
 * Ném lỗi kèm `check` và `httpStatus` như `generate`; `signal` để dừng giữa chừng (ném AbortError).
 */
export async function generateStream(key: string, model: string, body: unknown, onText: (acc: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw fail({ ok: false, status: res.status, body: await res.json().catch(() => null) });
  if (!res.body) {
    // Trình duyệt không cho đọc dần: đọc một lần
    const text = parseSse(await res.text());
    onText(text);
    return text;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', acc = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const cut = buf.lastIndexOf('\n');
    if (cut < 0) continue;
    const piece = parseSse(buf.slice(0, cut));
    buf = buf.slice(cut + 1);
    if (piece) {
      acc += piece;
      onText(acc);
    }
  }
  const rest = parseSse(buf + dec.decode());
  if (rest) {
    acc += rest;
    onText(acc);
  }
  return acc;
}

/** Ghép phần chữ trong các dòng "data: {...}" của một đoạn SSE. */
export function parseSse(chunk: string): string {
  let out = '';
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    try {
      const j = JSON.parse(line.slice(5).trim()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      out += (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    } catch { /* dòng chưa trọn vẹn hoặc "[DONE]" */ }
  }
  return out;
}

/** Kiểm tra khóa: hợp lệ không, còn hạn mức không; trả về mô hình nên dùng. */
export async function verifyKey(rawKey: string): Promise<KeyCheck> {
  const key = rawKey.trim();
  if (!key) return { status: 'invalid', message: 'Chưa nhập khóa API.' };
  if (/\s/.test(key) || key.length < 20) return { status: 'invalid', message: 'Khóa API không đúng dạng: khóa Gemini là một chuỗi dài liền nhau, thường bắt đầu bằng "AIza…".' };
  try {
    const model = pickModel(await listModels(key));
    if (!model) return { status: 'error', message: 'Khóa hợp lệ nhưng không thấy mô hình Gemini nào dùng được cho tài khoản này.' };
    // Gọi thử một câu thật ngắn để biết khóa còn hạn mức
    await generate(key, model, { contents: [{ role: 'user', parts: [{ text: 'Trả lời đúng một chữ: ok' }] }], generationConfig: { maxOutputTokens: 8, temperature: 0 } });
    return { status: 'ok', message: `Khóa hợp lệ, còn hạn mức. Mô hình dùng để soạn câu hỏi: ${model}.`, model };
  } catch (e) {
    const check = (e as { check?: KeyCheck }).check;
    if (check) return check;
    return { status: 'network', message: 'Không kết nối được tới Google Gemini. Hãy kiểm tra mạng Internet rồi bấm kiểm tra lại.' };
  }
}
