// Jammer sample generators for the Link lab (design sections 5 and 9).
//
// J/S convention: J/S is the jammer's average power within +-Rc/2 of the carrier (the bandwidth Wss = Rc used
// throughout), relative to the signal power 1. For broadband noise that is J0*Rc, so ebJ0 = gp/js exactly,
// matching theory.ts. Broadband noise is generated white over the whole simulated band (s*Rc wide), so at s
// samples per chip its per-sample variance is js*s and its total power exceeds js when s > 1. The extra power
// lies outside +-Rc/2 and still counts at the front end. Every other attack places all its power within
// +-Rc/2, so for them J/S is simply their mean power. At s = 1 the samples are chip-matched-filter outputs,
// so band shapes and tones carry the sinc weighting of the chip integrator.
import type { Rng } from '../rng';
import { fft } from './measure';
import type { Interference } from './dsss';
import { type IQ, gaussian, iq } from './signal';

// Jammer description. Frequencies are in cycles per chip, durations in chips.
export type JammerSpec =
  | { kind: 'bbn' }
  | { kind: 'partial'; rho: number; centre?: number }
  | { kind: 'pulsed'; duty: number; periodChips: number; offsetChips?: number }
  | { kind: 'tone'; fTc: number; phase?: number }
  | { kind: 'multitone'; q: number; spacing: number; centre?: number; phases: 'random' | 'zero' | 'newman' };

const BLOCK = 1 << 14;

const sinc = (x: number): number => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

// Adds a tone of the given power at fTc cycles per chip; at s = 1 it is the chip-matched-filter output.
function addTone(x: IQ, power: number, fTc: number, phase: number, s: number): void {
  const n = x.re.length;
  if (s === 1) {
    const amp = Math.sqrt(power) * sinc(fTc);
    for (let k = 0; k < n; k++) {
      const a = 2 * Math.PI * fTc * (k + 0.5) + phase;
      x.re[k] += amp * Math.cos(a);
      x.im[k] += amp * Math.sin(a);
    }
  } else {
    const amp = Math.sqrt(power);
    const w = (2 * Math.PI * fTc) / s;
    for (let k = 0; k < n; k++) {
      const a = w * k + phase;
      x.re[k] += amp * Math.cos(a);
      x.im[k] += amp * Math.sin(a);
    }
  }
}

// Band-limited complex Gaussian noise: total power js before the s = 1 sinc^2 shaping, flat over the band.
function partialBand(n: number, s: number, js: number, rho: number, centre: number, rng: Rng): IQ {
  const lo = centre - rho / 2;
  const hi = centre + rho / 2;
  if (rho <= 0 || lo < -0.5 - 1e-12 || hi > 0.5 + 1e-12) throw new Error('partial: band must lie within +-0.5');
  const gain = new Float64Array(BLOCK);
  let bins = 0;
  for (let k = 0; k < BLOCK; k++) {
    const fc = (k < BLOCK / 2 ? k : k - BLOCK) * (s / BLOCK);
    if (fc >= lo - 1e-12 && fc <= hi + 1e-12) {
      gain[k] = s === 1 ? sinc(fc) : 1;
      bins++;
    }
  }
  if (bins === 0) throw new Error('partial: band too narrow for the block size');
  const scale = Math.sqrt((js * BLOCK) / bins);
  const out = iq(n);
  const g = gaussian(rng);
  const sd = Math.SQRT1_2;
  const re = new Float64Array(BLOCK);
  const im = new Float64Array(BLOCK);
  for (let p = 0; p < n; p += BLOCK) {
    for (let k = 0; k < BLOCK; k++) {
      re[k] = sd * g();
      im[k] = sd * g();
    }
    fft(re, im);
    for (let k = 0; k < BLOCK; k++) {
      const h = gain[k] * scale;
      re[k] *= h;
      im[k] *= h;
    }
    fft(re, im, true);
    const m = Math.min(BLOCK, n - p);
    for (let k = 0; k < m; k++) {
      out.re[p + k] = re[k];
      out.im[p + k] = im[k];
    }
  }
  return out;
}

// Builds the interference generator for a jammer spec at average J/S js (linear), under the convention above.
export function jammer(spec: JammerSpec, js: number): Interference {
  return (n, s, rng) => {
    const out = iq(n);
    switch (spec.kind) {
      case 'bbn': {
        const g = gaussian(rng);
        const sd = Math.sqrt((js * s) / 2);
        for (let i = 0; i < n; i++) {
          out.re[i] = sd * g();
          out.im[i] = sd * g();
        }
        return out;
      }
      case 'partial':
        return partialBand(n, s, js, spec.rho, spec.centre ?? 0, rng);
      case 'pulsed': {
        const g = gaussian(rng);
        const sd = Math.sqrt((js * s) / spec.duty / 2);
        const offset = spec.offsetChips ?? 0;
        const on = spec.duty * spec.periodChips;
        for (let i = 0; i < n; i++) {
          const pos = (((Math.floor(i / s) - offset) % spec.periodChips) + spec.periodChips) % spec.periodChips;
          if (pos < on - 1e-9) {
            out.re[i] = sd * g();
            out.im[i] = sd * g();
          }
        }
        return out;
      }
      case 'tone':
        addTone(out, js, spec.fTc, spec.phase ?? 2 * Math.PI * rng(), s);
        return out;
      case 'multitone': {
        const c = spec.centre ?? 0;
        for (let i = 0; i < spec.q; i++) {
          const phase =
            spec.phases === 'random' ? 2 * Math.PI * rng() : spec.phases === 'zero' ? 0 : (Math.PI * i * i) / spec.q;
          addTone(out, js / spec.q, c + (i - (spec.q - 1) / 2) * spec.spacing, phase, s);
        }
        return out;
      }
    }
  };
}

// Mean power, peak instantaneous power and peak-to-average power ratio in dB.
export function jammerStats(x: IQ): { meanPower: number; peakPower: number; paprDb: number } {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < x.re.length; i++) {
    const p = x.re[i] * x.re[i] + x.im[i] * x.im[i];
    sum += p;
    if (p > peak) peak = p;
  }
  const mean = sum / x.re.length;
  return { meanPower: mean, peakPower: peak, paprDb: 10 * Math.log10(peak / mean) };
}
