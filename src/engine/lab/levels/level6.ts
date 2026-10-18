// Level 6: Finding the transmitter (docs/design-level-6.md). Units A to E: why locate, hearing first, one bearing, two
// bearings, three or more. Positions in km, x east and y north; the enemy transmitter is north of the friendly line
// (y = 0) and DF sites go on the friendly side. Every number in the texts is checked in level6.test.ts.
import { createRng } from '../../rng';
import {
  type BearingLine, type Fix, type Pt, C_KM_PER_US, bearingDeg, bearingSigmaDeg, crossCorrelation, crossingAngleDeg, distanceKm,
  expectedBearingFix, fixFromBearings, hyperbolaPoints, measuredBearing, tdoaFix,
} from '../geoloc';
import { mSequence } from '../pn';
import { cepFromSigmas, gaussian } from '../../detect';
import { type Scene, type Station, chipSnrAtDb } from '../scene';
import { type DfMethod, type LevelDef, type Truth, EXAMPLE, PRACTICE, shortCodeTruth } from './types';

// The DF picture: 20 × 20 km, the friendly side south of y = 0.
export const DF_AREA = { xMin: -10, xMax: 10, yMin: -4, yMax: 16 };
export const DF_ZONE_Y_MAX = 0; // sites must stand at or south of this line
export const SITE_HEIGHT_M = 3;
export const SNR_AT_10KM_DB = 20; // the enemy transmitter's chip SNR at a DF site 10 km away

// C3's listening post, D3's two sites 10 km apart on the friendly line, and D4's site at the west end of it.
export const LISTEN_POST: Pt = { xKm: -8, yKm: -3 };
export const WEST_SITE: Pt = { xKm: -10, yKm: 0 };
// G2's and G4's two receivers.
export const TDOA_T1: Pt = { xKm: -6, yKm: 0 };
export const TDOA_T2: Pt = { xKm: 6, yKm: 0 };
export const ENEMY_S1: Pt = { xKm: -5, yKm: 0 };
export const ENEMY_S2: Pt = { xKm: 5, yKm: 0 };

const round1 = (v: number) => Math.round(v * 10) / 10;

export function level6Truth(seed: number): Truth {
  const rng = createRng(seed ^ 0x6d2b79f5);
  return { ...shortCodeTruth(seed), txKm: { xKm: round1(-4 + 8 * rng()), yKm: round1(8 + 3 * rng()) } };
}

const siteStation = (p: Pt, heightM = SITE_HEIGHT_M): Station => ({ xKm: p.xKm, yKm: p.yKm, heightM, powerW: 0, gainDbi: 0 });
export const txOf = (t: Truth): Pt => t.txKm ?? { xKm: 0, yKm: 10 };

// The level's scene: a 50 MHz link near the ground (two-ray), the enemy transmitter at the truth's position, its power
// set so a DF site 10 km away hears it at SNR_AT_10KM_DB.
export function level6Scene(t: Truth, tx: Pt = txOf(t)): Scene {
  const base: Scene = {
    freqMHz: 50,
    tx: { xKm: tx.xKm, yKm: tx.yKm, heightM: 10, powerW: 1, gainDbi: 0 },
    rx: { xKm: tx.xKm + 10, yKm: tx.yKm + 5, heightM: 2, powerW: 0, gainDbi: 0 },
    jammer: { xKm: 0, yKm: -30, heightM: 10, powerW: 0, gainDbi: 0 },
    intercept: { xKm: 0, yKm: -20, heightM: SITE_HEIGHT_M, powerW: 0, gainDbi: 0 },
    interceptPaths: { fromTx: { model: 'two-ray' }, fromJammer: { model: 'two-ray' } },
    rxAntenna: 'omni',
    txPath: { model: 'two-ray' },
    jamPath: { model: 'two-ray' },
    noiseFigureDb: 6,
    noiseEnv: 'rural',
    chipRateMcps: t.chipRateMcps,
    dataRateKbps: t.bitRateKbps,
  };
  const at10 = siteStation({ xKm: tx.xKm, yKm: tx.yKm - 10 });
  const one = chipSnrAtDb(base, at10, base.interceptPaths.fromTx);
  return { ...base, tx: { ...base.tx, powerW: 10 ** ((SNR_AT_10KM_DB - one) / 10) } };
}

// The enemy transmitter's chip SNR at a DF site (dB), and that site's bearing error (degrees, 1σ). A UAV passes its
// height.
export const siteSnrDb = (scene: Scene, p: Pt, heightM = SITE_HEIGHT_M): number =>
  chipSnrAtDb(scene, siteStation(p, heightM), scene.interceptPaths.fromTx);
export const siteSigmaDeg = (scene: Scene, p: Pt, heightM = SITE_HEIGHT_M): number => bearingSigmaDeg(siteSnrDb(scene, p, heightM));

export const inZone = (p: Pt): boolean =>
  p.yKm <= DF_ZONE_Y_MAX + 1e-9 && p.yKm >= DF_AREA.yMin && p.xKm >= DF_AREA.xMin && p.xKm <= DF_AREA.xMax;

export interface LocateTry {
  bearings: BearingLine[];
  fix?: Fix; // the fix of this try's noisy bearings
  cepKm?: number; // the layout's expected CEP at the transmitter: what the goal scores
  ellipse?: Fix['ellipse']; // the layout's expected 1σ ellipse, drawn at the fix
  crossingDeg?: number; // the widest crossing between two of this try's bearings: what the goal scores
  hyperbolas?: Pt[][]; // TDOA: each site's curve against the first site, from this try's time differences
}

// One try: every site takes a bearing (seeded per try), the bearings are fixed, and the geometry is measured.
export function locateTry(scene: Scene, sites: Pt[], target: Pt, seed: number, tryNo: number, heightM = SITE_HEIGHT_M): LocateTry {
  const rng = tryRng(seed, tryNo);
  const bearings = sites.map((s) => ({ xKm: s.xKm, yKm: s.yKm, ...measuredBearing(rng, s, target, siteSnrDb(scene, s, heightM)) }));
  if (sites.length < 2) return { bearings };
  const fix = fixFromBearings(bearings);
  const expected = expectedBearingFix(sites.map((s) => ({ ...s, sigmaDeg: siteSigmaDeg(scene, s, heightM) })), target);
  let crossingDeg = 0;
  for (let i = 0; i < bearings.length; i++) {
    for (let j = i + 1; j < bearings.length; j++) {
      crossingDeg = Math.max(crossingDeg, crossingAngleDeg(bearings[i].bearingDeg, bearings[j].bearingDeg));
    }
  }
  return { bearings, fix, cepKm: expected?.cepKm, ellipse: expected?.ellipse, crossingDeg };
}

const tryRng = (seed: number, tryNo: number) => createRng((Math.imul(seed, 0x9e3779b1) ^ Math.imul(tryNo + 1, 0x85ebca77)) >>> 0);

// --- A moving sensor: one UAV taking bearings along a leg -----------------------------------------------------------

export const UAV_HEIGHT_M = 300;
export const LEG_MAX_KM = 6; // how far the UAV flies while the transmitter is on the air
export const LEG_STEP_KM = 0.5; // a bearing every half kilometre

// The leg's end, no further than LEG_MAX_KM from its start.
export function legEnd(a: Pt, b: Pt, maxKm = LEG_MAX_KM): Pt {
  const d = distanceKm(a, b);
  if (d <= maxKm) return b;
  return { xKm: round1(a.xKm + ((b.xKm - a.xKm) * maxKm) / d), yKm: round1(a.yKm + ((b.yKm - a.yKm) * maxKm) / d) };
}

// Where the UAV takes its bearings: every LEG_STEP_KM from a toward b, both ends included.
export function legPoints(a: Pt, b: Pt, maxKm = LEG_MAX_KM, stepKm = LEG_STEP_KM): Pt[] {
  const e = legEnd(a, b, maxKm);
  const d = distanceKm(a, e);
  const n = Math.max(1, Math.round(d / stepKm));
  return Array.from({ length: n + 1 }, (_, i) => ({ xKm: a.xKm + ((e.xKm - a.xKm) * i) / n, yKm: a.yKm + ((e.yKm - a.yKm) * i) / n }));
}

// --- Time difference of arrival -------------------------------------------------------------------------------------

export const TDOA_CHIPS = 1000; // chips each site captures and cross-correlates
export const CLOCK_SIGMA_US = 0.3; // each site's clock error against the others (1σ): 90 m of range

// A site's arrival-time error (µs, 1σ): the correlation peak's (a chip wide, sharpened by SNR and the chips
// integrated) and its clock's.
export function siteTimingSigmaUs(scene: Scene, p: Pt, chipRateMcps: number): number {
  const snr = 10 ** (siteSnrDb(scene, p) / 10);
  const peak = 1 / chipRateMcps / Math.sqrt(2 * TDOA_CHIPS * snr);
  return Math.hypot(peak, CLOCK_SIGMA_US);
}

// The curve of a measured time difference t_i − t_0 (µs): |P − s_i| − |P − s_0| = c · Δt.
export const tdoaHyperbola = (si: Pt, s0: Pt, dtUs: number): Pt[] => hyperbolaPoints(si, s0, C_KM_PER_US * dtUs, 30);

// One TDOA try: each site's arrival time with its own error, the fix of the time differences against the first site,
// and the layout's expected error (the fix of the exact differences, whose covariance is taken at the transmitter).
export function tdoaTry(scene: Scene, sites: Pt[], target: Pt, seed: number, tryNo: number, chipRateMcps: number): LocateTry {
  const rng = tryRng(seed, tryNo);
  const sig = sites.map((s) => siteTimingSigmaUs(scene, s, chipRateMcps));
  const arrive = sites.map((s, i) => distanceKm(s, target) / C_KM_PER_US + sig[i] * gaussian(rng));
  const dt = arrive.slice(1).map((a) => a - arrive[0]);
  const hyperbolas = sites.slice(1).map((s, i) => tdoaHyperbola(s, sites[0], dt[i]));
  if (sites.length < 3) return { bearings: [], hyperbolas };
  // The transmitter is on the enemy side: that settles the mirror image a straight line of sites leaves.
  const fix = tdoaFix(sites, dt, sig, 30, (p) => p.yKm > DF_ZONE_Y_MAX);
  const exact = sites.slice(1).map((s) => (distanceKm(s, target) - distanceKm(sites[0], target)) / C_KM_PER_US);
  const expected = tdoaFix(sites, exact, sig, 30, (p) => p.yKm > DF_ZONE_Y_MAX);
  return { bearings: [], fix, cepKm: expected?.cepKm, ellipse: expected?.ellipse, hyperbolas };
}

// A step's try on the enemy: seeded from the level seed and the step, so a page reload draws the same lines. A leg's
// sites are its two ends.
const stepSalt = (stepId: string) => [...stepId].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193), 0x811c9dc5);
export function dfStepTry(t: Truth, stepId: string, sites: Pt[], tryNo: number, method: DfMethod = 'bearings'): LocateTry {
  const seed = (t.seed ^ stepSalt(stepId)) >>> 0;
  const scene = level6Scene(t);
  if (method === 'leg') return sites.length < 2 ? { bearings: [] } : locateTry(scene, legPoints(sites[0], sites[1]), txOf(t), seed, tryNo, UAV_HEIGHT_M);
  if (method === 'tdoa') return tdoaTry(scene, sites, txOf(t), seed, tryNo, t.chipRateMcps);
  return locateTry(scene, sites, txOf(t), seed, tryNo);
}

// The fewest sites (or leg ends) a try needs.
export const minSites = (method: DfMethod = 'bearings'): number => (method === 'tdoa' ? 3 : 2);

// --- Cross-correlating two sites' captures -----------------------------------------------------------------------

export const XCORR_S = 4; // samples per chip
export interface Xcorr {
  points: { lagUs: number; mag: number }[];
  peakUs: number; // the lag of the highest point: how much later the signal reached the second site
  chipRateMcps: number;
}

// Two sites capture the same DSSS signal (the short code times random data bits), the second `delayUs` later, each
// with noise at its own chip SNR; their cross-correlation over ± maxLagUs.
export function tdoaXcorr(o: { seed: number; degree: number; chipRateMcps: number; delayUs: number; snr1Db: number; snr2Db: number; maxLagUs: number }): Xcorr {
  const rng = createRng(o.seed);
  const code = mSequence(o.degree);
  const n = code.length;
  const s = XCORR_S;
  const usPerSample = 1 / (o.chipRateMcps * s);
  const d = Math.round(o.delayUs / usPerSample);
  const maxLag = Math.ceil(o.maxLagUs / usPerSample);
  const len = TDOA_CHIPS * s;
  const total = len + Math.abs(d) + 2 * s;
  const bits = Array.from({ length: Math.ceil(total / (n * s)) + 1 }, () => (rng() < 0.5 ? -1 : 1));
  const w = (k: number) => code[Math.floor(k / s) % n] * bits[Math.floor(k / (n * s))];
  const off = Math.max(0, d);
  const capture = (shift: number, snrDb: number) => {
    const sd = Math.sqrt(1 / (2 * 10 ** (snrDb / 10)));
    const re = new Float64Array(len);
    const im = new Float64Array(len);
    for (let k = 0; k < len; k++) {
      re[k] = w(k + shift) + sd * gaussian(rng);
      im[k] = sd * gaussian(rng);
    }
    return { re, im };
  };
  // b[k] = a[k − d]: the second site hears each chip d samples later.
  const a = capture(off, o.snr1Db);
  const b = capture(off - d, o.snr2Db);
  const cc = crossCorrelation(a, b, -maxLag, maxLag);
  const points = cc.map((c) => ({ lagUs: c.lag * usPerSample, mag: c.mag }));
  const peak = points.reduce((p, q) => (q.mag > p.mag ? q : p));
  return { points, peakUs: peak.lagUs, chipRateMcps: o.chipRateMcps };
}

// The interior angles at two sites between their baseline and their bearings (degrees): the triangle the law of sines
// works in.
export function baselineAngles(s1: Pt, b1Deg: number, s2: Pt, b2Deg: number): { alphaDeg: number; betaDeg: number } {
  const ang = (from: Pt, to: Pt, b: number) => {
    const bx = to.xKm - from.xKm;
    const by = to.yKm - from.yKm;
    const r = (b * Math.PI) / 180;
    const c = (bx * Math.sin(r) + by * Math.cos(r)) / Math.hypot(bx, by);
    return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  };
  return { alphaDeg: ang(s1, s2, b1Deg), betaDeg: ang(s2, s1, b2Deg) };
}

// Range from site 1 by the law of sines, from the baseline and the two interior angles (degrees).
export function lawOfSinesRangeKm(baselineKm: number, alphaDeg: number, betaDeg: number): number {
  const r = Math.PI / 180;
  return (baselineKm * Math.sin(betaDeg * r)) / Math.sin((alphaDeg + betaDeg) * r);
}

// --- Worked examples: fixed pictures for the lessons (DfView draws them) --------------------------------------------

export interface DfExample {
  sites: (Pt & { sigmaDeg: number; label: string })[];
  target: Pt;
  noisy?: number; // seed for noisy bearings; true bearings when absent
  showFix?: boolean;
  leg?: boolean; // the two sites are the ends of a UAV leg, with bearings along it
  tdoa?: boolean; // hyperbolas of the true time differences against the first site, no bearings
}

const EX_TARGET: Pt = { xKm: 1.5, yKm: 9 };
const G_TARGET: Pt = { xKm: -2, yKm: 9.5 };
// E1's three sites, σ from their SNR in the level's scene with the transmitter at EX_TARGET.
const EX_THREE = [
  { xKm: -8, yKm: 0, sigmaDeg: 3.4, label: 'S1 15 dB' },
  { xKm: 0, yKm: -2, sigmaDeg: 2.5, label: 'S2 18 dB' },
  { xKm: 8, yKm: 0, sigmaDeg: 2.5, label: 'S3 18 dB' },
];

export const DF_EXAMPLES: Record<string, DfExample> = {
  A1: { sites: EX_THREE, target: EX_TARGET },
  B1: {
    sites: [{ xKm: -9, yKm: -4, sigmaDeg: 5.6, label: 'far 11 dB' }, { xKm: 4, yKm: 0, sigmaDeg: 2, label: 'near 21 dB' }],
    target: EX_TARGET,
  },
  C1: { sites: [{ xKm: 0, yKm: 0, sigmaDeg: 6.3, label: '10 dB' }], target: { xKm: 2, yKm: 10 } },
  D1: { sites: [{ ...ENEMY_S1, sigmaDeg: 2.5, label: 'S1' }, { ...ENEMY_S2, sigmaDeg: 2, label: 'S2' }], target: EX_TARGET },
  E1: { sites: EX_THREE, target: EX_TARGET, noisy: 6, showFix: true },
  F1: { sites: [{ xKm: -3, yKm: 0, sigmaDeg: 2, label: 'start' }, { xKm: 3, yKm: 0, sigmaDeg: 2, label: 'end' }], target: EX_TARGET, noisy: 3, showFix: true, leg: true },
  G1: {
    sites: [{ xKm: -7, yKm: 0, sigmaDeg: 0, label: 'A' }, { xKm: 7, yKm: 0, sigmaDeg: 0, label: 'B' }, { xKm: 0, yKm: -4, sigmaDeg: 0, label: 'C' }],
    target: G_TARGET,
    tdoa: true,
  },
  G2: { sites: [{ ...TDOA_T1, sigmaDeg: 0, label: 'A' }, { ...TDOA_T2, sigmaDeg: 0, label: 'B' }], target: G_TARGET, tdoa: true },
};

// The time differences of a TDOA example's sites against its first, from the true positions (µs).
export const exampleDtUs = (ex: DfExample): number[] =>
  ex.sites.slice(1).map((s) => (distanceKm(s, ex.target) - distanceKm(ex.sites[0], ex.target)) / C_KM_PER_US);
export const exampleHyperbolas = (ex: DfExample): Pt[][] =>
  ex.tdoa ? exampleDtUs(ex).map((dt, i) => tdoaHyperbola(ex.sites[i + 1], ex.sites[0], dt)) : [];

// The bearing lines of an example: true, or noisy from its seed.
export function exampleBearings(ex: DfExample): BearingLine[] {
  if (ex.tdoa) return [];
  const rng = createRng(ex.noisy ?? 1);
  const at = ex.leg ? legPoints(ex.sites[0], ex.sites[1]).map((p) => ({ ...p, sigmaDeg: ex.sites[0].sigmaDeg })) : ex.sites;
  return at.map((s) => {
    const b = bearingDeg(s, ex.target);
    const err = ex.noisy === undefined ? 0 : s.sigmaDeg * gaussian(rng);
    return { xKm: s.xKm, yKm: s.yKm, bearingDeg: (b + err + 360) % 360, sigmaDeg: s.sigmaDeg };
  });
}

// --- Cross-correlations: G2's example, G3's practice and G4's enemy --------------------------------------------------

const XCORR_MAX_LAG_US = 45; // more than the 12 km between the two receivers (40 µs)
const xcache = new Map<string, Xcorr>();
const cachedXcorr = (key: string, make: () => Xcorr): Xcorr => {
  const hit = xcache.get(key);
  if (hit) return hit;
  const x = make();
  xcache.set(key, x);
  return x;
};

// G2: the example link (1 Mcps) at A and B, from G_TARGET.
export const xcorrExample = (): Xcorr =>
  cachedXcorr('example', () =>
    tdoaXcorr({ seed: 21, degree: EXAMPLE.degree, chipRateMcps: EXAMPLE.chipRateMcps, delayUs: exampleDtUs(DF_EXAMPLES.G2)[0], snr1Db: 15, snr2Db: 13, maxLagUs: XCORR_MAX_LAG_US }));

// G3: the practice time differences (µs), on the example link and weaker than G2.
const PRACTICE_DT_US = [12.5, -8.25, 21.75, -3.5, 30.25, -17];
export const xcorrPractice = (n: number): Xcorr =>
  cachedXcorr(`practice${n % PRACTICE_DT_US.length}`, () =>
    tdoaXcorr({ seed: 40 + (n % PRACTICE_DT_US.length), degree: EXAMPLE.degree, chipRateMcps: EXAMPLE.chipRateMcps, delayUs: pick(PRACTICE_DT_US, n), snr1Db: 8, snr2Db: 6, maxLagUs: XCORR_MAX_LAG_US }));

// G4: the enemy signal at T1 and T2, each at its own SNR.
export function xcorrEnemy(t: Truth): Xcorr {
  return cachedXcorr(`enemy${t.seed}`, () => {
    const scene = level6Scene(t);
    const tx = txOf(t);
    return tdoaXcorr({
      seed: (t.seed ^ 0x2f6b) >>> 0,
      degree: t.degree,
      chipRateMcps: t.chipRateMcps,
      delayUs: (distanceKm(TDOA_T2, tx) - distanceKm(TDOA_T1, tx)) / C_KM_PER_US,
      snr1Db: siteSnrDb(scene, TDOA_T1),
      snr2Db: siteSnrDb(scene, TDOA_T2),
      maxLagUs: XCORR_MAX_LAG_US,
    });
  });
}

// --- Practice numbers, one set per "Try another" ---------------------------------------------------------------

const PRACTICE_SNR_DB = [10, 6, 13, 8, 16, 4];
const PRACTICE_TRIANGLES = [
  { d: 10, alpha: 60, beta: 70 }, { d: 8, alpha: 45, beta: 80 }, { d: 12, alpha: 70, beta: 50 }, { d: 6, alpha: 50, beta: 75 },
];
const PRACTICE_SIGMAS = [{ a: 0.8, b: 0.6 }, { a: 1.2, b: 0.5 }, { a: 0.5, b: 0.4 }, { a: 2.0, b: 0.9 }];
const pick = <T,>(list: T[], n: number): T => list[((n % list.length) + list.length) % list.length];

export const practiceSnrDb = (n: number): number => pick(PRACTICE_SNR_DB, n);
export const practiceTriangle = (n: number) => pick(PRACTICE_TRIANGLES, n);
export const practiceSigmas = (n: number) => pick(PRACTICE_SIGMAS, n);

// --- The enemy's numbers ----------------------------------------------------------------------------------------

const shown1 = (v: number) => Number(v.toFixed(1));

// C3: the SNR at the listening post as the text prints it (0.1 dB), and the σ that follows from it.
export const postSnrDb = (t: Truth): number => shown1(siteSnrDb(level6Scene(t), LISTEN_POST));
export const postSigmaDeg = (t: Truth): number => bearingSigmaDeg(postSnrDb(t));

// D3: the interior angles of S1's and S2's measured bearings, as printed (whole degrees), and the range they give.
export function d3Angles(t: Truth): { alphaDeg: number; betaDeg: number } {
  const [b1, b2] = dfStepTry(t, 'D3', [ENEMY_S1, ENEMY_S2], 0).bearings;
  const a = baselineAngles(ENEMY_S1, b1.bearingDeg, ENEMY_S2, b2.bearingDeg);
  return { alphaDeg: Math.round(a.alphaDeg), betaDeg: Math.round(a.betaDeg) };
}
export const d3RangeKm = (t: Truth): number => {
  const a = d3Angles(t);
  return lawOfSinesRangeKm(distanceKm(ENEMY_S1, ENEMY_S2), a.alphaDeg, a.betaDeg);
};

const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const trimDt = (v: number) => String(Number(v.toFixed(2)));
const sinD = (deg: number) => Math.sin((deg * Math.PI) / 180);
const ratio = (db: number) => 10 ** (db / 10);

// Placeholders for the texts.
export function level6Values(t: Truth, practiceN: number): Record<string, string> {
  const tx = txOf(t);
  const ps = practiceSnrDb(practiceN);
  const tri = practiceTriangle(practiceN);
  const pg = 180 - tri.alpha - tri.beta;
  const sg = practiceSigmas(practiceN);
  const post = postSnrDb(t);
  const postSigma = postSigmaDeg(t);
  const postRange = distanceKm(LISTEN_POST, tx);
  const ea = d3Angles(t);
  const gamma = 180 - ea.alphaDeg - ea.betaDeg;
  const pDt = xcorrPractice(practiceN).peakUs;
  const g4 = xcorrEnemy(t).peakUs;
  return {
    pN: String(practiceN),
    txX: f1(tx.xKm),
    txY: f1(tx.yKm),
    postSnr: f1(post),
    postRatio: f1(ratio(post)),
    postRoot: f2(Math.sqrt(ratio(post))),
    postSigma: f1(postSigma),
    post2Sigma: f1(2 * postSigma),
    postRange: f1(postRange),
    postSideKm: f1((postRange * postSigma * Math.PI) / 180),
    alpha: String(ea.alphaDeg),
    beta: String(ea.betaDeg),
    gamma: String(gamma),
    sinBeta: sinD(ea.betaDeg).toFixed(3),
    sinGamma: sinD(gamma).toFixed(3),
    range: f1(d3RangeKm(t)),
    trueRange: f1(distanceKm(ENEMY_S1, tx)),
    pSnr: String(ps),
    pRatio: f1(ratio(ps)),
    pRoot: f2(Math.sqrt(ratio(ps))),
    pSigma: f1(bearingSigmaDeg(ps)),
    pD: String(tri.d),
    pAlpha: String(tri.alpha),
    pBeta: String(tri.beta),
    pGamma: String(pg),
    pSinB: sinD(tri.beta).toFixed(3),
    pSinG: sinD(pg).toFixed(3),
    pRange: f1(lawOfSinesRangeKm(tri.d, tri.alpha, tri.beta)),
    pA: String(sg.a),
    pB: String(sg.b),
    pSumSq: f2(sg.a ** 2 + sg.b ** 2),
    pRootSq: f2(Math.hypot(sg.a, sg.b)),
    pCep: f2(0.75 * Math.hypot(sg.a, sg.b)),
    pCepExact: f2(cepFromSigmas(Math.max(sg.a, sg.b), Math.min(sg.a, sg.b))),
    pDt: trimDt(pDt),
    pDr: f2(0.3 * pDt),
    pDrAbs: f2(Math.abs(0.3 * pDt)),
    pNearer: pDt >= 0 ? 'A' : 'B',
    g4Dt: trimDt(g4),
    g4DtAbs: trimDt(Math.abs(g4)),
    g4Order: g4 >= 0 ? 'after' : 'before',
    g4Dr: f2(0.3 * g4),
    chipUs: trimDt(1 / t.chipRateMcps),
    peakWidthUs: trimDt(2 / t.chipRateMcps),
  };
}

export const LEVEL_6: LevelDef = {
  id: 6,
  title: 'Finding the transmitter',
  intro:
    'Levels 1 to 5 heard the enemy link and jammed it. This level finds where its transmitter is. Each of your [[direction-finding|df]] (DF) sites measures the direction the signal comes from, a [[bearing|bearing]]. Two bearings cross at the transmitter; three or more give a [[fix|fix]], with an error you can put a number on. You need only level 1 for this one.',
  passMark: 60,
  links: { example: EXAMPLE, practice: PRACTICE },
  units: [
    {
      id: 'A',
      title: 'Why find it',
      steps: [
        {
          kind: 'lesson',
          id: 'A1',
          title: 'Where is the transmitter?',
          visual: { kind: 'df', example: 'A1' },
          paragraphs: [
            "Where an enemy [[transmitter|transmitter]] stands tells you a lot: where its unit is, which radio is the headquarters (the one that talks to everyone), and where to aim.",
            "It matters to a [[jammer|jammer]] too. [[J/S|js]] is set at the enemy [[receiver|receiver]] and depends on distances: the jammer's to the receiver against the transmitter's. Knowing where the transmitter is tells you how strong its signal is where you want to jam.",
            'The plot is a map in km: x east, y north. Your DF sites (amber) stand at or south of the front line, y = 0. Each measures a [[bearing|bearing]]: the direction the signal comes from, in degrees clockwise from north. The three lines meet at the transmitter (the red ring).',
            'The units build it up: hear the signal, take one bearing, cross two, then fix with three.',
          ],
          check: {
            question: 'Bearings run clockwise from north: north is 0°, east is 90°. What is the bearing of due south?',
            unit: '°',
            answer: 180,
            tol: { abs: 0.5 },
            wrong: 'A quarter turn is 90°. South is two quarter turns from north.',
          },
        },
      ],
    },
    {
      id: 'B',
      title: 'Hear it first',
      steps: [
        {
          kind: 'lesson',
          id: 'B1',
          title: 'No signal, no bearing',
          visual: { kind: 'df', example: 'B1' },
          paragraphs: [
            'A DF site can only measure the direction of a signal it hears. A [[spread spectrum|spread-spectrum]] signal sits low, near or under the noise, so a site far away may hear nothing at all (level 1, B1).',
            "Even once heard, how sharp the bearing is depends on the [[SNR|snr]] at the site. The shaded wedges show where each site's true bearing lies, 95 times in 100.",
            'The far site (west) hears the transmitter at 11 dB and its wedge is ± 11°. The near site hears 21 dB and its wedge is ± 4°. Same transmitter, same equipment: only the distance differs.',
            'Getting closer is the cheap way to a sharper bearing. Near the ground, halving the distance gains about 12 dB.',
          ],
          check: {
            question: 'A site hears the transmitter at 10 dB from 10 km. It moves to 5 km. About what SNR does it hear now, in dB?',
            unit: 'dB',
            answer: 22,
            tol: { abs: 0.5 },
            wrong: 'Halving the distance gains about 12 dB near the ground: 10 + 12.',
          },
        },
      ],
    },
    {
      id: 'C',
      title: 'One bearing',
      steps: [
        {
          kind: 'lesson',
          id: 'C1',
          title: 'Example: how sharp is a bearing?',
          visual: { kind: 'df', example: 'C1' },
          video: 'level6-C1',
          paragraphs: [
            'A site finds a direction in one of two ways. A [[directional antenna|directional]] turned until the signal peaks points at the transmitter. An [[interferometer|interferometer]] uses two antennas a short way apart: the wave reaches the nearer one first, and the phase difference between them gives the angle, Δφ = 2π × d × sin θ ÷ λ, with d the spacing and λ the [[wavelength|wavelength]]. A spacing of λ/2 or less keeps the answer unique.',
            'Either way the bearing has an error, and it grows as the signal gets weaker. The lab uses the same rule as the map game. σ is the error\'s standard deviation: about two bearings in three fall within ± σ of the true direction.',
          ],
          steps: [
            'This site hears the transmitter at SNR 10 dB. As a ratio: 10^(10 ÷ 10) = 10.',
            '√10 = 3.16.',
            'σ = 20° ÷ 3.16 = 6.3°.',
            'The wedge on the plot is ± 2σ = ± 12.6°.',
            'At 10 km, 6.3° is 10 × 6.3 ÷ 57.3 = 1.1 km sideways (one radian is 57.3°).',
          ],
          rule: 'σ = 20° ÷ √SNR, with SNR as a ratio, and never below 2° (reached at 20 dB). One bearing gives a direction, not a distance: the transmitter could be anywhere along the line.',
          check: {
            question: 'A site hears 20 dB. What is its σ, in degrees?',
            unit: '°',
            answer: 2,
            tol: { abs: 0.05 },
            wrong: '20 dB is a ratio of 100, and √100 = 10.',
          },
        },
        {
          kind: 'practice',
          id: 'C2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'df', example: 'C1' },
          task: 'A DF site hears the transmitter at {pSnr} dB. What is its bearing σ?',
          hint: 'Turn the dB into a ratio, 10^({pSnr} ÷ 10). Then σ = 20° ÷ √ratio, not below 2°.',
          fields: [
            { id: 'sigma', label: 'Bearing σ', unit: '°', truth: (_t, ctx) => bearingSigmaDeg(practiceSnrDb(ctx.practiceN ?? 0)), check: { rel: 0.05 }, points: 0 },
          ],
          worked: ['{pSnr} dB as a ratio: 10^({pSnr} ÷ 10) = {pRatio}.', '√{pRatio} = {pRoot}.', 'σ = 20 ÷ {pRoot} = {pSigma}°.'],
        },
        {
          kind: 'apply',
          id: 'C3',
          title: 'The enemy: one bearing',
          instruments: ['df'],
          dfSites: [{ ...LISTEN_POST, label: 'P' }],
          task: 'Your listening post P, at x −8, y −3 km, has a bearing on the enemy transmitter (the line on the plot). It hears it at {postSnr} dB. What is the bearing\'s σ?',
          hint: '10^({postSnr} ÷ 10), its square root, then 20° ÷ that.',
          fields: [{ id: 'sigma', label: 'Bearing σ', unit: '°', truth: (t) => postSigmaDeg(t), check: { rel: 0.05 }, points: 10 }],
          reveal: [
            '{postSnr} dB as a ratio is {postRatio}; √{postRatio} = {postRoot}.',
            'σ = 20 ÷ {postRoot} = {postSigma}°. The wedge, now drawn, is ± 2σ = ± {post2Sigma}°.',
            'The transmitter, now shown, is {postRange} km from P, so 1σ there is about {postSideKm} km sideways.',
          ],
        },
      ],
    },
    {
      id: 'D',
      title: 'Two bearings',
      steps: [
        {
          kind: 'lesson',
          id: 'D1',
          title: 'Example: two bearings cross',
          visual: { kind: 'df', example: 'D1' },
          video: 'level6-D1',
          paragraphs: [
            'One bearing is a line. A second site some way along gives a second line, and the two cross at the transmitter. This is [[triangulation|triangulation]].',
            "The two sites and the transmitter make a triangle. The side between the sites is the baseline, d. α is the angle at S1 between the baseline and S1's bearing; β is the same at S2. The third angle, at the transmitter, is γ = 180° − α − β: the angle the two bearings cross at.",
          ],
          steps: [
            "S1 and S2 are 10 km apart. S1's bearing makes α = 54° with the baseline, S2's makes β = 69°.",
            'γ = 180 − 54 − 69 = 57°.',
            'Law of sines: range from S1 = d × sin β ÷ sin γ = 10 × sin 69° ÷ sin 57° = 10 × 0.934 ÷ 0.839 = 11.1 km.',
            'Range from S2 = d × sin α ÷ sin γ = 10 × 0.809 ÷ 0.839 = 9.6 km.',
          ],
          rule: 'The crossing angle sets how good the answer is. Near 90°, a bearing error moves the crossing least. Below about 30° the lines run nearly together, and a small error slides the crossing a long way along them. This is [[geometric dilution of precision|gdop]] (GDOP).',
          check: {
            question: 'd = 10 km, α = 90°, β = 45°. What is the range from S1, in km?',
            unit: 'km',
            answer: 10,
            tol: { abs: 0.1 },
            wrong: 'γ = 180 − 90 − 45 = 45°. Range = 10 × sin 45° ÷ sin 45°.',
          },
        },
        {
          kind: 'practice',
          id: 'D2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'df', example: 'D1' },
          task: 'Two sites are {pD} km apart. α = {pAlpha}° and β = {pBeta}°. How far is the transmitter from S1?',
          hint: 'γ = 180 − α − β. Range from S1 = d × sin β ÷ sin γ.',
          fields: [
            {
              id: 'range',
              label: 'Range from S1',
              unit: 'km',
              truth: (_t, ctx) => {
                const p = practiceTriangle(ctx.practiceN ?? 0);
                return lawOfSinesRangeKm(p.d, p.alpha, p.beta);
              },
              check: { rel: 0.03 },
              points: 0,
            },
          ],
          worked: ['γ = 180 − {pAlpha} − {pBeta} = {pGamma}°.', 'Range from S1 = {pD} × sin {pBeta}° ÷ sin {pGamma}° = {pD} × {pSinB} ÷ {pSinG} = {pRange} km.'],
        },
        {
          kind: 'apply',
          id: 'D3',
          title: 'The enemy: range from two bearings',
          instruments: ['df'],
          dfSites: [{ ...ENEMY_S1, label: 'S1' }, { ...ENEMY_S2, label: 'S2' }],
          task: "Your sites S1 (x −5) and S2 (x +5) stand 10 km apart on y = 0 and have bearings on the enemy transmitter. S1's bearing makes α = {alpha}° with the baseline, S2's β = {beta}°. How far is the transmitter from S1?",
          hint: 'γ = 180 − α − β, then d × sin β ÷ sin γ.',
          fields: [{ id: 'range', label: 'Range from S1', unit: 'km', truth: (t) => d3RangeKm(t), check: { rel: 0.03 }, points: 10 }],
          reveal: [
            'γ = 180 − {alpha} − {beta} = {gamma}°.',
            'Range from S1 = 10 × sin {beta}° ÷ sin {gamma}° = 10 × {sinBeta} ÷ {sinGamma} = {range} km.',
            'The transmitter, now shown, is {trueRange} km from S1. The difference is the bearings\' error.',
          ],
        },
        {
          kind: 'apply',
          id: 'D4',
          title: 'The enemy: a better crossing',
          instruments: ['df'],
          dfSites: [{ ...WEST_SITE, label: 'W' }],
          task: "S1 and S2 crossed at {gamma}°. A crossing near 90° does better. Your site W, at the west end of the line (x −10, y 0), has a bearing on the enemy transmitter. Put one more site where its bearing will cross W's at 75° or more.",
          hint: "The transmitter is somewhere along W's line. A site whose line to it runs at right angles to W's gives a 90° crossing.",
          fields: [],
          locate: {
            maxSites: 1,
            crossingDegAtLeast: 75,
            points: 10,
            task: 'Click the plot at or south of y = 0 to place the site (click it again to remove it), then take bearings.',
          },
          reveal: ['The transmitter is now shown. The steeper the crossing, the shorter the error area along the lines.'],
        },
      ],
    },
    {
      id: 'E',
      title: 'Three or more',
      steps: [
        {
          kind: 'lesson',
          id: 'E1',
          title: 'Example: the fix and its error',
          visual: { kind: 'df', example: 'E1' },
          video: 'level6-E1',
          paragraphs: [
            'Three bearings almost never meet at one point. Each has its own error, so together they make a small triangle.',
            'The [[fix|fix]] is the point that fits all the lines best: the least-squares fix. Each line counts by how sharp it is where it passes the fix, its σ times its range. A sharp, near line pulls hard; a wide, far one pulls little.',
            'Around the fix the likely positions form an [[ellipse|error-ellipse]], long where the lines run nearly together and short where they cross. The plot shows it at 1σ. [[CEP|cep]], circular error probable, sums it up in one number: the radius of the circle that holds the transmitter half the time.',
          ],
          steps: [
            'S1 hears 15 dB, σ 3.4°. S2 and S3 hear 18 dB, σ 2.5°.',
            'Their bearings miss the true direction by 3.9°, 0.7° and 2.5°, so the lines make a triangle.',
            'The least-squares fix is at x 1.9, y 8.9 km. Its 1σ ellipse has half-axes a = 0.64 km and b = 0.34 km.',
            'CEP ≈ 0.75 × √(a² + b²) = 0.75 × √(0.64² + 0.34²) = 0.75 × 0.72 = 0.54 km. The exact value is 0.57 km.',
            'The transmitter (the ring) is 0.43 km from the fix: inside the CEP circle, as it is about half the time.',
          ],
          rule: 'CEP ≈ 0.75 × √(a² + b²), with a and b the ellipse\'s 1σ half-axes; it is within about 10% of the exact value. More sites, sharper bearings and crossings near 90° all shrink it.',
          check: {
            question: 'A fix\'s ellipse has a = 0.4 km and b = 0.3 km. What is its CEP by the rule, in km?',
            unit: 'km',
            answer: 0.375,
            tol: { abs: 0.01 },
            wrong: '√(0.4² + 0.3²) = √0.25 = 0.5. Then × 0.75.',
          },
        },
        {
          kind: 'practice',
          id: 'E2',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'df', example: 'E1' },
          task: 'A fix\'s 1σ ellipse has half-axes a = {pA} km and b = {pB} km. About what is its CEP?',
          hint: 'CEP ≈ 0.75 × √(a² + b²).',
          fields: [
            {
              id: 'cep',
              label: 'CEP',
              unit: 'km',
              truth: (_t, ctx) => {
                const s = practiceSigmas(ctx.practiceN ?? 0);
                return cepFromSigmas(Math.max(s.a, s.b), Math.min(s.a, s.b));
              },
              check: { rel: 0.15 },
              points: 0,
            },
          ],
          worked: ['a² + b² = {pA}² + {pB}² = {pSumSq}.', '√{pSumSq} = {pRootSq}, × 0.75 = {pCep} km.', 'The exact CEP is {pCepExact} km: the rule is close enough to plan with.'],
        },
        {
          kind: 'apply',
          id: 'E3',
          title: 'The enemy: fix it',
          instruments: ['df'],
          task: 'Fix the enemy transmitter with three sites of your own. Each site\'s σ comes from what it hears, so where you put them matters.',
          hint: 'Spread the sites so their bearings cross steeply, and keep them as close to the transmitter as the front line allows.',
          fields: [],
          locate: {
            maxSites: 3,
            cepKmAtMost: 1,
            points: 20,
            task: 'Click the plot at or south of y = 0 to place up to three sites (click one again to remove it), then take bearings. The goal: a CEP of 1 km or less.',
          },
          reveal: [
            'The transmitter, now shown, was at x {txX}, y {txY} km.',
            'Wide spacing gives steep crossings; sites near the line hear more and take sharper bearings. Both shrink the CEP.',
          ],
        },
      ],
    },
    {
      id: 'F',
      title: 'A moving sensor',
      steps: [
        {
          kind: 'lesson',
          id: 'F1',
          title: 'Example: one UAV, many bearings',
          visual: { kind: 'df', example: 'F1' },
          video: 'level6-F1',
          paragraphs: [
            'Ground sites take time to set up and must stay put. One sensor that moves can do the work of many: a UAV flies a straight leg and takes a bearing every half kilometre. Each bearing comes from a new place, so together they cross like bearings from many sites.',
            'Height helps. 300 m up, the UAV sees over the ground that weakens a signal near it: it hears the transmitter about 40 dB stronger than a ground site at the same spot, so every bearing is as sharp as the rule allows, 2°.',
            'What matters is the direction of the leg. Flown across the line of sight, the bearings swing round and cross steeply: the leg is a baseline. Flown straight toward the transmitter, they all point the same way and never cross well.',
            'The transmitter must keep sending while the UAV flies, so its time on the air limits the leg.',
          ],
          steps: [
            'The UAV flies 6 km east along the front line, from x −3 to x +3, and takes 13 bearings, σ 2°.',
            'The bearings swing from 28° to 350°: the leg sees the transmitter from directions 38° apart.',
            'The least-squares fix of all 13 is 0.35 km from the transmitter, with a CEP of 0.31 km.',
          ],
          rule: 'Fly across the line of sight, as long a leg as the transmitter allows. The longer the leg, the steeper the crossings and the smaller the CEP.',
          check: {
            question: 'The enemy transmits for 3 minutes at a time. A UAV flies at 100 km/h. How long a leg can it fly while the transmitter is on, in km?',
            unit: 'km',
            answer: 5,
            tol: { abs: 0.1 },
            wrong: '100 km/h is 100 km in 60 minutes. 3 minutes is a twentieth of that.',
          },
        },
        {
          kind: 'apply',
          id: 'F2',
          title: 'The enemy: fly a leg',
          instruments: ['df'],
          dfMethod: 'leg',
          task: 'The enemy transmitter stays on the air for as long as your UAV takes to fly 6 km. Plan the leg.',
          hint: 'Fly across the line of sight, the full 6 km, close to the front line.',
          fields: [],
          locate: {
            maxSites: 2,
            cepKmAtMost: 0.5,
            points: 10,
            task: "Click the plot at or south of y = 0 for the leg's start, then again for its end (a leg longer than 6 km is cut short; click an end again to remove it). Then take bearings. The goal: a CEP of 0.5 km or less.",
          },
          reveal: [
            'The transmitter, now shown, was at x {txX}, y {txY} km.',
            'A full-length leg across the line of sight sees the transmitter from directions far apart: one UAV did the work of many sites.',
          ],
        },
      ],
    },
    {
      id: 'G',
      title: 'Time difference',
      steps: [
        {
          kind: 'lesson',
          id: 'G1',
          title: 'Timing instead of direction',
          visual: { kind: 'df', example: 'G1' },
          video: 'level6-G1',
          paragraphs: [
            'A radio wave travels 300 m in a microsecond (µs). Two sites at different distances from the transmitter hear each chip at slightly different times. That time difference, Δt, is a range difference: c × Δt, with c = 0.3 km per µs.',
            'All the points with the same range difference to two sites lie on one curve, a [[hyperbola|hyperbola]], with the two sites as its foci. One time difference puts the transmitter somewhere on that curve, as one bearing puts it on a line.',
            'A third site gives a second time difference and a second hyperbola. The two cross at the transmitter. This is [[time difference of arrival|tdoa]], TDOA. Sites in a straight line give two mirror-image crossings, one each side of the line; you know the enemy is to the north.',
            'TDOA needs no directional antennas, only plain receivers with accurate clocks and a link to bring their captures together. The clocks are its weak point: 1 µs of clock error moves a hyperbola 300 m. A fast-moving sensor can also measure the Doppler difference ([[FDOA|fdoa]]), which the lab leaves out.',
          ],
          check: {
            question: "Two sites' clocks are 0.5 µs apart. How far does that move the hyperbola, in m?",
            unit: 'm',
            answer: 150,
            tol: { abs: 5 },
            wrong: 'Each µs is 300 m.',
          },
        },
        {
          kind: 'lesson',
          id: 'G2',
          title: 'Example: Δt from a cross-correlation',
          visual: { kind: 'xcorr', source: 'example' },
          video: 'level6-G2',
          paragraphs: [
            'Each site records the signal, and the two recordings are compared. [[Cross-correlation|cross-correlation]] slides one past the other and measures how alike they are at each delay, the lag. It is the [[autocorrelation|autocorrelation]] of level 1, D1, between two sites instead of one signal and itself.',
            'Where the lag matches the time difference the [[chips|chip]] line up and the plot peaks. The peak is two chips wide at its base; the more chips compared and the stronger the signal, the more precisely its top can be found.',
          ],
          steps: [
            'Sites A (x −6) and B (x +6) capture the example link, 1 Mcps. The peak is at +7.0 µs: B heard each chip 7.0 µs after A.',
            'Range difference = 0.3 × 7.0 = 2.1 km: the transmitter is 2.1 km farther from B than from A.',
            'The hyperbola on the map is every point 2.1 km farther from B than from A. The transmitter (the ring) is on it.',
          ],
          rule: 'Δt is the lag of the peak. Range difference = 0.3 km × Δt in µs. A positive lag means the second site heard the signal later, so it is farther away.',
          check: {
            question: 'The peak is at −4 µs. How much farther from the transmitter is A than B, in km?',
            unit: 'km',
            answer: 1.2,
            tol: { abs: 0.02 },
            wrong: 'A negative lag means the first site, A, heard it later: 0.3 × 4.',
          },
        },
        {
          kind: 'practice',
          id: 'G3',
          title: 'Try it',
          link: 'practice',
          visual: { kind: 'xcorr', source: 'practice' },
          task: "Sites A and B have captured a weaker signal. Read the peak's lag, then work out the range difference: B's distance minus A's.",
          hint: 'Hover over the peak to read its lag. Range difference = 0.3 × Δt.',
          fields: [
            { id: 'dt', label: 'Δt', unit: 'µs', truth: (_t, ctx) => xcorrPractice(ctx.practiceN ?? 0).peakUs, check: { abs: 0.5 }, points: 0 },
            { id: 'dr', label: 'Range difference', unit: 'km', truth: (_t, ctx) => C_KM_PER_US * xcorrPractice(ctx.practiceN ?? 0).peakUs, check: { abs: 0.2 }, points: 0 },
          ],
          worked: ['The peak is at {pDt} µs.', 'Range difference = 0.3 × {pDt} = {pDr} km: the transmitter is {pDrAbs} km nearer {pNearer}.'],
        },
        {
          kind: 'apply',
          id: 'G4',
          title: 'The enemy: one time difference',
          instruments: ['xcorr', 'df'],
          dfMethod: 'tdoa',
          dfSites: [{ ...TDOA_T1, label: 'T1' }, { ...TDOA_T2, label: 'T2' }],
          task: "Your receivers T1 (x −6) and T2 (x +6) on the front line have captured the enemy signal. The plot is their cross-correlation, T2 against T1. Read Δt, then the range difference: T2's distance minus T1's.",
          hint: 'Hover over the peak. A chip of the enemy link lasts {chipUs} µs, so the peak is {peakWidthUs} µs wide at its base.',
          fields: [
            {
              id: 'dt',
              label: 'Δt',
              unit: 'µs',
              truth: (t) => xcorrEnemy(t).peakUs,
              check: { abs: 0 },
              accept: (v, truth, t) => Math.abs(v - truth) <= 0.5 / t.chipRateMcps + 1e-9,
              points: 5,
            },
            {
              id: 'dr',
              label: 'Range difference',
              unit: 'km',
              truth: (t) => C_KM_PER_US * xcorrEnemy(t).peakUs,
              check: { abs: 0 },
              accept: (v, truth, t) => Math.abs(v - truth) <= (0.3 * 0.5) / t.chipRateMcps + 0.02,
              points: 5,
            },
          ],
          reveal: [
            'The peak is at {g4Dt} µs: T2 heard the signal {g4DtAbs} µs {g4Order} T1.',
            'Range difference = 0.3 × {g4Dt} = {g4Dr} km. The hyperbola, now drawn, holds every point with that difference, and the transmitter is on it.',
          ],
        },
        {
          kind: 'apply',
          id: 'G5',
          title: 'The enemy: a TDOA fix',
          instruments: ['df'],
          dfMethod: 'tdoa',
          task: 'Fix the enemy transmitter by timing alone, with three plain receivers. Each clock is off by about 0.3 µs, 90 m of range.',
          hint: 'Spread the receivers as wide as the line allows: the hyperbolas then cross steeply at the transmitter.',
          fields: [],
          locate: {
            maxSites: 3,
            cepKmAtMost: 0.5,
            points: 10,
            task: 'Click the plot at or south of y = 0 to place three receivers (click one again to remove it), then take timings. The goal: a CEP of 0.5 km or less.',
          },
          reveal: [
            'The transmitter, now shown, was at x {txX}, y {txY} km.',
            'Wide spacing makes the hyperbolas cross steeply. Receivers close together give curves that run almost together, as narrow crossings do for bearings.',
          ],
        },
      ],
    },
    {
      id: 'H',
      title: 'Check',
      steps: [
        {
          kind: 'questions',
          id: 'H1',
          title: 'Three questions',
          task: 'Three short questions. One attempt each.',
          questions: [
            {
              id: 'q1',
              text: "Two sites' bearings cross at 15°. What is wrong with the fix?",
              options: [
                'It is long and thin along the lines: a small bearing error moves it far',
                'Nothing: every crossing gives the same error',
                'It is too close to the sites',
              ],
              correct: 0,
              explain: 'Narrow crossings stretch the error along the lines. Crossings near 90° give the smallest error.',
              points: 7,
            },
            {
              id: 'q2',
              text: 'Which change shrinks the error of a TDOA fix the most?',
              options: ['Pointing the antennas at the transmitter', 'Moving the receivers closer together', 'Spreading the receivers wider'],
              correct: 2,
              explain: 'TDOA uses plain antennas. Spreading the receivers makes the hyperbolas cross more steeply, as wide sites do for bearings.',
              points: 7,
            },
            {
              id: 'q3',
              text: 'A UAV takes bearings along a leg. Which leg fixes the transmitter best?',
              options: ['A long leg straight toward the transmitter', 'A long leg across the line of sight', 'Circling over one spot'],
              correct: 1,
              explain: 'Across the line of sight, the bearings swing round and cross steeply. Toward the transmitter they all point the same way.',
              points: 6,
            },
          ],
        },
      ],
    },
  ],
  debrief:
    'You found the enemy transmitter three ways: bearings from fixed sites, bearings from one UAV on a leg, and time differences between plain receivers. The same rules held each time: a site must hear the signal, sharper measurements come from a stronger signal, and the error shrinks when the lines or curves cross steeply, which takes sites spread wide.',
};
