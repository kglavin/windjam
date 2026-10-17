import { useMemo } from 'react';
import { PEAK_CHIPS, PEAK_S, PEAK_TONES, type PeakKind, type PeakSet, peakSet } from '../../../engine/lab/peaks';
import { Axes } from '../instruments/Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks, poly } from '../instruments/plot';

const PANELS: { kind: PeakKind; title: string }[] = [
  { kind: 'zero', title: 'In phase' },
  { kind: 'random', title: 'Random phases' },
  { kind: 'newman', title: 'Newman phases' },
];

function Panel({ set, title, top }: { set: PeakSet; title: string; top: number }) {
  const n = set.env.length;
  const fx = (chips: number) => PAD.l + (chips / PEAK_CHIPS) * INNER_W;
  const fy = (v: number) => PAD.t + (1 - Math.min(v, top) / top) * INNER_H;
  const peakTimes = set.peakPower / set.meanPower;
  return (
    <figure className="vis-three-col">
      <section className="inst-panel">
        <header className="inst-head">
          <h3>{title}: envelope |x|² against time</h3>
        </header>
        <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label={`${title}: envelope of ${PEAK_TONES} tones against time`}>
          <Axes xTicks={niceTicks(0, PEAK_CHIPS, 8)} yTicks={niceTicks(0, top, 4)} fx={fx} fy={fy} xLabel="Time (chips)" yLabel="Power (average = 1)" />
          <polyline points={poly(n, (i) => fx(i / PEAK_S), (i) => fy(set.env[i]))} className="inst-line c2" />
          <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(set.meanPower)} y2={fy(set.meanPower)} className="inst-cursor" />
          <text x={PAD.l + INNER_W - 4} y={fy(set.meanPower) - 3} textAnchor="end" className="inst-axis">average</text>
          <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(set.peakPower)} y2={fy(set.peakPower)} className="inst-goal" />
          <text x={PAD.l + INNER_W - 4} y={fy(set.peakPower) - 3} textAnchor="end" className="inst-axis">peak {peakTimes.toFixed(1)}</text>
        </svg>
      </section>
      <figcaption>
        {title}: peak {peakTimes.toFixed(1)} times the average, PAPR {set.paprDb.toFixed(1)} dB
      </figcaption>
    </figure>
  );
}

// Eight tones 0.05 cycles per chip apart with the same average power: in phase, random phases, Newman phases.
export function Peaks() {
  const sets = useMemo(() => PANELS.map((p) => peakSet(p.kind)), []);
  const top = Math.ceil(Math.max(...sets.map((s) => s.peakPower)));
  return (
    <div className="vis-stack">
      {PANELS.map((p, i) => (
        <Panel key={p.kind} set={sets[i]} title={p.title} top={top} />
      ))}
    </div>
  );
}
