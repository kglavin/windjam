import { describe, expect, it } from 'vitest';
import { axialToOffset } from '../hex';
import { unitById } from '../world';
import { analyseCoverage, analyseDetect, analyseFix, analyseJs, analyseLink, analysePath, type Pos } from './analyse';
import { createMission } from './mission';
import type { MissionState } from './types';

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
