import { toneBers } from '../../engine/lab/levels';
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

// A level's scene with a jammer: the truth's rates, a transmitter power that puts the friendly receiver's Eb/N0 near
// 25 dB (noise negligible), and the jammer on its default bearing at the distance that gives the target Eb/J0.
function jammerScene(t: Truth, salt: number, ebJ0LoDb: number, ebJ0SpanDb: number): Scene {
  const rng = createRng(t.seed ^ salt);
  const targetEbN0Db = Math.round((24.5 + rng()) * 10) / 10;
  const targetEbJ0Db = Math.round((ebJ0LoDb + ebJ0SpanDb * rng()) * 10) / 10;
  return sceneAt(t, targetEbN0Db, targetEbJ0Db);
}

// The scene with the receiver's Eb/N0 and the broadband Eb/J0 (Gp less J/S) at the targets.
function sceneAt(t: Truth, targetEbN0Db: number, targetEbJ0Db: number): Scene {
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

// Level 2's scene: Eb/J0 between 3.5 and 5.5 dB. The intercept is not used.
export const level2Scene = (t: Truth): Scene => jammerScene(t, 0x2c1b3c6d, 3.5, 2);

// Level 3's scene: a link with margin, Eb/J0 between 8.5 and 10.5 dB (8 to 11 as the texts round it). The
// jammer stays where it is and the intercept is not used.
export const level3Scene = (t: Truth): Scene => jammerScene(t, 0x1b873593, 8.5, 2);

// Level 4's scene: a noisy receiver (Eb/N0 8.5 to 10 dB) and a J/S that leaves broadband Eb/J0 between 1.5 and 3.5 dB.
// Targets are drawn from the seed until the scene as built passes: against the enemy short code at the scene J/S a
// tone on the carrier gives BER of at most 0.002, and a tone on the first line (phase-averaged) and broadband
// noise both give between 0.006 and 0.09 (the texts promise 0.005 to 0.1). The jammer stays where it is.
export const LEVEL4_BER = { carrierMax: 0.002, min: 0.006, max: 0.09 };
export function level4Scene(t: Truth): Scene {
  const rng = createRng(t.seed ^ 0x3c6ef372);
  let last: Scene | undefined;
  for (let k = 0; k < 60; k++) {
    const ebN0 = Math.round((8.5 + 1.5 * rng()) * 10) / 10;
    const ebJ0 = Math.round((1.5 + 2 * rng()) * 10) / 10;
    const scene = sceneAt(t, ebN0, ebJ0);
    last = scene;
    const b = sceneBudget(scene);
    const m = toneBers(t.degree, b.ebN0Db, b.jsDb);
    const ok = (v: number) => v >= LEVEL4_BER.min && v <= LEVEL4_BER.max;
    if (m.carrier <= LEVEL4_BER.carrierMax && ok(m.line) && ok(m.bbn)) return scene;
  }
  return last!;
}

// The scene with the intercept moved out along the starting bearing to the farthest spot whose chip SNR is still
// at least minDb, so the instruments show the signal after a skipped find step.
export function moveInterceptToSignal(scene: Scene, minDb: number): Scene {
  const at = (km: number): Scene => ({
    ...scene,
    intercept: { ...scene.intercept, xKm: km * Math.cos(START_BEARING), yKm: km * Math.sin(START_BEARING) },
  });
  let lo = 1;
  let hi = MAX_START_KM;
  if (sceneBudget(at(hi)).intercept.chipSnrDb >= minDb) return at(hi);
  while (hi - lo > 0.05) {
    const mid = (lo + hi) / 2;
    if (sceneBudget(at(mid)).intercept.chipSnrDb >= minDb) lo = mid;
    else hi = mid;
  }
  return at(Math.floor(lo * 10) / 10);
}

// Level 5's scene: a receiver with Eb/N0 between 11.5 and 12.5 dB and a jammer for context only. The runs fix
// their own J/S, so the scene's jammer stays where it is (broadband Eb/J0 between 3.5 and 5 dB).
export function level5Scene(t: Truth): Scene {
  const rng = createRng(t.seed ^ 0x2f6b1c3d);
  const ebN0 = Math.round((11.5 + rng()) * 10) / 10;
  const ebJ0 = Math.round((3.5 + 1.5 * rng()) * 10) / 10;
  return sceneAt(t, ebN0, ebJ0);
}
