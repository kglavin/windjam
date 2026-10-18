import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEVEL_12, flatSteps, knownLinkInfo, practiceLinkAt } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { MacTimeline } from './instruments/MacTimeline';
import { MeshDemo } from './instruments/MeshMap';
import { SETUPS } from './levelSetup';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel, type StagePanelProps } from './StagePanel';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');
const flat = flatSteps(LEVEL_12);
const noop = () => {};
const setup = SETUPS[12];
const truth = setup.truth(3);
const budget = sceneBudget(setup.scene(truth));

function render(current: number) {
  const states = flat.map((): StepState => ({ done: false }));
  const args = { truth, flat, states, shownIdx: current, step: flat[current]?.step, practice: knownLinkInfo(practiceLinkAt(0)), practiceJsDb: 0, practiceN: 0, budget, base: budget };
  const p: StagePanelProps = {
    level: LEVEL_12, states, current, onView: noop, chipSnrDb: 0, values: setup.values(args),
    onCheckLesson: noop, onCheckPractice: noop, onShowWorked: noop, onTryAnother: noop, onSubmitFields: noop, onRetryStart: noop,
    onCheckRetry: noop, onBack: noop, runPlan: () => undefined, onRunStart: noop, onRunDone: noop, onPredictAgain: noop, onAnswer: noop,
    onContinue: noop, card: setup.card(args), score: scoreLevel(LEVEL_12, states), onReplay: noop, onExit: noop,
  };
  return renderToString(createElement(StagePanel, p));
}

describe('level 12', () => {
  it('renders every step and the debrief, with no unresolved placeholder', () => {
    for (let i = 0; i <= flat.length; i++) expect(render(i)).not.toMatch(/\{\w+\}/);
  });

  it('the mesh pictures', () => {
    const route = renderToString(createElement(MeshDemo, { example: 'route' }));
    expect(route).toContain('G → W1 → W4 → N → E2 → E5, 5 hops, 4 relays');
    expect((route.match(/mesh-node/g) ?? []).length).toBe(14);
    expect(renderToString(createElement(MeshDemo, { example: 'flood' }))).toContain('every radio sends it once, 14 sends');
    expect(renderToString(createElement(MeshDemo, { example: 'mpr' }))).toContain('reaching 14 of 14');
    expect(renderToString(createElement(MeshDemo, { example: 'backbone' }))).toContain('6 of 14 radios');
  });

  it('the time lines', () => {
    expect(renderToString(createElement(MacTimeline, { example: 'access' }))).toContain('every 10 ms');
    expect(renderToString(createElement(MacTimeline, { example: 'rts' }))).toContain('collision');
    expect(renderToString(createElement(MacTimeline, { example: 'rtt' }))).toContain('749 m');
  });
});
