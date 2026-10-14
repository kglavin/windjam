import { describe, expect, it } from 'vitest';
import { parseCommand } from './commands';
import { createMission, issue, viewOf } from './mission';
import { runScript } from './script';
import { HUNT_RULES as H, type MissionState, type PlayerSide } from './types';
import { unitById } from '../world';
import { hexDistanceKm } from '../rf';

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

describe('mission 5: UAV hunt', () => {
  const s = createMission(1234, 'hunt');
  it('has an HQ and a UAV per side, far apart, and nothing else', () => {
    expect(s.world.units.map((u) => u.id).sort()).toEqual(['b-hq', 'b-uav', 'r-hq', 'r-uav']);
    expect(s.world.nets.map((n) => n.id).sort()).toEqual(['blue-uav', 'red-uav']);
    const km = hexDistanceKm(s.world.map, unitById(s.world, 'b-hq')!.pos, unitById(s.world, 'r-hq')!.pos);
    expect(km).toBeGreaterThan(50);
    expect(s.limitMin).toBe(H.limitMin);
    expect(s.humans).toEqual(['blue', 'red']);
    expect(s.blueUav?.side).toBe('blue');
    expect(s.uav?.side).toBe('red');
    expect(s.blueUav?.landsWhenDone).toBe(false);
  });
  it('takes a route from either console, flies it after launch, and loiters at the end', () => {
    const after = run(s, ['blue> uav: route 70,80; 75,80', 'blue> uav: launch', 'red> uav: route 190,80', 'red> uav: launch', 'blue> wait 20']);
    expect(after.blueUav!.nextWp).toBe(2);
    expect(after.blueUav!.doneMin).toBeUndefined(); // loitering, not landed
    expect(after.uav!.launchedMin).toBe(0);
    expect(after.blueUav!.telemetry.filter((t) => t.forced).map((t) => t.minute)).toEqual([5, 10, 15]); // the T+20 report is in the next tick
    const resumed = run(after, ['blue> uav: route 80,80', 'blue> wait 2']);
    expect(resumed.blueUav!.nextWp).toBe(1);
    expect(resumed.orders['b-uav']?.kind).toBe('move');
  });
  it('delivers the UAV’s bearings with its report, from where it took them', () => {
    const after = run(s, ['blue> uav: route 120,80', 'blue> uav: launch', 'red> uav: route 140,80', 'red> uav: launch', 'blue> wait 25']);
    const t = after.tracks.find((x) => x.emitterId === 'r-uav');
    expect(t).toBeDefined();
    const fromUav = t!.bearings.filter((b) => b.sensorId === 'b-uav');
    expect(fromUav.length).toBeGreaterThan(0);
    for (const b of fromUav) {
      expect(b.heardMin).toBeDefined();
      expect(b.minute).toBeGreaterThan(b.heardMin!); // came down with a later report
    }
    expect(new Set(fromUav.map((b) => `${b.sensorPos.q},${b.sensorPos.r}`)).size).toBeGreaterThan(1); // taken from different places
  });
  it('is won by the UAV that hears the other’s report from close by', () => {
    const after = run(s, ['blue> uav: route 120,80; 150,70; 170,90', 'blue> uav: launch', 'red> uav: route 130,80; 100,90; 80,70', 'red> uav: power 0.3', 'red> uav: launch', 'blue> wait 60']);
    expect(after.found).toBeDefined();
    expect(after.found!.km).toBeLessThanOrEqual(H.interceptKm);
    expect(after.winner).toBe(after.found!.mutual ? 'draw' : after.found!.by); // same-minute reports find each other
    expect(after.status).not.toBe('running');
  });
  it('draws at the limit when neither finds the other', () => {
    const after = run(s, ['blue> wait 180']);
    expect(after.winner).toBe('draw');
  });
  it('hides each side’s UAV from the other on the map', () => {
    const after = run(s, ['blue> uav: launch', 'red> uav: launch', 'blue> wait 1']);
    expect(viewOf(after, 'blue').world.units.some((u) => u.id === 'r-uav')).toBe(false);
    expect(viewOf(after, 'red').world.units.some((u) => u.id === 'b-uav')).toBe(false);
    expect(viewOf(after, 'blue', true).world.units.length).toBe(4);
  });
  it('runs as a script', () => {
    const { state, parseErrors } = runScript(['mission hunt', 'seed 1234', 'blue> uav: route 70,80', 'blue> uav: launch', 'red> status', 'blue> wait 6'].join('\n'));
    expect(parseErrors).toEqual([]);
    expect(state.blueUav?.telemetry).toHaveLength(1);
  });
});
