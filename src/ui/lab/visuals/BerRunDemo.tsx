import { useMemo, useState } from 'react';
import { planRun } from '../../../engine/lab/berRun';
import type { JammerSpec } from '../../../engine/lab/jammers';
import { EXAMPLE, type RunSummary, FIRST_PRACTICE, knownLinkInfo, level2Truth } from '../../../engine/lab/levels';
import { CurvePlot } from '../instruments/CurvePlot';
import { RunStats, useRun } from '../RunBox';

export const DEMO_JS_DB = 10;
const DEMO_SEED = 20_251;
const SINGLE = [{ label: 'measured', jammer: { kind: 'bbn' } as JammerSpec }];
const VARIANT_COLOURS = ['c2', 'c3', 'c4', 'c5', 'c6'];

export interface DemoVariant {
  label: string;
  jammer: JammerSpec;
}

function planFor(jammer: JammerSpec, seed: number) {
  return planRun(
    { link: 'example', js: 'fixed', jsDb: DEMO_JS_DB, jammer },
    {
      truth: level2Truth(1),
      example: knownLinkInfo(EXAMPLE),
      practice: FIRST_PRACTICE,
      practiceJsDb: DEMO_JS_DB,
      scene: { jsDb: DEMO_JS_DB, ebN0Db: 30 },
      seed,
    },
  );
}

// One jammer's Run button and meter.
function VariantMeter({ title, colour, plan, onResult }: {
  title: string;
  colour?: string;
  plan: ReturnType<typeof planFor>;
  onResult: (s: RunSummary) => void;
}) {
  const [result, setResult] = useState<RunSummary>();
  const { running, progress, error, start } = useRun((s) => {
    setResult(s);
    onResult(s);
  });
  const shown = running ? progress : result;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{colour && <i className={`dot ${colour} vis-variant-dot`} />}{title}</h3>
        <button type="button" disabled={running} onClick={() => start(plan)}>{running ? 'Running…' : 'Run'}</button>
      </header>
      <RunStats p={shown} />
      {error && <p className="inst-error">{error}</p>}
    </section>
  );
}

// Interactive runs of the example link at J/S 10 dB: the meter and the measured point on the theory curve. One
// meter for broadband noise by default, or one per variant, each with its own colour, all on one plot with the
// broadband theory curve.
export function BerRunDemo({ variants }: { variants?: DemoVariant[] }) {
  const list = variants ?? SINGLE;
  const many = variants !== undefined;
  const plans = useMemo(() => list.map((v, i) => planFor(v.jammer, DEMO_SEED + 4 * i)), [list]);
  const [results, setResults] = useState<Record<string, RunSummary>>({});
  const theory = useMemo(() => planFor({ kind: 'bbn' }, DEMO_SEED).curve, []);
  const points = list.flatMap((v) => {
    const r = results[v.label];
    return r ? [{ jsDb: r.jsDb, ber: r.ber, lo: r.lo, hi: r.hi, label: v.label, kind: many ? v.label : 'measured' }] : [];
  });
  return (
    <div className="vis-run-demo">
      {many && <p className="stage-note">BER meters: example link, J/S = {DEMO_JS_DB} dB</p>}
      {list.map((v, i) => (
        <VariantMeter
          key={v.label}
          title={many ? v.label : `BER meter: example link, J/S = ${DEMO_JS_DB} dB`}
          colour={many ? VARIANT_COLOURS[i % VARIANT_COLOURS.length] : undefined}
          plan={plans[i]}
          onResult={(s) => setResults((r) => ({ ...r, [v.label]: s }))}
        />
      ))}
      <CurvePlot
        points={points}
        theory={[{ label: many ? 'broadband theory' : 'theory', f: theory }]}
        xRange={[0, 30]}
        kindOrder={many ? list.map((v) => v.label) : undefined}
      />
    </div>
  );
}
