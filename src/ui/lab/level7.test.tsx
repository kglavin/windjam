import { createElement } from 'react';
import { renderToString as ssr } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FH_EXAMPLE, hopPreview } from '../../engine/lab/fh';
import { LEVEL_7, flatSteps, knownLinkInfo, practiceLinkAt } from '../../engine/lab/levels';
import { sceneBudget } from '../../engine/lab/scene';
import { Waterfall } from './instruments/Waterfall';
import { SETUPS } from './levelSetup';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel, type StagePanelProps } from './StagePanel';
import { VisualView } from './visuals/VisualView';

const renderToString = (e: Parameters<typeof ssr>[0]) => ssr(e).replace(/<!-- -->/g, '');
const flat = flatSteps(LEVEL_7);
const noop = () => {};
const setup = SETUPS[7];
const truth = setup.truth(3);
const budget = sceneBudget(setup.scene(truth));

function render(current: number) {
  const states = flat.map((): StepState => ({ done: false }));
  const args = { truth, flat, states, shownIdx: current, step: flat[current]?.step, practice: knownLinkInfo(practiceLinkAt(0)), practiceJsDb: 0, practiceN: 0, budget, base: budget };
  const p: StagePanelProps = {
    level: LEVEL_7, states, current, onView: noop, chipSnrDb: 0, values: setup.values(args),
    onCheckLesson: noop, onCheckPractice: noop, onShowWorked: noop, onTryAnother: noop, onSubmitFields: noop, onRetryStart: noop,
    onCheckRetry: noop, onBack: noop, runPlan: () => undefined, onRunStart: noop, onRunDone: noop, onPredictAgain: noop, onAnswer: noop,
    onContinue: noop, card: setup.card(args), score: scoreLevel(LEVEL_7, states), onReplay: noop, onExit: noop,
  };
  return renderToString(createElement(StagePanel, p));
}

describe('level 7 in the stage panel', () => {
  it('renders every step and the debrief, with no unresolved placeholder', () => {
    for (let i = 0; i <= flat.length; i++) expect(render(i)).not.toMatch(/\{\w+\}/);
  });
});

describe('the hop waterfall', () => {
  it('draws one tile per hop and the partial band over its channels', () => {
    const hops = hopPreview(FH_EXAMPLE, 5, 40, { kind: 'partial', rho: 0.25 });
    const html = renderToString(createElement(Waterfall, { link: FH_EXAMPLE, hops, jammer: { kind: 'partial', rho: 0.25 } }));
    expect((html.match(/class="wf-hop"/g) ?? []).length).toBe(40);
    expect((html.match(/class="wf-hop-jam"/g) ?? []).length).toBe(hops.filter((h) => h.channel < 4).length);
    expect(html).toContain('30.000 to 30.400 MHz');
  });

  it('a lesson waterfall offers a Run per jammer', () => {
    const html = renderToString(createElement(VisualView, {
      visual: { kind: 'waterfall', link: 'example', variants: [{ label: 'Broadband noise', jammer: { kind: 'bbn' } }, { label: 'One channel', jammer: { kind: 'partial', rho: 1 / 16 } }], jsDb: -3 },
      links: { example: LEVEL_7.links.example, practice: LEVEL_7.links.practice },
    }));
    expect((html.match(/>Run</g) ?? []).length).toBe(2);
    expect(html).toContain('class="wf-jam"');
  });
});
