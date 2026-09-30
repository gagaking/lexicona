import { buildCollage, type CollageOptions, type CollageResult } from './collage';

type WorkerReply = {
  id: number;
  ok: boolean;
  error?: string;
  blob?: Blob;
  width?: number;
  height?: number;
  bytes?: number;
  quality?: number;
  rows?: number;
  skipped?: number;
  extension?: 'jpg' | 'png';
};

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (value: WorkerReply) => void; reject: (error: Error) => void }
>();

function failAll(reason: string) {
  pending.forEach(({ reject }) => reject(new Error(reason)));
  pending.clear();
  const current = worker;
  worker = null;
  try {
    current?.terminate();
  } catch (_) {}
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (
    typeof Worker === 'undefined' ||
    typeof OffscreenCanvas === 'undefined' ||
    typeof createImageBitmap === 'undefined'
  ) {
    return null;
  }
  try {
    const created = new Worker(new URL('./collage.worker.ts', import.meta.url), { type: 'module' });
    created.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const entry = pending.get(reply?.id);
      if (!entry) return;
      pending.delete(reply.id);
      entry.resolve(reply);
    };
    created.onerror = () => failAll('拼图线程不可用');
    worker = created;
    return worker;
  } catch (_) {
    worker = null;
    return null;
  }
}

/**
 * 在 Web Worker 里拼图（OffscreenCanvas），避免阻塞界面；
 * 环境不支持时自动回退到主线程实现。
 */
export async function buildCollageAsync(
  sources: Blob[],
  options: CollageOptions,
): Promise<CollageResult> {
  const active = ensureWorker();
  if (active) {
    try {
      const reply = await new Promise<WorkerReply>((resolve, reject) => {
        const id = (nextId += 1);
        pending.set(id, { resolve, reject });
        active.postMessage({ id, sources, options });
      });
      if (!reply?.ok || !reply.blob) {
        throw new Error(reply?.error || '拼图失败');
      }
      const blob = reply.blob;
      return {
        blob,
        objectUrl: URL.createObjectURL(blob),
        width: reply.width || 0,
        height: reply.height || 0,
        bytes: reply.bytes || blob.size,
        quality: reply.quality ?? 1,
        columns: 2,
        rows: reply.rows || 0,
        extension: reply.extension || 'jpg',
        skipped: reply.skipped || 0,
      };
    } catch (error) {
      // Worker 出问题（或单次失败）时退回主线程实现，保证功能可用
      console.warn('Collage worker failed, falling back to main thread:', error);
    }
  }

  const urls = sources.map((blob) => URL.createObjectURL(blob));
  try {
    return await buildCollage(urls, options);
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
  }
}
