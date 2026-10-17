import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { mSequence } from './pn';
import {
  addAwgn,
  addScaled,
  chipMatchedFilter,
  chipStream,
  gaussian,
  iq,
  meanPower,
  modulate,
  noiseVariance,
  rotate,
} from './signal';

const N = 200_000;

function variance(a: Float32Array): number {
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return s / a.length;
}

describe('chipStream', () => {
  it('repeats a short code times each symbol', () => {
    const code = Int8Array.from([1, 1, 1, -1, -1, 1, -1]);
    const sym = Int8Array.from([1, -1, 1]);
    const out = chipStream(sym, code, 7);
    expect(out.length).toBe(21);
    for (let k = 0; k < 21; k++) expect(out[k]).toBe(sym[Math.floor(k / 7)] * code[k % 7]);
  });
  it('runs a long code on across symbols', () => {
    const code = mSequence(5);
    const sym = Int8Array.from([1, -1, -1, 1, 1, -1, 1]);
    const out = chipStream(sym, code, 5);
    expect(out.length).toBe(35);
    for (let k = 0; k < 35; k++) expect(out[k]).toBe(sym[Math.floor(k / 5)] * code[k % 31]);
    // chip 31 is the code's chip 0 again, inside symbol 6
    expect(out[31]).toBe(sym[6] * code[0]);
  });
  it('shifts by codePhase', () => {
    const code = mSequence(5);
    const sym = Int8Array.from([1, 1]);
    const out = chipStream(sym, code, 31, 4);
    for (let k = 0; k < 62; k++) expect(out[k]).toBe(code[(4 + k) % 31]);
  });
});

describe('modulate', () => {
  it('has length chips*s, unit power and exact values', () => {
    const chips = Int8Array.from([1, -1, -1, 1, 1]);
    const x = modulate(chips, 4);
    expect(x.re.length).toBe(20);
    expect(meanPower(x)).toBe(1);
    for (let i = 0; i < 20; i++) {
      expect(x.re[i]).toBe(chips[Math.floor(i / 4)]);
      expect(x.im[i]).toBe(0);
    }
  });
});

describe('rotate', () => {
  it('preserves power', () => {
    const x = modulate(Int8Array.from({ length: 1000 }, (_, i) => (i % 3 ? 1 : -1)), 1);
    const p = meanPower(x);
    rotate(x, 0.0123, 0.7);
    expect(Math.abs(meanPower(x) - p)).toBeLessThan(1e-6);
  });
  it('quarter cycle per sample turns (1,0) into (0,1) at sample 1', () => {
    const x = iq(4);
    x.re.fill(1);
    expect(rotate(x, 0.25)).toBe(x);
    expect(x.re[1]).toBeCloseTo(0, 6);
    expect(x.im[1]).toBeCloseTo(1, 6);
    expect(x.re[0]).toBeCloseTo(1, 6);
  });
  it('keeps unit magnitude over 1e7 samples', { timeout: 30_000 }, () => {
    const n = 10_000_000;
    const x = iq(n);
    x.re.fill(1);
    rotate(x, 0.1234567, 0.3);
    let worst = 0;
    for (let i = 0; i < n; i += 1) worst = Math.max(worst, Math.abs(Math.hypot(x.re[i], x.im[i]) - 1));
    expect(worst).toBeLessThan(1e-5);
  });
});

describe('gaussian', () => {
  it('has mean 0 and variance 1', () => {
    const g = gaussian(createRng(1));
    const a = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = g();
    const mean = a.reduce((s, v) => s + v, 0) / N;
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(Math.abs(variance(a) - 1)).toBeLessThan(0.03);
  });
  it('is reproducible from the seed', () => {
    const g1 = gaussian(createRng(7));
    const g2 = gaussian(createRng(7));
    for (let i = 0; i < 100; i++) expect(g1()).toBe(g2());
  });
});

describe('addAwgn', () => {
  it('adds the requested total variance, split evenly', () => {
    const x = addAwgn(iq(N), 2.5, createRng(2));
    const vr = variance(x.re);
    const vi = variance(x.im);
    expect(Math.abs((vr + vi) / 2.5 - 1)).toBeLessThan(0.03);
    expect(Math.abs(vr / 1.25 - 1)).toBeLessThan(0.03);
    expect(Math.abs(vi / 1.25 - 1)).toBeLessThan(0.03);
  });
});

describe('addScaled', () => {
  it('adds gain times the source and rejects length mismatch', () => {
    const a = iq(3);
    const b = iq(3);
    a.re.fill(1);
    b.im.fill(2);
    addScaled(a, b, 0.5);
    expect(Array.from(a.re)).toEqual([1, 1, 1]);
    expect(Array.from(a.im)).toEqual([1, 1, 1]);
    expect(() => addScaled(a, iq(2))).toThrow();
  });
});

describe('meanPower', () => {
  it('averages over the requested range', () => {
    const x = iq(4);
    x.re.set([1, 2, 0, 0]);
    x.im.set([0, 0, 3, 0]);
    expect(meanPower(x)).toBe(14 / 4);
    expect(meanPower(x, 1, 3)).toBe(13 / 2);
  });
});

describe('noiseVariance', () => {
  it('is s*gp/ebN0', () => {
    expect(noiseVariance(4, 31, 2)).toBe(15.5);
  });
});

describe('chipMatchedFilter', () => {
  it('recovers the chips exactly from a modulated stream', () => {
    const chips = Int8Array.from({ length: 50 }, (_, i) => (i % 7 < 3 ? 1 : -1));
    const y = chipMatchedFilter(modulate(chips, 4), 4);
    expect(y.re.length).toBe(50);
    for (let k = 0; k < 50; k++) {
      expect(y.re[k]).toBe(chips[k]);
      expect(y.im[k]).toBe(0);
    }
  });
  it('maps noise variance from s*gp/ebN0 to gp/ebN0', () => {
    const ebN0 = 4;
    const gp = 31;
    const x = addAwgn(iq(N * 4), noiseVariance(ebN0, gp, 4), createRng(3));
    const y = chipMatchedFilter(x, 4);
    const v = (variance(y.re) + variance(y.im)) / 2 / 0.5;
    expect(Math.abs(v / noiseVariance(ebN0, gp, 1) - 1)).toBeLessThan(0.03);
  });
});
