import { describe, expect, it } from 'vitest';
import { bearingDeg } from '../geoloc';
import { bubbleRadiusKm, coverageMarginDb, fadeProbability, freeSpaceDb, hataSlope, hataUrbanDb, jsSpreadDb, microcellDb, rakeFadeProbability } from '../urban';
import {
  type ApplyStep, type LessonStep, type QuestionsStep, type StepDef, EXAMPLE_PLACE, EXAMPLE_TOWN, LEVEL_11, LEVELS, ENEMY_GOAL_JS_DB, b3Setup, c3Setup, d2Geometry,
  e2Js, e3Layout, exampleJs, f2Radius, f2Setup, fillText, isolationSolutions, jsTownDb, level11Truth, level11Values, townTry,
} from '../levels';

const steps = (): StepDef[] => LEVEL_11.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const text = (id: string) => {
  const s = step<LessonStep>(id);
  return [...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' ');
};

describe('level 11', () => {
  it('is in LEVELS', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(LEVEL_11.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
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

  it('D1: fades and the rake', () => {
    expect(Math.round(1 / fadeProbability(10))).toBe(11);
    expect(Math.round(1 / fadeProbability(20))).toBe(101);
    expect(Math.round(1 / rakeFadeProbability(10, 2))).toBe(57);
    expect(Math.round(1 / rakeFadeProbability(10, 3))).toBe(278);
    for (const n of ['1 in 60', '1 in 300']) expect(text('D1')).toContain(n);
  });

  it('D2: the bearing error is the angle between wall and transmitter, and big enough to matter', () => {
    for (let s = 1; s <= 20; s++) {
      const g = d2Geometry(level11Truth(s));
      expect(g.errorDeg).toBeCloseTo(Math.abs(bearingDeg(g.site, g.wall) - bearingDeg(g.site, g.tx)), 6);
      expect(g.errorDeg).toBeGreaterThan(15);
      expect(g.errorDeg).toBeLessThan(90);
    }
  });

  it('E1: the example numbers, omni against beam', () => {
    const omni = exampleJs(false).map((v) => v.toFixed(1));
    const beam = exampleJs(true).map((v) => v.toFixed(1));
    expect(omni).toEqual(['12.3', '13.4', '13.3', '5.6']);
    expect(beam).toEqual(['22.3', '-1.6', '-1.7', '-9.4']);
    for (const n of [...omni, ...beam.map((v) => v.replace('-', '−'))]) expect(text('E1')).toContain(n);
    expect(townTry(EXAMPLE_TOWN, EXAMPLE_PLACE.at, EXAMPLE_PLACE.beamDeg).ok).toBe(true);
    expect(step<LessonStep>('E1').check!.answer).toBeCloseTo(Number(beam[1]) + 25, 9);
  });

  it('E2: a side-lobe friendly', () => {
    expect(e2Js(0)).toBeCloseTo(43 + 10 - 25 - hataUrbanDb(450, 0.4, 30, 1.5) + 80, 9);
  });

  it('E3: every seed has a layout where an omni jammer fails everywhere and a beam works somewhere', () => {
    for (let s = 1; s <= 12; s++) {
      const t = level11Truth(s);
      const l = e3Layout(t);
      expect(isolationSolutions(l, false)).toHaveLength(0);
      const sols = isolationSolutions(l, true);
      expect(sols.length).toBeGreaterThanOrEqual(4);
      const r = townTry(l, sols[0].at, sols[0].beamDeg!);
      expect(r.ok).toBe(true);
      expect(r.js[0]).toBeGreaterThanOrEqual(ENEMY_GOAL_JS_DB);
    }
  });

  it('F1 and F2: the bubble', () => {
    expect((10 * Math.log10(25)).toFixed(1)).toBe('14.0');
    expect(bubbleRadiusKm(1, 10 * Math.log10(25), 10, 3.5).toFixed(2)).toBe('1.30');
    expect(step<LessonStep>('F1').check!.answer).toBeCloseTo(2 ** 3.5, 1);
    for (let s = 1; s <= 10; s++) {
      const t = level11Truth(s);
      const f = f2Setup(t);
      const r = f2Radius(t);
      expect(10 * Math.log10(f.jamW / f.trigW) - 35 * Math.log10(r / f.trigKm)).toBeCloseTo(f.needDb, 9);
    }
  });

  it('scores 100 with a pass mark of 60; every placeholder resolves', () => {
    const fields = steps().flatMap((s) => (s.kind === 'apply' ? s.fields.map((f) => f.points) : []));
    const locate = steps().flatMap((s) => (s.kind === 'apply' && s.locate ? [s.locate.points] : []));
    const qs = step<QuestionsStep>('G1').questions.map((q) => q.points);
    expect([...fields, ...locate, ...qs].reduce((a, b) => a + b, 0)).toBe(100);
    expect(step<ApplyStep>('E3').locate!.points).toBe(25);
    expect(LEVEL_11.passMark).toBe(60);
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
