import { describe, expect, it } from 'vitest';
import { LEVEL_1, flatSteps, knownLinkInfo, level1Truth, practiceLinkAt } from '../../engine/lab/levels';
import { factsOfTruth, knownFacts } from './knownFacts';
import type { StepState } from './levelState';

const flat = flatSteps(LEVEL_1);
const idx = (id: string) => flat.findIndex((f) => f.step.id === id);
const blank = () => flat.map((): StepState => ({ done: false }));
const t = { ...level1Truth(3), chipRateMcps: 1, n: 31, degree: 5 as const, gpDb: 10 * Math.log10(31), bitRateKbps: 1000 / 31 };
const f = (rows: ReturnType<typeof knownFacts>['rows'], label: string) => rows.find((r) => r.label === label)!;

describe('knownFacts enemy', () => {
  it('is empty until a step is submitted, then shows the true value with the first entry', () => {
    const st = blank();
    expect(knownFacts('enemy', flat, st, idx('C3'), factsOfTruth(t)).rows.every((r) => r.value === null)).toBe(true);
    st[idx('C3')] = { done: true, fields: { chipRate: { value: 1.2, ok: false, truth: 1, points: 0 } } };
    const card = knownFacts('enemy', flat, st, idx('D1'), factsOfTruth(t));
    expect(card.heading).toBe('What you know');
    expect(f(card.rows, 'Chip rate')).toMatchObject({ value: '1.0 Mcps', you: { text: 'you: 1.2', ok: false } });
    expect(f(card.rows, 'Chip duration').value).toBe('1 µs');
    expect(f(card.rows, 'Code period').value).toBeNull();
  });
  it('fills Gp and bit rate after E3', () => {
    const st = blank();
    st[idx('E3')] = {
      done: true,
      fields: {
        gpDb: { value: 14.9, ok: true, truth: 14.91, points: 15 },
        bitRate: { value: 32, ok: true, truth: 32.26, points: 5 },
      },
    };
    const rows = knownFacts('enemy', flat, st, idx('F2'), factsOfTruth(t)).rows;
    expect(f(rows, 'Gp').value).toBe('31 times (14.9 dB)');
    expect(f(rows, 'Bit rate').value).toBe('32.3 kbps');
  });
});

describe('knownFacts practice', () => {
  const p = knownLinkInfo(practiceLinkAt(0));
  it('chip rate is known from the start of D2, period and length from E2', () => {
    const st = blank();
    const atD2 = knownFacts('practice', flat, st, idx('D2'), p);
    expect(atD2.heading).toBe('Practice link');
    expect(f(atD2.rows, 'Chip rate').value).toBe('2.0 Mcps');
    expect(f(atD2.rows, 'Code period').value).toBeNull();
    const atE2 = knownFacts('practice', flat, st, idx('E2'), p);
    expect(f(atE2.rows, 'Code length (chips per bit)').value).toBe('63 chips');
    expect(f(atE2.rows, 'Gp').value).toBeNull();
  });
  it('fills a value when its field is right or the worked answer was shown', () => {
    const st = blank();
    st[idx('D2')] = { done: false, fields: { period: { value: 31.5, ok: true, truth: 31.5, points: 0 } }, first: { period: { value: 30, ok: false } } };
    const rows = knownFacts('practice', flat, st, idx('D2'), p).rows;
    expect(f(rows, 'Code period')).toMatchObject({ value: '31.5 µs', you: { text: 'you: 30', ok: false } });
    expect(f(rows, 'Code length (chips per bit)').value).toBeNull();
    st[idx('D2')] = { ...st[idx('D2')], worked: true };
    expect(f(knownFacts('practice', flat, st, idx('D2'), p).rows, 'Code length (chips per bit)').value).toBe('63 chips');
  });
});
