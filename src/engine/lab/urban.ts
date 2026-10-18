// Level 11 (docs/design-level-11.md): radio in towns. Urban path loss (Hata, a street microcell, building and rooftop
// losses), log-normal shadowing and the J/S margin it needs, Rayleigh fading, bearings off walls, directional jammers
// and friendly receivers (fratricide), and the counter-IED protection bubble.
import { createRng } from '../rng';
import { gaussian } from '../detect';
import { type Pt, bearingDeg, crossingAngleDeg } from './geoloc';

const log10 = Math.log10;

// --- Path loss --------------------------------------------------------------------------------------------------

// Hata's mobile antenna height correction a(hm): the large-city form, or the medium/small-city form.
export function hataMobileCorrectionDb(freqMHz: number, hmM: number, largeCity: boolean): number {
  if (largeCity) return freqMHz >= 300 ? 3.2 * log10(11.75 * hmM) ** 2 - 4.97 : 8.29 * log10(1.54 * hmM) ** 2 - 1.1;
  return (1.1 * log10(freqMHz) - 0.7) * hmM - (1.56 * log10(freqMHz) - 0.8);
}

// Hata urban loss (dB), 150 to 1500 MHz, 1 to 20 km, base antenna 30 to 200 m, mobile 1 to 10 m.
export function hataUrbanDb(freqMHz: number, distanceKm: number, hbM: number, hmM: number, largeCity = true): number {
  return 69.55 + 26.16 * log10(freqMHz) - 13.82 * log10(hbM) - hataMobileCorrectionDb(freqMHz, hmM, largeCity)
    + (44.9 - 6.55 * log10(hbM)) * log10(distanceKm);
}

// Hata's distance slope: dB per decade ÷ 10. About 3.5 for a 30 m base, less for higher ones.
export const hataSlope = (hbM: number): number => (44.9 - 6.55 * log10(hbM)) / 10;

export const freeSpaceDb = (freqMHz: number, distanceKm: number): number => 32.45 + 20 * log10(freqMHz) + 20 * log10(distanceKm);

// A street microcell: free space out to the breakpoint 4·hb·hm/λ, then 40·log10 beyond it.
export function microcellDb(freqMHz: number, distanceKm: number, hbM: number, hmM: number): number {
  const lambdaM = 300 / freqMHz;
  const bpKm = (4 * hbM * hmM) / lambdaM / 1000;
  if (distanceKm <= bpKm) return freeSpaceDb(freqMHz, distanceKm);
  return freeSpaceDb(freqMHz, bpKm) + 40 * log10(distanceKm / bpKm);
}
export const breakpointKm = (freqMHz: number, hbM: number, hmM: number): number => (4 * hbM * hmM) / (300 / freqMHz) / 1000;

// --- Shadowing ----------------------------------------------------------------------------------------------------

// The spread of J/S when the jammer's and the transmitter's paths are shadowed independently.
export const jsSpreadDb = (sigmaJDb: number, sigmaSDb: number): number => Math.hypot(sigmaJDb, sigmaSDb);

// The z-value for a share of spots (normal quantile): 0.9 → 1.28.
export function zFor(share: number): number {
  let lo = -8;
  let hi = 8;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    const cdf = 0.5 * (1 + erf(m / Math.SQRT2));
    if (cdf < share) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
// The margin over the needed J/S that holds at `share` of the spots.
export const coverageMarginDb = (spreadDb: number, share: number): number => zFor(share) * spreadDb;

// J/S at many spots: the mean plus independent shadowing on each path.
export function jsSamples(meanDb: number, sigmaJDb: number, sigmaSDb: number, count: number, seed: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => meanDb + sigmaJDb * gaussian(rng) - sigmaSDb * gaussian(rng));
}

// --- Multipath ----------------------------------------------------------------------------------------------------

// Rayleigh fading: the chance one path's level is more than `fadeDb` below its average, 1 − e^(−10^(−F/10)).
export const fadeProbability = (fadeDb: number): number => 1 - Math.exp(-(10 ** (-fadeDb / 10)));
// With L independent paths combined (a rake), all must fade together: about that chance to the power L.
export const rakeFadeProbability = (fadeDb: number, paths: number): number => fadeProbability(fadeDb) ** paths;

// A bearing taken where the direct path is blocked points at the wall that reflects the signal: the error is the
// angle between the wall and the transmitter as seen from the site.
export const reflectionBearingErrorDeg = (site: Pt, tx: Pt, wall: Pt): number => crossingAngleDeg(bearingDeg(site, tx), bearingDeg(site, wall));

// --- Directional jamming and fratricide ---------------------------------------------------------------------------

// A directional jammer: full gain within its half beamwidth of the boresight, side lobes `sidelobeDb` down outside it.
export function jammerGainDbi(boresightDeg: number, towardDeg: number, gainDbi: number, halfBeamDeg: number, sidelobeDb: number): number {
  const off = Math.abs((((towardDeg - boresightDeg) % 360) + 540) % 360 - 180);
  return off <= halfBeamDeg ? gainDbi : gainDbi - sidelobeDb;
}

export interface Receiver extends Pt {
  name: string;
  friendly: boolean; // true: our own or civilian, must stay below its tolerance; false: the enemy target
  signalDbm: number; // its own wanted signal level
  toleranceJsDb?: number; // friendly: the J/S it can stand
}

export interface Jammer extends Pt {
  powerDbm: number;
  boresightDeg?: number; // absent: omni
  gainDbi?: number;
  halfBeamDeg?: number;
  sidelobeDb?: number;
}

// J/S at each receiver with a path loss function of distance (km): the town's model.
export function jsAtReceivers(j: Jammer, rx: Receiver[], lossDb: (km: number) => number): number[] {
  return rx.map((r) => {
    const km = Math.max(0.01, Math.hypot(r.xKm - j.xKm, r.yKm - j.yKm));
    const g = j.boresightDeg === undefined ? 0 : jammerGainDbi(j.boresightDeg, bearingDeg(j, r), j.gainDbi ?? 0, j.halfBeamDeg ?? 30, j.sidelobeDb ?? 20);
    return j.powerDbm + g - lossDb(km) - r.signalDbm;
  });
}

// Does a placement work: every enemy at least goalJsDb, every friendly at most its tolerance?
export function isolationCheck(j: Jammer, rx: Receiver[], lossDb: (km: number) => number, goalJsDb: number) {
  const js = jsAtReceivers(j, rx, lossDb);
  const enemyOk = rx.every((r, i) => r.friendly || js[i] >= goalJsDb);
  const friendlyOk = rx.every((r, i) => !r.friendly || js[i] <= (r.toleranceJsDb ?? 0));
  return { js, enemyOk, friendlyOk, ok: enemyOk && friendlyOk };
}

// --- Counter-IED -------------------------------------------------------------------------------------------------

// The radius within which a vehicle jammer denies a radio trigger: J/S at the trigger's receiver must reach jsNeededDb,
// with the trigger's transmitter dt km from it and a path loss slope of n (10·n dB per decade).
export const bubbleRadiusKm = (dtKm: number, jamOverTriggerDb: number, jsNeededDb: number, n: number): number =>
  dtKm * 10 ** ((jamOverTriggerDb - jsNeededDb) / (10 * n));
