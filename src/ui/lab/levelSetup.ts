// Per-level wiring for LevelView: the hidden truth, the starting scene, which stations the scene shows, the
// placeholder values, the budget rows to hide and the "What you know" card.
import {
  type FlatStep,
  type KnownLinkInfo,
  type RunSummary,
  type SceneField,
  type StepDef,
  type Truth,
  level1Truth,
  level2Truth,
  level2Values,
  level3Truth,
  level3Values,
  d3Numbers,
  level4Truth,
  level4Values,
  level5Truth,
  level5Values,
  level6Scene,
  level6Truth,
  level6Values,
  level7Truth,
  level7Values,
  maxPeriodUsOf,
  recoveryUsOf,
  textValues,
} from '../../engine/lab/levels';
import type { Scene, SceneBudget } from '../../engine/lab/scene';
import { type FactsCard, factsOfTruth, knownFacts, level2Card, level3Card, level4Card, level5Card } from './knownFacts';
import { level1Scene, level2Scene, level3Scene, level4Scene, level5Scene } from './levelScene';
import type { StepState } from './levelState';

export interface SetupArgs {
  truth: Truth;
  flat: FlatStep[];
  states: StepState[];
  shownIdx: number;
  step: StepDef | undefined;
  practice: KnownLinkInfo;
  practiceJsDb: number;
  practiceN?: number; // the "Try another" counter
  budget: SceneBudget; // the scene now
  base: SceneBudget; // the scene the level started with
  interceptSnrDb?: number;
  run?: { prediction?: number; summary?: RunSummary; fields?: Record<string, { value: number }> };
}

export interface LevelSetup {
  truth: (seed: number) => Truth;
  scene: (t: Truth) => Scene;
  hidden: ('jammer' | 'intercept')[];
  editable: SceneField[]; // for steps that do not say
  values: (a: SetupArgs) => Record<string, string>;
  hiddenRows: (a: SetupArgs) => string[];
  card: (a: SetupArgs) => FactsCard | null;
  noScene?: boolean; // the link scene is never shown (level 6: the DF view takes its place)
}

const JAMMER_ROWS = [
  'Jammer power', 'Jammer antenna', 'Jammer path loss', 'Rx antenna toward jammer', 'Jamming J', 'J/S', 'Eb/J0',
  'Jamming J at intercept', 'J/S at intercept',
];
// Shown only once the prediction step has been revealed.
const LATE_ROWS = ['Processing gain', 'Eb/N0', 'Eb/(N0+J0)'];

// Level 0 is lessons only: it borrows level 1's link and scene, which no lesson shows.
const setup0: LevelSetup = {
  truth: level1Truth,
  scene: level1Scene,
  hidden: ['jammer'],
  editable: [],
  values: () => ({}),
  hiddenRows: () => [],
  card: () => null,
};

const setup1: LevelSetup = {
  truth: level1Truth,
  scene: level1Scene,
  hidden: ['jammer'],
  editable: ['intercept'],
  values: (a) =>
    textValues(a.truth, { interceptSnrDb: a.interceptSnrDb, rxSnrDb: a.budget.snrDb, rxEbN0Db: a.budget.ebN0Db }, a.practice),
  hiddenRows: (a) => {
    const done = a.flat.some((f, i) => f.step.id === 'F2' && a.states[i].done);
    return [...JAMMER_ROWS, ...(done ? [] : LATE_ROWS)];
  },
  card: (a) => {
    if (!a.step || !'CDEF'.includes(a.flat[a.shownIdx].unit.id)) return null;
    const practice = a.step.kind === 'practice';
    return knownFacts(practice ? 'practice' : 'enemy', a.flat, a.states, a.shownIdx, practice ? a.practice : factsOfTruth(a.truth));
  },
};

const setup2: LevelSetup = {
  truth: level2Truth,
  scene: level2Scene,
  hidden: ['intercept'],
  editable: [],
  values: (a) => level2Values(a.truth, { jsDb: a.base.jsDb, ebJ0Db: a.base.ebJ0Db }, a.practice, a.practiceJsDb, a.run),
  hiddenRows: (a) =>
    a.step?.kind === 'apply' && a.step.hiddenRows && !a.states[a.shownIdx]?.done ? a.step.hiddenRows : [],
  card: (a) => {
    if (!a.step || a.step.kind === 'lesson' || !'BCDE'.includes(a.flat[a.shownIdx].unit.id)) return null;
    if (a.step.kind === 'practice') {
      return level2Card('practice', a.flat, a.states, a.shownIdx, {
        n: a.practice.n,
        gpDb: a.practice.gpDb,
        jsDb: a.practiceJsDb,
        ebJ0Db: a.practice.gpDb - a.practiceJsDb,
      });
    }
    return level2Card('enemy', a.flat, a.states, a.shownIdx, {
      n: a.truth.n,
      gpDb: a.truth.gpDb,
      jsDb: a.budget.jsDb,
      // The same rounded arithmetic the texts show (Gp − J/S, each to 0.1 dB), so card and reveals agree.
      ebJ0Db: Math.round(a.truth.gpDb * 10) / 10 - Math.round(a.base.jsDb * 10) / 10,
    });
  },
};

const setup3: LevelSetup = {
  truth: level3Truth,
  scene: level3Scene,
  hidden: ['intercept'],
  editable: [],
  values: (a) => level3Values(a.truth, { jsDb: a.base.jsDb, ebJ0Db: a.base.ebJ0Db }, a.practice, a.practiceJsDb, a.run),
  hiddenRows: () => [],
  card: (a) => {
    if (!a.step || a.step.kind === 'lesson' || !'BCDE'.includes(a.flat[a.shownIdx].unit.id)) return null;
    if (a.step.kind === 'practice') {
      return level3Card('practice', a.flat, a.states, a.shownIdx, {
        n: a.practice.n,
        gpDb: a.practice.gpDb,
        chipRateMcps: a.practice.chipRateMcps,
        jsDb: a.practiceJsDb,
        ebJ0Db: Math.round(a.practice.gpDb * 10) / 10 - a.practiceJsDb,
      });
    }
    return level3Card('enemy', a.flat, a.states, a.shownIdx, {
      n: a.truth.n,
      gpDb: a.truth.gpDb,
      chipRateMcps: a.truth.chipRateMcps,
      jsDb: a.budget.jsDb,
      // The same rounded arithmetic the texts show, so card and reveals agree.
      ebJ0Db: Math.round(a.truth.gpDb * 10) / 10 - Math.round(a.base.jsDb * 10) / 10,
    });
  },
};

const setup4: LevelSetup = {
  truth: level4Truth,
  scene: level4Scene,
  hidden: ['intercept'],
  editable: [],
  values: (a) => level4Values(a.truth, { jsDb: a.base.jsDb, ebN0Db: a.base.ebN0Db }, a.practice, a.practiceN ?? 0, a.practiceJsDb, a.run),
  hiddenRows: () => [],
  card: (a) => {
    if (!a.step || a.step.kind === 'lesson' || !'BCD'.includes(a.flat[a.shownIdx].unit.id)) return null;
    if (a.step.kind === 'practice') {
      return level4Card('practice', a.flat, a.states, a.shownIdx, {
        n: a.practice.n,
        gpDb: a.practice.gpDb,
        chipRateMcps: a.practice.chipRateMcps,
        jsDb: a.practiceJsDb,
      });
    }
    const d3 = d3Numbers(a.truth);
    return level4Card('enemy', a.flat, a.states, a.shownIdx, {
      n: a.truth.n,
      gpDb: a.truth.gpDb,
      chipRateMcps: a.truth.chipRateMcps,
      jsDb: a.budget.jsDb,
      maxAvgDb: d3.peakLimit - 10 * Math.log10(d3.q),
    });
  },
};

const setup5: LevelSetup = {
  truth: level5Truth,
  scene: level5Scene,
  hidden: ['intercept'],
  editable: [],
  values: (a) => level5Values(a.truth, { jsDb: a.base.jsDb, ebN0Db: a.base.ebN0Db }, a.practice, a.practiceN ?? 0, a.run),
  hiddenRows: () => [],
  card: (a) => {
    if (!a.step || a.step.kind === 'lesson' || !'BC'.includes(a.flat[a.shownIdx].unit.id)) return null;
    const f = {
      n: a.practice.n,
      gpDb: a.practice.gpDb,
      chipRateMcps: a.practice.chipRateMcps,
      recoveryUs: 0,
      maxPeriodUs: 0,
    };
    if (a.step.kind === 'practice') return level5Card('practice', a.flat, a.states, a.shownIdx, f);
    return level5Card('enemy', a.flat, a.states, a.shownIdx, {
      n: a.truth.n,
      gpDb: a.truth.gpDb,
      chipRateMcps: a.truth.chipRateMcps,
      recoveryUs: recoveryUsOf(a.truth),
      maxPeriodUs: maxPeriodUsOf(a.truth),
    });
  },
};

// Level 6 works on the DF view, not the link scene.
const setup6: LevelSetup = {
  truth: level6Truth,
  scene: (t) => level6Scene(t),
  hidden: ['jammer', 'intercept'],
  editable: [],
  noScene: true,
  values: (a) => level6Values(a.truth, a.practiceN ?? 0),
  hiddenRows: () => [],
  card: () => null,
};

// Level 7 works on the hop waterfall; its J/S values are given in the texts, so the scene is not shown.
const setup7: LevelSetup = {
  truth: level7Truth,
  scene: level2Scene,
  hidden: ['intercept'],
  editable: [],
  noScene: true,
  values: (a) => level7Values(a.truth, a.practiceN ?? 0),
  hiddenRows: () => [],
  card: () => null,
};

export const SETUPS: Record<number, LevelSetup> = { 0: setup0, 1: setup1, 2: setup2, 3: setup3, 4: setup4, 5: setup5, 6: setup6, 7: setup7 };
