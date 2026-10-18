import { describe, expect, it } from 'vitest';
import { CHIPS, berCdma, berGauss, codeOf, discoverCode, partials, rho, ruleSinr, runCdma, sinr } from './cdma';

describe('CDMA with Gold codes', () => {
  it('aligned, two family codes cross-correlate at −1/31; offset, the partial sums add to Gold values', () => {
    expect(rho(4, 9)).toBeCloseTo(-1 / 31, 12);
    for (let tau = 1; tau < 31; tau++) {
      const [r1, r2] = partials(4, 9, tau);
      // Same bit before and after (r1 + r2) is the periodic cross-correlation at that lag.
      expect([-1, -9, 7].map((v) => v / 31)).toContainEqual(expect.closeTo(r1 + r2, 12));
    }
    expect(codeOf(2)).toHaveLength(CHIPS);
    expect(() => codeOf(33)).toThrow();
  });

  it('asynchronous users: the run agrees with the Gaussian SINR', () => {
    const users = [2, 7, 11, 19, 25].map((code, i) => ({ code, powerDb: 6, offset: (i * 7) % 31 }));
    const r = runCdma(users, 20000, 3);
    for (let k = 0; k < users.length; k++) {
      const t = berCdma(users, k);
      expect(t).toBeGreaterThan(r.lo[k] * 0.85);
      expect(t).toBeLessThan(r.hi[k] * 1.15);
    }
    expect(berGauss(users, 0)).toBeGreaterThan(0);
    expect(ruleSinr(5)).toBeCloseTo(31 / 4, 12);
  });

  it('near-far: a strong user buries a weak one; cancelling it first brings it back', () => {
    const users = [{ code: 2, powerDb: 14, offset: 0 }, { code: 9, powerDb: -2, offset: 11 }];
    const plain = runCdma(users, 20000, 5);
    const sic = runCdma(users, 20000, 5, true);
    expect(plain.ber[1]).toBeGreaterThan(0.05);
    expect(sic.ber[1]).toBeLessThan(plain.ber[1] / 10);
    expect(sinr(users, 1, [0])).toBeGreaterThan(10 * sinr(users, 1));
    expect(berCdma(users, 1)).toBeCloseTo(plain.ber[1], 1);
    expect(berCdma(users, 1, [0])).toBeLessThan(sic.hi[1] * 1.15);
  });

  it('finds an unknown short code below the noise once enough periods are averaged', () => {
    const code = codeOf(9);
    expect(discoverCode(code, -6, 400, 1).agree).toBe(31);
    expect(discoverCode(code, -6, 5, 1).agree).toBeLessThan(31);
  });
});
