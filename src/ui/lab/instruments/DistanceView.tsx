import { INNER_H, INNER_W, PAD, PH, PW, poly } from './plot';

// Level 9 B1: J/S at the enemy receiver against the jammer's distance, near the ground (40·log10), for a 200 W
// vehicle and a 10 W pack. The pack reaches the vehicle's J/S at 20 km by standing at 20 ÷ 20^(1/4) = 9.5 km.
export function DistanceView() {
  const ref = { km: 20, jsDb: 0 }; // the vehicle at 20 km: J/S 0 dB on this plot
  const packDb = 10 * Math.log10(10 / 200);
  const js = (km: number, offset: number) => ref.jsDb + offset + 40 * Math.log10(ref.km / km);
  const x0 = 2;
  const x1 = 30;
  const y0 = -25;
  const y1 = 25;
  const fx = (km: number) => PAD.l + ((km - x0) / (x1 - x0)) * INNER_W;
  const fy = (db: number) => PAD.t + ((y1 - Math.max(y0, Math.min(y1, db))) / (y1 - y0)) * INNER_H;
  const xs = Array.from({ length: 141 }, (_, i) => x0 + ((x1 - x0) * i) / 140);
  const packKm = 20 / 20 ** 0.25;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>J/S against the jammer's distance, near the ground</h3>
        <span className="inst-legend">
          <span className="c1"><i className="sw" />vehicle, 200 W</span>
          <span className="c2"><i className="sw" />pack, 10 W</span>
        </span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="J/S against distance">
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="inst-frame" />
        {[-20, -10, 0, 10, 20].map((d) => (
          <g key={d}>
            <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(d)} y2={fy(d)} className="inst-grid" />
            <text x={PAD.l - 4} y={fy(d) + 3} textAnchor="end" className="inst-axis">{d}</text>
          </g>
        ))}
        {[5, 10, 15, 20, 25, 30].map((k) => <text key={k} x={fx(k)} y={PH - PAD.b + 12} textAnchor="middle" className="inst-axis">{k}</text>)}
        <polyline points={poly(xs.length, (i) => fx(xs[i]), (i) => fy(js(xs[i], 0)))} className="inst-line c1" />
        <polyline points={poly(xs.length, (i) => fx(xs[i]), (i) => fy(js(xs[i], packDb)))} className="inst-line c2" />
        <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(0)} y2={fy(0)} className="inst-goal" />
        <circle cx={fx(20)} cy={fy(0)} r={4} className="inst-marker" />
        <circle cx={fx(packKm)} cy={fy(0)} r={4} className="inst-marker" />
        <text x={fx(packKm) + 6} y={fy(0) - 6} className="inst-annot-label">{`pack at ${packKm.toFixed(1)} km`}</text>
        <text x={fx(20) + 6} y={fy(0) - 6} className="inst-annot-label">vehicle at 20 km</text>
        <text x={PAD.l + INNER_W / 2} y={PH - 3} textAnchor="middle" className="inst-axis">jammer to receiver (km); J/S in dB, relative</text>
      </svg>
    </section>
  );
}
