import { describe, expect, it } from 'vitest';
import { LEVEL_1, LEVELS, type Ctx, type FieldDef, checkField, fillText, level1Truth, textValues } from './levels';

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
  it('step 5 prediction scores 30, 15, 0', () => {
    const field = (LEVEL_1.steps[4].goal as { kind: 'fields'; fields: FieldDef[] }).fields[0];
    expect(checkField(field, 11.8, t, ctx).points).toBe(30);
    expect(checkField(field, 13.5, t, ctx).points).toBe(15);
    expect(checkField(field, 15, t, ctx).points).toBe(0);
  });
});

describe('LEVEL_1', () => {
  it('is in LEVELS and its points sum to 100', () => {
    expect(LEVELS).toEqual([LEVEL_1]);
    let total = 0;
    for (const s of LEVEL_1.steps) {
      if (s.goal.kind === 'fields') total += s.goal.fields.reduce((a, x) => a + x.points, 0);
      if (s.goal.kind === 'questions') total += s.goal.questions.reduce((a, x) => a + x.points, 0);
    }
    expect(total).toBe(100);
    expect(LEVEL_1.passMark).toBe(60);
  });
  it('fillText leaves no placeholder behind', () => {
    const v = textValues(t, { interceptSnrDb: 3.4, rxSnrDb: -6.2, rxEbN0Db: 11 });
    const texts = [LEVEL_1.intro, LEVEL_1.debrief];
    for (const s of LEVEL_1.steps) texts.push(s.task, s.reveal, s.hint ?? '', s.tryThis ?? '');
    for (const x of texts) expect(fillText(x, v)).not.toContain('{');
    expect(fillText('{n} and {n}', { n: '5' })).toBe('5 and 5');
    expect(fillText('{missing}', {})).toBe('{missing}');
  });
});
