import { describe, expect, it } from 'vitest';
import { planAnyRun } from '../berRun';
import { FH_EXAMPLE, fhPracticeAt, fhTheoryBer, runFh } from '../fh';
import { undb } from '../theory';
import {
  type ApplyStep,
  type LessonStep,
  type PracticeStep,
  type StepDef,
  C3_GOAL_BER,
  DENY_TOLERANCE,
  EXAMPLE,
  FIRST_PRACTICE,
  LEVEL_7,
  LEVELS,
  b2JsDb,
  b3JsDb,
  bestChannels,
  c2JsDb,
  c3JsDb,
  fillText,
  knownLinkInfo,
  level7Truth,
  level7Values,
  partialBer,
} from '../levels';

const steps = (): StepDef[] => LEVEL_7.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const text = (id: string) => {
  const s = step<LessonStep>(id);
  return [...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' ');
};
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('level 7 truth', () => {
  it('is in LEVELS with units A to C so far', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(LEVEL_7.units.map((u) => u.id)).toEqual(['A', 'B', 'C']);
  });

  it('draws a hop set from the seed', () => {
    for (const s of SEEDS) {
      const fh = level7Truth(s).fh!;
      expect([24, 32, 40, 48, 64]).toContain(fh.channels);
      expect([2, 4, 5, 8, 10]).toContain(fh.dwellMs);
      expect(fh.rateKbps).toBe(25);
    }
    expect(level7Truth(9)).toEqual(level7Truth(9));
  });
});

describe('level 7 lessons', () => {
  it('A1: the example hop set', () => {
    expect(FH_EXAMPLE.channels * FH_EXAMPLE.rateKbps).toBe(400);
    expect(FH_EXAMPLE.dwellMs).toBe(5);
    expect((10 * Math.log10(16)).toFixed(1)).toBe('12.0');
    expect(step<LessonStep>('A1').check!.answer).toBe(18.1);
  });

  it('B1: Eb/J0 9.0 dB and BER 0.0094 at J/S 3 dB', () => {
    expect((10 ** 0.9).toFixed(1)).toBe('7.9');
    expect(fhTheoryBer(FH_EXAMPLE, { kind: 'bbn' }, 3)).toBeCloseTo(0.0094, 4);
    for (const n of ['9.0 dB', '7.9', '0.0094']) expect(text('B1')).toContain(n);
    expect(step<LessonStep>('B1').check!.answer).toBeCloseTo(10 * Math.log10(64) - 8, 1);
  });

  it('C1: one channel at J/S −3 dB, against broadband noise', () => {
    expect(fhTheoryBer(FH_EXAMPLE, { kind: 'bbn' }, -3)).toBeLessThan(1e-7);
    expect(bestChannels(16, -3)).toBe(1);
    const one = partialBer(FH_EXAMPLE, 1, -3);
    expect(one).toBeCloseTo(0.012, 3);
    expect(0.5 * Math.exp(-undb(3) / 2)).toBeCloseTo(0.18, 2); // the hit hop at Eb/J0 2
    expect(bestChannels(16, 3)).toBe(step<LessonStep>('C1').check!.answer);
    const r = runFh({ kind: 'fh', link: FH_EXAMPLE, jammer: { kind: 'partial', rho: 1 / 16 }, jsDb: -3, seed: 4, maxErrors: 300 });
    expect(one).toBeGreaterThan(r.lo * 0.85);
    expect(one).toBeLessThan(r.hi * 1.15);
  });
});

describe('level 7 practice', () => {
  it('B2 gives a BER that a run measures in seconds', () => {
    for (let n = 0; n < 4; n++) {
      const ber = fhTheoryBer(fhPracticeAt(n), { kind: 'bbn' }, b2JsDb(n));
      expect(ber).toBeGreaterThan(0.003);
      expect(ber).toBeLessThan(0.1);
    }
  });

  it('C2: the 0.37 ÷ Eb/J0 rule lands within the check of the exact BER', () => {
    for (let n = 0; n < 4; n++) {
      const p = fhPracticeAt(n);
      const k = bestChannels(p.channels, c2JsDb(n));
      const exact = partialBer(p, k, c2JsDb(n));
      const rule = 0.37 / (p.channels / undb(c2JsDb(n)));
      expect(Math.max(rule / exact, exact / rule)).toBeLessThan(1.5);
      expect(step<PracticeStep>('C2').fields[1].check.factor).toBe(1.5);
    }
  });
});

describe('level 7 enemy steps', () => {
  const inputs = (t: ReturnType<typeof level7Truth>, entered: Record<string, number> = {}) => ({
    truth: t, example: knownLinkInfo(EXAMPLE), practice: FIRST_PRACTICE, practiceJsDb: 0, scene: { jsDb: 0, ebN0Db: 30 }, seed: 1, entered,
  });

  it('B3: broadband noise gives a BER worth predicting', () => {
    for (const s of SEEDS) {
      const t = level7Truth(s);
      const plan = planAnyRun(step<ApplyStep>('B3').run!, inputs(t));
      expect(plan.jsDb).toBe(b3JsDb(t));
      expect(plan.theoryBer).toBeGreaterThan(0.003);
      expect(plan.theoryBer).toBeLessThan(0.1);
    }
  });

  it('C3: broadband noise misses the goal, the best partial band reaches it with room', () => {
    for (const s of SEEDS) {
      const t = level7Truth(s);
      const fh = t.fh!;
      expect(fhTheoryBer(fh, { kind: 'bbn' }, c3JsDb(t))).toBeLessThan(C3_GOAL_BER * DENY_TOLERANCE);
      const k = bestChannels(fh.channels, c3JsDb(t));
      const plan = planAnyRun(step<ApplyStep>('C3').run!, inputs(t, { channels: k }));
      expect(plan.theoryBer).toBeCloseTo(partialBer(fh, k, c3JsDb(t)), 12);
      expect(plan.theoryBer).toBeGreaterThan(1.5 * C3_GOAL_BER);
    }
  });

  it('scores 50 points so far: A3 20, B3 10, C3 20', () => {
    const pts = steps().flatMap((s) => (s.kind === 'apply' ? [...s.fields.map((f) => f.points), s.goal?.points ?? 0] : []));
    expect(pts.reduce((a, b) => a + b, 0)).toBe(50);
  });

  it('every placeholder in every text resolves', () => {
    for (const s of SEEDS.slice(0, 10)) {
      for (const n of [0, 1, 3]) {
        const v = level7Values(level7Truth(s), n);
        const texts = steps().flatMap((st) => [
          ...('paragraphs' in st ? (st.paragraphs ?? []) : []),
          ...('steps' in st ? (st.steps ?? []) : []),
          ...('task' in st ? [st.task] : []),
          ...('hint' in st && st.hint ? [st.hint] : []),
          ...('worked' in st ? st.worked : []),
          ...('reveal' in st ? st.reveal : []),
          ...(st.kind === 'apply' && st.goal ? [st.goal.task] : []),
        ]);
        for (const x of [...texts, LEVEL_7.debrief]) expect(fillText(x, v), x).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
