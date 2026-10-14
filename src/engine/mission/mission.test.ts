import { describe, expect, it } from 'vitest';
import { parseCommand } from './commands';
import { advance, createMission, issue, redActive, routeToHq, viewOf } from './mission';
import { MISSION_RULES as R, type MissionState } from './types';
import { allLinkBudgets, step, unitById } from '../world';
import { axialToOffset, offsetToAxial } from '../hex';

const run = (s: MissionState, lines: string[]) => {
  for (const line of lines) {
    const p = parseCommand(line);
    if (!p.ok) throw new Error(p.error);
    s = issue(s, p.command);
  }
  return s;
};

describe('mission: parser', () => {
  it('accepts every documented form', () => {
    for (const line of ['sq1: df e 5', 'SQ1 df east 5', 'uav: df 135 2', 'sq2: move 128,74', 'sq2 move 128 , 74', 'sq3: stop', 'wait 5', 'status', 'picture', 'help', 'reveal', 'next', 'step', 'back', 'exit']) {
      expect(parseCommand(line).ok, line).toBe(true);
    }
  });
  it('rejects malformed input with a reason', () => {
    for (const line of ['', 'sq9: df e 5', 'sq1: df up 5', 'sq1: df e', 'sq1: fly', 'wait', 'wait 2.5', 'uav: move here']) {
      const p = parseCommand(line);
      expect(p.ok, line).toBe(false);
      if (!p.ok) expect(p.error.length).toBeGreaterThan(5);
    }
  });
});

describe('mission: find the enemy', () => {
  const start = createMission(1234);

  it('starts at T+0 with Red hidden from the picture and its jammer off', () => {
    expect(start.minute).toBe(0);
    expect(start.tracks).toHaveLength(0);
    expect(unitById(start.world, 'r-ew')!.jammer).toEqual({ mode: 'off' });
  });

  it('Red radios transmit about 20% of minutes on a seeded, repeatable schedule', () => {
    let on = 0;
    for (let m = 0; m < 2000; m++) if (redActive(1234, 'r-hq', 'red-cmd', m)) on++;
    expect(on / 2000).toBeGreaterThan(0.15);
    expect(on / 2000).toBeLessThan(0.25);
    expect(redActive(1234, 'r-hq', 'red-cmd', 7)).toBe(redActive(1234, 'r-hq', 'red-cmd', 7));
  });

  it('a DF task hears nothing outside its sector', () => {
    // Everything Red is east of Blue; a westward sweep from Squad 1 must come back empty.
    const s = run(start, ['sq1: df w 10', 'wait 10']);
    expect(s.tracks).toHaveLength(0);
    expect(s.log.some((l) => /Nothing heard/.test(l.text))).toBe(true);
  });

  it('two bearings from different units fix an emitter, and the report path matters', () => {
    const s = run(start, ['sq1: df e 5', 'uav: df e 5', 'wait 5']);
    expect(s.minute).toBe(5);
    expect(s.tracks.length).toBeGreaterThan(0);
    const fixed = s.tracks.filter((t) => t.fix);
    expect(fixed.length).toBeGreaterThan(0);
    for (const t of fixed) expect(t.bearings.map((b) => b.sensorId)).toEqual(expect.arrayContaining(['b-sq1', 'b-uav']));
    // Every sensor could reach HQ, so nothing is held.
    expect(s.held).toHaveLength(0);
    for (const u of s.world.units.filter((x) => x.side === 'blue' && (x.kind === 'squad' || x.kind === 'drone'))) {
      expect(routeToHq(s, u.id, allLinkBudgets(s.world)).ok).toBe(true);
    }
  });

  it('longer tasks give smaller bearing errors, down to the site error', () => {
    const short = run(start, ['sq1: df e 2', 'wait 2']);
    const long = run(start, ['sq1: df e 20', 'wait 20']);
    const sigma = (s: MissionState, id: string) => s.tracks.find((t) => t.emitterId === id)?.bearings[0].sigmaDeg;
    const common = short.tracks.map((t) => t.emitterId).filter((id) => sigma(long, id) !== undefined);
    expect(common.length).toBeGreaterThan(0);
    for (const id of common) {
      expect(sigma(long, id)!).toBeLessThanOrEqual(sigma(short, id)!);
      expect(sigma(long, id)!).toBeGreaterThanOrEqual(R.siteErrorDeg);
    }
  });

  it('a seeded mission replays identically', () => {
    const a = run(createMission(77), ['sq1: df e 5', 'sq3: df ne 5', 'wait 5', 'uav: df e 3', 'wait 3']);
    const b = run(createMission(77), ['sq1: df e 5', 'sq3: df ne 5', 'wait 5', 'uav: df e 3', 'wait 3']);
    expect(a.tracks).toEqual(b.tracks);
    expect(a.log).toEqual(b.log);
  });

  it('moves take time, follow the rules, and the drone stays within control range', () => {
    const sq = unitById(start.world, 'b-sq2')!;
    const { col, row } = axialToOffset(sq.pos);
    const s = run(start, [`uav: move ${col + 20},${row}`, 'wait 20']);
    const uav = unitById(s.world, 'b-uav')!;
    expect(s.log.some((l) => /within 5 km/.test(l.text))).toBe(true);
    expect(axialToOffset(uav.pos).col).toBeLessThan(col + 20);
  });

  it('ends when the time limit is reached, and reveals Red only on request', () => {
    const s = advance(start, 60);
    expect(s.status).toBe('lost');
    expect(s.minute).toBe(60);
    expect(s.log.filter((l) => /^Reveal:/.test(l.text))).toHaveLength(0);
    expect(issue(s, { type: 'reveal' }).log.filter((l) => /^Reveal:/.test(l.text)).length).toBeGreaterThan(0);
    const after = issue(s, { type: 'wait', minutes: 1 });
    expect(after.minute).toBe(60);
  });

  it('can be won by fixing three emitters under 1 km', () => {
    // Spread the sensors out, then sweep from three places for long enough.
    let s = run(start, ['sq1: df e 15', 'sq3: df e 15', 'uav: df e 15', 'sq2: df e 15', 'wait 15']);
    if (s.status !== 'won') s = run(s, ['sq1: df se 15', 'sq3: df ne 15', 'uav: df e 15', 'sq2: df e 15', 'wait 15']);
    const good = s.tracks.filter((t) => t.fix && t.fix.cepKm < R.winCepKm).length;
    expect(good).toBeGreaterThanOrEqual(R.fixesToWin);
    expect(s.status).toBe('won');
  });
});

describe('mission: reporting over the radio net', () => {
  it('holds a report while the route to HQ is lost and delivers it when the link recovers', () => {
    let s = createMission(1234);
    // Blue's own jammer parked on the Blue command net denies every squad's path to HQ.
    s = { ...s, world: step(s.world, [{ type: 'setJammer', unitId: 'b-ew', config: { mode: 'spot', targetNetId: 'blue-cmd' } }]).world };
    s = run(s, ['sq1: df e 5', 'wait 5']);
    expect(s.held).toHaveLength(1);
    expect(s.tracks).toHaveLength(0);
    expect(s.log.some((l) => /Report held: no link to HQ/.test(l.text))).toBe(true);
    s = { ...s, world: step(s.world, [{ type: 'setJammer', unitId: 'b-ew', config: { mode: 'off' } }]).world };
    s = run(s, ['wait 1']);
    expect(s.held).toHaveLength(0);
    expect(s.tracks.length).toBeGreaterThan(0);
  });
});

describe('mission: silent sortie', () => {
  const start = createMission(1234);
  const sq2 = axialToOffset(unitById(start.world, 'b-sq2')!.pos);

  it('parses the sortie order and rejects it for non-drones and beyond endurance', () => {
    expect(parseCommand('uav: sortie 130,74 e 5').ok).toBe(true);
    expect(parseCommand('uav: sortie 130 , 74 90 5').ok).toBe(true);
    expect(parseCommand('uav: sortie e 5').ok).toBe(false);
    const s1 = run(start, ['sq1: sortie 130,74 e 5']);
    expect(s1.log.at(-1)!.text).toMatch(/Only the UAV/);
    const s2 = run(start, [`uav: sortie ${sq2.col + 60},${sq2.row} e 5`]);
    expect(s2.log.at(-1)!.text).toMatch(/endurance/);
  });

  it('flies beyond the tether, listens on station, returns, and only then reports', () => {
    const target = { col: sq2.col + 16, row: sq2.row }; // 8 km east, beyond the 5 km linked range; 12 min each way at 40 km/h
    let s = run(start, [`uav: sortie ${target.col},${target.row} e 4`]);
    expect(s.orders['b-uav']?.kind).toBe('sortie');
    expect(unitById(s.world, 'b-uav')!.controlRangeKm).toBeUndefined();
    // Cannot be re-tasked while out.
    const refused = run(s, ['uav: stop']);
    expect(refused.log.at(-1)!.text).toMatch(/silent sortie/);
    s = run(s, ['wait 12']); // 16 hexes at 0.75 min = 12 min out
    const o = s.orders['b-uav'];
    expect(o?.kind === 'sortie' && o.phase).toBe('df');
    expect(unitById(s.world, 'b-uav')!.pos).toEqual(offsetToAxial(target.col, target.row));
    expect(s.tracks).toHaveLength(0); // nothing reported yet
    s = run(s, ['wait 4']);
    expect(s.orders['b-uav'] && (s.orders['b-uav'] as { phase: string }).phase).toBe('back');
    expect(s.tracks).toHaveLength(0);
    s = run(s, ['wait 13']);
    expect(s.orders['b-uav']).toBeUndefined();
    expect(unitById(s.world, 'b-uav')!.controlRangeKm).toBe(5);
    expect(s.log.some((l) => /back from sortie \(1 leg\), handed over/.test(l.text))).toBe(true);
    // Bearings carry the on-station position, not the drone's home position.
    const uavBearings = s.tracks.flatMap((t) => t.bearings).filter((b) => b.sensorId === 'b-uav');
    expect(uavBearings.length).toBeGreaterThan(0);
    for (const b of uavBearings) expect(b.sensorPos).toEqual(offsetToAxial(target.col, target.row));
  });
});

describe('mission: multi-leg sortie', () => {
  const start = createMission(1234);
  const sq2 = axialToOffset(unitById(start.world, 'b-sq2')!.pos);

  it('parses legs, including transit-only ones', () => {
    const p = parseCommand('uav: sortie 130,74 e 4; 140,90; 125,85 s 2');
    expect(p.ok).toBe(true);
    if (p.ok && p.command.type === 'sortie') {
      expect(p.command.legs.map((l) => l.minutes)).toEqual([4, 0, 2]);
      expect(p.command.legs[1].centreDeg).toBeUndefined();
    }
    expect(parseCommand('uav: sortie 130,74 e 4; up 3').ok).toBe(false);
  });

  it('listens on each leg and fixes an emitter from the drone alone, reported only on return', () => {
    const a = { col: sq2.col + 6, row: sq2.row - 6 }; // two stations 6 km apart, both looking east, inside 30 min endurance
    const b = { col: sq2.col + 6, row: sq2.row + 6 };
    let s = run(start, [`uav: sortie ${a.col},${a.row} e 3; ${b.col},${b.row} e 3`]);
    expect(s.orders['b-uav']?.kind).toBe('sortie');
    s = run(s, ['wait 20']);
    expect(s.tracks).toHaveLength(0); // still out
    s = run(s, ['wait 15']);
    expect(s.orders['b-uav']).toBeUndefined();
    expect(s.log.some((l) => /back from sortie \(2 legs\)/.test(l.text))).toBe(true);
    const uavTracks = s.tracks.filter((t) => t.bearings.every((x) => x.sensorId === 'b-uav'));
    const positions = new Set(uavTracks.flatMap((t) => t.bearings).map((x) => `${x.sensorPos.q},${x.sensorPos.r}`));
    expect(positions.size).toBe(2); // bearings from both stations
    expect(uavTracks.some((t) => t.fix)).toBe(true); // crossing bearings from one drone give a fix
  });
});

describe('mission: reveal and replay', () => {
  it('opens at T+0 and steps through events; asked early, it ends the mission first', () => {
    let s = createMission(1234);
    expect(run(s, ['next']).log.at(-1)!.text).toMatch(/Type reveal first/);
    const early = run(s, ['reveal']);
    expect(early.status).toBe('ended');
    expect(early.replay).toEqual({ minute: 0 });
    s = run(s, ['sq1: df e 15', 'sq2: df e 15', 'sq3: df e 15', 'uav: df e 15', 'wait 15']);
    expect(s.status).toBe('won');
    // The end does not reveal Red by itself.
    expect(s.log.some((l) => /^Reveal:/.test(l.text))).toBe(false);
    expect(s.history).toHaveLength(16); // T+0 .. T+15
    s = run(s, ['reveal']);
    expect(s.log.filter((l) => /^Reveal:/.test(l.text)).length).toBeGreaterThan(0);
    expect(s.replay).toEqual({ minute: 0 });
    const at0 = viewOf(s);
    expect(at0.tracks).toHaveLength(0);
    expect(at0.dimUnitIds!.size).toBe(s.world.units.filter((u) => u.side === 'red').length);
    s = run(s, ['next']);
    expect(s.replay!.minute).toBe(15); // the only event minute: reports landed at T+15
    const at15 = viewOf(s);
    expect(at15.tracks.length).toBeGreaterThan(0);
    expect(at15.dimUnitIds!.size).toBeLessThan(at0.dimUnitIds!.size);
    s = run(s, ['back']);
    expect(s.replay!.minute).toBe(14);
    s = run(s, ['step', 'next']);
    expect(s.replay!.minute).toBe(15);
    expect(s.log.at(-1)!.text).toMatch(/End of the replay/);
    s = run(s, ['exit']);
    expect(s.replay).toBeUndefined();
    expect(viewOf(s).tracks).toEqual(s.tracks);
  });

  it('replays Blue where it stood at that minute', () => {
    let s = createMission(1234);
    const sq = axialToOffset(unitById(s.world, 'b-sq1')!.pos);
    s = run(s, [`sq1: move ${sq.col + 4},${sq.row}`, 'wait 60', 'reveal']);
    expect(viewOf(s).world.units.find((u) => u.id === 'b-sq1')!.pos).toEqual(offsetToAxial(sq.col, sq.row));
    s = run(s, ['next']);
    expect(viewOf(s).world.units.find((u) => u.id === 'b-sq1')!.pos).not.toEqual(offsetToAxial(sq.col, sq.row));
  });
});

describe('mission: trails', () => {
  it('records where a unit has been, and the replay shows only the part flown so far', () => {
    let s = createMission(1234);
    expect(viewOf(s).trails).toHaveLength(0);
    const sq2 = axialToOffset(unitById(s.world, 'b-sq2')!.pos);
    s = run(s, [`uav: sortie ${sq2.col + 8},${sq2.row} e 2`, 'wait 20']);
    const live = viewOf(s).trails.find((t) => t.unitId === 'b-uav')!;
    expect(live.kind).toBe('drone');
    expect(live.points.length).toBeGreaterThan(5);
    expect(live.points.at(-1)).toEqual(unitById(s.world, 'b-uav')!.pos);
    s = run(s, ['reveal', 'step', 'step', 'step']);
    const replay = viewOf(s).trails.find((t) => t.unitId === 'b-uav')!;
    expect(replay.points.length).toBeLessThan(live.points.length);
    expect(replay.points.length).toBeGreaterThan(1);
  });
});
