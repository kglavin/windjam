// Web Worker that runs BER jobs. Protocol types are in runner.ts.
import { runBerAsync } from './run';
import type { FromWorker, ToWorker } from './runner';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  postMessage: (m: FromWorker) => void;
};
const cancelled = new Set<number>();

ctx.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'cancel') {
    cancelled.add(m.id);
    return;
  }
  const { id, req } = m;
  runBerAsync(req, {
    shouldStop: () => cancelled.has(id),
    onProgress: (progress) => ctx.postMessage({ type: 'progress', id, progress }),
  }).then(
    (result) => {
      cancelled.delete(id);
      ctx.postMessage({ type: 'done', id, result });
    },
    (err: unknown) => {
      cancelled.delete(id);
      ctx.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
    },
  );
};
