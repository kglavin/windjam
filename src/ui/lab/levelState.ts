import { type LevelDef, flatSteps } from '../../engine/lab/levels';

export interface FieldResult {
  value: number;
  ok: boolean;
  truth: number;
  points: number;
}

// What the player has done in one step, indexed like flatSteps(). Apply and question submissions are final.
export interface StepState {
  done: boolean;
  fields?: Record<string, FieldResult>; // apply: the submission; practice: the latest check
  answers?: Record<string, number>; // question id to chosen option
  tries?: number; // wrong lesson checks or practice checks so far
  checkRight?: boolean; // lesson check answered right
  checkWrong?: boolean; // the last lesson check was wrong
  worked?: boolean; // practice: the worked answer has been shown
  first?: Record<string, { value: number; ok: boolean }>; // practice: the first entry for each field
  retrying?: boolean; // apply: an unscored retry is open
  retry?: Record<string, FieldResult>; // apply: the latest retry; the score keeps the first submission
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
