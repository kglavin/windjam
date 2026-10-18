import { describe, expect, it } from 'vitest';
import { planRun } from '../berRun';
import { blindBitShares, blindCopies, blindFraction, berBlinded, berBlindedAt } from '../blinding';
import { runBer } from '../run';
import { berBpsk, berBpskJammed, berOneCopyJammed, berPulsedRepetition, berRepetitionMajority, qfunc, undb } from '../theory';
import {
  type ApplyStep,
  type LessonStep,
  type PracticeStep,
  type QuestionsStep,
  type RunSpec,
  type StepDef,
  type Truth,
  BLIND_PULSES,
  EXAMPLE,
  FIRST_PRACTICE,
  GOAL_BER,
  LEVEL_5,
  LEVELS,
  ONE_COPY,
  WHOLE_BIT,
  b3Numbers,
  b3Theory,
  bitsLostShare,
  blindPulseSpec,
  checkField,
  copyBerOf,
  copyUsOf,
  exampleFrontEnd,
  exampleTheory,
  fillText,
  flatSteps,
  knownLinkInfo,
  level5Truth,
  level5Values,
  maxPeriodCopiesOf,
  maxPeriodUsOf,
  periodCopiesOf,
  practiceBlindAt,
  practiceCopyBerAt,
  practiceLinkAt,
  recoveryCopiesOf,
  recoveryUsOf,
  js5BOf,
} from '../levels';
import { DENY_TOLERANCE } from '../levels';

const steps = (): StepDef[] => LEVEL_5.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const lesson = (id: string) => {
  const s = step<LessonStep>(id);
  return [...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' ');
};
const ex = knownLinkInfo(EXAMPLE);
const t3 = level5Truth(3);
const base = { jsDb: 8, ebN0Db: 12 };
const vals = (t = t3, n = 0, run?: Parameters<typeof level5Values>[4]) =>
  level5Values(t, base, knownLinkInfo(practiceLinkAt(n)), n, run);
const SEEDS = Array.from({ length: 80 }, (_, i) => i + 1);

function simulate(spec: RunSpec, t: Truth, entered?: Record<string, number>, scene = { jsDb: 0, ebN0Db: 12 }, maxBits?: number) {
  const plan = planRun(spec, { truth: t, example: ex, practice: FIRST_PRACTICE, practiceJsDb: 15, scene, seed: 11, entered });
  const r = runBer({ ...plan.request, ...(maxBits ? { maxBits } : {}) });
  return { plan, r };
}
const exSpec = (jammer: RunSpec['jammer'], extra: Partial<RunSpec> = {}): RunSpec => ({
  link: 'example', js: 'fixed', jsDb: 15, jammer, repetition: 3, ...extra,
});
const inside = (theory: number, r: { lo: number; hi: number }) => {
  expect(theory).toBeGreaterThanOrEqual(r.lo);
  expect(theory).toBeLessThanOrEqual(r.hi);
};

describe('LEVEL_5 structure', () => {
  it('has units A to D, the listed steps, 100 points, pass mark 60, and is registered', () => {
    expect(LEVEL_5.id).toBe(5);
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(LEVEL_5.title).toBe('Saturation and timing');
    expect(LEVEL_5.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(steps().map((s) => s.id)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1']);
    expect(flatSteps(LEVEL_5)).toHaveLength(10);
    let total = 0;
    for (const s of steps()) {
      if (s.kind === 'apply') total += s.fields.reduce((a, x) => a + x.points, 0) + (s.goal?.points ?? 0);
      if (s.kind === 'questions') total += s.questions.reduce((a, x) => a + x.points, 0);
      if (s.kind === 'practice') for (const f of s.fields) expect(f.points).toBe(0);
    }
    expect(total).toBe(100);
    expect(LEVEL_5.passMark).toBe(60);
    const pts = (id: string) => step<ApplyStep>(id).fields.map((f) => f.points);
    expect(pts('A3')).toEqual([10]);
    expect(pts('B3')).toEqual([10, 20]);
    expect(pts('C3')).toEqual([15]);
    expect(step<ApplyStep>('C3').goal).toMatchObject({ berAtLeast: 0.1, points: 15 });
    expect(step<QuestionsStep>('D1').questions.map((q) => q.points)).toEqual([10, 10, 10]);
  });

  it('every placeholder resolves, for seeds, practice counters, with and without a run', () => {
    const texts: string[] = [LEVEL_5.intro, LEVEL_5.debrief];
    for (const s of steps()) {
      texts.push(s.title);
      if (s.kind === 'lesson') {
        texts.push(...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? '');
        if (s.check) texts.push(s.check.question, s.check.wrong);
      } else if (s.kind === 'practice') texts.push(s.task, s.hint, ...s.worked);
      else if (s.kind === 'apply') {
        texts.push(s.task, s.hint ?? '', ...s.reveal, ...s.fields.map((f) => f.prompt ?? ''));
        if (s.goal) texts.push(s.goal.task);
        for (const f of s.fields) if (f.range) texts.push(f.range.message);
      } else if (s.kind === 'questions') for (const q of s.questions) texts.push(q.text, q.explain, ...q.options);
    }
    const summary = { bits: 20000, errors: 100, ber: 0.005, lo: 0.0041, hi: 0.0061, stoppedBy: 'errors', jsDb: 11.7, ebJ0Db: 3, theoryBer: 0.0065 };
    for (const seed of [1, 2, 3, 4, 5, 6, 7]) {
      const tt = level5Truth(seed);
      for (const c of [0, 1, 2, 5, 9]) {
        for (const run of [undefined, { prediction: 0.006, summary, fields: { period: { value: 5000 } } }]) {
          const v = vals(tt, c, run);
          for (const x of texts) expect(fillText(x, v)).not.toContain('{');
        }
      }
    }
  });
});

describe('A: the vote', () => {
  it('A1: 0.1 becomes 0.028, 0.01 becomes about 0.0003', () => {
    expect(3 * 0.1 * 0.1 * 0.9).toBeCloseTo(0.027, 12);
    expect(0.1 ** 3).toBeCloseTo(0.001, 12);
    expect(berRepetitionMajority(0.1, 3)).toBeCloseTo(0.028, 12);
    expect(berRepetitionMajority(0.01, 3)).toBeCloseTo(0.000298, 6);
    const c = step<LessonStep>('A1').check!;
    expect(c.answer).toBe(0.0003);
    expect(c.tol).toEqual({ factor: 1.3 });
    expect(berRepetitionMajority(0.01, 3)).toBeLessThan(0.0003 * 1.3);
    expect(berRepetitionMajority(0.01, 3)).toBeGreaterThan(0.0003 / 1.3);
    expect(lesson('A1')).toContain('0.027 + 0.001 = 0.028');
  });
  it('A2: the worked numbers add up for every practice counter, first is 0.05', () => {
    expect(practiceCopyBerAt(0)).toBe(0.05);
    for (let n = 0; n < 40; n++) {
      const p = practiceCopyBerAt(n);
      expect([0.05, 0.1, 0.2, 0.02]).toContain(p);
      const v = vals(t3, n);
      expect(v.pCopyBer).toBe(String(p));
      expect(Number(v.pTwo)).toBeCloseTo(3 * p * p * (1 - p), 3);
      expect(Number(v.pThree)).toBeCloseTo(p ** 3, 4);
      expect(Number(v.pVoteBer) / berRepetitionMajority(p, 3)).toBeCloseTo(1, 1);
      const f = (step<PracticeStep>('A2')).fields[0];
      const ctx = { rxSnrDb: 0, rxEbN0Db: 0, practiceN: n };
      expect(checkField(f, berRepetitionMajority(p, 3) * 1.15, t3, ctx).ok).toBe(true);
      expect(checkField(f, berRepetitionMajority(p, 3) * 1.3, t3, ctx).ok).toBe(false);
    }
    const v0 = vals(t3, 0);
    expect([v0.pTwo, v0.pThree, v0.pVoteBer]).toEqual(['0.0071', '0.00013', '0.0073']);
  });
  it('A3: the copy error rate is one of the set, the answer is the vote with factor 1.3', () => {
    for (const seed of SEEDS) {
      const t = level5Truth(seed);
      const p = copyBerOf(t);
      expect([0.04, 0.06, 0.08, 0.12, 0.15]).toContain(p);
      const f = step<ApplyStep>('A3').fields[0];
      const ctx = { rxSnrDb: 0, rxEbN0Db: 0 };
      expect(checkField(f, 3 * p * p * (1 - p) + p ** 3, t, ctx).ok).toBe(true);
      expect(Number(vals(t).voteBer)).toBeCloseTo(berRepetitionMajority(p, 3), 3);
    }
  });
});

describe('theory helpers', () => {
  it('berOneCopyJammed matches enumeration of which copies are wrong', () => {
    for (const [q, p] of [[0.2, 0.01], [0.5, 0.05], [0.1, 0], [0.3, 0.3]]) {
      let sum = 0;
      for (let m = 0; m < 8; m++) {
        const w = [m & 1, (m >> 1) & 1, (m >> 2) & 1];
        const pr = (w[0] ? q : 1 - q) * (w[1] ? p : 1 - p) * (w[2] ? p : 1 - p);
        if (w[0] + w[1] + w[2] >= 2) sum += pr;
      }
      expect(berOneCopyJammed(q, p)).toBeCloseTo(sum, 12);
    }
  });
  it('berPulsedRepetition is duty times the in-pulse group failure plus the clean part', () => {
    const eb = undb(12);
    const ebJ0 = undb(6);
    const q = qfunc(Math.sqrt(2 / (1 / eb + 1 / ((1 / 3) * ebJ0))));
    expect(berPulsedRepetition(eb, ebJ0, 1 / 3)).toBeCloseTo((2 / 3) * berRepetitionMajority(berBpsk(eb), 3) + (1 / 3) * berRepetitionMajority(q, 3), 12);
    expect(berPulsedRepetition(eb, ebJ0, 1)).toBeCloseTo(berRepetitionMajority(berBpskJammed(eb, ebJ0), 3), 12);
  });
  it('blind bit shares agree with a brute-force count of the pattern, for periods that are and are not multiples of 3', () => {
    for (const [period, on, rec] of [[30, 1, 10], [22, 1, 10], [14, 1, 6], [26, 1, 12], [9, 3, 0], [7, 1, 2], [3, 1, 0]]) {
      const blind = blindCopies(period, on, rec);
      const bits = period * 3; // a multiple of both 3 and the period: 3*period copies hold period bits
      const counts = [0, 0, 0, 0];
      for (let b = 0; b < period; b++) {
        let k = 0;
        for (let c = 0; c < 3; c++) if (blind[(3 * b + c) % period]) k++;
        counts[k]++;
      }
      void bits;
      const shares = blindBitShares(period, on, rec);
      counts.forEach((c, i) => expect(shares[i]).toBeCloseTo(c / period, 12));
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
    expect(blindFraction(30, 1, 10)).toBeCloseTo(11 / 30, 12);
    expect(blindBitShares(30, 1, 10)).toEqual([0.6, 0, 0.1, 0.3]);
    expect(berBlinded(0, 30, 1, 10)).toBeCloseTo(0.2, 12);
    expect(berBlindedAt(undb(30), 30, 1, 10)).toBeCloseTo(0.2, 12);
  });
});

describe('B1: pulses against the vote, example link at J/S 15 dB', () => {
  const v = vals();
  it('prints what the code gives: broadband 0.019, one copy 0, whole bits 0.038', () => {
    expect(exampleTheory({ kind: 'bbn' })).toBeCloseTo(0.0185, 3);
    expect(v.exBbnVote).toBe('0.019');
    expect(v.exOneCopy).toBe('0');
    expect(v.exWholeBit).toBe('0.038');
    expect(lesson('B1')).toContain('Theory: broadband noise {exBbnVote}; one copy of every bit {exOneCopy}; all copies of every third bit {exWholeBit}.');
    expect(fillText(lesson('B1'), v)).toContain('Theory: broadband noise 0.019; one copy of every bit 0; all copies of every third bit 0.038.');
  });
  it('all three have the same average power, whole-bit pulses beat broadband noise, one copy loses almost nothing', () => {
    expect(exampleTheory(WHOLE_BIT)).toBeGreaterThan(exampleTheory({ kind: 'bbn' }));
    expect(exampleTheory(ONE_COPY)).toBeLessThan(1e-6);
    const q = berBpskJammed(undb(30), 31 / undb(15) / 3);
    expect(q).toBeGreaterThan(0.1);
    expect(berOneCopyJammed(q, berBpsk(undb(30)))).toBeLessThan(1e-6);
  });
  it('simulation agrees: each theory is inside the run interval', () => {
    for (const [jammer, bits] of [[{ kind: 'bbn' }, undefined], [WHOLE_BIT, undefined], [ONE_COPY, 60_000]] as const) {
      const { plan, r } = simulate(exSpec(jammer), level5Truth(1), undefined, undefined, bits);
      inside(plan.theoryBer, r);
    }
    const { r } = simulate(exSpec(ONE_COPY), level5Truth(1), undefined, undefined, 60_000);
    expect(r.errors).toBe(0);
  });
});

describe('B2 and B3', () => {
  it('B2: copy and bit length of every practice link', () => {
    for (let n = 0; n < 12; n++) {
      const p = knownLinkInfo(practiceLinkAt(n));
      const v = vals(t3, n);
      expect(Number(v.pCopyUs)).toBeCloseTo(p.n / p.chipRateMcps, 1);
      expect(Number(v.pBitUs)).toBeCloseTo((3 * p.n) / p.chipRateMcps, 1);
      const f = step<PracticeStep>('B2').fields[0];
      expect(checkField(f, (3 * p.n) / p.chipRateMcps, t3, { rxSnrDb: 0, rxEbN0Db: 0, practice: p, practiceN: n }).ok).toBe(true);
    }
    const v = vals(t3, 0);
    expect([v.pN, v.pChipRate, v.pCopyUs, v.pBitUs]).toEqual(['63', '2', '31.5', '94.5']);
  });
  it('B3: the printed chain agrees with the code, the theory is 0.005 to 0.2 for 80 seeds and the pulse length is 3 copies', () => {
    let lo = Infinity;
    let hi = 0;
    for (const seed of SEEDS) {
      const t = level5Truth(seed);
      const th = b3Theory(t);
      lo = Math.min(lo, th);
      hi = Math.max(hi, th);
      expect(th).toBeGreaterThanOrEqual(0.005);
      expect(th).toBeLessThanOrEqual(0.2);
      const n = b3Numbers(t);
      expect(n.berWhole / th).toBeGreaterThan(0.85);
      expect(n.berWhole / th).toBeLessThan(1.15);
      const v = vals(t);
      expect(Number(v.groupFail)).toBeCloseTo(berRepetitionMajority(Number(v.qOn), 3), 2);
      expect(v.ebJ0on).toBe(((Math.round(t.gpDb * 10) / 10) - js5BOf(t) - 4.8).toFixed(1));
      const f = step<ApplyStep>('B3').fields[0];
      expect(checkField(f, 3 * copyUsOf(t), t, { rxSnrDb: 0, rxEbN0Db: 0 }).ok).toBe(true);
      expect(Number(v.bitUs)).toBeCloseTo(3 * copyUsOf(t), 1);
    }
    console.log(`B3 theory over 80 seeds: ${lo.toPrecision(2)} to ${hi.toPrecision(2)}`);
  });
  it('B3: simulation agrees with the theory for hidden seeds covering every code length', () => {
    const pick = [31, 63, 127].map((n) => SEEDS.find((sd) => level5Truth(sd).n === n)!);
    for (const seed of pick) {
      const t = level5Truth(seed);
      const spec = (step<ApplyStep>('B3')).run!;
      const { plan, r } = simulate(spec, t);
      expect(plan.jsDb).toBe(js5BOf(t));
      inside(plan.theoryBer, r);
    }
  });
});

describe('C: blinding', () => {
  const v = vals();
  it('C1: 11 blind copies of 30, 4 bits in 10 coin tosses, theory printed 0.20 against broadband 0.019', () => {
    expect(blindFraction(30, 1, 10)).toBeCloseTo(11 / 30, 12);
    const s = blindBitShares(30, 1, 10);
    expect(s[2] + s[3]).toBeCloseTo(0.4, 12);
    const th = exampleTheory(BLIND_PULSES, exampleFrontEnd());
    expect(th).toBeGreaterThan(0.19);
    expect(th).toBeLessThanOrEqual(0.2);
    expect(v.exBlind).toBe('0.20');
    expect(v.exBbnLow).toBe('0.019');
    expect(v.exBlindCopies).toBe('11');
    expect(v.exRecoveryCopies).toBe('10');
    expect(th / exampleTheory({ kind: 'bbn' })).toBeGreaterThan(5);
    expect(1 / 30).toBeCloseTo(0.033, 3);
  });
  it('C1: simulation agrees with the blanking theory for the example', () => {
    const { plan, r } = simulate(exSpec(BLIND_PULSES, { frontEnd: exampleFrontEnd() }), level5Truth(1));
    inside(plan.theoryBer, r);
    expect(r.blankedFraction).toBeGreaterThan(0.3);
    expect(r.blankedFraction).toBeLessThan(0.38);
    // the jammer's own average power, as broadband noise, does far less
    const bb = simulate(exSpec({ kind: 'bbn' }), level5Truth(1));
    expect(r.ber).toBeGreaterThan(5 * bb.r.ber);
  });
  it('C2: the practice fractions', () => {
    expect(practiceBlindAt(0)).toEqual({ rec: 50, pulse: 5, period: 500 });
    expect(vals(t3, 0).pBlindFrac).toBe('0.11');
    for (let n = 0; n < 30; n++) {
      const b = practiceBlindAt(n);
      const v = vals(t3, n);
      expect(Number(v.pBlindFrac)).toBeCloseTo((b.rec + b.pulse) / b.period, 2);
      expect(v.pBlindUs).toBe(String(b.rec + b.pulse));
      const f = step<PracticeStep>('C2').fields[0];
      const truth = (b.rec + b.pulse) / b.period;
      const ctx = { rxSnrDb: 0, rxEbN0Db: 0, practiceN: n };
      expect(checkField(f, truth * 1.04, t3, ctx).ok).toBe(true);
      expect(checkField(f, truth + 0.009, t3, ctx).ok).toBe(true);
      expect(checkField(f, truth * 1.2, t3, ctx).ok).toBe(false);
    }
  });
  it('C3: the answer is 2 (copy + recovery), the period is whole copies, the blind fraction is a half', () => {
    for (const seed of SEEDS) {
      const t = level5Truth(seed);
      const copyUs = copyUsOf(t);
      expect(recoveryUsOf(t)).toBeCloseTo(recoveryCopiesOf(t) * copyUs, 9);
      expect(maxPeriodUsOf(t)).toBeCloseTo(2 * (copyUs + recoveryUsOf(t)), 9);
      expect(periodCopiesOf(maxPeriodUsOf(t), copyUs)).toBe(maxPeriodCopiesOf(t));
      expect(blindFraction(maxPeriodCopiesOf(t), 1, recoveryCopiesOf(t))).toBeCloseTo(0.5, 12);
      const f = step<ApplyStep>('C3').fields[0];
      expect(checkField(f, maxPeriodUsOf(t) * 1.02, t, { rxSnrDb: 0, rxEbN0Db: 0 }).ok).toBe(true);
      expect(checkField(f, maxPeriodUsOf(t) * 1.05, t, { rxSnrDb: 0, rxEbN0Db: 0 }).ok).toBe(false);
    }
  });
  it('C3: the goal is reachable at the correct period for 80 seeds (theory with margin), and a long period misses it', () => {
    let lo = Infinity;
    for (const seed of SEEDS) {
      const t = level5Truth(seed);
      const spec = step<ApplyStep>('C3').run!;
      const plan = planRun(spec, {
        truth: t, example: ex, practice: FIRST_PRACTICE, practiceJsDb: 15,
        scene: { jsDb: 0, ebN0Db: 12 }, seed: 1, entered: { period: maxPeriodUsOf(t) },
      });
      lo = Math.min(lo, plan.theoryBer);
      expect(plan.theoryBer).toBeGreaterThan((GOAL_BER / DENY_TOLERANCE) * 1.1);
      expect(plan.request.frontEnd?.recoverySamples).toBe(recoveryCopiesOf(t) * t.n);
      expect(bitsLostShare(maxPeriodCopiesOf(t), recoveryCopiesOf(t))).toBeGreaterThan(0.2);
      const far = planRun(spec, {
        truth: t, example: ex, practice: FIRST_PRACTICE, practiceJsDb: 15,
        scene: { jsDb: 0, ebN0Db: 12 }, seed: 1, entered: { period: 10 * maxPeriodUsOf(t) },
      });
      expect(far.theoryBer).toBeLessThan(GOAL_BER * DENY_TOLERANCE);
    }
    console.log(`C3 theory at the correct period over 80 seeds: lowest ${lo.toPrecision(3)}`);
  });
  it('C3: simulation agrees with the blanking theory for hidden seeds covering every recovery length, at the right period and at half of it', () => {
    const pick = [6, 8, 10, 12].map((rec) => SEEDS.find((sd) => recoveryCopiesOf(level5Truth(sd)) === rec)!);
    expect(pick.every((x) => x !== undefined)).toBe(true);
    for (const seed of pick) {
      const t = level5Truth(seed);
      const spec = step<ApplyStep>('C3').run!;
      for (const period of [maxPeriodUsOf(t), maxPeriodUsOf(t) / 2]) {
        const { plan, r } = simulate(spec, t, { period });
        inside(plan.theoryBer, r);
        expect(r.ber).toBeGreaterThanOrEqual(GOAL_BER * DENY_TOLERANCE);
        const v = vals(t, 0, { summary: { ...plan, bits: r.bits, errors: r.errors, ber: r.ber, lo: r.lo, hi: r.hi, stoppedBy: r.stoppedBy, jsDb: plan.jsDb, ebJ0Db: plan.ebJ0Db, theoryBer: plan.theoryBer }, fields: { period: { value: period } } });
        expect(v.dutyPct).toBe(String(Number((100 / periodCopiesOf(period, copyUsOf(t))).toPrecision(2))));
      }
    }
  });
  it('a blind pulse spec is one copy long and aligned', () => {
    const s = blindPulseSpec(22, 31);
    expect(s).toMatchObject({ kind: 'pulsed', periodChips: 22 * 31, offsetChips: 0 });
    expect((s as { duty: number }).duty * 22 * 31).toBeCloseTo(31, 9);
  });
});

describe('D: questions and debrief', () => {
  it('q3 is 0.028 and the debrief names the bit length', () => {
    const q = step<QuestionsStep>('D1').questions;
    expect(q[2].options[q[2].correct]).toBe('About 0.028');
    expect(berRepetitionMajority(0.1, 3)).toBeCloseTo(0.028, 12);
    expect(q.map((x) => x.correct)).toEqual([0, 0, 0]);
    expect(fillText(LEVEL_5.debrief, vals())).toContain(`${vals().bitUs} µs on your enemy link`);
  });
});
