// Level 6 geometry (docs/design-level-6.md): bearings, triangulation, the least-squares fix, and time difference of
// arrival. Positions in km, x east and y north as in the Link lab scene; bearings clockwise from north. The bearing
// error model and the bearing fix are the map game's (detect.ts), so the level teaches what the missions play.
import { bearingSigmaDeg, cepFromSigmas, ellipseFromCovariance, fixFromLinesKm, gaussian } from '../detect';

export interface Pt {
  xKm: number;
  yKm: number;
}

export const C_KM_PER_US = 0.299792458; // speed of light: km per microsecond

export { bearingSigmaDeg };

// Bearing from a to b, clockwise from north, 0 to 360.
export function bearingDeg(a: Pt, b: Pt): number {
  return ((Math.atan2(b.xKm - a.xKm, b.yKm - a.yKm) * 180) / Math.PI + 360) % 360;
}

export const distanceKm = (a: Pt, b: Pt): number => Math.hypot(a.xKm - b.xKm, a.yKm - b.yKm);

// Angle between two bearing lines, 0 to 90°: 90° crossings make the smallest error ellipse.
export function crossingAngleDeg(b1: number, b2: number): number {
  const d = Math.abs(b1 - b2) % 180;
  return Math.min(d, 180 - d);
}

// A bearing as measured: the true bearing plus Gaussian error of σ = max(2°, 20°/√SNR).
export function measuredBearing(rng: () => number, site: Pt, target: Pt, snrDb: number): { bearingDeg: number; sigmaDeg: number } {
  const sigmaDeg = bearingSigmaDeg(snrDb);
  return { bearingDeg: (bearingDeg(site, target) + sigmaDeg * gaussian(rng) + 360) % 360, sigmaDeg };
}

// Where two bearing lines cross, and each site's range to that point (the law of sines in the triangle of the two
// sites and the target). Undefined when the lines are parallel or cross behind a site.
export function crossBearings(a: Pt, bearingA: number, b: Pt, bearingB: number): { point: Pt; rangeAKm: number; rangeBKm: number } | undefined {
  const ta = (bearingA * Math.PI) / 180;
  const tb = (bearingB * Math.PI) / 180;
  const da = { x: Math.sin(ta), y: Math.cos(ta) };
  const db = { x: Math.sin(tb), y: Math.cos(tb) };
  const det = da.x * -db.y - da.y * -db.x;
  if (Math.abs(det) < 1e-9) return undefined;
  const rx = b.xKm - a.xKm;
  const ry = b.yKm - a.yKm;
  const ra = (rx * -db.y - ry * -db.x) / det;
  const rb = (da.x * ry - da.y * rx) / det;
  if (ra <= 0 || rb <= 0) return undefined;
  return { point: { xKm: a.xKm + ra * da.x, yKm: a.yKm + ra * da.y }, rangeAKm: ra, rangeBKm: rb };
}

export interface Fix {
  xKm: number;
  yKm: number;
  cepKm: number;
  ellipse: { aKm: number; bKm: number; angleRad: number }; // 1σ axes; angle of a from east, counterclockwise
}

export interface BearingLine extends Pt {
  bearingDeg: number;
  sigmaDeg: number;
}

// The map game's least-squares fix, in the lab's north-up frame.
export function fixFromBearings(lines: BearingLine[]): Fix | undefined {
  const f = fixFromLinesKm(lines.map((l) => ({ x: l.xKm, y: -l.yKm, bearingDeg: l.bearingDeg, sigmaDeg: l.sigmaDeg })));
  if (!f) return undefined;
  return { xKm: f.x, yKm: -f.y, cepKm: f.cepKm, ellipse: { ...f.ellipse, angleRad: -f.ellipse.angleRad } };
}

// The error a layout of DF sites gives at a target, before any noise: the weighted least-squares covariance with each
// line's weight from its true range and σ. Unlike the CEP of one noisy fix, it does not depend on luck, so it scores a
// layout fairly. Undefined when the lines are (nearly) parallel.
export function expectedBearingFix(sites: (Pt & { sigmaDeg: number })[], target: Pt): Omit<Fix, 'xKm' | 'yKm'> | undefined {
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  for (const s of sites) {
    const t = (bearingDeg(s, target) * Math.PI) / 180;
    // Normal to the bearing line in the north-up frame: perpendicular to (sin t, cos t).
    const nx = Math.cos(t);
    const ny = -Math.sin(t);
    const w = 1 / (((s.sigmaDeg * Math.PI) / 180) * Math.max(0.5, distanceKm(s, target))) ** 2;
    a11 += w * nx * nx;
    a12 += w * nx * ny;
    a22 += w * ny * ny;
  }
  const det = a11 * a22 - a12 * a12;
  if (det < 1e-12 * Math.max(1, a11 * a22)) return undefined;
  const ellipse = ellipseFromCovariance(a22 / det, -a12 / det, a11 / det);
  return { cepKm: cepFromSigmas(ellipse.aKm, ellipse.bKm), ellipse };
}

// --- Time difference of arrival -------------------------------------------------------------------------------

// Range difference from a time difference: r1 − r2 = c · (t1 − t2).
export const rangeDifferenceKm = (dtUs: number): number => C_KM_PER_US * dtUs;

// Arrival-time difference at sites 1 and 2 of a signal from target (µs): t1 − t2.
export const timeDifferenceUs = (s1: Pt, s2: Pt, target: Pt): number => (distanceKm(s1, target) - distanceKm(s2, target)) / C_KM_PER_US;

// Points on the curve |P − s1| − |P − s2| = dr: one branch of a hyperbola with the sites as foci, the branch nearer
// s2 when dr > 0. `reachKm` bounds how far from the sites' midpoint the curve is drawn.
export function hyperbolaPoints(s1: Pt, s2: Pt, drKm: number, reachKm: number, n = 121): Pt[] {
  const d = distanceKm(s1, s2);
  const c = d / 2;
  const a = Math.min(Math.abs(drKm) / 2, c * 0.999999);
  const b = Math.sqrt(Math.max(c * c - a * a, 1e-12));
  const ux = (s2.xKm - s1.xKm) / d;
  const uy = (s2.yKm - s1.yKm) / d;
  const mx = (s1.xKm + s2.xKm) / 2;
  const my = (s1.yKm + s2.yKm) / 2;
  const side = drKm >= 0 ? 1 : -1;
  const tMax = Math.asinh(reachKm / b);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = -tMax + (2 * tMax * i) / (n - 1);
    const u = side * a * Math.cosh(t);
    const v = b * Math.sinh(t);
    out.push({ xKm: mx + u * ux - v * uy, yKm: my + u * uy + v * ux });
  }
  return out;
}

// Effective SNR of a cross-correlation between two noisy captures (linear): 1 / (1/s1 + 1/s2 + 1/(s1·s2)).
export function crossSnr(snr1Db: number, snr2Db: number): number {
  const s1 = 10 ** (snr1Db / 10);
  const s2 = 10 ** (snr2Db / 10);
  return 1 / (1 / s1 + 1 / s2 + 1 / (s1 * s2));
}

// Timing error of the cross-correlation peak (µs, 1σ): the peak is about one chip wide, and integrating `chips` chips
// lifts it out of the noise, so its top is found to Tc / √(2 · chips · SNR). Clock error adds on top (in quadrature).
export function tdoaSigmaUs(snr1Db: number, snr2Db: number, chips: number, chipUs: number, clockSigmaUs = 0): number {
  const peak = chipUs / Math.sqrt(2 * chips * crossSnr(snr1Db, snr2Db));
  return Math.sqrt(peak * peak + 2 * clockSigmaUs * clockSigmaUs);
}

// Magnitude of the cross-correlation of two complex captures at lags 0..maxLag (b delayed against a), normalised so a
// signal with itself peaks at 1. A positive peak lag means b arrived later.
export function crossCorrelation(a: { re: ArrayLike<number>; im: ArrayLike<number> }, b: { re: ArrayLike<number>; im: ArrayLike<number> },
  minLag: number, maxLag: number): { lag: number; mag: number }[] {
  const n = Math.min(a.re.length, b.re.length);
  let ea = 0;
  let eb = 0;
  for (let i = 0; i < n; i++) {
    ea += a.re[i] * a.re[i] + a.im[i] * a.im[i];
    eb += b.re[i] * b.re[i] + b.im[i] * b.im[i];
  }
  const norm = Math.sqrt(ea * eb) || 1;
  const out: { lag: number; mag: number }[] = [];
  for (let k = minLag; k <= maxLag; k++) {
    let re = 0;
    let im = 0;
    for (let i = Math.max(0, -k); i < n && i + k < n; i++) {
      // a[i] · conj(b[i + k])
      re += a.re[i] * b.re[i + k] + a.im[i] * b.im[i + k];
      im += a.im[i] * b.re[i + k] - a.re[i] * b.im[i + k];
    }
    out.push({ lag: k, mag: Math.hypot(re, im) / norm });
  }
  return out;
}

// Solve the small linear system M x = v (Gaussian elimination with pivoting).
function solveLinear(M: number[][], v: number[]): number[] | undefined {
  const n = v.length;
  const A = M.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-15) return undefined;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

function invert(M: number[][]): number[][] | undefined {
  const n = M.length;
  const cols = Array.from({ length: n }, (_, j) => solveLinear(M, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0))));
  if (cols.some((c) => !c)) return undefined;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => cols[j]![i]));
}

export interface TdoaMeasurement {
  dtUs: number; // t_i − t_0, arrival at site i minus arrival at the reference site 0
}

// TDOA fix from sites (the first is the reference) and time differences t_i − t_0, each site with its own timing
// error (µs, 1σ). The differences share the reference's error, so they are weighted with their full covariance.
// A coarse grid search over `areaKm` around the sites' centre gives the start; Gauss-Newton refines it. `keep` limits
// the search to where the target can be: sites in a line give two mirror-image answers, one on each side.
export function tdoaFix(sites: Pt[], dtUs: number[], siteSigmaUs: number[], areaKm = 30, keep?: (p: Pt) => boolean): Fix | undefined {
  const m = sites.length - 1;
  if (m < 2 || dtUs.length !== m) return undefined;
  const ref = sites[0];
  const dr = dtUs.map((t) => C_KM_PER_US * t);
  // Covariance of the range differences (km²): own error plus the shared reference error.
  const s0 = C_KM_PER_US * siteSigmaUs[0];
  const C = Array.from({ length: m }, (_, i) =>
    Array.from({ length: m }, (_, j) => s0 * s0 + (i === j ? (C_KM_PER_US * siteSigmaUs[i + 1]) ** 2 : 0)));
  const W = invert(C);
  if (!W) return undefined;
  const resid = (p: Pt) => sites.slice(1).map((s, i) => distanceKm(s, p) - distanceKm(ref, p) - dr[i]);
  const cost = (p: Pt) => {
    const r = resid(p);
    let sum = 0;
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) sum += r[i] * W[i][j] * r[j];
    return sum;
  };
  const cx = sites.reduce((s, p) => s + p.xKm, 0) / sites.length;
  const cy = sites.reduce((s, p) => s + p.yKm, 0) / sites.length;
  let best = { xKm: cx, yKm: cy };
  let bestCost = keep && !keep(best) ? Infinity : cost(best);
  const step = areaKm / 60;
  for (let x = cx - areaKm; x <= cx + areaKm; x += step) {
    for (let y = cy - areaKm; y <= cy + areaKm; y += step) {
      if (keep && !keep({ xKm: x, yKm: y })) continue;
      const c = cost({ xKm: x, yKm: y });
      if (c < bestCost) {
        bestCost = c;
        best = { xKm: x, yKm: y };
      }
    }
  }
  let p = best;
  let cov: number[][] | undefined;
  for (let it = 0; it < 30; it++) {
    const r = resid(p);
    // Jacobian rows: d/dP (|P − s_i| − |P − s_0|).
    const u = (s: Pt) => {
      const d = Math.max(distanceKm(s, p), 1e-6);
      return [(p.xKm - s.xKm) / d, (p.yKm - s.yKm) / d];
    };
    const u0 = u(ref);
    const H = sites.slice(1).map((s) => {
      const ui = u(s);
      return [ui[0] - u0[0], ui[1] - u0[1]];
    });
    // Normal equations HᵀWH δ = −HᵀW r.
    const N = [[0, 0], [0, 0]];
    const g = [0, 0];
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        for (let a = 0; a < 2; a++) {
          g[a] -= H[i][a] * W[i][j] * r[j];
          for (let b = 0; b < 2; b++) N[a][b] += H[i][a] * W[i][j] * H[j][b];
        }
      }
    }
    const delta = solveLinear(N, g);
    cov = invert(N);
    if (!delta || !cov) return undefined;
    p = { xKm: p.xKm + delta[0], yKm: p.yKm + delta[1] };
    if (Math.hypot(delta[0], delta[1]) < 1e-7) break;
  }
  if (!cov) return undefined;
  // Covariance in x east, y north; the ellipse helper's angle then runs from east toward north.
  const ellipse = ellipseFromCovariance(cov[0][0], cov[0][1], cov[1][1]);
  return { xKm: p.xKm, yKm: p.yKm, cepKm: cepFromSigmas(ellipse.aKm, ellipse.bKm), ellipse };
}
