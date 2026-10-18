import { useState } from 'react';
import { type FhJammer, type FhLink, type HopRecord, FH_F0_MHZ, jammedChannels } from '../../../engine/lab/fh';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks } from './plot';

// Level 7's hop waterfall (docs/design-level-7.md section 3): time across, frequency up, one tile per hop. The
// jammer's coverage is drawn over the band; after a run, hops with errors turn red. Hover reads a hop.

const fmtMHz = (v: number) => v.toFixed(3);

export function Waterfall({ link, hops, ran = false, jammer, title = 'Hop waterfall' }: {
  link: FhLink;
  hops: HopRecord[];
  ran?: boolean; // the hops come from a run: colour them by errors
  jammer?: FhJammer;
  title?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = link.channels;
  const wMHz = link.rateKbps / 1000;
  const top = FH_F0_MHZ + n * wMHz;
  const tEnd = hops.length ? hops[hops.length - 1].startMs + hops[hops.length - 1].durMs : 1;
  const fx = (ms: number) => PAD.l + (ms / tEnd) * INNER_W;
  const fy = (mhz: number) => PAD.t + ((top - mhz) / (top - FH_F0_MHZ)) * INNER_H;
  const rowY = (c: number) => fy(FH_F0_MHZ + (c + 1) * wMHz);
  const rowH = Math.max(1.5, INNER_H / n);
  const yTicks = niceTicks(FH_F0_MHZ, top, 5).filter((v) => v > FH_F0_MHZ + 1e-9 && v < top - 1e-9);
  const hv = hover === null ? null : hops[hover];
  const jammedCount = hops.filter((h) => h.jammedFrom !== undefined).length;
  const hit = hops.filter((h) => h.errors > 0).length;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{title}</h3>
        <span className="inst-legend">
          <span className="c1"><i />hop</span>
          {jammer && jammer.kind !== 'none' && <span className="c6"><i />jammer</span>}
          {ran && <span className="c6"><i className="hollow" />hop with errors</span>}
        </span>
        <span className="inst-readout">
          {hv ? `${fmtMHz(FH_F0_MHZ + (hv.channel + 0.5) * wMHz)} MHz, ${hv.startMs.toFixed(1)} to ${(hv.startMs + hv.durMs).toFixed(1)} ms` : 'hover a hop'}
        </span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label={title}>
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="inst-frame" />
        {niceTicks(0, tEnd, 8).map((t) => (
          <g key={`x${t}`}>
            <line x1={fx(t)} x2={fx(t)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-grid" />
            <text x={fx(t)} y={PH - PAD.b + 12} textAnchor="middle" className="inst-axis">{Number(t.toFixed(2))}</text>
          </g>
        ))}
        {[FH_F0_MHZ, ...yTicks, top].map((v) => (
          <text key={`y${v}`} x={PAD.l - 4} y={fy(v) + 3} textAnchor="end" className="inst-axis">{fmtMHz(v)}</text>
        ))}
        <text x={PAD.l + INNER_W / 2} y={PH - 3} textAnchor="middle" className="inst-axis">Time (ms)</text>
        <text x={10} y={PAD.t + INNER_H / 2} textAnchor="middle" className="inst-axis" transform={`rotate(-90 10 ${PAD.t + INNER_H / 2})`}>MHz</text>
        {jammer?.kind === 'bbn' && <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="wf-jam" />}
        {jammer?.kind === 'partial' && (
          <rect x={PAD.l} y={rowY(jammedChannels(n, jammer.rho) - 1)} width={INNER_W} height={fy(FH_F0_MHZ) - rowY(jammedChannels(n, jammer.rho) - 1)} className="wf-jam" />
        )}
        {jammer?.kind === 'sweep' &&
          Array.from({ length: 200 }, (_, i) => {
            const t = ((i + 0.5) / 200) * tEnd;
            const p = ((t / jammer.sweepMs) % 1) * n;
            return Array.from({ length: jammer.widthChannels }, (_, k) => (
              <rect key={`s${i}-${k}`} x={fx((i / 200) * tEnd)} width={INNER_W / 200 + 0.5} y={rowY(Math.floor(p + k) % n)} height={rowH} className="wf-jam" />
            ));
          })}
        {hops.map((h, i) => {
          const x = fx(h.startMs);
          const w = Math.max(1, fx(h.startMs + h.durMs) - x - 0.6);
          const y = rowY(h.channel);
          return (
            <g key={h.index} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={y} width={w} height={rowH} className={ran && h.errors > 0 ? 'wf-hop wf-hit' : 'wf-hop'} />
              {h.jammedFrom !== undefined && (
                <rect x={x + h.jammedFrom * w} y={y} width={w * (1 - h.jammedFrom)} height={rowH} className="wf-hop-jam" />
              )}
            </g>
          );
        })}
      </svg>
      <dl className="inst-meter">
        <div><dt>Band</dt><dd>{fmtMHz(FH_F0_MHZ)} to {fmtMHz(top)} MHz</dd></div>
        <div><dt>Hops shown</dt><dd>{hops.length}</dd></div>
        {jammer && jammer.kind !== 'none' && <div><dt>Hops the jammer reaches</dt><dd>{jammedCount}</dd></div>}
        {ran && <div><dt>Hops with errors</dt><dd>{hit}</dd></div>}
      </dl>
    </section>
  );
}
