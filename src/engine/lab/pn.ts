// Fibonacci LFSR feedback taps for degrees 3 to 17 (1-based stages, highest = degree).
export const PRIMITIVE_TAPS: Record<number, number[]> = {
  3: [3, 2],
  4: [4, 3],
  5: [5, 3],
  6: [6, 5],
  7: [7, 6],
  8: [8, 6, 5, 4],
  9: [9, 5],
  10: [10, 7],
  11: [11, 9],
  12: [12, 11, 10, 4],
  13: [13, 12, 11, 8],
  14: [14, 13, 12, 2],
  15: [15, 14],
  16: [16, 15, 13, 4],
  17: [17, 14],
};

// One period of an m-sequence as BPSK chips (bit 0 -> +1, bit 1 -> -1), length 2^degree - 1.
export function mSequence(degree: number, seed = 1): Int8Array {
  const taps = PRIMITIVE_TAPS[degree];
  if (!taps) throw new Error(`unsupported m-sequence degree ${degree}`);
  const mask = (1 << degree) - 1;
  let state = seed & mask;
  if (state === 0) throw new Error('m-sequence seed must be nonzero');
  const n = mask;
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = state & 1 ? -1 : 1;
    let fb = 0;
    for (const t of taps) fb ^= (state >> (degree - t)) & 1;
    state = (state >> 1) | (fb << (degree - 1));
  }
  return out;
}

// Periodic autocorrelation R(k) = sum over n of code[n] * code[(n + k) mod N], for all lags or the given ones.
export function periodicAutocorrelation(code: Int8Array, lags?: number[]): Float64Array {
  const n = code.length;
  const ks = lags ?? Array.from({ length: n }, (_, i) => i);
  const out = new Float64Array(ks.length);
  for (let j = 0; j < ks.length; j++) {
    const k = ((ks[j] % n) + n) % n;
    let s = 0;
    for (let i = 0; i < n; i++) {
      let m = i + k;
      if (m >= n) m -= n;
      s += code[i] * code[m];
    }
    out[j] = s;
  }
  return out;
}

// --- Level 8: the register step by step, rebuilding a code, Gold codes ---------------------------------------------

// An m-sequence (or any register sequence) from explicit taps, as BPSK chips like mSequence.
export function registerSequence(degree: number, taps: number[], seed = 1, length = 2 ** degree - 1): Int8Array {
  const mask = (1 << degree) - 1;
  let state = seed & mask;
  const out = new Int8Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = state & 1 ? -1 : 1;
    let fb = 0;
    for (const t of taps) fb ^= (state >> (degree - t)) & 1;
    state = (state >> 1) | (fb << (degree - 1));
  }
  return out;
}

// The register's stages before each step (stage 1 first: the bit about to come out is the last stage), and the
// feedback bit it shifts in. For the shift-register instrument and the videos.
export function registerSteps(degree: number, taps: number[], seed: number, steps: number): { stages: number[]; out: number; feedback: number }[] {
  const mask = (1 << degree) - 1;
  let state = seed & mask;
  const out: { stages: number[]; out: number; feedback: number }[] = [];
  for (let i = 0; i < steps; i++) {
    let fb = 0;
    for (const t of taps) fb ^= (state >> (degree - t)) & 1;
    const stages = Array.from({ length: degree }, (_, k) => (state >> (degree - 1 - k)) & 1);
    out.push({ stages, out: state & 1, feedback: fb });
    state = (state >> 1) | (fb << (degree - 1));
  }
  return out;
}

export const chipsToBits = (chips: ArrayLike<number>): number[] => Array.from(chips, (c) => (c < 0 ? 1 : 0));

// Berlekamp–Massey over GF(2): the shortest linear recurrence s[j] = c1·s[j−1] + … + cL·s[j−L] (mod 2) that produces
// the bits. L is the linear complexity; an m-sequence of degree n has L = n, found from 2n bits.
export function berlekampMassey(bits: ArrayLike<number>): { length: number; coeffs: number[] } {
  const n = bits.length;
  let c = new Array<number>(n + 1).fill(0);
  let b = new Array<number>(n + 1).fill(0);
  c[0] = 1;
  b[0] = 1;
  let L = 0;
  let m = 1;
  for (let i = 0; i < n; i++) {
    let d = bits[i] & 1;
    for (let k = 1; k <= L; k++) d ^= c[k] & bits[i - k];
    if (d === 0) {
      m++;
    } else if (2 * L <= i) {
      const t = c.slice();
      for (let k = 0; k + m <= n; k++) c[k + m] ^= b[k];
      L = i + 1 - L;
      b = t;
      m = 1;
    } else {
      for (let k = 0; k + m <= n; k++) c[k + m] ^= b[k];
      m++;
    }
  }
  return { length: L, coeffs: c.slice(1, L + 1) };
}

// Extends bits with the recurrence Berlekamp–Massey found: the attacker's prediction of the chips to come.
export function extendRecurrence(start: ArrayLike<number>, coeffs: number[], count: number): number[] {
  const s = Array.from(start, (x) => x & 1);
  const L = coeffs.length;
  while (s.length < start.length + count) {
    const j = s.length;
    let v = 0;
    for (let k = 1; k <= L; k++) v ^= coeffs[k - 1] & s[j - k];
    s.push(v);
  }
  return s.slice(start.length);
}

// Preferred pairs: two m-sequences whose cross-correlation takes only the three values −1, −t and t − 2,
// t = 1 + 2^((n+1)/2).
export const PREFERRED_PAIRS: Record<number, [number[], number[]]> = {
  5: [[5, 3], [5, 4, 3, 2]],
  7: [[7, 6], [7, 4]],
};

// Gold code k of a degree (0 and 1: the pair themselves; 2 to N + 1: the first plus the second shifted by k − 2).
export function goldCode(degree: number, k: number): Int8Array {
  const pair = PREFERRED_PAIRS[degree];
  if (!pair) throw new Error(`no preferred pair for degree ${degree}`);
  const a = registerSequence(degree, pair[0]);
  const b = registerSequence(degree, pair[1]);
  const n = a.length;
  if (k === 0) return a;
  if (k === 1) return b;
  const shift = k - 2;
  return Int8Array.from(a, (x, i) => x * b[(i + shift) % n]);
}

// Periodic cross-correlation of two codes at every lag.
export function periodicCrossCorrelation(a: Int8Array, b: Int8Array): Float64Array {
  const n = a.length;
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i] * b[(i + k) % n];
    out[k] = s;
  }
  return out;
}
