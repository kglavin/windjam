// Level 10 (docs/design-level-10.md): users sharing a band with 31-chip Gold codes, chip-synchronous, each at its own
// amplitude; despreading, successive interference cancellation, and finding an unknown short code from the received
// chips alone.
import { createRng } from '../rng';
import { gaussian } from '../detect';
import { symEig } from './linalg';
import { wilson } from './measure';
import { goldCode } from './pn';
import { qfunc, undb } from './theory';

export const CDMA_DEGREE = 5;
export const CHIPS = 31;

export interface User {
  code: number; // Gold code index (pn.goldCode)
  powerDb: number; // chip power over the noise per chip (Ec/N0, dB)
}

const codes = new Map<number, Int8Array>();
export const codeOf = (k: number): Int8Array => {
  let c = codes.get(k);
  if (!c) {
    c = goldCode(CDMA_DEGREE, k);
    codes.set(k, c);
  }
  return c;
};

// Normalised zero-lag cross-correlation of two users' codes.
export function rho(a: number, b: number): number {
  const x = codeOf(a);
  const y = codeOf(b);
  let s = 0;
  for (let i = 0; i < CHIPS; i++) s += x[i] * y[i];
  return s / CHIPS;
}

// Gaussian-approximation SINR (linear) of user k after despreading: Gp·Ec,k ÷ (N0 + Gp·Σ Ec,j·ρ²).
export function sinr(users: User[], k: number, removed: number[] = []): number {
  const pk = undb(users[k].powerDb);
  let interference = 0;
  users.forEach((u, j) => {
    if (j === k || removed.includes(j)) return;
    interference += undb(u.powerDb) * rho(users[k].code, u.code) ** 2;
  });
  return (CHIPS * pk) / (1 + CHIPS * interference);
}
export const berOfSinr = (s: number): number => qfunc(Math.sqrt(2 * s));

// The exact BER of user k with the chips aligned: each other user adds ±A·ρ, a fixed amount for its bit, so the
// average runs over every combination of the others' bits (users in `removed` are cancelled perfectly).
export function berExact(users: User[], k: number, removed: number[] = []): number {
  const ak = Math.sqrt(undb(users[k].powerDb));
  const others = users.flatMap((u, j) => (j === k || removed.includes(j) ? [] : [Math.sqrt(undb(u.powerDb)) * rho(users[k].code, u.code)]));
  const sd = Math.sqrt(1 / CHIPS); // noise after despreading, unit noise per chip
  let total = 0;
  const combos = 1 << others.length;
  for (let m = 0; m < combos; m++) {
    let mean = ak;
    others.forEach((x, i) => (mean += m & (1 << i) ? x : -x));
    total += qfunc(mean / sd);
  }
  return total / combos;
}

// The usual rule for K equal users and random-like codes: SINR ≈ Gp ÷ (K − 1) when noise is small.
export const ruleSinr = (k: number): number => CHIPS / (k - 1);

export interface CdmaResult {
  bits: number;
  errors: number[]; // per user
  ber: number[];
  lo: number[];
  hi: number[];
}

// Bits for every user, summed chips plus noise of unit power per chip; each user despread, either directly or by
// successive cancellation (strongest first: decode, rebuild, subtract).
export function runCdma(users: User[], bits: number, seed: number, sic = false): CdmaResult {
  const rng = createRng(seed);
  const amp = users.map((u) => Math.sqrt(undb(u.powerDb)));
  const order = [...users.keys()].sort((a, b) => users[b].powerDb - users[a].powerDb);
  const errors = users.map(() => 0);
  const r = new Float64Array(CHIPS);
  for (let n = 0; n < bits; n++) {
    const b = users.map(() => (rng() < 0.5 ? -1 : 1));
    for (let i = 0; i < CHIPS; i++) {
      let v = gaussian(rng);
      users.forEach((u, j) => (v += amp[j] * b[j] * codeOf(u.code)[i]));
      r[i] = v;
    }
    const list = sic ? order : [...users.keys()];
    for (const j of list) {
      const c = codeOf(users[j].code);
      let z = 0;
      for (let i = 0; i < CHIPS; i++) z += r[i] * c[i];
      const d = z >= 0 ? 1 : -1;
      if (d !== b[j]) errors[j]++;
      if (sic) for (let i = 0; i < CHIPS; i++) r[i] -= amp[j] * d * c[i];
    }
  }
  const w = errors.map((e) => wilson(e, bits));
  return { bits, errors, ber: w.map((x) => x.ber), lo: w.map((x) => x.lo), hi: w.map((x) => x.hi) };
}

// --- Finding an unknown short code ----------------------------------------------------------------------------------

// Received chips of one user (its code, random data bits, Ec/N0 in dB) cut into `pieces` code periods. Its code is the
// main eigenvector of the pieces' covariance; the bit signs cancel because each piece's outer product is the same.
// Returns the estimate's chips and how many agree with the true code (up to an overall sign).
export function discoverCode(code: Int8Array, chipSnrDb: number, pieces: number, seed: number): { estimate: number[]; agree: number } {
  const n = code.length;
  const rng = createRng(seed);
  const a = Math.sqrt(undb(chipSnrDb));
  const C = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const x = new Float64Array(n);
  for (let p = 0; p < pieces; p++) {
    const b = rng() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) x[i] = a * b * code[i] + gaussian(rng);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i][j] += (x[i] * x[j]) / pieces;
  }
  const v = symEig(C).vectors[0];
  const est = v.map((z) => (z >= 0 ? 1 : -1));
  let same = 0;
  for (let i = 0; i < n; i++) if (est[i] === code[i]) same++;
  return { estimate: est, agree: Math.max(same, n - same) };
}
