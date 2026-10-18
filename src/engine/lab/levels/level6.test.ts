import { describe, expect, it } from 'vitest';
import { cepFromSigmas } from '../../detect';
import { C_KM_PER_US, bearingDeg, bearingSigmaDeg, crossingAngleDeg, distanceKm, fixFromBearings } from '../geoloc';
import {
  type ApplyStep,
  type LessonStep,
  type PracticeStep,
  type StepDef,
  DF_EXAMPLES,
  ENEMY_S1,
  ENEMY_S2,
  LEVEL_6,
  LEVELS,
  LISTEN_POST,
  TDOA_T1,
  TDOA_T2,
  UAV_HEIGHT_M,
  exampleDtUs,
  legPoints,
  xcorrEnemy,
  xcorrExample,
  xcorrPractice,
  WEST_SITE,
  LOCATE_FULL_TRIES,
  baselineAngles,
  d3Angles,
  d3RangeKm,
  dfStepTry,
  exampleBearings,
  fillText,
  inZone,
  lawOfSinesRangeKm,
  level6Scene,
  level6Truth,
  level6Values,
  locateTry,
  postSigmaDeg,
  practiceSigmas,
  practiceTriangle,
  scoreLocate,
  siteSigmaDeg,
  siteSnrDb,
  txOf,
} from '../levels';

const steps = (): StepDef[] => LEVEL_6.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('level 6 truth and scene', () => {
  it('is in LEVELS, units A to E', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(LEVEL_6.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  });

  it('puts the transmitter north of the line, inside the map', () => {
    for (const s of SEEDS) {
      const tx = txOf(level6Truth(s));
      expect(tx.xKm).toBeGreaterThanOrEqual(-4);
      expect(tx.xKm).toBeLessThanOrEqual(4);
      expect(tx.yKm).toBeGreaterThanOrEqual(8);
      expect(tx.yKm).toBeLessThanOrEqual(11);
    }
    expect(level6Truth(5)).toEqual(level6Truth(5));
  });

  it('a site 10 km from the transmitter hears it at 20 dB', () => {
    for (const s of [1, 7, 30]) {
      const t = level6Truth(s);
      const tx = txOf(t);
      expect(siteSnrDb(level6Scene(t), { xKm: tx.xKm, yKm: tx.yKm - 10 })).toBeCloseTo(20, 6);
    }
  });

  it('sites only on the friendly side', () => {
    expect(inZone({ xKm: 0, yKm: 0 })).toBe(true);
    expect(inZone({ xKm: 3, yKm: -4 })).toBe(true);
    expect(inZone({ xKm: 0, yKm: 0.2 })).toBe(false);
    expect(inZone({ xKm: 11, yKm: -1 })).toBe(false);
  });
});

describe('level 6 lessons', () => {
  const text = (id: string) => {
    const s = step<LessonStep>(id);
    return [...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' ');
  };
  // The scene with the examples' transmitter.
  const exScene = level6Scene(level6Truth(1), DF_EXAMPLES.E1.target);

  it('B1 and E1 label each site with its SNR and σ in the scene', () => {
    for (const id of ['B1', 'E1']) {
      for (const s of DF_EXAMPLES[id].sites) {
        const snr = siteSnrDb(exScene, s);
        expect(s.label).toContain(`${Math.round(snr)} dB`);
        expect(s.sigmaDeg).toBeCloseTo(siteSigmaDeg(exScene, s), 1);
      }
    }
    expect(text('B1')).toContain('± 11°'); // 2 × 5.6
    expect(text('B1')).toContain('± 4°');
  });

  it('C1: σ at 10 dB', () => {
    expect(bearingSigmaDeg(10)).toBeCloseTo(6.32, 2);
    expect((10 * bearingSigmaDeg(10)) / (180 / Math.PI)).toBeCloseTo(1.1, 1);
    expect(step<LessonStep>('C1').check!.answer).toBe(bearingSigmaDeg(20));
  });

  it('D1: the angles and ranges of its picture', () => {
    const ex = DF_EXAMPLES.D1;
    const [b1, b2] = exampleBearings(ex);
    const a = baselineAngles(ex.sites[0], b1.bearingDeg, ex.sites[1], b2.bearingDeg);
    expect(Math.round(a.alphaDeg)).toBe(54);
    expect(Math.round(a.betaDeg)).toBe(69);
    expect(lawOfSinesRangeKm(10, 54, 69)).toBeCloseTo(11.1, 1);
    expect(lawOfSinesRangeKm(10, 69, 54)).toBeCloseTo(9.6, 1);
    expect(distanceKm(ex.sites[0], ex.target)).toBeCloseTo(11.1, 1);
    expect(lawOfSinesRangeKm(10, 90, 45)).toBeCloseTo(step<LessonStep>('D1').check!.answer, 6);
  });

  it('E1: the errors, the fix, its ellipse and CEP', () => {
    const ex = DF_EXAMPLES.E1;
    const b = exampleBearings(ex);
    const err = b.map((l, i) => Number((l.bearingDeg - bearingDeg(ex.sites[i], ex.target)).toFixed(1)));
    expect(err).toEqual([3.9, 0.7, 2.5]);
    const f = fixFromBearings(b)!;
    expect(f.xKm.toFixed(1)).toBe('1.9');
    expect(f.yKm.toFixed(1)).toBe('8.9');
    expect(f.ellipse.aKm.toFixed(2)).toBe('0.64');
    expect(f.ellipse.bKm.toFixed(2)).toBe('0.34');
    expect((0.75 * Math.hypot(0.64, 0.34)).toFixed(2)).toBe('0.54');
    expect(f.cepKm.toFixed(2)).toBe('0.57');
    expect(distanceKm(f, ex.target).toFixed(2)).toBe('0.43');
    expect(0.75 * Math.hypot(0.4, 0.3)).toBeCloseTo(step<LessonStep>('E1').check!.answer, 9);
    const t = text('E1');
    for (const n of ['3.9°', '0.7°', '2.5°', 'x 1.9, y 8.9', 'a = 0.64', 'b = 0.34', '0.54 km', '0.57 km', '0.43 km']) expect(t).toContain(n);
  });
});

describe('level 6 moving sensor and timing lessons', () => {
  it('F1: the leg, its bearings and its fix', () => {
    const ex = DF_EXAMPLES.F1;
    const b = exampleBearings(ex);
    expect(b).toHaveLength(13);
    expect(Math.round(b[0].bearingDeg)).toBe(28);
    expect(Math.round(b[12].bearingDeg)).toBe(350);
    const f = fixFromBearings(b)!;
    expect(distanceKm(f, ex.target).toFixed(2)).toBe('0.35');
    expect(f.cepKm.toFixed(2)).toBe('0.31');
    const sc = level6Scene(level6Truth(1), ex.target);
    expect(siteSnrDb(sc, { xKm: 0, yKm: 0 }, UAV_HEIGHT_M) - siteSnrDb(sc, { xKm: 0, yKm: 0 })).toBeCloseTo(40, 0);
    expect(step<LessonStep>('F1').check!.answer).toBe((100 * 3) / 60);
  });

  it('G2: the example peak and range difference', () => {
    expect(xcorrExample().peakUs).toBe(7);
    expect(exampleDtUs(DF_EXAMPLES.G2)[0]).toBeCloseTo(7.04, 2);
    expect(0.3 * 7).toBeCloseTo(2.1, 9);
    expect(step<LessonStep>('G2').check!.answer).toBeCloseTo(0.3 * 4, 9);
    expect(step<LessonStep>('G1').check!.answer).toBeCloseTo(0.5 * 300, 9);
  });

  it('G3: each practice correlation peaks where it was set, well above its sidelobes', () => {
    for (let n = 0; n < 6; n++) {
      const x = xcorrPractice(n);
      const top = Math.max(...x.points.map((p) => p.mag));
      const side = Math.max(...x.points.filter((p) => Math.abs(p.lagUs - x.peakUs) > 3).map((p) => p.mag));
      expect(top).toBeGreaterThan(2.5 * side);
      expect(level6Values(level6Truth(1), n).pDt).toBe(String(x.peakUs));
    }
  });
});

describe('level 6 practice', () => {
  it('C2 never hits the 2° floor', () => {
    for (let n = 0; n < 6; n++) {
      const f = step<PracticeStep>('C2').fields[0];
      expect(f.truth(level6Truth(1), { rxSnrDb: 0, rxEbN0Db: 0, practiceN: n })).toBeGreaterThan(2);
    }
  });

  it('D2: the law of sines gives a range unlike the baseline', () => {
    for (let n = 0; n < 4; n++) {
      const p = practiceTriangle(n);
      expect(Math.abs(lawOfSinesRangeKm(p.d, p.alpha, p.beta) - p.d)).toBeGreaterThan(0.3);
    }
  });

  it('E2: the 0.75 rule lands within the 15% check of the exact CEP', () => {
    for (let n = 0; n < 4; n++) {
      const s = practiceSigmas(n);
      const exact = cepFromSigmas(Math.max(s.a, s.b), Math.min(s.a, s.b));
      expect(Math.abs(0.75 * Math.hypot(s.a, s.b) - exact) / exact).toBeLessThan(0.15);
      expect(step<PracticeStep>('E2').fields[0].check.rel).toBe(0.15);
    }
  });
});

describe('level 6 enemy steps', () => {
  it('C3: the listening post σ is above the floor and below 10°', () => {
    for (const s of SEEDS) {
      const sig = postSigmaDeg(level6Truth(s));
      expect(sig).toBeGreaterThan(2.5);
      expect(sig).toBeLessThan(10);
    }
    expect(LISTEN_POST.yKm).toBeLessThanOrEqual(0);
  });

  it('D3: the measured angles give a range near the truth', () => {
    for (const s of SEEDS) {
      const t = level6Truth(s);
      const a = d3Angles(t);
      expect(180 - a.alphaDeg - a.betaDeg).toBeGreaterThan(30);
      expect(Math.abs(d3RangeKm(t) - distanceKm(ENEMY_S1, txOf(t))) / distanceKm(ENEMY_S1, txOf(t))).toBeLessThan(0.25);
      const [b1, b2] = dfStepTry(t, 'D3', [ENEMY_S1, ENEMY_S2], 0).bearings;
      expect(b1.bearingDeg).toBeCloseTo(dfStepTry(t, 'D3', [ENEMY_S1, ENEMY_S2], 0).bearings[0].bearingDeg, 12);
      expect(b2.sigmaDeg).toBeGreaterThan(0);
    }
  });

  it('D4: some site on the friendly side crosses W at 80° or more', () => {
    for (const s of SEEDS) {
      const tx = txOf(level6Truth(s));
      let best = 0;
      for (let x = -10; x <= 10; x += 0.5) {
        for (let y = -4; y <= 0; y += 0.5) best = Math.max(best, crossingAngleDeg(bearingDeg(WEST_SITE, tx), bearingDeg({ xKm: x, yKm: y }, tx)));
      }
      expect(best).toBeGreaterThan(80);
    }
    expect(step<ApplyStep>('D4').locate!.crossingDegAtLeast).toBe(75);
  });

  it('E3: a spread layout meets 1 km CEP, a bunched one does not', () => {
    for (const s of SEEDS) {
      const t = level6Truth(s);
      const tx = txOf(t);
      const good = locateTry(level6Scene(t), [{ xKm: -9, yKm: 0 }, { xKm: tx.xKm, yKm: 0 }, { xKm: 9, yKm: 0 }], tx, 1, 1);
      const bunched = locateTry(level6Scene(t), [{ xKm: -1, yKm: -3 }, { xKm: 0, yKm: -3 }, { xKm: 1, yKm: -3 }], tx, 1, 1);
      expect(good.cepKm!).toBeLessThan(1);
      expect(bunched.cepKm!).toBeGreaterThan(1);
    }
  });

  it('scores a locate goal in full within three tries, half after, none on a miss', () => {
    const goal = step<ApplyStep>('E3').locate!;
    expect(scoreLocate(goal, { cepKm: 0.8 }, LOCATE_FULL_TRIES)).toEqual({ passed: true, points: 20 });
    expect(scoreLocate(goal, { cepKm: 0.8 }, LOCATE_FULL_TRIES + 1)).toEqual({ passed: true, points: 10 });
    expect(scoreLocate(goal, { cepKm: 1.2 }, 1)).toEqual({ passed: false, points: 0 });
    const d4 = step<ApplyStep>('D4').locate!;
    expect(scoreLocate(d4, { crossingDeg: 76 }, 1).passed).toBe(true);
    expect(scoreLocate(d4, { crossingDeg: 40 }, 1).passed).toBe(false);
  });

  it('scores 100 points with a pass mark of 60', () => {
    const pts = steps().flatMap((s) =>
      s.kind === 'apply' ? [...s.fields.map((f) => f.points), s.locate?.points ?? 0] : s.kind === 'questions' ? s.questions.map((q) => q.points) : []);
    expect(pts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(LEVEL_6.passMark).toBe(60);
  });

  it('F2: a full leg across the line meets 0.5 km, a short one or one toward the transmitter does not', () => {
    for (const s of SEEDS) {
      const t = level6Truth(s);
      const tx = txOf(t);
      expect(dfStepTry(t, 'F2', [{ xKm: tx.xKm - 3, yKm: 0 }, { xKm: tx.xKm + 3, yKm: 0 }], 1, 'leg').cepKm!).toBeLessThan(0.5);
      expect(dfStepTry(t, 'F2', [{ xKm: -1, yKm: 0 }, { xKm: 1, yKm: 0 }], 1, 'leg').cepKm!).toBeGreaterThan(0.5);
      expect(dfStepTry(t, 'F2', [{ xKm: tx.xKm, yKm: -4 }, { xKm: tx.xKm, yKm: 0 }], 1, 'leg').cepKm ?? Infinity).toBeGreaterThan(0.5);
    }
    expect(legPoints({ xKm: -5, yKm: 0 }, { xKm: 5, yKm: 0 })).toHaveLength(13); // cut to 6 km
    expect(step<ApplyStep>('F2').locate!.cepKmAtMost).toBe(0.5);
  });

  it('G4: the enemy correlation peaks within a fifth of a chip of the true time difference', () => {
    for (const s of SEEDS.slice(0, 20)) {
      const t = level6Truth(s);
      const tx = txOf(t);
      const dt = (distanceKm(TDOA_T2, tx) - distanceKm(TDOA_T1, tx)) / C_KM_PER_US;
      expect(Math.abs(xcorrEnemy(t).peakUs - dt) * t.chipRateMcps).toBeLessThan(0.2);
    }
  });

  it('G5: three receivers spread wide meet 0.5 km, three close together do not, and the fix stays on the enemy side', () => {
    for (const s of SEEDS) {
      const t = level6Truth(s);
      const wide = dfStepTry(t, 'G5', [{ xKm: -9, yKm: 0 }, { xKm: 0, yKm: 0 }, { xKm: 9, yKm: 0 }], 1, 'tdoa');
      expect(wide.cepKm!).toBeLessThan(0.5);
      expect(wide.fix!.yKm).toBeGreaterThan(0);
      expect(wide.hyperbolas).toHaveLength(2);
      expect(dfStepTry(t, 'G5', [{ xKm: -2, yKm: 0 }, { xKm: 0, yKm: -2 }, { xKm: 2, yKm: 0 }], 1, 'tdoa').cepKm!).toBeGreaterThan(0.5);
    }
  });

  it('every placeholder in every text resolves', () => {
    for (const s of SEEDS.slice(0, 10)) {
      for (const n of [0, 1, 5]) {
        const v = level6Values(level6Truth(s), n);
        const texts = steps().flatMap((st) => [
          ...('paragraphs' in st ? (st.paragraphs ?? []) : []),
          ...('steps' in st ? (st.steps ?? []) : []),
          ...('task' in st ? [st.task] : []),
          ...('hint' in st && st.hint ? [st.hint] : []),
          ...('worked' in st ? st.worked : []),
          ...('reveal' in st ? st.reveal : []),
          ...(st.kind === 'apply' && st.locate ? [st.locate.task] : []),
        ]);
        for (const x of [...texts, LEVEL_6.debrief]) expect(fillText(x, v), x).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
