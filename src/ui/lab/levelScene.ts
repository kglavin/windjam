import { createRng } from '../../engine/rng';
import type { Truth } from '../../engine/lab/levels';
import { type Scene, jammerDistanceForJs, sceneBudget } from '../../engine/lab/scene';
import { DEFAULT_SCENE } from './defaultScene';

const START_CHIP_SNR_DB = -12;
const START_BEARING = (-30 * Math.PI) / 180;
const MAX_START_KM = 190;

// Level 1's scene: the truth's rates, no jammer, a transmitter power that puts the friendly receiver's
// Eb/N0 between 11 and 14 dB (seeded), and an intercept that starts about 15 dB below the 3 dB target.
export function level1Scene(t: Truth): Scene {
  const rng = createRng(t.seed ^ 0x5bd1e995);
  const targetEbN0Db = Math.round((11 + 3 * rng()) * 10) / 10;
  let scene: Scene = {
    ...DEFAULT_SCENE,
    chipRateMcps: t.chipRateMcps,
    dataRateKbps: t.bitRateKbps,
    jammer: { ...DEFAULT_SCENE.jammer, powerW: 0 },
    tx: { ...DEFAULT_SCENE.tx, powerW: 1 },
  };
  const one = sceneBudget(scene).ebN0Db;
  const powerW = Math.round(10 ** ((targetEbN0Db - one) / 10) * 100) / 100;
  scene = { ...scene, tx: { ...scene.tx, powerW } };

  const at = (km: number): Scene => ({
    ...scene,
    intercept: { ...scene.intercept, xKm: km * Math.cos(START_BEARING), yKm: km * Math.sin(START_BEARING) },
  });
  let lo = 1;
  let hi = MAX_START_KM;
  if (sceneBudget(at(hi)).intercept.chipSnrDb > START_CHIP_SNR_DB) lo = hi;
  while (hi - lo > 0.05) {
    const mid = (lo + hi) / 2;
    if (sceneBudget(at(mid)).intercept.chipSnrDb > START_CHIP_SNR_DB) lo = mid;
    else hi = mid;
  }
  const km = Math.round(lo * 10) / 10;
  return at(km);
}

// Level 2's scene: the truth's rates, a transmitter power that puts the friendly receiver's Eb/N0 near 25 dB
// (noise negligible), and the jammer on its default bearing at the distance that gives Eb/J0 between 3.5 and
// 5.5 dB. The intercept is not used.
export function level2Scene(t: Truth): Scene {
  const rng = createRng(t.seed ^ 0x2c1b3c6d);
  const targetEbN0Db = Math.round((24.5 + rng()) * 10) / 10;
  const targetEbJ0Db = Math.round((3.5 + 2 * rng()) * 10) / 10;
  let scene: Scene = {
    ...DEFAULT_SCENE,
    chipRateMcps: t.chipRateMcps,
    dataRateKbps: t.bitRateKbps,
    tx: { ...DEFAULT_SCENE.tx, powerW: 1 },
  };
  const one = sceneBudget(scene).ebN0Db;
  const powerW = Math.round(10 ** ((targetEbN0Db - one) / 10) * 100) / 100;
  scene = { ...scene, tx: { ...scene.tx, powerW } };

  const km = jammerDistanceForJs(scene, t.gpDb - targetEbJ0Db);
  const dx = scene.jammer.xKm - scene.rx.xKm;
  const dy = scene.jammer.yKm - scene.rx.yKm;
  const len = Math.hypot(dx, dy);
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    ...scene,
    jammer: {
      ...scene.jammer,
      xKm: round1(scene.rx.xKm + (dx / len) * km),
      yKm: round1(scene.rx.yKm + (dy / len) * km),
    },
  };
}
