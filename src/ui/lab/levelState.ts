import type { LevelDef } from '../../engine/lab/levels';

export interface FieldResult {
  value: number;
  ok: boolean;
  truth: number;
  points: number;
}

// What the player has done in one step. Submissions are final.
export interface StepState {
  done: boolean;
  fields?: Record<string, FieldResult>;
  answers?: Record<string, number>; // question id to chosen option
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

// Field steps score as characterisation, except the predict step; question steps as questions.
export function scoreLevel(level: LevelDef, states: StepState[]): Score {
  const parts = {
    characterisation: { got: 0, max: 0 },
    prediction: { got: 0, max: 0 },
    questions: { got: 0, max: 0 },
  };
  level.steps.forEach((step, i) => {
    const st = states[i];
    if (step.goal.kind === 'fields') {
      const part = step.id === 'predict' ? parts.prediction : parts.characterisation;
      for (const f of step.goal.fields) {
        part.max += f.points;
        part.got += st?.fields?.[f.id]?.points ?? 0;
      }
    } else if (step.goal.kind === 'questions') {
      for (const q of step.goal.questions) {
        parts.questions.max += q.points;
        if (st?.answers?.[q.id] === q.correct) parts.questions.got += q.points;
      }
    }
  });
  const total = parts.characterisation.got + parts.prediction.got + parts.questions.got;
  const max = parts.characterisation.max + parts.prediction.max + parts.questions.max;
  return { ...parts, total, max, passed: total >= level.passMark };
}
