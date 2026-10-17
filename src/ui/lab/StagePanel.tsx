import { useState } from 'react';
import type { RunPlan } from '../../engine/lab/berRun';
import {
  type ApplyStep,
  type FieldDef,
  type LessonStep,
  type LevelDef,
  type PracticeStep,
  type PredictGrade,
  type Question,
  type RunSummary,
  type StepDef,
  DENY_FULL_RUNS,
  DENY_TOLERANCE,
  berText,
  fillText,
  flatSteps,
  scorePrediction,
} from '../../engine/lab/levels';
import type { FactsCard } from './knownFacts';
import type { FieldResult, Score, StepState } from './levelState';
import { RunBox } from './RunBox';

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
  onTryAnother: (stepIndex: number) => void;
  onSubmitFields: (stepIndex: number, entered: Record<string, number>) => void; // one group of an apply step
  onRetryStart: (stepIndex: number) => void;
  onCheckRetry: (stepIndex: number, entered: Record<string, number>) => void;
  onBack: () => void;
  runPlan: (stepIndex: number, mode?: 'main' | 'retry') => RunPlan | undefined; // the BER run a step offers, from the scene now
  runNote?: (stepIndex: number, mode?: 'main' | 'retry') => string | undefined; // a line about the run's jammer
  onRunStart: (stepIndex: number, mode: 'main' | 'retry', prediction?: number) => void;
  onRunDone: (stepIndex: number, mode: 'main' | 'retry', summary: RunSummary) => void;
  onPredictAgain: (stepIndex: number) => void; // practice: unlock the prediction for another run
  card: FactsCard | null; // the "What you know" card
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
                    const reachable = done || index <= current;
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

      {!showDebrief && p.card && <KnownCard card={p.card} />}

      {showDebrief ? (
        <Debrief {...p} />
      ) : (
        <StepBody
          key={`${flat[shown].step.id}-${p.values.pN}-${p.values.pChipRate}-${p.values.pJsDb}`}
          step={flat[shown].step}
          index={shown}
          state={states[shown] ?? { done: false }}
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

function KnownCard({ card }: { card: FactsCard }) {
  return (
    <section className="stage-known" aria-label={card.heading}>
      <h4>{card.heading}</h4>
      <table>
        <tbody>
          {card.rows.map((r) => (
            <tr key={r.label} className={r.value === null ? 'unknown' : ''}>
              <td>{r.label}</td>
              <td className="num">
                {r.value ?? '?'}
                {r.you && (
                  <small className={`stage-you ${r.you.ok ? 'ok' : 'bad'}`}>
                    {' '}{r.you.text} {r.you.ok ? '✓' : '✗'}
                  </small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StepBody(p: StagePanelProps & { step: StepDef; index: number; state: StepState; last: boolean }) {
  const { step, index, state } = p;
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
          <QuestionsGoal questions={step.questions} state={state} onAnswer={(qid, c) => p.onAnswer(index, qid, c)} />
        </>
      )}

      <div className="stage-nav">
        {index > 0 && (
          <button type="button" className="stage-back" onClick={p.onBack}>
            Back
          </button>
        )}
        {canContinue && (
          <button type="button" className="stage-continue" onClick={p.onContinue}>
            {p.last ? 'See debrief' : 'Continue'}
          </button>
        )}
      </div>
      {p.viewing !== null && (
        <button type="button" className="link-button" onClick={() => p.onView(null)}>
          Back to current step
        </button>
      )}
    </section>
  );
}

function Lesson(p: StagePanelProps & { step: LessonStep; index: number; state: StepState }) {
  const { step, state } = p;
  return (
    <>
      {step.paragraphs?.map((t) => (
        <p key={t} className="stage-para">{fillText(t, p.values)}</p>
      ))}
      {step.steps && <Numbered items={step.steps} values={p.values} className="stage-worked stage-example" />}
      {step.rule && <p className="stage-rule">{fillText(step.rule, p.values)}</p>}
      {step.check && <CheckBox check={step.check} state={state} onCheck={(v) => p.onCheckLesson(p.index, v)} />}
    </>
  );
}

function CheckBox({ check, state, onCheck }: {
  check: NonNullable<LessonStep['check']>;
  state: StepState;
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
        if (!Number.isFinite(value) || right) return;
        onCheck(value);
      }}
    >
      <p className="stage-task"><strong>{check.question}</strong></p>
      <span className="stage-input">
        <input
          type="number"
          step="any"
          aria-label="Your answer"
          disabled={right}
          value={right && !text ? String(state.fields?.answer?.value ?? '') : text}
          onChange={(e) => setText(e.target.value)}
        />
        {check.unit && <span className="stage-unit">{check.unit}</span>}
        {!right && <button type="submit" disabled={!Number.isFinite(value)}>Check</button>}
      </span>
      {right && <p className="stage-feedback ok">Right.</p>}
      {!right && state.checkWrong && <p className="stage-feedback bad">{check.wrong}</p>}
    </form>
  );
}

function Practice(p: StagePanelProps & { step: PracticeStep; index: number; state: StepState }) {
  const { step, state } = p;
  return (
    <>
      <p className="stage-task">{fillText(step.task, p.values)}</p>
      <Hint text={step.hint} values={p.values} />
      {numeric(step.fields).length > 0 && (
        <FieldsForm
          fields={numeric(step.fields)}
          results={state.fields}
          mode="practice"
          done={state.done}
          worked={!!state.worked}
          values={p.values}
          onSubmit={(e) => p.onCheckPractice(p.index, e)}
        />
      )}
      {step.run && predictField(step.fields) && <PracticeRun {...p} field={predictField(step.fields)!} />}
      {!state.worked && (
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
      {state.done && (
        <div>
          <button type="button" onClick={() => p.onTryAnother(p.index)}>Try another</button>
        </div>
      )}
    </>
  );
}

function Apply(p: StagePanelProps & { step: ApplyStep; index: number; state: StepState }) {
  const { step, state } = p;
  // A run waits for the numeric fields: they come first.
  const settled = numeric(step.fields).every((f) => !!state.fields?.[f.id]);
  return (
    <>
      <p className="stage-task">{fillText(step.task, p.values)}</p>
      <Hint text={step.hint} values={p.values} />
      {numeric(step.fields).length > 0 && (
        <FieldsForm
          fields={numeric(step.fields)}
          results={state.fields}
          mode="apply"
          done={state.done}
          values={p.values}
          onSubmit={(e) => p.onSubmitFields(p.index, e)}
        />
      )}
      {step.run && settled && predictField(step.fields) && <ApplyPredict {...p} field={predictField(step.fields)!} />}
      {step.run && settled && step.runUnscored && <UnscoredRun {...p} />}
      {step.run && settled && step.goal && <DenyRun {...p} goal={step.goal} />}
      {state.done && (
        <>
          <p className="stage-subhead">Worked answer</p>
          <Numbered items={step.reveal} values={p.values} className="stage-worked stage-example" />
          {!state.retrying ? (
            <button type="button" onClick={() => p.onRetryStart(p.index)}>Retry (not scored)</button>
          ) : (
            <div className="stage-retry">
              <p className="stage-subhead">Retry (not scored)</p>
              {numeric(step.fields).length > 0 && (
                <FieldsForm
                  fields={numeric(step.fields)}
                  results={state.retry}
                  mode="retry"
                  done={false}
                  values={p.values}
                  onSubmit={(e) => p.onCheckRetry(p.index, e)}
                />
              )}
              {step.run && (predictField(step.fields) || step.runUnscored) && <RetryRun {...p} />}
            </div>
          )}
        </>
      )}
    </>
  );
}

const numeric = (fields: FieldDef[]) => fields.filter((f) => f.kind !== 'predictBer');
const predictField = (fields: FieldDef[]) => fields.find((f) => f.kind === 'predictBer');

const GRADE_TEXT: Record<PredictGrade, string> = {
  inside: 'inside the measured range',
  near: 'within a factor of 2 of the measured BER',
  wide: 'within a factor of 3 of the measured BER',
  miss: 'not within a factor of 2 of the measured BER',
};
const GRADE_MARK: Record<PredictGrade, string> = { inside: '✓', near: '~', wide: '~', miss: '✗' };

// Practice: predict, run, compare. Unscored; another prediction and run until it is right.
function PracticeRun(p: StagePanelProps & { step: PracticeStep; index: number; state: StepState; field: FieldDef }) {
  const { state, field } = p;
  const locked = state.prediction !== undefined;
  const result = locked ? state.runs?.[state.runs.length - 1] : undefined;
  const r = state.fields?.[field.id];
  return (
    <div className="stage-fields">
      <RunBox
        plan={p.runPlan(p.index)}
        needsPrediction
        value={{ prediction: state.prediction, result }}
        canRun={!state.done && !result}
        onStart={(pred) => p.onRunStart(p.index, 'main', pred)}
        onDone={(s) => p.onRunDone(p.index, 'main', s)}
      />
      {result && r?.grade && (
        <p className={`stage-result ${r.ok ? 'ok' : 'bad'}`}>
          {r.ok ? '✓ Right' : '✗ Not yet'}: your {berText(r.value)} is {GRADE_TEXT[r.grade]}.
          {state.worked && ` Theory: ${berText(result.theoryBer)}.`}
        </p>
      )}
      {result && !state.done && <button type="button" onClick={() => p.onPredictAgain(p.index)}>Predict again</button>}
    </div>
  );
}

// Scored: one prediction, one run, scored against its 95% range.
function ApplyPredict(p: StagePanelProps & { step: ApplyStep; index: number; state: StepState; field: FieldDef }) {
  const { state, field } = p;
  const result = state.runs?.[0];
  const r = state.fields?.[field.id];
  return (
    <div className="stage-fields">
      <RunBox
        plan={p.runPlan(p.index)}
        note={p.runNote?.(p.index)}
        needsPrediction
        value={{ prediction: state.prediction, result }}
        canRun={!result}
        onStart={(pred) => p.onRunStart(p.index, 'main', pred)}
        onDone={(s) => p.onRunDone(p.index, 'main', s)}
      />
      {r?.grade && (
        <p className={`stage-result ${r.grade === 'inside' ? 'ok' : r.grade === 'near' || r.grade === 'wide' ? 'partial' : 'bad'}`}>
          {GRADE_MARK[r.grade]} Your {berText(r.value)} is {GRADE_TEXT[r.grade]}, {r.points}/{field.points} pts
        </p>
      )}
    </div>
  );
}

// An unscored run, no prediction: the measured BER is shown and the step is done once it has been run.
function UnscoredRun(p: StagePanelProps & { step: ApplyStep; index: number; state: StepState }) {
  const { state } = p;
  const result = state.runs?.[0];
  return (
    <div className="stage-fields">
      <RunBox
        plan={p.runPlan(p.index)}
        note={p.runNote?.(p.index)}
        needsPrediction={false}
        value={{ result }}
        canRun={!result}
        onStart={() => p.onRunStart(p.index, 'main')}
        onDone={(s) => p.onRunDone(p.index, 'main', s)}
      />
    </div>
  );
}

// Unscored retry of a run step.
function RetryRun(p: StagePanelProps & { step: ApplyStep; index: number; state: StepState }) {
  const { state } = p;
  const rr = state.retryRun;
  const needsPrediction = !!predictField(p.step.fields);
  const grade = rr?.result && rr.prediction !== undefined ? scorePrediction(rr.prediction, rr.result, 0, predictField(p.step.fields)?.fullWithinFactor).grade : undefined;
  return (
    <div className="stage-fields">
      <RunBox
        plan={p.runPlan(p.index, 'retry')}
        note={p.runNote?.(p.index, 'retry')}
        needsPrediction={needsPrediction}
        value={{ prediction: rr?.prediction, result: rr?.result }}
        canRun={!rr?.result}
        onStart={(pred) => p.onRunStart(p.index, 'retry', pred)}
        onDone={(s) => p.onRunDone(p.index, 'retry', s)}
      />
      {grade && rr?.prediction !== undefined && (
        <p className={`stage-result ${grade === 'inside' ? 'ok' : grade === 'near' || grade === 'wide' ? 'partial' : 'bad'}`}>
          {GRADE_MARK[grade]} Your {berText(rr.prediction)} is {GRADE_TEXT[grade]} (not scored)
        </p>
      )}
      {rr?.result && <button type="button" onClick={() => p.onRetryStart(p.index)}>Another retry</button>}
    </div>
  );
}

// The jammer's goal: adjust the scene, run, until the measured BER reaches the goal.
function DenyRun(p: StagePanelProps & { step: ApplyStep; index: number; state: StepState; goal: NonNullable<ApplyStep['goal']> }) {
  const { state, goal } = p;
  const runs = state.runs ?? [];
  const last = runs[runs.length - 1];
  const need = goal.berAtLeast * DENY_TOLERANCE;
  return (
    <div className="stage-fields">
      <p className="stage-task">{fillText(goal.task, p.values)}</p>
      <p className="stage-note">
        Goal: a measured BER of at least {berText(need)} ({berText(goal.berAtLeast)} less 20% for counting noise). Full points if you get there
        within {DENY_FULL_RUNS} runs, half after.
      </p>
      <RunBox
        plan={p.runPlan(p.index)}
        needsPrediction={false}
        value={{ result: last }}
        canRun
        label={runs.length > 0 ? 'Run again' : 'Run'}
        onStart={() => p.onRunStart(p.index, 'main')}
        onDone={(s) => p.onRunDone(p.index, 'main', s)}
      />
      {state.goal ? (
        <p className="stage-result ok">
          ✓ Run {state.goal.runNo}: J/S {state.goal.run.jsDb.toFixed(1)} dB gave BER {berText(state.goal.run.ber)}, {state.goal.points}/{goal.points} pts
        </p>
      ) : (
        last && (
          <p className="stage-result bad">
            ✗ Run {runs.length}: J/S {last.jsDb.toFixed(1)} dB gave BER {berText(last.ber)}. Not there yet: more J/S, then run again.
          </p>
        )
      )}
    </div>
  );
}

// Fields in groups, each its own form. Apply: one scored submission per group, the next group opens once the
// earlier one is submitted, and the true value is shown. Practice: unlimited checks, the next group opens when the
// earlier one is right or the worked answer is shown, and the true value stays hidden until then. Retry: all
// fields at once, unscored, right or wrong only.
function FieldsForm({ fields, results, mode, done, worked = false, values, onSubmit }: {
  fields: FieldDef[];
  results?: Record<string, FieldResult>;
  mode: 'apply' | 'practice' | 'retry';
  done: boolean;
  worked?: boolean;
  values: Record<string, string>;
  onSubmit: (entered: Record<string, number>) => void;
}) {
  const [text, setText] = useState<Record<string, string>>({});
  const groupOf = (f: FieldDef) => (mode === 'retry' ? 0 : (f.group ?? 0));
  const groups = [...new Set(fields.map(groupOf))].sort((a, b) => a - b);
  const parsed = (id: string) => (text[id] === undefined || text[id].trim() === '' ? NaN : Number(text[id]));
  const settled = (f: FieldDef) =>
    mode === 'apply' ? !!results?.[f.id] : mode === 'practice' ? !!results?.[f.id]?.ok || worked : false;

  return (
    <>
      {groups.map((g) => {
        const inGroup = fields.filter((f) => groupOf(f) === g);
        const visible = groups.filter((x) => x < g).every((x) => fields.filter((f) => groupOf(f) === x).every(settled));
        if (!visible) return null;
        const locked = mode === 'retry' ? false : mode === 'apply' ? inGroup.every((f) => !!results?.[f.id]) : done || inGroup.every(settled);
        const maxOf = (f: FieldDef) =>
          f.range?.maxKey && Number.isFinite(Number(values[f.range.maxKey])) ? Number(values[f.range.maxKey]) : (f.range?.max ?? Infinity);
        const inRange = (f: FieldDef) => !f.range || (parsed(f.id) >= f.range.min && parsed(f.id) <= maxOf(f));
        const ready = inGroup.every((f) => Number.isFinite(parsed(f.id)) && inRange(f));
        return (
          <form
            key={g}
            className="stage-fields"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ready || locked) return;
              // Practice re-checks only the fields not yet right.
              const todo = mode === 'practice' ? inGroup.filter((f) => !results?.[f.id]?.ok) : inGroup;
              onSubmit(Object.fromEntries(todo.map((f) => [f.id, parsed(f.id)])));
            }}
          >
            {inGroup.map((f) => {
              const r = results?.[f.id];
              const typed = text[f.id] ?? (r ? String(r.value) : '');
              const fieldLocked = locked || (mode === 'practice' && !!r?.ok);
              return (
                <div className="stage-field" key={f.id}>
                  {f.prompt && <p className="stage-prompt">{fillText(f.prompt, values)}</p>}
                  <label>
                    <span>{f.label}</span>
                    <span className="stage-input">
                      <input
                        type="number"
                        step="any"
                        disabled={fieldLocked}
                        value={typed}
                        onChange={(e) => setText((t) => ({ ...t, [f.id]: e.target.value }))}
                      />
                      <span className="stage-unit">{f.unit}</span>
                    </span>
                  </label>
                  {!fieldLocked && f.range && Number.isFinite(parsed(f.id)) && !inRange(f) && (
                    <span className="stage-result bad">{fillText(f.range.message, values)}</span>
                  )}
                  {r && mode === 'apply' && (
                    <span className={`stage-result ${r.ok ? 'ok' : r.points > 0 ? 'partial' : 'bad'}`}>
                      {r.ok ? '✓' : r.points > 0 ? '~' : '✗'}{f.accept ? (r.ok ? ' accepted' : ' not accepted') : ` true value ${sig(r.truth)} ${f.unit}`}
                      {f.points > 0 ? `, ${r.points}/${f.points} pts` : ', not scored'}
                    </span>
                  )}
                  {r && mode !== 'apply' && (
                    <span className={`stage-result ${r.ok ? 'ok' : 'bad'}`}>
                      {r.ok ? '✓ Right' : '✗ Not yet'}
                      {worked && !f.accept && ` (true value ${sig(r.truth)} ${f.unit})`}
                    </span>
                  )}
                </div>
              );
            })}
            {!locked && <button type="submit" disabled={!ready}>{mode === 'apply' ? 'Submit' : 'Check'}</button>}
          </form>
        );
      })}
    </>
  );
}

function QuestionsGoal({ questions, state, onAnswer }: {
  questions: Question[];
  state: StepState;
  onAnswer: (qid: string, choice: number) => void;
}) {
  const [pick, setPick] = useState<Record<string, number>>({});
  return (
    <div className="stage-questions">
      {questions.map((q, qi) => {
        const answered = state.answers?.[q.id];
        const done = answered !== undefined;
        return (
          <fieldset key={q.id} disabled={done}>
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
            {!done && (
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
      <p className="stage-note">Scores count your first attempt at each step.</p>
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
