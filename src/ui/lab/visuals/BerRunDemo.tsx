import { useMemo, useState } from 'react';
import { planRun } from '../../../engine/lab/berRun';
import { EXAMPLE, type RunSummary, FIRST_PRACTICE, knownLinkInfo, level2Truth } from '../../../engine/lab/levels';
import { CurvePlot } from '../instruments/CurvePlot';
import { RunStats, useRun } from '../RunBox';

export const DEMO_JS_DB = 10;
const DEMO_SEED = 20_251;

// An interactive run of the example link under broadband noise at J/S 10 dB: the meter and the measured point
// on the theory curve.
export function BerRunDemo() {
  const plan = useMemo(
    () =>
      planRun(
        { link: 'example', js: 'fixed', jsDb: DEMO_JS_DB, jammer: { kind: 'bbn' } },
        {
          truth: level2Truth(1),
          example: knownLinkInfo(EXAMPLE),
          practice: FIRST_PRACTICE,
          practiceJsDb: DEMO_JS_DB,
          scene: { jsDb: DEMO_JS_DB, ebN0Db: 30 },
          seed: DEMO_SEED,
        },
      ),
    [],
  );
  const [result, setResult] = useState<RunSummary>();
  const { running, progress, error, start } = useRun(setResult);
  const shown = running ? progress : result;
  const points = result && !running ? [{ jsDb: result.jsDb, ber: result.ber, lo: result.lo, hi: result.hi, label: 'measured' }] : [];
  return (
    <div className="vis-run-demo">
      <section className="inst-panel">
        <header className="inst-head">
          <h3>BER meter: example link, J/S = {DEMO_JS_DB} dB</h3>
          <button type="button" disabled={running} onClick={() => start(plan)}>{running ? 'Running…' : 'Run'}</button>
        </header>
        <RunStats p={shown} />
        {error && <p className="inst-error">{error}</p>}
      </section>
      <CurvePlot points={points} theory={[{ label: 'theory', f: plan.curve }]} xRange={[0, 30]} />
    </div>
  );
}
