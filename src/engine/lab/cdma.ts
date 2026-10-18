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
  code: number; // Gold code index (pn.goldCode), 0 to 32
  powerDb: number; // chip power over the noise per chip (Ec/N0, dB)
  offset?: number; // chips the user's bits start after the reference user's (asynchronous users), 0 to 30
}

const codes = new Map<number, Int8Array>();
export const codeOf = (k: number): Int8Array => {
  if (!Number.isInteger(k) || k < 0 || k > CHIPS + 1) throw new Error(`Gold code index ${k} is outside 0 to ${CHIPS + 1}`);
  let c = codes.get(k);
  if (!c) {
    c = goldCode(CDMA_DEGREE, k);
    codes.set(k, c);
  }
  return c;
};

// Normalised zero-lag cross-correlation of two users' codes (chips aligned).
export function rho(a: number, b: number): number {
  const x = codeOf(a);
  const y = codeOf(b);
  let s = 0;
  for (let i = 0; i < CHIPS; i++) s += x[i] * y[i];
  return s / CHIPS;
}

// What user j adds to user k's despread bit when j's bits start `tau` chips later: its previous bit times R1 and its
// current bit times R2, the two partial correlations (each ÷ N).
export function partials(k: number, j: number, tau: number): [number, number] {
  const ck = codeOf(k);
  const cj = codeOf(j);
  const t = ((tau % CHIPS) + CHIPS) % CHIPS;
  let r1 = 0;
  let r2 = 0;
  for (let i = 0; i < t; i++) r1 += cj[CHIPS - t + i] * ck[i];
  for (let i = t; i < CHIPS; i++) r2 += cj[i - t] * ck[i];
  return [r1 / CHIPS, r2 / CHIPS];
}

// SINR (linear) of user k after despreading, interference as noise (Gaussian approximation): each other user adds
// variance P·(R1² + R2²) with random bits; the noise adds 1/N. Users in `removed` are cancelled perfectly.
export function sinr(users: User[], k: number, removed: number[] = []): number {
  const pk = undb(users[k].powerDb);
  let interference = 1 / CHIPS;
  users.forEach((u, j) => {
    if (j === k || removed.includes(j)) return;
    const [r1, r2] = partials(users[k].code, u.code, (u.offset ?? 0) - (users[k].offset ?? 0));
    interference += undb(u.powerDb) * (r1 * r1 + r2 * r2);
  });
  return pk / interference;
}
export const berOfSinr = (s: number): number => qfunc(Math.sqrt(2 * s));
export const berGauss = (users: User[], k: number, removed: number[] = []): number => berOfSinr(sinr(users, k, removed));

// User k's BER averaged over every other user's two overlapping bits (4 cases each), exact for chip-aligned offsets.
// Up to 10 users; beyond that the Gaussian approximation, which more users make better.
export function berCdma(users: User[], k: number, removed: number[] = []): number {
  const terms: [number, number][] = [];
  users.forEach((u, j) => {
    if (j === k || removed.includes(j)) return;
    const a = Math.sqrt(undb(u.powerDb));
    const [r1, r2] = partials(users[k].code, u.code, (u.offset ?? 0) - (users[k].offset ?? 0));
    terms.push([a * r1, a * r2]);
  });
  if (terms.length > 9) return berGauss(users, k, removed);
  const ak = Math.sqrt(undb(users[k].powerDb));
  const sd = Math.sqrt(1 / CHIPS);
  let total = 0;
  const combos = 1 << (2 * terms.length);
  for (let m = 0; m < combos; m++) {
    let mean = ak;
    terms.forEach(([x, y], i) => {
      mean += (m & (1 << (2 * i)) ? x : -x) + (m & (1 << (2 * i + 1)) ? y : -y);
    });
    total += qfunc(mean / sd);
  }
  return total / combos;
}

// The rule for K equal users and codes that look random to each other: SINR ≈ Gp ÷ (K − 1) when noise is small.
export const ruleSinr = (k: number, gp = CHIPS): number => gp / (k - 1);

export interface CdmaResult {
  bits: number;
  errors: number[]; // per user
  ber: number[];
  lo: number[];
  hi: number[];
}

// Every user's whole chip stream, offset by its chips, summed with noise of unit power per chip. Each user is despread
// over its own bit windows; with sic, strongest first, each user's decided bits are rebuilt and subtracted before the
// next is decoded.
export function runCdma(users: User[], bits: number, seed: number, sic = false): CdmaResult {
  const rng = createRng(seed);
  const amp = users.map((u) => Math.sqrt(undb(u.powerDb)));
  const len = (bits + 1) * CHIPS;
  const data = users.map(() => Int8Array.from({ length: bits + 1 }, () => (rng() < 0.5 ? -1 : 1)));
  const r = new Float64Array(len);
  for (let i = 0; i < len; i++) r[i] = gaussian(rng);
  users.forEach((u, j) => {
    const c = codeOf(u.code);
    const off = u.offset ?? 0;
    for (let i = off; i < len; i++) r[i] += amp[j] * data[j][Math.floor((i - off) / CHIPS)] * c[(i - off) % CHIPS];
  });
  const order = sic ? [...users.keys()].sort((a, b) => users[b].powerDb - users[a].powerDb) : [...users.keys()];
  const errors = users.map(() => 0);
  for (const j of order) {
    const c = codeOf(users[j].code);
    const off = users[j].offset ?? 0;
    for (let n = 0; n < bits; n++) {
      let z = 0;
      for (let i = 0; i < CHIPS; i++) z += r[off + n * CHIPS + i] * c[i];
      const d = z >= 0 ? 1 : -1;
      if (d !== data[j][n]) errors[j]++;
      if (sic) for (let i = 0; i < CHIPS; i++) r[off + n * CHIPS + i] -= amp[j] * d * c[i];
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
