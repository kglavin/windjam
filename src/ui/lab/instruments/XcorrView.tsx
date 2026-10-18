import { useState } from 'react';
import type { Xcorr } from '../../../engine/lab/levels';
import { Axes } from './Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks, plotX, poly } from './plot';

// Level 6: the cross-correlation of two sites' captures against lag. Hover reads the lag; the peak is marked once
// the step allows it.
export function XcorrView({ data, title = 'Cross-correlation', markPeak = false, names = ['A', 'B'] }: {
  data: Xcorr;
  title?: string;
  markPeak?: boolean;
  names?: [string, string];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = data.points;
  const lo = pts[0].lagUs;
  const hi = pts[pts.length - 1].lagUs;
  const fx = (us: number) => PAD.l + ((us - lo) / (hi - lo)) * INNER_W;
  const fy = (v: number) => PAD.t + (1 - Math.min(1, v)) * INNER_H;
  const hv = hover === null ? null : pts[hover];
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{title}</h3>
        <span>{names[1]} against {names[0]}: a positive lag means {names[1]} heard it later</span>
        <span className="inst-readout">{hv ? `lag ${hv.lagUs.toFixed(2)} µs, |R| ${hv.mag.toFixed(2)}` : 'hover to read'}</span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label={title}>
        <Axes xTicks={niceTicks(lo, hi, 9)} yTicks={niceTicks(0, 1, 5)} fx={fx} fy={fy} xLabel="Lag (µs)" yLabel="|R|" />
        <polyline points={poly(pts.length, (i) => fx(pts[i].lagUs), (i) => fy(pts[i].mag))} className="inst-line c1" />
        {markPeak && (
          <g>
            <line x1={fx(data.peakUs)} x2={fx(data.peakUs)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-annot" />
            <text x={fx(data.peakUs) + 4} y={PAD.t + 10} className="inst-annot-label">{`peak ${Number(data.peakUs.toFixed(2))} µs`}</text>
          </g>
        )}
        {hv && <line x1={fx(hv.lagUs)} x2={fx(hv.lagUs)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-cursor" />}
        <rect
          x={PAD.l}
          y={PAD.t}
          width={INNER_W}
          height={INNER_H}
          fill="transparent"
          onMouseMove={(e) => {
            const us = lo + ((plotX(e) - PAD.l) / INNER_W) * (hi - lo);
            const i = Math.round(((us - lo) / (hi - lo)) * (pts.length - 1));
            setHover(Math.max(0, Math.min(pts.length - 1, i)));
          }}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
    </section>
  );
}
