import { describe, expect, it } from 'vitest';
import { planAnyRun } from '../berRun';
import { SYNC_EXAMPLE, cellMean, detectProb, jammerEnergy, packetErrorRate, thresholdFor } from '../sync';
import { berlekampMassey, chipsToBits, extendRecurrence, goldCode, mSequence, periodicCrossCorrelation } from '../pn';
import {
  type ApplyStep, type LessonStep, type StepDef, DENY_TOLERANCE, EXAMPLE, F3_GOAL_PER, FIRST_PRACTICE, LEVEL_8, knownLinkInfo, packetLinkOf, ruleJsDb, LEVELS, a2Length, b2Degree, fillText, level8Truth, level8Values, periodOf, secondTap, tapsOf,
} from '../levels';

const steps = (): StepDef[] => LEVEL_8.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('level 8 units A to C', () => {
  it('is in LEVELS', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(LEVEL_8.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
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

  it('D1: the example search', () => {
    const L = SYNC_EXAMPLE;
    expect(thresholdFor(1e-3)).toBeCloseTo(3.09, 2);
    expect(cellMean(L)).toBeCloseTo(4.97, 2);
    expect(detectProb(L)).toBeCloseTo(0.97, 2);
    expect(L.n * L.n).toBe(961);
  });

  it('D3: the enemy hears its preamble well, and the peak is worked from the printed SNR', () => {
    for (const s of SEEDS) {
      const t = level8Truth(s);
      const pk = packetLinkOf(t);
      expect(detectProb(pk)).toBeGreaterThan(0.85);
      expect(Math.sqrt(2 * t.n * 10 ** (pk.chipSnrDb / 10))).toBeCloseTo(cellMean(pk), 9);
    }
  });

  it('F1: preamble against payload at J/S 8 dB', () => {
    const L = SYNC_EXAMPLE;
    expect(ruleJsDb(31)).toBeCloseTo(8.1, 1);
    expect(packetErrorRate(L, { on: 'preamble', jsDb: 8 })).toBeCloseTo(2 / 3, 1);
    expect(packetErrorRate(L, { on: 'payload', jsDb: 8 })).toBeCloseTo(0.9, 1);
    expect(jammerEnergy(L, { on: 'payload', jsDb: 8 }) / jammerEnergy(L, { on: 'preamble', jsDb: 8 })).toBeCloseTo(16.1, 1);
    expect(L.payloadBits * L.n).toBe(15500);
  });

  it('F3: quiet the enemy loses few packets; the rule-of-thumb J/S on the preamble reaches the goal', () => {
    for (const s of SEEDS) {
      const t = level8Truth(s);
      const pk = packetLinkOf(t);
      expect(packetErrorRate(pk)).toBeLessThan(F3_GOAL_PER * DENY_TOLERANCE);
      const plan = planAnyRun(step<ApplyStep>('F3').run!, {
        truth: t, example: knownLinkInfo(EXAMPLE), practice: FIRST_PRACTICE, practiceJsDb: 0, scene: { jsDb: 0, ebN0Db: 30 }, seed: 1,
        entered: { js: Number(ruleJsDb(t.n).toFixed(1)) },
      });
      expect(plan.theoryBer).toBeGreaterThan(F3_GOAL_PER * 1.2);
      expect('kind' in plan.request && plan.request.kind).toBe('sync');
    }
  });

  it('scores 100 points and every placeholder resolves', () => {
    const pts = steps().flatMap((s) =>
      s.kind === 'apply' ? [...s.fields.map((f) => f.points), s.goal?.points ?? 0] : s.kind === 'questions' ? s.questions.map((q) => q.points) : []);
    expect(pts.reduce((a, b) => a + b, 0)).toBe(100);
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
          ...(st.kind === 'apply' && st.goal ? [st.goal.task] : []),
        ]);
        for (const x of [...texts, LEVEL_8.debrief]) expect(fillText(x, v), x).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
