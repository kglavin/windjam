// Link lab level framework: hidden truth, step and field types, tolerances and scoring (design sections 7 and 8).
// Level content is in level1.ts, level2.ts and index.ts. Pure: no React, no storage.
import { createRng } from '../../rng';
import type { JammerSpec } from '../jammers';

export interface Truth {
  seed: number;
  degree: 5 | 6 | 7;
  n: number; // code length in chips, 2^degree - 1
  chipRateMcps: number;
  bitRateKbps: number;
  gp: number;
  gpDb: number;
  carrierCyclesPerChip: number;
}

const DEGREES = [5, 6, 7] as const;
const CHIP_RATES = [0.5, 1, 2];

// A short code, one code period per bit, so Gp = n.
export function shortCodeTruth(seed: number): Truth {
  const rng = createRng(seed);
  const degree = DEGREES[Math.floor(rng() * DEGREES.length)];
  const chipRateMcps = CHIP_RATES[Math.floor(rng() * CHIP_RATES.length)];
  const carrierCyclesPerChip = rng() * 0.003;
  const n = 2 ** degree - 1;
  return {
    seed,
    degree,
    n,
    chipRateMcps,
    bitRateKbps: (chipRateMcps * 1000) / n,
    gp: n,
    gpDb: 10 * Math.log10(n),
    carrierCyclesPerChip,
  };
}

// Live values from the scene budget at the moment of submission.
export interface Ctx {
  rxSnrDb: number;
  rxEbN0Db: number;
  practice?: KnownLinkInfo; // the practice link in play; the first one when absent
  practiceJsDb?: number; // level 2: J/S on the practice link
  jsDb?: number; // level 2: J/S of the scene the level started with (the jammer is fixed until the last unit)
  ebJ0Db?: number; // level 2: Eb/J0 of that scene
}

export interface FieldDef {
  id: string;
  label: string;
  unit: string;
  // Fields come in groups submitted one after the other: a later group appears once the earlier one is confirmed.
  group?: number;
  prompt?: string; // shown above the input, may quote confirmed values

  truth: (t: Truth, ctx: Ctx) => number;
  check: Tol;
  points: number;
  // 'predictBer': the player predicts a BER before a run; it is scored against the run (scorePrediction), not
  // against truth and check. truth then gives the theory BER, shown as a reference.
  kind?: 'predictBer';
  // Reduced credit for an answer outside `check` but inside this tolerance.
  partial?: { abs: number; points: number };
}

export interface Tol {
  rel?: number;
  abs?: number;
  exact?: boolean;
  factor?: number; // value within truth / factor and truth * factor (positive values only)
}

export function withinTol(c: Tol, value: number, truth: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (c.exact) return value === truth;
  if (c.factor !== undefined) return value > 0 && truth > 0 && value <= truth * c.factor && value >= truth / c.factor;
  const err = Math.abs(value - truth);
  if (c.rel !== undefined) return err <= c.rel * Math.abs(truth);
  if (c.abs !== undefined) return err <= c.abs;
  return false;
}

export function checkField(f: FieldDef, value: number, t: Truth, ctx: Ctx): { ok: boolean; truth: number; points: number } {
  const truth = f.truth(t, ctx);
  const err = Math.abs(value - truth);
  const ok = withinTol(f.check, value, truth);
  if (ok) return { ok, truth, points: f.points };
  if (f.partial && Number.isFinite(value) && err <= f.partial.abs) return { ok, truth, points: f.partial.points };
  return { ok, truth, points: 0 };
}


export interface Question {
  id: string;
  text: string;
  options: string[];
  correct: number;
  explain: string;
  points: number;
}

// A small link the player is shown, never hidden: its numbers are written in the texts.
export interface KnownLink {
  degree: number;
  chipRateMcps: number;
}

export interface KnownLinkInfo extends KnownLink {
  n: number;
  bitRateKbps: number;
  gp: number;
  gpDb: number;
  periodUs: number;
}

// Short code, one code period per bit.
export function knownLinkInfo(k: KnownLink): KnownLinkInfo {
  const n = 2 ** k.degree - 1;
  return {
    ...k,
    n,
    bitRateKbps: (k.chipRateMcps * 1000) / n,
    gp: n,
    gpDb: 10 * Math.log10(n),
    periodUs: n / k.chipRateMcps,
  };
}

export type LinkKey = 'example' | 'practice' | 'hidden';

export type Visual =
  | { kind: 'spreading' }
  | { kind: 'spreadVsUnspread' }
  | { kind: 'despread' }
  | { kind: 'interceptCompare' }
  | { kind: 'dbTable' }
  | { kind: 'jammedSpectra' }
  | { kind: 'despreadBars'; gpDb?: number; jsDb?: number; link?: 'practice' } // fixed values, or the practice link's
  | { kind: 'berCurve'; mark?: 'example' | 'practice' } // marks that link's Eb/J0 on the curve
  | { kind: 'berRunDemo' }
  | { kind: 'spectrum'; link: LinkKey; annotate?: boolean }
  | { kind: 'autocorr'; link: LinkKey; annotate?: boolean }
  | { kind: 'none' };

export type Instrument = 'spectrum' | 'autocorr';

// Scene fields the player may edit in a step. 'jammer' is the jammer's position only (drag and x/y).
export type SceneField =
  | 'positions'
  | 'intercept'
  | 'jammer'
  | 'freq'
  | 'txPower'
  | 'jamPower'
  | 'heights'
  | 'gains'
  | 'rxAntenna'
  | 'paths'
  | 'obstacles'
  | 'noise'
  | 'rates';

// A BER run inside a step. Known links run at Eb/N0 30 dB (noise negligible); the hidden link at the scene's
// receiver Eb/N0. js 'fixed' uses jsDb, or the practice link's J/S when jsDb is absent; 'scene' uses the scene's J/S.
export interface RunSpec {
  link: LinkKey;
  js: 'fixed' | 'scene';
  jsDb?: number;
  jammer: JammerSpec;
}

// The jammer's goal: after a run at the scene's J/S the measured BER reaches berAtLeast (less 20% for counting
// noise). Points in full when passed within 3 runs, half after.
export interface DenyGoal {
  kind: 'deny';
  berAtLeast: number;
  points: number;
  task: string;
}

// What a finished run measured, with the J/S it ran at.
export interface RunSummary {
  bits: number;
  errors: number;
  ber: number;
  lo: number;
  hi: number;
  stoppedBy: string;
  jsDb: number;
  ebJ0Db: number;
  theoryBer: number;
}

export const DENY_TOLERANCE = 0.8;
export const DENY_FULL_RUNS = 3;

export type PredictGrade = 'inside' | 'near' | 'miss';

// A BER prediction against a run: full points inside the run's 95% interval, half within a factor of 2 of the
// measured BER, else none.
export function scorePrediction(prediction: number, run: { ber: number; lo: number; hi: number }, points: number): { grade: PredictGrade; points: number } {
  if (!Number.isFinite(prediction) || prediction <= 0) return { grade: 'miss', points: 0 };
  if (prediction >= run.lo && prediction <= run.hi) return { grade: 'inside', points };
  if (run.ber > 0 && prediction <= 2 * run.ber && prediction >= run.ber / 2) return { grade: 'near', points: points / 2 };
  return { grade: 'miss', points: 0 };
}

// The deny goal on the runNo-th run (1 for the first).
export function scoreDeny(ber: number, goal: DenyGoal, runNo: number): { passed: boolean; points: number } {
  const passed = ber >= goal.berAtLeast * DENY_TOLERANCE - 1e-12; // the margin absorbs 0.1 * 0.8 not being exactly 0.08
  if (!passed) return { passed, points: 0 };
  return { passed, points: runNo <= DENY_FULL_RUNS ? goal.points : Math.round(goal.points / 2) };
}

export interface LessonStep {
  kind: 'lesson';
  id: string;
  title: string;
  paragraphs?: string[];
  steps?: string[]; // numbered worked example
  rule?: string;
  visual: Visual;
  // Unscored, unlimited retries.
  check?: { question: string; unit?: string; answer: number; tol: Tol; wrong: string };
}

export interface PracticeStep {
  kind: 'practice';
  id: string;
  title: string;
  link: 'practice';
  visual: Visual;
  task: string;
  hint: string;
  fields: FieldDef[]; // truths from the practice link, all unscored
  worked: string[];
  run?: RunSpec; // a BER run on the practice link; a predictBer field is checked against it
}

export interface ApplyStep {
  kind: 'apply';
  id: string;
  title: string;
  task: string;
  hint?: string;
  fields: FieldDef[];
  reveal: string[];
  instruments: Instrument[];
  visual?: Visual;
  annotate?: 'nulls' | 'codePeriods'; // drawn on the instrument once the step is done
  prediction?: boolean; // scored as prediction rather than characterisation
  run?: RunSpec; // a BER run; a predictBer field is scored against it
  goal?: DenyGoal; // appears once the fields are submitted; the run counts when it reaches the goal
  editable?: SceneField[]; // scene fields the player may change in this step (the level's default when absent)
  hiddenRows?: string[]; // budget rows hidden from the scene's ladder until the step is done
}

export interface FindStep {
  kind: 'find';
  id: string;
  title: string;
  task: string;
  hint: string;
  atLeastDb: number;
  reveal: string[];
  instruments: Instrument[];
}

export interface QuestionsStep {
  kind: 'questions';
  id: string;
  title: string;
  task: string;
  questions: Question[];
}

export type StepDef = LessonStep | PracticeStep | ApplyStep | FindStep | QuestionsStep;

export interface UnitDef {
  id: string;
  title: string;
  steps: StepDef[];
}

export interface LevelDef {
  id: number;
  title: string;
  intro: string;
  links: { example: KnownLink; practice: KnownLink };
  units: UnitDef[];
  debrief: string;
  passMark: number;
}

export interface FlatStep {
  index: number;
  unitIndex: number;
  unit: UnitDef;
  step: StepDef;
}

// Every step in play order, with the unit it belongs to. State arrays are indexed by `index`.
export function flatSteps(level: LevelDef): FlatStep[] {
  const out: FlatStep[] = [];
  level.units.forEach((unit, unitIndex) => {
    for (const step of unit.steps) out.push({ index: out.length, unitIndex, unit, step });
  });
  return out;
}

export const EXAMPLE: KnownLink = { degree: 5, chipRateMcps: 1 };
export const PRACTICE: KnownLink = { degree: 6, chipRateMcps: 2 };
export const FIRST_PRACTICE = knownLinkInfo(PRACTICE);
export const pr = (ctx: Ctx): KnownLinkInfo => ctx.practice ?? FIRST_PRACTICE;

const PRACTICE_DEGREES = [5, 6];
const PRACTICE_RATES = [0.5, 1, 2];

// The practice link for a "Try another" counter: 0 is the first (degree 6, 2 Mcps), each later one is seeded
// from the counter and differs from the one before.
export function practiceLinkAt(counter: number): KnownLink {
  let prev: KnownLink = PRACTICE;
  for (let c = 1; c <= counter; c++) {
    const rng = createRng((Math.imul(c, 0x9e3779b1) ^ 0x51ed27) >>> 0);
    const pairs = PRACTICE_DEGREES.flatMap((degree) => PRACTICE_RATES.map((chipRateMcps) => ({ degree, chipRateMcps })));
    const choices = pairs.filter((x) => x.degree !== prev.degree || x.chipRateMcps !== prev.chipRateMcps);
    prev = choices[Math.floor(rng() * choices.length)];
  }
  return prev;
}
export function fillText(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}

