import { describe, expect, it } from 'vitest';
import { type ApplyStep, type PracticeStep, LEVEL_1, LEVEL_2, flatSteps } from '../../engine/lab/levels';
import { type StepState, applyDone, runDone, scoreLevel } from './levelState';

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

describe('scoreLevel for level 2', () => {
  const flat = flatSteps(LEVEL_2);
  const idx = (id: string) => flat.findIndex((f) => f.step.id === id);
  it('counts the apply fields, the deny goal and the questions: 100 in all', () => {
    const empty = flat.map((): StepState => ({ done: false }));
    expect(scoreLevel(LEVEL_2, empty)).toMatchObject({ total: 0, max: 100, passed: false });
    const full = flat.map(({ step }): StepState => {
      if (step.kind === 'apply') {
        const goal = step.goal ? { points: step.goal.points, run: {} as never, runNo: 1 } : undefined;
        return { done: true, goal, fields: Object.fromEntries(step.fields.map((f) => [f.id, { value: 0, ok: true, truth: 0, points: f.points }])) };
      }
      if (step.kind === 'questions') return { done: true, answers: Object.fromEntries(step.questions.map((q) => [q.id, q.correct])) };
      return { done: true };
    });
    const sc = scoreLevel(LEVEL_2, full);
    expect(sc).toMatchObject({ total: 100, max: 100, passed: true });
    expect(sc.prediction.max).toBe(20);
    expect(sc.questions.max).toBe(30);
    expect(sc.characterisation.max).toBe(50);
  });

  const summary = (ber: number, lo: number, hi: number, jsDb = 12) => ({ bits: 1e5, errors: 100, ber, lo, hi, stoppedBy: 'errors', jsDb, ebJ0Db: 5, theoryBer: ber });
  it('D3: the first run scores the locked prediction, a second run changes nothing', () => {
    const d3 = flat[idx('D3')].step as ApplyStep;
    let st: StepState = { done: false, prediction: 0.0055 };
    st = runDone(d3, st, summary(0.0065, 0.0053, 0.008), 'main');
    expect(st.fields!.ber).toMatchObject({ points: 20, ok: true, grade: 'inside' });
    expect(st.done).toBe(true);
    const again = runDone(d3, { ...st, prediction: 0.0001 }, summary(0.0065, 0.0053, 0.008), 'main');
    expect(again.fields!.ber.points).toBe(20);
    const near = runDone(d3, { done: false, prediction: 0.011 }, summary(0.0065, 0.0053, 0.008), 'main');
    expect(near.fields!.ber).toMatchObject({ points: 10, ok: false, grade: 'near' });
    expect(near.done).toBe(true);
    const miss = runDone(d3, { done: false, prediction: 0.05 }, summary(0.0065, 0.0053, 0.008), 'main');
    expect(miss.fields!.ber.points).toBe(0);
  });
  it('a retry run does not touch the score', () => {
    const d3 = flat[idx('D3')].step as ApplyStep;
    const st = runDone(d3, { done: true, retryRun: { prediction: 0.01 } }, summary(0.0065, 0.0053, 0.008), 'retry');
    expect(st.retryRun!.result!.ber).toBe(0.0065);
    expect(st.fields).toBeUndefined();
    expect(st.runs).toBeUndefined();
  });
  it('E3: done needs the J/S field and the goal; full points within 3 runs, half after', () => {
    const e3 = flat[idx('E3')].step as ApplyStep;
    const fieldDone: StepState = { done: false, fields: { jsNeeded: { value: 16, ok: true, truth: 15.8, points: 15 } } };
    expect(applyDone(e3, fieldDone)).toBe(false);
    let st = runDone(e3, fieldDone, summary(0.02, 0.018, 0.022, 14), 'main');
    expect(st.goal).toBeUndefined();
    expect(st.done).toBe(false);
    st = runDone(e3, st, summary(0.05, 0.045, 0.055, 15), 'main');
    expect(st.done).toBe(false);
    st = runDone(e3, st, summary(0.09, 0.08, 0.1, 16), 'main');
    expect(st.goal).toMatchObject({ points: 15, runNo: 3 });
    expect(st.done).toBe(true);
    const later = runDone(e3, st, summary(0.3, 0.29, 0.31, 20), 'main');
    expect(later.goal!.runNo).toBe(3);
    // A fourth run is the first to pass.
    let slow = fieldDone;
    for (const b of [0.01, 0.02, 0.03]) slow = runDone(e3, slow, summary(b, b, b), 'main');
    slow = runDone(e3, slow, summary(0.1, 0.09, 0.11), 'main');
    expect(slow.goal).toMatchObject({ points: 8, runNo: 4 });
    expect(scoreLevel(LEVEL_2, flat.map((_, i) => (i === idx('E3') ? slow : { done: false }))).total).toBe(15 + 8);
  });
  it('D2 practice: an unscored check, done once the prediction is inside the range or within a factor of 2', () => {
    const d2 = flat[idx('D2')].step as PracticeStep;
    let st = runDone(d2, { done: false, prediction: 0.05 }, summary(0.0065, 0.0053, 0.008), 'main');
    expect(st.done).toBe(false);
    expect(st.fields!.ber).toMatchObject({ ok: false, points: 0, grade: 'miss' });
    expect(st.first!.ber.ok).toBe(false);
    st = runDone(d2, { ...st, prediction: 0.007 }, summary(0.0065, 0.0053, 0.008), 'main');
    expect(st.done).toBe(true);
    expect(st.first!.ber.value).toBe(0.05);
    expect(st.runs).toHaveLength(2);
  });
});
