import { describe, expect, it } from 'vitest';
import { hexDistance, hexEquals, hexLine, offsetToAxial, axialToOffset, hexKey } from './hex';
import { createRng } from './rng';
import { generateMap } from './map';
import {
  fsplDb,
  knifeEdgeLossDb,
  noiseFloorDbm,
  twoRayBreakpointKm,
  twoRayLossDb,
  wattsToDbm,
  ruralNoiseFigureDb,
  manMadeNoiseFigureDb,
  fresnelRadiusM,
  hexDistanceKm,
} from './rf';
import { coverageMap, jsCoverageMap } from './coverage';
import { type DetectOptions, bearingDeg, bearingSigmaDeg, cepFromSigmas, detectEmitters, fixFromBearings, detectionProbability, marcumQ1, sensorsOf, thresholdFromPfa } from './detect';
import { packetErrorRate } from './timeliness';
import { type ScopeSource, type TraceSetup, bfskSymbol, hopChannel, scopeSources, traceSample } from './scope';
import { createScenario } from './scenario';
import { activeHops, allLinkBudgets, allLinks, step, twoHopBer, unitById } from './world';
import { BER_DENIED, RX_P1DB_DBM, SYNC_DUTY, bandOverlapDb, berNoncoherentBfsk, followerDelayUs, processingGainDb, qualityFromBer, sumDbm } from './ew';
import type { JammerConfig, Waveform } from './units';
import { TERRAIN, canEnter } from './terrain';

describe('hex', () => {
  it('measures distance in hex steps', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -1 })).toBe(3);
  });

  it('draws a contiguous line including both endpoints', () => {
    const line = hexLine({ q: 0, r: 0 }, { q: 4, r: -2 });
    expect(line).toHaveLength(5);
    expect(line[0]).toEqual({ q: 0, r: 0 });
    expect(line[4]).toEqual({ q: 4, r: -2 });
    for (let i = 1; i < line.length; i++) expect(hexDistance(line[i - 1], line[i])).toBe(1);
  });

  it('round-trips offset and axial coordinates', () => {
    for (const [col, row] of [[0, 0], [5, 3], [31, 19]]) {
      expect(axialToOffset(offsetToAxial(col, row))).toEqual({ col, row });
    }
  });
});

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('map', () => {
  it('generates the same map for the same seed', () => {
    expect(generateMap(7)).toEqual(generateMap(7));
  });

  it('gives every seed the same terrain mix', () => {
    for (const seed of [1, 99, 4242]) {
      const tiles = Object.values(generateMap(seed).tiles);
      const share = (t: string) => tiles.filter((x) => x.terrain === t).length / tiles.length;
      expect(share('water')).toBeCloseTo(0.1, 1);
      expect(share('mountain')).toBeCloseTo(0.1, 1);
    }
  });

  it('places neighbours one hexSizeKm apart', () => {
    const map = generateMap(1);
    expect(hexDistanceKm(map, { q: 0, r: 0 }, { q: 0, r: 1 })).toBeCloseTo(1, 9);
    expect(hexDistanceKm(map, { q: 0, r: 0 }, { q: 1, r: 0 })).toBeCloseTo(1, 9);
  });
});

describe('rf', () => {
  it('free-space loss matches the textbook value (1 km, 100 MHz = 72.44 dB)', () => {
    expect(fsplDb(1, 100)).toBeCloseTo(72.44, 2);
  });

  it('two-ray and free-space loss are equal at the breakpoint', () => {
    const d = twoRayBreakpointKm(10, 2, 60);
    expect(twoRayLossDb(d, 10, 2)).toBeCloseTo(fsplDb(d, 60), 1);
  });

  it('knife-edge loss is about 6 dB at grazing incidence and 0 when clear', () => {
    expect(knifeEdgeLossDb(0)).toBeCloseTo(6.0, 1);
    expect(knifeEdgeLossDb(-1)).toBe(0);
  });

  it('computes power and noise floor in dBm', () => {
    expect(wattsToDbm(1)).toBeCloseTo(30, 9);
    expect(noiseFloorDbm(25, 6)).toBeCloseTo(-174 + 43.98 + 6, 2);
  });

  it('first Fresnel zone radius: 60 MHz, midpoint of 8 km is about 100 m, zero at the ends', () => {
    expect(fresnelRadiusM(60, 4000, 4000)).toBeCloseTo(99.9, 0);
    expect(fresnelRadiusM(60, 0, 8000)).toBe(0);
  });

  it('adds external noise to receiver noise', () => {
    expect(ruralNoiseFigureDb(60)).toBeCloseTo(17.95, 1);
    // External noise far above receiver noise dominates the floor.
    expect(noiseFloorDbm(25, 6, 30)).toBeCloseTo(-174 + 43.98 + 30, 0);
  });
});

describe('coverage', () => {
  const map = generateMap(1234);
  const origin = offsetToAxial(16, 10);
  const tx = { pos: origin, powerW: 5, antennaHeightM: 2, gainDbi: 0, freqMHz: 60 };
  const rx = { antennaHeightM: 2, gainDbi: 0 };

  it('covers every hex and is strongest at the transmitter', () => {
    const cov = coverageMap(map, tx, rx);
    expect(Object.keys(cov)).toHaveLength(Object.keys(map.tiles).length);
    const max = Math.max(...Object.values(cov).map((c) => c.rxDbm));
    expect(cov[hexKey(origin)].rxDbm).toBe(max);
  });

  it('adds 10 dB everywhere for 10x the power', () => {
    const a = coverageMap(map, tx, rx);
    const b = coverageMap(map, { ...tx, powerW: 50 }, rx);
    for (const k of Object.keys(a)) expect(b[k].rxDbm - a[k].rxDbm).toBeCloseTo(10, 9);
  });
});

describe('J/S coverage', () => {
  const world = createScenario(1234);
  const hq = unitById(world, 'r-hq')!;
  const net = world.nets.find((n) => n.id === 'red-cmd')!;
  const tx = { pos: hq.pos, powerW: hq.radio.powerW, antennaHeightM: hq.radio.antennaHeightM, gainDbi: hq.radio.gainDbi, freqMHz: net.freqMHz };
  const rx = { antennaHeightM: 2, gainDbi: 0 };
  const jam = (config: JammerConfig) => ({ ...unitById(world, 'b-ew')!, jammer: config });

  it('spot on a hopping net is 33.6 dB weaker on average than parking on one channel suggests', () => {
    const cells = jsCoverageMap(world.map, tx, rx, jam({ mode: 'spot', targetNetId: 'red-cmd' }), net, world.nets);
    for (const c of Object.values(cells)) {
      expect(c.fraction).toBeCloseTo(1 / 2320, 9);
      expect(c.avgJsDb - c.jsDb).toBeCloseTo(10 * Math.log10(1 / 2320), 6);
    }
  });

  it('follower hit fraction depends on where the receiver is', () => {
    const cells = jsCoverageMap(world.map, tx, rx, jam({ mode: 'follower', targetNetId: 'red-cmd' }), { ...net, waveform: { kind: 'fh', hopsPerSec: 1000 } }, world.nets);
    const fractions = Object.values(cells).map((c) => c.fraction);
    expect(Math.max(...fractions) - Math.min(...fractions)).toBeGreaterThan(0.05);
  });

  it('an idle jammer gives no J/S anywhere', () => {
    const cells = jsCoverageMap(world.map, tx, rx, jam({ mode: 'off' }), net, world.nets);
    for (const c of Object.values(cells)) expect(c.avgJsDb).toBe(-Infinity);
  });
});

const OPTS: DetectOptions = { pfa: 1e-3, noiseEnv: 'rural', limiter: false, seed: 1 };

describe('detection (notes section 2)', () => {
  it('Marcum Q with no signal is the false-alarm probability', () => {
    for (const pfa of [1e-1, 1e-3, 1e-6]) expect(marcumQ1(0, thresholdFromPfa(pfa))).toBeCloseTo(pfa, 12);
  });

  it('matches the textbook point: Pfa 1e-6, Pd 0.9 needs about 13.2 dB', () => {
    expect(detectionProbability(13.2, 1e-6)).toBeCloseTo(0.9, 1);
  });

  it('Pd rises with SNR and with Pfa, and falls to Pfa with no signal', () => {
    expect(detectionProbability(5, 1e-3)).toBeLessThan(detectionProbability(10, 1e-3));
    expect(detectionProbability(8, 1e-6)).toBeLessThan(detectionProbability(8, 1e-2));
    expect(detectionProbability(-60, 1e-3)).toBeCloseTo(1e-3, 6);
  });

  it('Pd never falls as SNR rises, up to strong signals', () => {
    // The tail integral used to under-resolve the peak at high SNR: 0.995 at 55 dB, below the value at 15 dB.
    let prev = 0;
    for (let snr = -10; snr <= 80; snr += 1) {
      const pd = detectionProbability(snr, 1e-3);
      expect(pd).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = pd;
    }
    expect(detectionProbability(55, 1e-3)).toBeCloseTo(1, 9);
  });

  const world = createScenario(1234);
  it('Blue sensors are its squads and the drone in control range', () => {
    expect(sensorsOf(world.units, 'blue', world.map).map((u) => u.id).sort()).toEqual(['b-sq1', 'b-sq2', 'b-sq3', 'b-uav']);
  });

  it('keeps the drone within control range of its squad', () => {
    const sq = unitById(world, 'b-sq2')!;
    const far = Object.values(world.map.tiles).find((t) => hexDistanceKm(world.map, t.hex, sq.pos) > 6)!.hex;
    const near = Object.values(world.map.tiles).find((t) => {
      const km = hexDistanceKm(world.map, t.hex, sq.pos);
      return km > 1 && km < 4 && t.terrain === 'water';
    });
    expect(step(world, [{ type: 'moveUnit', unitId: 'b-uav', to: far }]).rejected[0].reason).toMatch(/within 5 km/);
    if (near) expect(step(world, [{ type: 'moveUnit', unitId: 'b-uav', to: near.hex }]).rejected).toHaveLength(0);
  });

  it('a silent jammer is invisible; a transmitting one is detected', () => {
    const silent = detectEmitters(world.map, world.units, world.nets, 'blue', OPTS);
    expect(silent.emitters.find((e) => e.emitterId === 'r-ew')).toBeUndefined();
    const loud = step(world, [{ type: 'setJammer', unitId: 'r-ew', config: { mode: 'spot', targetNetId: 'blue-cmd' } }]).world;
    const r = detectEmitters(loud.map, loud.units, loud.nets, 'blue', OPTS);
    expect(r.emitters.find((e) => e.emitterId === 'r-ew')!.pd).toBeGreaterThan(0.9);
  });

  it('expected false alarms per sweep is Pfa times 2320 channels', () => {
    expect(detectEmitters(world.map, world.units, world.nets, 'blue', OPTS).falseAlarmsPerSweep).toBeCloseTo(2.32, 9);
  });

  it('setPfa changes only that side', () => {
    const w = step(world, [{ type: 'setPfa', side: 'blue', pfa: 1e-6 }]).world;
    expect(w.esPfa).toEqual({ blue: 1e-6, red: 1e-3 });
  });
});

describe('T6: noise environment and intercept', () => {
  const world = createScenario(1234);
  const report = (patch: Partial<typeof OPTS>) => detectEmitters(world.map, world.units, world.nets, 'blue', { ...OPTS, ...patch });

  it('urban man-made noise is 9.6 dB above rural', () => {
    expect(manMadeNoiseFigureDb(60, 'urban') - manMadeNoiseFigureDb(60, 'rural')).toBeCloseTo(9.6, 6);
  });

  it('impulsive urban noise multiplies false alarms unless a limiter is fitted, which costs 2 dB', () => {
    expect(report({ noiseEnv: 'urban' }).effectivePfa).toBeCloseTo(30e-3, 12);
    expect(report({ noiseEnv: 'urban', limiter: true }).effectivePfa).toBeCloseTo(1e-3, 12);
    const plain = report({}).emitters.find((e) => e.emitterId === 'r-hq')!;
    const limited = report({ limiter: true }).emitters.find((e) => e.emitterId === 'r-hq')!;
    expect(plain.best!.snrDb - limited.best!.snrDb).toBeCloseTo(2, 6);
  });

  it('a hopper is caught on about 63% of sweeps; a fast hopper also loses energy per look', () => {
    const slow = step(world, [{ type: 'setWaveform', netId: 'red-squad', waveform: { kind: 'fh', hopsPerSec: 100 } }]).world;
    const r = detectEmitters(slow.map, slow.units, slow.nets, 'blue', OPTS);
    const look = r.emitters.find((e) => e.emitterId === 'r-sq1')!.looks.find((l) => l.emission.includes('Squad Net'));
    if (look) expect(look.pd).toBeLessThanOrEqual(1 - (1 - 1 / 2320) ** 2320 + 1e-9);
    const fixedSnr = detectEmitters(world.map, world.units, world.nets, 'blue', OPTS).emitters.find((e) => e.emitterId === 'r-hq')!;
    const fast = step(world, [{ type: 'setWaveform', netId: 'red-cmd', waveform: { kind: 'fh', hopsPerSec: 32000 } },
      { type: 'setWaveform', netId: 'red-retrans', waveform: { kind: 'fh', hopsPerSec: 32000 } }]).world;
    const fastSnr = detectEmitters(fast.map, fast.units, fast.nets, 'blue', OPTS).emitters.find((e) => e.emitterId === 'r-hq')!;
    expect(fixedSnr.best!.snrDb - fastSnr.best!.snrDb).toBeCloseTo(10 * Math.log10(1000 / (1e6 / 32000)), 1);
  });
});

describe('T7: DSSS', () => {
  const world = createScenario(1234);
  const dsss = { kind: 'dsss' as const, chipRateMcps: 5 };

  it('processing gain is spread bandwidth over data rate: 5 MHz / 16 kbps = 24.9 dB', () => {
    expect(processingGainDb({ ...world.nets[0], waveform: dsss })).toBeCloseTo(24.95, 1);
  });

  it('despreading buys the processing gain against the same spot jammer', () => {
    const cmd = (w: typeof world) => allLinkBudgets(w).find((v) => v.link.id === 'blue-cmd:b-hq-b-sq1')!.budget.forward;
    const jamCmd = { type: 'setJammer' as const, unitId: 'r-ew', config: { mode: 'spot' as const, targetNetId: 'blue-cmd' } };
    const fixed = cmd(step(world, [jamCmd]).world);
    const spread = cmd(step(world, [{ type: 'setWaveform', netId: 'blue-cmd', waveform: dsss }, jamCmd]).world);
    // Jamming dominates both, so the gain in Eb/(N0+J0) is the processing gain less the extra noise from 5 MHz of bandwidth.
    expect(spread.ebN0Db - fixed.ebN0Db).toBeGreaterThan(20);
  });

  it('a DSSS emitter puts only 25 kHz / 5 MHz of its power in a search channel (low probability of detection)', () => {
    const before = detectEmitters(world.map, world.units, world.nets, 'red', OPTS).emitters.find((e) => e.emitterId === 'b-hq')!;
    const w = step(world, [{ type: 'setWaveform', netId: 'blue-cmd', waveform: dsss }]).world;
    const after = detectEmitters(w.map, w.units, w.nets, 'red', OPTS).emitters.find((e) => e.emitterId === 'b-hq')!;
    // Same sensor in both cases: several sensors can reach Pd 1, so the best look may switch sensor.
    const sensor = before.best!.sensorId;
    const snrAfter = after.looks.find((l) => l.sensorId === sensor)!.snrDb;
    expect(before.best!.snrDb - snrAfter).toBeCloseTo(23, 0);
  });

  it('a smart sync jammer loses whole packets and radiates 15 dB less on average than spot', () => {
    const sync = step(world, [{ type: 'setJammer', unitId: 'r-ew', config: { mode: 'sync', targetNetId: 'blue-cmd' } }]).world;
    const spot = step(world, [{ type: 'setJammer', unitId: 'r-ew', config: { mode: 'spot', targetNetId: 'blue-cmd' } }]).world;
    const lost = allLinkBudgets(sync).filter((v) => v.link.netId === 'blue-cmd').map((v) => v.budget.forward.states.lost);
    expect(Math.max(...lost)).toBe(1);
    // Same sensor in both cases: the strongest look.
    const pow = (w: typeof world) => Math.max(...detectEmitters(w.map, w.units, w.nets, 'blue', OPTS).emitters.find((e) => e.emitterId === 'r-ew')!.looks.map((l) => l.snrDb));
    expect(pow(spot) - pow(sync)).toBeCloseTo(-10 * Math.log10(SYNC_DUTY), 6);
  });
});

describe('T8: direction finding', () => {
  const world = createScenario(1234);
  it('bearings are clockwise from north', () => {
    const o = offsetToAxial(100, 80);
    expect(bearingDeg(world.map, o, offsetToAxial(110, 80))).toBeCloseTo(90, 6);
    expect(bearingDeg(world.map, o, offsetToAxial(100, 70))).toBeCloseTo(0, 0);
  });

  it('bearing error shrinks with SNR to a 2 degree floor', () => {
    expect(bearingSigmaDeg(0)).toBeCloseTo(20, 6);
    expect(bearingSigmaDeg(10)).toBeCloseTo(6.32, 2);
    expect(bearingSigmaDeg(40)).toBe(2);
  });

  it('two or more bearings fix an emitter close to its true position', () => {
    const r = detectEmitters(world.map, world.units, world.nets, 'blue', OPTS);
    const fixed = r.emitters.filter((e) => e.fix);
    expect(fixed.length).toBeGreaterThan(0);
    for (const e of fixed) {
      expect(e.bearings.length).toBeGreaterThanOrEqual(2);
      // Within a few sigma along the ellipse's long axis, plus half a hex for hex-centre positions.
      expect(e.fix!.missKm).toBeLessThan(3.5 * e.fix!.ellipse.aKm + 0.5);
    }
  });
});

describe('T9: jamming techniques', () => {
  const world = createScenario(1234);
  const hit = (config: JammerConfig, waveform: Waveform = { kind: 'fh', hopsPerSec: 100 }) => {
    const w = step(world, [
      { type: 'setWaveform', netId: 'red-cmd', waveform },
      { type: 'setJammer', unitId: 'b-ew', config },
    ]).world;
    return allLinkBudgets(w).find((v) => v.link.id === 'red-cmd:r-hq-r-sq2')!.budget.forward.jammers.find((c) => c.jammerId === 'b-ew')!;
  };

  it('partial-band hits the share of hops it covers, with power concentrated by 1/ρ', () => {
    const c = hit({ mode: 'partial', targetNetId: 'red-cmd', bandFraction: 0.25 });
    expect(c.fraction).toBeCloseTo(0.25, 6);
    expect(c.bandOverlapDb).toBeCloseTo(10 * Math.log10(0.025 / (58 * 0.25)), 6);
  });

  it('multitone with q tones hits q of 2320 hops at 1/q power each', () => {
    const c = hit({ mode: 'multitone', tones: 20 });
    expect(c.fraction).toBeCloseTo(20 / 2320, 9);
    expect(c.bandOverlapDb).toBeCloseTo(-10 * Math.log10(20), 6);
  });

  it('pulse jamming a fixed net hits duty k of the time at 1/k peak power', () => {
    const c = hit({ mode: 'pulse', targetNetId: 'red-cmd', dutyCycle: 0.1 }, { kind: 'fixed' });
    expect(c.fraction).toBeCloseTo(0.1, 9);
    expect(c.bandOverlapDb).toBeCloseTo(10, 6);
  });

  it('a swept tone crosses each channel for 25 kHz / 58 MHz of the sweep', () => {
    expect(hit({ mode: 'swept' }, { kind: 'fixed' }).fraction).toBeCloseTo(0.025 / 58, 9);
  });

  it('a powerful jammer next to a receiver overloads its front end on every net, even off-channel', () => {
    const rx = unitById(world, 'r-sq2')!;
    const nextTo = Object.values(world.map.tiles).find(
      (t) => hexDistanceKm(world.map, t.hex, rx.pos) > 0 && hexDistanceKm(world.map, t.hex, rx.pos) < 0.6 && !world.units.some((u) => hexEquals(u.pos, t.hex)),
    )!.hex;
    // A 5 kW jammer parked on Blue's own retrans channel, a hex away from Red Squad 2.
    const w = {
      ...world,
      units: world.units.map((u) =>
        u.id === 'b-ew' ? { ...u, pos: nextTo, radio: { ...u.radio, powerW: 5000 }, jammer: { mode: 'spot' as const, targetNetId: 'blue-retrans' } } : u,
      ),
    };
    const fwd = allLinkBudgets(w).find((v) => v.link.id === 'red-squad:r-sq1-r-sq2')!.budget.forward;
    const c = fwd.jammers.find((x) => x.jammerId === 'b-ew')!;
    expect(c.frontEndDbm).toBeGreaterThan(RX_P1DB_DBM);
    expect(c.fraction).toBe(0); // nothing lands in the channel itself
    expect(fwd.states.lost).toBe(1);
  });
});

describe('T10: timeliness', () => {
  it('packet error rate from BER for 1024-bit packets', () => {
    expect(packetErrorRate(0)).toBe(0);
    expect(packetErrorRate(1e-3)).toBeCloseTo(1 - 0.999 ** 1024, 12);
  });

  it('clean links deliver orders on time; jammed ones go late or are lost', () => {
    const world = createScenario(1234);
    const clean = allLinkBudgets(world).find((v) => v.link.id === 'blue-cmd:b-hq-b-sq1')!;
    expect(clean.order.status).toBe('on time');
    expect(clean.order.latencyS).toBeCloseTo(32 * (1024 / 16000 + 0.05), 3);
    const jammed = step(world, [{ type: 'setJammer', unitId: 'r-ew', config: { mode: 'spot', targetNetId: 'blue-cmd' } }]).world;
    const v = allLinkBudgets(jammed).find((x) => x.link.id === 'blue-cmd:b-hq-b-sq1')!;
    expect(v.order.status).not.toBe('on time');
  });

  it('expected transmissions follow the truncated geometric series', () => {
    const world = createScenario(1234);
    const v = allLinkBudgets(world)[0];
    const h = v.order.hops[0];
    expect(h.expectedTransmissions).toBeCloseTo((1 - h.per ** 8) / (1 - h.per || 1), 9);
  });
});

describe('scope (time-resolved view agrees with the link budget)', () => {
  const base = createScenario(1234);
  const setupFor = (w: typeof base, linkId: string) => {
    const v = allLinkBudgets(w).find((x) => x.link.id === linkId)!;
    const d = v.budget.forward; // a -> b
    const net = w.nets.find((n) => n.id === v.link.netId)!;
    const jam = scopeSources(w, v.link.bId).filter((s) => s.role === 'jammer');
    return { d, setup: { net, signalDbm: d.rxPowerDbm, noiseDbm: d.noiseFloorDbm }, jam };
  };
  const share = (setup: TraceSetup, jam: ScopeSource[], spanUs: number, n: number) => {
    let hits = 0;
    for (let i = 0; i < n; i++) if (Number.isFinite(traceSample(setup, jam, (i + 0.5) * (spanUs / n)).jammingDbm)) hits++;
    return hits / n;
  };

  it('a follower lands in the channel for the same share of each dwell the budget predicts', () => {
    const w = step(base, [{ type: 'setJammer', unitId: 'b-ew', config: { mode: 'follower', targetNetId: 'red-cmd' } }]).world;
    const { d, setup, jam } = setupFor(w, 'red-cmd:r-hq-r-sq2');
    const predicted = d.jammers.find((c) => c.jammerId === 'b-ew')!.fraction;
    expect(share(setup, jam, 2e6, 20000)).toBeCloseTo(predicted, 1);
  });

  it('pulse gating matches the duty cycle', () => {
    const w = step(base, [
      { type: 'setWaveform', netId: 'red-cmd', waveform: { kind: 'fixed' } },
      { type: 'setJammer', unitId: 'b-ew', config: { mode: 'pulse', targetNetId: 'red-cmd', dutyCycle: 0.2 } },
    ]).world;
    const { setup, jam } = setupFor(w, 'red-cmd:r-hq-r-sq2');
    expect(share(setup, jam, 1e5, 10000)).toBeCloseTo(0.2, 2);
  });

  it('hop sequences are deterministic and cover the channels', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 20000; i++) seen.add(hopChannel(42, i, 2320));
    expect(hopChannel(42, 7, 2320)).toBe(hopChannel(42, 7, 2320));
    expect(seen.size).toBeGreaterThan(2000);
  });

  it('BFSK detector errors match 0.5·exp(-Eb/2N0)', () => {
    const rng = createRng(9);
    let errors = 0;
    const n = 40000;
    for (let i = 0; i < n; i++) {
      const s = bfskSymbol(6, rng);
      if (s.space > s.mark) errors++;
    }
    expect(errors / n).toBeCloseTo(berNoncoherentBfsk(6), 2);
  });
});

describe('ew', () => {
  it('dilutes barrage power across the band (25 kHz of 58 MHz = -33.65 dB)', () => {
    expect(bandOverlapDb({ lowMHz: 30, highMHz: 88 }, { lowMHz: 44.9875, highMHz: 45.0125 })).toBeCloseTo(-33.65, 2);
    expect(bandOverlapDb({ lowMHz: 30, highMHz: 31 }, { lowMHz: 45, highMHz: 46 })).toBe(-Infinity);
  });

  it('sums powers in dBm', () => {
    expect(sumDbm([0, 0])).toBeCloseTo(3.01, 2);
    expect(sumDbm([-100, -Infinity])).toBeCloseTo(-100, 9);
    expect(sumDbm([])).toBe(-Infinity);
  });

  it('noncoherent BFSK BER: 0.5 at no signal, 1e-3 near 10.9 dB', () => {
    expect(berNoncoherentBfsk(-100)).toBeCloseTo(0.5, 6);
    expect(berNoncoherentBfsk(10 * Math.log10(2 * Math.log(500)))).toBeCloseTo(1e-3, 9);
  });

  it('maps BER to the notes regimes', () => {
    expect(qualityFromBer(1e-4)).toBe('good');
    expect(qualityFromBer(1e-2)).toBe('degraded');
    expect(qualityFromBer(BER_DENIED)).toBe('denied');
  });
});

describe('world', () => {
  const world = createScenario(1234);

  it('places every unit on a distinct hex of open ground', () => {
    const keys = new Set(world.units.map((u) => hexKey(u.pos)));
    expect(keys.size).toBe(world.units.length);
    for (const u of world.units) {
      expect(TERRAIN[world.map.tiles[hexKey(u.pos)].terrain].access).toBe('all');
    }
  });

  it('builds hub and mesh links', () => {
    const links = allLinks(world);
    expect(links.filter((l) => l.netId === 'blue-cmd')).toHaveLength(4);
    expect(links.filter((l) => l.netId === 'red-squad')).toHaveLength(3);
  });

  it('computes an unjammed budget for every link when the jammer is off', () => {
    for (const { budget } of allLinkBudgets(world)) {
      expect(Number.isFinite(budget.forward.sinrDb)).toBe(true);
      expect(budget.jammed).toBe(false);
    }
  });

  it('spot jamming hits only the target net', () => {
    const { world: jammed } = step(world, [
      { type: 'setJammer', unitId: 'b-ew', config: { mode: 'spot', targetNetId: 'red-cmd' } },
    ]);
    const views = allLinkBudgets(jammed);
    expect(views.filter((v) => v.link.netId === 'red-cmd').every((v) => v.budget.jammed)).toBe(true);
    expect(views.filter((v) => v.link.netId !== 'red-cmd').some((v) => v.budget.jammed)).toBe(false);
  });

  it('barrage jamming also hits friendly nets in the band (fratricide)', () => {
    const { world: jammed } = step(world, [{ type: 'setJammer', unitId: 'b-ew', config: { mode: 'barrage' } }]);
    const views = allLinkBudgets(jammed);
    expect(views.filter((v) => v.link.netId === 'blue-cmd').every((v) => v.budget.jammed)).toBe(true);
  });

  it('spot puts more jamming into the channel than barrage from the same spot', () => {
    const spot = step(world, [{ type: 'setJammer', unitId: 'b-ew', config: { mode: 'spot', targetNetId: 'red-cmd' } }]).world;
    const barrage = step(world, [{ type: 'setJammer', unitId: 'b-ew', config: { mode: 'barrage' } }]).world;
    const j = (w: typeof world) => allLinkBudgets(w).find((v) => v.link.netId === 'red-cmd')!.budget.forward.jammingDbm;
    expect(j(spot) - j(barrage)).toBeCloseTo(33.65, 1);
  });

  it('lets relays and EW teams onto mountains but not squads', () => {
    expect(canEnter('mountain', 'relay')).toBe(true);
    expect(canEnter('mountain', 'jammer')).toBe(true);
    expect(canEnter('mountain', 'squad')).toBe(false);
    expect(canEnter('water', 'relay')).toBe(false);
    const peak = Object.values(world.map.tiles).find((t) => t.terrain === 'mountain')!.hex;
    expect(step(world, [{ type: 'moveUnit', unitId: 'b-relay', to: peak }]).rejected).toHaveLength(0);
    const r = step(world, [{ type: 'moveUnit', unitId: 'b-sq1', to: peak }]).rejected;
    expect(r).toHaveLength(1);
    expect(r[0].reason).toMatch(/mountain/);
  });

  it('retrans nets add no links of their own', () => {
    expect(allLinks(world).some((l) => l.netId === 'blue-retrans')).toBe(false);
  });

  it('combines hop BERs: a bit must survive both', () => {
    expect(twoHopBer(0, 0)).toBe(0);
    expect(twoHopBer(0.1, 0.1)).toBeCloseTo(0.19, 9);
    expect(twoHopBer(0.5, 0)).toBe(0.5);
  });

  it('routes over the relay only when direct is not good and the relay is better', () => {
    const squads = allLinkBudgets(world).filter((v) => v.link.netId === 'blue-cmd' && v.link.bId !== 'b-relay');
    expect(squads).toHaveLength(3);
    for (const v of squads) {
      expect(v.relay).toBeDefined();
      const expectRelay = v.budget.quality !== 'good' && v.relay!.ber < v.budget.ber;
      expect(v.route).toBe(expectRelay ? 'relay' : 'direct');
      expect(v.ber).toBe(expectRelay ? v.relay!.ber : v.budget.ber);
      expect(activeHops(v)).toHaveLength(v.route === 'relay' ? 2 : 1);
    }
    // The HQ-relay link itself is not relayed.
    expect(allLinkBudgets(world).find((v) => v.link.bId === 'b-relay')!.relay).toBeUndefined();
  });

  it('spot jamming the retrans net hits only the squad-to-relay hop', () => {
    const { world: jammed } = step(world, [
      { type: 'setJammer', unitId: 'b-ew', config: { mode: 'spot', targetNetId: 'blue-retrans' } },
    ]);
    for (const v of allLinkBudgets(jammed).filter((x) => x.relay && x.link.netId === 'blue-cmd')) {
      expect(v.relay!.memberHop.jammed).toBe(true);
      expect(v.relay!.hubHop.jammed).toBe(false);
      expect(v.budget.jammed).toBe(false);
    }
  });

  // Frequency hopping and the follower race (notes section 6).
  const redCmd = (w: typeof world) => allLinkBudgets(w).filter((v) => v.link.netId === 'red-cmd' && v.link.bId !== 'r-relay');
  const withJam = (config: JammerConfig, waveform?: Waveform) =>
    step(world, [
      ...(waveform ? [{ type: 'setWaveform' as const, netId: 'red-cmd', waveform }] : []),
      { type: 'setJammer', unitId: 'b-ew', config },
    ]).world;

  it('spot jamming a hopping net hits only 1 of 2320 hop channels', () => {
    const w = withJam({ mode: 'spot', targetNetId: 'red-cmd' });
    for (const v of redCmd(w)) {
      for (const c of v.budget.forward.jammers) expect(c.fraction).toBeCloseTo(1 / 2320, 6);
    }
  });

  it('barrage hits every hop of a hopping net', () => {
    const w = withJam({ mode: 'barrage' });
    for (const v of redCmd(w)) {
      const c = v.budget.forward.jammers.find((x) => x.jammerId === 'b-ew')!;
      expect(c.fraction).toBe(1);
      expect(c.bandOverlapDb).toBeCloseTo(-33.65, 1);
    }
  });

  it('follower covers most of a slow-hop dwell and none of a fast-hop dwell', () => {
    const slow = withJam({ mode: 'follower', targetNetId: 'red-cmd' }, { kind: 'fh', hopsPerSec: 100 });
    for (const v of redCmd(slow)) {
      const c = v.budget.forward.jammers.find((x) => x.jammerId === 'b-ew')!;
      expect(c.fraction).toBeGreaterThan(0.9); // 10 ms dwell, under 1 ms delay
      expect(c.bandOverlapDb).toBe(0); // full power on the current hop
    }
    const fast = withJam({ mode: 'follower', targetNetId: 'red-cmd' }, { kind: 'fh', hopsPerSec: 32000 });
    for (const v of redCmd(fast)) {
      const c = v.budget.forward.jammers.find((x) => x.jammerId === 'b-ew')!;
      expect(c.fraction).toBe(0); // 31 µs dwell is over before the jammer reacts
      expect(v.budget.forward.jamFraction).toBe(0);
    }
  });

  it('follower delay includes the extra propagation distance', () => {
    const tx = unitById(world, 'r-hq')!;
    const rx = unitById(world, 'r-sq1')!;
    const j = unitById(world, 'b-ew')!;
    const extraKm = hexDistanceKm(world.map, tx.pos, j.pos) + hexDistanceKm(world.map, j.pos, rx.pos) - hexDistanceKm(world.map, tx.pos, rx.pos);
    expect(followerDelayUs(world.map, tx, j, rx, 500)).toBeCloseTo(500 + extraKm / 0.299792458, 6);
  });

  it('averages BER over clear and jammed dwells', () => {
    const w = withJam({ mode: 'follower', targetNetId: 'red-cmd' }, { kind: 'fh', hopsPerSec: 1000 });
    for (const v of redCmd(w)) {
      const d = v.budget.forward;
      const clear = berNoncoherentBfsk(d.snrDb + 10 * Math.log10(25 / 16));
      const jammed = berNoncoherentBfsk(d.ebN0Db);
      expect(d.ber).toBeCloseTo((1 - d.jamFraction) * clear + d.jamFraction * jammed, 12);
    }
  });

  it('rejects bad waveforms and follower without a target', () => {
    const { rejected } = step(world, [
      { type: 'setWaveform', netId: 'red-cmd', waveform: { kind: 'fh', hopsPerSec: 0 } },
      { type: 'setJammer', unitId: 'b-ew', config: { mode: 'follower' } },
    ]);
    expect(rejected).toHaveLength(2);
  });

  it('gives Red a relay and an EW team', () => {
    expect(unitById(world, 'r-ew')!.jammer).toEqual({ mode: 'off' });
    const relayed = allLinkBudgets(world).filter((v) => v.link.netId === 'red-cmd' && v.relay);
    expect(relayed.length).toBe(3);
  });

  it('rejects jammer commands on units without a jammer, and spot without a target', () => {
    const { rejected } = step(world, [
      { type: 'setJammer', unitId: 'b-hq', config: { mode: 'barrage' } },
      { type: 'setJammer', unitId: 'b-ew', config: { mode: 'spot' } },
    ]);
    expect(rejected).toHaveLength(2);
  });

  it('applies valid moves without mutating the input and rejects invalid ones', () => {
    const sq = unitById(world, 'b-sq2')!;
    const hq = unitById(world, 'b-hq')!;
    const { world: next, rejected } = step(world, [
      { type: 'moveUnit', unitId: 'b-sq2', to: hq.pos },
    ]);
    expect(rejected).toHaveLength(1);
    expect(unitById(next, 'b-sq2')!.pos).toEqual(sq.pos);
    expect(next.tick).toBe(world.tick + 1);
    expect(world.tick).toBe(0);
  });
});

describe('CEP', () => {
  it('is 1.1774 sigma for a circular error and 0.6745 sigma for a line', () => {
    expect(cepFromSigmas(1, 1)).toBeCloseTo(Math.sqrt(2 * Math.log(2)), 3);
    expect(cepFromSigmas(2, 0)).toBeCloseTo(0.6745 * 2, 2);
  });
  it('lies between the two limits and grows with both sigmas', () => {
    const c = cepFromSigmas(2, 0.5);
    expect(c).toBeGreaterThan(0.6745 * 2);
    expect(c).toBeLessThan(1.1774 * 2);
    expect(cepFromSigmas(2, 1)).toBeGreaterThan(c);
  });
});

describe('fix geometry guards', () => {
  const map = generateMap(1234);
  const o = offsetToAxial(100, 80);
  it('refuses to fix from bearings taken at one place (they meet at the sensor itself)', () => {
    expect(fixFromBearings(map, [{ sensorPos: o, bearingDeg: 90, sigmaDeg: 2 }, { sensorPos: o, bearingDeg: 95, sigmaDeg: 2 }])).toBeUndefined();
  });
  it('refuses near-parallel bearings and accepts crossing ones', () => {
    const p = offsetToAxial(100, 90);
    expect(fixFromBearings(map, [{ sensorPos: o, bearingDeg: 90, sigmaDeg: 2 }, { sensorPos: p, bearingDeg: 91, sigmaDeg: 2 }])).toBeUndefined();
    expect(fixFromBearings(map, [{ sensorPos: o, bearingDeg: 120, sigmaDeg: 2 }, { sensorPos: p, bearingDeg: 60, sigmaDeg: 2 }])).toBeDefined();
  });
});
