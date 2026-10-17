import { useMemo, useState } from 'react';
import { toDb, welchPsd } from '../../../engine/lab/measure';
import type { IQ } from '../../../engine/lab/signal';
import { Axes } from './Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks, plotX, poly } from './plot';

const NFFTS = [256, 1024, 4096];

// Welch power spectrum in dB, MHz relative to the carrier, with a click-to-place marker.
export function Spectrum({ x, sampleRateHz }: { x: IQ; sampleRateHz: number }) {
  const [nfft, setNfft] = useState(1024);
  const [marker, setMarker] = useState<number | null>(null); // frequency in MHz
  const spec = useMemo(() => {
    const { freq, psd } = welchPsd(x, nfft);
    const db = toDb(psd);
    const mhz = Array.from(freq, (f) => (f * sampleRateHz) / 1e6);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of db) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const top = Math.ceil(hi / 10) * 10 + 10;
    return { mhz, db, top, bottom: Math.max(Math.floor(lo / 10) * 10, top - 90) };
  }, [x, nfft, sampleRateHz]);

  const half = sampleRateHz / 2e6;
  const fx = (v: number) => PAD.l + ((v + half) / (2 * half)) * INNER_W;
  const fy = (v: number) => PAD.t + ((spec.top - v) / (spec.top - spec.bottom)) * INNER_H;
  const mk = useMemo(() => {
    if (marker === null) return null;
    let best = 0;
    for (let i = 1; i < spec.mhz.length; i++) {
      if (Math.abs(spec.mhz[i] - marker) < Math.abs(spec.mhz[best] - marker)) best = i;
    }
    return { f: spec.mhz[best], level: spec.db[best] };
  }, [marker, spec]);

  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Spectrum</h3>
        <label>
          RBW{' '}
          <select value={nfft} onChange={(e) => setNfft(Number(e.target.value))}>
            {NFFTS.map((n) => (
              <option key={n} value={n}>{((sampleRateHz / n) / 1e3).toFixed(1)} kHz</option>
            ))}
          </select>
        </label>
        <span className="inst-readout">{mk ? `${mk.f.toFixed(3)} MHz, ${mk.level.toFixed(1)} dB` : 'click to place marker'}</span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Spectrum">
        <Axes
          xTicks={niceTicks(-half, half, 8)}
          yTicks={niceTicks(spec.bottom, spec.top, 6)}
          fx={fx}
          fy={fy}
          xLabel="Frequency from carrier (MHz)"
          yLabel="Level (dB per bin)"
        />
        <polyline points={poly(spec.mhz.length, (i) => fx(spec.mhz[i]), (i) => fy(spec.db[i]))} className="inst-line c1" />
        {mk && (
          <g>
            <line x1={fx(mk.f)} x2={fx(mk.f)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-cursor" />
            <circle cx={fx(mk.f)} cy={fy(mk.level)} r={3.5} className="inst-marker" />
          </g>
        )}
        <rect
          x={PAD.l}
          y={PAD.t}
          width={INNER_W}
          height={INNER_H}
          fill="transparent"
          onClick={(e) => setMarker(((plotX(e) - PAD.l) / INNER_W) * 2 * half - half)}
        />
      </svg>
    </section>
  );
}
