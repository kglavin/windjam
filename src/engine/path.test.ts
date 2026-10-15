import { describe, expect, it } from 'vitest';
import { hexDistance, hexNeighbors, hexKey } from './hex';
import { getTile } from './map';
import { createMission, routeToHq } from './mission/mission';
import { findPath } from './path';
import { createScenario } from './scenario';
import { canEnter } from './terrain';
import { allLinkBudgets, unitAt, unitById } from './world';

describe('ground pathfinding', () => {
  const world = createScenario(4242);
  it('routes a squad around terrain it cannot enter and other units', () => {
    const sq = unitById(world, 'b-sq3')!;
    const target = { q: sq.pos.q + 8, r: sq.pos.r - 4 };
    const path = findPath(world, sq.id, target);
    expect(path).toBeDefined();
    expect(path![path!.length - 1]).toEqual(target);
    let prev = sq.pos;
    for (const h of path!) {
      expect(hexDistance(prev, h)).toBe(1);
      expect(canEnter(getTile(world.map, h)!.terrain, 'squad')).toBe(true);
      expect(unitAt(world, h)).toBeUndefined();
      prev = h;
    }
  });
  it('refuses an impassable or occupied destination', () => {
    const sq = unitById(world, 'b-sq1')!;
    const mountain = Object.values(world.map.tiles).find((t) => t.terrain === 'mountain')!;
    expect(findPath(world, sq.id, mountain.hex)).toBeUndefined();
    expect(findPath(world, sq.id, unitById(world, 'b-hq')!.pos)).toBeUndefined();
  });
  it('is at least as short as the straight line when the straight line is clear', () => {
    const sq = unitById(world, 'b-sq2')!;
    const target = hexNeighbors(sq.pos)[0];
    const path = findPath(world, sq.id, target);
    expect(path).toHaveLength(1);
  });
});

describe('starting links', () => {
  it('every squad and relay can reach its HQ at T+0, whatever the seed', () => {
    for (const seed of [1234, 4242, 7, 31337, 99, 2024, 555, 8080]) {
      const s = createMission(seed, 'uav');
      const links = allLinkBudgets(s.world);
      const cut = s.world.units.filter((u) => u.kind === 'squad' || u.kind === 'relay').filter((u) => !routeToHq(s, u.id, links).ok).map((u) => `${seed}:${u.id}`);
      expect(cut).toEqual([]);
    }
  }, 30000); // eight full worlds: slow when several agents run the suite at once
  it('keeps units on ground they may stand on, one per hex, with drones inside control range', () => {
    const w = createScenario(4242);
    const seen = new Set<string>();
    for (const u of w.units) {
      expect(canEnter(getTile(w.map, u.pos)!.terrain, u.kind), u.id).toBe(true);
      expect(seen.has(hexKey(u.pos)), u.id).toBe(false);
      seen.add(hexKey(u.pos));
    }
    const uav = unitById(w, 'b-uav')!;
    const parent = unitById(w, uav.parentId!)!;
    expect(hexDistance(uav.pos, parent.pos) * w.map.hexSizeKm).toBeLessThanOrEqual(uav.controlRangeKm!);
  });
});
