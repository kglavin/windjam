import { useMemo, useState } from 'react';
import { fadingTrack, rakeFadeProbability } from '../../../engine/lab/urban';
import { INNER_H, INNER_W, PAD, PH, PW, poly } from './plot';

// Level 11 D1: the level along 30 m of street at 450 MHz, against its average, with one path or a rake of 2 or 3.
// The share of a 2 km street more than 10 dB down, measured and from the formula.
const LEN_M = 30;
const LO = -30;
const HI = 10;
export function FadingStrip() {
  const [paths, setPaths] = useState(1);
  const strip = useMemo(() => fadingTrack(LEN_M, 400, 450, 3, paths), [paths]);
  const long = useMemo(() => fadingTrack(2000, 20000, 450, 5, paths), [paths]);
  const fx = (m: number) => PAD.l + (m / LEN_M) * INNER_W;
  const fy = (db: number) => PAD.t + ((HI - Math.max(LO, Math.min(HI, db))) / (HI - LO)) * INNER_H;
  const below = long.filter((v) => v < -10).length / long.length;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Level along a street</h3>
        <label>Paths combined <select value={paths} onChange={(e) => setPaths(Number(e.target.value))}><option value={1}>1</option><option value={2}>2 (rake)</option><option value={3}>3 (rake)</option></select></label>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Fading">
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="inst-frame" />
        {[-10, -20].map((v) => <line key={v} x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(v)} y2={fy(v)} className="inst-goal" />)}
        <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(0)} y2={fy(0)} className="inst-annot" />
        <polyline points={poly(strip.length, (i) => fx((i * LEN_M) / (strip.length - 1)), (i) => fy(strip[i]))} className="inst-line c1" />
        {[10, 0, -10, -20, -30].map((v) => <text key={v} x={PAD.l - 6} y={fy(v) + 4} textAnchor="end" className="inst-axis">{v}</text>)}
        {[0, 10, 20, 30].map((m) => <text key={m} x={fx(m)} y={PH - PAD.b + 12} textAnchor="middle" className="inst-axis">{m}</text>)}
        <text x={PAD.l + INNER_W / 2} y={PH - 3} textAnchor="middle" className="inst-axis">metres along the street (dB against the average)</text>
      </svg>
      <dl className="inst-meter">
        <div><dt>More than 10 dB down, 2 km of street</dt><dd>{(100 * below).toFixed(1)}%</dd></div>
        <div><dt>Formula</dt><dd>{(100 * rakeFadeProbability(10, paths)).toFixed(1)}%</dd></div>
      </dl>
    </section>
  );
}
