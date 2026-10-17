import { describe, expect, it } from 'vitest';
import { PRIMITIVE_TAPS, mSequence, periodicAutocorrelation } from './pn';

const DEGREES = Array.from({ length: 15 }, (_, i) => i + 3);
const LONG = [11, 12, 13, 14, 15, 16, 17];

// Steps the LFSR from the seed and counts the steps until it returns to the seed.
function stateCycleLength(degree: number, seed: number): number {
  const taps = PRIMITIVE_TAPS[degree];
  const mask = (1 << degree) - 1;
  const start = seed & mask;
  let state = start;
  let steps = 0;
  do {
    let fb = 0;
    for (const t of taps) fb ^= (state >> (degree - t)) & 1;
    state = (state >> 1) | (fb << (degree - 1));
    steps++;
  } while (state !== start && steps <= mask);
  return steps;
}

// Lags spread across 1..N-1, including both ends.
function spreadLags(n: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.floor(1 + (i * (n - 2)) / (count - 1)));
}

describe('m-sequence length and period', () => {
  it.each(DEGREES)('degree %i: length is 2^n - 1 and the state cycle has that length', { timeout: 30_000 }, (n) => {
    const code = mSequence(n);
    expect(code.length).toBe(2 ** n - 1);
    expect(stateCycleLength(n, 1)).toBe(2 ** n - 1);
  });
});

describe('m-sequence balance', () => {
  it.each(DEGREES)('degree %i: chip sum is -1', (n) => {
    const sum = mSequence(n).reduce((a, c) => a + c, 0);
    expect(sum).toBe(-1);
  });
});

describe('m-sequence autocorrelation', () => {
  it.each([3, 4, 5, 6, 7, 8, 9, 10])('degree %i: two-valued over all lags', (n) => {
    const code = mSequence(n);
    const N = code.length;
    const r = periodicAutocorrelation(code);
    expect(r[0]).toBe(N);
    for (let k = 1; k < N; k++) expect(r[k]).toBe(-1);
  });

  it.each(LONG)(
    'degree %i: two-valued over 200 lags',
    { timeout: 30_000 },
    (n) => {
      const code = mSequence(n);
      const N = code.length;
      const lags = [0, ...spreadLags(N, 200)];
      const r = periodicAutocorrelation(code, lags);
      expect(r[0]).toBe(N);
      for (let j = 1; j < lags.length; j++) expect(r[j]).toBe(-1);
    },
  );
});

describe('m-sequence seeds', () => {
  it('different seeds give cyclic shifts of the same sequence (degree 7)', () => {
    const a = mSequence(7, 1);
    const N = a.length;
    const b = mSequence(7, 0b1011010);
    const shifts = Array.from({ length: N }, (_, s) => s);
    const match = shifts.some((s) => shifts.every((i) => b[i] === a[(i + s) % N]));
    expect(match).toBe(true);
  });
});

describe('m-sequence errors', () => {
  it('throws for degree 2 and 18', () => {
    expect(() => mSequence(2)).toThrow();
    expect(() => mSequence(18)).toThrow();
  });

  it('throws for seed 0', () => {
    expect(() => mSequence(7, 0)).toThrow();
  });
});
