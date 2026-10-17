import { useMemo, useState } from 'react';
import { autocorrelation, fluctuation } from '../../../engine/lab/measure';
import type { IQ } from '../../../engine/lab/signal';
import { Axes } from './Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks, plotX, poly } from './plot';

const LAGS = [50, 100, 200, 500, 1000]; // µs
const WINDOWS = [50, 100, 200, 500, 1000]; // µs

// Autocorrelation |R(tau)| or the fluctuation display, over the preamble or the data.
export function Autocorr({ x, sampleRateHz, preambleSamples, annotations, initialMaxLagUs = 1000 }: {
  x: IQ;
  sampleRateHz: number;
  preambleSamples?: number;
  annotations?: { lagUs: number; label: string }[];
  initialMaxLagUs?: number; // the longest lag first by default, so a long code period is never off the plot
}) {
  const [mode, setMode] = useState<'acf' | 'fluct'>('acf');
  const [win, setWin] = useState<'preamble' | 'data'>(preambleSamples ? 'preamble' : 'data');
  const [maxLagUs, setMaxLagUs] = useState(initialMaxLagUs);
  const [fluctUs, setFluctUs] = useState(200);
  const [hover, setHover] = useState<number | null>(null); // lag in samples

  const pre = Math.min(preambleSamples ?? 0, x.re.length);
  const from = win === 'preamble' ? 0 : pre;
  const to = win === 'preamble' ? pre : x.re.length;
  const usPerSample = 1e6 / sampleRateHz;
  const maxLag = Math.max(1, Math.min(Math.round(maxLagUs / usPerSample), to - from - 1));

  const y = useMemo(() => {
    if (to - from < 4) return new Float64Array(maxLag + 1);
    if (mode === 'acf') return autocorrelation(x, maxLag, from, to).mag;
    const wl = Math.max(maxLag + 1, Math.round(fluctUs / usPerSample));
    return fluctuation(x, Math.min(wl, to - from), maxLag, from, to);
  }, [x, mode, maxLag, from, to, fluctUs, usPerSample]);

  const top = mode === 'acf' ? 1 : 1;
  const fx = (lag: number) => PAD.l + (lag / maxLag) * INNER_W;
  const fy = (v: number) => PAD.t + ((top - v) / top) * INNER_H;
  const hv = hover === null ? null : { lag: hover, v: y[hover] };

  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Autocorrelation</h3>
        <label>
          <select value={mode} onChange={(e) => setMode(e.target.value as 'acf' | 'fluct')}>
            <option value="acf">|R(τ)|</option>
            <option value="fluct">fluctuation</option>
          </select>
        </label>
        <label>
          Window{' '}
          <select value={win} onChange={(e) => setWin(e.target.value as 'preamble' | 'data')}>
            <option value="preamble" disabled={!pre}>preamble</option>
            <option value="data">data</option>
          </select>
        </label>
        <label>
          Max lag{' '}
          <select value={maxLagUs} onChange={(e) => setMaxLagUs(Number(e.target.value))}>
            {LAGS.map((l) => (
              <option key={l} value={l}>{l} µs</option>
            ))}
          </select>
        </label>
        {mode === 'fluct' && (
          <label>
            Fluctuation window{' '}
            <select value={fluctUs} onChange={(e) => setFluctUs(Number(e.target.value))}>
              {WINDOWS.map((l) => (
                <option key={l} value={l}>{l} µs</option>
              ))}
            </select>
          </label>
        )}
        <span className="inst-readout">
          {hv ? `τ ${(hv.lag * usPerSample).toFixed(2)} µs, ${hv.lag} samples, ${hv.v.toFixed(3)}` : 'move over the plot'}
        </span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Autocorrelation">
        <Axes
          xTicks={niceTicks(0, maxLag * usPerSample, 8)}
          yTicks={niceTicks(0, top, 5)}
          fx={(t) => fx(t / usPerSample)}
          fy={fy}
          xLabel="Lag (µs)"
          yLabel={mode === 'acf' ? '|R(τ)| / R(0)' : 'mean |R|² over windows'}
        />
        <polyline points={poly(y.length, (i) => fx(i), (i) => fy(Math.min(top, y[i])))} className="inst-line c1" />
        {annotations?.filter((a) => a.lagUs / usPerSample <= maxLag).map((a, i) => (
          <g key={`${a.lagUs}`}>
            <line x1={fx(a.lagUs / usPerSample)} x2={fx(a.lagUs / usPerSample)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-annot" />
            {/* Labels step down one line each so close-spaced periods stay readable. */}
            <text x={fx(a.lagUs / usPerSample) + 4} y={PAD.t + 10 + 12 * i} textAnchor="start" className="inst-annot-label">{a.label}</text>
          </g>
        ))}
        {hv && <line x1={fx(hv.lag)} x2={fx(hv.lag)} y1={PAD.t} y2={PAD.t + INNER_H} className="inst-cursor" />}
        <rect
          x={PAD.l}
          y={PAD.t}
          width={INNER_W}
          height={INNER_H}
          fill="transparent"
          onMouseMove={(e) => setHover(Math.max(0, Math.min(maxLag, Math.round(((plotX(e) - PAD.l) / INNER_W) * maxLag))))}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
    </section>
  );
}
