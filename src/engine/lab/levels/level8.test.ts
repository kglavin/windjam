import { describe, expect, it } from 'vitest';
import { berlekampMassey, chipsToBits, extendRecurrence, goldCode, mSequence, periodicCrossCorrelation } from '../pn';
import {
  type LessonStep, type StepDef, LEVEL_8, LEVELS, a2Length, b2Degree, fillText, level8Truth, level8Values, periodOf, secondTap, tapsOf,
} from '../levels';

const steps = (): StepDef[] => LEVEL_8.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('level 8 units A to C', () => {
  it('is in LEVELS', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(LEVEL_8.units.map((u) => u.id)).toEqual(['A', 'B', 'C']);
  });

  it('A1: the 5-stage register repeats every 31 chips, 16 ones and 15 zeros', () => {
    const bits = chipsToBits(mSequence(5));
    expect(bits).toHaveLength(31);
    expect(bits.filter((b) => b === 1)).toHaveLength(16);
    expect(tapsOf(5)).toEqual([5, 3]);
    expect(step<LessonStep>('A1').check!.answer).toBe(periodOf(10));
  });

  it('A2: every practice length is a whole register', () => {
    for (let n = 0; n < 5; n++) expect(Number.isInteger(Math.log2(a2Length(n) + 1))).toBe(true);
  });

  it('B1: 10 chips rebuild the example code, taps 5 and 3, and predict the other 21', () => {
    const bits = chipsToBits(mSequence(5));
    const bm = berlekampMassey(bits.slice(0, 10));
    expect(bm.length).toBe(5);
    expect(bm.coeffs.flatMap((c, i) => (c ? [i + 1] : []))).toEqual([3, 5]);
    expect(extendRecurrence(bits.slice(0, 10), bm.coeffs, 21)).toEqual(bits.slice(10));
    expect(step<LessonStep>('B1').check!.answer).toBe(14);
  });

  it('B3: the enemy register is rebuilt from 2n chips, its second tap readable', () => {
    for (const s of SEEDS) {
      const t = level8Truth(s);
      const bits = chipsToBits(mSequence(t.degree));
      const bm = berlekampMassey(bits.slice(0, 2 * t.degree));
      expect(bm.length).toBe(t.degree);
      expect(bm.coeffs.flatMap((c, i) => (c ? [i + 1] : [])).sort((a, b) => b - a)[1]).toBe(secondTap(t.degree));
    }
    for (let n = 0; n < 4; n++) expect(periodOf(b2Degree(n))).toBeGreaterThan(2 * b2Degree(n));
  });

  it('C1: Gold codes of 31 chips cross-correlate at −1, −9 and +7', () => {
    const v = new Set(periodicCrossCorrelation(goldCode(5, 2), goldCode(5, 7)));
    for (const x of v) expect([-1, -9, 7]).toContain(x);
    expect(step<LessonStep>('C1').check!.answer).toBe(127 + 2);
  });

  it('scores 30 points so far and every placeholder resolves', () => {
    const pts = steps().flatMap((s) => (s.kind === 'apply' ? s.fields.map((f) => f.points) : []));
    expect(pts.reduce((a, b) => a + b, 0)).toBe(30);
    for (const s of SEEDS.slice(0, 8)) {
      for (const n of [0, 1, 4]) {
        const v = level8Values(level8Truth(s), n);
        const texts = steps().flatMap((st) => [
          ...('paragraphs' in st ? (st.paragraphs ?? []) : []),
          ...('steps' in st ? (st.steps ?? []) : []),
          ...('task' in st ? [st.task] : []),
          ...('hint' in st && st.hint ? [st.hint] : []),
          ...('worked' in st ? st.worked : []),
          ...('reveal' in st ? st.reveal : []),
        ]);
        for (const x of [...texts, LEVEL_8.debrief]) expect(fillText(x, v), x).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
