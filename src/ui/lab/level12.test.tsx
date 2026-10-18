import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { type ApplyStep, LEVEL_12, flatSteps, guarded, h2Mesh, knownLinkInfo, meshTry, practiceLinkAt } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { MacTimeline } from './instruments/MacTimeline';
import { MeshDemo, MeshJamDemo } from './instruments/MeshMap';
import { DfTask } from './DfTask';
import { SETUPS } from './levelSetup';
import { type StepState, applyDone, scoreLevel } from './levelState';
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
    expect(renderToString(createElement(MacTimeline, { example: 'hello' }))).toContain('27.0 dB less');
    expect(renderToString(createElement(MacTimeline, { example: 'repeater' }))).toContain('range 1.500 km, 0.300 km too far');
    expect(renderToString(createElement(MeshJamDemo, { example: 'csma' }))).toContain('silenced 1.50 km');
    expect(renderToString(createElement(MeshJamDemo, { example: 'backbone' }))).toContain('Cut off from G: 10 radios');
  });

  it('H2: a placement that meets the goal completes the step for 20 points', () => {
    const idx = flat.findIndex((f) => f.step.id === 'H2');
    const h2 = flat[idx].step as ApplyStep;
    const { mesh, goal } = h2Mesh(truth);
    let at = { xKm: 0, yKm: 0 };
    for (let x = 0.25; x < 12 && !at.xKm; x += 0.25) for (let y = 0.25; y < 9; y += 0.25) {
      const p = { xKm: x, yKm: y };
      if (!guarded(mesh, p) && meshTry(mesh, p).cut.length >= goal) { at = p; break; }
    }
    expect(renderToString(createElement(DfTask, { step: h2, state: { done: false }, truth, onPlace: noop, onRemove: noop }))).toContain('outside the 3 km guard');
    const st: StepState = { done: true, df: { sites: [at], tries: 2 }, located: { points: 20, tryNo: 2 } };
    expect(renderToString(createElement(DfTask, { step: h2, state: st, truth, onPlace: noop, onRemove: noop }))).toContain(`(goal ${goal})`);
    expect(applyDone(h2, st)).toBe(true);
    const states = flat.map((_, i): StepState => (i === idx ? st : { done: false }));
    expect(scoreLevel(LEVEL_12, states).total).toBe(20);
  });
});
