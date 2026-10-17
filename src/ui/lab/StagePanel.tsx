import { useState } from 'react';
import {
  type ApplyStep,
  type FieldDef,
  type LessonStep,
  type LevelDef,
  type PracticeStep,
  type Question,
  type StepDef,
  fillText,
  flatSteps,
} from '../../engine/lab/levels';
import type { Score, StepState } from './levelState';

export interface StagePanelProps {
  level: LevelDef;
  states: StepState[]; // indexed like flatSteps(level)
  current: number; // flat index of the step in play; flat.length means the debrief
  viewing: number | null; // a finished step reopened read-only
  onView: (i: number | null) => void;
  chipSnrDb: number; // live chip SNR at the intercept
  values: Record<string, string>; // placeholder values for the texts
  onCheckLesson: (stepIndex: number, value: number) => void;
  onCheckPractice: (stepIndex: number, entered: Record<string, number>) => void;
  onShowWorked: (stepIndex: number) => void;
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
  const flat = flatSteps(level);
  const debrief = current >= flat.length;
  const shown = p.viewing ?? current;
  const showDebrief = p.viewing === null && debrief;
  const activeUnit = showDebrief ? -1 : flat[shown].unitIndex;

  return (
    <aside className="stage-panel">
      <h2>Level {level.id}: {level.title}</h2>
      <details key={current > 0 ? 'closed' : 'open'} className="stage-intro" open={current === 0}>
        <summary>Briefing</summary>
        <p>{level.intro}</p>
      </details>

      <ol className="stage-units">
        {level.units.map((u, ui) => {
          const steps = flat.filter((f) => f.unitIndex === ui);
          const allDone = steps.every((f) => states[f.index]?.done);
          const active = ui === activeUnit;
          return (
            <li key={u.id} className="stage-unit-group">
              <details key={`${u.id}-${active}`} open={active}>
                <summary className={allDone ? 'done' : active ? 'active' : ''}>
                  <span className="stage-tick">{allDone ? '✓' : active ? '▸' : '○'}</span> {u.id}. {u.title}
                </summary>
                <ol className="stage-steps">
                  {steps.map(({ index, step }) => {
                    const done = states[index]?.done;
                    const on = index === shown && !showDebrief;
                    const reachable = done || index === current;
                    return (
                      <li key={step.id} className={`${done ? 'done' : ''} ${on ? 'active' : ''}`}>
                        <button type="button" disabled={!reachable} onClick={() => p.onView(index === current ? null : index)}>
                          <span className="stage-tick">{done ? '✓' : index === current ? '▸' : '○'}</span> {step.id}. {step.title}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </details>
            </li>
          );
        })}
        <li className={`stage-unit-group ${debrief ? 'active' : ''}`}>
          <button type="button" className="stage-debrief-link" disabled={!debrief} onClick={() => p.onView(null)}>
            <span className="stage-tick">{debrief ? '▸' : '○'}</span> Debrief
          </button>
        </li>
      </ol>

      {showDebrief ? (
        <Debrief {...p} />
      ) : (
        <StepBody
          key={flat[shown].step.id}
          step={flat[shown].step}
          index={shown}
          state={states[shown] ?? { done: false }}
          readOnly={shown !== current}
          last={shown === flat.length - 1}
          {...p}
        />
      )}
    </aside>
  );
}

function Numbered({ items, values, className = 'stage-worked' }: { items: string[]; values: Record<string, string>; className?: string }) {
  if (items.length === 1) return <p className="stage-reveal">{fillText(items[0], values)}</p>;
  return (
    <ol className={className}>
      {items.map((t) => (
        <li key={t}>{fillText(t, values)}</li>
      ))}
    </ol>
  );
}

function Hint({ text, values }: { text?: string; values: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div>
      <button type="button" className="link-button" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide hint' : 'Show hint'}
      </button>
      {open && <p className="stage-hint">{fillText(text, values)}</p>}
    </div>
  );
}

function StepBody(p: StagePanelProps & { step: StepDef; index: number; state: StepState; readOnly: boolean; last: boolean }) {
  const { step, index, state, readOnly } = p;
  const canContinue = step.kind === 'lesson' ? !step.check || !!state.checkRight : state.done;
  return (
    <section className="stage-step">
      <h3>{step.id}. {step.title}</h3>
      {step.kind === 'lesson' && <Lesson {...p} step={step} />}
      {step.kind === 'practice' && <Practice {...p} step={step} />}
      {step.kind === 'apply' && <Apply {...p} step={step} />}
      {step.kind === 'find' && (
        <>
          <p className="stage-task">{fillText(step.task, p.values)}</p>
          <Hint text={step.hint} values={p.values} />
          <div className={`stage-meter ${p.chipSnrDb >= step.atLeastDb || state.done ? 'ok' : ''}`}>
            Chip SNR at the intercept: <strong>{Number.isFinite(p.chipSnrDb) ? signed(p.chipSnrDb) : '-'} dB</strong>, target +{step.atLeastDb} dB
            {state.done && ' ✓'}
          </div>
          {state.done && <Numbered items={step.reveal} values={p.values} />}
        </>
      )}
      {step.kind === 'questions' && (
        <>
          <p className="stage-task">{fillText(step.task, p.values)}</p>
          <QuestionsGoal
            questions={step.questions}
            state={state}
            readOnly={readOnly}
            onAnswer={(qid, c) => p.onAnswer(index, qid, c)}
          />
        </>
      )}

      {canContinue && !readOnly && (
        <button type="button" className="stage-continue" onClick={p.onContinue}>
          {p.last ? 'See debrief' : 'Continue'}
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

function Lesson(p: StagePanelProps & { step: LessonStep; index: number; state: StepState; readOnly: boolean }) {
  const { step, state } = p;
  return (
    <>
      {step.paragraphs?.map((t) => (
        <p key={t} className="stage-para">{fillText(t, p.values)}</p>
      ))}
      {step.steps && <Numbered items={step.steps} values={p.values} className="stage-worked stage-example" />}
      {step.rule && <p className="stage-rule">{fillText(step.rule, p.values)}</p>}
      {step.check && (
        <CheckBox
          check={step.check}
          state={state}
          readOnly={p.readOnly}
          onCheck={(v) => p.onCheckLesson(p.index, v)}
        />
      )}
    </>
  );
}

function CheckBox({ check, state, readOnly, onCheck }: {
  check: NonNullable<LessonStep['check']>;
  state: StepState;
  readOnly: boolean;
  onCheck: (value: number) => void;
}) {
  const [text, setText] = useState('');
  const right = !!state.checkRight;
  const value = text.trim() === '' ? NaN : Number(text);
  return (
    <form
      className="stage-check"
      onSubmit={(e) => {
        e.preventDefault();
        if (!Number.isFinite(value) || right || readOnly) return;
        onCheck(value);
      }}
    >
      <p className="stage-task"><strong>{check.question}</strong></p>
      <span className="stage-input">
        <input
          type="number"
          step="any"
          aria-label="Your answer"
          disabled={right || readOnly}
          value={right && !text ? String(state.fields?.answer?.value ?? '') : text}
          onChange={(e) => setText(e.target.value)}
        />
        {check.unit && <span className="stage-unit">{check.unit}</span>}
        {!right && !readOnly && <button type="submit" disabled={!Number.isFinite(value)}>Check</button>}
      </span>
      {right && <p className="stage-feedback ok">Right.</p>}
      {!right && state.checkWrong && <p className="stage-feedback bad">{check.wrong}</p>}
    </form>
  );
}

function Practice(p: StagePanelProps & { step: PracticeStep; index: number; state: StepState; readOnly: boolean }) {
  const { step, state } = p;
  return (
    <>
      <p className="stage-task">{fillText(step.task, p.values)}</p>
      <Hint text={step.hint} values={p.values} />
      <FieldsForm
        fields={step.fields}
        state={state}
        readOnly={p.readOnly}
        practice
        onSubmit={(e) => p.onCheckPractice(p.index, e)}
      />
      {!p.readOnly && !state.worked && (
        <button type="button" className="link-button" onClick={() => p.onShowWorked(p.index)}>
          Show the worked answer
        </button>
      )}
      {state.worked && (
        <>
          <p className="stage-subhead">Worked answer</p>
          <Numbered items={step.worked} values={p.values} className="stage-worked stage-example" />
        </>
      )}
    </>
  );
}

function Apply(p: StagePanelProps & { step: ApplyStep; index: number; state: StepState; readOnly: boolean }) {
  const { step, state } = p;
  return (
    <>
      <p className="stage-task">{fillText(step.task, p.values)}</p>
      <Hint text={step.hint} values={p.values} />
      <FieldsForm fields={step.fields} state={state} readOnly={p.readOnly} onSubmit={(e) => p.onSubmitFields(p.index, e)} />
      {state.done && (
        <>
          <p className="stage-subhead">Worked answer</p>
          <Numbered items={step.reveal} values={p.values} className="stage-worked stage-example" />
        </>
      )}
    </>
  );
}

// Apply: one scored submission that shows the true value. Practice: unlimited checks, the true value stays hidden
// until the worked answer is shown.
function FieldsForm({ fields, state, readOnly, practice = false, onSubmit }: {
  fields: FieldDef[];
  state: StepState;
  readOnly: boolean;
  practice?: boolean;
  onSubmit: (entered: Record<string, number>) => void;
}) {
  const [text, setText] = useState<Record<string, string>>({});
  const locked = practice ? state.done : !!state.fields;
  const parsed = (id: string) => (text[id] === undefined || text[id].trim() === '' ? NaN : Number(text[id]));
  const ready = fields.every((f) => Number.isFinite(parsed(f.id)));
  return (
    <form
      className="stage-fields"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || locked || readOnly) return;
        onSubmit(Object.fromEntries(fields.map((f) => [f.id, parsed(f.id)])));
      }}
    >
      {fields.map((f) => {
        const r = state.fields?.[f.id];
        const typed = text[f.id] ?? (r ? String(r.value) : '');
        return (
          <div className="stage-field" key={f.id}>
            <label>
              <span>{f.label}</span>
              <span className="stage-input">
                <input
                  type="number"
                  step="any"
                  disabled={locked || readOnly}
                  value={typed}
                  onChange={(e) => setText((t) => ({ ...t, [f.id]: e.target.value }))}
                />
                <span className="stage-unit">{f.unit}</span>
              </span>
            </label>
            {r && !practice && (
              <span className={`stage-result ${r.ok ? 'ok' : r.points > 0 ? 'partial' : 'bad'}`}>
                {r.ok ? '✓' : r.points > 0 ? '~' : '✗'} true value {sig(r.truth)} {f.unit}
                {f.points > 0 ? `, ${r.points}/${f.points} pts` : ', not scored'}
              </span>
            )}
            {r && practice && (
              <span className={`stage-result ${r.ok ? 'ok' : 'bad'}`}>
                {r.ok ? '✓ Right' : '✗ Not yet'}
                {state.worked && ` (true value ${sig(r.truth)} ${f.unit})`}
              </span>
            )}
          </div>
        );
      })}
      {!locked && !readOnly && (
        <button type="submit" disabled={!ready}>{practice ? 'Check' : 'Submit'}</button>
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
