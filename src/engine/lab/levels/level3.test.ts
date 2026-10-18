import { describe, expect, it } from 'vitest';
import { plainText } from '../glossary';
import { planRun } from '../berRun';
import { runBer } from '../run';
import { berBpsk, berBpskJammed, berPartialBandDsss, berPulsedBpsk, db, undb } from '../theory';
import {
  type ApplyStep,
  type Ctx,
  type LessonStep,
  type PracticeStep,
  type QuestionsStep,
  type StepDef,
  EXAMPLE,
  LEVEL_3,
  LEVELS,
  berText,
  bestDuty,
  checkField,
  e3PeriodBits,
  fillText,
  flatSteps,
  jsBOf,
  knownLinkInfo,
  level3Truth,
  level3Values,
  practiceJs3At,
  practiceLinkAt,
  scorePrediction,
} from '../levels';

const steps = (): StepDef[] => LEVEL_3.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const lesson = (id: string) => {
  const s = step<LessonStep>(id);
  return plainText([...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' '));
};
const ex = knownLinkInfo(EXAMPLE);
const t = level3Truth(3);
const base = { jsDb: 5.2, ebJ0Db: t.gpDb - 5.2 };
const N30 = undb(30);

describe('LEVEL_3 structure', () => {
  it('has units A to F, the listed steps, and is registered', () => {
    expect(LEVEL_3.id).toBe(3);
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(LEVEL_3.title).toBe('Where to put the power');
    expect(LEVEL_3.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    const ids = steps().map((s) => s.id);
    expect(ids).toEqual(['A1', 'B1', 'B2', 'C1', 'C2', 'C3', 'D1', 'D2', 'E1', 'E2', 'E3', 'F1']);
    expect(flatSteps(LEVEL_3).map((f) => f.step.id)).toEqual(ids);
    for (const u of LEVEL_3.units) for (const s of u.steps) expect(s.id.startsWith(u.id)).toBe(true);
  });

  it('scores 100 points, pass mark 60, practice never scores', () => {
    let total = 0;
    for (const s of steps()) {
      if (s.kind === 'apply') total += s.fields.reduce((a, x) => a + x.points, 0);
      if (s.kind === 'questions') total += s.questions.reduce((a, x) => a + x.points, 0);
      if (s.kind === 'practice') for (const f of s.fields) expect(f.points).toBe(0);
    }
    expect(total).toBe(100);
    expect(LEVEL_3.passMark).toBe(60);
    const pts = (id: string) => step<ApplyStep>(id).fields.map((f) => f.points);
    expect(pts('B2')).toEqual([10]);
    expect(pts('C3')).toEqual([10, 15]);
    expect(pts('D2')).toEqual([10]);
    expect(pts('E3')).toEqual([10, 15]);
    expect(step<QuestionsStep>('F1').questions.map((q) => q.points)).toEqual([10, 10, 10]);
  });

  it('every placeholder resolves, for several practice links, with and without a run', () => {
    const texts: string[] = [LEVEL_3.intro, LEVEL_3.debrief];
    for (const s of steps()) {
      texts.push(s.title);
      if (s.kind === 'lesson') {
        texts.push(...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? '');
        if (s.check) texts.push(s.check.question, s.check.wrong);
      } else if (s.kind === 'practice') texts.push(s.task, s.hint, ...s.worked, ...s.fields.map((f) => f.prompt ?? ''));
      else if (s.kind === 'apply') texts.push(s.task, s.hint ?? '', ...s.reveal, ...s.fields.map((f) => f.prompt ?? ''));
      else if (s.kind === 'questions') for (const q of s.questions) texts.push(q.text, q.explain, ...q.options);
    }
    const summary = { bits: 20000, errors: 100, ber: 0.005, lo: 0.0041, hi: 0.0061, stoppedBy: 'errors', jsDb: 5.2, ebJ0Db: 9.7, theoryBer: 0.0065 };
    for (const c of [0, 1, 2, 5, 9]) {
      const p = knownLinkInfo(practiceLinkAt(c));
      for (const run of [undefined, { prediction: 0.006, summary, fields: { duty: { value: 0.07 } } }]) {
        const v = level3Values(t, base, p, practiceJs3At(c, p), run);
        for (const x of texts) expect(fillText(x, v)).not.toContain('{');
      }
    }
  });
});

describe('numbers in the level 3 texts agree with theory', () => {
  it('B1: broadband 0.0065, a quarter of the band about 0.0061 (both at J/S 10 dB on the example link)', () => {
    const eb = ex.gpDb - 10;
    expect(berText(berBpskJammed(N30, undb(eb)))).toBe('0.0065');
    const partial = berPartialBandDsss(N30, ex.gp, undb(10), 0.25);
    expect(berText(partial)).toBe('0.0061');
    expect(lesson('B1')).toContain('0.0065');
    expect(lesson('B1')).toContain('about 0.0061');
  });

  it('C1: 9.9 dB, 0.0000049, -0.1 dB, 0.081, 0.0081, more than 1000 times', () => {
    expect((ex.gpDb - 5).toFixed(1)).toBe('9.9');
    expect(Number((14.9 - 5).toFixed(1))).toBe(9.9);
    const bb = berBpsk(undb(9.9));
    expect(berText(bb)).toBe('0.0000049');
    expect(Math.round(bb * 1e6)).toBe(5);
    const on = berBpsk(undb(9.9 - 10));
    expect(berText(on)).toBe('0.081');
    expect(Number((9.9 - 10).toFixed(1))).toBe(-0.1);
    expect(berText(0.1 * on)).toBe('0.0081');
    expect((0.1 * on) / bb).toBeGreaterThan(1000);
    // The theory function agrees with the arithmetic in the text.
    expect(berPulsedBpsk(1e12, undb(9.9), 0.1)).toBeCloseTo(0.1 * on, 6);
    const text = lesson('C1');
    for (const s of ['14.9 − 5 = 9.9 dB', 'BER 0.0000049', 'about 5 wrong bits in a million', '9.9 − 10 = −0.1 dB: BER 0.081', '0.1 × 0.081 = 0.0081', 'more than 1000 times']) {
      expect(text).toContain(s);
    }
    expect(step<LessonStep>('C1').visual).toMatchObject({ kind: 'berCurve', marks: [{ db: 9.9 }, { db: -0.1 }] });
  });

  it('D1: pulses one bit long give 0.022, one chip long about 0.0065, a bit is 31 µs', () => {
    expect(berText(berPulsedBpsk(N30, undb(ex.gpDb - 10), 0.1))).toBe('0.022');
    expect(berText(berBpskJammed(N30, undb(ex.gpDb - 10)))).toBe('0.0065');
    const text = lesson('D1');
    expect(text).toContain('BER about 0.022');
    expect(text).toContain('BER about 0.0065');
    expect(text).toContain('31 µs every 310 µs');
    expect(310 * 0.1).toBe(31);
    expect(10 * 0.1).toBe(1);
    expect(31 / 10).toBeCloseTo(3.1, 9);
    const check = step<LessonStep>('D1').check!;
    expect(check.answer).toBe(ex.n / EXAMPLE.chipRateMcps);
    const v = step<LessonStep>('D1').visual as { variants: { jammer: unknown }[] };
    expect(v.variants.map((x) => x.jammer)).toEqual([
      { kind: 'pulsed', duty: 0.1, periodChips: 310 },
      { kind: 'pulsed', duty: 0.1, periodChips: 10 },
    ]);
  });

  it('E1: 9.9 dB is a ratio of 9.8, best duty 0.071, overall 0.0085, a little better than 0.0081', () => {
    const r = undb(9.9);
    expect(r.toFixed(1)).toBe('9.8');
    expect(Number((0.7 / 9.8).toPrecision(2))).toBe(0.071);
    expect(db(0.7)).toBeCloseTo(-1.5, 1);
    const inPulse = berBpsk(0.7);
    expect(Number((0.7 * inPulse).toPrecision(2))).toBe(0.083);
    expect(Number((0.083 / 9.8).toPrecision(2))).toBe(0.0085);
    const text = lesson('E1');
    for (const s of ['a ratio of 9.8', '0.7 ÷ 9.8 = 0.071', '0.083 ÷ 9.8 = 0.0085', '0.0081 at 10%', 'about −1.5 dB']) expect(text).toContain(s);
    // The best duty really is about the worst case for the jammer.
    const best = berPulsedBpsk(1e12, r, 0.7 / r);
    expect(best).toBeGreaterThan(berPulsedBpsk(1e12, r, 0.1));
    expect(best).toBeGreaterThan(berPulsedBpsk(1e12, r, 0.04));
    expect(best).toBeGreaterThan(berPulsedBpsk(1e12, r, 0.2));
  });

  it('A1: 20% duty is 5 times; F: Q3 is 0.7 / 20 = 0.035 and 13 dB is about 20', () => {
    expect(1 / 0.2).toBe(5);
    expect(step<LessonStep>('A1').check!.answer).toBe(5);
    expect(Math.round(undb(13))).toBe(20);
    expect(0.7 / 20).toBeCloseTo(0.035, 12);
    const q3 = step<QuestionsStep>('F1').questions[2];
    expect(q3.options[q3.correct]).toContain('0.035');
    expect(q3.explain).toContain('0.7 ÷ 20 = 0.035');
    for (const q of step<QuestionsStep>('F1').questions) expect(q.options[q.correct]).toBeTruthy();
  });

  it('the first practice link: Gp 18.0 dB, J/S 8, 10.0, 0.0, 0.079, 0.0079, duty 0.07', () => {
    const p = knownLinkInfo(practiceLinkAt(0));
    const v = level3Values(t, base, p, practiceJs3At(0, p));
    expect(v).toMatchObject({ pGpDb: '18.0', pJsDb: '8', pEbJ0: '10.0', pEbJ0on: '0.0', pBerOn: '0.079', pBerPulsed: '0.0079', pEbJ0x: '10', pDutyBest: '0.07' });
    expect(fillText(step<PracticeStep>('C2').worked[0], v)).toBe('Broadband Eb/J0 = 18.0 − 8 = 10.0 dB.');
    expect(fillText(step<PracticeStep>('C2').worked[1], v)).toBe('During a pulse: 10.0 − 10 = 0.0 dB → BER 0.079.');
    expect(fillText(step<PracticeStep>('C2').worked[2], v)).toBe('Overall: 0.1 × 0.079 = 0.0079.');
    expect(fillText(step<PracticeStep>('E2').worked[0], v)).toBe('10.0 dB is a ratio of 10.');
    expect(fillText(step<PracticeStep>('E2').worked[1], v)).toBe('Best duty = 0.7 ÷ 10 = 0.07.');
  });

  it('practice J/S: 8 first, then whole dB giving a broadband Eb/J0 of 8 to 11 dB', () => {
    expect(practiceJs3At(0, knownLinkInfo(practiceLinkAt(0)))).toBe(8);
    const seen = new Set<number>();
    for (let c = 1; c <= 80; c++) {
      const p = knownLinkInfo(practiceLinkAt(c));
      const js = practiceJs3At(c, p);
      expect(practiceJs3At(c, p)).toBe(js);
      expect(Number.isInteger(js)).toBe(true);
      const eb = Number(p.gpDb.toFixed(1)) - js;
      expect(eb).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(eb).toBeLessThanOrEqual(11 + 1e-9);
      seen.add(js);
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('level 3 placeholders from a scene', () => {
  it('arithmetic adds up on screen and the gain is theory pulsed over theory broadband to 2 figures', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const tt = level3Truth(seed);
      const js = 5.37 + seed * 0.43;
      const v = level3Values(tt, { jsDb: js, ebJ0Db: tt.gpDb - js }, knownLinkInfo(practiceLinkAt(0)), 8);
      expect(Number(v.gpDb) - Number(v.jsDb)).toBeCloseTo(Number(v.ebJ0), 9);
      expect(Number(v.ebJ0) - 10).toBeCloseTo(Number(v.ebJ0on), 9);
      expect(Number(v.gpDb) - Number(v.jsB)).toBeCloseTo(Number(v.ebJ0B), 9);
      const eb = Number(v.ebJ0);
      expect(v.berBbn).toBe(berText(berBpsk(undb(eb))));
      expect(v.berPulsed).toBe(berText(0.1 * berBpsk(undb(eb - 10))));
      const gain = berPulsedBpsk(1e12, undb(eb), 0.1) / berBpsk(undb(eb));
      expect(Number(v.gainX)).toBe(Number(gain.toPrecision(2)));
      expect(Number(v.ebJ0x)).toBeCloseTo(undb(eb), 1);
      expect(Number(v.dutyBest)).toBe(Number((0.7 / Number(v.ebJ0x)).toPrecision(2)));
      expect(Number(v.bitUs)).toBeCloseTo(tt.n / tt.chipRateMcps, 1);
    }
  });
  it('a run supplies the prediction, the measurement and the duty', () => {
    const summary = { bits: 1, errors: 1, ber: 0.0123, lo: 0.01, hi: 0.015, stoppedBy: 'errors', jsDb: 5.2, ebJ0Db: 1, theoryBer: 0.0145 };
    const v = level3Values(t, base, knownLinkInfo(practiceLinkAt(0)), 8, { prediction: 0.02, summary, fields: { duty: { value: 0.07 } } });
    expect(v).toMatchObject({ yourPrediction: '0.020', measuredBer: '0.012', lo: '0.010', hi: '0.015', berYourDuty: '0.015', yourDuty: '0.07' });
  });
  it('B2 uses a whole-dB J/S about 5 dB below Gp', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const tt = level3Truth(seed);
      expect(Number.isInteger(jsBOf(tt))).toBe(true);
      expect(Math.abs(tt.gpDb - jsBOf(tt) - 5)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('level 3 field truths', () => {
  const ctx: Ctx = { rxSnrDb: 0, rxEbN0Db: 25, practice: knownLinkInfo(practiceLinkAt(0)), practiceJsDb: 8, jsDb: 5.5, ebJ0Db: t.gpDb - 5.5 };
  const field = (sid: string, fid: string) => (steps().find((s) => s.id === sid) as PracticeStep | ApplyStep).fields.find((f) => f.id === fid)!;
  it('C2 and C3', () => {
    expect(field('C2', 'during').truth(t, ctx)).toBeCloseTo(0, 1);
    expect(field('C2', 'ber').truth(t, ctx)).toBeCloseTo(0.0079, 3);
    expect(field('C2', 'during').group).toBe(1);
    expect(field('C2', 'ber').group).toBe(2);
    const on = t.gpDb - 5.5 - 10;
    expect(field('C3', 'during').truth(t, ctx)).toBeCloseTo(on, 9);
    expect(checkField(field('C3', 'during'), on + 0.4, t, ctx).points).toBe(10);
    expect(checkField(field('C3', 'during'), on + 0.6, t, ctx).points).toBe(0);
    expect(field('C3', 'ber').kind).toBe('predictBer');
    expect(field('C3', 'ber').truth(t, ctx)).toBeCloseTo(berPulsedBpsk(1e12, undb(t.gpDb - 5.5), 0.1), 9);
  });
  it('D2: bit length is n / chip rate within 2%', () => {
    const f = field('D2', 'bitUs');
    const truth = t.n / t.chipRateMcps;
    expect(f.truth(t, ctx)).toBe(truth);
    expect(checkField(f, truth * 1.019, t, ctx).points).toBe(10);
    expect(checkField(f, truth * 1.03, t, ctx).points).toBe(0);
  });
  it('E2 and E3: best duty, a factor 1.3 and 1.5, a duty between 0.01 and 1', () => {
    const r = undb(t.gpDb - 5.5);
    expect(field('E3', 'duty').truth(t, ctx)).toBeCloseTo(0.7 / r, 9);
    const best = 0.7 / r;
    expect(checkField(field('E3', 'duty'), best * 1.45, t, ctx).points).toBe(10);
    expect(checkField(field('E3', 'duty'), best / 1.45, t, ctx).points).toBe(10);
    expect(checkField(field('E3', 'duty'), best * 1.6, t, ctx).points).toBe(0);
    const pr0 = undb(ctx.practice!.gpDb - 8);
    expect(field('E2', 'duty').truth(t, ctx)).toBeCloseTo(0.7 / pr0, 9);
    expect(checkField(field('E2', 'duty'), 0.7 / pr0 * 1.25, t, ctx).ok).toBe(true);
    expect(checkField(field('E2', 'duty'), 0.7 / pr0 * 1.35, t, ctx).ok).toBe(false);
    for (const f of [field('E2', 'duty'), field('E3', 'duty')]) expect(f.range).toMatchObject({ min: 0.01, max: 1 });
    expect(bestDuty(0.5)).toBe(1);
  });
});

describe('planRun for level 3', () => {
  const inputs = (seed: number, entered?: Record<string, number>) => ({
    truth: t,
    example: ex,
    practice: knownLinkInfo(practiceLinkAt(0)),
    practiceJsDb: 8,
    scene: { jsDb: 5.5, ebN0Db: 25 },
    seed,
    entered,
  });
  it('B2: a fixed J/S from the truth, a quarter-band jammer, partial-band theory', () => {
    const plan = planRun(step<ApplyStep>('B2').run!, inputs(1));
    expect(plan.jsDb).toBe(jsBOf(t));
    expect(plan.request.jammer!.spec).toEqual({ kind: 'partial', rho: 0.25 });
    expect(plan.theoryBer).toBeCloseTo(berPartialBandDsss(undb(25), t.gp, undb(jsBOf(t)), 0.25), 12);
  });
  it('C3: 10% pulses, 10 bits per period, aligned, pulsed theory at the scene J/S', () => {
    const plan = planRun(step<ApplyStep>('C3').run!, inputs(2));
    expect(plan.request.jammer!.spec).toEqual({ kind: 'pulsed', duty: 0.1, periodChips: 10 * t.n });
    expect(plan.jsDb).toBe(5.5);
    expect(plan.theoryBer).toBeCloseTo(berPulsedBpsk(undb(25), undb(t.gpDb - 5.5), 0.1), 12);
    expect(plan.curve(8)).toBeGreaterThan(0);
  });
  it('E3: the jammer comes from the entered duty, the period grows when a pulse would be under a bit', () => {
    const run = step<ApplyStep>('E3').run!;
    const a = planRun(run, inputs(3, { duty: 0.1 }));
    expect(a.request.jammer!.spec).toEqual({ kind: 'pulsed', duty: 0.1, periodChips: 10 * t.n });
    expect(run.jammerNote!({ duty: 0.1 }, t.n)).toBeUndefined();
    const b = planRun(run, inputs(3, { duty: 0.05 }));
    expect(b.request.jammer!.spec).toEqual({ kind: 'pulsed', duty: 0.05, periodChips: 20 * t.n });
    expect(0.05 * 20).toBeGreaterThanOrEqual(1);
    expect(run.jammerNote!({ duty: 0.05 }, t.n)).toContain('period of 20 bits');
    expect(e3PeriodBits(0.07)).toBe(15);
    expect(e3PeriodBits(0.3)).toBe(10);
    expect(e3PeriodBits(0.01)).toBe(100);
    expect(e3PeriodBits(1)).toBe(10);
    for (const duty of [0.01, 0.033, 0.05, 0.07, 0.2, 1]) expect(duty * e3PeriodBits(duty)).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(b.theoryBer).toBeCloseTo(berPulsedBpsk(undb(25), undb(t.gpDb - 5.5), 0.05), 12);
  });
  it('level 2 plans still use broadband theory', () => {
    const plan = planRun({ link: 'hidden', js: 'scene', jammer: { kind: 'bbn' } }, inputs(4));
    expect(plan.theoryBer).toBeCloseTo(berBpskJammed(undb(25), undb(t.gpDb - 5.5)), 12);
  });
});

describe('real runs agree with the numbers in the texts', () => {
  const run = (jammer: Parameters<typeof planRun>[0]['jammer'], js: number, seed: number) => {
    const plan = planRun(
      { link: 'example', js: 'fixed', jsDb: js, jammer },
      { truth: t, example: ex, practice: knownLinkInfo(practiceLinkAt(0)), practiceJsDb: js, scene: { jsDb: js, ebN0Db: 30 }, seed },
    );
    return { plan, r: runBer(plan.request) };
  };
  it('B1: broadband and quarter-band both inside their theory ranges', () => {
    const a = run({ kind: 'bbn' }, 10, 20_251);
    expect(a.plan.theoryBer).toBeGreaterThanOrEqual(a.r.lo);
    expect(a.plan.theoryBer).toBeLessThanOrEqual(a.r.hi);
    const b = run({ kind: 'partial', rho: 0.25 }, 10, 20_255);
    expect(berText(b.plan.theoryBer)).toBe('0.0061');
    // The demo's seed for the second variant (BerRunDemo: DEMO_SEED + 4).
    expect(b.plan.theoryBer).toBeGreaterThanOrEqual(b.r.lo);
    expect(b.plan.theoryBer).toBeLessThanOrEqual(b.r.hi);
  }, 60000);
  it('C1: 10% pulses at J/S 5 dB give about 0.0081', () => {
    const c = run({ kind: 'pulsed', duty: 0.1, periodChips: 310 }, 5, 7);
    expect(berText(c.plan.theoryBer)).toBe('0.0081');
    expect(c.plan.theoryBer).toBeGreaterThanOrEqual(c.r.lo);
    expect(c.plan.theoryBer).toBeLessThanOrEqual(c.r.hi);
  }, 60000);
  it('D1: one-bit pulses about 0.022, one-chip pulses about as bad as broadband noise', () => {
    const bit = run({ kind: 'pulsed', duty: 0.1, periodChips: 310 }, 10, 20_251);
    expect(berText(bit.plan.theoryBer)).toBe('0.022');
    expect(bit.plan.theoryBer).toBeGreaterThanOrEqual(bit.r.lo);
    expect(bit.plan.theoryBer).toBeLessThanOrEqual(bit.r.hi);
    const chip = run({ kind: 'pulsed', duty: 0.1, periodChips: 10 }, 10, 20_255);
    const bb = berBpskJammed(N30, undb(ex.gpDb - 10));
    expect(chip.r.ber).toBeGreaterThan(bb * 0.7);
    expect(chip.r.ber).toBeLessThan(bb * 1.4);
  }, 60000);
});

describe('B2 scoring with fullWithinFactor', () => {
  const run = { ber: 0.004, lo: 0.0035, hi: 0.0046 };
  it('B2 sets the knob to 2 and its texts say so', () => {
    const b2 = step<ApplyStep>('B2');
    expect(b2.fields[0].fullWithinFactor).toBe(2);
    expect(b2.hint).toContain('It will do no better than broadband noise, often a little worse.');
    expect(b2.reveal[2]).toBe('Squeezed into part of the band, the noise did no better than broadband noise: despreading spread it back out.');
  });
  it('full inside the interval or within a factor of 2, half within a factor of 3, else 0', () => {
    expect(scorePrediction(0.004, run, 10, 2)).toEqual({ grade: 'inside', points: 10 });
    expect(scorePrediction(0.0079, run, 10, 2)).toEqual({ grade: 'near', points: 10 });
    expect(scorePrediction(0.0021, run, 10, 2)).toEqual({ grade: 'near', points: 10 });
    expect(scorePrediction(0.0119, run, 10, 2)).toEqual({ grade: 'wide', points: 5 });
    expect(scorePrediction(0.0014, run, 10, 2)).toEqual({ grade: 'wide', points: 5 });
    expect(scorePrediction(0.0125, run, 10, 2)).toEqual({ grade: 'miss', points: 0 });
    expect(scorePrediction(0.0012, run, 10, 2)).toEqual({ grade: 'miss', points: 0 });
    expect(scorePrediction(0, run, 10, 2).grade).toBe('miss');
  });
  it('without the knob a factor of 2 still earns half', () => {
    expect(scorePrediction(0.0079, run, 10)).toEqual({ grade: 'near', points: 5 });
    expect(scorePrediction(0.0119, run, 10)).toEqual({ grade: 'miss', points: 0 });
  });
});
