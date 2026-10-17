import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEVEL_5, flatSteps, knownLinkInfo, level5Truth, maxPeriodUsOf, practiceLinkAt, recoveryUsOf } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { SETUPS } from './levelSetup';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel, type StagePanelProps } from './StagePanel';
import { Blinding } from './visuals/Blinding';
import { MajorityVote } from './visuals/MajorityVote';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');
const flat = flatSteps(LEVEL_5);
const idx = (id: string) => flat.findIndex((f) => f.step.id === id);
const noop = () => {};
const setup = SETUPS[5];
const truth = setup.truth(3);
const budget = sceneBudget(setup.scene(truth));
const practice = knownLinkInfo(practiceLinkAt(0));

function render(current: number, set: (st: StepState[]) => void = () => {}) {
  const states = flat.map((): StepState => ({ done: false }));
  set(states);
  const args = {
    truth, flat, states, shownIdx: current, step: flat[current]?.step, practice, practiceJsDb: 15, practiceN: 0, budget, base: budget,
    run: { prediction: states[current]?.prediction, summary: states[current]?.runs?.[0], fields: states[current]?.fields },
  };
  const p: StagePanelProps = {
    level: LEVEL_5, states, current, onView: noop, chipSnrDb: 0, values: setup.values(args),
    onCheckLesson: noop, onCheckPractice: noop, onShowWorked: noop, onTryAnother: noop, onSubmitFields: noop, onRetryStart: noop,
    onCheckRetry: noop, onBack: noop, runPlan: () => undefined, onRunStart: noop, onRunDone: noop, onPredictAgain: noop, onAnswer: noop,
    onContinue: noop, card: setup.card(args), score: scoreLevel(LEVEL_5, states), onReplay: noop, onExit: noop,
  };
  return renderToString(createElement(StagePanel, p));
}

describe('level 5 in the stage panel', () => {
  it('renders every step and the debrief, with no unresolved placeholder', () => {
    for (let i = 0; i <= flat.length; i++) expect(render(i)).not.toMatch(/\{\w+\}/);
  });
  it('the briefing is the intro and A1 describes the vote', () => {
    const html = render(0);
    expect(html).toContain('Level 5: Saturation and timing');
    expect(html).toContain('The enemy link has learned from levels 3 and 4.');
    expect(html).toContain('three copies');
  });
  it('B3 asks for the pulse length first, then the prediction', () => {
    const a = render(idx('B3'));
    expect(a).toContain(`The enemy link has ${truth.n} chips per copy at ${truth.chipRateMcps} Mcps, 3 copies per bit. How long must each pulse be?`);
    expect(a).not.toContain('Your predicted BER');
    const b = render(idx('B3'), (s) => (s[idx('B3')] = { done: false, fields: { pulse: { value: 1, ok: false, truth: 1, points: 0 } } }));
    expect(b).toContain('Your predicted BER');
  });
  it('the card gives Gp, chips per copy and copies per bit, then fills in bit length, recovery and longest period', () => {
    const b2 = render(idx('B3'));
    expect(b2).toContain('Copies per bit');
    expect(b2).toContain('Gp (given)');
    const c3 = render(idx('C3'));
    expect(c3).toContain(`${recoveryUsOf(truth)} µs`.replace(/(\.\d)\d+/, '$1'));
    expect(c3).not.toContain(`${Number(maxPeriodUsOf(truth).toFixed(1))} µs</td>`);
    const done = render(idx('C3'), (s) => (s[idx('C3')] = { done: false, fields: { period: { value: 1, ok: false, truth: 1, points: 0 } } }));
    expect(done).toContain('Longest period');
    expect(done).toContain(`${Number(maxPeriodUsOf(truth).toFixed(1))} µs`);
  });
  it('the visuals render', () => {
    expect(renderToString(createElement(MajorityVote))).toContain('bit lost: 2 copies wrong');
    const b = renderToString(createElement(Blinding));
    expect(b).toContain('blind');
    expect(b).toContain('Blind 11 of every 30 copies: 37% of the time');
  });
});

describe('C3 editable run period', () => {
  const c3 = idx('C3');
  const submitted = { period: { value: 1234, ok: false, truth: maxPeriodUsOf(truth), points: 0 } };
  it('after the field is submitted a Period for this run input appears, pre-filled; before, it does not', () => {
    expect(render(c3)).not.toContain('Period for this run');
    const html = render(c3, (s) => (s[c3] = { done: false, fields: submitted }));
    expect(html).toContain('Period for this run');
    expect(html).toContain('value="1234"');
    const edited = render(c3, (s) => (s[c3] = { done: false, fields: submitted, runInput: 500 }));
    expect(edited).toContain('value="500"');
  });
  it('the not-yet line after a missed run', () => {
    const miss = { bits: 1000, errors: 10, ber: 0.01, lo: 0.005, hi: 0.02, stoppedBy: 'bits', jsDb: 30, ebJ0Db: -9, theoryBer: 0.01 };
    const html = render(c3, (s) => (s[c3] = { done: false, fields: submitted, runs: [miss] }));
    expect(html).toContain('Not there yet. Try a shorter period: the receiver must be blind at least half the time.');
  });
  it('the step declares the editable field', () => {
    const step = flat[c3].step;
    expect(step.kind === 'apply' && step.run?.runInput).toEqual({ field: 'period', label: 'Period for this run', unit: 'µs' });
  });
});

describe('level5Scene', () => {
  it('has a receiver Eb/N0 of 11.5 to 12.5 dB and a jammer, for 80 seeds', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const t = level5Truth(seed);
      const s = setup.scene(t);
      expect(setup.scene(t)).toEqual(s);
      const b = sceneBudget(s);
      expect(b.ebN0Db).toBeGreaterThan(11.3);
      expect(b.ebN0Db).toBeLessThan(12.7);
      expect(b.gpDb).toBeCloseTo(t.gpDb, 6);
      expect(s.jammer.powerW).toBeGreaterThan(0);
      expect(Math.abs(s.jammer.xKm)).toBeLessThan(200);
      expect(Math.abs(s.jammer.yKm)).toBeLessThan(200);
    }
  });
});
