import { goldCode, periodicAutocorrelation, periodicCrossCorrelation } from '../../../engine/lab/pn';
import { INNER_H, INNER_W, PAD, PH, PW } from './plot';

// Level 8 C1: a Gold code against itself (one peak of 31) and against another of its family (only −1, −9 and +7).
export function GoldView({ degree = 5 }: { degree?: number }) {
  const a = goldCode(degree, 2);
  const b = goldCode(degree, 7);
  const auto = Array.from(periodicAutocorrelation(a));
  const cross = Array.from(periodicCrossCorrelation(a, b));
  const n = a.length;
  const fy = (v: number) => PAD.t + ((n - v) / (n + 12)) * INNER_H;
  const bw = INNER_W / n;
  const bars = (vals: number[], cls: string, off: number) =>
    vals.map((v, i) => (
      <rect key={`${cls}${i}`} x={PAD.l + i * bw + off} width={bw / 2 - 1} y={Math.min(fy(v), fy(0))} height={Math.abs(fy(v) - fy(0))} className={cls} />
    ));
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Gold codes, {n} chips</h3>
        <span className="inst-legend">
          <span className="c1"><i />code with itself</span>
          <span className="c2"><i />code with another of the family</span>
        </span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Gold code correlations">
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="inst-frame" />
        {[n, 7, 0, -1, -9].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(v)} y2={fy(v)} className="inst-grid" />
            <text x={PAD.l - 4} y={fy(v) + 3} textAnchor="end" className="inst-axis">{v}</text>
          </g>
        ))}
        {bars(auto, 'gold-auto', 0)}
        {bars(cross, 'gold-cross', bw / 2)}
        <text x={PAD.l + INNER_W / 2} y={PH - 3} textAnchor="middle" className="inst-axis">offset (chips), 0 to {n - 1}</text>
      </svg>
    </section>
  );
}
