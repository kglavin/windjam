import { freeSpaceDb, hataUrbanDb, microcellDb } from '../../../engine/lab/urban';
import { INNER_H, INNER_W, PAD, PH, PW, poly } from './plot';

// Level 11 B1: path loss against distance at 450 MHz: free space, a street microcell (antennas 10 m and 1.5 m),
// Hata from a 30 m mast, and Hata into a building (+15 dB).
export function UrbanLossPlot() {
  const f = 450;
  const xs = Array.from({ length: 120 }, (_, i) => 0.2 + (4.8 * i) / 119);
  const lines = [
    { name: 'free space', c: 'c4', db: xs.map((d) => freeSpaceDb(f, d)) },
    { name: 'street (microcell)', c: 'c3', db: xs.map((d) => microcellDb(f, d, 10, 1.5)) },
    { name: 'over rooftops (Hata)', c: 'c1', db: xs.map((d) => hataUrbanDb(f, d, 30, 1.5)) },
    { name: 'into a building', c: 'c6', db: xs.map((d) => hataUrbanDb(f, d, 30, 1.5) + 15) },
  ];
  const lo = 70;
  const hi = 170;
  const fx = (d: number) => PAD.l + ((d - 0.2) / 4.8) * INNER_W;
  const fy = (v: number) => PAD.t + ((v - lo) / (hi - lo)) * INNER_H;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Path loss at 450 MHz</h3>
        <span className="inst-legend">{lines.map((l) => <span key={l.name} className={l.c}><i className="sw" />{l.name}</span>)}</span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Urban path loss">
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="inst-frame" />
        {[80, 100, 120, 140, 160].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(v)} y2={fy(v)} className="inst-grid" />
            <text x={PAD.l - 4} y={fy(v) + 3} textAnchor="end" className="inst-axis">{v}</text>
          </g>
        ))}
        {[1, 2, 3, 4, 5].map((d) => <text key={d} x={fx(d)} y={PH - PAD.b + 12} textAnchor="middle" className="inst-axis">{d}</text>)}
        {lines.map((l) => <polyline key={l.name} points={poly(xs.length, (i) => fx(xs[i]), (i) => fy(l.db[i]))} className={`inst-line ${l.c}`} />)}
        <text x={PAD.l + INNER_W / 2} y={PH - 3} textAnchor="middle" className="inst-axis">distance (km); loss (dB), more loss lower down</text>
      </svg>
    </section>
  );
}
