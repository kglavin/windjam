import { describe, expect, it } from 'vitest';
import { processingGainDb } from '../ew';
import { fsplDb, knifeEdgeLossDb, twoRayBreakpointKm, twoRayLossDb, wattsToDbm, wavelengthM } from '../rf';
import type { Net } from '../units';
import { type Scene, jammerDistanceForJs, pathLossDb, rxGainDbi, sceneBudget } from './scene';

const base: Scene = {
  freqMHz: 50,
  tx: { xKm: 0, yKm: 0, heightM: 10, powerW: 5, gainDbi: 0 },
  rx: { xKm: 10, yKm: 0, heightM: 2, powerW: 0, gainDbi: 0 },
  jammer: { xKm: 10, yKm: 20, heightM: 10, powerW: 100, gainDbi: 0 },
  intercept: { xKm: 2, yKm: 1, heightM: 5, powerW: 0, gainDbi: 3 },
  interceptPaths: { fromTx: { model: 'free-space' }, fromJammer: { model: 'free-space' } },
  rxAntenna: 'omni',
  txPath: { model: 'free-space' },
  jamPath: { model: 'free-space' },
  noiseFigureDb: 6,
  noiseEnv: 'rural',
  chipRateMcps: 1,
  dataRateKbps: 10,
};

describe('pathLossDb', () => {
  it('free space equals fsplDb', () => {
    const p = pathLossDb(50, base.tx, base.rx, base.txPath);
    expect(p.distanceKm).toBeCloseTo(10, 12);
    expect(p.totalDb).toBeCloseTo(fsplDb(10, 50), 9);
    expect(p.diffractionDb).toBe(0);
  });

  it('S equals tx power minus fspl', () => {
    const b = sceneBudget(base);
    expect(b.sDbm).toBeCloseTo(wattsToDbm(5) - fsplDb(10, 50), 9);
  });

  it('two-ray uses the breakpoint rule', () => {
    // Tall masts so the breakpoint (5.2 km) is above the 0.1 km distance floor.
    const tx = { ...base.tx, heightM: 50 };
    const bp = twoRayBreakpointKm(50, 50, 50);
    const at = (km: number) => ({ ...base.rx, heightM: 50, xKm: km });
    const setup = { model: 'two-ray' as const };
    const far = pathLossDb(50, tx, at(bp * 3), setup);
    expect(far.baseDb).toBeCloseTo(twoRayLossDb(bp * 3, 50, 50), 9);
    const near = pathLossDb(50, tx, at(bp / 3), setup);
    expect(near.baseDb).toBeCloseTo(fsplDb(bp / 3, 50), 9);
  });

  it('floors distance at 0.1 km', () => {
    expect(pathLossDb(50, base.tx, base.tx, base.txPath).distanceKm).toBe(0.1);
  });

  it('obstacle far below the ray adds nothing, a tall one adds knife-edge loss', () => {
    // At 50 MHz the Fresnel zone is wide, so use 100 m masts to put a 1 m obstacle well clear (v < -0.78).
    const tall100 = { ...base.tx, heightM: 100 };
    const rx100 = { ...base.rx, heightM: 100 };
    const low = pathLossDb(50, tall100, rx100, { model: 'free-space', obstacle: { atFraction: 0.5, heightM: 1 } });
    expect(low.diffractionDb).toBe(0);
    const tall = pathLossDb(50, base.tx, base.rx, { model: 'free-space', obstacle: { atFraction: 0.5, heightM: 200 } });
    const d1 = 5000;
    const d2 = 5000;
    const h = 200 - (10 + (2 - 10) * 0.5);
    const v = h * Math.sqrt((2 * (d1 + d2)) / (wavelengthM(50) * d1 * d2));
    expect(tall.diffractionDb).toBeCloseTo(knifeEdgeLossDb(v), 9);
    expect(tall.diffractionDb).toBeGreaterThan(10);
    expect(tall.totalDb).toBeCloseTo(tall.baseDb + tall.diffractionDb, 12);
  });
});

describe('rxGainDbi', () => {
  it('omni returns rx gain', () => {
    expect(rxGainDbi(base, base.jammer)).toBe(0);
  });

  it('directional: beam toward the transmitter side, sidelobe elsewhere', () => {
    const dir: Scene = { ...base, rxAntenna: 'directional' };
    const behindTx = { ...base.jammer, xKm: -5, yKm: 0 };
    expect(rxGainDbi(dir, behindTx)).toBe(6);
    expect(rxGainDbi(dir, base.jammer)).toBe(-14);
    const jBehind = sceneBudget({ ...dir, jammer: behindTx });
    const jBehindOmni = sceneBudget({ ...base, jammer: behindTx });
    expect(jBehind.jDbm - jBehindOmni.jDbm).toBeCloseTo(6, 9);
    const jSide = sceneBudget(dir);
    expect(jSide.jDbm - sceneBudget(base).jDbm).toBeCloseTo(-14, 9);
  });
});

describe('sceneBudget', () => {
  const b = sceneBudget(base);

  it('gp matches processingGainDb', () => {
    const net: Net = {
      id: 'n',
      name: 'n',
      side: 'blue',
      topology: 'mesh',
      memberIds: [],
      freqMHz: 50,
      bandwidthKHz: 25,
      dataRateKbps: 10,
      waveform: { kind: 'dsss', chipRateMcps: 1 },
    };
    expect(b.gpDb).toBeCloseTo(processingGainDb(net), 9);
  });

  it('ratios are consistent', () => {
    expect(b.ebN0Db).toBeCloseTo(b.snrDb + b.gpDb, 9);
    expect(b.ebJ0Db).toBeCloseTo(b.gpDb - b.jsDb, 9);
    expect(b.jsDb).toBeCloseTo(b.jDbm - b.sDbm, 9);
    expect(b.ebN0J0Db).toBeLessThan(Math.min(b.ebN0Db, b.ebJ0Db));
  });

  it('ladder ends match the budget', () => {
    expect(b.ladder.find((s) => s.label === 'Signal S')?.db).toBe(b.sDbm);
    expect(b.ladder).toHaveLength(17);
  });
});

describe('jammerDistanceForJs', () => {
  const check = (scene: Scene, target: number) => {
    const km = jammerDistanceForJs(scene, target);
    const dx = scene.jammer.xKm - scene.rx.xKm;
    const dy = scene.jammer.yKm - scene.rx.yKm;
    const len = Math.hypot(dx, dy);
    const moved = { ...scene.jammer, xKm: scene.rx.xKm + (dx / len) * km, yKm: scene.rx.yKm + (dy / len) * km };
    expect(sceneBudget({ ...scene, jammer: moved }).jsDb).toBeCloseTo(target, 1);
    expect(Math.abs(sceneBudget({ ...scene, jammer: moved }).jsDb - target)).toBeLessThan(0.01);
  };

  it('free space', () => check(base, 20));

  it('two-ray', () => {
    const scene: Scene = { ...base, txPath: { model: 'two-ray' }, jamPath: { model: 'two-ray' } };
    check(scene, 10);
    check(scene, 30);
  });

  it('with an obstacle on the jammer path', () => {
    check({ ...base, jamPath: { model: 'free-space', obstacle: { atFraction: 0.5, heightM: 50 } } }, 20);
  });

  it('edge returns', () => {
    expect(jammerDistanceForJs(base, -500)).toBe(1000);
    expect(jammerDistanceForJs(base, 500)).toBe(0.1);
  });

  it('jammer on the receiver uses +x', () => {
    const scene: Scene = { ...base, jammer: { ...base.jammer, xKm: base.rx.xKm, yKm: base.rx.yKm } };
    expect(jammerDistanceForJs(scene, 20)).toBeGreaterThan(0.1);
  });
});

describe('intercept station', () => {
  it('S at the intercept is tx power + gains - path loss', () => {
    const b = sceneBudget(base);
    const pl = pathLossDb(50, base.tx, base.intercept, base.interceptPaths.fromTx).totalDb;
    expect(b.intercept.sDbm).toBeCloseTo(wattsToDbm(5) + 0 + 3 - pl, 9);
    const pj = pathLossDb(50, base.jammer, base.intercept, base.interceptPaths.fromJammer).totalDb;
    expect(b.intercept.jDbm).toBeCloseTo(wattsToDbm(100) + 3 - pj, 9);
    expect(b.intercept.jsDb).toBeCloseTo(b.intercept.jDbm - b.intercept.sDbm, 9);
  });

  it('chip SNR is S - N and Eb/N0 adds the processing gain', () => {
    const b = sceneBudget(base);
    expect(b.intercept.chipSnrDb).toBeCloseTo(b.intercept.sDbm - b.nDbm, 9);
    expect(b.intercept.ebN0Db).toBeCloseTo(b.intercept.chipSnrDb + b.gpDb, 9);
    expect(b.interceptLadder.find((s) => s.label === 'Chip SNR')!.db).toBeCloseTo(b.intercept.chipSnrDb, 9);
  });

  it('moving the intercept closer raises chip SNR by the path-loss difference', () => {
    const far = sceneBudget(base);
    const near = sceneBudget({ ...base, intercept: { ...base.intercept, xKm: 0.5, yKm: 0.2 } });
    const plFar = pathLossDb(50, base.tx, base.intercept, base.interceptPaths.fromTx).totalDb;
    const plNear = pathLossDb(50, base.tx, { ...base.intercept, xKm: 0.5, yKm: 0.2 }, base.interceptPaths.fromTx).totalDb;
    expect(near.intercept.chipSnrDb - far.intercept.chipSnrDb).toBeCloseTo(plFar - plNear, 9);
    expect(near.intercept.chipSnrDb).toBeGreaterThan(far.intercept.chipSnrDb);
  });
});
