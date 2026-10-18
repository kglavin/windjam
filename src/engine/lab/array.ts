// Level 10 (docs/design-level-10.md): a uniform linear array of M elements half a wavelength apart. Angles in degrees
// from broadside. Delay-and-sum and Capon (MVDR) beams, and MUSIC direction finding.
import { createRng } from '../rng';
import { gaussian } from '../detect';
import { type CMatrix, type CVector, cInner, complexSolve, hermitianEig } from './linalg';

const rad = (deg: number) => (deg * Math.PI) / 180;

// The phase each element sees from a direction: element k lags by π·k·sin θ.
export function steering(m: number, thetaDeg: number): CVector {
  const ph = Math.PI * Math.sin(rad(thetaDeg));
  return { re: Array.from({ length: m }, (_, k) => Math.cos(ph * k)), im: Array.from({ length: m }, (_, k) => Math.sin(ph * k)) };
}

export interface Source {
  thetaDeg: number;
  power: number; // linear, per element
}

// Channel mismatch between elements leaves this share of every source's power uncorrelated from element to element,
// which no weighting can cancel: it limits nulls to about 35 dB, as in practice (the lab's assumption).
export const MISMATCH_DB = -35;

// The exact covariance Σ p·a·aᴴ + noise·I, plus the mismatch residual of each source on the diagonal.
export function idealCovariance(m: number, sources: Source[], noise: number, mismatchDb = MISMATCH_DB): CMatrix {
  const floor = noise + sources.reduce((t, s) => t + s.power, 0) * 10 ** (mismatchDb / 10);
  const re = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? floor : 0)));
  const im = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  for (const s of sources) {
    const a = steering(m, s.thetaDeg);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        re[i][j] += s.power * (a.re[i] * a.re[j] + a.im[i] * a.im[j]);
        im[i][j] += s.power * (a.im[i] * a.re[j] - a.re[i] * a.im[j]);
      }
    }
  }
  return { re, im };
}

// The covariance estimated from `snapshots` samples: each source a random complex amplitude, plus noise.
export function sampleCovariance(m: number, sources: Source[], noise: number, snapshots: number, seed: number): CMatrix {
  const rng = createRng(seed);
  const re = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const im = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const steer = sources.map((s) => steering(m, s.thetaDeg));
  for (let t = 0; t < snapshots; t++) {
    const xr = new Array<number>(m).fill(0);
    const xi = new Array<number>(m).fill(0);
    sources.forEach((s, q) => {
      const ar = Math.sqrt(s.power / 2) * gaussian(rng);
      const ai = Math.sqrt(s.power / 2) * gaussian(rng);
      for (let k = 0; k < m; k++) {
        xr[k] += ar * steer[q].re[k] - ai * steer[q].im[k];
        xi[k] += ar * steer[q].im[k] + ai * steer[q].re[k];
      }
    });
    for (let k = 0; k < m; k++) {
      xr[k] += Math.sqrt(noise / 2) * gaussian(rng);
      xi[k] += Math.sqrt(noise / 2) * gaussian(rng);
    }
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        re[i][j] += (xr[i] * xr[j] + xi[i] * xi[j]) / snapshots;
        im[i][j] += (xi[i] * xr[j] - xr[i] * xi[j]) / snapshots;
      }
    }
  }
  return { re, im };
}

// |wᴴ a(θ)|² for weights w.
export const response = (w: CVector, thetaDeg: number): number => {
  const p = cInner(w, steering(w.re.length, thetaDeg));
  return p.re * p.re + p.im * p.im;
};

// Delay-and-sum toward look: w = a(look) ÷ M. Response 1 at the look direction; the array gain on SNR is M.
export const delayAndSum = (m: number, lookDeg: number): CVector => {
  const a = steering(m, lookDeg);
  return { re: a.re.map((v) => v / m), im: a.im.map((v) => v / m) };
};

// Capon / MVDR: w = R⁻¹a ÷ (aᴴR⁻¹a): response 1 at the look direction, least power from everything else.
export function mvdr(R: CMatrix, lookDeg: number): CVector {
  const a = steering(R.re.length, lookDeg);
  const x = complexSolve(R, a);
  const d = cInner(a, x); // aᴴ R⁻¹ a, real for Hermitian R
  return { re: x.re.map((v, k) => (v * d.re + x.im[k] * d.im) / (d.re * d.re + d.im * d.im)), im: x.im.map((v, k) => (v * d.re - x.re[k] * d.im) / (d.re * d.re + d.im * d.im)) };
}

// The response in dB relative to the look direction, over a grid of angles.
export const patternDb = (w: CVector, lookDeg: number, grid: number[]): number[] => {
  const ref = response(w, lookDeg);
  return grid.map((t) => 10 * Math.log10(Math.max(response(w, t) / ref, 1e-12)));
};

// How much weaker the jammer gets through the array than through one element, with the signal kept: the pattern at the
// jammer plus the mismatch residual, which reaches the output through every weight (dB, negative = suppressed).
export function jammerSuppressionDb(w: CVector, lookDeg: number, jammerDeg: number, mismatchDb = MISMATCH_DB): number {
  const look = response(w, lookDeg);
  const norm = w.re.reduce((t, v, k) => t + v * v + w.im[k] * w.im[k], 0);
  return 10 * Math.log10((response(w, jammerDeg) + 10 ** (mismatchDb / 10) * norm) / look);
}

// Half-power beamwidth of delay-and-sum at broadside, about 102° ÷ M for half-wave spacing.
export const beamwidthDeg = (m: number): number => {
  const w = delayAndSum(m, 0);
  let t = 0;
  while (t < 90 && response(w, t) > 0.5) t += 0.01;
  return 2 * t;
};

// MUSIC pseudo-spectrum (dB, peak normalised to 0) for K sources: 1 ÷ |Enᴴ a(θ)|² over the noise eigenvectors.
export function musicSpectrumDb(R: CMatrix, k: number, grid: number[]): number[] {
  const e = hermitianEig(R);
  const noise = e.vectors.slice(k);
  const p = grid.map((t) => {
    const a = steering(R.re.length, t);
    let s = 0;
    for (const v of noise) {
      const d = cInner(v, a);
      s += d.re * d.re + d.im * d.im;
    }
    return 1 / Math.max(s, 1e-15);
  });
  const top = Math.max(...p);
  return p.map((v) => 10 * Math.log10(v / top));
}

// The delay-and-sum scan (Bartlett): power aᴴRa ÷ M² at each angle, dB with the peak at 0. Its peaks are a beamwidth
// wide, so emitters closer than that merge.
export function bartlettDb(R: CMatrix, grid: number[]): number[] {
  const m = R.re.length;
  const p = grid.map((t) => {
    const a = steering(m, t);
    let re = 0;
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) re += a.re[i] * (R.re[i][j] * a.re[j] - R.im[i][j] * a.im[j]) + a.im[i] * (R.re[i][j] * a.im[j] + R.im[i][j] * a.re[j]);
    }
    return re / (m * m);
  });
  const top = Math.max(...p);
  return p.map((v) => 10 * Math.log10(Math.max(v / top, 1e-12)));
}

// The peaks of a spectrum: local maxima above `floorDb`, highest first.
export function peaks(grid: number[], db: number[], count: number, floorDb = -20): number[] {
  const out: { t: number; v: number }[] = [];
  for (let i = 1; i < db.length - 1; i++) if (db[i] > db[i - 1] && db[i] >= db[i + 1] && db[i] > floorDb) out.push({ t: grid[i], v: db[i] });
  return out.sort((a, b) => b.v - a.v).slice(0, count).map((p) => p.t);
}

// Jammer directions spread evenly in sin θ (so each needs its own null), for showing that M elements null M − 1.
export const NULL_DIRS = [14.5, -14.5, 30, -30, 48.6, -48.6, 71.8, -71.8, 22, -22, 38.7, -38.7, 61, -61, 8.6, -8.6];

export const angleGrid = (step = 0.5): number[] => Array.from({ length: Math.round(180 / step) + 1 }, (_, i) => -90 + i * step);
