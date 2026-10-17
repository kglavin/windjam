// The Link lab scene: three stations on a flat plane, S, J and N at the receiver, and the budget ladder.
// Pure geometry and rf.ts formulas, no map.
import {
  BEAM_GAIN_DBI,
  BEAM_HALF_WIDTH_DEG,
  SIDELOBE_GAIN_DBI,
  type NoiseEnv,
  fsplDb,
  knifeEdgeLossDb,
  manMadeNoiseFigureDb,
  noiseFloorDbm,
  twoRayBreakpointKm,
  twoRayLossDb,
  wattsToDbm,
  wavelengthM,
} from '../rf';

export interface Station {
  xKm: number;
  yKm: number;
  heightM: number;
  powerW: number;
  gainDbi: number;
}

export type ScenePathModel = 'free-space' | 'two-ray';

// Knife edge on the path, height above flat ground, 0 < atFraction < 1 of the way from a to b.
export interface Obstacle {
  atFraction: number;
  heightM: number;
}

export interface PathSetup {
  model: ScenePathModel;
  obstacle?: Obstacle;
}

export interface Scene {
  freqMHz: number;
  tx: Station;
  rx: Station;
  jammer: Station;
  rxAntenna: 'omni' | 'directional'; // directional: boresight at the transmitter
  txPath: PathSetup;
  jamPath: PathSetup;
  noiseFigureDb: number;
  noiseEnv: NoiseEnv;
  chipRateMcps: number;
  dataRateKbps: number;
}

export interface LadderStep {
  label: string;
  db: number;
  unit: 'dBm' | 'dB' | 'dBi';
}

export interface SceneBudget {
  txDistanceKm: number;
  jamDistanceKm: number;
  txPathLossDb: number; // base loss + diffraction
  jamPathLossDb: number;
  txDiffractionDb: number;
  jamDiffractionDb: number;
  rxGainToTxDbi: number;
  rxGainToJammerDbi: number;
  sDbm: number;
  jDbm: number;
  nDbm: number;
  snrDb: number;
  gpDb: number;
  ebN0Db: number;
  jsDb: number;
  ebJ0Db: number;
  ebN0J0Db: number; // Eb/(N0+J0)
  ladder: LadderStep[];
}

const MIN_DISTANCE_KM = 0.1;
const MAX_DISTANCE_KM = 1000;

// Path loss between two stations: base (free space or two-ray) plus single knife-edge diffraction.
export function pathLossDb(
  freqMHz: number,
  a: Station,
  b: Station,
  setup: PathSetup,
): { distanceKm: number; baseDb: number; diffractionDb: number; totalDb: number } {
  const distanceKm = Math.max(Math.hypot(a.xKm - b.xKm, a.yKm - b.yKm), MIN_DISTANCE_KM);
  const breakpointKm = twoRayBreakpointKm(a.heightM, b.heightM, freqMHz);
  const baseDb =
    setup.model === 'two-ray' && distanceKm > breakpointKm
      ? twoRayLossDb(distanceKm, a.heightM, b.heightM)
      : fsplDb(distanceKm, freqMHz);

  let diffractionDb = 0;
  if (setup.obstacle) {
    const dM = distanceKm * 1000;
    const d1 = setup.obstacle.atFraction * dM;
    const d2 = dM - d1;
    const rayM = a.heightM + (b.heightM - a.heightM) * setup.obstacle.atFraction;
    const h = setup.obstacle.heightM - rayM;
    const v = h * Math.sqrt((2 * (d1 + d2)) / (wavelengthM(freqMHz) * d1 * d2));
    diffractionDb = knifeEdgeLossDb(v);
  }
  return { distanceKm, baseDb, diffractionDb, totalDb: baseDb + diffractionDb };
}

// Receiver antenna gain toward a station: omni gain, or beam gain if within the beam of the transmitter.
export function rxGainDbi(scene: Scene, toward: Station): number {
  if (scene.rxAntenna === 'omni') return scene.rx.gainDbi;
  const { rx, tx } = scene;
  const angTx = Math.atan2(tx.yKm - rx.yKm, tx.xKm - rx.xKm);
  const angB = Math.atan2(toward.yKm - rx.yKm, toward.xKm - rx.xKm);
  const diff = Math.abs(((((angTx - angB) * 180) / Math.PI + 540) % 360) - 180);
  return diff <= BEAM_HALF_WIDTH_DEG ? BEAM_GAIN_DBI : SIDELOBE_GAIN_DBI;
}

// S, J and N at the receiver input, the ratios after processing gain, and the ladder of terms.
export function sceneBudget(scene: Scene): SceneBudget {
  const { freqMHz, tx, rx, jammer } = scene;
  const txPath = pathLossDb(freqMHz, tx, rx, scene.txPath);
  const jamPath = pathLossDb(freqMHz, jammer, rx, scene.jamPath);
  const rxGainToTxDbi = rxGainDbi(scene, tx);
  const rxGainToJammerDbi = rxGainDbi(scene, jammer);

  const txPowerDbm = wattsToDbm(tx.powerW);
  const jamPowerDbm = wattsToDbm(jammer.powerW);
  const sDbm = txPowerDbm + tx.gainDbi + rxGainToTxDbi - txPath.totalDb;
  const jDbm = jamPowerDbm + jammer.gainDbi + rxGainToJammerDbi - jamPath.totalDb;
  const nDbm = noiseFloorDbm(
    scene.chipRateMcps * 1000,
    scene.noiseFigureDb,
    manMadeNoiseFigureDb(freqMHz, scene.noiseEnv),
  );

  const gpDb = 10 * Math.log10((scene.chipRateMcps * 1000) / scene.dataRateKbps);
  const snrDb = sDbm - nDbm;
  const ebN0Db = snrDb + gpDb;
  const jsDb = jDbm - sDbm;
  const ebJ0Db = gpDb - jsDb;
  const ebN0J0Db = -10 * Math.log10(10 ** (-ebN0Db / 10) + 10 ** (-ebJ0Db / 10));

  const ladder: LadderStep[] = [
    { label: 'Tx power', db: txPowerDbm, unit: 'dBm' },
    { label: 'Tx antenna', db: tx.gainDbi, unit: 'dBi' },
    { label: 'Path loss', db: -txPath.totalDb, unit: 'dB' },
    { label: 'Rx antenna', db: rxGainToTxDbi, unit: 'dBi' },
    { label: 'Signal S', db: sDbm, unit: 'dBm' },
    { label: 'Jammer power', db: jamPowerDbm, unit: 'dBm' },
    { label: 'Jammer antenna', db: jammer.gainDbi, unit: 'dBi' },
    { label: 'Jammer path loss', db: -jamPath.totalDb, unit: 'dB' },
    { label: 'Rx antenna toward jammer', db: rxGainToJammerDbi, unit: 'dBi' },
    { label: 'Jamming J', db: jDbm, unit: 'dBm' },
    { label: 'Noise floor N', db: nDbm, unit: 'dBm' },
    { label: 'SNR', db: snrDb, unit: 'dB' },
    { label: 'Processing gain', db: gpDb, unit: 'dB' },
    { label: 'Eb/N0', db: ebN0Db, unit: 'dB' },
    { label: 'J/S', db: jsDb, unit: 'dB' },
    { label: 'Eb/J0', db: ebJ0Db, unit: 'dB' },
    { label: 'Eb/(N0+J0)', db: ebN0J0Db, unit: 'dB' },
  ];

  return {
    txDistanceKm: txPath.distanceKm,
    jamDistanceKm: jamPath.distanceKm,
    txPathLossDb: txPath.totalDb,
    jamPathLossDb: jamPath.totalDb,
    txDiffractionDb: txPath.diffractionDb,
    jamDiffractionDb: jamPath.diffractionDb,
    rxGainToTxDbi,
    rxGainToJammerDbi,
    sDbm,
    jDbm,
    nDbm,
    snrDb,
    gpDb,
    ebN0Db,
    jsDb,
    ebJ0Db,
    ebN0J0Db,
    ladder,
  };
}

// Distance from the receiver, on the jammer's current bearing, at which J/S equals the target.
// Returns 1000 km if J/S is still above target there, 0.1 km if it is below target at 0.1 km.
export function jammerDistanceForJs(scene: Scene, targetJsDb: number): number {
  const dx = scene.jammer.xKm - scene.rx.xKm;
  const dy = scene.jammer.yKm - scene.rx.yKm;
  const len = Math.hypot(dx, dy);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  const jsAt = (km: number): number =>
    sceneBudget({
      ...scene,
      jammer: { ...scene.jammer, xKm: scene.rx.xKm + ux * km, yKm: scene.rx.yKm + uy * km },
    }).jsDb;

  if (jsAt(MAX_DISTANCE_KM) > targetJsDb) return MAX_DISTANCE_KM;
  if (jsAt(MIN_DISTANCE_KM) < targetJsDb) return MIN_DISTANCE_KM;
  let lo = MIN_DISTANCE_KM;
  let hi = MAX_DISTANCE_KM;
  while (hi - lo > 0.001) {
    const mid = (lo + hi) / 2;
    if (jsAt(mid) > targetJsDb) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
