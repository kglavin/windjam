import { describe, expect, it } from 'vitest';
import { LEVEL_1, flatSteps } from '../../engine/lab/levels';
import { type StepState, scoreLevel } from './levelState';

describe('scoreLevel', () => {
  it('sums parts and applies the pass mark', () => {
    const flat = flatSteps(LEVEL_1);
    const empty = flat.map((): StepState => ({ done: false }));
    expect(scoreLevel(LEVEL_1, empty)).toMatchObject({ total: 0, max: 100, passed: false });
    const full = flat.map(({ step }): StepState => {
      if (step.kind === 'apply') {
        return { done: true, fields: Object.fromEntries(step.fields.map((f) => [f.id, { value: 0, ok: true, truth: 0, points: f.points }])) };
      }
      if (step.kind === 'practice') {
        // Practice fields are unscored whatever the player does.
        return { done: true, fields: Object.fromEntries(step.fields.map((f) => [f.id, { value: 0, ok: true, truth: 0, points: 99 }])) };
      }
      if (step.kind === 'questions') return { done: true, answers: Object.fromEntries(step.questions.map((q) => [q.id, q.correct])) };
      return { done: true };
    });
    const sc = scoreLevel(LEVEL_1, full);
    expect(sc.total).toBe(100);
    expect(sc.characterisation.max).toBe(50);
    expect(sc.prediction.max).toBe(20);
    expect(sc.questions.max).toBe(30);
    expect(sc.passed).toBe(true);
  });
});
