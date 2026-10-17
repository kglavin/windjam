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
