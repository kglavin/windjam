import { describe, expect, it } from 'vitest';
import { adcClip, frontEnd, rapp, rappSaturationForP1db } from './frontend';
import { iq } from './signal';

const A = 3;

describe('rapp', () => {
  it('is transparent far below saturation', () => {
    const x = iq(1);
    x.re[0] = 0.01 * A;
    expect(Math.abs(rapp(x, A).re[0] / x.re[0] - 1)).toBeLessThan(1e-6);
  });
  it('saturates at A far above it', () => {
    const x = iq(1);
    x.re[0] = 100 * A;
    expect(Math.abs(rapp(x, A).re[0] / A - 1)).toBeLessThan(0.01);
  });
  it('preserves phase', () => {
    const x = iq(1);
    x.re[0] = 3;
    x.im[0] = -4;
    const y = rapp(x, 2);
    expect(Math.atan2(y.im[0], y.re[0])).toBeCloseTo(Math.atan2(-4, 3), 6);
  });
  it('is exactly 1 dB down at the P1dB amplitude', () => {
    for (const p of [1, 2, 3]) {
      const a = 2;
      const sat = rappSaturationForP1db(a, p);
      const x = iq(1);
      x.im[0] = a;
      const gain = rapp(x, sat, p).im[0] / a;
      expect(Math.abs(20 * Math.log10(gain) + 1)).toBeLessThan(1e-5);
      // Float32 storage limits the check above; verify the double-precision formula tightly
      const u = a / sat;
      const g = (1 + u ** (2 * p)) ** (-1 / (2 * p));
      expect(Math.abs(20 * Math.log10(g) + 1)).toBeLessThan(1e-9);
    }
  });
});

describe('adcClip', () => {
  it('clips each component and counts samples', () => {
    const x = iq(4);
    x.re.set([0.5, 2, -3, 0.9]);
    x.im.set([0, 0, 0.5, -1.5]);
    const { out, clippedFraction } = adcClip(x, 1);
    expect(Array.from(out.re)).toEqual([0.5, 1, -1, Math.fround(0.9)]);
    expect(Array.from(out.im)).toEqual([0, 0, 0.5, -1]);
    expect(clippedFraction).toBe(0.75);
  });
});

describe('frontEnd', () => {
  it('passes a unit-power signal when p1dbPower is 100', () => {
    const x = iq(4);
    x.re.set([1, -1, 1, -1]);
    const { out, clippedFraction, compressedFraction } = frontEnd(x, { p1dbPower: 100, adcFullScale: 10 });
    for (let i = 0; i < 4; i++) expect(Math.abs(out.re[i] / x.re[i] - 1)).toBeLessThan(1e-3);
    expect(clippedFraction).toBe(0);
    expect(compressedFraction).toBe(0);
  });
  it('counts compressed samples', () => {
    const x = iq(4);
    x.re.set([1, 10, 0, 3]);
    x.im.set([0, 0, 10, 4]);
    // powers 1, 100, 100, 25 against p1dbPower 25: three at or above
    const r = frontEnd(x, { p1dbPower: 25, adcFullScale: 100 });
    expect(r.compressedFraction).toBe(0.75);
  });
});
