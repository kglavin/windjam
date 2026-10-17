import { useMemo, useState } from 'react';
import type { IQ } from '../../../engine/lab/signal';
import { Axes } from './Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks, poly } from './plot';

const SPANS = [5, 20, 50, 200, 1000]; // µs
const MAX_POINTS = 1200;

// I, Q and envelope against time.
export function Trace({ x, sampleRateHz }: { x: IQ; sampleRateHz: number }) {
  const [span, setSpan] = useState(20);
  const [start, setStart] = useState(0); // µs
  const totalUs = (x.re.length / sampleRateHz) * 1e6;
  const spanUs = Math.min(span, totalUs);
  const startUs = Math.min(start, Math.max(0, totalUs - spanUs));
  const d = useMemo(() => {
    const i0 = Math.floor((startUs * sampleRateHz) / 1e6);
    const n = Math.max(2, Math.min(x.re.length - i0, Math.round((spanUs * sampleRateHz) / 1e6)));
    const stride = Math.max(1, Math.floor(n / MAX_POINTS));
    const idx: number[] = [];
    let peak = 0.1;
    for (let k = 0; k < n; k += stride) {
      const i = i0 + k;
      idx.push(i);
      peak = Math.max(peak, Math.abs(x.re[i]), Math.abs(x.im[i]));
    }
    const lim = Math.ceil(peak * 2) / 2;
    return { i0, idx, lim };
  }, [x, startUs, spanUs, sampleRateHz]);

  const fx = (i: number) => PAD.l + (((i - d.i0) / sampleRateHz) * 1e6 / spanUs) * INNER_W;
  const fy = (v: number) => PAD.t + ((d.lim - v) / (2 * d.lim)) * INNER_H;
  const line = (f: (i: number) => number) => poly(d.idx.length, (k) => fx(d.idx[k]), (k) => fy(f(d.idx[k])));

  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Time trace</h3>
        <label>
          Span{' '}
          <select value={span} onChange={(e) => setSpan(Number(e.target.value))}>
            {SPANS.map((s) => (
              <option key={s} value={s}>{s} µs</option>
            ))}
          </select>
        </label>
        <label>
          Start{' '}
          <input
            type="range"
            min={0}
            max={Math.max(0, Math.floor(totalUs - spanUs))}
            step={Math.max(0.5, spanUs / 20)}
            value={startUs}
            onChange={(e) => setStart(Number(e.target.value))}
          />{' '}
          {startUs.toFixed(1)} µs
        </label>
        <span className="inst-legend"><i className="c1" />I <i className="c2" />Q <i className="c3" />|x|</span>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Time trace">
        <Axes
          xTicks={niceTicks(startUs, startUs + spanUs, 8).map((t) => t)}
          yTicks={niceTicks(-d.lim, d.lim, 4)}
          fx={(t) => PAD.l + ((t - startUs) / spanUs) * INNER_W}
          fy={fy}
          xLabel="Time (µs)"
          yLabel="Amplitude (signal = 1)"
        />
        <polyline points={line((i) => Math.hypot(x.re[i], x.im[i]))} className="inst-line c3" />
        <polyline points={line((i) => x.re[i])} className="inst-line c1" />
        <polyline points={line((i) => x.im[i])} className="inst-line c2" />
      </svg>
    </section>
  );
}
