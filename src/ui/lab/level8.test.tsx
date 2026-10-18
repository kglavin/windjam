import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEVEL_8, flatSteps, knownLinkInfo, practiceLinkAt } from '../../engine/lab/levels';
import { mSequence } from '../../engine/lab/pn';
import { sceneBudget } from '../../engine/lab/scene';
import { GoldView } from './instruments/GoldView';
import { RebuildView } from './instruments/RebuildView';
import { RegisterView } from './instruments/RegisterView';
import { SETUPS } from './levelSetup';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel, type StagePanelProps } from './StagePanel';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');
const flat = flatSteps(LEVEL_8);
const noop = () => {};
const setup = SETUPS[8];
const truth = setup.truth(3);
const budget = sceneBudget(setup.scene(truth));

function render(current: number) {
  const states = flat.map((): StepState => ({ done: false }));
  const args = { truth, flat, states, shownIdx: current, step: flat[current]?.step, practice: knownLinkInfo(practiceLinkAt(0)), practiceJsDb: 0, practiceN: 0, budget, base: budget };
  const p: StagePanelProps = {
    level: LEVEL_8, states, current, onView: noop, chipSnrDb: 0, values: setup.values(args),
    onCheckLesson: noop, onCheckPractice: noop, onShowWorked: noop, onTryAnother: noop, onSubmitFields: noop, onRetryStart: noop,
    onCheckRetry: noop, onBack: noop, runPlan: () => undefined, onRunStart: noop, onRunDone: noop, onPredictAgain: noop, onAnswer: noop,
    onContinue: noop, card: setup.card(args), score: scoreLevel(LEVEL_8, states), onReplay: noop, onExit: noop,
  };
  return renderToString(createElement(StagePanel, p));
}

describe('level 8 in the stage panel', () => {
  it('renders every step and the debrief, with no unresolved placeholder', () => {
    for (let i = 0; i <= flat.length; i++) expect(render(i)).not.toMatch(/\{\w+\}/);
  });
  it('the intercept hears the enemy code well enough for A3', () => {
    expect(budget.intercept.chipSnrDb).toBeGreaterThanOrEqual(9.9);
  });
});

describe('level 8 instruments', () => {
  it('the register shows its stages and taps', () => {
    const html = renderToString(createElement(RegisterView, { degree: 5 }));
    expect((html.match(/class="reg-stage/g) ?? []).length).toBe(5);
    expect((html.match(/reg-tap/g) ?? []).length).toBe(2);
    expect(html).toContain('step 0 of 31');
  });
  it('the rebuild with 10 chips predicts the other 21 of the example code', () => {
    const html = renderToString(createElement(RebuildView, { code: mSequence(5), start: 10 }));
    expect(html).toContain('21 of 21');
    expect(html).toContain('5 and 3');
    expect(renderToString(createElement(RebuildView, { code: mSequence(5), start: 6 }))).not.toContain('25 of 25');
  });
  it('the Gold view draws both correlations', () => {
    const html = renderToString(createElement(GoldView, {}));
    expect((html.match(/class="gold-auto"/g) ?? []).length).toBe(31);
    expect((html.match(/class="gold-cross"/g) ?? []).length).toBe(31);
  });
});
