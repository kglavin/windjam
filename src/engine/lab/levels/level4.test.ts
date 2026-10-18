import { describe, expect, it } from 'vitest';
import { plainText } from '../glossary';
import { planRun } from '../berRun';
import { createRng } from '../../rng';
import { mSequence } from '../pn';
import { peakSet, meanRandomPaprDb } from '../peaks';
import { runBer } from '../run';
import { berBpsk, berBpskJammed, berMultitoneLongCode, berToneLongCode, berToneShortCode, undb } from '../theory';
import {
  type ApplyStep,
  type Ctx,
  type LessonStep,
  type PracticeStep,
  type QuestionsStep,
  type StepDef,
  EXAMPLE,
  EX_EBN0_DB,
  EX_JS_DB,
  LEVEL_4,
  LEVELS,
  berText,
  checkField,
  d3Numbers,
  exampleBers,
  fillText,
  flatSteps,
  khzToFtc,
  knownLinkInfo,
  level4Truth,
  level4Values,
  longJsOf,
  offsetOk,
  practiceLinkAt,
  practiceQAt,
  toneBers,
} from '../levels';

const steps = (): StepDef[] => LEVEL_4.units.flatMap((u) => u.steps);
const step = <T extends StepDef>(id: string) => steps().find((s) => s.id === id) as T;
const lesson = (id: string) => {
  const s = step<LessonStep>(id);
  return plainText([...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' '));
};
const ex = knownLinkInfo(EXAMPLE);
const t = level4Truth(3);
const base = { jsDb: 11.7, ebN0Db: 9 };
const N30 = undb(30);
const first = (n = 0) => {
  const p = knownLinkInfo(practiceLinkAt(n));
  return { p, v: level4Values(t, base, p, n, longJsOf(p.gpDb)) };
};

describe('LEVEL_4 structure', () => {
  it('has units A to E, the listed steps, and is registered', () => {
    expect(LEVEL_4.id).toBe(4);
    expect(LEVELS.map((l) => l.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(LEVEL_4.title).toBe('Tones');
    expect(LEVEL_4.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    const ids = steps().map((s) => s.id);
    expect(ids).toEqual(['A1', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3', 'E1']);
    expect(flatSteps(LEVEL_4).map((f) => f.step.id)).toEqual(ids);
    for (const u of LEVEL_4.units) for (const s of u.steps) expect(s.id.startsWith(u.id)).toBe(true);
  });

  it('scores 100 points, pass mark 60, practice never scores', () => {
    let total = 0;
    for (const s of steps()) {
      if (s.kind === 'apply') total += s.fields.reduce((a, x) => a + x.points, 0);
      if (s.kind === 'questions') total += s.questions.reduce((a, x) => a + x.points, 0);
      if (s.kind === 'practice') for (const f of s.fields) expect(f.points).toBe(0);
    }
    expect(total).toBe(100);
    expect(LEVEL_4.passMark).toBe(60);
    const pts = (id: string) => step<ApplyStep>(id).fields.map((f) => f.points);
    expect(pts('B3')).toEqual([20]);
    expect(pts('C3')).toEqual([15, 20]);
    expect(pts('D3')).toEqual([15]);
    expect(step<QuestionsStep>('E1').questions.map((q) => q.points)).toEqual([10, 10, 10]);
    expect(step<ApplyStep>('C3').goal).toBeUndefined();
    expect(step<ApplyStep>('C3').runUnscored).toBe(true);
  });

  it('every placeholder resolves, for several practice links and seeds, with and without a run', () => {
    const texts: string[] = [LEVEL_4.intro, LEVEL_4.debrief];
    for (const s of steps()) {
      texts.push(s.title);
      if (s.kind === 'lesson') {
        texts.push(...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? '');
        if (s.check) texts.push(s.check.question, s.check.wrong);
      } else if (s.kind === 'practice') texts.push(s.task, s.hint, ...s.worked, ...s.fields.map((f) => f.prompt ?? ''));
      else if (s.kind === 'apply') {
        texts.push(s.task, s.hint ?? '', ...s.reveal, ...s.fields.map((f) => f.prompt ?? ''));
        for (const f of s.fields) if (f.range) texts.push(f.range.message);
      } else if (s.kind === 'questions') for (const q of s.questions) texts.push(q.text, q.explain, ...q.options);
    }
    const summary = { bits: 20000, errors: 100, ber: 0.005, lo: 0.0041, hi: 0.0061, stoppedBy: 'errors', jsDb: 11.7, ebJ0Db: 3, theoryBer: 0.0065 };
    for (const seed of [1, 2, 3, 4, 5, 6, 7]) {
      const tt = level4Truth(seed);
      for (const c of [0, 1, 2, 5, 9]) {
        const p = knownLinkInfo(practiceLinkAt(c));
        for (const run of [undefined, { prediction: 0.006, summary, fields: { offset: { value: 40 } } }]) {
          const v = level4Values(tt, base, p, c, longJsOf(p.gpDb), run);
          for (const x of texts) expect(fillText(x, v)).not.toContain('{');
        }
      }
    }
  });
});

describe('numbers in the level 4 texts agree with theory and samples', () => {
  it('A1: 13 dB is about 20 times', () => {
    expect(Math.round(undb(13))).toBe(20);
    const c = step<LessonStep>('A1').check!;
    expect(c.answer).toBe(20);
    expect(c.tol).toEqual({ abs: 1 });
    expect(undb(13)).toBeGreaterThan(19);
    expect(undb(13)).toBeLessThan(21);
    expect(lesson('A1')).toContain('J/S = 10 dB, so the spike carries 10 times');
  });

  it('B1: long code, broadband noise 0.0065, the tone 0.0063 (estimate was about 0.0066)', () => {
    const eb = ex.gpDb - 10;
    expect(berText(berBpskJammed(N30, undb(eb)))).toBe('0.0065');
    expect(berText(berToneLongCode(N30, ex.gp, undb(10), 0.05))).toBe('0.0063');
    expect(lesson('B1')).toContain('broadband noise 0.0065, the tone 0.0063');
    const v = step<LessonStep>('B1').visual as { variants: { label: string; jammer: unknown; code: string }[] };
    expect(v.variants.map((x) => [x.label, x.jammer, x.code])).toEqual([
      ['broadband noise', { kind: 'bbn' }, 'long'],
      ['a tone at +50 kHz', { kind: 'tone', fTc: 0.05 }, 'long'],
    ]);
  });

  it('B2 and B3 values for the first practice link: whole-dB J/S, Eb/J0 about 5 dB, table BER', () => {
    const { v } = first();
    expect(v).toMatchObject({ pGpDb: '18.0', pJsDb: '13', pEbJ0: '5.0', pToneKhz: '100' });
    expect(v.pBer).toBe(berText(berBpsk(undb(5))));
    expect(fillText(step<PracticeStep>('B2').worked[0], v)).toBe(`Eb/J0 = 18.0 − 13 = 5.0 dB → about ${v.pBer}.`);
    for (let seed = 1; seed <= 30; seed++) {
      const tt = level4Truth(seed);
      expect(Number.isInteger(longJsOf(tt.gpDb))).toBe(true);
      expect(Math.abs(tt.gpDb - longJsOf(tt.gpDb) - 5)).toBeLessThanOrEqual(0.5);
      const w = level4Values(tt, base, knownLinkInfo(practiceLinkAt(0)), 0, 13);
      expect(Number(w.gpDb) - Number(w.jsB)).toBeCloseTo(Number(w.ebJ0B), 9);
      expect(Number(w.toneKhz)).toBeCloseTo(50 * tt.chipRateMcps, 9);
    }
  });

  it('C1: line spacing 32.3 kHz; carrier, first-line and broadband BERs at Eb/N0 8 dB, J/S 10 dB', () => {
    expect((1000 / 31).toFixed(1)).toBe('32.3');
    const b = exampleBers();
    expect([EX_EBN0_DB, EX_JS_DB]).toEqual([8, 10]);
    expect(b.carrier).toBeLessThanOrEqual(0.002);
    for (const v of [b.line, b.bbn]) {
      expect(v).toBeGreaterThanOrEqual(0.005);
      expect(v).toBeLessThanOrEqual(0.1);
    }
    expect(b.carrier).toBeCloseTo(berToneShortCode(undb(8), undb(10), mSequence(5), 0), 12);
    expect(berText(b.carrier)).toBe('0.00028');
    expect(berText(b.line)).toBe('0.013');
    expect(berText(b.bbn)).toBe('0.021');
    const v = first().v;
    expect([v.exCarrierBer, v.exLineBer, v.exBbnBer]).toEqual(['0.00028', '0.013', '0.021']);
    expect(lesson('C1')).toContain('1000 kHz ÷ 31 = 32.3 kHz');
    // With no jammer at all the BER at 8 dB is 0.00019: the carrier tone is 1.5 times that, still tiny.
    expect(berText(berBpsk(undb(8)))).toBe('0.00019');
    expect(v.exNoJamBer).toBe('0.00019');
    expect(lesson('C1')).toContain('{exCarrierBer}, against {exNoJamBer} with no jammer at all');
    expect(b.carrier / berBpsk(undb(8))).toBeLessThan(1.6);
    expect(b.line / b.carrier).toBeGreaterThan(40);
    // Midway between the first two lines the code has less, so the tone does less than on the first line.
    const between = berToneShortCode(undb(8), undb(10), mSequence(5), 1.5 / 31);
    expect(between).toBeLessThan(b.line);
    expect(between).toBeLessThan(b.bbn);
    expect(lesson('C1')).toContain('Between the lines it does less, because the code has less there.');
    expect(lesson('C1')).toContain('put it on a line.');
  });

  it('C2: practice line spacing is the chip rate over chips per bit', () => {
    const { p, v } = first();
    expect(v.pBitRate).toBe('31.7');
    expect(fillText(step<PracticeStep>('C2').worked[0], v)).toBe('Line spacing = 2000 ÷ 63 = 31.7 kHz.');
    expect(Number(v.pBitRate)).toBeCloseTo((p.chipRateMcps * 1000) / p.n, 1);
    const p2 = knownLinkInfo(practiceLinkAt(1));
    const f = step<PracticeStep>('C2').fields[0];
    expect(f.truth(t, { rxSnrDb: 0, rxEbN0Db: 0, practice: p2 })).toBeCloseTo((p2.chipRateMcps * 1000) / p2.n, 9);
  });

  it('D1: 8 tones in phase are 9.0 dB (8 times), random phases about 5, Newman about 2.5, from generated samples', () => {
    const z = peakSet('zero');
    expect(z.peakPower / z.meanPower).toBeCloseTo(8, 4);
    expect(z.paprDb.toFixed(1)).toBe('9.0');
    const r = peakSet('random');
    const n = peakSet('newman');
    expect(n.paprDb.toFixed(1)).toBe('2.5');
    const mean = meanRandomPaprDb();
    expect(mean).toBeGreaterThan(4.9);
    expect(mean).toBeLessThan(5.5);
    expect(Math.abs(r.paprDb - mean)).toBeLessThan(0.3);
    const v = first().v;
    expect(v.paprRandom).toBe(r.paprDb.toFixed(1));
    expect(v.paprNewman).toBe('2.5');
    expect(fillText(lesson('D1'), v)).toContain(`random phases it is lower (about ${r.paprDb.toFixed(1)} dB here), and with carefully chosen phases lower still (2.5 dB)`);
    expect(lesson('D1')).toContain('8 times is 9.0 dB');
    expect(step<LessonStep>('D1').check!.answer).toBe(8);
  });

  it('D2 and D3: 10 log10 of the tone count; D3 values by seed', () => {
    expect(practiceQAt(0)).toBe(16);
    for (let c = 1; c < 40; c++) expect([2, 4, 10, 20, 32]).toContain(practiceQAt(c));
    const v = first().v;
    expect(fillText(step<PracticeStep>('D2').worked[0], v)).toBe('PAPR = 10 × log10(16) = 12.0 dB.');
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const tt = level4Truth(seed);
      const { peakLimit, q } = d3Numbers(tt);
      expect([20, 22, 25]).toContain(peakLimit);
      expect([4, 8, 10, 16]).toContain(q);
      seen.add(`${peakLimit}/${q}`);
      const w = level4Values(tt, base, knownLinkInfo(practiceLinkAt(0)), 0, 13);
      expect(Number(w.peakLimit) - Number(w.papr)).toBeCloseTo(Number(w.maxAvg), 9);
      const f = step<ApplyStep>('D3').fields[0];
      expect(f.truth(tt, {} as Ctx)).toBeCloseTo(peakLimit - 10 * Math.log10(q), 9);
      expect(checkField(f, peakLimit - 10 * Math.log10(q) + 0.29, tt, {} as Ctx).points).toBe(15);
      expect(checkField(f, peakLimit - 10 * Math.log10(q) + 0.31, tt, {} as Ctx).points).toBe(0);
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('level 4 field truths', () => {
  const ctx: Ctx = { rxSnrDb: 0, rxEbN0Db: 9, practice: knownLinkInfo(practiceLinkAt(0)), practiceJsDb: 13, practiceN: 0 };
  const field = (sid: string, fid: string) => (steps().find((s) => s.id === sid) as PracticeStep | ApplyStep).fields.find((f) => f.id === fid)!;
  it('C3: line spacing within 3%; the offset is right off the carrier and inside the main hump', () => {
    const sp = field('C3', 'spacing');
    expect(sp.truth(t, ctx)).toBe(t.bitRateKbps);
    expect(checkField(sp, t.bitRateKbps * 1.029, t, ctx).points).toBe(15);
    expect(checkField(sp, t.bitRateKbps * 1.031, t, ctx).points).toBe(0);
    const off = field('C3', 'offset');
    expect(off.group).toBe(2);
    const b = t.bitRateKbps;
    expect(offsetOk(0, t)).toBe(false);
    expect(checkField(off, 0, t, ctx).points).toBe(0);
    expect(checkField(off, 0.2 * b, t, ctx).points).toBe(0); // near the carrier, k = 0
    expect(checkField(off, 1.5 * b, t, ctx).points).toBe(0); // midway between lines
    expect(checkField(off, 0.74 * b, t, ctx).points).toBe(0);
    expect(checkField(off, 0.76 * b, t, ctx).points).toBe(20);
    expect(checkField(off, b, t, ctx).points).toBe(20);
    expect(checkField(off, 1.24 * b, t, ctx).points).toBe(20);
    expect(checkField(off, 1.26 * b, t, ctx).points).toBe(0);
    expect(checkField(off, 2 * b, t, ctx).points).toBe(20);
    const lastLine = Math.floor((t.chipRateMcps * 500) / b) * b;
    expect(checkField(off, lastLine, t, ctx).points).toBe(20);
    expect(checkField(off, t.chipRateMcps * 500 + b, t, ctx).points).toBe(0);
    expect(off.range).toMatchObject({ min: 0, maxKey: 'maxKhz' });
    expect(level4Values(t, base, ctx.practice!, 0, 13).maxKhz).toBe(String(t.chipRateMcps * 500));
  });
  it('B2 and B3 theory references use the long-code tone at negligible noise', () => {
    const p = ctx.practice!;
    expect(field('B2', 'ber').truth(t, ctx)).toBeCloseTo(berToneLongCode(N30, p.gp, undb(13), 0.05), 12);
    expect(field('B3', 'ber').truth(t, ctx)).toBeCloseTo(berToneLongCode(N30, t.gp, undb(longJsOf(t.gpDb)), 0.05), 12);
    expect(step<ApplyStep>('B3').fields[0].fullWithinFactor).toBe(2);
    expect(step<PracticeStep>('B2').fields[0].fullWithinFactor).toBe(2);
  });
  it('D2: PAPR within 0.2 dB, for the counter in play', () => {
    const f = field('D2', 'papr');
    expect(f.truth(t, ctx)).toBeCloseTo(10 * Math.log10(16), 9);
    expect(f.truth(t, { ...ctx, practiceN: 3 })).toBeCloseTo(10 * Math.log10(practiceQAt(3)), 9);
    expect(checkField(f, 12.2, t, ctx).ok).toBe(true);
    expect(checkField(f, 12.3, t, ctx).ok).toBe(false);
  });
});

describe('planRun for level 4', () => {
  const inputs = (seed: number, entered?: Record<string, number>) => ({
    truth: t,
    example: ex,
    practice: knownLinkInfo(practiceLinkAt(0)),
    practiceJsDb: 13,
    scene: { jsDb: 11.7, ebN0Db: 9 },
    seed,
    entered,
  });
  it('khz to fTc: kHz over the chip rate in kHz', () => {
    expect(khzToFtc(50, 1)).toBeCloseTo(0.05, 12);
    expect(khzToFtc(25, 0.5)).toBeCloseTo(0.05, 12);
    expect(khzToFtc(100, 2)).toBeCloseTo(0.05, 12);
    expect(khzToFtc(0, 1)).toBe(0);
  });
  it('B3: a long code with n chips per bit, the tone at fTc 0.05, noise negligible, long-code theory', () => {
    const plan = planRun(step<ApplyStep>('B3').run!, inputs(1));
    expect(plan.request.link.code.length).toBe(8191);
    expect(plan.request.link.chipsPerBit).toBe(t.n);
    expect(plan.request.link.carrierCyclesPerChip).toBe(t.carrierCyclesPerChip);
    expect(plan.request.jammer!.spec).toEqual({ kind: 'tone', fTc: 0.05 });
    expect(plan.jsDb).toBe(longJsOf(t.gpDb));
    expect(plan.ebN0Db).toBe(30);
    expect(plan.gpDb).toBeCloseTo(t.gpDb, 9);
    expect(plan.theoryBer).toBeCloseTo(berToneLongCode(N30, t.gp, undb(plan.jsDb), 0.05), 12);
  });
  it('B2: the practice link with a long code', () => {
    const plan = planRun(step<PracticeStep>('B2').run!, inputs(2));
    const p = knownLinkInfo(practiceLinkAt(0));
    expect(plan.request.link.code.length).toBe(8191);
    expect(plan.request.link.chipsPerBit).toBe(p.n);
    expect(plan.jsDb).toBe(13);
    expect(plan.theoryBer).toBeCloseTo(berToneLongCode(N30, p.gp, undb(13), 0.05), 12);
  });
  it('C3: the offset in kHz becomes fTc on the short code, theory is phase-averaged at the scene Eb/N0', () => {
    const run = step<ApplyStep>('C3').run!;
    const plan = planRun(run, inputs(3, { offset: 40 }));
    const fTc = 40 / (t.chipRateMcps * 1000);
    expect(plan.request.jammer!.spec).toEqual({ kind: 'tone', fTc });
    expect(plan.request.link.code.length).toBe(t.n);
    expect(plan.jsDb).toBe(11.7);
    expect(plan.ebN0Db).toBe(9);
    expect(plan.theoryBer).toBeCloseTo(berToneShortCode(undb(9), undb(11.7), mSequence(t.degree), fTc), 12);
    expect(run.jammerNote!({ offset: 40 }, t.n)).toContain('40 kHz');
    const onCarrier = planRun(run, inputs(3, { offset: 0 }));
    expect(onCarrier.theoryBer).toBeLessThan(plan.theoryBer);
  });
  it('a tone on a short code and a multitone on a long code get their own theory; level 2 and 3 plans are unchanged', () => {
    const tone = planRun({ link: 'example', js: 'fixed', jsDb: 10, ebN0Db: 8, jammer: { kind: 'tone', fTc: 1 / 31 } }, inputs(4));
    expect(tone.theoryBer).toBeCloseTo(berToneShortCode(undb(8), undb(10), mSequence(5), 1 / 31), 12);
    expect(tone.curve(12)).toBeCloseTo(berToneShortCode(undb(8), undb(12), mSequence(5), 1 / 31), 12);
    const multi = planRun({ link: 'example', js: 'fixed', jsDb: 10, code: 'long', jammer: { kind: 'multitone', q: 4, spacing: 0.05, phases: 'random' } }, inputs(5));
    expect(multi.theoryBer).toBeCloseTo(berMultitoneLongCode(N30, 31, undb(10), [-0.075, -0.025, 0.025, 0.075]), 12);
    const bbn = planRun({ link: 'hidden', js: 'scene', jammer: { kind: 'bbn' } }, inputs(6));
    expect(bbn.request.link.code.length).toBe(t.n);
    expect(bbn.theoryBer).toBeCloseTo(berBpskJammed(undb(9), undb(t.gpDb - 11.7)), 12);
  });
});

describe('real runs agree with the numbers in the texts', () => {
  const runAt = (spec: Parameters<typeof planRun>[0], seed: number) => {
    const plan = planRun(spec, { truth: t, example: ex, practice: knownLinkInfo(practiceLinkAt(0)), practiceJsDb: 10, scene: { jsDb: 10, ebN0Db: 30 }, seed });
    return { plan, r: runBer(plan.request) };
  };
  it('B1: long code, broadband noise and a tone at +50 kHz both land near their theory', () => {
    const a = runAt({ link: 'example', js: 'fixed', jsDb: 10, code: 'long', jammer: { kind: 'bbn' } }, 20_251);
    const b = runAt({ link: 'example', js: 'fixed', jsDb: 10, code: 'long', jammer: { kind: 'tone', fTc: 0.05 } }, 20_255);
    expect(berText(a.plan.theoryBer)).toBe('0.0065');
    expect(berText(b.plan.theoryBer)).toBe('0.0063');
    for (const x of [a, b]) {
      expect(x.r.ber).toBeGreaterThan(x.plan.theoryBer / 1.5);
      expect(x.r.ber).toBeLessThan(x.plan.theoryBer * 1.5);
    }
  }, 60000);
  it('C1: the carrier tone is hardly above no jammer; the first-line tone swings with its phase and averages near theory', () => {
    const spec = (fTc: number) => ({ link: 'example' as const, js: 'fixed' as const, jsDb: EX_JS_DB, ebN0Db: EX_EBN0_DB, code: 'short' as const, jammer: { kind: 'tone' as const, fTc } });
    const c = runAt(spec(0), 31_988);
    expect(c.r.ber).toBeLessThan(0.002);
    const bers: number[] = [];
    let theory = 0;
    for (let s = 1; s <= 12; s++) {
      const l = runAt(spec(1 / 31), 31_000 + 977 * s);
      bers.push(l.r.ber);
      theory = l.plan.theoryBer;
    }
    const mean = bers.reduce((a, b) => a + b) / bers.length;
    expect(Math.max(...bers) / Math.min(...bers)).toBeGreaterThan(2);
    expect(mean).toBeGreaterThan(theory / 2);
    expect(mean).toBeLessThan(theory * 2);
  }, 120000);
});

describe('the level 4 scene conditions', () => {
  it('toneBers is what planRun theory gives', () => {
    const b = toneBers(5, 8, 10);
    expect(b.line).toBeCloseTo(exampleBers().line, 12);
    expect(createRng(1)()).toBeGreaterThanOrEqual(0);
  });
});
