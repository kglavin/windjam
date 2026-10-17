// Main-thread client for BER runs: a Web Worker when available, otherwise the same async loop in-process.
import { type RunProgress, type RunRequest, type RunResult, runBerAsync } from './run';

export type ToWorker = { type: 'start'; id: number; req: RunRequest } | { type: 'cancel'; id: number };
export type FromWorker =
  | { type: 'progress'; id: number; progress: RunProgress }
  | { type: 'done'; id: number; result: RunResult }
  | { type: 'error'; id: number; message: string };

let nextId = 1;

export function startRun(
  req: RunRequest,
  onProgress?: (p: RunProgress) => void,
): { result: Promise<RunResult>; cancel: () => void } {
  if (typeof Worker === 'undefined') {
    let stop = false;
    const result = runBerAsync(req, { onProgress, shouldStop: () => stop });
    return { result, cancel: () => (stop = true) };
  }
  const id = nextId++;
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const result = new Promise<RunResult>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === 'progress') onProgress?.(m.progress);
      else {
        worker.terminate();
        if (m.type === 'done') resolve(m.result);
        else reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage({ type: 'start', id, req } satisfies ToWorker);
  });
  return { result, cancel: () => worker.postMessage({ type: 'cancel', id } satisfies ToWorker) };
}
