import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEVEL_1, flatSteps, knownLinkInfo, level1Truth, practiceLinkAt, textValues } from '../../engine/lab/levels';
import { factsOfTruth, knownFacts } from './knownFacts';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel, type StagePanelProps } from './StagePanel';

const flat = flatSteps(LEVEL_1);
const idx = (id: string) => flat.findIndex((f) => f.step.id === id);
const t = level1Truth(3);
const noop = () => {};

function render(current: number, set: (st: StepState[]) => void, viewing: number | null = null) {
  const states = flat.map((): StepState => ({ done: false }));
  for (let i = 0; i < current; i++) states[i] = { done: true };
  set(states);
  const practice = knownLinkInfo(practiceLinkAt(0));
  const shown = viewing ?? current;
  const step = flat[shown]?.step;
  const p: StagePanelProps = {
    level: LEVEL_1,
    states,
    current,
    viewing,
    onView: noop,
    chipSnrDb: 0,
    values: textValues(t, { rxSnrDb: -6, rxEbN0Db: 11 }, practice),
    onCheckLesson: noop,
    onCheckPractice: noop,
    onShowWorked: noop,
    onTryAnother: noop,
    onSubmitFields: noop,
    onRetryStart: noop,
    onCheckRetry: noop,
    onBack: noop,
    onAnswer: noop,
    onContinue: noop,
    card: step && 'CDEF'.includes(flat[shown].unit.id)
      ? knownFacts(step.kind === 'practice' ? 'practice' : 'enemy', flat, states, shown, step.kind === 'practice' ? practice : factsOfTruth(t))
      : null,
    score: scoreLevel(LEVEL_1, states),
    onReplay: noop,
    onExit: noop,
  };
  return renderToString(createElement(StagePanel, p));
}

describe('StagePanel', () => {
  it('D2 shows only the period group until it is right, then the length group', () => {
    const d2 = idx('D2');
    const before = render(d2, () => {});
    expect(before).toContain('Read the delay of the first peak after 0.');
    expect(before).not.toContain('Code length = 31.5 µs × 2.0 Mcps =');
    expect(before).toContain("This practice link&#x27;s chip rate is 2.0 Mcps (you measured it in C2).");
    expect(before).toContain('Practice link');
    const after = render(d2, (s) => {
      s[d2] = { done: false, fields: { period: { value: 31.5, ok: true, truth: 31.5, points: 0 } } };
    });
    expect(after).toContain('Code length = 31.5 µs × 2.0 Mcps =');
  });
  it('apply groups: D3 length appears after the period is submitted, the card shows the true value', () => {
    const d3 = idx('D3');
    const before = render(d3, () => {});
    expect(before).not.toContain('Code length = ');
    expect(before).toContain('What you know');
    const after = render(d3, (s) => {
      s[d3] = { done: false, fields: { period: { value: 99, ok: false, truth: t.n / t.chipRateMcps, points: 0 } } };
    });
    expect(after).toContain(`Code length = ${Number((t.n / t.chipRateMcps).toFixed(1))} µs`);
  });
  it('shows Back, Try another on a finished practice step, and Retry on a finished apply step', () => {
    const e2 = idx('E2');
    expect(render(e2, (s) => (s[e2] = { done: true, worked: true }))).toContain('Try another');
    expect(render(e2, () => {})).not.toContain('Try another');
    expect(render(e2, () => {})).toContain('Back');
    const c3 = idx('C3');
    const html = render(c3, (s) => (s[c3] = { done: true, fields: { chipRate: { value: 1, ok: true, truth: 1, points: 15 } } }));
    expect(html).toContain('Retry (not scored)');
    expect(html).not.toContain('Practice link');
  });
  it('the debrief notes first attempts', () => {
    expect(render(flat.length, () => {})).toContain('first attempt');
  });
});
