import { describe, expect, it } from 'vitest';
import { LEVEL_1, LEVEL_4, flatSteps } from '../../engine/lab/levels';
import { canContinue, isSkipped, leaveStep, nextIndex, notDone } from './levelNav';
import { type StepState, scoreLevel } from './levelState';
import { level1Scene, moveInterceptToSignal } from './levelScene';
import { level1Truth } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';

const flat = flatSteps(LEVEL_4);
const idx = (id: string) => flat.findIndex((f) => f.step.id === id);
const fresh = () => flat.map((): StepState => ({ done: false }));

describe('navigation', () => {
  it('skipping marks a step skipped and moves on, a lesson without a check is done', () => {
    const c3 = idx('C3');
    const s = leaveStep(flat, fresh(), c3);
    expect(isSkipped(s[c3])).toBe(true);
    expect(s[c3].done).toBe(false);
    expect(canContinue(flat[c3].step, s[c3])).toBe(false);
    const a1 = idx('A1'); // lesson with a check: skipped, not done
    expect(isSkipped(leaveStep(flat, fresh(), a1)[a1])).toBe(true);
    const b1 = idx('B1'); // lesson without a check: done by moving on
    const t = leaveStep(flat, fresh(), b1);
    expect(t[b1].done).toBe(true);
    expect(nextIndex(flat, c3)).toBe(c3 + 1);
    expect(nextIndex(flat, flat.length - 1)).toBe(flat.length);
  });
  it('a step jumped to ahead is a plain state; the debrief lists what is not done', () => {
    const s = leaveStep(flat, fresh(), idx('C3'));
    const missing = notDone(flat, s);
    expect(missing).toContain('C3');
    expect(missing).toContain('D3');
    expect(missing).not.toContain('B1');
  });
  it('skipped scores 0, then the first real submission scores normally and clears the skip', () => {
    const c3 = idx('C3');
    let s = leaveStep(flat, fresh(), c3);
    expect(scoreLevel(LEVEL_4, s).total).toBe(0);
    const step = flat[c3].step;
    if (step.kind !== 'apply') throw new Error('C3 is an apply step');
    s = s.map((x, j) =>
      j === c3 ? { ...x, done: true, fields: Object.fromEntries(step.fields.map((f) => [f.id, { value: 0, ok: true, truth: 0, points: f.points }])) } : x,
    );
    expect(scoreLevel(LEVEL_4, s).total).toBe(step.fields.reduce((a, f) => a + f.points, 0));
    expect(isSkipped(s[c3])).toBe(false);
    expect(notDone(flat, s)).not.toContain('C3');
  });
  it('skipping the find step puts the intercept at chip SNR of at least +3 dB', () => {
    const l1 = flatSteps(LEVEL_1);
    expect(l1.some((f) => f.step.kind === 'find')).toBe(true);
    for (const seed of [1, 2, 3, 4, 5]) {
      const scene = level1Scene(level1Truth(seed));
      expect(sceneBudget(scene).intercept.chipSnrDb).toBeLessThan(3);
      expect(sceneBudget(moveInterceptToSignal(scene, 3)).intercept.chipSnrDb).toBeGreaterThanOrEqual(3);
    }
  });
});
