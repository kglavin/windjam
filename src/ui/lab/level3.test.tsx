import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEVEL_3, flatSteps, knownLinkInfo, practiceLinkAt, practiceJs3At } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { level3Card } from './knownFacts';
import { LevelView } from './LevelView';
import { SETUPS } from './levelSetup';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel, type StagePanelProps } from './StagePanel';
import { VisualView } from './visuals/VisualView';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');

const flat = flatSteps(LEVEL_3);
const idx = (id: string) => flat.findIndex((f) => f.step.id === id);
const noop = () => {};
const setup = SETUPS[3];
const truth = setup.truth(3);
const scene = setup.scene(truth);
const budget = sceneBudget(scene);
const practice = knownLinkInfo(practiceLinkAt(0));

function render(current: number, set: (st: StepState[]) => void = () => {}, extra: Partial<StagePanelProps> = {}) {
  const states = flat.map((): StepState => ({ done: false }));
  for (let i = 0; i < current; i++) states[i] = { done: true };
  set(states);
  const args = { truth, flat, states, shownIdx: current, step: flat[current]?.step, practice, practiceJsDb: practiceJs3At(0, practice), budget, base: budget,
    run: { prediction: states[current]?.prediction, summary: states[current]?.runs?.[0], fields: states[current]?.fields } };
  const p: StagePanelProps = {
    level: LEVEL_3,
    states,
    current,
    viewing: null,
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
    score: scoreLevel(LEVEL_3, states),
    onReplay: noop,
    onExit: noop,
    ...extra,
  };
  return renderToString(createElement(StagePanel, p));
}

describe('level 3 in the stage panel', () => {
  it('the briefing is the level intro', () => {
    const html = render(0);
    expect(html).toContain('Level 3: Where to put the power');
    expect(html).toContain('Your jammer has a fixed average power.');
  });
  it('B2 quotes the fixed J/S and the first-step hint values', () => {
    const html = render(idx('B2'));
    expect(html).toContain('a quarter of the band at J/S = ');
    expect(html).toContain('Your predicted BER');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Run<\/button>/);
  });
  it('C2 shows the practice link and its first group only', () => {
    const html = render(idx('C2'));
    expect(html).toContain('The practice link has Gp = 18.0 dB and J/S = 8 dB; the jammer pulses on 10% of the time.');
    expect(html).toContain('Eb/J0 during a pulse');
    expect(html).not.toContain('Overall BER</span>');
    expect(html).toContain('Practice link');
  });
  it('C3 asks for the Eb/J0 during a pulse, with the enemy card', () => {
    const html = render(idx('C3'));
    expect(html).toContain(`Your jammer pulses on 10% of the time at the scene&#x27;s J/S = ${budget.jsDb.toFixed(1)} dB.`);
    expect(html).toContain('Gp (given)');
    expect(html).toContain('Broadband Eb/J0');
    expect(html).toContain('Bit length');
  });
  it('E3 takes a duty cycle, rejects a percentage, and offers the run after the duty is submitted', () => {
    const before = render(idx('E3'));
    expect(before).toContain('Duty cycle');
    expect(before).toContain('Enter it as a fraction, e.g. 0.07.');
    expect(before).not.toContain('Your predicted BER');
    const after = render(idx('E3'), (s) => {
      s[idx('E3')] = { done: false, fields: { duty: { value: 0.07, ok: true, truth: 0.07, points: 10 } } };
    });
    expect(after).toContain('Your predicted BER');
    expect(after).toContain('true value 0.07');
  });
  it('E3 shows the run note the level supplies', () => {
    const states = (s: StepState[]) => {
      s[idx('E3')] = { done: false, fields: { duty: { value: 0.05, ok: true, truth: 0.07, points: 10 } } };
    };
    const html = render(idx('E3'), states, { runNote: () => 'a note about the period' });
    expect(html).toContain('a note about the period');
  });
  it('E3 done shows the reveal with the duty, the theory and the measurement', () => {
    const run = { bits: 20000, errors: 100, ber: 0.005, lo: 0.0041, hi: 0.0061, stoppedBy: 'errors', jsDb: budget.jsDb, ebJ0Db: budget.ebJ0Db, theoryBer: 0.0065 };
    const html = render(idx('E3'), (s) => {
      s[idx('E3')] = {
        done: true,
        prediction: 0.005,
        runs: [run],
        fields: {
          duty: { value: 0.07, ok: true, truth: 0.07, points: 10 },
          ber: { value: 0.005, ok: true, truth: 0.005, points: 15, grade: 'inside' },
        },
      };
    });
    expect(html).toContain('At your duty 0.07: theory 0.0065, measured 0.0050 (range 0.0041 to 0.0061).');
    expect(html).toContain('inside the measured range, 15/15 pts');
    expect(html).toContain('Retry (not scored)');
  });
});

describe('level 3 card', () => {
  const facts = { n: truth.n, gpDb: truth.gpDb, chipRateMcps: truth.chipRateMcps, jsDb: 5.3, ebJ0Db: 9.7 };
  const row = (card: ReturnType<typeof level3Card>, label: string) => card.rows.find((r) => r.label === label)!;
  it('Gp and J/S are given, bit length, pulsed BER and best duty fill in as steps are submitted', () => {
    const st = flat.map((): StepState => ({ done: false }));
    const c0 = level3Card('enemy', flat, st, idx('B2'), facts);
    expect(c0.heading).toBe('What you know');
    expect(row(c0, 'Gp (given)').value).toContain(`${truth.n} times`);
    expect(row(c0, 'Chips per bit').value).toBe(String(truth.n));
    expect(row(c0, 'J/S now').value).toBe('5.3 dB');
    expect(row(c0, 'Broadband Eb/J0').value).toBe('9.7 dB');
    expect(row(c0, 'Bit length').value).toBeNull();
    expect(row(c0, 'Pulsed BER at 10%, measured').value).toBeNull();
    expect(row(c0, 'Best duty').value).toBeNull();
    st[idx('D2')] = { done: true, fields: { bitUs: { value: 60, ok: false, truth: 63, points: 0 } } };
    st[idx('E3')] = { done: false, fields: { duty: { value: 0.2, ok: false, truth: 0.07, points: 0 } } };
    const c1 = level3Card('enemy', flat, st, idx('E3'), facts);
    expect(row(c1, 'Bit length').value).toBe(`${Number((truth.n / truth.chipRateMcps).toFixed(1))} µs`);
    expect(row(c1, 'Bit length').you).toMatchObject({ text: 'you: 60', ok: false });
    expect(row(c1, 'Best duty').value).toBe('0.075');
    expect(row(c1, 'Best duty').you).toMatchObject({ text: 'you: 0.2', ok: false });
  });
  it('practice card: pulsed BER and best duty appear once the practice step is passed or worked', () => {
    const st = flat.map((): StepState => ({ done: false }));
    const pf = { n: practice.n, gpDb: practice.gpDb, chipRateMcps: practice.chipRateMcps, jsDb: 8, ebJ0Db: 10 };
    const c0 = level3Card('practice', flat, st, idx('C2'), pf);
    expect(c0.heading).toBe('Practice link');
    expect(row(c0, 'Pulsed BER at 10%').value).toBeNull();
    st[idx('C2')] = { done: true, worked: true };
    const c1 = level3Card('practice', flat, st, idx('C2'), pf);
    expect(row(c1, 'Pulsed BER at 10%').value).toBe('0.0079');
    expect(row(c1, 'Best duty').value).toBeNull();
    const c2 = level3Card('practice', flat, st, idx('E3'), pf);
    expect(row(c2, 'Best duty').value).toBe('0.07');
  });
});

describe('level 3 visuals', () => {
  const links = { example: LEVEL_3.links.example, practice: LEVEL_3.links.practice };
  it('ThreeJammers has three columns with the captions', () => {
    const html = renderToString(createElement(VisualView, { visual: { kind: 'threeJammers' }, links }));
    for (const c of [
      'Broadband: spread over the whole band, on all the time',
      'Partial-band: a quarter of the band, 4 times stronger there',
      'Pulsed: on 10% of the time, 10 times stronger while on',
    ]) expect(html).toContain(c);
    expect((html.match(/aria-label="Spectrum"/g) ?? []).length).toBe(3);
    expect((html.match(/aria-label="Envelope of the jammer against time"/g) ?? []).length).toBe(3);
  });
  it('BerRunDemo with variants has a Run button for each and a legend', () => {
    const d1 = LEVEL_3.units[3].steps[0];
    if (d1.kind !== 'lesson') throw new Error('D1 is a lesson');
    const html = renderToString(createElement(VisualView, { visual: d1.visual, links }));
    expect((html.match(/>Run<\/button>/g) ?? []).length).toBe(2);
    expect(html).toContain('pulses one bit long');
    expect(html).toContain('pulses one chip long');
    expect(html).toContain('broadband theory');
  });
  it('BerRunDemo without variants is unchanged', () => {
    const html = renderToString(createElement(VisualView, { visual: { kind: 'berRunDemo' }, links }));
    expect((html.match(/>Run<\/button>/g) ?? []).length).toBe(1);
    expect(html).toContain('J/S = 10 dB');
  });
  it('BerCurve draws the marks', () => {
    const html = renderToString(createElement(VisualView, { visual: { kind: 'berCurve', marks: [{ db: 9.9, label: 'broadband 9.9 dB' }, { db: -0.1, label: 'in-pulse −0.1 dB' }] }, links }));
    expect(html).toContain('broadband 9.9 dB');
    expect(html).toContain('in-pulse −0.1 dB');
  });
});

describe('scoring', () => {
  it('a perfect level scores 100 and a blank one 0', () => {
    const blank = flat.map((): StepState => ({ done: false }));
    expect(scoreLevel(LEVEL_3, blank)).toMatchObject({ total: 0, max: 100, passed: false });
    const full = flat.map((f): StepState => {
      const s = f.step;
      if (s.kind === 'apply') return { done: true, fields: Object.fromEntries(s.fields.map((x) => [x.id, { value: 1, ok: true, truth: 1, points: x.points }])) };
      if (s.kind === 'questions') return { done: true, answers: Object.fromEntries(s.questions.map((q) => [q.id, q.correct])) };
      return { done: true };
    });
    expect(scoreLevel(LEVEL_3, full)).toMatchObject({ total: 100, max: 100, passed: true });
  });
});

describe('LevelView for level 3', () => {
  it('renders the first step with the three jammers', () => {
    const html = renderToString(createElement(LevelView, { level: LEVEL_3, seed: 3, onExit: noop, onReplay: noop, onFinish: noop }));
    expect(html).toContain('Level 3: Where to put the power');
    expect(html).toContain('Three ways to spend the same power');
    expect(html).toContain('Pulsed: on 10% of the time');
  });
});
