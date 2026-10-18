import { useEffect, useRef, useState } from 'react';
import type { AnyRunPlan as RunPlan } from '../../engine/lab/berRun';
import { type RunSummary, berText } from '../../engine/lab/levels';
import type { RunProgress } from '../../engine/lab/run';
import { startRun } from '../../engine/lab/runner';

export const summaryOf = (r: RunProgress & { stoppedBy?: string; hops?: RunSummary['hops'] }, plan: RunPlan): RunSummary => ({
  bits: r.bits,
  errors: r.errors,
  ber: r.ber,
  lo: r.lo,
  hi: r.hi,
  stoppedBy: r.stoppedBy ?? 'running',
  jsDb: plan.jsDb,
  ebJ0Db: plan.ebJ0Db,
  theoryBer: plan.theoryBer,
  ...(r.hops ? { hops: r.hops } : {}),
});

// Bits, errors, BER and the 95% interval of a run, finished or in progress.
export function RunStats({ p }: { p?: Pick<RunSummary, 'bits' | 'errors' | 'ber' | 'lo' | 'hi'> }) {
  return (
    <dl className="inst-meter run-stats">
      <div><dt>Bits</dt><dd>{p ? p.bits.toLocaleString() : '-'}</dd></div>
      <div><dt>Errors</dt><dd>{p ? p.errors.toLocaleString() : '-'}</dd></div>
      <div><dt>BER</dt><dd>{p ? berText(p.ber) : '-'}</dd></div>
      <div><dt>95% range</dt><dd>{p ? `${berText(p.lo)} to ${berText(p.hi)}` : '-'}</dd></div>
    </dl>
  );
}

// Runs a plan and reports the finished run. Used by the BER meter demo.
export function useRun(onDone: (s: RunSummary) => void) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | undefined>();
  const [error, setError] = useState<string>();
  const cancel = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancel.current?.();
    };
  }, []);
  const start = (plan: RunPlan) => {
    setRunning(true);
    setError(undefined);
    setProgress(undefined);
    const run = startRun(plan.request, (p) => alive.current && setProgress(p));
    cancel.current = run.cancel;
    run.result
      .then((r) => {
        if (alive.current) onDone(summaryOf(r, plan));
      })
      .catch((e: unknown) => alive.current && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        cancel.current = null;
        if (alive.current) {
          setRunning(false);
          setProgress(undefined);
        }
      });
  };
  return { running, progress, error, start };
}

export interface RunValue {
  prediction?: number;
  result?: RunSummary;
}

// The Run button of a step, with the prediction field when the step asks for one. The step owns the state:
// the prediction is locked once it is set, and onStart is called with it when Run is pressed.
export function RunBox({ plan, needsPrediction, value, canRun, label = 'Run', note, onStart, onDone }: {
  plan: RunPlan | undefined;
  needsPrediction: boolean;
  value: RunValue;
  canRun: boolean; // false once the step's run is final
  label?: string;
  note?: string; // a line about the run's jammer, shown under the J/S
  onStart: (prediction?: number) => void;
  onDone: (s: RunSummary) => void;
}) {
  const [text, setText] = useState('');
  const { running, progress, error, start } = useRun(onDone);
  const locked = value.prediction !== undefined;
  const typed = text.trim() === '' ? NaN : Number(text);
  const prediction = locked ? value.prediction! : typed;
  const valid = !needsPrediction || (Number.isFinite(prediction) && prediction > 0);
  const shown = running ? progress : value.result;
  return (
    <div className="stage-run">
      {needsPrediction && (
        <label className="stage-field">
          <span>Your predicted BER</span>
          <span className="stage-input">
            <input
              type="number"
              step="any"
              min="0"
              aria-label="Predicted BER"
              disabled={locked || running}
              value={locked ? String(value.prediction) : text}
              onChange={(e) => setText(e.target.value)}
            />
          </span>
        </label>
      )}
      {plan && <p className="stage-note">J/S for this run: {plan.jsDb.toFixed(1)} dB</p>}
      {note && <p className="stage-note">{note}</p>}
      {canRun && (
        <button
          type="button"
          disabled={!plan || running || !valid}
          onClick={() => {
            if (!plan) return;
            onStart(needsPrediction ? prediction : undefined);
            start(plan);
          }}
        >
          {running ? 'Running…' : label}
        </button>
      )}
      {needsPrediction && !locked && !running && <p className="stage-note">Enter a prediction to enable Run. It locks when you press Run.</p>}
      <RunStats p={shown} />
      {error && <p className="inst-error">{error}</p>}
    </div>
  );
}
