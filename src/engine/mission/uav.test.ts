import { describe, expect, it } from 'vitest';
import { parseCommand } from './commands';
import { createMission, emissionsAt, issue, uavFixes, uavGaps, viewOf } from './mission';
import { runScript } from './script';
import { UAV_RULES as U, type MissionState, type PlayerSide } from './types';
import { unitById } from '../world';

const run = (s: MissionState, lines: string[]) => {
  for (const line of lines) {
    const m = /^(blue|red)>\s*(.*)$/.exec(line)!;
    const as = m[1] as PlayerSide;
    const p = parseCommand(m[2], as);
    if (!p.ok) throw new Error(`${line}: ${p.error}`);
    s = issue(s, p.command, as);
  }
  return s;
};

describe('mission 4: track the UAV', () => {
  const s = createMission(1234, 'uav');
  it('adds a Red UAV on its own telemetry net, with a seeded route', () => {
    const uav = unitById(s.world, 'r-uav')!;
    expect(uav.kind).toBe('drone');
    expect(uav.side).toBe('red');
    expect(uav.radio.powerW).toBe(U.linkW);
    expect(s.world.nets.find((n) => n.id === 'red-uav')?.memberIds).toEqual(['r-hq', 'r-uav']);
    expect(s.uav?.route).toHaveLength(U.waypoints);
    expect(s.humans).toEqual(['blue', 'red']);
    expect(createMission(99, 'uav').uav!.route).not.toEqual(s.uav!.route);
  });
  it('is silent on the ground and before launch', () => {
    const after = run(s, ['blue> wait 5']);
    expect(after.uav!.telemetry).toEqual([]);
    expect(emissionsAt(after, unitById(after.world, 'r-uav')!, 2)).toEqual([]);
  });
  it('flies the route after launch and forces a report every interval', () => {
    const after = run(s, ['red> uav: launch', 'red> wait 10']);
    const uav = after.uav!;
    expect(uav.launchedMin).toBe(0);
    expect(uav.nextWp).toBeGreaterThan(1);
    const forced = uav.telemetry.filter((t) => t.forced).map((t) => t.minute);
    expect(forced).toEqual([3, 6, 9]);
    expect(uav.telemetry.every((t) => t.delivered)).toBe(true);
    // Each report is a short burst: only a few of the minute's sweeps can catch it.
    const em = emissionsAt({ ...after, bursts: [{ minute: 3, unitId: 'r-uav', netId: 'red-uav', what: 'telemetry' }] }, unitById(after.world, 'r-uav')!, 3);
    expect(em).toHaveLength(1);
    expect(em[0].sweeps).toBe(Math.ceil((25 * U.burstSec) / 60));
  });
  it('burst reports now and moves the forced report', () => {
    const after = run(s, ['red> uav: launch', 'red> wait 1', 'red> uav: burst', 'red> wait 4']);
    expect(after.uav!.telemetry.map((t) => [t.minute, t.forced])).toEqual([
      [1, false],
      [4, true],
    ]);
  });
  it('holds at the next waypoint until resumed', () => {
    const held = run(s, ['red> uav: launch', 'red> uav: hold', 'red> wait 12']);
    expect(held.uav!.nextWp).toBe(0); // hold before the first leg keeps it on the ground
    expect(held.orders['r-uav']).toBeUndefined();
    const resumed = run(held, ['red> uav: resume', 'red> wait 2']);
    expect(resumed.uav!.nextWp).toBe(1);
  });
  it('refuses the UAV orders from the blue console and before launch', () => {
    const after = run(s, ['blue> uav: launch', 'red> uav: burst']);
    expect(after.uav!.launchedMin).toBeUndefined();
    const red = after.log.filter((e) => e.side === 'red' && e.kind === 'error').map((e) => e.text);
    expect(red.some((t) => /not airborne/.test(t))).toBe(true);
  });
  it('gives Blue one position fix per report heard from two sites, each scored on its own', () => {
    const after = run(s, ['red> uav: launch', ...Array.from({ length: 6 }, () => ['blue> sq1: df e 3', 'blue> sq2: df e 3', 'blue> sq3: df e 3', 'blue> uav: df e 3', 'blue> wait 3']).flat()]);
    const t = after.tracks.find((x) => x.emitterId === 'r-uav')!;
    expect(t.moving).toBe(true);
    expect(t.fixes!.length).toBeGreaterThan(0);
    for (const f of t.fixes!) {
      const same = t.bearings.filter((b) => b.heardMin === f.minute);
      expect(new Set(same.map((b) => b.sensorId)).size).toBeGreaterThanOrEqual(2);
      if (f.fix.cepKm < U.winCepKm) expect(f.fix.missKm).toBeLessThan(4);
    }
    expect(uavFixes(after)).toBe(t.fixes!.filter((f) => f.fix.cepKm < U.winCepKm).length);
    expect(uavGaps(after)).toBe(0);
  });
  it('resolves: Blue on fixes, Red on a flown route, draw on the clock', () => {
    const blue = run(s, ['red> uav: launch', ...Array.from({ length: 20 }, () => ['blue> sq1: df e 3', 'blue> sq2: df e 3', 'blue> sq3: df e 3', 'blue> uav: df e 3', 'blue> wait 3']).flat()]);
    expect(blue.winner).toBe('blue');
    expect(blue.status).toBe('won');
    const red = run(s, ['red> uav: power 0.1', 'red> uavlink: waveform dsss', 'red> uav: antenna toward hq', 'red> uav: launch', 'blue> wait 60']);
    expect(red.winner).toBe('red');
    expect(red.uav!.doneMin).toBeDefined();
    const draw = run(s, ['blue> wait 60']);
    expect(draw.winner).toBe('draw');
  });
  it('shows the route to Red and the umpire, not to Blue', () => {
    const after = run(s, ['red> uav: launch', 'red> wait 2']);
    expect(viewOf(after, 'red').plans.some((p) => p.unitId === 'r-uav')).toBe(true);
    expect(viewOf(after, 'blue', true).plans.some((p) => p.unitId === 'r-uav')).toBe(true);
    expect(viewOf(after, 'blue').plans.some((p) => p.unitId === 'r-uav')).toBe(false);
    expect(viewOf(after, 'blue').world.units.some((u) => u.id === 'r-uav')).toBe(false);
  });
  it('runs as a script with expect on the winner', () => {
    const { state, parseErrors } = runScript(['mission uav', 'seed 1234', 'red> uav: launch', 'blue> sq1: df e 3', 'blue> wait 4'].join('\n'));
    expect(parseErrors).toEqual([]);
    expect(state.mission).toBe('uav');
    expect(state.uav?.telemetry).toHaveLength(1);
  });
});
