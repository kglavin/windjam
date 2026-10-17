// Navigation through a level is never gated. Leaving a step that is not done marks it skipped; a skipped step
// scores nothing until the player does it. Pure: no React.
import { type FlatStep, type StepDef } from '../../engine/lab/levels';
import type { StepState } from './levelState';

// The forward button reads "Continue" when this is true, else "Skip". A lesson without a check is finished by moving on.
export function canContinue(step: StepDef, state: StepState | undefined): boolean {
  if (step.kind === 'lesson') return !step.check || !!state?.checkRight;
  return !!state?.done;
}

export const isSkipped = (st: StepState | undefined): boolean => !!st && !!st.skipped && !st.done;

// The states after moving on from step i: a lesson without a check is done, any other step not done is skipped.
// Skipping is not a submission: fields, prediction and runs stay as they were.
export function leaveStep(flat: FlatStep[], states: StepState[], i: number): StepState[] {
  const step = flat[i]?.step;
  if (!step) return states;
  return states.map((s, j) => {
    if (j !== i || s.done) return s;
    if (step.kind === 'lesson' && !step.check) return { ...s, done: true, skipped: false };
    return { ...s, skipped: true };
  });
}

export const nextIndex = (flat: FlatStep[], i: number): number => Math.min(i + 1, flat.length);

// Steps still to do, by id, for the debrief: skipped steps and steps never reached, except lessons that need no answer.
export function notDone(flat: FlatStep[], states: StepState[]): string[] {
  return flat
    .filter(({ index, step }) => !states[index]?.done && !(step.kind === 'lesson' && !step.check && !states[index]?.skipped))
    .map(({ step }) => step.id);
}
