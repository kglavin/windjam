import { useState } from 'react';
import { type PacketLink, SYNC_EXAMPLE, searchTrace, thresholdFor } from '../../../engine/lab/sync';
import { INNER_H, INNER_W, PAD, PH, PW } from './plot';

// Level 8 D1: the sliding correlator searching one packet. One bar per test (code phase), the threshold line, and the
// test where it locked. "Search again" draws another packet.
export function AcquireView({ link = SYNC_EXAMPLE }: { link?: PacketLink }) {
  const [seed, setSeed] = useState(3);
  const tr = searchTrace(link, seed);
  const thr = thresholdFor(link.pfaCell);
  const top = 8;
  const bw = INNER_W / link.preamblePeriods;
  const fy = (v: number) => PAD.t + ((top - Math.max(-2, Math.min(top, v))) / (top + 2)) * INNER_H;
  const last = tr.z.length - 1;
  const result = tr.locked ? `locked on test ${tr.z.length}` : tr.falseLock ? `false lock on test ${tr.z.length}` : 'no lock: packet lost';
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Sliding correlator: {link.n} phases, one test per code period</h3>
        <button type="button" onClick={() => setSeed((s) => s + 1)}>Search again</button>
        <span className="inst-readout">{result}</span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Acquisition search">
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="inst-frame" />
        <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(thr)} y2={fy(thr)} className="inst-goal" />
        <text x={PAD.l + INNER_W - 4} y={fy(thr) - 4} textAnchor="end" className="inst-annot-label">threshold {thr.toFixed(2)}</text>
        <line x1={PAD.l} x2={PAD.l + INNER_W} y1={fy(0)} y2={fy(0)} className="inst-grid" />
        {tr.z.map((v, i) => (
          <rect key={i} x={PAD.l + i * bw + 1} width={bw - 2} y={Math.min(fy(v), fy(0))} height={Math.abs(fy(v) - fy(0))}
            className={i === last && (tr.locked || tr.falseLock) ? (tr.locked ? 'acq-lock' : 'acq-false') : 'acq-test'} />
        ))}
        {[0, 2, 4, 6, 8].map((v) => <text key={v} x={PAD.l - 4} y={fy(v) + 3} textAnchor="end" className="inst-axis">{v}</text>)}
        <text x={PAD.l + INNER_W / 2} y={PH - 3} textAnchor="middle" className="inst-axis">test (code phase tried), 1 to {link.preamblePeriods}</text>
      </svg>
    </section>
  );
}
