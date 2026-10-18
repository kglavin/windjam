import { describe, expect, it } from 'vitest';
import { NULL_DIRS, angleGrid, bartlettDb, beamwidthDeg, delayAndSum, idealCovariance, jammerSuppressionDb, musicSpectrumDb, mvdr, peaks, sampleCovariance } from '../array';
import { berCdma, codeOf, discoverCode, partials, sinr } from '../cdma';
import { qfunc } from '../theory';
import {
  type LessonStep, type StepDef, DISCOVER_EXAMPLE, GOAL_SINR, LEVEL_10, LEVELS, NEAR_FAR, PIECE_STEPS, b2Numbers, c2Setup, fewestPieces, fillText,
  F2_M, F2_SNAPSHOTS, e2SuppressionDb, f2Sources, level10Truth, level10Values, maxUsers, ruleSinrGp,
} from '../levels';

const steps = (): StepDef[] => LEVEL_10.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;

describe('level 10 units A to C', () => {
  it('is in LEVELS', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(LEVEL_10.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });

  it('A1: the rule and how many users fit', () => {
    expect(qfunc(Math.sqrt(2 * GOAL_SINR))).toBeCloseTo(0.01, 3);
    expect(ruleSinrGp(31, 6)).toBeCloseTo(6.2, 9);
    expect(maxUsers(31)).toBe(12);
    expect(maxUsers(127)).toBe(48);
    expect(step<LessonStep>('A1').check!.answer).toBe(3.1);
  });

  it('B1: the near user buries the far one; cancelling it brings it back', () => {
    const [r1, r2] = partials(NEAR_FAR[1].code, NEAR_FAR[0].code, -11);
    expect(Math.round(31 * Math.max(Math.abs(r1), Math.abs(r2)))).toBe(6);
    expect(berCdma(NEAR_FAR, 1)).toBeCloseTo(0.38, 2);
    expect(sinr(NEAR_FAR, 1, [0])).toBeCloseTo(19.6, 1);
    expect(berCdma(NEAR_FAR, 1, [0])).toBeLessThan(1e-5);
  });

  it('B2: the enemy numbers', () => {
    for (let s = 1; s <= 10; s++) {
      const b = b2Numbers(level10Truth(s));
      expect(b.interferenceDb).toBeCloseTo(b.gap + 20 * Math.log10(b.rhoN / 31), 9);
      expect(b.sicDb).toBeCloseTo(10 * Math.log10(31) + b.weak, 9);
    }
  });

  it('C1 and C2: finding the code', () => {
    const e = DISCOVER_EXAMPLE;
    expect(discoverCode(codeOf(e.code), e.snrDb, 5, 1).agree).toBe(27);
    expect(fewestPieces(e.code, e.snrDb)).toBe(20);
    for (let s = 1; s <= 20; s++) {
      const c = c2Setup(level10Truth(s));
      const f = fewestPieces(c.code, c.snrDb);
      expect(PIECE_STEPS).toContain(f);
      expect(f).toBeLessThan(1600);
    }
    expect(step<LessonStep>('C1').check!.answer).toBeCloseTo((1600 * 31) / 1000, 9);
  });

  it('D1: gain and beamwidth', () => {
    expect((10 * Math.log10(8)).toFixed(1)).toBe('9.0');
    expect(beamwidthDeg(8).toFixed(1)).toBe('12.8');
    expect(step<LessonStep>('D1').check!.answer).toBeCloseTo(10 * Math.log10(16), 1);
  });

  it('E1: the null on one jammer, and M − 1 nulls', () => {
    const w = mvdr(idealCovariance(8, [{ thetaDeg: 40, power: 1000 }], 1), 0);
    expect(Math.round(-jammerSuppressionDb(w, 0, 40))).toBe(44);
    expect(Math.round(-jammerSuppressionDb(delayAndSum(8, 0), 0, 40))).toBe(17);
    const JAMS = NULL_DIRS;
    const worst = (k: number) => {
      const js = JAMS.slice(0, k);
      const wk = mvdr(idealCovariance(8, js.map((thetaDeg) => ({ thetaDeg, power: 1000 })), 1), 0);
      return Math.max(...js.map((j) => jammerSuppressionDb(wk, 0, j)));
    };
    expect(worst(7)).toBeLessThan(-42);
    expect(worst(8)).toBeGreaterThan(-30);
    expect(Math.round(-worst(8))).toBe(24);
  });

  it('E2 and F2: the enemy array and its emitters', () => {
    for (let s = 1; s <= 20; s++) {
      const t = level10Truth(s);
      expect(e2SuppressionDb(t)).toBeLessThan(-35);
      const src = f2Sources(t);
      const R = sampleCovariance(F2_M, src, 1, F2_SNAPSHOTS, t.seed);
      const g = angleGrid(0.25);
      const p = peaks(g, musicSpectrumDb(R, 2, g), 2).sort((a, b) => a - b);
      const want = src.map((x) => x.thetaDeg).sort((a, b) => a - b);
      expect(Math.abs(p[0] - want[0])).toBeLessThan(1.5);
      expect(Math.abs(p[1] - want[1])).toBeLessThan(1.5);
    }
  });

  it('F1: MUSIC splits two emitters the scan merges', () => {
    const R = sampleCovariance(6, [{ thetaDeg: -5, power: 10 }, { thetaDeg: 5, power: 10 }], 1, 20, 3);
    const g = angleGrid(0.25);
    expect(peaks(g, musicSpectrumDb(R, 2, g), 2)).toHaveLength(2);
    expect(peaks(g, bartlettDb(R, g), 2, -3)).toHaveLength(1);
  });

  it('scores 100; every placeholder resolves', () => {
    const pts = steps().flatMap((s) => (s.kind === 'apply' ? s.fields.map((f) => f.points) : s.kind === 'questions' ? s.questions.map((q) => q.points) : []));
    expect(pts.reduce((a, b) => a + b, 0)).toBe(100);
    for (let s = 1; s <= 6; s++) {
      for (const n of [0, 1, 3]) {
        const v = level10Values(level10Truth(s), n);
        const texts = steps().flatMap((st) => [
          ...('paragraphs' in st ? (st.paragraphs ?? []) : []),
          ...('steps' in st ? (st.steps ?? []) : []),
          ...('task' in st ? [st.task] : []),
          ...('hint' in st && st.hint ? [st.hint] : []),
          ...('worked' in st ? st.worked : []),
          ...('reveal' in st ? st.reveal : []),
        ]);
        for (const x of [...texts, LEVEL_10.debrief]) expect(fillText(x, v), x).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
