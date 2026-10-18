import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import {
  C_KM_PER_US, bearingDeg, bearingSigmaDeg, crossBearings, crossCorrelation, crossSnr, crossingAngleDeg, distanceKm,
  fixFromBearings, hyperbolaPoints, measuredBearing, rangeDifferenceKm, tdoaFix, tdoaSigmaUs, timeDifferenceUs,
} from './geoloc';
import { mSequence } from './pn';

const T = { xKm: 6, yKm: 8 };

describe('bearings and triangulation', () => {
  it('measures bearings clockwise from north', () => {
    expect(bearingDeg({ xKm: 0, yKm: 0 }, { xKm: 0, yKm: 5 })).toBeCloseTo(0, 9);
    expect(bearingDeg({ xKm: 0, yKm: 0 }, { xKm: 5, yKm: 0 })).toBeCloseTo(90, 9);
    expect(bearingDeg({ xKm: 0, yKm: 0 }, { xKm: 0, yKm: -5 })).toBeCloseTo(180, 9);
    expect(bearingDeg({ xKm: 0, yKm: 0 }, { xKm: -5, yKm: 0 })).toBeCloseTo(270, 9);
    expect(crossingAngleDeg(10, 100)).toBeCloseTo(90, 9);
    expect(crossingAngleDeg(10, 170)).toBeCloseTo(20, 9);
  });

  it('uses the game bearing error: 2° at high SNR, 20°/√SNR below 20 dB', () => {
    expect(bearingSigmaDeg(30)).toBe(2);
    expect(bearingSigmaDeg(10)).toBeCloseTo(20 / Math.sqrt(10), 9);
    expect(bearingSigmaDeg(0)).toBeCloseTo(20, 9);
  });

  it('crosses two bearings at the target, with each range by the law of sines', () => {
    const a = { xKm: 0, yKm: 0 };
    const b = { xKm: 10, yKm: 0 };
    const x = crossBearings(a, bearingDeg(a, T), b, bearingDeg(b, T))!;
    expect(x.point.xKm).toBeCloseTo(T.xKm, 9);
    expect(x.point.yKm).toBeCloseTo(T.yKm, 9);
    // Law of sines with the angles at each site measured from the baseline.
    const phiA = Math.atan2(T.yKm, T.xKm);
    const phiB = Math.PI - Math.atan2(T.yKm, b.xKm - T.xKm);
    expect(x.rangeAKm).toBeCloseTo((10 * Math.sin(Math.PI - phiB)) / Math.sin(phiB - phiA), 9);
    expect(x.rangeAKm).toBeCloseTo(distanceKm(a, T), 9);
    expect(x.rangeBKm).toBeCloseTo(distanceKm(b, T), 9);
    expect(crossBearings(a, 45, b, 45)).toBeUndefined();
  });

  it('fixes exact bearings at the target', () => {
    const sites = [{ xKm: 0, yKm: 0 }, { xKm: 12, yKm: 0 }, { xKm: 2, yKm: 14 }];
    const lines = sites.map((s) => ({ ...s, bearingDeg: bearingDeg(s, T), sigmaDeg: 2 }));
    const f = fixFromBearings(lines)!;
    expect(f.xKm).toBeCloseTo(T.xKm, 6);
    expect(f.yKm).toBeCloseTo(T.yKm, 6);
    expect(f.cepKm).toBeGreaterThan(0);
  });

  it('a 90° crossing gives a smaller CEP than a 20° one, for the same bearing errors', () => {
    const at = { xKm: 0, yKm: 10 };
    const fixAt = (b: { xKm: number; yKm: number }) =>
      fixFromBearings([{ xKm: 0, yKm: 0, bearingDeg: 0, sigmaDeg: 2 }, { ...b, bearingDeg: bearingDeg(b, at), sigmaDeg: 2 }])!;
    const wide = fixAt({ xKm: 10, yKm: 10 });
    const narrow = fixAt({ xKm: 3.64, yKm: 0 });
    expect(crossingAngleDeg(0, bearingDeg({ xKm: 10, yKm: 10 }, at))).toBeCloseTo(90, 6);
    expect(narrow.cepKm).toBeGreaterThan(2 * wide.cepKm);
  });

  it('noisy bearings land around the target within a few CEPs', () => {
    const rng = createRng(6);
    const sites = [{ xKm: 0, yKm: 0 }, { xKm: 12, yKm: 0 }, { xKm: 2, yKm: 14 }];
    let inside = 0;
    const runs = 400;
    let cep = 0;
    for (let k = 0; k < runs; k++) {
      const f = fixFromBearings(sites.map((s) => ({ ...s, ...measuredBearing(rng, s, T, 20) })))!;
      cep = f.cepKm;
      if (distanceKm(f, T) <= f.cepKm) inside++;
    }
    expect(cep).toBeGreaterThan(0);
    // About half of the fixes fall inside the CEP (the model's own definition), within sampling.
    expect(inside / runs).toBeGreaterThan(0.38);
    expect(inside / runs).toBeLessThan(0.62);
  });
});

describe('time difference of arrival', () => {
  const sites = [{ xKm: 0, yKm: 0 }, { xKm: 14, yKm: 0 }, { xKm: 4, yKm: 15 }];

  it('turns a time difference into a range difference: 1 µs is 300 m', () => {
    expect(rangeDifferenceKm(1)).toBeCloseTo(0.2998, 4);
    expect(rangeDifferenceKm(timeDifferenceUs(sites[0], sites[1], T))).toBeCloseTo(distanceKm(sites[0], T) - distanceKm(sites[1], T), 9);
  });

  it('puts the target on the hyperbola of its range difference', () => {
    const dr = distanceKm(sites[0], T) - distanceKm(sites[1], T);
    for (const p of hyperbolaPoints(sites[0], sites[1], dr, 30)) {
      expect(distanceKm(sites[0], p) - distanceKm(sites[1], p)).toBeCloseTo(dr, 6);
    }
    const near = Math.min(...hyperbolaPoints(sites[0], sites[1], dr, 30, 2001).map((p) => distanceKm(p, T)));
    expect(near).toBeLessThan(0.05);
  });

  it('fixes exact time differences at the target', () => {
    const dt = sites.slice(1).map((s) => timeDifferenceUs(s, sites[0], T));
    const f = tdoaFix(sites, dt, [0.05, 0.05, 0.05])!;
    expect(f.xKm).toBeCloseTo(T.xKm, 5);
    expect(f.yKm).toBeCloseTo(T.yKm, 5);
    expect(f.cepKm).toBeGreaterThan(0);
    expect(f.cepKm).toBeLessThan(0.1);
  });

  it('noisy time differences land within about the CEP half the time', () => {
    const rng = createRng(11);
    const sig = [0.1, 0.1, 0.1];
    let inside = 0;
    const runs = 300;
    for (let k = 0; k < runs; k++) {
      const t = sites.map((s, i) => distanceKm(s, T) / C_KM_PER_US + sig[i] * gauss(rng));
      const f = tdoaFix(sites, [t[1] - t[0], t[2] - t[0]], sig)!;
      if (distanceKm(f, T) <= f.cepKm) inside++;
    }
    expect(inside / runs).toBeGreaterThan(0.38);
    expect(inside / runs).toBeLessThan(0.62);
  });

  it('timing error shrinks with SNR and integration, and clock error adds on', () => {
    expect(crossSnr(0, 0)).toBeCloseTo(1 / 3, 9);
    const a = tdoaSigmaUs(0, 0, 1000, 1);
    expect(a).toBeCloseTo(1 / Math.sqrt(2 * 1000 / 3), 9);
    expect(tdoaSigmaUs(10, 10, 1000, 1)).toBeLessThan(a);
    expect(tdoaSigmaUs(0, 0, 4000, 1)).toBeCloseTo(a / 2, 9);
    expect(tdoaSigmaUs(0, 0, 1000, 1, 0.1)).toBeGreaterThan(a);
  });

  it('cross-correlating a capture with a delayed copy peaks at the delay', () => {
    const code = mSequence(10);
    const n = code.length;
    const delay = 37; // chips
    const a = { re: Float64Array.from(code), im: new Float64Array(n) };
    const b = { re: new Float64Array(n), im: new Float64Array(n) };
    for (let i = delay; i < n; i++) {
      b.re[i] = a.re[i - delay];
      b.im[i] = a.im[i - delay];
    }
    const cc = crossCorrelation(a, b, -60, 60);
    const peak = cc.reduce((p, q) => (q.mag > p.mag ? q : p));
    expect(peak.lag).toBe(delay);
  });
});

function gauss(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
