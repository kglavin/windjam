import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEVEL_9, b3GoalDb, findTarget, flatSteps, knownLinkInfo, practiceLinkAt } from '../../engine/lab/levels';
import { jammerDistanceForJs, sceneBudget } from '../../engine/lab/scene';
import { DistanceView } from './instruments/DistanceView';
import { PlatformCard } from './instruments/PlatformCard';
import { moveJammerToJs } from './levelScene';
import { SETUPS } from './levelSetup';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel, type StagePanelProps } from './StagePanel';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');
const flat = flatSteps(LEVEL_9);
const noop = () => {};
const setup = SETUPS[9];
const idx = (id: string) => flat.findIndex((f) => f.step.id === id);

function render(current: number, truth = setup.truth(3)) {
  const budget = sceneBudget(setup.scene(truth));
  const states = flat.map((): StepState => ({ done: false }));
  const args = { truth, flat, states, shownIdx: current, step: flat[current]?.step, practice: knownLinkInfo(practiceLinkAt(0)), practiceJsDb: 0, practiceN: 0, budget, base: budget };
  const st = flat[current]?.step;
  const p: StagePanelProps = {
    level: LEVEL_9, states, current, onView: noop, chipSnrDb: 0, values: setup.values(args),
    findMeter: st?.kind === 'find' && st.measure === 'js' ? { label: 'J/S at the enemy receiver', value: budget.jsDb, target: findTarget(st, truth) } : undefined,
    onCheckLesson: noop, onCheckPractice: noop, onShowWorked: noop, onTryAnother: noop, onSubmitFields: noop, onRetryStart: noop,
    onCheckRetry: noop, onBack: noop, runPlan: () => undefined, onRunStart: noop, onRunDone: noop, onPredictAgain: noop, onAnswer: noop,
    onContinue: noop, card: setup.card(args), score: scoreLevel(LEVEL_9, states), onReplay: noop, onExit: noop,
  };
  return renderToString(createElement(StagePanel, p));
}

describe('level 9 in the stage panel', () => {
  it('renders every step and the debrief, with no unresolved placeholder', () => {
    for (let i = 0; i <= flat.length; i++) expect(render(i)).not.toMatch(/\{\w+\}/);
  });

  it('B3 starts well below its J/S goal, and the goal is reachable by moving the jammer', () => {
    for (let s = 1; s <= 20; s++) {
      const t = setup.truth(s);
      const scene = setup.scene(t);
      const start = sceneBudget(scene).jsDb;
      expect(b3GoalDb(t) - start).toBeGreaterThan(10);
      const km = jammerDistanceForJs(scene, b3GoalDb(t));
      expect(km).toBeGreaterThan(0.2);
      expect(sceneBudget(moveJammerToJs(scene, b3GoalDb(t))).jsDb).toBeGreaterThanOrEqual(b3GoalDb(t));
    }
    expect(render(idx('B3'))).toContain('J/S at the enemy receiver');
  });

  it('scores B3 only when reached', () => {
    const states = flat.map((): StepState => ({ done: false }));
    expect(scoreLevel(LEVEL_9, states).characterisation.max).toBe(30);
    states[idx('B3')] = { done: true };
    expect(scoreLevel(LEVEL_9, states).characterisation.got).toBe(15);
  });
});

describe('level 9 visuals', () => {
  it('the platform card lists four platforms with their time on air', () => {
    const html = renderToString(createElement(PlatformCard, {}));
    expect(html).toContain('Soldier pack');
    expect(html).toContain('4.5 h');
    expect((html.match(/<tr>/g) ?? []).length).toBe(5);
  });
  it('the distance plot marks the pack at 9.5 km', () => {
    expect(renderToString(createElement(DistanceView, {}))).toContain('pack at 9.5 km');
  });
});
