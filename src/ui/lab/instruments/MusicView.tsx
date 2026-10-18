import { useMemo, useState } from 'react';
import { type Source, angleGrid, bartlettDb, musicSpectrumDb, sampleCovariance } from '../../../engine/lab/array';
import { INNER_H, INNER_W, PAD, PH, PW, poly } from './plot';

const GRID = angleGrid(0.25);
const LO = -40;

// Level 10: MUSIC against the delay-and-sum scan for emitters seen by an M-element array. Hover reads the angle.
export function MusicPlot({ m, sources, snapshots, showTruth, seed = 3 }: { m: number; sources: Source[]; snapshots: number; showTruth: boolean; seed?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const R = useMemo(() => sampleCovariance(m, sources, 1, snapshots, seed), [m, sources, snapshots, seed]);
  const music = useMemo(() => musicSpectrumDb(R, sources.length, GRID), [R, sources.length]);
  const bart = useMemo(() => bartlettDb(R, GRID), [R]);
  const fx = (t: number) => PAD.l + ((t + 90) / 180) * INNER_W;
  const fy = (v: number) => PAD.t + ((0 - Math.max(LO, Math.min(0, v))) / (0 - LO)) * INNER_H;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Direction finding with {m} elements, {snapshots} snapshots</h3>
        <span className="inst-legend">
          <span className="c1"><i className="sw" />MUSIC</span>
          <span className="c2"><i className="sw" />delay-and-sum scan</span>
        </span>
        <span className="inst-readout">{hover === null ? 'hover to read the angle' : `${GRID[hover].toFixed(2)}°: MUSIC ${music[hover].toFixed(1)} dB`}</span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="MUSIC spectrum">
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="inst-frame" />
        {[0, -10, -20, -30, -40].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(v)} y2={fy(v)} className="inst-grid" />
            <text x={PAD.l - 4} y={fy(v) + 3} textAnchor="end" className="inst-axis">{v}</text>
          </g>
        ))}
        {[-90, -60, -30, 0, 30, 60, 90].map((t) => <text key={t} x={fx(t)} y={PH - PAD.b + 12} textAnchor="middle" className="inst-axis">{t}°</text>)}
        <polyline points={poly(GRID.length, (i) => fx(GRID[i]), (i) => fy(bart[i]))} className="inst-line c2" />
        <polyline points={poly(GRID.length, (i) => fx(GRID[i]), (i) => fy(music[i]))} className="inst-line c1" />
        {showTruth && sources.map((s) => <line key={s.thetaDeg} x1={fx(s.thetaDeg)} x2={fx(s.thetaDeg)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-goal" />)}
        {hover !== null && <line x1={fx(GRID[hover])} x2={fx(GRID[hover])} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-cursor" />}
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} fill="transparent"
          onMouseMove={(e) => {
            const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * PW;
            setHover(Math.max(0, Math.min(GRID.length - 1, Math.round(((x - PAD.l) / INNER_W) * (GRID.length - 1)))));
          }}
          onMouseLeave={() => setHover(null)} />
        <text x={PAD.l + INNER_W / 2} y={PH - 3} textAnchor="middle" className="inst-axis">angle from broadside; dB below each curve's peak</text>
      </svg>
    </section>
  );
}

const SNAPS = [5, 10, 20, 50, 200, 1000];

// F1's version: two emitters 10° apart, closer than the 6-element beam; a slider for the snapshots.
export function MusicDemo() {
  const [i, setI] = useState(2);
  const sources = useMemo(() => [{ thetaDeg: -5, power: 10 }, { thetaDeg: 5, power: 10 }], []);
  return (
    <div>
      <label className="stage-field">
        <span>Snapshots</span>
        <input type="range" min={0} max={SNAPS.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} aria-label="Snapshots" /> {SNAPS[i]}
      </label>
      <MusicPlot m={6} sources={sources} snapshots={SNAPS[i]} showTruth />
    </div>
  );
}
