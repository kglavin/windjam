import { createRng } from '../../engine/rng';
import type { Truth } from '../../engine/lab/levels';
import { type Scene, sceneBudget } from '../../engine/lab/scene';
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
