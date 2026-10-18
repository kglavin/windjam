import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEVEL_6, dfStepTry, flatSteps, knownLinkInfo, practiceLinkAt, txOf, WEST_SITE } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { DfTask } from './DfTask';
import { SETUPS } from './levelSetup';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel, type StagePanelProps } from './StagePanel';
import { VisualView } from './visuals/VisualView';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');
const flat = flatSteps(LEVEL_6);
const idx = (id: string) => flat.findIndex((f) => f.step.id === id);
const noop = () => {};
const setup = SETUPS[6];
const truth = setup.truth(3);
const budget = sceneBudget(setup.scene(truth));
const practice = knownLinkInfo(practiceLinkAt(0));

function render(current: number, set: (st: StepState[]) => void = () => {}) {
  const states = flat.map((): StepState => ({ done: false }));
  set(states);
  const args = { truth, flat, states, shownIdx: current, step: flat[current]?.step, practice, practiceJsDb: 0, practiceN: 0, budget, base: budget };
  const p: StagePanelProps = {
    level: LEVEL_6, states, current, onView: noop, chipSnrDb: 0, values: setup.values(args),
    onCheckLesson: noop, onCheckPractice: noop, onShowWorked: noop, onTryAnother: noop, onSubmitFields: noop, onRetryStart: noop,
    onCheckRetry: noop, onBack: noop, runPlan: () => undefined, onRunStart: noop, onRunDone: noop, onPredictAgain: noop, onAnswer: noop,
    onContinue: noop, card: setup.card(args), score: scoreLevel(LEVEL_6, states), onReplay: noop, onExit: noop,
  };
  return renderToString(createElement(StagePanel, p));
}

describe('level 6 in the stage panel', () => {
  it('renders every step and the debrief, with no unresolved placeholder', () => {
    for (let i = 0; i <= flat.length; i++) expect(render(i)).not.toMatch(/\{\w+\}/);
  });

  it('D4 offers Take bearings once two sites stand, and reports a try that met the goal', () => {
    const i = idx('D4');
    expect(render(i)).toContain('Take bearings');
    expect(render(i)).toContain('a crossing of 75° or more');
    const last = dfStepTry(truth, 'D4', [WEST_SITE, { xKm: 8, yKm: 0 }], 1);
    const html = render(i, (s) => {
      s[i] = { done: true, df: { sites: [{ xKm: 8, yKm: 0 }], tries: 1, last }, located: { points: 10, tryNo: 1, crossingDeg: 80, cepKm: 0.9 } };
    });
    expect(html).toContain('✓ Try 1: crossing 80°, CEP 0.90 km, 10/10 pts');
    expect(html).not.toContain('Retry (not scored)');
  });
});

describe('the DF view', () => {
  it('draws a lesson example with its bearings, fix and transmitter', () => {
    const html = renderToString(createElement(VisualView, { visual: { kind: 'df', example: 'E1' }, links: { example: LEVEL_6.links.example, practice: LEVEL_6.links.practice } }));
    expect((html.match(/class="df-bearing"/g) ?? []).length).toBe(3);
    expect(html).toContain('df-ellipse');
    expect(html).toContain('df-target');
  });

  it('draws the G2 correlation with its peak, and G4 hyperbola only once answered', () => {
    const html = renderToString(createElement(VisualView, { visual: { kind: 'xcorr', source: 'example' }, links: { example: LEVEL_6.links.example, practice: LEVEL_6.links.practice } }));
    expect(html).toContain('peak 7 µs');
    expect(html).toContain('df-hyperbola');
    const g4 = flat[idx('G4')].step;
    if (g4.kind !== 'apply') throw new Error('G4 is an apply step');
    expect(renderToString(createElement(DfTask, { step: g4, state: { done: false }, truth, onPlace: noop, onRemove: noop }))).not.toContain('df-hyperbola');
    expect(renderToString(createElement(DfTask, { step: g4, state: { done: true }, truth, onPlace: noop, onRemove: noop }))).toContain('df-hyperbola');
  });

  it('hides the transmitter and C3 σ until the step is done', () => {
    const c3 = flat[idx('C3')].step;
    if (c3.kind !== 'apply') throw new Error('C3 is an apply step');
    const open = renderToString(createElement(DfTask, { step: c3, state: { done: false }, truth, onPlace: noop, onRemove: noop }));
    expect(open).not.toContain('df-target');
    expect(open).not.toContain('σ ');
    expect(open).toContain('class="df-bearing"');
    const done = renderToString(createElement(DfTask, { step: c3, state: { done: true }, truth, onPlace: noop, onRemove: noop }));
    expect(done).toContain('df-target');
    expect(done).toContain('df-wedge');
    expect(txOf(truth).yKm).toBeGreaterThan(0);
  });
});
