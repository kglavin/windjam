import { describe, expect, it } from 'vitest';
import { bestShare, dcPowerW, lookThroughLossDb, platform, shareOutcome, timeOnAirH } from '../tactics';
import {
  type LessonStep, type StepDef, EXAMPLE_NET, EXAMPLE_TARGETS, LEVEL_9, SHARE_GOAL_BER, bestShareOf, fDuty, fMissionHours, level9Network, networkTry, shareTargets, LEVELS, a2Set, affordableRfW, b3GoalDb, fillText, level9Truth, level9Values, missionHours, packKmFor,
} from '../levels';

const steps = (): StepDef[] => LEVEL_9.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const text = (id: string) => {
  const s = step<LessonStep>(id);
  return [...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' ');
};

describe('level 9 units A to C', () => {
  it('is in LEVELS', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(LEVEL_9.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });

  it('A1: the soldier pack', () => {
    const s = platform('soldier');
    expect(dcPowerW(s.rfW, s.efficiency).toFixed(1)).toBe('33.3');
    expect(timeOnAirH(s.energyWh, s.rfW, s.efficiency)).toBeCloseTo(4.5, 9);
    expect(timeOnAirH(s.energyWh, s.rfW, s.efficiency, 0.25)).toBeCloseTo(18, 9);
    for (const n of ['33.3 W', '4.5 hours', '18 hours']) expect(text('A1')).toContain(n);
  });

  it('A3: the UAV mission', () => {
    for (let s = 1; s <= 20; s++) {
      const t = level9Truth(s);
      const u = platform('uav');
      expect(affordableRfW(t)).toBeCloseTo((u.energyWh / missionHours(t)) * u.efficiency, 9);
      expect(affordableRfW(t)).toBeLessThan(u.rfW);
    }
    for (let n = 0; n < 4; n++) expect(a2Set(n).eff).toBeLessThan(1);
  });

  it('B1: a 10 W pack matches a 200 W vehicle at 20 km from 9.5 km', () => {
    expect((10 * Math.log10(20)).toFixed(0)).toBe('13');
    expect(10 ** (13 / 40)).toBeCloseTo(2.1, 1);
    expect(packKmFor(20).toFixed(1)).toBe('9.5');
    expect(step<LessonStep>('B1').check!.answer).toBe(24.1);
  });

  it('C1: look-through costs', () => {
    expect(lookThroughLossDb(1, 10).toFixed(2)).toBe('0.46');
    expect(step<LessonStep>('C1').check!.answer).toBe(0.97);
  });

  it('D1: the three example links under each plan', () => {
    const out = (mode: 'power' | 'time', chosen: number[]) => shareOutcome(EXAMPLE_TARGETS, chosen, mode, SHARE_GOAL_BER);
    expect(out('power', [0, 1, 2]).map((x) => Number(x.ber.toPrecision(1)))).toEqual([0.003, 0.0003, 8e-7]);
    expect(out('time', [0, 1, 2]).map((x) => Number(x.ber.toPrecision(1)))).toEqual([0.02, 0.008, 0.0008]);
    expect(out('time', [0, 1]).slice(0, 2).map((x) => Number(x.ber.toPrecision(2)))).toEqual([0.028, 0.012]);
    expect(bestShare(EXAMPLE_TARGETS, SHARE_GOAL_BER)).toEqual({ denied: 2, mode: 'time', chosen: [0, 1] });
  });

  it('D3: the best plan breaks at least two links, and all three under power sharing is never it', () => {
    for (let s = 1; s <= 30; s++) {
      const t = level9Truth(s);
      const b = bestShareOf(t);
      expect(b.denied).toBeGreaterThanOrEqual(2);
      expect(shareOutcome(shareTargets(t), [0, 1, 2], 'power', SHARE_GOAL_BER).filter((x) => x.denied).length).toBeLessThan(b.denied);
    }
  });

  it('E: near the hub breaks every link into it, near an outstation does not; the area is small', () => {
    const hub = EXAMPLE_NET.nodes[0];
    expect(networkTry(EXAMPLE_NET, { xKm: hub.xKm, yKm: hub.yKm - 1.5 }).all).toBe(true);
    const sp = EXAMPLE_NET.nodes[1];
    expect(networkTry(EXAMPLE_NET, { xKm: sp.xKm, yKm: sp.yKm - 1.5 }).inbound).toBeLessThan(5);
    for (let s = 1; s <= 20; s++) {
      const net = level9Network(level9Truth(s));
      for (const n of net.nodes) {
        expect(n.yKm).toBeLessThanOrEqual(16);
        expect(Math.abs(n.xKm)).toBeLessThanOrEqual(10);
      }
      let hits = 0;
      let all = 0;
      for (let x = -10; x <= 10; x += 0.5) {
        for (let y = -4; y <= 16; y += 0.5) {
          all++;
          if (networkTry(net, { xKm: x, yKm: y }).all) hits++;
        }
      }
      expect(hits).toBeGreaterThan(0);
      expect(hits / all).toBeLessThan(0.15);
    }
  });

  it('F: the pack\'s duty for the mission', () => {
    for (let s = 1; s <= 10; s++) {
      const t = level9Truth(s);
      expect(fDuty(t)).toBeCloseTo(4.5 / fMissionHours(t), 9);
    }
    expect(10 * Math.log10(1 / 0.5)).toBeCloseTo(3, 1);
  });

  it('scores 100 points; every placeholder resolves', () => {
    const pts = steps().flatMap((s) =>
      s.kind === 'apply' ? [...s.fields.map((f) => f.points), s.locate?.points ?? 0, s.share?.points ?? 0]
        : s.kind === 'find' ? [s.points ?? 0] : s.kind === 'questions' ? s.questions.map((q) => q.points) : []);
    expect(pts.reduce((a, b) => a + b, 0)).toBe(100);
    for (let s = 1; s <= 8; s++) {
      for (const n of [0, 1, 3]) {
        const v = level9Values(level9Truth(s), n, b3GoalDb(level9Truth(s)) - 12);
        const texts = steps().flatMap((st) => [
          ...('paragraphs' in st ? (st.paragraphs ?? []) : []),
          ...('steps' in st ? (st.steps ?? []) : []),
          ...('task' in st ? [st.task] : []),
          ...('hint' in st && st.hint ? [st.hint] : []),
          ...('worked' in st ? st.worked : []),
          ...('reveal' in st ? st.reveal : []),
        ]);
        for (const x of [...texts, LEVEL_9.debrief]) expect(fillText(x, v), x).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
