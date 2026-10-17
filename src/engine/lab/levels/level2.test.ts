import { describe, expect, it } from 'vitest';
import { planRun } from '../berRun';
import { wilson } from '../measure';
import { runBer } from '../run';
import { berBpsk, berBpskJammed, db, qfunc, undb } from '../theory';
import {
  type ApplyStep,
  type Ctx,
  type LessonStep,
  type PracticeStep,
  type QuestionsStep,
  type StepDef,
  BER_TABLE_DB,
  EXAMPLE,
  LEVEL_2,
  berTable,
  berText,
  checkField,
  fillText,
  flatSteps,
  knownLinkInfo,
  level2Truth,
  level2Values,
  practiceJsAt,
  practiceLinkAt,
  scoreDeny,
  scorePrediction,
  tableRowsAround,
} from '../levels';

const steps = (): StepDef[] => LEVEL_2.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const lesson = (id: string) => {
  const s = step<LessonStep>(id);
  return [...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' ');
};
const ex = knownLinkInfo(EXAMPLE);
const t = level2Truth(3);
const base = { jsDb: 10, ebJ0Db: 4.9 };

describe('LEVEL_2 structure', () => {
  it('has units A to F and unique step ids that start with their unit', () => {
    expect(LEVEL_2.id).toBe(2);
    expect(LEVEL_2.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    const ids = steps().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(flatSteps(LEVEL_2).map((f) => f.step.id)).toEqual(ids);
    for (const u of LEVEL_2.units) for (const s of u.steps) expect(s.id.startsWith(u.id)).toBe(true);
    expect(ids).toEqual(['A1', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3', 'E1', 'E2', 'E3', 'F1']);
  });

  it('scores 100 points, pass mark 60, and only apply fields, the deny goal and questions score', () => {
    let total = 0;
    for (const s of steps()) {
      if (s.kind === 'apply') total += s.fields.reduce((a, x) => a + x.points, 0) + (s.goal?.points ?? 0);
      if (s.kind === 'questions') total += s.questions.reduce((a, x) => a + x.points, 0);
      if (s.kind === 'practice') for (const f of s.fields) expect(f.points).toBe(0);
    }
    expect(total).toBe(100);
    expect(LEVEL_2.passMark).toBe(60);
    const pts = (id: string) => step<ApplyStep>(id).fields.reduce((a, f) => a + f.points, 0);
    expect([pts('B3'), pts('C3'), pts('D3'), pts('E3'), step<ApplyStep>('E3').goal!.points]).toEqual([10, 10, 20, 15, 15]);
    expect(step<QuestionsStep>('F1').questions.reduce((a, q) => a + q.points, 0)).toBe(30);
  });

  it('every placeholder in every text resolves, for several practice links and with and without a run', () => {
    const texts: string[] = [LEVEL_2.intro, LEVEL_2.debrief];
    for (const s of steps()) {
      texts.push(s.title);
      if (s.kind === 'lesson') {
        texts.push(...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? '');
        if (s.check) texts.push(s.check.question, s.check.wrong);
      } else if (s.kind === 'practice') texts.push(s.task, s.hint, ...s.worked, ...s.fields.map((f) => f.prompt ?? ''));
      else if (s.kind === 'apply') texts.push(s.task, s.hint ?? '', ...s.reveal, ...s.fields.map((f) => f.prompt ?? ''), s.goal?.task ?? '');
      else if (s.kind === 'questions') for (const q of s.questions) texts.push(q.text, q.explain, ...q.options);
    }
    const summary = { bits: 20000, errors: 100, ber: 0.005, lo: 0.0041, hi: 0.0061, stoppedBy: 'errors', jsDb: 10, ebJ0Db: 4.9, theoryBer: 0.0065 };
    for (const c of [0, 1, 2, 5, 9]) {
      const p = knownLinkInfo(practiceLinkAt(c));
      for (const run of [undefined, { prediction: 0.006, summary }]) {
        const v = level2Values(t, base, p, practiceJsAt(c, p), run);
        for (const x of texts) expect(fillText(x, v)).not.toContain('{');
      }
    }
  });
});

describe('numbers in the level 2 texts agree with theory', () => {
  it('the example link', () => {
    expect(ex.n).toBe(31);
    expect(ex.gpDb.toFixed(1)).toBe('14.9');
    expect(lesson('B1')).toContain('Gp = 14.9 dB (31 chips per bit)');
    expect(lesson('B1')).toContain('14.9 − 10 = 4.9 dB');
    expect(Number((14.9 - 10).toFixed(1))).toBe(4.9);
    expect(step<LessonStep>('B1').visual).toMatchObject({ kind: 'despreadBars', gpDb: 14.9, jsDb: 10 });
  });

  it('A1: 100 times is 20 dB', () => {
    expect(db(100)).toBe(20);
    expect(step<LessonStep>('A1').check!.answer).toBe(20);
  });

  it('C1 and D1: the example BER is 0.0065, between the table rows 4.3 dB and 6 dB', () => {
    const ber = qfunc(Math.sqrt(2 * 10 ** 0.49));
    expect(ber).toBeCloseTo(berBpsk(undb(4.9)), 12);
    expect(berText(ber)).toBe('0.0065');
    expect(lesson('C1')).toContain('The exact value is 0.0065');
    expect(lesson('D1')).toContain('The theory says 0.0065');
    expect(lesson('C1')).toContain('4.3 dB (0.010) and 6 dB (0.0024)');
    expect(berText(berBpsk(undb(4.3)))).toBe('0.010');
    expect(berText(berBpsk(undb(6)))).toBe('0.0024');
    expect(ber).toBeLessThan(0.01);
    expect(ber * 1000).toBeGreaterThan(6);
    expect(ber * 1000).toBeLessThan(7);
  });

  it('BER 0.1 needs Eb/J0 of about -0.9 dB and J/S = Gp + 0.9 = 15.8 dB, about 38 times', () => {
    let lo = -5;
    let hi = 5;
    while (hi - lo > 1e-6) {
      const mid = (lo + hi) / 2;
      if (berBpsk(undb(mid)) > 0.1) lo = mid;
      else hi = mid;
    }
    expect(((lo + hi) / 2).toFixed(1)).toBe('-0.9');
    expect(lesson('C1')).toContain('−0.9 dB');
    expect(lesson('E1')).toContain('14.9 − (−0.9) = 15.8 dB');
    expect((14.9 + 0.9).toFixed(1)).toBe('15.8');
    expect(Math.round(undb(15.8))).toBe(38);
    expect(lesson('E1')).toContain('about 38 times');
    expect(lesson('E1')).toContain('Gp + 0.9 dB');
  });

  it('the BER table prints theory.berBpsk to 2 significant figures, and the level quotes the same rows', () => {
    const rows = berTable();
    expect(rows.map((r) => r.db)).toEqual(BER_TABLE_DB);
    for (const r of rows) {
      const exact = berBpsk(undb(r.db));
      expect(Number(r.text)).toBe(Number(exact.toPrecision(2)));
      expect(r.text).toBe(exact.toPrecision(2));
    }
    // The values in the brief, to within rounding of the last digit.
    const brief = [0.1, 0.079, 0.037, 0.0125, 0.01, 0.0024, 0.001, 0.00019, 0.00001];
    rows.forEach((r, i) => expect(Math.abs(r.ber - brief[i]) / brief[i]).toBeLessThan(0.05));
    expect(rows.map((r) => r.text)).toEqual(['0.10', '0.079', '0.038', '0.013', '0.010', '0.0024', '0.00099', '0.00019', '0.0000097']);
  });

  it('Q1: Eb/J0 = 20 - 10 = 10 dB gives about 4 errors in a million, BER 0.000004', () => {
    const ber = berBpsk(undb(10));
    expect(Math.round(ber * 1e6)).toBe(4);
    expect(Number(ber.toPrecision(1))).toBe(0.000004);
    const q = step<QuestionsStep>('F1').questions[0];
    expect(q.options[q.correct]).toContain('about 4 errors in a million');
    expect(q.explain).toContain('0.000004');
  });

  it('Q2: doubling the chips per bit adds 3 dB', () => {
    expect(Math.round(db(2))).toBe(3);
  });

  it('Q3 and D1: 100 errors pin the BER to about +-20%', () => {
    const w = wilson(100, Math.round(100 / 0.0065));
    expect(w.hi / w.ber - 1).toBeGreaterThan(0.15);
    expect(w.hi / w.ber - 1).toBeLessThan(0.25);
    expect(1 - w.lo / w.ber).toBeGreaterThan(0.15);
    expect(1 - w.lo / w.ber).toBeLessThan(0.25);
  });

  it('the first practice link: Gp 18.0 dB, J/S 12 dB, Eb/J0 6.0 dB', () => {
    const p = knownLinkInfo(practiceLinkAt(0));
    const v = level2Values(t, base, p, practiceJsAt(0, p));
    expect(v.pGpDb).toBe('18.0');
    expect(v.pJsDb).toBe('12');
    expect(v.pEbJ0).toBe('6.0');
    expect(v.pJsNeeded).toBe('18.9');
    expect(fillText(step<PracticeStep>('B2').worked[0], v)).toBe('Eb/J0 = 18.0 − 12 = 6.0 dB.');
    expect(fillText(step<PracticeStep>('E2').worked[0], v)).toBe('J/S = 18.0 + 0.9 = 18.9 dB.');
    expect(fillText(step<PracticeStep>('C2').worked[0], v)).toBe('Eb/J0 = 6.0 dB lies between the rows 4.3 dB and 6 dB.');
    expect(fillText(step<PracticeStep>('C2').worked[1], v)).toBe('The exact BER is 0.0024.');
  });
});

describe('level 2 placeholders from a scene', () => {
  it('arithmetic adds up on screen', () => {
    const tt = level2Truth(5);
    const v = level2Values(tt, { jsDb: 11.24, ebJ0Db: tt.gpDb - 11.24 }, knownLinkInfo(practiceLinkAt(0)), 12);
    expect(Number(v.gpDb) - Number(v.jsDb)).toBeCloseTo(Number(v.ebJ0), 9);
    expect(Number(v.gpDb) + 0.9).toBeCloseTo(Number(v.jsNeeded), 9);
    expect(v.ber).toBe(berText(berBpsk(undb(tt.gpDb - 11.24))));
  });
  it('a run supplies the prediction, the measurement and its own J/S', () => {
    const summary = { bits: 1, errors: 1, ber: 0.0123, lo: 0.01, hi: 0.015, stoppedBy: 'errors', jsDb: 16.04, ebJ0Db: 1, theoryBer: 0.01 };
    const v = level2Values(t, base, knownLinkInfo(practiceLinkAt(0)), 12, { prediction: 0.02, summary });
    expect(v).toMatchObject({ yourPrediction: '0.020', measuredBer: '0.012', lo: '0.010', hi: '0.015', jsDb: '16.0' });
  });
});

describe('tableRowsAround and practiceJsAt', () => {
  it('finds the rows either side', () => {
    expect(tableRowsAround(4.9)).toEqual({ lo: 4.3, hi: 6 });
    expect(tableRowsAround(6)).toEqual({ lo: 4.3, hi: 6 });
    expect(tableRowsAround(-0.1)).toEqual({ lo: -0.9, hi: 0 });
  });
  it('is 12 dB first, then from {6, 9, 12, 15} dB with a countable BER, deterministically', () => {
    expect(practiceJsAt(0, knownLinkInfo(practiceLinkAt(0)))).toBe(12);
    const seen = new Set<number>();
    for (let c = 1; c <= 80; c++) {
      const p = knownLinkInfo(practiceLinkAt(c));
      const js = practiceJsAt(c, p);
      expect(practiceJsAt(c, p)).toBe(js);
      expect([6, 9, 12, 15]).toContain(js);
      expect(p.gpDb - js).toBeGreaterThanOrEqual(-0.9);
      expect(p.gpDb - js).toBeLessThanOrEqual(9.6);
      const around = tableRowsAround(p.gpDb - js);
      expect(around.lo).toBeLessThan(around.hi);
      seen.add(js);
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('level 2 field truths', () => {
  const ctx: Ctx = { rxSnrDb: 0, rxEbN0Db: 25, practice: knownLinkInfo(practiceLinkAt(0)), practiceJsDb: 12, jsDb: 10, ebJ0Db: t.gpDb - 10 };
  const field = (sid: string, fid: string) => (steps().find((s) => s.id === sid) as PracticeStep | ApplyStep).fields.find((f) => f.id === fid)!;
  it('B2, B3, C2, C3, E2, E3', () => {
    expect(field('B2', 'ebJ0').truth(t, ctx)).toBeCloseTo(6, 1);
    expect(field('B3', 'ebJ0').truth(t, ctx)).toBeCloseTo(t.gpDb - 10, 9);
    expect(checkField(field('B3', 'ebJ0'), t.gpDb - 10 + 0.4, t, ctx).points).toBe(10);
    expect(checkField(field('B3', 'ebJ0'), t.gpDb - 10 + 0.6, t, ctx).points).toBe(0);
    expect(field('C2', 'ber').truth(t, ctx)).toBeCloseTo(berBpsk(undb(ctx.practice!.gpDb - 12)), 12);
    const c3 = berBpsk(undb(t.gpDb - 10));
    expect(checkField(field('C3', 'ber'), c3 * 1.4, t, ctx).points).toBe(10);
    expect(checkField(field('C3', 'ber'), c3 / 1.4, t, ctx).points).toBe(10);
    expect(checkField(field('C3', 'ber'), c3 * 1.6, t, ctx).points).toBe(0);
    expect(field('E2', 'jsNeeded').truth(t, ctx)).toBeCloseTo(ctx.practice!.gpDb + 0.9, 9);
    expect(checkField(field('E2', 'jsNeeded'), ctx.practice!.gpDb + 1.1, t, ctx).ok).toBe(true);
    expect(checkField(field('E2', 'jsNeeded'), ctx.practice!.gpDb + 1.3, t, ctx).ok).toBe(false);
    expect(field('E3', 'jsNeeded').truth(t, ctx)).toBeCloseTo(t.gpDb + 0.9, 9);
    expect(checkField(field('E3', 'jsNeeded'), t.gpDb + 1.8, t, ctx).points).toBe(15);
    expect(checkField(field('E3', 'jsNeeded'), t.gpDb + 2.0, t, ctx).points).toBe(0);
  });
  it('predictBer fields are marked and carry the theory as reference', () => {
    expect(field('D2', 'ber').kind).toBe('predictBer');
    expect(field('D3', 'ber').kind).toBe('predictBer');
    expect(field('D3', 'ber').points).toBe(20);
    expect(field('D3', 'ber').truth(t, ctx)).toBeCloseTo(berBpsk(undb(t.gpDb - 10)), 12);
  });
});

describe('scorePrediction', () => {
  const run = { ber: 0.01, lo: 0.008, hi: 0.0125 };
  it('full inside the interval, half within a factor of 2, else 0', () => {
    expect(scorePrediction(0.009, run, 20)).toEqual({ grade: 'inside', points: 20 });
    expect(scorePrediction(0.008, run, 20)).toEqual({ grade: 'inside', points: 20 });
    expect(scorePrediction(0.0125, run, 20)).toEqual({ grade: 'inside', points: 20 });
    expect(scorePrediction(0.019, run, 20)).toEqual({ grade: 'near', points: 10 });
    expect(scorePrediction(0.0051, run, 20)).toEqual({ grade: 'near', points: 10 });
    expect(scorePrediction(0.021, run, 20)).toEqual({ grade: 'miss', points: 0 });
    expect(scorePrediction(0.0049, run, 20)).toEqual({ grade: 'miss', points: 0 });
    expect(scorePrediction(0, run, 20).grade).toBe('miss');
    expect(scorePrediction(NaN, run, 20).grade).toBe('miss');
  });
  it('with no errors counted only the interval counts', () => {
    expect(scorePrediction(1e-6, { ber: 0, lo: 0, hi: 1e-5 }, 20).grade).toBe('inside');
    expect(scorePrediction(1e-4, { ber: 0, lo: 0, hi: 1e-5 }, 20).grade).toBe('miss');
  });
});

describe('scoreDeny', () => {
  const goal = step<ApplyStep>('E3').goal!;
  it('passes at 0.8 of the goal, full within 3 runs, half after', () => {
    expect(scoreDeny(0.0799, goal, 1)).toEqual({ passed: false, points: 0 });
    expect(scoreDeny(0.08, goal, 1)).toEqual({ passed: true, points: 15 });
    expect(scoreDeny(0.3, goal, 3)).toEqual({ passed: true, points: 15 });
    expect(scoreDeny(0.3, goal, 4)).toEqual({ passed: true, points: 8 });
    expect(goal.berAtLeast).toBe(0.1);
  });
});

describe('planRun and a real run', () => {
  const inputs = (seed: number) => ({
    truth: t,
    example: ex,
    practice: knownLinkInfo(practiceLinkAt(0)),
    practiceJsDb: 12,
    scene: { jsDb: 12.5, ebN0Db: 25 },
    seed,
  });
  it('uses the run limits, the right link and J/S', () => {
    const ex1 = planRun({ link: 'example', js: 'fixed', jsDb: 10, jammer: { kind: 'bbn' } }, inputs(1));
    expect(ex1.request).toMatchObject({ s: 1, maxErrors: 100, maxBits: 300_000, timeBoundMs: 8000, seed: 1 });
    expect(ex1.request.link.chipsPerBit).toBe(31);
    expect(db(ex1.request.link.ebN0)).toBeCloseTo(30, 9);
    expect(db(ex1.request.jammer!.js)).toBeCloseTo(10, 9);
    expect(ex1.ebJ0Db).toBeCloseTo(ex.gpDb - 10, 9);
    expect(ex1.theoryBer).toBeCloseTo(berBpskJammed(undb(30), undb(ex.gpDb - 10)), 12);
    expect(berText(ex1.theoryBer)).toBe('0.0065');
    const pr1 = planRun({ link: 'practice', js: 'fixed', jammer: { kind: 'bbn' } }, inputs(2));
    expect(pr1.request.link.chipsPerBit).toBe(63);
    expect(pr1.jsDb).toBe(12);
    const hid = planRun({ link: 'hidden', js: 'scene', jammer: { kind: 'bbn' } }, inputs(3));
    expect(hid.request.link.chipsPerBit).toBe(t.n);
    expect(db(hid.request.link.ebN0)).toBeCloseTo(25, 9);
    expect(hid.jsDb).toBe(12.5);
    expect(hid.curve(12.5)).toBe(hid.theoryBer);
    expect(hid.curve(20)).toBeGreaterThan(hid.curve(10));
  });
  it('the example run at J/S 10 dB stops on 100 errors with theory inside its 95% interval', () => {
    const plan = planRun({ link: 'example', js: 'fixed', jsDb: 10, jammer: { kind: 'bbn' } }, inputs(20_251));
    const r = runBer(plan.request);
    expect(r.stoppedBy).toBe('errors');
    expect(r.errors).toBeGreaterThanOrEqual(100);
    expect(plan.theoryBer).toBeGreaterThanOrEqual(r.lo);
    expect(plan.theoryBer).toBeLessThanOrEqual(r.hi);
  }, 30000);
  it('the hidden link at the scene start has theory inside its interval', () => {
    const plan = planRun({ link: 'hidden', js: 'scene', jammer: { kind: 'bbn' } }, { ...inputs(7), scene: { jsDb: t.gpDb - 4.5, ebN0Db: 25 } });
    const r = runBer(plan.request);
    expect(plan.theoryBer).toBeGreaterThanOrEqual(r.lo);
    expect(plan.theoryBer).toBeLessThanOrEqual(r.hi);
  }, 30000);
});
