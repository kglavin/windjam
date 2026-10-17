import { useMemo } from 'react';
import { histogram } from '../../../engine/lab/measure';
import { Axes } from './Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks } from './plot';

const BINS = 80;
const STRIP = 200;
const SH = 130;

// Histogram of integrate-and-dump outputs over [-2, 2], and corr against bit index for the first 200 bits.
export function Correlator({ corr }: { corr: Float32Array }) {
  const h = useMemo(() => histogram(corr, BINS, -2, 2), [corr]);
  const maxCount = Math.max(1, ...h.counts);
  const fx = (v: number) => PAD.l + ((v + 2) / 4) * INNER_W;
  const fy = (c: number) => PAD.t + (1 - c / maxCount) * INNER_H;
  const n = Math.min(STRIP, corr.length);
  const sx = (i: number) => PAD.l + ((i + 0.5) / STRIP) * INNER_W;
  const sy = (v: number) => PAD.t + ((2 - Math.max(-2, Math.min(2, v))) / 4) * (SH - PAD.t - PAD.b);

  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Correlator output</h3>
        <span className="inst-readout">{corr.length} bits</span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Correlator histogram">
        <Axes
          xTicks={niceTicks(-2, 2, 8)}
          yTicks={niceTicks(0, maxCount, 4)}
          fx={fx}
          fy={fy}
          xLabel="Correlator output (+1 / -1 are the ideal bits)"
          yLabel="Count"
        />
        {Array.from(h.counts, (c, i) => (
          <rect key={i} x={fx(h.edges[i])} y={fy(c)} width={INNER_W / BINS - 1} height={PAD.t + INNER_H - fy(c)} className="inst-bar" />
        ))}
      </svg>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${SH}`} role="img" aria-label="Correlator strip">
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={SH - PAD.t - PAD.b} className="inst-frame" />
        {[-1, 0, 1].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={PAD.l + INNER_W} y1={sy(v)} y2={sy(v)} className="inst-grid" />
            <text x={PAD.l - 4} y={sy(v) + 3} textAnchor="end" className="inst-axis">{v}</text>
          </g>
        ))}
        {[0, 50, 100, 150, 200].map((i) => (
          <text key={i} x={sx(i)} y={SH - 16} textAnchor="middle" className="inst-axis">{i}</text>
        ))}
        <text x={PAD.l + INNER_W / 2} y={SH - 3} textAnchor="middle" className="inst-axis">Bit index</text>
        {Array.from({ length: n }, (_, i) => (
          <circle key={i} cx={sx(i)} cy={sy(corr[i])} r={2} className={corr[i] >= 0 ? 'inst-dot c1' : 'inst-dot c2'} />
        ))}
      </svg>
    </section>
  );
}
