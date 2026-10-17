import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { mSequence } from './pn';
import { addAwgn, chipStream, gaussian, iq, modulate, rotate } from './signal';
import { autocorrelation, fft, fluctuation, histogram, nextPow2, toDb, welchPsd, wilson } from './measure';

const randomChips = (n: number, seed: number): Int8Array => {
  const rng = createRng(seed);
  const c = new Int8Array(n);
  for (let i = 0; i < n; i++) c[i] = rng() < 0.5 ? -1 : 1;
  return c;
};

describe('fft', () => {
  it('matches a naive DFT', () => {
    const n = 64;
    const g = gaussian(createRng(1));
    const re = new Float64Array(n).map(() => g());
    const im = new Float64Array(n).map(() => g());
    const fr = Float64Array.from(re);
    const fi = Float64Array.from(im);
    fft(fr, fi);
    for (let k = 0; k < n; k++) {
      let sr = 0;
      let si = 0;
      for (let t = 0; t < n; t++) {
        const a = (-2 * Math.PI * k * t) / n;
        sr += re[t] * Math.cos(a) - im[t] * Math.sin(a);
        si += re[t] * Math.sin(a) + im[t] * Math.cos(a);
      }
      expect(Math.abs(fr[k] - sr)).toBeLessThan(1e-9);
      expect(Math.abs(fi[k] - si)).toBeLessThan(1e-9);
    }
  });

  it('inverse round trips and satisfies Parseval', () => {
    const n = 128;
    const g = gaussian(createRng(2));
    const re = new Float64Array(n).map(() => g());
    const im = new Float64Array(n).map(() => g());
    const fr = Float64Array.from(re);
    const fi = Float64Array.from(im);
    fft(fr, fi);
    let et = 0;
    let ef = 0;
    for (let i = 0; i < n; i++) {
      et += re[i] * re[i] + im[i] * im[i];
      ef += fr[i] * fr[i] + fi[i] * fi[i];
    }
    expect(Math.abs(ef / n - et)).toBeLessThan(1e-9);
    fft(fr, fi, true);
    for (let i = 0; i < n; i++) {
      expect(Math.abs(fr[i] - re[i])).toBeLessThan(1e-9);
      expect(Math.abs(fi[i] - im[i])).toBeLessThan(1e-9);
    }
  });

  it('rejects non power of 2 lengths', () => {
    expect(() => fft(new Float64Array(12), new Float64Array(12))).toThrow();
  });

  it('nextPow2', () => {
    expect([1, 2, 3, 17, 64, 65].map(nextPow2)).toEqual([1, 2, 4, 32, 64, 128]);
  });
});

describe('welchPsd', () => {
  it('white noise: total power and flat bins', { timeout: 30_000 }, () => {
    const n = 2 ** 17;
    const nfft = 256;
    const x = addAwgn(iq(n), 2, createRng(3));
    const { freq, psd } = welchPsd(x, nfft);
    expect(freq[0]).toBeCloseTo(-0.5, 12);
    expect(freq[nfft - 1]).toBeCloseTo(0.5 - 1 / nfft, 12);
    const sum = psd.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum / 2 - 1)).toBeLessThan(0.03);
    for (const v of psd) expect(Math.abs(v / (2 / nfft) - 1)).toBeLessThan(0.25);
  });

  it('tone peaks at its frequency', () => {
    const n = 2 ** 14;
    const x = iq(n);
    x.re.fill(1);
    rotate(x, 0.1);
    const nfft = 512;
    const { freq, psd } = welchPsd(x, nfft);
    let pk = 0;
    for (let i = 1; i < nfft; i++) if (psd[i] > psd[pk]) pk = i;
    expect(Math.abs(freq[pk] - 0.1)).toBeLessThanOrEqual(1 / nfft);
  });

  it('random BPSK at s = 4 has nulls at +-0.25', { timeout: 30_000 }, () => {
    const x = modulate(randomChips(2 ** 15, 4), 4);
    const nfft = 256;
    const { freq, psd } = welchPsd(x, nfft);
    const db = toDb(psd);
    const at = (f: number) => db[freq.findIndex((v) => Math.abs(v - f) < 1e-9)];
    const peak = at(0);
    expect(at(0.25)).toBeLessThan(peak - 20);
    expect(at(-0.25)).toBeLessThan(peak - 20);
  });

  it('zero-pads a short input', () => {
    const x = addAwgn(iq(100), 1, createRng(5));
    const { psd } = welchPsd(x, 256);
    expect(psd.length).toBe(256);
    expect(psd.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
  });
});

describe('autocorrelation', () => {
  it('rectangular random chips at s = 4 give a triangle', () => {
    const x = modulate(randomChips(4000, 6), 4);
    const r = autocorrelation(x, 8);
    expect(r.mag[0]).toBeCloseTo(1, 12);
    expect(Math.abs(r.re[2] - 0.5)).toBeLessThan(0.05);
    expect(Math.abs(r.re[4])).toBeLessThan(0.05);
  });

  it('preamble peaks at the code period', () => {
    const code = mSequence(5);
    const chips = chipStream(new Int8Array(32).fill(1), code, 31);
    const x = modulate(chips, 2);
    const r = autocorrelation(x, 70);
    expect(r.mag[62]).toBeGreaterThan(0.9);
    expect(r.mag[31]).toBeLessThan(0.2);
  });
});

describe('fluctuation', () => {
  it('peaks at the code period under random data where plain autocorrelation does not', { timeout: 30_000 }, () => {
    const bits = 2000;
    const symbols = randomChips(bits, 7);
    const x = modulate(chipStream(symbols, mSequence(5), 31), 2);
    const f = fluctuation(x, 4 * 62, 140);
    const ref: number[] = [];
    for (let t = 10; t <= 140; t++) {
      if ((t >= 58 && t <= 66) || (t >= 120 && t <= 128)) continue;
      ref.push(f[t]);
    }
    ref.sort((a, b) => a - b);
    const median = ref[Math.floor(ref.length / 2)];
    expect(f[62]).toBeGreaterThan(3 * median);
    expect(autocorrelation(x, 62).mag[62]).toBeLessThan(0.1);
  });
});

describe('wilson', () => {
  it('matches known intervals', () => {
    const a = wilson(0, 100);
    expect(a.ber).toBe(0);
    expect(a.lo).toBeCloseTo(0, 6);
    expect(Math.abs(a.hi - 0.037)).toBeLessThan(0.0005);
    const b = wilson(10, 100);
    expect(b.ber).toBeCloseTo(0.1, 12);
    expect(Math.abs(b.lo - 0.0552)).toBeLessThan(0.0005);
    expect(Math.abs(b.hi - 0.1744)).toBeLessThan(0.0005);
  });

  it('n = 0', () => {
    const w = wilson(0, 0);
    expect(w.ber).toBeNaN();
    expect([w.lo, w.hi]).toEqual([0, 1]);
  });
});

describe('histogram', () => {
  it('counts every value and clamps to the end bins', () => {
    const values = [-5, -1, -0.5, 0, 0.25, 0.9, 1, 7];
    const { edges, counts } = histogram(values, 4, -1, 1);
    expect(edges.length).toBe(5);
    expect(edges[0]).toBe(-1);
    expect(edges[4]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(values.length);
    expect(Array.from(counts)).toEqual([2, 1, 2, 3]);
  });
});
