import { useEffect, useMemo, useRef, useState } from 'react';
import { capture } from '../../engine/lab/capture';
import type { LinkParams } from '../../engine/lab/dsss';
import { type Ctx, type FieldDef, type LevelDef, checkField, flatSteps, level1Truth, textValues, withinTol } from '../../engine/lab/levels';
import { mSequence } from '../../engine/lab/pn';
import { type Scene, sceneBudget } from '../../engine/lab/scene';
import { undb } from '../../engine/lab/theory';
import { Autocorr } from './instruments/Autocorr';
import { Spectrum } from './instruments/Spectrum';
import { LinkScene } from './LinkScene';
import { level1Scene } from './levelScene';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel } from './StagePanel';
import { VisualView, nullNotes, periodNotes } from './visuals/VisualView';

const S = 4;
const N_BITS = 300;
const RECAPTURE_MS = 300;

const JAMMER_ROWS = [
  'Jammer power', 'Jammer antenna', 'Jammer path loss', 'Rx antenna toward jammer', 'Jamming J', 'J/S', 'Eb/J0',
  'Jamming J at intercept', 'J/S at intercept',
];
// Shown only once the prediction step has been revealed.
const LATE_ROWS = ['Processing gain', 'Eb/N0', 'Eb/(N0+J0)'];

export function LevelView({ level, seed, onExit, onReplay, onFinish }: {
  level: LevelDef;
  seed: number;
  onExit: () => void;
  onReplay: () => void;
  onFinish: (levelId: number, score: number, passed: boolean) => void;
}) {
  const truth = useMemo(() => level1Truth(seed), [seed]);
  const flat = useMemo(() => flatSteps(level), [level]);
  const [scene, setScene] = useState<Scene>(() => level1Scene(truth));
  const budget = useMemo(() => sceneBudget(scene), [scene]);
  const [states, setStates] = useState<StepState[]>(() => flat.map(() => ({ done: false })));
  const [current, setCurrent] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const [interceptSnrDb, setInterceptSnrDb] = useState<number | undefined>();

  const patch = (i: number, p: Partial<StepState>) =>
    setStates((all) => all.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const ctx: Ctx = { rxSnrDb: budget.snrDb, rxEbN0Db: budget.ebN0Db };

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

  const doneStep = (id: string) => flat.some((f, i) => f.step.id === id && states[i].done);
  const annotated = (kind: 'nulls' | 'codePeriods') =>
    flat.some((f, i) => f.step.kind === 'apply' && f.step.annotate === kind && states[i].done);
  const periodUs = truth.n / truth.chipRateMcps;
  const specNotes = annotated('nulls') ? nullNotes(truth.chipRateMcps) : undefined;
  const acNotes = annotated('codePeriods') ? periodNotes(periodUs) : undefined;

  const debrief = current >= flat.length;
  const shown = debrief && viewing === null ? undefined : flat[viewing ?? current].step;
  const hiddenRows = [...JAMMER_ROWS, ...(doneStep('F2') ? [] : LATE_ROWS)];

  const values = textValues(truth, {
    interceptSnrDb,
    rxSnrDb: budget.snrDb,
    rxEbN0Db: budget.ebN0Db,
  });

  const score = scoreLevel(level, states);
  const reported = useRef(false);
  useEffect(() => {
    if (debrief && !reported.current) {
      reported.current = true;
      onFinish(level.id, score.total, score.passed);
    }
  }, [debrief, level.id, score.total, score.passed, onFinish]);

  const entries = (def: FieldDef[], entered: Record<string, number>) =>
    Object.fromEntries(def.map((f) => [f.id, { value: entered[f.id], ...checkField(f, entered[f.id], truth, ctx) }]));

  // Lessons and practice show their figure alone; the scene appears with the steps on the real link.
  const showScene = !shown || shown.kind === 'find' || shown.kind === 'apply' || shown.kind === 'questions';
  const instruments = shown && (shown.kind === 'find' || shown.kind === 'apply') ? shown.instruments : [];
  const visual = shown && (shown.kind === 'lesson' || shown.kind === 'practice' || shown.kind === 'apply') ? shown.visual : undefined;

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
          const fields = entries(st.fields, entered);
          const allOk = Object.values(fields).every((f) => f.ok);
          patch(i, { fields, done: allOk, tries: allOk ? states[i].tries : (states[i].tries ?? 0) + 1 });
        }}
        onShowWorked={(i) => patch(i, { worked: true, done: true })}
        onSubmitFields={(i, entered) => {
          const st = flat[i].step;
          if (st.kind !== 'apply' || states[i].fields) return;
          patch(i, { fields: entries(st.fields, entered), done: true });
        }}
        onAnswer={(i, qid, choice) => {
          const st = flat[i].step;
          if (st.kind !== 'questions' || states[i].answers?.[qid] !== undefined) return;
          const answers = { ...states[i].answers, [qid]: choice };
          patch(i, { answers, done: st.questions.every((q) => answers[q.id] !== undefined) });
        }}
        onContinue={() => {
          // A lesson without a check is finished when the player moves on.
          if (current < flat.length) patch(current, { done: true });
          setViewing(null);
          setCurrent((c) => c + 1);
        }}
        score={score}
        onReplay={onReplay}
        onExit={onExit}
      />
      <div className="level-work">
        {showScene && (
          <LinkScene
            scene={scene}
            onChange={setScene}
            editable={['intercept']}
            hidden={['jammer']}
            hiddenRows={hiddenRows}
          />
        )}
        {visual && (
          <div className="level-instruments" key={shown?.id}>
            <VisualView
              visual={visual}
              links={level.links}
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
      </div>
    </main>
  );
}
