import { describe, expect, it } from 'vitest';
import { dcPowerW, lookThroughLossDb, platform, timeOnAirH } from '../tactics';
import {
  type LessonStep, type StepDef, LEVEL_9, LEVELS, a2Set, affordableRfW, b3GoalDb, fillText, level9Truth, level9Values, missionHours, packKmFor,
} from '../levels';

const steps = (): StepDef[] => LEVEL_9.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const text = (id: string) => {
  const s = step<LessonStep>(id);
  return [...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' ');
};

describe('level 9 units A to C', () => {
  it('is in LEVELS', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(LEVEL_9.units.map((u) => u.id)).toEqual(['A', 'B', 'C']);
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

  it('B3 scores 15, A3 15: 30 so far; every placeholder resolves', () => {
    const pts = steps().flatMap((s) => (s.kind === 'apply' ? s.fields.map((f) => f.points) : s.kind === 'find' ? [s.points ?? 0] : []));
    expect(pts.reduce((a, b) => a + b, 0)).toBe(30);
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
