import {
  type ApplyStep,
  type LocateTry,
  type LevelDef,
  type PracticeStep,
  type PredictGrade,
  type RunSummary,
  flatSteps,
  scoreDeny,
  scorePrediction,
} from '../../engine/lab/levels';

export interface FieldResult {
  value: number;
  ok: boolean;
  truth: number;
  points: number;
  grade?: PredictGrade; // predictBer fields: how the prediction compared with the run
}

// What the player has done in one step, indexed like flatSteps(). Apply and question submissions are final.
export interface StepState {
  done: boolean;
  skipped?: boolean; // moved on without finishing; ignored once done
  fields?: Record<string, FieldResult>; // apply: the submission; practice: the latest check
  answers?: Record<string, number>; // question id to chosen option
  tries?: number; // wrong lesson checks or practice checks so far
  checkRight?: boolean; // lesson check answered right
  checkWrong?: boolean; // the last lesson check was wrong
  worked?: boolean; // practice: the worked answer has been shown
  first?: Record<string, { value: number; ok: boolean }>; // practice: the first entry for each field
  retrying?: boolean; // apply: an unscored retry is open
  retry?: Record<string, FieldResult>; // apply: the latest retry; the score keeps the first submission
  prediction?: number; // a step with a run: the BER predicted, locked when Run was pressed
  runs?: RunSummary[]; // every run finished in this step, in order
  goal?: { points: number; run: RunSummary; runNo: number }; // apply with a deny goal: the run that reached it
  df?: { sites: { xKm: number; yKm: number }[]; tries: number; last?: LocateTry }; // level 6: the sites placed and the latest try
  located?: { points: number; tryNo: number; cepKm?: number; crossingDeg?: number }; // apply with a locate goal: the try that met it
  retryRun?: { prediction?: number; result?: RunSummary }; // apply: the unscored retry of a run
  runInput?: number; // apply: the edited value of the run's runInput field (NaN while the entry is not a number)
  retries?: number; // apply: how many retries were started, for the run seed
}

// An apply step is done when every field and the goal, if there is one, are settled.
export function applyDone(step: ApplyStep, st: StepState | undefined): boolean {
  return step.fields.every((f) => !!st?.fields?.[f.id]) && (!step.goal || !!st?.goal) && (!step.locate || !!st?.located)
    && (!step.runUnscored || !!st?.runs?.length);
}

export interface ScorePart {
  got: number;
  max: number;
}

export interface Score {
  characterisation: ScorePart;
  prediction: ScorePart;
  questions: ScorePart;
  total: number;
  max: number;
  passed: boolean;
}

// Only apply fields and questions score. Lessons and practice never do.
export function scoreLevel(level: LevelDef, states: StepState[]): Score {
  const parts = {
    characterisation: { got: 0, max: 0 },
    prediction: { got: 0, max: 0 },
    questions: { got: 0, max: 0 },
  };
  for (const { index, step } of flatSteps(level)) {
    const st = states[index];
    if (step.kind === 'apply') {
      const part = step.prediction ? parts.prediction : parts.characterisation;
      for (const f of step.fields) {
        part.max += f.points;
        part.got += st?.fields?.[f.id]?.points ?? 0;
      }
      if (step.goal) {
        part.max += step.goal.points;
        part.got += st?.goal?.points ?? 0;
      }
      if (step.locate) {
        part.max += step.locate.points;
        part.got += st?.located?.points ?? 0;
      }
    } else if (step.kind === 'find' && step.points) {
      // Level 9: a scene goal reached, not skipped.
      parts.characterisation.max += step.points;
      if (st?.done) parts.characterisation.got += step.points;
    } else if (step.kind === 'questions') {
      for (const q of step.questions) {
        parts.questions.max += q.points;
        if (st?.answers?.[q.id] === q.correct) parts.questions.got += q.points;
      }
    }
  }
  const total = parts.characterisation.got + parts.prediction.got + parts.questions.got;
  const max = parts.characterisation.max + parts.prediction.max + parts.questions.max;
  return { ...parts, total, max, passed: total >= level.passMark };
}

// A run finished in a step. 'retry' runs only fill retryRun. In an apply step the first run scores the
// prediction and the first run that reaches the deny goal scores the goal; in a practice step every run checks
// the prediction, unscored, and the step is done once it is right.
export function runDone(step: ApplyStep | PracticeStep, st: StepState, s: RunSummary, mode: 'main' | 'retry'): StepState {
  if (mode === 'retry') return { ...st, retryRun: { ...st.retryRun, result: s } };
  const runs = [...(st.runs ?? []), s];
  const next: StepState = { ...st, runs };
  const pf = step.fields.find((f) => f.kind === 'predictBer');
  if (step.kind === 'practice') {
    if (!pf || st.prediction === undefined) return next;
    const g = scorePrediction(st.prediction, s, 0, pf.fullWithinFactor);
    const ok = g.grade !== 'miss';
    const fields = { ...st.fields, [pf.id]: { value: st.prediction, ok, truth: s.ber, points: 0, grade: g.grade } };
    const first = { ...st.first };
    if (!first[pf.id]) first[pf.id] = { value: st.prediction, ok };
    const done = step.fields.every((f) => fields[f.id]?.ok);
    return { ...next, fields, first, done: st.done || done, tries: ok ? st.tries : (st.tries ?? 0) + 1 };
  }
  if (pf && st.prediction !== undefined && !st.fields?.[pf.id]) {
    const g = scorePrediction(st.prediction, s, pf.points, pf.fullWithinFactor);
    next.fields = { ...st.fields, [pf.id]: { value: st.prediction, ok: g.grade === 'inside', truth: s.ber, points: g.points, grade: g.grade } };
  }
  if (step.goal && !st.goal) {
    const d = scoreDeny(step.goal.measure === 'per' ? (s.packets?.per ?? 0) : s.ber, step.goal, runs.length);
    if (d.passed) next.goal = { points: d.points, run: s, runNo: runs.length };
  }
  return { ...next, done: st.done || applyDone(step, next) };
}
