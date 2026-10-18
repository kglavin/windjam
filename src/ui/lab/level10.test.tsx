import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEVEL_10, NEAR_FAR, exampleUsers, flatSteps, knownLinkInfo, practiceLinkAt } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { BeamPlot } from './instruments/BeamView';
import { CdmaPanel } from './instruments/CdmaPanel';
import { MusicPlot } from './instruments/MusicView';
import { DiscoveryView } from './instruments/DiscoveryView';
import { SETUPS } from './levelSetup';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel, type StagePanelProps } from './StagePanel';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');
const flat = flatSteps(LEVEL_10);
const noop = () => {};
const setup = SETUPS[10];
const truth = setup.truth(3);
const budget = sceneBudget(setup.scene(truth));

function render(current: number) {
  const states = flat.map((): StepState => ({ done: false }));
  const args = { truth, flat, states, shownIdx: current, step: flat[current]?.step, practice: knownLinkInfo(practiceLinkAt(0)), practiceJsDb: 0, practiceN: 0, budget, base: budget };
  const p: StagePanelProps = {
    level: LEVEL_10, states, current, onView: noop, chipSnrDb: 0, values: setup.values(args),
    onCheckLesson: noop, onCheckPractice: noop, onShowWorked: noop, onTryAnother: noop, onSubmitFields: noop, onRetryStart: noop,
    onCheckRetry: noop, onBack: noop, runPlan: () => undefined, onRunStart: noop, onRunDone: noop, onPredictAgain: noop, onAnswer: noop,
    onContinue: noop, card: setup.card(args), score: scoreLevel(LEVEL_10, states), onReplay: noop, onExit: noop,
  };
  return renderToString(createElement(StagePanel, p));
}

describe('level 10 in the stage panel', () => {
  it('renders every step and the debrief, with no unresolved placeholder', () => {
    for (let i = 0; i <= flat.length; i++) expect(render(i)).not.toMatch(/\{\w+\}/);
  });
});

describe('level 10 instruments', () => {
  it('the beam and MUSIC plots render with their readouts', () => {
    expect(renderToString(createElement(BeamPlot, { m: 8, lookDeg: 0, jammers: [40], mode: 'mvdr' }))).toMatch(/jammer at 40°: -4[34]\.\d dB/);
    expect(renderToString(createElement(MusicPlot, { m: 6, sources: [{ thetaDeg: -5, power: 10 }, { thetaDeg: 5, power: 10 }], snapshots: 20, showTruth: true }))).toContain('inst-goal');
  });
  it('the CDMA panel lists every user with its BER', () => {
    const html = renderToString(createElement(CdmaPanel, { users: exampleUsers(6), sic: false, title: 't' }));
    expect((html.match(/<tr>/g) ?? []).length).toBe(7);
    expect(html).toContain('31 ÷ 5 = 6.2');
  });
  it('cancellation lowers the far user BER in the panel', () => {
    const plain = renderToString(createElement(CdmaPanel, { users: NEAR_FAR, sic: false, title: 't' }));
    const sic = renderToString(createElement(CdmaPanel, { users: NEAR_FAR, sic: true, title: 't' }));
    expect(plain).toContain('0.38');
    expect(sic).not.toContain('0.38');
  });
  it('the discovery view counts the chips found', () => {
    expect(renderToString(createElement(DiscoveryView, { code: 9, snrDb: -6, start: 2 }))).toContain('31 of 31 chips found');
  });
});
