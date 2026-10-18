import { describe, expect, it } from 'vitest';
import { coverageMarginDb, freeSpaceDb, hataSlope, hataUrbanDb, jsSpreadDb, microcellDb } from '../urban';
import { type LessonStep, type StepDef, LEVEL_11, LEVELS, b3Setup, c3Setup, fillText, jsTownDb, level11Truth, level11Values } from '../levels';

const steps = (): StepDef[] => LEVEL_11.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const text = (id: string) => {
  const s = step<LessonStep>(id);
  return [...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' ');
};

describe('level 11 units A to C', () => {
  it('is in LEVELS', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(LEVEL_11.units.map((u) => u.id)).toEqual(['A', 'B', 'C']);
  });

  it('B1: one distance, three losses', () => {
    expect(freeSpaceDb(450, 2).toFixed(1)).toBe('91.5');
    expect(microcellDb(450, 2, 10, 1.5).toFixed(1)).toBe('118.5');
    expect(hataUrbanDb(450, 2, 30, 1.5).toFixed(1)).toBe('129.1');
    expect((hataUrbanDb(450, 2, 30, 1.5) - freeSpaceDb(450, 2)).toFixed(1)).toBe('37.6');
    for (const n of ['91.5', '118.5', '129.1', '37.6']) expect(text('B1')).toContain(n);
    expect(step<LessonStep>('B1').check!.answer).toBeCloseTo(10 * hataSlope(30), 1);
  });

  it('B3: the town J/S', () => {
    for (let s = 1; s <= 10; s++) {
      const b = b3Setup(level11Truth(s));
      expect(jsTownDb(b.jamOverSigDb, b.jamKm, b.sigKm, true)).toBeCloseTo(jsTownDb(b.jamOverSigDb, b.jamKm, b.sigKm) - 15, 9);
      expect(jsTownDb(b.jamOverSigDb, b.jamKm, b.sigKm)).toBeGreaterThan(b.jamOverSigDb);
    }
  });

  it('C1 and C3: spread and margin', () => {
    expect(jsSpreadDb(8, 8).toFixed(1)).toBe('11.3');
    expect(coverageMarginDb(jsSpreadDb(8, 8), 0.9).toFixed(1)).toBe('14.5');
    expect(step<LessonStep>('C1').check!.answer).toBe(8.5);
    for (let s = 1; s <= 10; s++) {
      const c = c3Setup(level11Truth(s));
      expect([0.9, 0.95]).toContain(c.share);
    }
  });

  it('scores 35 so far; every placeholder resolves', () => {
    const pts = steps().flatMap((s) => (s.kind === 'apply' ? s.fields.map((f) => f.points) : []));
    expect(pts.reduce((a, b) => a + b, 0)).toBe(35);
    for (let s = 1; s <= 6; s++) {
      for (const n of [0, 1, 3]) {
        const v = level11Values(level11Truth(s), n);
        const texts = steps().flatMap((st) => [
          ...('paragraphs' in st ? (st.paragraphs ?? []) : []),
          ...('steps' in st ? (st.steps ?? []) : []),
          ...('task' in st ? [st.task] : []),
          ...('hint' in st && st.hint ? [st.hint] : []),
          ...('worked' in st ? st.worked : []),
          ...('reveal' in st ? st.reveal : []),
        ]);
        for (const x of [...texts, LEVEL_11.debrief]) expect(fillText(x, v), x).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
