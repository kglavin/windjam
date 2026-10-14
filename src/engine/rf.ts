import { type Hex, hexLine } from './hex';
import { type HexMap, getTile } from './map';
import { TERRAIN } from './terrain';

const C = 299_792_458;
const EFFECTIVE_EARTH_RADIUS_M = 8_500_000; // 4/3 earth model for VHF/UHF refraction
const BOLTZMANN_DBM_PER_HZ = -174; // kT at 290 K

export const wattsToDbm = (w: number): number => 10 * Math.log10(w * 1000);

export const wavelengthM = (freqMHz: number): number => C / (freqMHz * 1e6);

// Straight-line distance between hex centres. Neighbours are hexSizeKm apart.
export function hexDistanceKm(map: HexMap, a: Hex, b: Hex): number {
  const dx = a.q - b.q + (a.r - b.r) / 2;
  const dy = ((a.r - b.r) * Math.sqrt(3)) / 2;
  return Math.hypot(dx, dy) * map.hexSizeKm;
}

// Free-space path loss, inverse-square law (notes section 5, n = 2).
export function fsplDb(distanceKm: number, freqMHz: number): number {
  return 32.44 + 20 * Math.log10(distanceKm) + 20 * Math.log10(freqMHz);
}

// Distance beyond which the two-ray ground reflection model applies.
export function twoRayBreakpointKm(htM: number, hrM: number, freqMHz: number): number {
  return (4 * Math.PI * htM * hrM) / wavelengthM(freqMHz) / 1000;
}

// Two-ray ground reflection loss, inverse-fourth law (notes section 5, n = 4).
export function twoRayLossDb(distanceKm: number, htM: number, hrM: number): number {
  return 40 * Math.log10(distanceKm * 1000) - 20 * Math.log10(htM) - 20 * Math.log10(hrM);
}

// Radius of the first Fresnel zone at a point d1 from one end and d2 from the other.
// Keeping about 60% of it clear of terrain gives near free-space loss.
export function fresnelRadiusM(freqMHz: number, d1M: number, d2M: number): number {
  if (d1M <= 0 || d2M <= 0) return 0;
  return Math.sqrt((wavelengthM(freqMHz) * d1M * d2M) / (d1M + d2M));
}

// Single knife-edge diffraction loss J(v), ITU-R P.526 approximation.
export function knifeEdgeLossDb(v: number): number {
  if (v <= -0.78) return 0;
  return 6.9 + 20 * Math.log10(Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1);
}

// Median man-made noise figure, rural environment, ITU-R P.372: Fa = c - d log10(f MHz).
// At VHF this external noise sits well above the receiver's own thermal noise.
export function ruralNoiseFigureDb(freqMHz: number): number {
  return Math.max(0, 67.2 - 27.7 * Math.log10(freqMHz));
}

// Noise environment (notes section 2). Urban man-made noise uses the ITU-R P.372 business curve
// (c = 76.8), about 10 dB above rural, and is impulsive rather than Gaussian.
export type NoiseEnv = 'rural' | 'urban';

export function manMadeNoiseFigureDb(freqMHz: number, env: NoiseEnv): number {
  return env === 'rural' ? ruralNoiseFigureDb(freqMHz) : Math.max(0, 76.8 - 27.7 * Math.log10(freqMHz));
}

// Noise floor from receiver noise figure plus external noise: f_sys = f_a + f_rx - 1 (linear).
export function noiseFloorDbm(bandwidthKHz: number, noiseFigureDb: number, externalNoiseDb = 0): number {
  const fSys = 10 ** (externalNoiseDb / 10) + 10 ** (noiseFigureDb / 10) - 1;
  return BOLTZMANN_DBM_PER_HZ + 10 * Math.log10(bandwidthKHz * 1000) + 10 * Math.log10(fSys);
}

export interface ProfilePoint {
  hex: Hex;
  distanceKm: number;
  groundM: number;
  obstacleTopM: number; // ground + clutter + earth bulge
  rayM: number; // height of the direct ray at this point
  v: number; // Fresnel-Kirchhoff diffraction parameter
}

export type PathModel = 'free-space' | 'two-ray';

export interface PathAnalysis {
  distanceKm: number;
  profile: ProfilePoint[];
  lineOfSight: boolean;
  worstObstacle?: ProfilePoint;
  // Antenna heights above the mean terrain along the path. Hilltop sites gain here.
  effectiveHeightAM: number;
  effectiveHeightBM: number;
  breakpointKm: number;
  model: PathModel;
  baseLossDb: number;
  diffractionLossDb: number;
  clutterLossDb: number;
  totalLossDb: number;
}

// Path loss between two antennas over the terrain. Symmetric in a and b.
export function analyzePath(
  map: HexMap,
  a: Hex,
  aAntennaM: number,
  b: Hex,
  bAntennaM: number,
  freqMHz: number,
): PathAnalysis {
  const tileA = getTile(map, a);
  const tileB = getTile(map, b);
  if (!tileA || !tileB) throw new Error('Path endpoint is off the map');

  const distanceKm = Math.max(hexDistanceKm(map, a, b), 0.1);
  const dTotalM = distanceKm * 1000;
  const lambda = wavelengthM(freqMHz);
  const hA = tileA.elevationM + aAntennaM;
  const hB = tileB.elevationM + bAntennaM;

  const profile: ProfilePoint[] = [];
  const line = hexLine(a, b);
  for (let i = 1; i < line.length - 1; i++) {
    const tile = getTile(map, line[i]);
    if (!tile) continue;
    const d1 = hexDistanceKm(map, a, line[i]) * 1000;
    const d2 = Math.max(dTotalM - d1, 1);
    const bulge = (d1 * d2) / (2 * EFFECTIVE_EARTH_RADIUS_M);
    const obstacleTopM = tile.elevationM + TERRAIN[tile.terrain].clutterHeightM + bulge;
    const rayM = hA + (hB - hA) * (d1 / dTotalM);
    const h = obstacleTopM - rayM;
    const v = h * Math.sqrt((2 * (d1 + d2)) / (lambda * d1 * d2));
    profile.push({ hex: line[i], distanceKm: d1 / 1000, groundM: tile.elevationM, obstacleTopM, rayM, v });
  }

  // Single dominant edge: the point with the largest v.
  const worstObstacle = profile.reduce<ProfilePoint | undefined>(
    (worst, p) => (!worst || p.v > worst.v ? p : worst),
    undefined,
  );
  const lineOfSight = !worstObstacle || worstObstacle.v <= 0;
  const diffractionLossDb = worstObstacle ? knifeEdgeLossDb(worstObstacle.v) : 0;

  const grounds = [tileA.elevationM, tileB.elevationM, ...profile.map((p) => p.groundM)];
  const meanGroundM = grounds.reduce((s, g) => s + g, 0) / grounds.length;
  const effectiveHeightAM = Math.max(aAntennaM, hA - meanGroundM);
  const effectiveHeightBM = Math.max(bAntennaM, hB - meanGroundM);

  // Base loss from free-space or two-ray, then diffraction from the dominant edge on top.
  const breakpointKm = twoRayBreakpointKm(effectiveHeightAM, effectiveHeightBM, freqMHz);
  const model: PathModel = distanceKm > breakpointKm ? 'two-ray' : 'free-space';
  const baseLossDb =
    model === 'two-ray'
      ? twoRayLossDb(distanceKm, effectiveHeightAM, effectiveHeightBM)
      : fsplDb(distanceKm, freqMHz);

  const clutterLossDb =
    TERRAIN[tileA.terrain].endpointLossDb + TERRAIN[tileB.terrain].endpointLossDb;

  return {
    distanceKm,
    profile,
    lineOfSight,
    worstObstacle,
    effectiveHeightAM,
    effectiveHeightBM,
    breakpointKm,
    model,
    baseLossDb,
    diffractionLossDb,
    clutterLossDb,
    totalLossDb: baseLossDb + diffractionLossDb + clutterLossDb,
  };
}

// Directional antenna pattern (notes section 1 EP): +6 dBi within 30 degrees of the boresight, -14 dBi elsewhere,
// so anything off-axis, friend or foe, is 20 dB down. Omni units return their radio gain.
export const BEAM_HALF_WIDTH_DEG = 30;
export const BEAM_GAIN_DBI = 6;
export const SIDELOBE_GAIN_DBI = -14;

export function patternGainDbi(u: { pos: Hex; radio: { gainDbi: number }; antenna?: { boresight: Hex } }, toward: Hex, map: HexMap): number {
  if (!u.antenna) return u.radio.gainDbi;
  const km = (h: Hex) => ({ x: (h.q + h.r / 2) * map.hexSizeKm, y: ((h.r * Math.sqrt(3)) / 2) * map.hexSizeKm });
  const o = km(u.pos);
  const a = km(u.antenna.boresight);
  const b = km(toward);
  const angA = Math.atan2(a.y - o.y, a.x - o.x);
  const angB = Math.atan2(b.y - o.y, b.x - o.x);
  const diff = Math.abs(((((angA - angB) * 180) / Math.PI + 540) % 360) - 180);
  return diff <= BEAM_HALF_WIDTH_DEG ? BEAM_GAIN_DBI : SIDELOBE_GAIN_DBI;
}
