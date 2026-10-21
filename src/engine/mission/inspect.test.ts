/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../lab/levels';
import { LESSONS, bearingOrigin, crossingDeg, fixBuildUp, minuteEvents, movingFix, movingMinutes, ordersAffecting } from './inspect';
import { issue, viewOf, worldAt } from './mission';
import { runScript } from './script';

const scripts = import.meta.glob('../../../missions/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const text = (name: string) => scripts[Object.keys(scripts).find((k) => k.endsWith(name))!];

// Mission 1 played by script 01, then revealed: a won game with tracks, captures and reports to inspect.
const won = () => issue(runScript(text('01-two-squads-triangulate.txt')).state, { type: 'reveal' }, 'blue');

describe('the minute', () => {
  it('groups a minute by emitter: transmissions, who heard them, the picture they changed', () => {
    const s = won();
    const minutes = [...new Set(s.events.map((e) => e.minute))];
    const withCaptures = minutes.filter((m) => s.events.some((e) => e.kind === 'capture' && e.minute === m));
    expect(withCaptures.length).toBeGreaterThan(0);
    const v = minuteEvents(s, withCaptures[0] + 1, 'blue');
    expect(v.groups.length).toBeGreaterThan(0);
    for (const g of v.groups) {
      for (const c of g.captures) expect(c.emitterId).toBe(g.emitterId);
      for (const e of g.emits) expect(e.unitId).toBe(g.emitterId);
    }
    // A minute with a report: it is listed, and the orders typed that minute come from the log.
    const reportMinute = s.events.find((e) => e.kind === 'report')!.minute;
    expect(minuteEvents(s, reportMinute + 1, 'blue').reports.length).toBeGreaterThan(0);
    // The console reports that minute's events at the end of it: the fix the log announces at T+m is in the T+m view.
    const fixLine = s.log.find((e) => e.kind === 'hq' && /fixed/.test(e.text))!;
    expect(minuteEvents(s, fixLine.minute, 'blue').groups.some((g) => g.tracks.some((t) => t.cepKm !== undefined))).toBe(true);
    const orderMinute = s.log.find((e) => e.kind === 'order')!.minute;
    expect(minuteEvents(s, orderMinute, 'blue').orders.every((e) => e.kind === 'order' && e.minute === orderMinute)).toBe(true);
  });
});

describe('the fix', () => {
  it('builds up one bearing at a time: a wedge, then a crossing, then an ellipse that tightens', () => {
    const s = won();
    const track = s.tracks.find((t) => t.fix && t.bearings.length >= 3)!;
    const truth = s.world.units.find((u) => u.id === track.emitterId)!.pos;
    const one = fixBuildUp(s.world.map, track, 1, truth);
    expect(one.used).toHaveLength(1);
    expect(one.fix).toBeUndefined();
    const two = fixBuildUp(s.world.map, track, 2, truth);
    expect(two.crossingDeg).toBeGreaterThan(0);
    expect(two.crossingDeg).toBeLessThanOrEqual(90);
    const all = fixBuildUp(s.world.map, track, 99, truth);
    expect(all.used).toHaveLength(track.bearings.length);
    expect(all.fix!.cepKm).toBeCloseTo(track.fix!.cepKm, 6);
    expect(Number.isFinite(all.fix!.missKm)).toBe(true);
    if (two.fix) expect(all.fix!.cepKm).toBeLessThanOrEqual(two.fix.cepKm + 1e-9);
  });

  it('crossing angles fold to 0..90', () => {
    expect(crossingDeg(10, 100)).toBe(90);
    expect(crossingDeg(350, 20)).toBe(30);
    expect(crossingDeg(45, 225)).toBe(0);
  });

  it('a moving track is fixed minute by minute', () => {
    // Script 10: Blue fixes Red's UAV twice from its HQ and UAV hearing the same burst.
    const s = issue(runScript(text('10-uav-hunt.txt')).state, { type: 'reveal' }, 'blue');
    const track = s.tracks.find((t) => t.moving && t.fixes?.length)!;
    expect(track).toBeDefined();
    const minutes = movingMinutes(track);
    expect(minutes.length).toBeGreaterThan(0);
    const m = track.fixes![track.fixes!.length - 1].minute;
    expect(minutes).toContain(m);
    expect(movingFix(s.world.map, track, m).fix?.cepKm).toBeCloseTo(track.fixes![track.fixes!.length - 1].fix.cepKm, 6);
  });
});

describe('a bearing', () => {
  it("traces a reported bearing's σ to its captures and the site error", () => {
    const s = won();
    let checked = 0;
    for (const t of s.tracks) {
      for (const b of t.bearings) {
        const o = bearingOrigin(s, b);
        expect(o.captures.length).toBeGreaterThan(0);
        expect(o.sigmaDeg).toBeCloseTo(b.sigmaDeg, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(2);
  });
});

describe('orders and settings', () => {
  it('finds the orders that changed a unit or net, newest first, up to the minute', () => {
    const s = issue(runScript(text('07-red-stay-hidden.txt')).state, { type: 'reveal' }, 'red');
    const hq = s.world.units.find((u) => u.side === 'red' && u.kind === 'hq')!;
    const all = ordersAffecting(s, s.minute, [hq.name]);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((e) => e.text.startsWith(`${hq.name}:`))).toBe(true);
    for (let i = 1; i < all.length; i++) expect(all[i].minute).toBeLessThanOrEqual(all[i - 1].minute);
    expect(ordersAffecting(s, -1, [hq.name])).toHaveLength(0);
  });

  it("a replay minute's world carries that minute's settings, not the final ones", () => {
    const s = issue(runScript(text('07-red-stay-hidden.txt')).state, { type: 'reveal' }, 'red');
    const hq = s.world.units.find((u) => u.side === 'red' && u.kind === 'hq')!;
    const powerOrder = s.log.find((e) => e.kind === 'order' && e.text.startsWith(`${hq.name}: transmit power`));
    expect(powerOrder).toBeDefined();
    const before = worldAt(s, s.history[0]).units.find((u) => u.id === hq.id)!;
    const after = worldAt(s, s.history[s.history.length - 1]).units.find((u) => u.id === hq.id)!;
    expect(before.radio.powerW).not.toBe(after.radio.powerW);
    expect(after.radio.powerW).toBe(hq.radio.powerW);
    expect(s.history.every((h) => h.settings)).toBe(true);
    // viewOf in the replay uses it.
    const v0 = viewOf({ ...s, replay: { minute: 0 } }, 'red');
    expect(v0.truth.units.find((u) => u.id === hq.id)!.radio.powerW).toBe(before.radio.powerW);
  });
});

describe('lessons', () => {
  it('every lesson the inspector links to exists in the lab', () => {
    for (const [key, l] of Object.entries(LESSONS)) {
      const level = LEVELS.find((x) => x.id === l.level);
      expect(level, key).toBeDefined();
      expect(level!.units.flatMap((u) => u.steps).some((st) => st.id === l.step), `${key}: ${l.level} ${l.step}`).toBe(true);
    }
  });
});
