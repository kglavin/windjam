import { describe, expect, it } from 'vitest';
import { bearingDeg } from '../detect';
import { unitById } from '../world';
import { parseCommand } from './commands';
import { advance, createMission, issue, siteErrorDeg, unitStatusLines, writeReport } from './mission';
import type { DfAccumulator, MissionEvent, MissionState } from './types';

const type = (s: MissionState, line: string) => {
  const p = parseCommand(line, 'blue');
  if (!p.ok) throw new Error(`${line}: ${p.error}`);
  return issue(s, p.command, 'blue');
};

const captures = (s: MissionState, sensorId: string, emitterId: string) =>
  s.events.filter((e): e is Extract<MissionEvent, { kind: 'capture' }> => e.kind === 'capture' && e.sensorId === sensorId && e.emitterId === emitterId);

const diff = (a: number, b: number) => ((a - b + 540) % 360) - 180;
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

const dfRun = (seed: number, minutes = 20) => advance(type(createMission(seed, 'duel'), `sq1: df e ${minutes}`), minutes + 2);

describe('bearings: what a unit measures', () => {
  it('the reported bearing is the weighted circular mean of the unit’s capture bearings', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = dfRun(seed);
      for (const track of s.tracks) {
        for (const b of track.bearings.filter((x) => x.sensorId === 'b-sq1')) {
          const caps = captures(s, 'b-sq1', b.emitterId);
          expect(caps.length).toBeGreaterThan(0);
          // a capture's sigma is sigma_sweep / sqrt(n), so its weight n / sigma_sweep² is 1 / sigma²
          const sin = caps.reduce((a, c) => a + Math.sin(rad(c.bearingDeg)) / c.sigmaDeg ** 2, 0);
          const cos = caps.reduce((a, c) => a + Math.cos(rad(c.bearingDeg)) / c.sigmaDeg ** 2, 0);
          expect(Math.abs(diff(b.bearingDeg, (deg(Math.atan2(sin, cos)) + 360) % 360))).toBeLessThan(1e-6);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 30000); // six missions played for 22 minutes each: slow under parallel load

  it('the circular mean is right across north', () => {
    const acc = (degs: number[]): DfAccumulator => ({
      emitterId: 'r-sq1',
      signature: 'x',
      trueBearingDeg: 0,
      sumSin: degs.reduce((a, d) => a + Math.sin(rad(d)), 0),
      sumCos: degs.reduce((a, d) => a + Math.cos(rad(d)), 0),
      weight: degs.length,
      measurements: degs.length,
      samples: [],
    });
    const s = createMission(1, 'duel');
    const sensor = unitById(s.world, 'b-sq1')!;
    const [a] = writeReport(s, sensor, sensor.pos, [acc([359, 1])]).bearings;
    expect(Math.abs(diff(a.bearingDeg, 0))).toBeLessThan(1e-6);
    expect(a.bearingDeg).toBeGreaterThanOrEqual(0);
    expect(a.bearingDeg).toBeLessThan(360);
    const [b] = writeReport(s, sensor, sensor.pos, [acc([350, 20])]).bearings;
    expect(Math.abs(diff(b.bearingDeg, 5))).toBeLessThan(1e-6);
  });

  it('over 30 seeds the reported error is consistent with the reported sigma', () => {
    let within = 0;
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = dfRun(seed, 5);
      const sensor = unitById(s.world, 'b-sq1')!;
      for (const b of s.tracks.flatMap((t) => t.bearings).filter((x) => x.sensorId === 'b-sq1')) {
        const truth = bearingDeg(s.world.map, sensor.pos, unitById(s.world, b.emitterId)!.pos);
        total++;
        if (Math.abs(diff(b.bearingDeg, truth)) <= 2 * b.sigmaDeg) within++;
      }
    }
    expect(total).toBeGreaterThanOrEqual(80);
    expect(within / total).toBeGreaterThanOrEqual(0.85); // 2 sigma covers 0.95 of a gaussian; measured 0.989 on these seeds
    expect(within / total).toBeLessThanOrEqual(1);
  }, 30000);

  it('the site error is fixed for a (seed, sensor, emitter) across calls and turns', () => {
    const e = siteErrorDeg(7, 'b-sq1', 'r-sq1');
    expect(siteErrorDeg(7, 'b-sq1', 'r-sq1')).toBe(e);
    expect(siteErrorDeg(8, 'b-sq1', 'r-sq1')).not.toBe(e);
    expect(siteErrorDeg(7, 'b-sq2', 'r-sq1')).not.toBe(e);
    expect(siteErrorDeg(7, 'b-sq1', 'r-sq2')).not.toBe(e);
    const s = advance(type(createMission(7, 'duel'), 'sq1: df e 20'), 10);
    expect(s.seed).toBe(7);
    expect(siteErrorDeg(s.seed, 'b-sq1', 'r-sq1')).toBe(e);
  });

  it('captures of one emitter by one sensor centre on truth plus the site error', () => {
    const s = advance(type(createMission(11, 'duel'), 'sq1: df e 40'), 40);
    const sensor = unitById(s.world, 'b-sq1')!;
    const ids = new Set(s.events.flatMap((e) => (e.kind === 'capture' && e.sensorId === 'b-sq1' ? [e.emitterId] : [])));
    expect(ids.size).toBeGreaterThan(0);
    for (const emitterId of ids) {
      const caps = captures(s, 'b-sq1', emitterId);
      const truth = bearingDeg(s.world.map, sensor.pos, unitById(s.world, emitterId)!.pos);
      const site = siteErrorDeg(s.seed, 'b-sq1', emitterId);
      const mean = caps.reduce((a, c) => a + diff(c.bearingDeg, truth), 0) / caps.length;
      expect(Math.abs(mean - site)).toBeLessThan(4 * Math.max(...caps.map((c) => c.sigmaDeg)));
    }
  });

  it('unitStatusLines shows the bearing and sigma of each capture', () => {
    const s = dfRun(3);
    const heard = unitStatusLines(s, 'b-sq1', 0).filter((l) => / heard /.test(l));
    expect(heard.length).toBeGreaterThan(0);
    for (const l of heard) expect(l).toMatch(/, SNR -?\d+ dB, bearing \d+° ± \d+\.\d°$/);
  });
});
