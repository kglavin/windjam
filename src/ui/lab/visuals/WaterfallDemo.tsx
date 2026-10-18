import { useMemo, useState } from 'react';
import { planFhRun } from '../../../engine/lab/berRun';
import { type FhJammer, FH_EXAMPLE, fhPracticeAt, hopPreview } from '../../../engine/lab/fh';
import { EXAMPLE, FIRST_PRACTICE, type RunSummary, knownLinkInfo, level7Truth } from '../../../engine/lab/levels';
import { Waterfall } from '../instruments/Waterfall';
import { RunStats, useRun } from '../RunBox';

const DEMO_SEED = 7_007;
const SHOWN_HOPS = 40;

// One jammer's Run button and meter; selecting it shows its coverage on the waterfall.
function Meter({ title, active, plan, onSelect, onResult }: {
  title: string;
  active: boolean;
  plan: ReturnType<typeof planFhRun>;
  onSelect: () => void;
  onResult: (s: RunSummary) => void;
}) {
  const [result, setResult] = useState<RunSummary>();
  const { running, progress, error, start } = useRun((s) => {
    setResult(s);
    onResult(s);
  });
  return (
    <section className={`inst-panel ${active ? 'vis-variant-active' : ''}`}>
      <header className="inst-head">
        <h3>{title}</h3>
        <button type="button" onClick={onSelect} disabled={active}>Show</button>
        <button type="button" disabled={running} onClick={() => { onSelect(); start(plan); }}>{running ? 'Running…' : 'Run'}</button>
      </header>
      <RunStats p={running ? progress : result} />
      {error && <p className="inst-error">{error}</p>}
    </section>
  );
}

// Level 7: the waterfall of the example or practice hopping link; with variants, a Run for each jammer at jsDb.
export function WaterfallDemo({ link, variants, jsDb = 0, practiceN = 0 }: {
  link: 'example' | 'practice';
  variants?: { label: string; jammer: FhJammer; hopsPerBit?: 1 | 3 }[];
  jsDb?: number;
  practiceN?: number;
}) {
  const base = link === 'example' ? FH_EXAMPLE : fhPracticeAt(practiceN);
  const seed = DEMO_SEED + practiceN;
  const plans = useMemo(
    () =>
      (variants ?? []).map((v) =>
        planFhRun({ link, js: 'fixed', jsDb, jammer: { kind: 'bbn' } }, { jammer: v.jammer, hopsPerBit: v.hopsPerBit }, {
          truth: level7Truth(1),
          example: knownLinkInfo(EXAMPLE),
          practice: FIRST_PRACTICE,
          practiceJsDb: jsDb,
          scene: { jsDb, ebN0Db: 30 },
          seed,
          practiceN,
        }),
      ),
    [variants, link, jsDb, seed, practiceN],
  );
  const [sel, setSel] = useState(0);
  const [runs, setRuns] = useState<Record<number, RunSummary>>({});
  const jammer = variants?.[sel]?.jammer;
  const fh = { ...base, hopsPerBit: variants?.[sel]?.hopsPerBit ?? base.hopsPerBit };
  const ran = runs[sel]?.hops;
  const hops = ran ?? hopPreview(fh, seed, SHOWN_HOPS, jammer);
  return (
    <div className="vis-run-demo">
      <Waterfall link={fh} hops={hops.slice(0, SHOWN_HOPS)} ran={!!ran} jammer={jammer} title={`Hop waterfall: ${link} link`} />
      {variants && <p className="stage-note">J/S = {jsDb} dB</p>}
      {variants?.map((v, i) => (
        <Meter key={v.label} title={v.label} active={i === sel} plan={plans[i]} onSelect={() => setSel(i)} onResult={(s) => setRuns((r) => ({ ...r, [i]: s }))} />
      ))}
    </div>
  );
}
