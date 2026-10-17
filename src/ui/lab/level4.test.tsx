import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEVEL_4, d3Numbers, flatSteps, knownLinkInfo, practiceLinkAt } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { level4Card } from './knownFacts';
import { LevelView } from './LevelView';
import { SETUPS } from './levelSetup';
import { type StepState, applyDone, runDone, scoreLevel } from './levelState';
import { StagePanel, type StagePanelProps } from './StagePanel';
import { VisualView } from './visuals/VisualView';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');

const flat = flatSteps(LEVEL_4);
const idx = (id: string) => flat.findIndex((f) => f.step.id === id);
const noop = () => {};
const setup = SETUPS[4];
const truth = setup.truth(3);
const budget = sceneBudget(setup.scene(truth));
const practice = knownLinkInfo(practiceLinkAt(0));
const run = { bits: 20000, errors: 100, ber: 0.012, lo: 0.0098, hi: 0.0145, stoppedBy: 'errors', jsDb: budget.jsDb, ebJ0Db: budget.ebJ0Db, theoryBer: 0.013 };

function render(current: number, set: (st: StepState[]) => void = () => {}, extra: Partial<StagePanelProps> = {}) {
  const states = flat.map((): StepState => ({ done: false }));
  for (let i = 0; i < current; i++) states[i] = { done: true };
  set(states);
  const args = {
    truth, flat, states, shownIdx: current, step: flat[current]?.step, practice, practiceJsDb: 13, practiceN: 0, budget, base: budget,
    run: { prediction: states[current]?.prediction, summary: states[current]?.runs?.[0], fields: states[current]?.fields },
  };
  const p: StagePanelProps = {
    level: LEVEL_4, states, current, viewing: null, onView: noop, chipSnrDb: 0, values: setup.values(args),
    onCheckLesson: noop, onCheckPractice: noop, onShowWorked: noop, onTryAnother: noop, onSubmitFields: noop, onRetryStart: noop,
    onCheckRetry: noop, onBack: noop, runPlan: () => undefined, onRunStart: noop, onRunDone: noop, onPredictAgain: noop, onAnswer: noop,
    onContinue: noop, card: setup.card(args), score: scoreLevel(LEVEL_4, states), onReplay: noop, onExit: noop, ...extra,
  };
  return renderToString(createElement(StagePanel, p));
}

const sp = { value: truth.bitRateKbps, ok: true, truth: truth.bitRateKbps, points: 15 };
const off = { value: 40, ok: true, truth: truth.bitRateKbps, points: 20 };

describe('level 4 in the stage panel', () => {
  it('the briefing is the level intro', () => {
    const html = render(0);
    expect(html).toContain('Level 4: Tones');
    expect(html).toContain('A tone is the simplest jammer');
  });
  it('B3 asks for a prediction and quotes the tone offset and J/S', () => {
    const html = render(idx('B3'));
    expect(html).toContain(`Your tone at +${truth.chipRateMcps * 50} kHz arrives at J/S = `);
    expect(html).toContain('Your predicted BER');
  });
  it('C3 shows the line spacing first, then the offset, then an unscored run with no prediction or goal', () => {
    const a = render(idx('C3'));
    expect(a).toContain('Line spacing');
    expect(a).toContain(`The enemy link has ${truth.n} chips per bit at ${truth.chipRateMcps} Mcps. How far apart are its lines?`);
    expect(a).not.toContain('Tone offset');
    const b = render(idx('C3'), (s) => {
      s[idx('C3')] = { done: false, fields: { spacing: sp } };
    });
    expect(b).toContain('Tone offset');
    expect(b).toContain(`from 0 to ${truth.chipRateMcps * 500} kHz. Put it on a line.`);
    expect(b).not.toContain('Your predicted BER');
    const c = render(idx('C3'), (s) => {
      s[idx('C3')] = { done: false, fields: { spacing: sp, offset: off } };
    });
    expect(c).toContain('✓ accepted, 20/20 pts');
    expect(c).not.toContain('Your predicted BER');
    expect(c).toContain('>Run</button>');
    expect(c).not.toContain('Goal:');
    expect(c).not.toContain('Continue');
  });
  it('C3 done shows both theories beside the measurement', () => {
    const html = render(idx('C3'), (s) => {
      s[idx('C3')] = { done: true, runs: [run], fields: { spacing: sp, offset: off } };
    });
    expect(html).toContain(`Lines sit at ${Number(truth.bitRateKbps.toPrecision(3))}, ${Number((2 * truth.bitRateKbps).toPrecision(3))}, ${Number((3 * truth.bitRateKbps).toPrecision(3))} kHz …`);
    expect(html).toContain('Your tone at 40 kHz: theory 0.013 (phase-averaged), measured 0.012.');
    expect(html).toContain('Broadband noise at the same J/S:');
    expect(html).toContain('Retry (not scored)');
  });
  it('C3 shows the enemy card with the line spacing once confirmed', () => {
    const html = render(idx('C3'), (s) => {
      s[idx('C3')] = { done: false, fields: { spacing: sp } };
    });
    expect(html).toContain('Gp (given)');
    expect(html).toContain('Line spacing');
    expect(html).toContain('J/S now');
  });
  it('D3 quotes the peak limit and the tone count', () => {
    const { peakLimit, q } = d3Numbers(truth);
    const html = render(idx('D3'));
    expect(html).toContain(`reach J/S = ${peakLimit} dB. Your jammer sends ${q} tones in phase.`);
  });
});

describe('level 4 run step state', () => {
  const c3 = LEVEL_4.units[2].steps[2];
  if (c3.kind !== 'apply') throw new Error('C3 is an apply step');
  it('the step is done only once the unscored run has finished, and nothing is scored for it', () => {
    const fields = { spacing: sp, offset: off };
    expect(applyDone(c3, { done: false, fields })).toBe(false);
    const after = runDone(c3, { done: false, fields }, run, 'main');
    expect(after.done).toBe(true);
    expect(after.runs).toHaveLength(1);
    expect(after.goal).toBeUndefined();
  });
});

describe('level 4 card', () => {
  const facts = { n: truth.n, gpDb: truth.gpDb, chipRateMcps: truth.chipRateMcps, jsDb: 12.3, maxAvgDb: 11.1 };
  const row = (card: ReturnType<typeof level4Card>, label: string) => card.rows.find((r) => r.label === label)!;
  it('Gp, chips per bit, chip rate and J/S are given; line spacing and the PAPR limit fill in after C3 and D3', () => {
    const st = flat.map((): StepState => ({ done: false }));
    const c0 = level4Card('enemy', flat, st, idx('C3'), facts);
    expect(row(c0, 'Gp (given)').value).toContain(`${truth.n} times`);
    expect(row(c0, 'J/S now').value).toBe('12.3 dB');
    expect(row(c0, 'Line spacing').value).toBeNull();
    expect(row(c0, 'PAPR limit: highest average J/S').value).toBeNull();
    st[idx('C3')] = { done: false, fields: { spacing: { value: 30, ok: false, truth: 31.7, points: 0 } } };
    st[idx('D3')] = { done: true, fields: { avgJs: { value: 11, ok: true, truth: 11.1, points: 15 } } };
    const c1 = level4Card('enemy', flat, st, idx('D3'), facts);
    expect(row(c1, 'Line spacing').value).toBe(`${Number(((truth.chipRateMcps * 1000) / truth.n).toPrecision(3))} kHz`);
    expect(row(c1, 'Line spacing').you).toMatchObject({ text: 'you: 30', ok: false });
    expect(row(c1, 'PAPR limit: highest average J/S').value).toBe('11.1 dB');
  });
});

describe('level 4 visuals', () => {
  const links = { example: LEVEL_4.links.example, practice: LEVEL_4.links.practice };
  it('ToneSweep has a Run button for the carrier and the first line and states Eb/N0 and J/S', () => {
    const html = renderToString(createElement(VisualView, { visual: { kind: 'toneSweep' }, links }));
    expect((html.match(/>Run<\/button>/g) ?? []).length).toBe(2);
    expect(html).toContain('tone on the carrier');
    expect(html).toContain('tone on the first line');
    expect(html).toContain('J/S = 10 dB and Eb/N0 = 8 dB');
    expect(html).toContain('>line<');
  });
  it('Peaks shows three panels with the PAPR printed', () => {
    const html = renderToString(createElement(VisualView, { visual: { kind: 'peaks' }, links }));
    expect(html).toContain('In phase: peak 8.0 times the average, PAPR 9.0 dB');
    expect(html).toContain('Newman phases: peak 1.8 times the average, PAPR 2.5 dB');
    expect(html).toContain('Random phases: peak');
  });
  it('ToneSpectrum labels the tone', () => {
    const html = renderToString(createElement(VisualView, { visual: { kind: 'toneSpectrum' }, links }));
    expect(html).toContain('a tone at +100 kHz, J/S = 10 dB');
  });
  it('B1 runs both variants', () => {
    const b1 = LEVEL_4.units[1].steps[0];
    if (b1.kind !== 'lesson') throw new Error('B1 is a lesson');
    const html = renderToString(createElement(VisualView, { visual: b1.visual, links }));
    expect((html.match(/>Run<\/button>/g) ?? []).length).toBe(2);
    expect(html).toContain('a tone at +50 kHz');
  });
});

describe('scoring and LevelView', () => {
  it('a perfect level scores 100 and a blank one 0', () => {
    const blank = flat.map((): StepState => ({ done: false }));
    expect(scoreLevel(LEVEL_4, blank)).toMatchObject({ total: 0, max: 100, passed: false });
    const full = flat.map((f): StepState => {
      const s = f.step;
      if (s.kind === 'apply') return { done: true, fields: Object.fromEntries(s.fields.map((x) => [x.id, { value: 1, ok: true, truth: 1, points: x.points }])) };
      if (s.kind === 'questions') return { done: true, answers: Object.fromEntries(s.questions.map((q) => [q.id, q.correct])) };
      return { done: true };
    });
    expect(scoreLevel(LEVEL_4, full)).toMatchObject({ total: 100, max: 100, passed: true });
  });
  it('renders the first step with the tone spectrum', () => {
    const html = renderToString(createElement(LevelView, { level: LEVEL_4, seed: 3, onExit: noop, onReplay: noop, onFinish: noop }));
    expect(html).toContain('Level 4: Tones');
    expect(html).toContain('All the power on one frequency');
    expect(html).toContain('a tone at +100 kHz');
  });
});
