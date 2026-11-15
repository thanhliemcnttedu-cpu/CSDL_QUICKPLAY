// Nén lại ảnh và âm thanh ĐÃ tải lên Google Drive từ trước (trước khi có chế độ nén mạnh) để tiết kiệm dung lượng.
// Cách làm: đọc từng tệp → nén trên trình duyệt (ảnh → WebP, âm thanh → Opus) → nếu nhẹ hơn rõ rệt thì tải bản nén lên,
// đổi link trong bộ câu hỏi và kết quả buổi học, rồi chuyển tệp gốc vào Thùng rác của Drive (khôi phục được trong 30 ngày).
import { call } from './api';
import { mediaIdsIn, replaceMediaLinks, type Progress } from './backup';
import type { Quiz } from './types';

export interface OptimizeResult { checked: number; shrunk: number; before: number; after: number; failed: number }

const MIN_GAIN = 0.8; // bản nén phải nhỏ hơn 80% bản gốc
const MIN_SAVED = 15 * 1024;

async function allQuizzes(say: Progress): Promise<Quiz[]> {
  const out: Quiz[] = [];
  for (let page = 0; ; page++) {
    const r = await call<{ total: number; page_size: number; items: Quiz[] }>('exportQuizzes', { page });
    out.push(...r.items);
    say(`Đang đọc bộ câu hỏi ${Math.min(out.length, r.total)}/${r.total}…`, 3);
    if ((page + 1) * r.page_size >= r.total) break;
  }
  return out;
}

export async function optimizeDriveMedia(say: Progress): Promise<OptimizeResult> {
  const { hashBlob, shrinkMedia } = await import('./media');
  const quizzes = await allQuizzes(say);
  const ids = mediaIdsIn(JSON.stringify(quizzes));
  const res: OptimizeResult = { checked: 0, shrunk: 0, before: 0, after: 0, failed: 0 };
  const map: Record<string, string> = {};
  let queue = ids.slice();
  while (queue.length) {
    const batch = queue.slice(0, 10);
    queue = queue.slice(10);
    const files = await call<{ id: string; mime?: string; name?: string; base64?: string; later?: boolean }[]>('exportMedia', { ids: batch });
    for (const m of files) {
      if (m.later) { queue.push(m.id); continue; }
      res.checked++;
      if (!m.base64 || !m.mime) { res.failed++; continue; }
      try {
        const bin = atob(m.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const orig = new Blob([bytes], { type: m.mime });
        const small = await shrinkMedia(orig);
        if (small === orig || small.size > orig.size * MIN_GAIN || orig.size - small.size < MIN_SAVED) continue;
        const hash = small.type.startsWith('image/') ? await hashBlob(small) : null;
        const dataUrl = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.onerror = () => no(r.error); r.readAsDataURL(small); });
        const ext = (small.type.split('/')[1] || 'bin').split(';')[0];
        const name = (m.name || m.id).replace(/^\d+_/, '').replace(/\.\w+$/, '') + '.' + ext;
        const up = await call<{ url: string }>('uploadMedia', { name, mime: small.type, base64: dataUrl, hash: hash ?? undefined });
        map[m.id] = up.url;
        res.shrunk++;
        res.before += orig.size;
        res.after += small.size;
      } catch (e) {
        if (/đã đầy/i.test((e as Error).message)) throw new Error('Google Drive đã đầy nên chưa tải được bản nén lên. Hãy xóa bớt vài tệp lớn trong Drive (hoặc dọn Thùng rác) rồi chạy lại.');
        res.failed++;
      }
    }
    say(`Đã xem ${res.checked}/${ids.length} tệp · nén được ${res.shrunk} tệp`, 5 + Math.round((80 * res.checked) / Math.max(1, ids.length)));
  }
  if (!res.shrunk) return res;

  // đổi link trong các bộ câu hỏi có dùng tệp đã nén
  say('Đang cập nhật link trong các bộ câu hỏi…', 88);
  const changed = quizzes.filter((q) => mediaIdsIn(JSON.stringify(q)).some((id) => map[id])).map((q) => JSON.parse(replaceMediaLinks(JSON.stringify(q), map)) as Quiz);
  for (let i = 0; i < changed.length; i += 20) {
    await call('restoreData', { quizzes: changed.slice(i, i + 20), rebuild_index: i + 20 >= changed.length });
  }
  // đổi link trong kết quả buổi học, rồi đưa tệp gốc vào Thùng rác
  say('Đang dọn tệp gốc vào Thùng rác…', 95);
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i += 50) {
    const part: Record<string, string> = {};
    keys.slice(i, i + 50).forEach((k) => (part[k] = map[k]));
    await call('swapMedia', { map: part, trash: true });
  }
  say('Xong.', 100);
  return res;
}
