import { describe, expect, it } from 'vitest';
import { LEVEL_1 } from '../../engine/lab/levels';
import { type StepState, scoreLevel } from './levelState';

describe('scoreLevel', () => {
  it('sums parts and applies the pass mark', () => {
    const empty = LEVEL_1.steps.map((): StepState => ({ done: false }));
    expect(scoreLevel(LEVEL_1, empty)).toMatchObject({ total: 0, max: 100, passed: false });
    const full = LEVEL_1.steps.map((s): StepState => {
      if (s.goal.kind === 'fields') {
        return { done: true, fields: Object.fromEntries(s.goal.fields.map((f) => [f.id, { value: 0, ok: true, truth: 0, points: f.points }])) };
      }
      if (s.goal.kind === 'questions') return { done: true, answers: Object.fromEntries(s.goal.questions.map((q) => [q.id, q.correct])) };
      return { done: true };
    });
    const sc = scoreLevel(LEVEL_1, full);
    expect(sc.total).toBe(100);
    expect(sc.characterisation.max).toBe(40);
    expect(sc.prediction.max).toBe(30);
    expect(sc.questions.max).toBe(30);
    expect(sc.passed).toBe(true);
  });
});
