// Complex baseband sample buffers for the Link lab.
//
// Normalisation:
// - The transmitted signal has amplitude 1, so power 1 per sample, at any samples-per-chip s.
//   All powers (noise, jamming) are relative to the signal power at the receiver input,
//   so J/S is simply the jammer's mean power per sample.
// - Noise is complex AWGN with total variance sigma^2 per sample (sigma^2/2 per component).
//   With chip energy Ec = 1 (chip-domain units) and Eb = gp*Ec, the per-sample variance at
//   s samples per chip is sigma^2 = s*gp/ebN0. At s = 1 the samples are the output of an
//   ideal chip-matched filter.
// - chipMatchedFilter averages the s samples of each chip, which maps an oversampled stream
//   to the s = 1 domain: signal stays 1, noise variance s*gp/ebN0 becomes gp/ebN0.
import type { Rng } from '../rng';

// Complex samples as separate real and imaginary arrays.
export interface IQ {
  re: Float32Array;
  im: Float32Array;
}

// Zero-filled buffer of n complex samples.
export const iq = (n: number): IQ => ({ re: new Float32Array(n), im: new Float32Array(n) });

// Standard normal generator (Box-Muller, caching the second value).
export function gaussian(rng: Rng): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    const u1 = 1 - rng(); // in (0, 1]
    const u2 = rng();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  };
}

// Spread chips: chip k = symbols[floor(k / chipsPerSymbol)] * code[(codePhase + k) mod code.length].
export function chipStream(symbols: Int8Array, code: Int8Array, chipsPerSymbol: number, codePhase = 0): Int8Array {
  const n = symbols.length * chipsPerSymbol;
  const out = new Int8Array(n);
  const len = code.length;
  for (let k = 0; k < n; k++) {
    out[k] = symbols[Math.floor(k / chipsPerSymbol)] * code[(((codePhase + k) % len) + len) % len];
  }
  return out;
}

// Rectangular BPSK chips at s samples per chip: re = chip, im = 0.
export function modulate(chips: Int8Array, s: number): IQ {
  const x = iq(chips.length * s);
  for (let k = 0; k < chips.length; k++) x.re.fill(chips[k], k * s, (k + 1) * s);
  return x;
}

// In place: multiplies sample n by exp(j(2 pi cyclesPerSample n + phase)). Returns x.
export function rotate(x: IQ, cyclesPerSample: number, phase = 0): IQ {
  const n = x.re.length;
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * cyclesPerSample * i + phase;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r = x.re[i];
    const m = x.im[i];
    x.re[i] = r * c - m * s;
    x.im[i] = r * s + m * c;
  }
  return x;
}

// Per-sample noise variance s*gp/ebN0 (linear ebN0) at s samples per chip.
export const noiseVariance = (ebN0: number, gp: number, s: number): number => (s * gp) / ebN0;

// In place: adds complex Gaussian noise of total variance `variance` per sample. Returns x.
export function addAwgn(x: IQ, variance: number, rng: Rng): IQ {
  const g = gaussian(rng);
  const sd = Math.sqrt(variance / 2);
  for (let i = 0; i < x.re.length; i++) {
    x.re[i] += sd * g();
    x.im[i] += sd * g();
  }
  return x;
}

// In place: into += gain * from. Throws if the lengths differ. Returns into.
export function addScaled(into: IQ, from: IQ, gain = 1): IQ {
  if (into.re.length !== from.re.length) throw new Error('addScaled: length mismatch');
  for (let i = 0; i < into.re.length; i++) {
    into.re[i] += gain * from.re[i];
    into.im[i] += gain * from.im[i];
  }
  return into;
}

// Mean of re^2 + im^2 over samples [from, to).
export function meanPower(x: IQ, from = 0, to = x.re.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x.re[i] * x.re[i] + x.im[i] * x.im[i];
  return sum / (to - from);
}

// New buffer of floor(n/s) samples, each the mean of s consecutive input samples.
export function chipMatchedFilter(x: IQ, s: number): IQ {
  const n = Math.floor(x.re.length / s);
  const out = iq(n);
  for (let k = 0; k < n; k++) {
    let r = 0;
    let m = 0;
    for (let j = k * s; j < (k + 1) * s; j++) {
      r += x.re[j];
      m += x.im[j];
    }
    out.re[k] = r / s;
    out.im[k] = m / s;
  }
  return out;
}
