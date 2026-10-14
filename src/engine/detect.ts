// Electronic Support: detecting enemy emitters (notes section 2).
// Each sensor runs an energy (envelope) detector per 25 kHz channel. With noise only the envelope is Rayleigh;
// with a signal it is Ricean. The threshold is set Neyman-Pearson style from the false-alarm probability Pfa,
// and the detection probability is the Marcum Q function.

import { DEFAULTS, HOP_BAND, bandOverlapDb, dwellUs, hopChannels, jammerBand, jammerOnTime, signalBandwidthKHz } from './ew';
import type { Hex } from './hex';
import { createRng } from './rng';
import type { HexMap } from './map';
import { type NoiseEnv, analyzePath, hexDistanceKm, manMadeNoiseFigureDb, noiseFloorDbm, patternGainDbi, wattsToDbm } from './rf';
import type { Net, Side, Unit } from './units';

// Search receiver: scans the VHF band in 25 kHz channels.
export const ES_CHANNEL_KHZ = 25;
export const ES_CHANNELS = Math.round((HOP_BAND.highMHz - HOP_BAND.lowMHz) / (ES_CHANNEL_KHZ / 1000)); // 2320

// Exponentially scaled modified Bessel function I0(x)·e^-x (Abramowitz & Stegun 9.8.1, 9.8.2).
function besselI0e(x: number): number {
  const ax = Math.abs(x);
  if (ax < 3.75) {
    const t = (x / 3.75) ** 2;
    const i0 = 1 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813)))));
    return i0 * Math.exp(-ax);
  }
  const t = 3.75 / ax;
  const poly =
    0.39894228 +
    t * (0.01328592 + t * (0.00225319 + t * (-0.00157565 + t * (0.00916281 + t * (-0.02057706 + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377)))))));
  return poly / Math.sqrt(ax);
}

// Marcum Q1(a, b) = integral from b to infinity of x·exp(-(x² + a²)/2)·I0(a·x) dx:
// the chance a Ricean envelope with signal amplitude a exceeds threshold b (unit noise power per component).
export function marcumQ1(a: number, b: number): number {
  if (b <= 0) return 1;
  if (a === 0) return Math.exp(-(b * b) / 2);
  // Integrand rewritten as x·exp(-(x - a)²/2)·I0e(a·x) to avoid overflow; it is negligible past a + 12.
  const upper = Math.max(b, a) + 12;
  if (b >= upper) return 0;
  const n = 800; // even, Simpson's rule
  const h = (upper - b) / n;
  const f = (x: number) => x * Math.exp(-((x - a) ** 2) / 2) * besselI0e(a * x);
  let sum = f(b) + f(upper);
  for (let i = 1; i < n; i++) sum += f(b + i * h) * (i % 2 === 0 ? 2 : 4);
  return Math.min(1, Math.max(0, (sum * h) / 3));
}

// Threshold (in noise standard deviations) that noise alone exceeds with probability pfa: Pfa = exp(-b²/2).
export const thresholdFromPfa = (pfa: number): number => Math.sqrt(-2 * Math.log(pfa));

// Probability of detecting a steady signal at this SNR (signal power / noise power in the channel).
export function detectionProbability(snrDb: number, pfa: number): number {
  const a = Math.sqrt(2 * 10 ** (snrDb / 10));
  return marcumQ1(a, thresholdFromPfa(pfa));
}

// Scanning receiver: dwell on each channel this long per look. A sweep of 2320 channels takes about 2.3 s.
export const ES_LOOK_US = 1000;

// Impulsive urban noise (notes section 2): heavy tails push far more noise spikes over a threshold set for
// Gaussian noise. A limiter (hole-puncher) clips the spikes and restores the Pfa, at a small SNR cost.
export const URBAN_FALSE_ALARM_FACTOR = 30;
export const LIMITER_LOSS_DB = 2;

// What an emitter radiates into one ES channel, and how often a scanning receiver catches it.
export interface Emission {
  freqMHz: number;
  powerDbm: number; // average power in one 25 kHz search channel while the receiver looks at it
  intercept: number; // chance per sweep that the emitter is on the channel being looked at, 0..1
  label: string;
}

export function emissions(u: Unit, nets: Net[]): Emission[] {
  if (u.jammer) {
    const band = jammerBand(u, nets);
    if (!band) return [];
    const centre = (band.lowMHz + band.highMHz) / 2;
    const channel = { lowMHz: centre - ES_CHANNEL_KHZ / 2000, highMHz: centre + ES_CHANNEL_KHZ / 2000 };
    const cfg = u.jammer;
    const { duty } = jammerOnTime(cfg);
    // Average power: pulse and sync jammers radiate only part of the time, which is what makes them hard to find.
    let shareDb = bandOverlapDb(band, channel);
    if (cfg.mode === 'multitone') shareDb = -10 * Math.log10(Math.max(1, cfg.tones ?? DEFAULTS.tones));
    if (cfg.mode === 'swept') shareDb = 0;
    return [{ freqMHz: centre, powerDbm: wattsToDbm(u.radio.powerW) + shareDb + 10 * Math.log10(duty), intercept: 1, label: `jammer, ${cfg.mode}` }];
  }
  // A radio on several nets (e.g. a relay) transmits on each; the strongest wins below.
  return nets
    .filter((n) => n.memberIds.includes(u.id) && u.radio.powerW > 0)
    .map((n) => {
      let powerDbm = wattsToDbm(u.radio.powerW);
      let intercept = 1;
      let label = n.name;
      if (n.waveform.kind === 'dsss') {
        // Low probability of detection: the power is spread so thin that one search channel holds a sliver of it.
        powerDbm += 10 * Math.log10(ES_CHANNEL_KHZ / signalBandwidthKHz(n));
        label += ' (DSSS)';
      } else if (n.waveform.kind === 'fh') {
        // Low probability of intercept: the receiver and the hopper must be on the same channel at once.
        // Over a sweep of N looks against N channels that happens with chance 1 - (1 - 1/N)^N, about 63%,
        // and a hop shorter than the look only fills part of it.
        const nCh = hopChannels(n);
        intercept = 1 - (1 - 1 / nCh) ** nCh;
        const dwell = dwellUs(n);
        if (dwell < ES_LOOK_US) powerDbm += 10 * Math.log10(dwell / ES_LOOK_US);
        label += ` (hopping ${n.waveform.hopsPerSec}/s)`;
      }
      return { freqMHz: n.freqMHz, powerDbm, intercept, label };
    });
}

// Sensors on a side: squads, and drones still within control range of their parent.
export function sensorsOf(units: Unit[], side: Side, map: HexMap): Unit[] {
  return units.filter((u) => {
    if (u.side !== side) return false;
    if (u.kind === 'squad') return true;
    if (u.kind !== 'drone') return false;
    const parent = units.find((p) => p.id === u.parentId);
    return !!parent && hexDistanceKm(map, parent.pos, u.pos) <= (u.controlRangeKm ?? Infinity);
  });
}

export interface SensorLook {
  sensorId: string;
  snrDb: number;
  pd: number;
  lineOfSight: boolean;
  emission: string;
}

// Direction finding (notes section 7).
export interface Bearing {
  sensorId: string;
  bearingDeg: number; // measured, clockwise from north
  sigmaDeg: number; // 1-sigma bearing error at this SNR
  rangeKm: number; // true range, used only to draw the line
}

export interface Fix {
  q: number; // estimated position in fractional axial hex coordinates
  r: number;
  cepKm: number; // circular error probable: half of fixes land within this distance
  ellipse: { aKm: number; bKm: number; angleRad: number }; // 1-sigma error ellipse, angle from east toward south
  missKm: number; // distance from the true position (what the player would not know)
}

export interface EmitterDetection {
  emitterId: string;
  pd: number; // combined over all sensors: 1 - product(1 - pd_i)
  best?: SensorLook;
  looks: SensorLook[];
  bearings: Bearing[];
  fix?: Fix;
}

export interface DetectionReport {
  side: Side;
  pfa: number; // the threshold setting
  effectivePfa: number; // actual false-alarm rate, raised by impulsive noise without a limiter
  falseAlarmsPerSweep: number; // expected false alarms per sensor per sweep of the band
  sensorIds: string[];
  emitters: EmitterDetection[];
}

export interface DetectOptions {
  pfa: number;
  noiseEnv: NoiseEnv;
  limiter: boolean;
  seed: number; // for repeatable bearing errors
}

// DF bearing accuracy: about 20 degrees at 0 dB SNR, improving with SNR, no better than 2 degrees.
export const bearingSigmaDeg = (snrDb: number): number => Math.max(2, 20 / Math.sqrt(10 ** (snrDb / 10)));

// A bearing needs a solid detection.
export const DF_MIN_PD = 0.5;

// One sensor's look at one of an emitter's emissions: SNR in the search channel and the chance of detecting it per sweep.
export function sensorLook(map: HexMap, emitter: Unit, sensor: Unit, em: Emission, opts: DetectOptions): SensorLook {
  const limiterDb = opts.limiter ? LIMITER_LOSS_DB : 0;
  const path = analyzePath(map, emitter.pos, emitter.radio.antennaHeightM, sensor.pos, sensor.radio.antennaHeightM, em.freqMHz);
  const rx = em.powerDbm + patternGainDbi(emitter, sensor.pos, map) + patternGainDbi(sensor, emitter.pos, map) - path.totalLossDb;
  const snrDb = rx - noiseFloorDbm(ES_CHANNEL_KHZ, sensor.radio.noiseFigureDb, manMadeNoiseFigureDb(em.freqMHz, opts.noiseEnv)) - limiterDb;
  return { sensorId: sensor.id, snrDb, pd: em.intercept * detectionProbability(snrDb, opts.pfa), lineOfSight: path.lineOfSight, emission: em.label };
}

// The emitter's most detectable emission as seen by one sensor.
export function bestLook(map: HexMap, emitter: Unit, sensor: Unit, nets: Net[], opts: DetectOptions): SensorLook | undefined {
  let best: SensorLook | undefined;
  for (const em of emissions(emitter, nets)) {
    const look = sensorLook(map, emitter, sensor, em, opts);
    if (!best || look.pd > best.pd) best = look;
  }
  return best;
}

// What one side's sensors detect of the other sides' emitters, with bearings and fixes.
export function detectEmitters(map: HexMap, units: Unit[], nets: Net[], side: Side, opts: DetectOptions): DetectionReport {
  const sensors = sensorsOf(units, side, map);
  const emitters = units.filter((u) => u.side !== side && u.side !== 'neutral');
  const impulsive = opts.noiseEnv === 'urban' && !opts.limiter;
  const effectivePfa = Math.min(0.5, opts.pfa * (impulsive ? URBAN_FALSE_ALARM_FACTOR : 1));
  const rng = createRng(opts.seed);
  const result: EmitterDetection[] = [];
  for (const e of emitters) {
    const looks: SensorLook[] = [];
    const bearings: Bearing[] = [];
    for (const s of sensors) {
      const best = bestLook(map, e, s, nets, opts);
      if (!best) continue;
      looks.push(best);
      if (best.pd >= DF_MIN_PD) {
        const sigmaDeg = bearingSigmaDeg(best.snrDb);
        const trueDeg = bearingDeg(map, s.pos, e.pos);
        bearings.push({ sensorId: s.id, bearingDeg: trueDeg + sigmaDeg * gaussian(rng), sigmaDeg, rangeKm: hexDistanceKm(map, s.pos, e.pos) });
      }
    }
    if (looks.length === 0) continue;
    const pd = 1 - looks.reduce((p, l) => p * (1 - l.pd), 1);
    const best = looks.reduce((a, b) => (b.pd > a.pd ? b : a));
    const fix = locate(map, units, bearings, e);
    result.push({ emitterId: e.id, pd, best, looks, bearings, fix });
  }
  result.sort((a, b) => b.pd - a.pd);
  return { side, pfa: opts.pfa, effectivePfa, falseAlarmsPerSweep: effectivePfa * ES_CHANNELS, sensorIds: sensors.map((s) => s.id), emitters: result };
}

// Hex centre in km, x east and y south (the same orientation as the screen).
export function hexToKm(map: HexMap, h: Hex): { x: number; y: number } {
  return { x: (h.q + h.r / 2) * map.hexSizeKm, y: ((h.r * Math.sqrt(3)) / 2) * map.hexSizeKm };
}

function kmToHex(map: HexMap, x: number, y: number): { q: number; r: number } {
  const r = y / ((Math.sqrt(3) / 2) * map.hexSizeKm);
  return { q: x / map.hexSizeKm - r / 2, r };
}

// Clockwise from north.
export function bearingDeg(map: HexMap, from: Hex, to: Hex): number {
  const a = hexToKm(map, from);
  const b = hexToKm(map, to);
  return ((Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI + 360) % 360;
}

// Least-squares intersection of bearing lines (notes section 7), weighted by each line's cross-range error.
// Two passes: the first, unweighted, gives ranges for the second's weights.
function locate(map: HexMap, units: Unit[], bearings: Bearing[], emitter: Unit): Fix | undefined {
  const lines = bearings.map((b) => ({ sensorPos: units.find((u) => u.id === b.sensorId)!.pos, bearingDeg: b.bearingDeg, sigmaDeg: b.sigmaDeg }));
  return fixFromBearings(map, lines, emitter.pos);
}

export const MIN_BASELINE_KM = 0.5;
export const MIN_CROSSING_DEG = 3;

export interface BearingLine {
  sensorPos: Hex;
  bearingDeg: number;
  sigmaDeg: number;
}

// Fix from bearing lines taken at known sensor positions. `truth` is only used to report the miss distance.
export function fixFromBearings(map: HexMap, bearings: BearingLine[], truth?: Hex): Fix | undefined {
  if (bearings.length < 2) return undefined;
  // Lines from one place all pass through it: they would 'fix' the sensor's own position. Two sites at least,
  // and the lines must actually cross: bearings within MIN_CROSSING_DEG of parallel give no usable intersection.
  const sites = bearings.map((b) => hexToKm(map, b.sensorPos));
  const apart = sites.some((a) => sites.some((b) => Math.hypot(a.x - b.x, a.y - b.y) >= MIN_BASELINE_KM));
  if (!apart) return undefined;
  const between = (a: number, b: number) => {
    const d = Math.abs(a - b) % 180;
    return Math.min(d, 180 - d);
  };
  const crosses = bearings.some((a, i) => bearings.some((b, j) => i !== j && between(a.bearingDeg, b.bearingDeg) >= MIN_CROSSING_DEG));
  if (!crosses) return undefined;
  const lines = bearings.map((b) => {
    const p = hexToKm(map, b.sensorPos);
    const t = (b.bearingDeg * Math.PI) / 180;
    // Direction (sin t, -cos t) in x-east, y-south; normal is perpendicular to it.
    return { p, n: { x: Math.cos(t), y: Math.sin(t) }, sigmaRad: (b.sigmaDeg * Math.PI) / 180 };
  });
  const solve = (weight: (l: (typeof lines)[number]) => number) => {
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (const l of lines) {
      const w = weight(l);
      const d = l.n.x * l.p.x + l.n.y * l.p.y;
      a11 += w * l.n.x * l.n.x;
      a12 += w * l.n.x * l.n.y;
      a22 += w * l.n.y * l.n.y;
      b1 += w * l.n.x * d;
      b2 += w * l.n.y * d;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-9) return undefined;
    return { x: (a22 * b1 - a12 * b2) / det, y: (a11 * b2 - a12 * b1) / det, inv: { a: a22 / det, b: -a12 / det, c: a11 / det } };
  };
  const first = solve(() => 1);
  if (!first) return undefined;
  const second = solve((l) => {
    const range = Math.max(0.5, Math.hypot(first.x - l.p.x, first.y - l.p.y));
    return 1 / (l.sigmaRad * range) ** 2;
  });
  if (!second) return undefined;
  // Covariance = inverse normal matrix (km²). Its eigenvalues give the error ellipse.
  const { a, b, c } = second.inv;
  const mean = (a + c) / 2;
  const diff = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  const s1 = Math.sqrt(Math.max(0, mean + diff));
  const s2 = Math.sqrt(Math.max(0, mean - diff));
  const t = truth ? hexToKm(map, truth) : undefined;
  return {
    ...kmToHex(map, second.x, second.y),
    cepKm: cepFromSigmas(s1, s2),
    ellipse: { aKm: s1, bKm: s2, angleRad: 0.5 * Math.atan2(2 * b, a - c) },
    missKm: t ? Math.hypot(second.x - t.x, second.y - t.y) : NaN,
  };
}

// Standard normal sample (Box-Muller).
export function gaussian(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Circular error probable for a zero-mean 2D Gaussian with standard deviations s1 >= s2 (km): the radius that
// holds half the probability. P(R) = ∫ φ(x/s1)/s1 · [2Φ(√(R²−x²)/s2) − 1] dx, integrated numerically over x,
// which stays well behaved however thin the ellipse is. The usual 0.59·(s1+s2) shortcut understates it badly then.
export function cepFromSigmas(s1: number, s2: number): number {
  const a = Math.max(s1, s2, 1e-9);
  const b = Math.max(Math.min(s1, s2), 1e-9);
  const inside = (R: number) => {
    const N = 400; // even, Simpson's rule over x in [-R, R]
    const h = (2 * R) / N;
    let sum = 0;
    for (let i = 0; i <= N; i++) {
      const x = -R + i * h;
      const y = Math.sqrt(Math.max(0, R * R - x * x));
      const f = (Math.exp(-(x * x) / (2 * a * a)) / (a * Math.sqrt(2 * Math.PI))) * (2 * normalCdf(y / b) - 1);
      sum += f * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2);
    }
    return (sum * h) / 3;
  };
  let lo = 0;
  let hi = 1.2 * (a + b);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (inside(mid) < 0.5) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Standard normal CDF via the Abramowitz-Stegun 7.1.26 erf approximation (error under 2e-7).
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + (z < 0 ? -erf : erf));
}
