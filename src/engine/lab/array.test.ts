import { describe, expect, it } from 'vitest';
import { angleGrid, beamwidthDeg, delayAndSum, idealCovariance, musicSpectrumDb, mvdr, patternDb, peaks, response, sampleCovariance, steering } from './array';
import { type CMatrix, cInner, complexSolve, hermitianEig, symEig } from './linalg';
import { createRng } from '../rng';

const matVec = (A: CMatrix, v: { re: number[]; im: number[] }) => ({
  re: A.re.map((row, i) => row.reduce((s, x, j) => s + x * v.re[j] - A.im[i][j] * v.im[j], 0)),
  im: A.re.map((row, i) => row.reduce((s, x, j) => s + x * v.im[j] + A.im[i][j] * v.re[j], 0)),
});

describe('linear algebra', () => {
  it('symmetric eigen: a 2 × 2 with eigenvalues 3 and 1', () => {
    const e = symEig([[2, 1], [1, 2]]);
    expect(e.values[0]).toBeCloseTo(3, 10);
    expect(e.values[1]).toBeCloseTo(1, 10);
  });

  it('Hermitian eigen: A v = λ v for a random covariance', () => {
    const R = sampleCovariance(5, [{ thetaDeg: 20, power: 10 }, { thetaDeg: -35, power: 3 }], 1, 200, 4);
    const e = hermitianEig(R);
    expect(e.values).toHaveLength(5);
    for (let k = 0; k < 5; k++) {
      const av = matVec(R, e.vectors[k]);
      for (let i = 0; i < 5; i++) {
        expect(av.re[i]).toBeCloseTo(e.values[k] * e.vectors[k].re[i], 6);
        expect(av.im[i]).toBeCloseTo(e.values[k] * e.vectors[k].im[i], 6);
      }
    }
    for (let k = 1; k < 5; k++) expect(e.values[k]).toBeLessThanOrEqual(e.values[k - 1] + 1e-9);
  });

  it('complex solve', () => {
    const R = idealCovariance(4, [{ thetaDeg: 10, power: 5 }], 1);
    const b = steering(4, 30);
    const x = complexSolve(R, b);
    const back = matVec(R, x);
    for (let i = 0; i < 4; i++) {
      expect(back.re[i]).toBeCloseTo(b.re[i], 9);
      expect(back.im[i]).toBeCloseTo(b.im[i], 9);
    }
    expect(createRng(1)()).toBeGreaterThan(0);
  });
});

describe('arrays', () => {
  it('delay-and-sum: unit response at the look, beamwidth about 102° ÷ M', () => {
    for (const m of [4, 8, 12]) {
      expect(response(delayAndSum(m, 25), 25)).toBeCloseTo(1, 12);
      expect(beamwidthDeg(m)).toBeCloseTo(102 / m, -0.5);
    }
    const a = steering(6, 0);
    expect(a.re.every((v) => Math.abs(v - 1) < 1e-12)).toBe(true);
  });

  it('MVDR keeps the look direction and nulls a jammer; delay-and-sum does not', () => {
    const R = idealCovariance(8, [{ thetaDeg: 40, power: 1000 }], 1);
    const w = mvdr(R, 0);
    expect(response(w, 0)).toBeCloseTo(1, 9);
    expect(patternDb(w, 0, [40])[0]).toBeLessThan(-35);
    expect(patternDb(delayAndSum(8, 0), 0, [40])[0]).toBeGreaterThan(-35);
  });

  it('M elements null up to M − 1 jammers, not M', () => {
    const DIRS = [-55, 30, 65, -25];
    const jam = (k: number) => DIRS.slice(0, k).map((thetaDeg) => ({ thetaDeg, power: 1000 }));
    const deepest = (k: number) => {
      const w = mvdr(idealCovariance(4, jam(k), 1), 0);
      return Math.max(...patternDb(w, 0, jam(k).map((j) => j.thetaDeg)));
    };
    expect(deepest(3)).toBeLessThan(-25);
    expect(deepest(4)).toBeGreaterThan(-25);
  });

  it('MUSIC finds two emitters with 6 elements', () => {
    const R = sampleCovariance(6, [{ thetaDeg: -20, power: 10 }, { thetaDeg: 15, power: 10 }], 1, 400, 9);
    const grid = angleGrid(0.25);
    const p = peaks(grid, musicSpectrumDb(R, 2, grid), 2).sort((a, b) => a - b);
    expect(p[0]).toBeCloseTo(-20, 0);
    expect(p[1]).toBeCloseTo(15, 0);
    expect(cInner(steering(3, 0), steering(3, 0)).re).toBeCloseTo(3, 12);
  });
});
