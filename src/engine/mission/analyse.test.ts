import { describe, expect, it } from 'vitest';
import { axialToOffset } from '../hex';
import { unitById } from '../world';
import {
  analyseCoverage,
  analyseDetect,
  analyseExposure,
  analyseFix,
  analyseJs,
  analyseLink,
  analysePath,
  analysePredict,
  type Pos,
} from './analyse';
import { parseCommand } from './commands';
import { advance, createMission, issue } from './mission';
import type { MissionState, PlayerSide, Track } from './types';

const s = createMission(1234, 'duel');
const posOf = (st: MissionState, id: string): Pos => axialToOffset(unitById(st.world, id)!.pos);
const east = (p: Pos, cols: number): Pos => ({ col: p.col + cols, row: p.row });

describe('analyse', () => {
  it('link: blue own link returns quality and delivery status; a red unit id throws', () => {
    const r = analyseLink(s, 'blue', { netId: 'blue-cmd', a: 'b-hq', b: 'b-sq1' });
    expect(['good', 'marginal', 'bad', 'lost']).toContain(r.quality);
    expect(['on time', 'late', 'lost']).toContain(r.order.status);
    expect(Object.keys(r.snrDb)).toHaveLength(2);
    expect(() => analyseLink(s, 'blue', { netId: 'blue-cmd', a: 'b-hq', b: 'r-hq' })).toThrow('not your unit');
    expect(() => analyseLink(s, 'blue', { netId: 'red-cmd', a: 'b-hq', b: 'b-sq1' })).toThrow('not your net');
  });

  it('path: between two own units returns a finite loss', () => {
    const r = analysePath(s, 'blue', { from: posOf(s, 'b-hq'), to: posOf(s, 'b-sq1'), freqMHz: 60 });
    expect(Number.isFinite(r.totalLossDb)).toBe(true);
    expect(typeof r.lineOfSight).toBe('boolean');
    expect(() => analysePath(s, 'blue', { from: { col: -5, row: 0 }, to: posOf(s, 'b-sq1'), freqMHz: 60 })).toThrow('off the map');
  });

  it('coverage: own unit has hexesAbove and ten strongest; the matching hypothesis agrees', () => {
    const own = analyseCoverage(s, 'blue', { unit: 'b-hq' });
    expect(own.hexesAbove).toBeGreaterThan(0);
    expect(own.strongest).toHaveLength(10);
    expect(own).not.toHaveProperty('cells');
    const hyp = analyseCoverage(s, 'blue', { at: posOf(s, 'b-hq'), kind: 'hq', powerW: 50, antennaM: 10, freqMHz: 60 });
    expect(hyp.hexesAbove).toBe(own.hexesAbove);
    expect(analyseCoverage(s, 'blue', { unit: 'b-hq' }, { full: true }).cells!.length).toBeGreaterThan(own.hexesAbove);
  });

  it('detect: from b-sq2, a nearer hypothesis squad gives a higher pdPerSweep', () => {
    const at = posOf(s, 'b-sq2');
    const near = analyseDetect(s, 'blue', { sensor: 'b-sq2', at: east(at, 10), kind: 'squad' });
    const far = analyseDetect(s, 'blue', { sensor: 'b-sq2', at: east(at, 60), kind: 'squad' });
    expect(near.pdPerSweep).toBeGreaterThan(far.pdPerSweep);
    expect(near.pdPerMinute).toBeGreaterThanOrEqual(near.pdPerSweep);
  });

  it('js: blue EW team spot-jamming red-cmd gives positive J/S 1 km from the jammer', () => {
    const rx = east(posOf(s, 'b-ew'), 2);
    const tx = posOf(s, 'r-hq');
    const r = analyseJs(s, 'blue', { jammer: 'b-ew', mode: 'spot', netId: 'red-cmd', rx, tx });
    expect(r.jsDb).toBeGreaterThan(0);
    expect(r.fraction).toBeGreaterThan(0);
    expect(r.nearJammedShare).toBeGreaterThan(0);
    expect(() => analyseJs(s, 'blue', { jammer: 'b-ew', mode: 'spot', netId: 'red-cmd', rx })).toThrow('give tx');
    expect(unitById(s.world, 'b-ew')!.jammer!.mode).toBe('off');
  });

  it('fix: two sites 10 km apart at 90 degrees fix, a third lowers CEP, near-parallel gives none', () => {
    const a = { col: 60, row: 80 };
    const b = { col: 80, row: 80 };
    const bearings = [
      { sensorPos: a, bearingDeg: 45, sigmaDeg: 2 },
      { sensorPos: b, bearingDeg: 315, sigmaDeg: 2 },
    ];
    const r = analyseFix(s, 'blue', { bearings }, { add: { col: 70, row: 80 } });
    if (!r.fix) throw new Error('expected a fix');
    expect(r.fix.cepKm).toBeGreaterThan(0);
    expect(r.cepWithSite!).toBeLessThan(r.fix.cepKm);
    expect(r.fix).not.toHaveProperty('missKm');
    const par = analyseFix(s, 'blue', { bearings: [bearings[0], { sensorPos: b, bearingDeg: 47, sigmaDeg: 2 }] });
    expect(par.fix).toBeNull();
    expect(() => analyseFix(s, 'blue', { track: 'E9' })).toThrow('no track');
  });

  it('side limit: moving every red unit changes no blue result that takes no red positions', () => {
    const moved: MissionState = {
      ...s,
      world: { ...s.world, units: s.world.units.map((u) => (u.side === 'red' ? { ...u, pos: { q: u.pos.q + 7, r: u.pos.r + 3 } } : u)) },
    };
    const bearings = [
      { sensorPos: { col: 60, row: 80 }, bearingDeg: 45, sigmaDeg: 2 },
      { sensorPos: { col: 80, row: 80 }, bearingDeg: 315, sigmaDeg: 2 },
    ];
    const run = (st: MissionState) => [
      analysePath(st, 'blue', { from: posOf(s, 'b-hq'), to: posOf(s, 'b-sq1'), freqMHz: 60 }),
      analyseLink(st, 'blue', { netId: 'blue-cmd', a: 'b-hq', b: 'b-sq1' }),
      analyseCoverage(st, 'blue', { unit: 'b-hq' }),
      analyseDetect(st, 'blue', { sensor: 'b-sq1', at: east(posOf(s, 'b-sq1'), 10), kind: 'squad' }),
      analyseJs(st, 'blue', { jammer: 'b-ew', mode: 'spot', netId: 'red-cmd', rx: east(posOf(s, 'b-ew'), 2), tx: posOf(s, 'r-hq') }),
      analyseFix(st, 'blue', { bearings }, { add: { col: 70, row: 80 } }),
    ];
    expect(run(moved)).toEqual(run(s));
  });
});

const type = (st: MissionState, as: PlayerSide, line: string) => {
  const p = parseCommand(line, as);
  if (!p.ok) throw new Error(`${line}: ${p.error}`);
  return issue(st, p.command, as);
};

// Blue DF on Red's UAV for 15 minutes.
const uavRun = () => {
  let st = type(createMission(1234, 'uav'), 'red', 'uav: launch');
  for (let i = 0; i < 5; i++) {
    for (const u of ['sq1', 'sq2', 'sq3', 'uav']) st = type(st, 'blue', `${u}: df e 3`);
    st = advance(st, 3);
  }
  return st;
};

// A moving track heard on minutes 3, 6, 9, 12 and fixed three times, flying east at 2 hexes per 3 minutes.
const synthetic = (st: MissionState): MissionState => {
  const bearing = (heardMin: number) => ({
    emitterId: 'r-uav',
    signature: 'sig',
    sensorId: 'b-sq1',
    sensorPos: { q: 40, r: 40 },
    bearingDeg: 90,
    sigmaDeg: 2,
    measurements: 1,
    samples: [],
    minute: heardMin,
    heardMin,
  });
  const fix = (q: number) => ({ q, r: 40, cepKm: 1, ellipse: { aKm: 1, bKm: 1, angleRad: 0 }, missKm: 0 });
  const track: Track = {
    id: 'E1',
    emitterId: 'r-uav',
    signature: 'sig',
    bearings: [3, 6, 9, 12].map(bearing),
    moving: true,
    fixes: [
      { minute: 6, fix: fix(50) },
      { minute: 9, fix: fix(52) },
      { minute: 12, fix: fix(54) },
    ],
  };
  return { ...st, minute: 13, tracks: [track] };
};

describe('analyse: predict and exposure', () => {
  it('predict: a UAV Blue has heard gives its transmissions and, when it repeats, a period and next minute', () => {
    const st = uavRun();
    const t = st.tracks.find((x) => x.emitterId === 'r-uav');
    expect(t, 'Blue should hear the UAV in this setup; if a model change stops that, pick a setup where it does').toBeDefined();
    const r = analysePredict(st, 'blue', { track: t!.id });
    expect(r.transmissions.length).toBeGreaterThan(0);
    expect(r.basis).toContain('transmission');
    if (r.nextMinute !== undefined) expect(r.nextMinute).toBeGreaterThanOrEqual(st.minute);
  });

  it('predict: bearings at 3, 6, 9, 12 give period 3, next minute 15 and a point east of the last fix', () => {
    const st = synthetic(s);
    const r = analysePredict(st, 'blue', { track: 'E1' });
    expect(r.transmissions).toEqual([3, 6, 9, 12]);
    expect(r.period?.period).toBe(3);
    expect(r.nextMinute).toBe(15);
    expect(r.motion!.headingDeg).toBeGreaterThan(80);
    expect(r.motion!.headingDeg).toBeLessThan(100);
    const last = axialToOffset({ q: 54, r: 40 });
    expect(r.predictedAt!.col).toBeGreaterThan(last.col);
    expect(r.basis).toBe('4 transmissions, period 3 min; 3 fixes');
  });

  it('predict: a track with one bearing leaves out period, motion and prediction', () => {
    const st = synthetic(s);
    const lone: MissionState = { ...st, tracks: [{ ...st.tracks[0], bearings: [st.tracks[0].bearings[0]], fixes: undefined }] };
    const r = analysePredict(lone, 'blue', { track: 'E1' });
    expect(r).not.toHaveProperty('period');
    expect(r).not.toHaveProperty('nextMinute');
    expect(r).not.toHaveProperty('motion');
    expect(r).not.toHaveProperty('predictedAt');
  });

  it('predict: another side’s track id and an unknown id throw', () => {
    const st = synthetic(s);
    expect(() => analysePredict(st, 'red', { track: 'E1' })).toThrow('no track');
    expect(() => analysePredict(st, 'blue', { track: 'E99' })).toThrow('no track');
  });

  it('exposure: a hypothesis sensor 2 km from b-hq hears it better than one 40 km away', () => {
    const hq = posOf(s, 'b-hq');
    const km = s.world.map.hexSizeKm;
    const near = analyseExposure(s, 'blue', { sensors: [{ at: east(hq, Math.round(2 / km)), kind: 'squad' }] });
    const far = analyseExposure(s, 'blue', { sensors: [{ at: east(hq, Math.round(40 / km)), kind: 'squad' }] });
    const of = (r: ReturnType<typeof analyseExposure>) => r.units.find((u) => u.unit === 'b-hq')!.worst!;
    // Both saturate at 1 per minute on this map, so SNR is what separates them.
    expect(of(near).snrDb).toBeGreaterThan(of(far).snrDb);
    expect(of(near).pdPerMinute).toBeGreaterThanOrEqual(of(far).pdPerMinute);
    expect(near.units.every((u, i, a) => i === 0 || a[i - 1].worst!.pdPerMinute >= u.worst!.pdPerMinute)).toBe(true);
    expect(near.basis).toContain('1 sensor hypothesis');
    expect(of(near).pdPerMinute).toBeGreaterThanOrEqual(of(near).pdPerSweep);
  });

  it('exposure: no sensors and an empty picture lists every transmitter with worst null', () => {
    const r = analyseExposure(s, 'blue');
    expect(r.units.length).toBeGreaterThan(0);
    expect(r.units.every((u) => u.worst === null && u.sensors === 0)).toBe(true);
    expect(r.basis).toContain('no sensor hypotheses');
  });

  it('exposure: a fix in the picture becomes a squad hypothesis', () => {
    const st = synthetic(s);
    const r = analyseExposure(st, 'blue');
    expect(r.basis).toContain('1 sensor hypothesis');
    expect(r.units[0].worst).not.toBeNull();
  });

  it('side limit: moving every unit of the other side changes neither result', () => {
    const mv = (st: MissionState, side: PlayerSide): MissionState => ({
      ...st,
      world: { ...st.world, units: st.world.units.map((u) => (u.side === side ? { ...u, pos: { q: u.pos.q + 7, r: u.pos.r + 3 } } : u)) },
    });
    const base = synthetic(s);
    const run = (st: MissionState) => [
      analysePredict(st, 'blue', { track: 'E1' }),
      analyseExposure(st, 'blue'),
      analyseExposure(st, 'blue', { sensors: [{ at: east(posOf(s, 'b-hq'), 10), kind: 'squad' }] }),
    ];
    expect(run(mv(base, 'red'))).toEqual(run(base));
  });
});
