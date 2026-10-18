import { useMemo, useState } from 'react';
import { coverageMarginDb, jsSamples, jsSpreadDb } from '../../../engine/lab/urban';
import { INNER_H, INNER_W, PAD, PH, PW } from './plot';

// Level 11 C1: J/S at 2000 spots when both paths are shadowed, planned at the need plus the margin for a share of
// spots. Sliders for the two σ and the share.
export function ShadowHist() {
  const [sj, setSj] = useState(8);
  const [ss, setSs] = useState(8);
  const [share, setShare] = useState(0.9);
  const need = 5;
  const spread = jsSpreadDb(sj, ss);
  const margin = coverageMarginDb(spread, share);
  const mean = need + margin;
  const s = useMemo(() => jsSamples(mean, sj, ss, 2000, 7), [mean, sj, ss]);
  const lo = -30;
  const hi = 60;
  const bins = 45;
  const counts = new Array<number>(bins).fill(0);
  for (const v of s) counts[Math.max(0, Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins)))]++;
  const top = Math.max(...counts);
  const fx = (v: number) => PAD.l + ((v - lo) / (hi - lo)) * INNER_W;
  const above = s.filter((v) => v >= need).length / s.length;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>J/S over 2000 spots in town</h3>
        <label>σ jammer path <input type="range" min={0} max={12} value={sj} onChange={(e) => setSj(Number(e.target.value))} aria-label="Jammer sigma" /> {sj} dB</label>
        <label>σ signal path <input type="range" min={0} max={12} value={ss} onChange={(e) => setSs(Number(e.target.value))} aria-label="Signal sigma" /> {ss} dB</label>
        <label>Spots <select value={share} onChange={(e) => setShare(Number(e.target.value))}><option value={0.9}>90%</option><option value={0.95}>95%</option><option value={0.99}>99%</option></select></label>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Shadowing">
        <rect x={PAD.l} y={PAD.t} width={INNER_W} height={INNER_H} className="inst-frame" />
        {counts.map((c, i) => (
          <rect key={i} x={PAD.l + (i * INNER_W) / bins + 1} width={INNER_W / bins - 2} y={PAD.t + INNER_H * (1 - c / top)} height={(INNER_H * c) / top}
            className={lo + ((i + 0.5) * (hi - lo)) / bins >= need ? 'shadow-ok' : 'shadow-bad'} />
        ))}
        <line x1={fx(need)} x2={fx(need)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-goal" />
        <line x1={fx(mean)} x2={fx(mean)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-annot" />
        <text x={fx(need) + 4} y={PAD.t + 12} className="inst-annot-label">need {need} dB</text>
        <text x={fx(mean) + 4} y={PAD.t + 24} className="inst-annot-label">planned {mean.toFixed(1)} dB</text>
        {[-20, 0, 20, 40, 60].map((v) => <text key={v} x={fx(v)} y={PH - PAD.b + 12} textAnchor="middle" className="inst-axis">{v}</text>)}
        <text x={PAD.l + INNER_W / 2} y={PH - 3} textAnchor="middle" className="inst-axis">J/S at a spot (dB)</text>
      </svg>
      <dl className="inst-meter">
        <div><dt>Spread</dt><dd>{spread.toFixed(1)} dB</dd></div>
        <div><dt>Margin</dt><dd>{margin.toFixed(1)} dB</dd></div>
        <div><dt>Spots at or above the need</dt><dd>{(100 * above).toFixed(1)}%</dd></div>
      </dl>
    </section>
  );
}
