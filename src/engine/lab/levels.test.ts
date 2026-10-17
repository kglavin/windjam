import { describe, expect, it } from 'vitest';
import {
  LEVEL_1,
  LEVEL_2,
  LEVELS,
  type ApplyStep,
  type Ctx,
  type FieldDef,
  type LessonStep,
  type PracticeStep,
  type StepDef,
  checkField,
  fillText,
  flatSteps,
  knownLinkInfo,
  level1Truth,
  practiceLinkAt,
  textValues,
  withinTol,
} from './levels';

const ctx: Ctx = { rxSnrDb: -6.2, rxEbN0Db: 11 };
const t = level1Truth(3);

describe('level1Truth', () => {
  it('is deterministic per seed and inside its ranges', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const a = level1Truth(seed);
      expect(level1Truth(seed)).toEqual(a);
      expect([5, 6, 7]).toContain(a.degree);
      expect([0.5, 1, 2]).toContain(a.chipRateMcps);
      expect(a.carrierCyclesPerChip).toBeGreaterThanOrEqual(0);
      expect(a.carrierCyclesPerChip).toBeLessThanOrEqual(0.003);
      expect(a.n).toBe(2 ** a.degree - 1);
      expect(a.gp).toBe(a.n);
      expect(a.bitRateKbps).toBeCloseTo((a.chipRateMcps * 1000) / a.n, 12);
      expect(a.gpDb).toBeCloseTo(10 * Math.log10(a.n), 12);
      seen.add(a.degree * 10 + a.chipRateMcps);
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe('checkField', () => {
  const f = (check: FieldDef['check'], partial?: FieldDef['partial']): FieldDef => ({
    id: 'x', label: 'x', unit: '', truth: () => 100, check, points: 10, partial,
  });
  it('rel', () => {
    expect(checkField(f({ rel: 0.05 }), 104.9, t, ctx).ok).toBe(true);
    expect(checkField(f({ rel: 0.05 }), 94.9, t, ctx)).toMatchObject({ ok: false, points: 0, truth: 100 });
  });
  it('abs', () => {
    expect(checkField(f({ abs: 1 }), 99, t, ctx)).toMatchObject({ ok: true, points: 10 });
    expect(checkField(f({ abs: 1 }), 101.1, t, ctx).ok).toBe(false);
  });
  it('exact', () => {
    expect(checkField(f({ exact: true }), 100, t, ctx).ok).toBe(true);
    expect(checkField(f({ exact: true }), 101, t, ctx).ok).toBe(false);
  });
  it('rejects NaN', () => {
    expect(checkField(f({ rel: 0.5 }, { abs: 1e9, points: 5 }), NaN, t, ctx).points).toBe(0);
  });
  it('partial credit', () => {
    const p = f({ abs: 1 }, { abs: 3, points: 5 });
    expect(checkField(p, 100.5, t, ctx)).toMatchObject({ ok: true, points: 10 });
    expect(checkField(p, 102.5, t, ctx)).toMatchObject({ ok: false, points: 5 });
    expect(checkField(p, 103.5, t, ctx)).toMatchObject({ ok: false, points: 0 });
  });
  it('withinTol handles rel, abs, exact and NaN', () => {
    expect(withinTol({ exact: true }, 70, 70)).toBe(true);
    expect(withinTol({ exact: true }, 69, 70)).toBe(false);
    expect(withinTol({ abs: 0.5 }, 11.4, 11.8)).toBe(true);
    expect(withinTol({ rel: 0.05 }, NaN, 1)).toBe(false);
  });
  it('the Eb/N0 prediction scores 20, 10, 0', () => {
    const step = allSteps().find((s) => s.id === 'F2') as ApplyStep;
    const field = step.fields[0];
    expect(checkField(field, 11.8, t, ctx).points).toBe(20);
    expect(checkField(field, 13.5, t, ctx).points).toBe(10);
    expect(checkField(field, 15, t, ctx).points).toBe(0);
  });
});

const allSteps = (): StepDef[] => LEVEL_1.units.flatMap((u) => u.steps);

describe('LEVEL_1 structure', () => {
  it('is in LEVELS with well-formed units and steps', () => {
    expect(LEVELS).toEqual([LEVEL_1, LEVEL_2]);
    expect(LEVEL_1.units.map((u) => u.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    const ids = allSteps().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(flatSteps(LEVEL_1).map((f) => f.step.id)).toEqual(ids);
    for (const u of LEVEL_1.units) {
      expect(u.steps.length).toBeGreaterThan(0);
      for (const s of u.steps) {
        expect(s.id.startsWith(u.id)).toBe(true);
        expect(s.title.length).toBeGreaterThan(0);
        if (s.kind === 'lesson') {
          expect((s.paragraphs?.length ?? 0) + (s.steps?.length ?? 0)).toBeGreaterThan(0);
          if (s.check) expect(s.check.wrong.length).toBeGreaterThan(0);
        }
        if (s.kind === 'practice') {
          expect(s.fields.length).toBeGreaterThan(0);
          expect(s.worked.length).toBeGreaterThan(0);
          expect(s.hint.length).toBeGreaterThan(0);
        }
        if (s.kind === 'apply') {
          expect(s.fields.length).toBeGreaterThan(0);
          expect(s.reveal.length).toBeGreaterThan(0);
        }
        if (s.kind === 'find') expect(s.reveal.length).toBeGreaterThan(0);
        if (s.kind === 'questions') {
          for (const q of s.questions) {
            expect(q.correct).toBeLessThan(q.options.length);
          }
        }
      }
    }
  });

  it('scores only apply fields and questions, 100 points, pass mark 60', () => {
    let total = 0;
    for (const s of allSteps()) {
      if (s.kind === 'apply') total += s.fields.reduce((a, x) => a + x.points, 0);
      if (s.kind === 'questions') total += s.questions.reduce((a, x) => a + x.points, 0);
      if (s.kind === 'practice') for (const f of s.fields) expect(f.points).toBe(0);
    }
    expect(total).toBe(100);
    expect(LEVEL_1.passMark).toBe(60);
    const pts = (id: string, fid: string) => (allSteps().find((s) => s.id === id) as ApplyStep).fields.find((f) => f.id === fid)!.points;
    expect([pts('C3', 'chipRate'), pts('D3', 'period'), pts('D3', 'length'), pts('E3', 'gpDb'), pts('E3', 'bitRate'), pts('F2', 'rxEbN0')]).toEqual([15, 5, 10, 15, 5, 20]);
  });

  it('practice truths come from the practice link', () => {
    const truth = (id: string, fid: string) => {
      const f = (allSteps().find((s) => s.id === id) as PracticeStep).fields.find((x) => x.id === fid)!;
      return f.truth(t, ctx);
    };
    expect(truth('C2', 'chipRate')).toBe(2);
    expect(truth('D2', 'length')).toBe(63);
    expect(truth('D2', 'period')).toBe(31.5);
    expect(truth('E2', 'gpDb')).toBeCloseTo(17.99, 2);
    expect(truth('E2', 'bitRate')).toBeCloseTo(31.75, 2);
  });

  it('every placeholder in every text resolves', () => {
    const v = textValues(t, { interceptSnrDb: 3.4, rxSnrDb: -6.2, rxEbN0Db: 11 }, knownLinkInfo(practiceLinkAt(4)));
    const texts: string[] = [LEVEL_1.intro, LEVEL_1.debrief];
    for (const s of allSteps()) {
      texts.push(s.title);
      if (s.kind === 'lesson') {
        texts.push(...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? '');
        if (s.check) texts.push(s.check.question, s.check.wrong);
      } else if (s.kind === 'practice') texts.push(s.task, s.hint, ...s.worked, ...s.fields.map((f) => f.prompt ?? ''));
      else if (s.kind === 'apply') texts.push(s.task, s.hint ?? '', ...s.reveal, ...s.fields.map((f) => f.prompt ?? ''));
      else if (s.kind === 'find') texts.push(s.task, s.hint, ...s.reveal);
      else for (const q of s.questions) texts.push(q.text, q.explain, ...q.options);
    }
    for (const x of texts) expect(fillText(x, v)).not.toContain('{');
    expect(fillText('{n} and {n}', { n: '5' })).toBe('5 and 5');
    expect(fillText('{missing}', {})).toBe('{missing}');
  });

  it('textValues gives chipRateK and bitRate', () => {
    const v = textValues({ ...t, n: 127, chipRateMcps: 0.5, bitRateKbps: 500 / 127 }, { rxSnrDb: -6, rxEbN0Db: 15 });
    expect(v.chipRateK).toBe('500');
    expect(v.bitRate).toBe('3.94');
  });
});

describe('numbers written in the texts agree with the known links', () => {
  const ex = knownLinkInfo(LEVEL_1.links.example);
  const pr = knownLinkInfo(LEVEL_1.links.practice);
  const text = (id: string) => {
    const s = allSteps().find((x) => x.id === id) as LessonStep;
    return [...(s.paragraphs ?? []), ...(s.steps ?? []), s.rule ?? ''].join(' ');
  };
  it('example link', () => {
    expect(ex.n).toBe(31);
    expect(ex.chipRateMcps).toBe(1);
    expect(ex.periodUs).toBe(31);
    expect(ex.gpDb.toFixed(1)).toBe('14.9');
    expect(ex.bitRateKbps.toFixed(1)).toBe('32.3');
    expect(1 / ex.chipRateMcps).toBe(1); // chip length in us
    expect(text('E1')).toContain('14.9 dB');
    expect(text('E1')).toContain('32.3 kbps');
    expect(text('E1')).toContain('Gp = 31');
    expect(text('D1')).toContain('31 µs, 62 µs and 93 µs');
    expect(text('D1')).toContain('31 µs × 1 Mcps = 31 chips');
    expect(text('C1')).toContain('31-chip');
    expect(text('C1')).toContain('1.0 Mcps');
    expect(text('A1')).toContain('7 chips');
    expect(Number((-8 + Number(ex.gpDb.toFixed(1))).toFixed(1))).toBe(6.9);
    expect(text('F1')).toContain('6.9 dB');
  });
  it('practice link', () => {
    expect(pr.n).toBe(63);
    expect(pr.chipRateMcps).toBe(2);
    expect(pr.periodUs).toBe(31.5);
    expect(pr.gpDb.toFixed(1)).toBe('18.0');
    expect(pr.bitRateKbps.toFixed(1)).toBe('31.7');
    const worked = (id: string) => (allSteps().find((x) => x.id === id) as PracticeStep).worked.join(' ');
    // The default texts read as before for the first practice link.
    const v = textValues(t, { rxSnrDb: -6, rxEbN0Db: 15 });
    expect(fillText(worked('D2'), v)).toContain('31.5 µs × 2.0 Mcps = 63 chips');
    expect(fillText(worked('C2'), v)).toBe('The nulls are at −2.0 MHz and +2.0 MHz. Bandwidth = 2.0 − (−2.0) = 4.0 MHz. Chip rate = 4.0 ÷ 2 = 2.0 Mcps.');
    expect(fillText(worked('E2'), v)).toBe('Gp = 63 → 10 × log10(63) = 18.0 dB. Bit rate = 2000 kchips/s ÷ 63 = 31.7 kbps.');
    expect(fillText(worked('D2'), v)).toBe('The first peak after 0 is at 31.5 µs. Code length = 31.5 µs × 2.0 Mcps = 63 chips.');
  });
});

describe('practiceLinkAt', () => {
  it('starts at degree 6, 2 Mcps, is deterministic, and never repeats the pair before it', () => {
    expect(practiceLinkAt(0)).toEqual({ degree: 6, chipRateMcps: 2 });
    const seen = new Set<string>();
    for (let c = 1; c <= 60; c++) {
      const a = practiceLinkAt(c);
      expect(practiceLinkAt(c)).toEqual(a);
      expect([5, 6]).toContain(a.degree);
      expect([0.5, 1, 2]).toContain(a.chipRateMcps);
      expect(a).not.toEqual(practiceLinkAt(c - 1));
      seen.add(`${a.degree}:${a.chipRateMcps}`);
    }
    expect(seen.size).toBeGreaterThan(3);
  });
  it('practice truths follow ctx.practice', () => {
    const other = knownLinkInfo({ degree: 5, chipRateMcps: 0.5 });
    const step = allSteps().find((x) => x.id === 'E2') as PracticeStep;
    const c: Ctx = { rxSnrDb: 0, rxEbN0Db: 0, practice: other };
    expect(step.fields[0].truth(t, c)).toBeCloseTo(10 * Math.log10(31), 9);
    expect(step.fields[1].truth(t, c)).toBeCloseTo(500 / 31, 9);
  });
});

describe('Tol factor', () => {
  it('accepts values within a factor of the truth on both sides', () => {
    expect(withinTol({ factor: 1.5 }, 0.0097, 0.0065)).toBe(true);
    expect(withinTol({ factor: 1.5 }, 0.0044, 0.0065)).toBe(true);
    expect(withinTol({ factor: 1.5 }, 0.0099, 0.0065)).toBe(false);
    expect(withinTol({ factor: 1.5 }, 0.004, 0.0065)).toBe(false);
    expect(withinTol({ factor: 1.5 }, 0, 0.0065)).toBe(false);
    expect(withinTol({ factor: 1.5 }, -0.0065, 0.0065)).toBe(false);
  });
});
