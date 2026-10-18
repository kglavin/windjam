import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { type ApplyStep, LEVEL_11, e3Layout, flatSteps, isolationSolutions, knownLinkInfo, practiceLinkAt } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { FadingStrip } from './instruments/FadingStrip';
import { ShadowHist } from './instruments/ShadowHist';
import { TOWN_EXAMPLE, TownMap } from './instruments/TownMap';
import { UrbanLossPlot } from './instruments/UrbanLossPlot';
import { SETUPS } from './levelSetup';
import { type StepState, applyDone, scoreLevel } from './levelState';
import { DfTask } from './DfTask';
import { VisualView } from './visuals/VisualView';
import { StagePanel, type StagePanelProps } from './StagePanel';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');
const flat = flatSteps(LEVEL_11);
const noop = () => {};
const setup = SETUPS[11];
const truth = setup.truth(3);
const budget = sceneBudget(setup.scene(truth));

function render(current: number) {
  const states = flat.map((): StepState => ({ done: false }));
  const args = { truth, flat, states, shownIdx: current, step: flat[current]?.step, practice: knownLinkInfo(practiceLinkAt(0)), practiceJsDb: 0, practiceN: 0, budget, base: budget };
  const p: StagePanelProps = {
    level: LEVEL_11, states, current, onView: noop, chipSnrDb: 0, values: setup.values(args),
    onCheckLesson: noop, onCheckPractice: noop, onShowWorked: noop, onTryAnother: noop, onSubmitFields: noop, onRetryStart: noop,
    onCheckRetry: noop, onBack: noop, runPlan: () => undefined, onRunStart: noop, onRunDone: noop, onPredictAgain: noop, onAnswer: noop,
    onContinue: noop, card: setup.card(args), score: scoreLevel(LEVEL_11, states), onReplay: noop, onExit: noop,
  };
  return renderToString(createElement(StagePanel, p));
}

describe('level 11', () => {
  it('renders every step and the debrief, with no unresolved placeholder', () => {
    for (let i = 0; i <= flat.length; i++) expect(render(i)).not.toMatch(/\{\w+\}/);
  });
  it('its views render', () => {
    expect((renderToString(createElement(TownMap, { radios: TOWN_EXAMPLE })).match(/town-radio/g) ?? []).length).toBe(5);
    expect(renderToString(createElement(UrbanLossPlot, {}))).toContain('over rooftops (Hata)');
    const h = renderToString(createElement(ShadowHist, {}));
    expect(h).toContain('14.5 dB');
    const pct = Number(/(\d+\.\d)%/.exec(h)![1]);
    expect(pct).toBeGreaterThan(87);
    expect(pct).toBeLessThan(93);
    const f = renderToString(createElement(FadingStrip, {}));
    expect(f).toContain('9.5%');
    expect(renderToString(createElement(VisualView, { visual: { kind: 'town', example: 'isolation' }, links: LEVEL_11.links }))).toContain('J/S 22.3 dB');
  });

  it('E3: the town task shows J/S after a jam, and a working jam completes the step for 25 points', () => {
    const idx = flat.findIndex((f) => f.step.id === 'E3');
    const e3 = flat[idx].step as ApplyStep;
    const sol = isolationSolutions(e3Layout(truth), true)[0];
    const before = renderToString(createElement(DfTask, { step: e3, state: { done: false }, truth, onPlace: noop, onRemove: noop, onJam: noop }));
    expect(before).toContain('Click the map to place the jammer');
    const st: StepState = { done: true, df: { sites: [sol.at], tries: 2, beamDeg: sol.beamDeg, jammed: { ...sol.at, beamDeg: sol.beamDeg! } }, located: { points: 25, tryNo: 2 } };
    const after = renderToString(createElement(DfTask, { step: e3, state: st, truth, onPlace: noop, onRemove: noop, onJam: noop }));
    expect(after).toContain('Jam 2: enemy J/S');
    expect(after).not.toContain('town-bad');
    expect(applyDone(e3, st)).toBe(true);
    const states = flat.map((_, i): StepState => (i === idx ? st : { done: false }));
    expect(scoreLevel(LEVEL_11, states).total).toBe(25);
  });
});
