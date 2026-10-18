import { describe, expect, it } from 'vitest';
import { CHIPS, berExact, codeOf, discoverCode, rho, ruleSinr, runCdma, sinr } from './cdma';

describe('CDMA with Gold codes', () => {
  it('cross-correlations take the Gold values', () => {
    for (const [a, b] of [[2, 3], [2, 9], [4, 17], [5, 30]]) expect([-1, -9, 7].map((v) => v / 31)).toContainEqual(expect.closeTo(rho(a, b), 12));
    expect(rho(2, 2)).toBe(1);
    expect(codeOf(2)).toHaveLength(CHIPS);
  });

  it('despreading one user: the run agrees with the SINR approximation', () => {
    const users = [2, 7, 11, 19, 25].map((code) => ({ code, powerDb: -8 }));
    const r = runCdma(users, 20000, 3);
    for (let k = 0; k < users.length; k++) {
      const t = berExact(users, k);
      expect(t).toBeGreaterThan(r.lo[k] * 0.85);
      expect(t).toBeLessThan(r.hi[k] * 1.15);
    }
    expect(ruleSinr(5)).toBeCloseTo(31 / 4, 12);
  });

  it('near-far: a strong user buries a weak one; cancelling it first brings it back', () => {
    // A pair whose codes cross-correlate at 9/31.
    let partner = 3;
    while (Math.abs(rho(2, partner)) < 0.29) partner++;
    const users = [{ code: 2, powerDb: 12 }, { code: partner, powerDb: -6 }];
    const plain = runCdma(users, 20000, 5);
    const sic = runCdma(users, 20000, 5, true);
    expect(plain.ber[1]).toBeGreaterThan(0.2);
    expect(sic.ber[1]).toBeLessThan(0.01);
    expect(berExact(users, 1)).toBeCloseTo(plain.ber[1], 1);
    expect(berExact(users, 1, [0])).toBeCloseTo(sic.ber[1], 2);
    expect(sinr(users, 1, [0])).toBeGreaterThan(sinr(users, 1));
  });

  it('finds an unknown short code below the noise once enough periods are averaged', () => {
    const code = codeOf(9);
    expect(discoverCode(code, -6, 400, 1).agree).toBe(31);
    expect(discoverCode(code, -6, 5, 1).agree).toBeLessThan(31);
  });
});
