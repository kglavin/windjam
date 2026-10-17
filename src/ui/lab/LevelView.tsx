import { useEffect, useMemo, useRef, useState } from 'react';
import { capture } from '../../engine/lab/capture';
import { planRun } from '../../engine/lab/berRun';
import type { LinkParams } from '../../engine/lab/dsss';
import {
  type Ctx,
  type FieldDef,
  type LevelDef,
  checkField,
  flatSteps,
  knownLinkInfo,
  practiceJsAt,
  practiceLinkAt,
  withinTol,
} from '../../engine/lab/levels';
import { mSequence } from '../../engine/lab/pn';
import { type Scene, sceneBudget } from '../../engine/lab/scene';
import { undb } from '../../engine/lab/theory';
import { CurvePlot } from './instruments/CurvePlot';
import { Autocorr } from './instruments/Autocorr';
import { Spectrum } from './instruments/Spectrum';
import { Calculator } from './Calculator';
import { LinkScene } from './LinkScene';
import { SETUPS } from './levelSetup';
import { type StepState, applyDone, runDone, scoreLevel } from './levelState';
import { StagePanel } from './StagePanel';
import { VisualView, nullNotes, periodNotes } from './visuals/VisualView';

const S = 4;
const N_BITS = 300;
const RECAPTURE_MS = 300;

export function LevelView({ level, seed, onExit, onReplay, onFinish }: {
  level: LevelDef;
  seed: number;
  onExit: () => void;
  onReplay: () => void;
  onFinish: (levelId: number, score: number, passed: boolean) => void;
}) {
  const setup = SETUPS[level.id];
  const truth = useMemo(() => setup.truth(seed), [setup, seed]);
  const flat = useMemo(() => flatSteps(level), [level]);
  const [scene, setScene] = useState<Scene>(() => setup.scene(truth));
  const budget = useMemo(() => sceneBudget(scene), [scene]);
  // The scene the level started with: texts and answers about "the enemy link's J/S" refer to it, even after the
  // last unit lets the player move the jammer.
  const base = useMemo(() => sceneBudget(setup.scene(truth)), [setup, truth]);
  const [states, setStates] = useState<StepState[]>(() => flat.map(() => ({ done: false })));
  const [current, setCurrent] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const [interceptSnrDb, setInterceptSnrDb] = useState<number | undefined>();
  // "Try another" counter: the practice link persists across the practice steps until it changes.
  const [practiceN, setPracticeN] = useState(0);
  const practiceLink = useMemo(() => practiceLinkAt(practiceN), [practiceN]);
  const practiceInfo = useMemo(() => knownLinkInfo(practiceLink), [practiceLink]);
  const practiceJsDb = useMemo(() => practiceJsAt(practiceN, practiceInfo), [practiceN, practiceInfo]);

  const patch = (i: number, p: Partial<StepState>) =>
    setStates((all) => all.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const update = (i: number, f: (s: StepState) => StepState) => setStates((all) => all.map((s, j) => (j === i ? f(s) : s)));
  const ctx: Ctx = {
    rxSnrDb: budget.snrDb,
    rxEbN0Db: budget.ebN0Db,
    practice: practiceInfo,
    practiceJsDb,
    jsDb: base.jsDb,
    ebJ0Db: base.ebJ0Db,
  };

  // The find step completes by itself when the intercept's chip SNR reaches the target.
  const step = flat[current]?.step;
  useEffect(() => {
    if (!step || states[current].done || step.kind !== 'find') return;
    if (budget.intercept.chipSnrDb >= step.atLeastDb) {
      setInterceptSnrDb(budget.intercept.chipSnrDb);
      patch(current, { done: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget.intercept.chipSnrDb, current]);

  // Captures come from the intercept; re-capture 300 ms after the intercept stops moving.
  const [icEbN0Db, setIcEbN0Db] = useState(budget.intercept.ebN0Db);
  useEffect(() => {
    const id = setTimeout(() => setIcEbN0Db(budget.intercept.ebN0Db), RECAPTURE_MS);
    return () => clearTimeout(id);
  }, [budget.intercept.ebN0Db]);
  const code = useMemo(() => mSequence(truth.degree), [truth.degree]);
  const shot = useMemo(() => {
    const link: LinkParams = {
      code,
      chipsPerBit: truth.n,
      repetition: 1,
      preamblePeriods: 32,
      carrierCyclesPerChip: truth.carrierCyclesPerChip,
      ebN0: undb(icEbN0Db),
    };
    return capture({ link, s: S, nBits: N_BITS, seed: truth.seed });
  }, [code, truth, icEbN0Db]);
  const sampleRateHz = truth.chipRateMcps * 1e6 * S;

  const annotated = (kind: 'nulls' | 'codePeriods') =>
    flat.some((f, i) => f.step.kind === 'apply' && f.step.annotate === kind && states[i].done);
  const periodUs = truth.n / truth.chipRateMcps;
  const specNotes = annotated('nulls') ? nullNotes(truth.chipRateMcps) : undefined;
  const acNotes = annotated('codePeriods') ? periodNotes(periodUs) : undefined;

  const debrief = current >= flat.length;
  const shownIdx = viewing ?? current;
  const shown = shownIdx >= flat.length ? undefined : flat[shownIdx].step;
  const shownState = states[shownIdx] as StepState | undefined;
  const setupArgs = {
    truth,
    flat,
    states,
    shownIdx,
    step: shown,
    practice: practiceInfo,
    practiceJsDb,
    budget,
    base,
    interceptSnrDb,
    // A step with a run: the prediction and the run that counts (the one that reached the goal, else the first).
    run: { prediction: shownState?.prediction, summary: shownState?.goal?.run ?? shownState?.runs?.[0] },
  };
  const hiddenRows = setup.hiddenRows(setupArgs);
  const values = setup.values(setupArgs);
  // The "What you know" card: the practice link's values on practice steps, else the enemy link's.
  const card = setup.card(setupArgs);

  // The BER run a step offers, from the scene as it is now. Seeded from the level seed, the step, the practice
  // link and how many runs the step has had.
  const runPlan = (i: number) => {
    const st = flat[i].step;
    if ((st.kind !== 'practice' && st.kind !== 'apply') || !st.run) return undefined;
    const s = states[i];
    const n = (s.runs?.length ?? 0) * 8 + (s.retries ?? 0);
    return planRun(st.run, {
      truth,
      example: knownLinkInfo(level.links.example),
      practice: practiceInfo,
      practiceJsDb,
      scene: { jsDb: budget.jsDb, ebN0Db: budget.ebN0Db },
      seed: (Math.imul(truth.seed, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca6b) ^ Math.imul(practiceN + 1, 0xc2b2ae35) ^ n) >>> 0,
    });
  };

  const score = scoreLevel(level, states);
  const reported = useRef(false);
  useEffect(() => {
    if (debrief && !reported.current) {
      reported.current = true;
      onFinish(level.id, score.total, score.passed);
    }
  }, [debrief, level.id, score.total, score.passed, onFinish]);

  const entries = (def: FieldDef[], entered: Record<string, number>) =>
    Object.fromEntries(def.filter((f) => f.id in entered).map((f) => [f.id, { value: entered[f.id], ...checkField(f, entered[f.id], truth, ctx) }]));

  // Lessons and practice show their figure alone; the scene appears with the steps on the real link.
  const showScene = !shown || shown.kind === 'find' || shown.kind === 'apply' || shown.kind === 'questions';
  const showCalc = !!shown && (shown.kind === 'lesson' || shown.kind === 'practice' || shown.kind === 'apply');
  const instruments = shown && (shown.kind === 'find' || shown.kind === 'apply') ? shown.instruments : [];
  const visual = shown && (shown.kind === 'lesson' || shown.kind === 'practice' || shown.kind === 'apply') ? shown.visual : undefined;

  // The BER curve for a step with a run: its runs against the theory (the theory only once there is a run, so a
  // prediction is not given away), and the prediction as a hollow marker.
  const runStep = shown && (shown.kind === 'practice' || shown.kind === 'apply') && shown.run ? shown : undefined;
  const curvePlan = runStep ? runPlan(shownIdx) : undefined;
  const runCurve =
    runStep && curvePlan && shownState ? (
      <div className="level-instruments">
        <CurvePlot
          points={[
            ...(shownState.runs ?? []).map((r) => ({ jsDb: r.jsDb, ber: r.ber, lo: r.lo, hi: r.hi, label: 'measured' })),
            ...(shownState.retryRun?.result
              ? [{ jsDb: shownState.retryRun.result.jsDb, ber: shownState.retryRun.result.ber, lo: shownState.retryRun.result.lo, hi: shownState.retryRun.result.hi, kind: 'retry' }]
              : []),
          ]}
          theory={shownState.runs?.length || shownState.done ? [{ label: 'theory', f: curvePlan.curve }] : []}
          predictions={
            shownState.prediction !== undefined && shownState.runs?.length
              ? [{ jsDb: shownState.runs[shownState.runs.length - 1].jsDb, ber: shownState.prediction }]
              : []
          }
          xRange={[0, 30]}
        />
      </div>
    ) : null;

  return (
    <main className="level-view">
      <StagePanel
        level={level}
        states={states}
        current={current}
        viewing={viewing}
        onView={setViewing}
        chipSnrDb={budget.intercept.chipSnrDb}
        values={values}
        onCheckLesson={(i, value) => {
          const st = flat[i].step;
          if (st.kind !== 'lesson' || !st.check || states[i].checkRight) return;
          const ok = withinTol(st.check.tol, value, st.check.answer);
          if (ok) {
            patch(i, {
              checkRight: true,
              checkWrong: false,
              done: true,
              fields: { answer: { value, ok: true, truth: st.check.answer, points: 0 } },
            });
          } else {
            patch(i, { checkWrong: true, tries: (states[i].tries ?? 0) + 1 });
          }
        }}
        onCheckPractice={(i, entered) => {
          const st = flat[i].step;
          if (st.kind !== 'practice' || states[i].done) return;
          const fields = { ...states[i].fields, ...entries(st.fields, entered) };
          const first = { ...states[i].first };
          for (const f of st.fields) if (f.id in entered && !first[f.id]) first[f.id] = { value: entered[f.id], ok: fields[f.id].ok };
          // The run's prediction field is settled by its run, not here.
          const allOk = st.fields.every((f) => fields[f.id]?.ok);
          patch(i, { fields, first, done: allOk, tries: allOk ? states[i].tries : (states[i].tries ?? 0) + 1 });
        }}
        onShowWorked={(i) => patch(i, { worked: true, done: true })}
        onTryAnother={() => {
          setPracticeN((n) => n + 1);
          setStates((all) => all.map((s, j) => (flat[j].step.kind === 'practice' ? { done: false } : s)));
        }}
        onSubmitFields={(i, entered) => {
          const st = flat[i].step;
          if (st.kind !== 'apply') return;
          const fresh = Object.fromEntries(Object.entries(entered).filter(([id]) => !states[i].fields?.[id]));
          const fields = { ...states[i].fields, ...entries(st.fields, fresh) };
          patch(i, { fields, done: applyDone(st, { ...states[i], fields }) });
        }}
        onRetryStart={(i) => update(i, (s) => ({ ...s, retrying: true, retry: undefined, retryRun: undefined, retries: (s.retries ?? 0) + 1 }))}
        runPlan={runPlan}
        onRunStart={(i, mode, prediction) => {
          if (mode === 'retry') update(i, (s) => ({ ...s, retryRun: { prediction } }));
          else if (prediction !== undefined) update(i, (s) => ({ ...s, prediction }));
        }}
        onRunDone={(i, mode, summary) => {
          const st = flat[i].step;
          if (st.kind !== 'practice' && st.kind !== 'apply') return;
          update(i, (s) => runDone(st, s, summary, mode));
        }}
        onPredictAgain={(i) => update(i, (s) => ({ ...s, prediction: undefined }))}
        onCheckRetry={(i, entered) => {
          const st = flat[i].step;
          if (st.kind !== 'apply') return;
          patch(i, { retry: entries(st.fields, entered) });
        }}
        onAnswer={(i, qid, choice) => {
          const st = flat[i].step;
          if (st.kind !== 'questions' || states[i].answers?.[qid] !== undefined) return;
          const answers = { ...states[i].answers, [qid]: choice };
          patch(i, { answers, done: st.questions.every((q) => answers[q.id] !== undefined) });
        }}
        onContinue={() => {
          if (shownIdx >= flat.length) return;
          // A lesson without a check is finished when the player moves on.
          if (flat[shownIdx].step.kind === 'lesson') patch(shownIdx, { done: true });
          if (shownIdx === current) {
            setViewing(null);
            setCurrent((c) => c + 1);
          } else {
            setViewing(shownIdx + 1 === current ? null : shownIdx + 1);
          }
        }}
        onBack={() => {
          if (shownIdx > 0) setViewing(shownIdx - 1);
        }}
        card={card}
        score={score}
        onReplay={onReplay}
        onExit={onExit}
      />
      <div className="level-work">
        {showScene && (
          <LinkScene
            scene={scene}
            onChange={setScene}
            editable={shown?.kind === 'apply' && shown.editable ? shown.editable : setup.editable}
            hidden={setup.hidden}
            hiddenRows={hiddenRows}
          />
        )}
        {visual && (
          <div className="level-instruments" key={`${shown?.id}-${practiceN}`}>
            <VisualView
              visual={visual}
              links={{ example: level.links.example, practice: practiceLink }}
              practiceJsDb={practiceJsDb}
              hidden={{
                x: shot.rx,
                sampleRateHz,
                preambleSamples: shot.frame.preambleChips * shot.s,
                specNotes,
                acNotes,
                chipRateMcps: truth.chipRateMcps,
              }}
            />
          </div>
        )}
        {runCurve}
        {instruments.length > 0 && (
          <div className="level-instruments">
            {instruments.includes('spectrum') && <Spectrum x={shot.rx} sampleRateHz={sampleRateHz} annotations={specNotes} envelope={specNotes ? { chipRateMHz: truth.chipRateMcps } : undefined} />}
            {instruments.includes('autocorr') && (
              <Autocorr
                x={shot.rx}
                sampleRateHz={sampleRateHz}
                preambleSamples={shot.frame.preambleChips * shot.s}
                annotations={acNotes}
              />
            )}
          </div>
        )}
        <div className="calc-dock" hidden={!showCalc}>
          <Calculator />
        </div>
      </div>
    </main>
  );
}
