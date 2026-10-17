import { useMemo } from 'react';
import { createRng } from '../../../engine/rng';
import { type JammerSpec, jammer } from '../../../engine/lab/jammers';
import { toDb, welchPsd } from '../../../engine/lab/measure';
import type { IQ } from '../../../engine/lab/signal';
import { Axes } from '../instruments/Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks, poly } from '../instruments/plot';
import { Spectrum } from '../instruments/Spectrum';

const CHIP_RATE_HZ = 1e6; // the example link
const SAMPLES = 1 << 14;
const WINDOW_US = 100;
const SPAN_DB = 50;

// The three jammers at the same average power: J/S 1 (0 dB), one sample per chip.
const COLUMNS: { title: string; spec: JammerSpec; caption: string }[] = [
  { title: 'Broadband', spec: { kind: 'bbn' }, caption: 'Broadband: spread over the whole band, on all the time' },
  { title: 'Partial-band', spec: { kind: 'partial', rho: 0.25 }, caption: 'Partial-band: a quarter of the band, 4 times stronger there' },
  { title: 'Pulsed', spec: { kind: 'pulsed', duty: 0.1, periodChips: 20 }, caption: 'Pulsed: on 10% of the time, 10 times stronger while on' },
];

export function jammerSamples(spec: JammerSpec, seed: number): IQ {
  return jammer(spec, 1)(SAMPLES, 1, createRng(seed), 0);
}

// |x|^2 of the first WINDOW_US microseconds, one value per chip.
function envelope(x: IQ): number[] {
  const out: number[] = [];
  for (let i = 0; i < WINDOW_US; i++) out.push(x.re[i] * x.re[i] + x.im[i] * x.im[i]);
  return out;
}

function Envelope({ values, top }: { values: number[]; top: number }) {
  const fx = (us: number) => PAD.l + (us / WINDOW_US) * INNER_W;
  const fy = (v: number) => PAD.t + (1 - Math.min(v, top) / top) * INNER_H;
  // Held for 1 µs each: a step line.
  const pts = poly(values.length * 2, (i) => fx(Math.floor(i / 2) + (i % 2)), (i) => fy(values[Math.floor(i / 2)]));
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Envelope |x|² against time</h3>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Envelope of the jammer against time">
        <Axes xTicks={niceTicks(0, WINDOW_US, 5)} yTicks={niceTicks(0, top, 4)} fx={fx} fy={fy} xLabel="Time (µs)" yLabel="Power (average = 1)" />
        <polyline points={pts} className="inst-line c2" />
      </svg>
    </section>
  );
}

// The three jammers side by side: each one's spectrum alone and its envelope over 100 µs, on the same scales.
export function ThreeJammers() {
  const cols = useMemo(() => {
    const items = COLUMNS.map((c, i) => ({ ...c, x: jammerSamples(c.spec, 11 + i) }));
    let hi = -Infinity;
    for (const c of items) for (const v of toDb(welchPsd(c.x, 128).psd)) hi = Math.max(hi, v);
    const top = Math.ceil(hi / 10) * 10 + 10;
    const yRange: [number, number] = [top - SPAN_DB, top];
    const envs = items.map((c) => envelope(c.x));
    const peak = Math.max(...envs.flat());
    return { items, yRange, envs, envTop: Math.ceil(peak / 10) * 10 };
  }, []);
  return (
    <div className="vis-three">
      {cols.items.map((c, i) => (
        <figure key={c.title} className="vis-three-col">
          <Spectrum x={c.x} sampleRateHz={CHIP_RATE_HZ} title={`${c.title}: spectrum`} yRange={cols.yRange} />
          <Envelope values={cols.envs[i]} top={cols.envTop} />
          <figcaption>{c.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}
