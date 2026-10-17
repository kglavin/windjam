import { useState } from 'react';
import { type FieldDef, type LevelDef, type Question, type StepDef, fillText } from '../../engine/lab/levels';
import type { Score, StepState } from './levelState';

export interface StagePanelProps {
  level: LevelDef;
  states: StepState[];
  current: number; // index of the step in play; steps.length means the debrief
  viewing: number | null; // a finished step reopened read-only
  onView: (i: number | null) => void;
  chipSnrDb: number; // live chip SNR at the intercept
  values: Record<string, string>; // placeholder values for the texts
  onSubmitFields: (stepIndex: number, entered: Record<string, number>) => void;
  onAnswer: (stepIndex: number, questionId: string, choice: number) => void;
  onContinue: () => void;
  score: Score;
  onReplay: () => void;
  onExit: () => void;
}

const sig = (v: number) => String(Number(v.toPrecision(3)));
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;

export function StagePanel(p: StagePanelProps) {
  const { level, states, current } = p;
  const debrief = current >= level.steps.length;
  const shown = p.viewing ?? current;
  const showDebrief = p.viewing === null && debrief;

  return (
    <aside className="stage-panel">
      <h2>Level {level.id}: {level.title}</h2>
      <details key={current > 0 ? 'closed' : 'open'} className="stage-intro" open={current === 0}>
        <summary>Briefing</summary>
        <p>{level.intro}</p>
      </details>

      <ol className="stage-steps">
        {level.steps.map((s, i) => {
          const done = states[i]?.done;
          const active = i === shown && !showDebrief;
          const reachable = done || i === current;
          return (
            <li key={s.id} className={`${done ? 'done' : ''} ${active ? 'active' : ''}`}>
              <button type="button" disabled={!reachable} onClick={() => p.onView(i === current ? null : i)}>
                <span className="stage-tick">{done ? '✓' : i === current ? '▸' : '○'}</span> {s.title}
              </button>
            </li>
          );
        })}
        <li className={`${debrief ? 'active' : ''}`}>
          <button type="button" disabled={!debrief} onClick={() => p.onView(null)}>
            <span className="stage-tick">{debrief ? '▸' : '○'}</span> Debrief
          </button>
        </li>
      </ol>

      {showDebrief ? (
        <Debrief {...p} />
      ) : (
        <StepBody
          key={level.steps[shown].id}
          step={level.steps[shown]}
          index={shown}
          state={states[shown] ?? { done: false }}
          readOnly={shown !== current}
          {...p}
        />
      )}
    </aside>
  );
}

function StepBody(p: StagePanelProps & { step: StepDef; index: number; state: StepState; readOnly: boolean }) {
  const { step, index, state, readOnly } = p;
  const [hintOpen, setHintOpen] = useState(false);
  const last = index === p.level.steps.length - 1;
  return (
    <section className="stage-step">
      <h3>{index + 1}. {step.title}</h3>
      <p className="stage-task">{fillText(step.task, p.values)}</p>
      {step.hint && (
        <div>
          <button type="button" className="link-button" onClick={() => setHintOpen((o) => !o)}>
            {hintOpen ? 'Hide hint' : 'Show hint'}
          </button>
          {hintOpen && <p className="stage-hint">{fillText(step.hint, p.values)}</p>}
        </div>
      )}

      {step.goal.kind === 'interceptSnr' && (
        <div className={`stage-meter ${p.chipSnrDb >= step.goal.atLeastDb || state.done ? 'ok' : ''}`}>
          Chip SNR at the intercept: <strong>{Number.isFinite(p.chipSnrDb) ? signed(p.chipSnrDb) : '-'} dB</strong>, target +{step.goal.atLeastDb} dB
          {state.done && ' ✓'}
        </div>
      )}
      {step.goal.kind === 'fields' && (
        <FieldsGoal fields={step.goal.fields} state={state} readOnly={readOnly} onSubmit={(e) => p.onSubmitFields(index, e)} />
      )}
      {step.goal.kind === 'questions' && (
        <QuestionsGoal
          questions={step.goal.questions}
          state={state}
          readOnly={readOnly}
          onAnswer={(qid, c) => p.onAnswer(index, qid, c)}
        />
      )}

      {state.done && step.reveal && <p className="stage-reveal">{fillText(step.reveal, p.values)}</p>}
      {state.done && step.tryThis && (
        <p className="stage-try">
          <strong>Try this. </strong>
          {fillText(step.tryThis, p.values)}
        </p>
      )}
      {state.done && !readOnly && (
        <button type="button" className="stage-continue" onClick={p.onContinue}>
          {last ? 'See debrief' : 'Continue'}
        </button>
      )}
      {readOnly && (
        <button type="button" className="link-button" onClick={() => p.onView(null)}>
          Back to current step
        </button>
      )}
    </section>
  );
}

function FieldsGoal({ fields, state, readOnly, onSubmit }: {
  fields: FieldDef[];
  state: StepState;
  readOnly: boolean;
  onSubmit: (entered: Record<string, number>) => void;
}) {
  const [text, setText] = useState<Record<string, string>>({});
  const submitted = !!state.fields;
  const parsed = (id: string) => (text[id] === undefined || text[id].trim() === '' ? NaN : Number(text[id]));
  const ready = fields.every((f) => Number.isFinite(parsed(f.id)));
  return (
    <form
      className="stage-fields"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || submitted || readOnly) return;
        onSubmit(Object.fromEntries(fields.map((f) => [f.id, parsed(f.id)])));
      }}
    >
      {fields.map((f) => {
        const r = state.fields?.[f.id];
        return (
          <div className="stage-field" key={f.id}>
            <label>
              <span>{f.label}</span>
              <span className="stage-input">
                <input
                  type="number"
                  step="any"
                  disabled={submitted || readOnly}
                  value={r ? String(r.value) : (text[f.id] ?? '')}
                  onChange={(e) => setText((t) => ({ ...t, [f.id]: e.target.value }))}
                />
                <span className="stage-unit">{f.unit}</span>
              </span>
            </label>
            {r && (
              <span className={`stage-result ${r.ok ? 'ok' : r.points > 0 ? 'partial' : 'bad'}`}>
                {r.ok ? '✓' : r.points > 0 ? '~' : '✗'} true value {sig(r.truth)} {f.unit}
                {f.points > 0 ? `, ${r.points}/${f.points} pts` : ', not scored'}
              </span>
            )}
          </div>
        );
      })}
      {!submitted && !readOnly && (
        <button type="submit" disabled={!ready}>Submit</button>
      )}
    </form>
  );
}

function QuestionsGoal({ questions, state, readOnly, onAnswer }: {
  questions: Question[];
  state: StepState;
  readOnly: boolean;
  onAnswer: (qid: string, choice: number) => void;
}) {
  const [pick, setPick] = useState<Record<string, number>>({});
  return (
    <div className="stage-questions">
      {questions.map((q, qi) => {
        const answered = state.answers?.[q.id];
        const done = answered !== undefined;
        return (
          <fieldset key={q.id} disabled={done || readOnly}>
            <legend>{qi + 1}. {q.text}</legend>
            {q.options.map((o, oi) => (
              <label key={o} className={done && oi === q.correct ? 'ok' : done && oi === answered ? 'bad' : ''}>
                <input
                  type="radio"
                  name={q.id}
                  checked={(done ? answered : pick[q.id]) === oi}
                  onChange={() => setPick((s) => ({ ...s, [q.id]: oi }))}
                />
                <span>{o}</span>
              </label>
            ))}
            {!done && !readOnly && (
              <button type="button" disabled={pick[q.id] === undefined} onClick={() => onAnswer(q.id, pick[q.id])}>
                Submit
              </button>
            )}
            {done && (
              <p className="stage-reveal">
                <strong>{answered === q.correct ? `Correct, ${q.points} pts. ` : 'Not quite, 0 pts. '}</strong>
                {q.explain}
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

function Debrief(p: StagePanelProps) {
  const { score } = p;
  const row = (name: string, part: { got: number; max: number }) => (
    <tr>
      <td>{name}</td>
      <td className="num">{part.got} / {part.max}</td>
    </tr>
  );
  return (
    <section className="stage-step stage-debrief">
      <h3>Debrief</h3>
      <p className="stage-reveal">{fillText(p.level.debrief, p.values)}</p>
      <table className="stage-score">
        <tbody>
          {row('Characterisation', score.characterisation)}
          {row('Prediction', score.prediction)}
          {row('Questions', score.questions)}
          <tr className="total">
            <td>Total</td>
            <td className="num">{score.total} / {score.max}</td>
          </tr>
        </tbody>
      </table>
      <p className={score.passed ? 'stage-pass' : 'stage-fail'}>
        {score.passed ? 'Passed' : 'Not passed'} (pass mark {p.level.passMark})
      </p>
      <div className="stage-buttons">
        <button type="button" onClick={p.onReplay}>Play again with a new link</button>
        <button type="button" onClick={p.onExit}>Back to levels</button>
      </div>
    </section>
  );
}
