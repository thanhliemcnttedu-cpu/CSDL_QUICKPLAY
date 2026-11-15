// Nén âm thanh ngay trên trình duyệt trước khi tải lên Google Drive, để mỗi tệp nhẹ nhất có thể:
//   giải mã tệp gốc (mp3, wav, ogg, webm…) → gộp về 1 kênh (mono), 48 kHz → mã hóa Opus 24 kbit/s → đóng gói WebM.
// Opus 24 kbit/s mono nghe rõ lời nói và nhạc nền; 1 phút chỉ còn khoảng 180 KB (MP3 128 kbit/s: ~960 KB, WAV: ~10 MB).
// Dùng WebCodecs (AudioEncoder) có sẵn trong Chrome, Edge, Cốc Cốc, Firefox mới; trình duyệt không có thì giữ nguyên tệp gốc.
// Không dùng thư viện ngoài: phần đóng gói WebM (EBML) viết tay ở dưới.

export const AUDIO_BITRATE = 24000;
const RATE = 48000;
const PRE_SKIP = 312;

export interface AudioCompressResult { blob: Blob; before: number; after: number; compressed: boolean; seconds: number }

type EncChunk = { timestamp: number; duration?: number | null; byteLength: number; copyTo(dst: Uint8Array): void };
type AudioEncoderCtor = new (init: { output: (c: EncChunk, m?: { decoderConfig?: { description?: BufferSource } }) => void; error: (e: Error) => void }) => {
  configure(c: Record<string, unknown>): void;
  encode(d: unknown): void;
  flush(): Promise<void>;
  close(): void;
};
type AudioDataCtor = new (init: Record<string, unknown>) => { close(): void };

export function audioCompressSupported(): boolean {
  const w = globalThis as unknown as { AudioEncoder?: unknown; AudioData?: unknown; OfflineAudioContext?: unknown };
  return !!(w.AudioEncoder && w.AudioData && w.OfflineAudioContext);
}

/** Nén một tệp âm thanh. Chỉ dùng bản nén khi nhỏ hơn bản gốc ít nhất 10%. */
export async function compressAudio(f: Blob, onProgress?: (pct: number) => void): Promise<AudioCompressResult> {
  const keep = (seconds = 0): AudioCompressResult => ({ blob: f, before: f.size, after: f.size, compressed: false, seconds });
  if (!audioCompressSupported()) return keep();
  let pcm: Float32Array;
  try {
    pcm = await decodeMono48k(f);
  } catch {
    return keep(); // không giải mã được: tải nguyên tệp
  }
  const seconds = pcm.length / RATE;
  if (!pcm.length) return keep();
  try {
    const { chunks, head } = await encodeOpus(pcm, onProgress);
    const webm = muxWebm(chunks, head, seconds);
    const blob = new Blob([webm], { type: 'audio/webm' });
    if (blob.size > f.size * 0.9) return keep(seconds);
    return { blob, before: f.size, after: blob.size, compressed: true, seconds };
  } catch {
    return keep(seconds);
  }
}

async function decodeMono48k(f: Blob): Promise<Float32Array> {
  const buf = await f.arrayBuffer();
  const Ctx = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } finally {
    ctx.close().catch(() => {});
  }
  // gộp kênh + đổi tần số lấy mẫu bằng OfflineAudioContext (nhanh hơn thời gian thực rất nhiều)
  const frames = Math.max(1, Math.ceil(decoded.duration * RATE));
  const off = new OfflineAudioContext(1, frames, RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

async function encodeOpus(pcm: Float32Array, onProgress?: (pct: number) => void): Promise<{ chunks: { t: number; data: Uint8Array }[]; head: Uint8Array }> {
  const g = globalThis as unknown as { AudioEncoder: AudioEncoderCtor; AudioData: AudioDataCtor };
  const chunks: { t: number; data: Uint8Array }[] = [];
  let head: Uint8Array | null = null;
  let failed: Error | null = null;
  const enc = new g.AudioEncoder({
    output: (c, meta) => {
      const d = new Uint8Array(c.byteLength);
      c.copyTo(d);
      chunks.push({ t: c.timestamp, data: d });
      const desc = meta?.decoderConfig?.description;
      if (desc && !head) head = new Uint8Array(desc instanceof ArrayBuffer ? desc : (desc as ArrayBufferView).buffer.slice(0));
    },
    error: (e) => { failed = e; },
  });
  enc.configure({ codec: 'opus', sampleRate: RATE, numberOfChannels: 1, bitrate: AUDIO_BITRATE, opus: { application: 'voip', complexity: 10, frameDuration: 20000 } });
  const step = RATE; // mỗi lần đưa vào 1 giây
  for (let i = 0; i < pcm.length; i += step) {
    if (failed) throw failed;
    const part = pcm.subarray(i, Math.min(pcm.length, i + step));
    const data = new g.AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: part.length, numberOfChannels: 1, timestamp: Math.round((i / RATE) * 1e6), data: part.slice() });
    enc.encode(data);
    data.close();
    if (i % (step * 10) === 0) {
      onProgress?.(Math.round((i / pcm.length) * 100));
      await new Promise((r) => setTimeout(r, 0)); // nhường cho giao diện
    }
  }
  await enc.flush();
  enc.close();
  if (failed) throw failed;
  if (!chunks.length) throw new Error('Không mã hóa được âm thanh.');
  onProgress?.(100);
  return { chunks, head: head ?? opusHead() };
}

function opusHead(): Uint8Array {
  const b = new Uint8Array(19);
  b.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
  b[8] = 1; // version
  b[9] = 1; // 1 kênh
  new DataView(b.buffer).setUint16(10, PRE_SKIP, true);
  new DataView(b.buffer).setUint32(12, RATE, true);
  return b;
}

// ---------------- đóng gói WebM (EBML) ----------------
type Part = Uint8Array;
const cat = (parts: Part[]): Uint8Array => {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const idBytes = (id: number): Uint8Array => {
  const b: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) b.unshift(v & 0xff);
  return new Uint8Array(b);
};
/** Độ dài dạng vint 8 byte (0x01 + 7 byte) – đơn giản, đúng chuẩn với mọi kích thước */
const size8 = (n: number): Uint8Array => {
  const b = new Uint8Array(8);
  b[0] = 0x01;
  for (let i = 7, v = n; i >= 1; i--, v = Math.floor(v / 256)) b[i] = v & 0xff;
  return b;
};
const el = (id: number, ...body: Part[]): Uint8Array => { const d = cat(body); return cat([idBytes(id), size8(d.length), d]); };
const uint = (id: number, v: number): Uint8Array => {
  const b: number[] = [];
  for (let x = v; x > 0; x = Math.floor(x / 256)) b.unshift(x & 0xff);
  return el(id, new Uint8Array(b.length ? b : [0]));
};
const str = (id: number, s: string) => el(id, new TextEncoder().encode(s));
const f64 = (id: number, v: number) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return el(id, b); };

export function muxWebm(chunks: { t: number; data: Uint8Array }[], head: Uint8Array, seconds: number): Uint8Array {
  const header = el(0x1a45dfa3, uint(0x4286, 1), uint(0x42f7, 1), uint(0x42f2, 4), uint(0x42f3, 8), str(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2));
  const info = el(0x1549a966, uint(0x2ad7b1, 1000000), str(0x4d80, 'Quickplay'), str(0x5741, 'Quickplay'), f64(0x4489, Math.round(seconds * 1000)));
  const track = el(0xae,
    uint(0xd7, 1), uint(0x73c5, 1), uint(0x83, 2), str(0x86, 'A_OPUS'), el(0x63a2, head),
    uint(0x56aa, Math.round((PRE_SKIP / RATE) * 1e9)), uint(0x56bb, 80000000),
    el(0xe1, f64(0xb5, RATE), uint(0x9f, 1)));
  const tracks = el(0x1654ae6b, track);
  const clusters: Uint8Array[] = [];
  let i = 0;
  while (i < chunks.length) {
    const base = Math.floor(chunks[i].t / 1000); // mili giây
    const blocks: Uint8Array[] = [uint(0xe7, base)];
    while (i < chunks.length) {
      const rel = Math.floor(chunks[i].t / 1000) - base;
      if (rel > 30000) break; // mỗi cụm tối đa 30 giây (mốc tương đối là số 16 bit)
      const hdr = new Uint8Array(4);
      hdr[0] = 0x81; // track 1
      new DataView(hdr.buffer).setInt16(1, rel);
      hdr[3] = 0x80; // khung chính
      blocks.push(el(0xa3, hdr, chunks[i].data));
      i++;
    }
    clusters.push(el(0x1f43b675, ...blocks));
  }
  const segment = el(0x18538067, info, tracks, ...clusters);
  return cat([header, segment]);
}
