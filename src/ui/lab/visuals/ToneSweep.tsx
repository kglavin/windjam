import { useMemo, useState } from 'react';
import { planRun } from '../../../engine/lab/berRun';
import { EXAMPLE, FIRST_PRACTICE, berText, exampleBers, knownLinkInfo, level2Truth, EX_EBN0_DB, EX_JS_DB } from '../../../engine/lab/levels';
import { mSequence } from '../../../engine/lab/pn';
import { berToneShortCode, undb } from '../../../engine/lab/theory';
import { Axes } from '../instruments/Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks, poly } from '../instruments/plot';
import { RunStats, useRun } from '../RunBox';
import type { RunSummary } from '../../../engine/lab/levels';

const MAX_KHZ = 100;
const LOG_LO = Math.log10(1e-5);
const LOG_HI = Math.log10(0.5);
const SEED = 31_011;
const ex = knownLinkInfo(EXAMPLE);
const LINE_KHZ = (EXAMPLE.chipRateMcps * 1000) / ex.n; // 32.3

interface Measured {
  khz: number;
  summary: RunSummary;
  kind: 'carrier' | 'line';
  no: number;
}

const planAt = (khz: number, seed: number) =>
  planRun(
    {
      link: 'example',
      js: 'fixed',
      jsDb: EX_JS_DB,
      ebN0Db: EX_EBN0_DB,
      code: 'short',
      jammer: { kind: 'tone', fTc: khz / (EXAMPLE.chipRateMcps * 1000) },
    },
    {
      truth: level2Truth(1),
      example: ex,
      practice: FIRST_PRACTICE,
      practiceJsDb: EX_JS_DB,
      scene: { jsDb: EX_JS_DB, ebN0Db: EX_EBN0_DB },
      seed,
    },
  );

// One Run button. Each press runs with a new seed, so with a new tone phase.
function SweepRun({ label, khz, count, onResult }: { label: string; khz: number; count: number; onResult: (s: RunSummary) => void }) {
  const [last, setLast] = useState<RunSummary>();
  const { running, progress, error, start } = useRun((s) => {
    setLast(s);
    onResult(s);
  });
  const shown = running ? progress : last;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{label}</h3>
        <button type="button" disabled={running} onClick={() => start(planAt(khz, SEED + 977 * (count + 1) + Math.round(khz)))}>
          {running ? 'Running…' : 'Run'}
        </button>
      </header>
      <RunStats p={shown} />
      {error && <p className="inst-error">{error}</p>}
    </section>
  );
}

// Theory BER of the example link against the tone's offset (phase-averaged), the broadband-noise BER at the same
// J/S, the code's lines, and the runs the player makes.
export function ToneSweep() {
  const [results, setResults] = useState<Measured[]>([]);
  const curve = useMemo(() => {
    const code = mSequence(EXAMPLE.degree);
    const xs: number[] = [];
    for (let k = 0; k <= MAX_KHZ; k += 0.5) xs.push(k);
    const eb = undb(EX_EBN0_DB);
    const js = undb(EX_JS_DB);
    return { xs, ys: xs.map((k) => berToneShortCode(eb, js, code, k / (EXAMPLE.chipRateMcps * 1000))) };
  }, []);
  const bbn = useMemo(() => exampleBers().bbn, []);
  const fx = (v: number) => PAD.l + (v / MAX_KHZ) * INNER_W;
  const fy = (b: number) => PAD.t + ((LOG_HI - Math.log10(Math.max(1e-5, Math.min(0.5, b)))) / (LOG_HI - LOG_LO)) * INNER_H;
  const lines: number[] = [];
  for (let k = 1; k * LINE_KHZ <= MAX_KHZ + 1e-9; k++) lines.push(k * LINE_KHZ);
  const add = (kind: Measured['kind'], khz: number) => (summary: RunSummary) =>
    setResults((r) => [...r, { khz, summary, kind, no: r.filter((x) => x.kind === kind).length + 1 }]);
  const count = (kind: Measured['kind']) => results.filter((x) => x.kind === kind).length;
  return (
    <div className="vis-run-demo">
      <p className="stage-note">
        Example link: 31 chips at 1 Mcps. Every run uses J/S = {EX_JS_DB} dB and Eb/N0 = {EX_EBN0_DB} dB. Theory is averaged over the tone&apos;s phase.
      </p>
      <SweepRun label="tone on the carrier" khz={0} count={count('carrier')} onResult={add('carrier', 0)} />
      <SweepRun label="tone on the first line" khz={LINE_KHZ} count={count('line')} onResult={add('line', LINE_KHZ)} />
      <section className="inst-panel">
        <header className="inst-head">
          <h3>BER against tone offset</h3>
          <span className="inst-legend">
            <span><i className="sw c1" />tone, theory </span>
            <span><i className="sw c2" />broadband noise, theory </span>
            <span><i className="dot c3" />runs </span>
          </span>
        </header>
        <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="BER against tone offset">
          <Axes
            xTicks={niceTicks(0, MAX_KHZ, 5)}
            yTicks={[1e-5, 1e-4, 1e-3, 1e-2, 1e-1]}
            fx={fx}
            fy={fy}
            xLabel="Tone offset from the carrier (kHz)"
            yLabel="BER"
            yFormat={(v) => v.toExponential(0)}
          />
          {lines.map((k) => (
            <g key={k}>
              <line x1={fx(k)} x2={fx(k)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-goal" />
              <text x={fx(k) + 3} y={PAD.t + 10} className="inst-axis">line</text>
            </g>
          ))}
          <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(bbn)} y2={fy(bbn)} className="inst-line c2" />
          <text x={PAD.l + INNER_W - 4} y={fy(bbn) - 3} textAnchor="end" className="inst-axis">broadband noise {berText(bbn)}</text>
          <polyline points={poly(curve.xs.length, (i) => fx(curve.xs[i]), (i) => fy(curve.ys[i]))} className="inst-line c1" />
          {results.map((r, i) => (
            <g key={i} className="c3">
              <line x1={fx(r.khz)} x2={fx(r.khz)} y1={fy(r.summary.lo)} y2={fy(r.summary.hi)} className="inst-bar-line" />
              <circle cx={fx(r.khz)} cy={fy(r.summary.ber)} r={3.5} className="inst-pt">
                <title>{`${r.kind === 'carrier' ? 'carrier' : 'first line'} run ${r.no}: ${berText(r.summary.ber)}`}</title>
              </circle>
            </g>
          ))}
        </svg>
      </section>
    </div>
  );
}
