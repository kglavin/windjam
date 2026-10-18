import { INNER_H, INNER_W, PAD, PH, PW, poly } from './plot';

// Level 8 E1: early and late correlators half a chip either side of the prompt one. Their difference, the S-curve,
// is zero on time, positive when the receiver is early and negative when it is late, so it steers the timing back.
const R = (tau: number) => Math.max(0, 1 - Math.abs(tau)); // a chip's correlation with itself, offset tau chips
export function SCurveView() {
  const xs = Array.from({ length: 241 }, (_, i) => -1.5 + (3 * i) / 240);
  const fx = (t: number) => PAD.l + ((t + 1.5) / 3) * INNER_W;
  const fy = (v: number) => PAD.t + ((1.1 - v) / 2.2) * INNER_H;
  const early = xs.map((t) => R(t + 0.5));
  const late = xs.map((t) => R(t - 0.5));
  const diff = xs.map((_, i) => early[i] - late[i]);
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Tracking: early − late</h3>
        <span className="inst-legend">
          <span className="c2"><i className="sw" />early</span>
          <span className="c3"><i className="sw" />late</span>
          <span className="c1"><i className="sw" />early − late</span>
        </span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="S-curve">
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="inst-frame" />
        <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(0)} y2={fy(0)} className="inst-grid" />
        <line x1={fx(0)} x2={fx(0)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-grid" />
        <polyline points={poly(xs.length, (i) => fx(xs[i]), (i) => fy(early[i]))} className="inst-line c2" />
        <polyline points={poly(xs.length, (i) => fx(xs[i]), (i) => fy(late[i]))} className="inst-line c3" />
        <polyline points={poly(xs.length, (i) => fx(xs[i]), (i) => fy(diff[i]))} className="inst-line c1" />
        {[-1, -0.5, 0, 0.5, 1].map((t) => <text key={t} x={fx(t)} y={PH - PAD.b + 12} textAnchor="middle" className="inst-axis">{t}</text>)}
        <text x={PAD.l + INNER_W / 2} y={PH - 3} textAnchor="middle" className="inst-axis">timing error (chips): negative = receiver early</text>
      </svg>
    </section>
  );
}
