import { useMemo, useState } from 'react';
import { NULL_DIRS, angleGrid, beamwidthDeg, delayAndSum, idealCovariance, jammerSuppressionDb, mvdr, patternDb } from '../../../engine/lab/array';
import { INNER_H, INNER_W, PAD, PH, PW, poly } from './plot';

const GRID = angleGrid(0.5);
const LO = -50;

// Level 10: an array's pattern against angle (dB, look direction at 0 dB). Delay-and-sum points a beam; MVDR also puts
// nulls on the jammers. Readouts: gain, beamwidth, and how much each jammer is suppressed.
export function BeamPlot({ m, lookDeg, jammers = [], mode }: { m: number; lookDeg: number; jammers?: number[]; mode: 'das' | 'mvdr' }) {
  const w = useMemo(
    () => (mode === 'das' ? delayAndSum(m, lookDeg) : mvdr(idealCovariance(m, jammers.map((thetaDeg) => ({ thetaDeg, power: 1000 })), 1), lookDeg)),
    [m, lookDeg, jammers, mode],
  );
  const db = useMemo(() => patternDb(w, lookDeg, GRID), [w, lookDeg]);
  const fx = (t: number) => PAD.l + ((t + 90) / 180) * INNER_W;
  const yy = (v: number) => PAD.t + ((0 - Math.max(LO, Math.min(0, v))) / (0 - LO)) * INNER_H;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{mode === 'das' ? 'Delay-and-sum beam' : 'MVDR: beam with nulls'}, {m} elements</h3>
        <span className="inst-readout">
          gain {(10 * Math.log10(m)).toFixed(1)} dB, beamwidth {beamwidthDeg(m).toFixed(1)}°
          {jammers.map((j) => `; jammer at ${j}°: ${jammerSuppressionDb(w, lookDeg, j).toFixed(1)} dB`).join('')}
        </span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Beam pattern">
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="inst-frame" />
        {[0, -10, -20, -30, -40, -50].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={PAD.l + INNER_W} y1={yy(v)} y2={yy(v)} className="inst-grid" />
            <text x={PAD.l - 4} y={yy(v) + 3} textAnchor="end" className="inst-axis">{v}</text>
          </g>
        ))}
        {[-90, -60, -30, 0, 30, 60, 90].map((t) => <text key={t} x={fx(t)} y={PH - PAD.b + 12} textAnchor="middle" className="inst-axis">{t}°</text>)}
        <polyline points={poly(GRID.length, (i) => fx(GRID[i]), (i) => yy(db[i]))} className="inst-line c1" />
        <line x1={fx(lookDeg)} x2={fx(lookDeg)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-annot" />
        {jammers.map((j) => <line key={j} x1={fx(j)} x2={fx(j)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-goal" />)}
        <text x={PAD.l + INNER_W / 2} y={PH - 3} textAnchor="middle" className="inst-axis">angle from broadside; dB relative to the look direction (blue line); jammers red</text>
      </svg>
    </section>
  );
}

// The lessons' versions, with sliders.
export function BeamDemo({ mode }: { mode: 'das' | 'mvdr' }) {
  const [m, setM] = useState(8);
  const [look, setLook] = useState(0);
  const [jam, setJam] = useState(40);
  const [count, setCount] = useState(1);
  // One jammer follows the slider; more are spread evenly in sin θ, so each needs its own null.
  const jammers = mode !== 'mvdr' ? [] : count === 1 ? [jam] : NULL_DIRS.slice(0, count);
  return (
    <div>
      <div className="inst-head">
        <label>Elements <input type="range" min={2} max={16} value={m} onChange={(e) => setM(Number(e.target.value))} aria-label="Elements" /> {m}</label>
        {mode === 'das' && <label>Look <input type="range" min={-60} max={60} value={look} onChange={(e) => setLook(Number(e.target.value))} aria-label="Look" /> {look}°</label>}
        {mode === 'mvdr' && count === 1 && <label>Jammer <input type="range" min={-80} max={80} value={jam} onChange={(e) => setJam(Number(e.target.value))} aria-label="Jammer" /> {jam}°</label>}
        {mode === 'mvdr' && <label>Jammers <input type="range" min={1} max={16} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Jammers" /> {count}</label>}
      </div>
      <BeamPlot m={m} lookDeg={look} jammers={jammers} mode={mode} />
    </div>
  );
}
