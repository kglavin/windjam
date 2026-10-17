import { useMemo } from 'react';
import { createRng } from '../../../engine/rng';
import { toDb, welchPsd } from '../../../engine/lab/measure';
import { mSequence } from '../../../engine/lab/pn';
import { chipStream, modulate } from '../../../engine/lab/signal';
import { Axes } from '../instruments/Axes';
import { INNER_H, INNER_W, PAD, PH, PW, niceTicks, poly } from '../instruments/plot';

const S = 4;
const NFFT = 256; // 15.6 kHz bins: fine enough for the 0.14 MHz hump, 400+ segments averaged
const N_BITS = 2000;
const CHIPS_PER_BIT = 7;
const CHIP_RATE_MHZ = 1; // chips of 1 µs: the sample rate is 4 MHz, the axis runs ±2 MHz
const SPAN_DB = 50;

// Same random bits sent two ways: held for 7 chips (no code) and multiplied by a long code, 7 chips per bit.
function spectra() {
  const rng = createRng(21);
  const bits = Int8Array.from({ length: N_BITS }, () => (rng() < 0.5 ? -1 : 1));
  const code = mSequence(11); // long code, running on across bits: a smooth sinc² envelope
  const ones = new Int8Array(CHIPS_PER_BIT).fill(1);
  const psd = (c: Int8Array) => toDb(welchPsd(modulate(chipStream(bits, c, CHIPS_PER_BIT), S), NFFT).psd);
  const freq = Array.from({ length: NFFT }, (_, i) => ((i - NFFT / 2) / NFFT) * S * CHIP_RATE_MHZ);
  return { freq, unspread: psd(ones), spread: psd(code) };
}

// One spectrum plot, two lines of equal power: the spread one is wider and lower.
export function SpreadVsUnspread() {
  const d = useMemo(spectra, []);
  const max = Math.max(...d.unspread, ...d.spread);
  const top = Math.ceil(max / 10) * 10;
  const bottom = top - SPAN_DB;
  const half = (S * CHIP_RATE_MHZ) / 2;
  const fx = (v: number) => PAD.l + ((v + half) / (2 * half)) * INNER_W;
  const fy = (v: number) => PAD.t + ((top - Math.max(v, bottom)) / (top - bottom)) * INNER_H;
  const line = (y: Float64Array) => poly(d.freq.length, (i) => fx(d.freq[i]), (i) => fy(y[i]));
  const lx = PAD.l + INNER_W - 118;
  return (
    <section className="inst-panel">
      <header className="inst-head">
        <h3>Spectrum: same bits, with and without the code</h3>
      </header>
      <svg className="inst-svg" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="Spectrum of bits with and without the code">
        <Axes
          xTicks={niceTicks(-half, half, 8)}
          yTicks={niceTicks(bottom, top, 5)}
          fx={fx}
          fy={fy}
          xLabel="Frequency from carrier (MHz)"
          yLabel="Level (dB per bin)"
        />
        <polyline points={line(d.unspread)} className="inst-line c2" />
        <polyline points={line(d.spread)} className="inst-line c1" />
        <rect x={lx - 6} y={PAD.t + 4} width={118} height={34} className="vis-legend-bg" />
        <line x1={lx} x2={lx + 18} y1={PAD.t + 14} y2={PAD.t + 14} className="inst-line c2" />
        <text x={lx + 24} y={PAD.t + 17} className="inst-axis">without code</text>
        <line x1={lx} x2={lx + 18} y1={PAD.t + 29} y2={PAD.t + 29} className="inst-line c1" />
        <text x={lx + 24} y={PAD.t + 32} className="inst-axis">with code</text>
      </svg>
    </section>
  );
}
