// Kịch bản đầy đủ của đồng bộ ngoại tuyến: ghi khi mất mạng → có mạng thì đẩy → xung đột tạo bản sao.
// Kho trên máy là bộ nhớ tạm; "Drive" là máy chủ giả trong bộ nhớ.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mem } = vi.hoisted(() => ({ mem: new Map<string, unknown>() }));
vi.mock('./idb', () => ({
  kvGet: async (k: string) => (mem.has(k) ? JSON.parse(JSON.stringify(mem.get(k))) : undefined),
  kvSet: async (k: string, v: unknown) => { mem.set(k, JSON.parse(JSON.stringify(v))); },
  kvDel: async (k: string) => { mem.delete(k); },
  kvKeys: async () => [...mem.keys()],
}));

import { flushAll, pullAll, queueWriteRaw, runSync, type SyncTransport } from './offlineSync';
import type { Quiz } from './types';

class NetworkError extends Error {
  retryable = true;
}

let clock = 0;
const stamp = () => new Date(Date.UTC(2026, 10, 20, 8, 0, 0) + ++clock * 60_000).toISOString();

// Máy chủ Drive giả
let online = true;
const server = new Map<string, Quiz>();
const serverCalls: string[] = [];
const transport: SyncTransport = {
  isRetryable: (e) => e instanceof NetworkError,
  drive: async <T,>(action: string, params: Record<string, unknown> = {}): Promise<T> => {
    if (!online) throw new NetworkError('mất mạng');
    serverCalls.push(action);
    switch (action) {
      case 'getQuiz': {
        const q = server.get(params.id as string);
        if (!q) throw new Error('Không tìm thấy bộ câu hỏi.');
        return JSON.parse(JSON.stringify(q)) as T;
      }
      case 'saveQuiz': {
        const q = { ...(params.quiz as Quiz), updated_at: stamp() };
        server.set(q.id, q);
        return JSON.parse(JSON.stringify(q)) as T;
      }
      case 'deleteQuiz':
        server.delete(params.id as string);
        return { id: params.id } as T;
      case 'listQuizzes':
        return [...server.values()].map((q) => ({ id: q.id, title: q.title, updated_at: q.updated_at })) as T;
      case 'listClasses':
        return [] as T;
      case 'getCatalog':
        return { subjects: [], updated_at: stamp() } as T;
      default:
        throw new Error('Hành động không hỗ trợ trong máy chủ giả: ' + action);
    }
  },
};

function quiz(id: string, title: string, updated_at: string): Quiz {
  return { id, title, questions: [], visibility: 'private', created_at: updated_at, updated_at } as unknown as Quiz;
}

beforeEach(() => {
  mem.clear();
  server.clear();
  serverCalls.length = 0;
  online = true;
});

describe('đồng bộ ngoại tuyến', () => {
  it('khi mất mạng: thay đổi nằm trong hàng đợi, không mất; có mạng lại thì đẩy lên', async () => {
    // Máy đã có bộ đề từ Drive
    server.set('q1', quiz('q1', 'Toán', stamp()));
    await pullAll(transport);
    expect(mem.has('quiz:q1')).toBe(true);

    // Mất mạng: sửa bộ đề trên máy
    online = false;
    mem.set('quiz:q1', quiz('q1', 'Toán (sửa khi mất mạng)', stamp()));
    await queueWriteRaw('quiz:q1', 'put');
    const off = await flushAll(transport);
    expect(off.offline).toBe(true);
    expect(off.pending).toBe(1);
    expect(server.get('q1')?.title).toBe('Toán'); // Drive chưa thay đổi

    // Có mạng: đẩy lên
    online = true;
    const on = await flushAll(transport);
    expect(on.offline).toBe(false);
    expect(on.pending).toBe(0);
    expect(on.conflicts).toBe(0);
    expect(server.get('q1')?.title).toBe('Toán (sửa khi mất mạng)');
  });

  it('xung đột, bản trên máy mới hơn: bản trên máy vào vị trí chính, bản Drive thành bản sao', async () => {
    server.set('q1', quiz('q1', 'Toán', stamp()));
    await pullAll(transport);
    // Máy khác sửa trên Drive sau lần đồng bộ cuối
    server.set('q1', { ...quiz('q1', 'Toán (máy khác sửa)', stamp()) });
    // Máy này sửa offline sau đó (mới hơn)
    online = false;
    mem.set('quiz:q1', quiz('q1', 'Toán (máy này sửa)', stamp()));
    await queueWriteRaw('quiz:q1', 'put');
    online = true;

    const r = await flushAll(transport);
    expect(r.conflicts).toBe(1);
    expect(server.get('q1')?.title).toBe('Toán (máy này sửa)');
    const copies = [...server.values()].filter((q) => q.id !== 'q1');
    expect(copies).toHaveLength(1);
    expect(copies[0].title).toBe('Toán (máy khác sửa) (xung đột – bản trên Drive)');
  });

  it('xung đột, bản trên Drive mới hơn: bản Drive giữ ở vị trí chính, bản trên máy thành bản sao', async () => {
    server.set('q1', quiz('q1', 'Toán', stamp()));
    await pullAll(transport);
    // Máy này sửa offline trước
    online = false;
    mem.set('quiz:q1', quiz('q1', 'Toán (máy này sửa cũ)', stamp()));
    await queueWriteRaw('quiz:q1', 'put');
    // Máy khác sửa sau đó trên Drive (mới hơn)
    online = true;
    server.set('q1', quiz('q1', 'Toán (máy khác sửa mới)', stamp()));

    const r = await flushAll(transport);
    expect(r.conflicts).toBe(1);
    expect(server.get('q1')?.title).toBe('Toán (máy khác sửa mới)');
    expect(mem.get('quiz:q1')).toMatchObject({ title: 'Toán (máy khác sửa mới)' });
    const copies = [...server.values()].filter((q) => q.id !== 'q1');
    expect(copies).toHaveLength(1);
    expect(copies[0].title).toBe('Toán (máy này sửa cũ) (xung đột – bản trên máy)');
  });

  it('xóa khi mất mạng: đẩy lệnh xóa khi có mạng', async () => {
    server.set('q1', quiz('q1', 'Toán', stamp()));
    await pullAll(transport);
    online = false;
    mem.delete('quiz:q1');
    await queueWriteRaw('quiz:q1', 'del');
    online = true;
    await runSync(transport, { pull: false });
    expect(server.has('q1')).toBe(false);
  });

  it('kéo về không ghi đè bản đang chờ đẩy', async () => {
    server.set('q1', quiz('q1', 'Toán', stamp()));
    await pullAll(transport);
    online = false;
    mem.set('quiz:q1', quiz('q1', 'Toán đang sửa dở', stamp()));
    await queueWriteRaw('quiz:q1', 'put');
    online = true;
    await pullAll(transport); // trước khi đẩy: không được chép đè bản đang chờ
    expect(mem.get('quiz:q1')).toMatchObject({ title: 'Toán đang sửa dở' });
  });
});
