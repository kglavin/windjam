import { useEffect, useRef, useState } from 'react';
import type { RunProgress, RunRequest, RunResult } from '../../../engine/lab/run';
import { startRun } from '../../../engine/lab/runner';

const sci = (v: number): string => (Number.isFinite(v) ? (v === 0 ? '0' : v.toExponential(2)) : '-');

// Start/stop a BER run and show its counts, BER, 95% interval and why it ended.
export function BerMeter({ request, onResult }: { request: RunRequest | undefined; onResult?: (r: RunResult, req: RunRequest) => void }) {
  const [running, setRunning] = useState(false);
  const [p, setP] = useState<RunProgress | RunResult | undefined>();
  const [error, setError] = useState<string>();
  const cancelRef = useRef<(() => void) | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelRef.current?.();
    };
  }, []);

  const start = () => {
    if (!request) return;
    setRunning(true);
    setError(undefined);
    setP(undefined);
    const run = startRun(request, (pr) => alive.current && setP(pr));
    cancelRef.current = run.cancel;
    run.result
      .then((r) => {
        if (!alive.current) return;
        setP(r);
        onResult?.(r, request);
      })
      .catch((e: unknown) => alive.current && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        cancelRef.current = null;
        if (alive.current) setRunning(false);
      });
  };

  const stoppedBy = p && 'stoppedBy' in p ? p.stoppedBy : undefined;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>BER meter</h3>
        <button type="button" onClick={start} disabled={!request || running}>Start</button>
        <button type="button" onClick={() => cancelRef.current?.()} disabled={!running}>Stop</button>
      </header>
      <dl className="inst-meter">
        <div><dt>Bits</dt><dd>{p ? p.bits.toLocaleString() : '-'}</dd></div>
        <div><dt>Errors</dt><dd>{p ? p.errors.toLocaleString() : '-'}</dd></div>
        <div><dt>BER</dt><dd>{p ? sci(p.ber) : '-'}</dd></div>
        <div><dt>95% interval</dt><dd>{p ? `${sci(p.lo)} to ${sci(p.hi)}` : '-'}</dd></div>
        <div><dt>Elapsed</dt><dd>{p ? `${(p.elapsedMs / 1000).toFixed(1)} s` : '-'}</dd></div>
        <div><dt>Stopped by</dt><dd>{stoppedBy ?? (running ? 'running' : '-')}</dd></div>
      </dl>
      {error && <p className="inst-error">{error}</p>}
    </section>
  );
}
