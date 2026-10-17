import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEVEL_2, flatSteps, knownLinkInfo, practiceJsAt, practiceLinkAt } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { LevelView } from './LevelView';
import { SETUPS } from './levelSetup';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel, type StagePanelProps } from './StagePanel';
import { VisualView } from './visuals/VisualView';

// React separates adjacent text nodes with comments; drop them so the text reads as the player sees it.
const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');

const flat = flatSteps(LEVEL_2);
const idx = (id: string) => flat.findIndex((f) => f.step.id === id);
const noop = () => {};
const setup = SETUPS[2];
const truth = setup.truth(3);
const scene = setup.scene(truth);
const budget = sceneBudget(scene);
const practice = knownLinkInfo(practiceLinkAt(0));

function render(current: number, set: (st: StepState[]) => void = () => {}) {
  const states = flat.map((): StepState => ({ done: false }));
  for (let i = 0; i < current; i++) states[i] = { done: true };
  set(states);
  const args = {
    truth, flat, states, shownIdx: current, step: flat[current]?.step, practice, practiceJsDb: practiceJsAt(0, practice), budget, base: budget,
  };
  const p: StagePanelProps = {
    level: LEVEL_2,
    states,
    current,
   
    onView: noop,
    chipSnrDb: 0,
    values: setup.values(args),
    onCheckLesson: noop,
    onCheckPractice: noop,
    onShowWorked: noop,
    onTryAnother: noop,
    onSubmitFields: noop,
    onRetryStart: noop,
    onCheckRetry: noop,
    onBack: noop,
    runPlan: () => undefined,
    onRunStart: noop,
    onRunDone: noop,
    onPredictAgain: noop,
    onAnswer: noop,
    onContinue: noop,
    card: setup.card(args),
    score: scoreLevel(LEVEL_2, states),
    onReplay: noop,
    onExit: noop,
  };
  return renderToString(createElement(StagePanel, p));
}

describe('level 2 in the stage panel', () => {
  it('B2 quotes the practice values', () => {
    const html = render(idx('B2'));
    expect(html).toContain('The practice link has Gp = 18.0 dB and the jammer arrives at J/S = 12 dB. What is Eb/J0?');
    expect(html).toContain('Practice link');
  });
  it('B3 quotes the scene J/S and shows the card with Gp given', () => {
    const html = render(idx('B3'));
    expect(html).toContain(`Gp = ${truth.gpDb.toFixed(1)} dB (${truth.n} chips per bit)`);
    expect(html).toContain(`J/S = ${budget.jsDb.toFixed(1)} dB at the enemy receiver`);
    expect(html).toContain('Gp (given)');
    expect(html).toContain('J/S now');
  });
  it('D3 asks for a prediction first and keeps Run disabled until it is entered', () => {
    const html = render(idx('D3'));
    expect(html).toContain('Predict the enemy link&#x27;s BER at the scene&#x27;s J/S, then press Run.');
    expect(html).toContain('Your predicted BER');
    expect(html).toContain('Enter a prediction to enable Run');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Run<\/button>/);
  });
  it('D2 is the practice predict-and-run', () => {
    const html = render(idx('D2'));
    expect(html).toContain('Predict the practice link&#x27;s BER at J/S = 12 dB, then press Run.');
    expect(html).toContain('Your predicted BER');
  });
  it('E3 shows the J/S field first, the deny goal once it is submitted', () => {
    const before = render(idx('E3'));
    expect(before).toContain('The enemy link has Gp = ');
    expect(before).not.toContain('Now make it happen');
    const after = render(idx('E3'), (s) => {
      s[idx('E3')] = { done: false, fields: { jsNeeded: { value: 16, ok: true, truth: truth.gpDb + 0.9, points: 15 } } };
    });
    expect(after).toContain(`scene&#x27;s J/S reaches about ${(Number(truth.gpDb.toFixed(1)) + 0.9).toFixed(1)} dB`);
    expect(after).toContain('Goal: a measured BER of at least 0.080');
    expect(after).toContain('>Run<');
  });
  it('D3 once scored shows the feedback, the reveal with the run and Retry', () => {
    const run = { bits: 20000, errors: 100, ber: 0.005, lo: 0.0041, hi: 0.0061, stoppedBy: 'errors', jsDb: budget.jsDb, ebJ0Db: budget.ebJ0Db, theoryBer: 0.0065 };
    const html = render(idx('D3'), (s) => {
      s[idx('D3')] = {
        done: true,
        prediction: 0.005,
        runs: [run],
        fields: { ber: { value: 0.005, ok: true, truth: 0.005, points: 20, grade: 'inside' } },
      };
    });
    expect(html).toContain('inside the measured range, 20/20 pts');
    expect(html).toContain('Retry (not scored)');
  });
});

describe('level 2 visuals', () => {
  const links = { example: LEVEL_2.links.example, practice: LEVEL_2.links.practice };
  it('BerCurve prints the table', () => {
    const html = renderToString(createElement(VisualView, { visual: { kind: 'berCurve', mark: 'example' }, links }));
    for (const v of ['0.10', '0.079', '0.038', '0.013', '0.010', '0.0024', '0.00099', '0.00019', '0.0000097']) expect(html).toContain(`<td>${v}</td>`);
    expect(html).toContain('this link: 4.9 dB');
  });
  it('DespreadBars labels the gap and writes the value only for the example', () => {
    const ex = renderToString(createElement(VisualView, { visual: { kind: 'despreadBars', gpDb: 14.9, jsDb: 10 }, links }));
    expect(ex).toContain('Eb/J0 = Gp − J/S');
    expect(ex).toContain('14.9 − 10 = 4.9 dB');
    const pr = renderToString(createElement(VisualView, { visual: { kind: 'despreadBars', link: 'practice' }, links, practiceJsDb: 12 }));
    expect(pr).toContain('Eb/J0 = Gp − J/S');
    expect(pr).not.toContain('= 6.0 dB');
    expect(pr).toContain('+18 dB');
  });
  it('JammedSpectra shows both ratios', () => {
    const html = renderToString(createElement(VisualView, { visual: { kind: 'jammedSpectra' }, links }));
    expect(html).toContain('J/S = 0 dB');
    expect(html).toContain('J/S = +10 dB');
  });
  it('BerRunDemo has a Run button', () => {
    const html = renderToString(createElement(VisualView, { visual: { kind: 'berRunDemo' }, links }));
    expect(html).toContain('>Run<');
    expect(html).toContain('J/S = 10 dB');
  });
});

describe('LevelView for level 2', () => {
  it('renders the first step', () => {
    const html = renderToString(createElement(LevelView, { level: LEVEL_2, seed: 3, onExit: noop, onReplay: noop, onFinish: noop }));
    expect(html).toContain('Level 2: Processing gain');
    expect(html).toContain('Jamming to signal ratio');
    expect(html).toContain('J/S = +10 dB');
  });
});
