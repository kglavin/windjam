import { useMemo, useState } from 'react';
import { toDb, welchPsd } from '../../../engine/lab/measure';
import type { IQ } from '../../../engine/lab/signal';
import { Axes } from './Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks, plotX, poly } from './plot';

const NFFTS = [64, 128, 256, 1024, 4096];

// Welch power spectrum in dB, MHz relative to the carrier, with a click-to-place marker.
export function Spectrum({ x, sampleRateHz, annotations, title = 'Spectrum', envelope }: {
  x: IQ;
  sampleRateHz: number;
  annotations?: { xMHz: number; label: string }[];
  title?: string;
  envelope?: { chipRateMHz: number }; // dashed sinc² curve, levelled to the measured mean inside |f| < Rc/2
}) {
  const [nfft, setNfft] = useState(128);
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

  const env = useMemo(() => {
    if (!envelope) return null;
    const rc = envelope.chipRateMHz;
    const sinc2 = (f: number) => {
      const a = Math.PI * (f / rc);
      return Math.abs(a) < 1e-9 ? 1 : (Math.sin(a) / a) ** 2;
    };
    let sum = 0;
    let n = 0;
    for (let i = 0; i < spec.mhz.length; i++) {
      if (Math.abs(spec.mhz[i]) < 0.5 * rc) {
        sum += spec.db[i] - 10 * Math.log10(sinc2(spec.mhz[i]));
        n++;
      }
    }
    const off = n > 0 ? sum / n : 0;
    return { mhz: spec.mhz, db: Array.from(spec.mhz, (f) => 10 * Math.log10(Math.max(sinc2(f), 1e-6)) + off) };
  }, [envelope, spec]);

  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>{title}</h3>
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
        {env && (
          <g>
            <polyline
              points={poly(env.mhz.length, (i) => fx(env.mhz[i]), (i) => fy(Math.max(env.db[i], spec.bottom)))}
              className="inst-envelope"
            />
            <text x={fx(0) + 6} y={PAD.t + 22} className="inst-envelope-label">envelope</text>
          </g>
        )}
        {annotations?.filter((a) => Math.abs(a.xMHz) <= half).map((a) => (
          <g key={`${a.xMHz}`}>
            <line x1={fx(a.xMHz)} x2={fx(a.xMHz)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-annot" />
            <text x={fx(a.xMHz)} y={PAD.t + 10} textAnchor="middle" className="inst-annot-label">{a.label}</text>
          </g>
        ))}
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
