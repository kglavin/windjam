import { useEffect, useMemo, useRef, useState } from 'react';
import { capture } from '../../engine/lab/capture';
import type { LinkParams } from '../../engine/lab/dsss';
import { type Ctx, type LevelDef, checkField, level1Truth, textValues } from '../../engine/lab/levels';
import { mSequence } from '../../engine/lab/pn';
import { type Scene, sceneBudget } from '../../engine/lab/scene';
import { undb } from '../../engine/lab/theory';
import { Autocorr } from './instruments/Autocorr';
import { Spectrum } from './instruments/Spectrum';
import { LinkScene } from './LinkScene';
import { level1Scene } from './levelScene';
import { type StepState, scoreLevel } from './levelState';
import { StagePanel } from './StagePanel';

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
  const [scene, setScene] = useState<Scene>(() => level1Scene(truth));
  const budget = useMemo(() => sceneBudget(scene), [scene]);
  const [states, setStates] = useState<StepState[]>(() => level.steps.map(() => ({ done: false })));
  const [current, setCurrent] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const [interceptSnrDb, setInterceptSnrDb] = useState<number | undefined>();

  const patch = (i: number, p: Partial<StepState>) =>
    setStates((all) => all.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const ctx: Ctx = { rxSnrDb: budget.snrDb, rxEbN0Db: budget.ebN0Db };

  // Step 1 completes by itself when the intercept's chip SNR reaches the target.
  const step = level.steps[current];
  useEffect(() => {
    if (!step || states[current].done || step.goal.kind !== 'interceptSnr') return;
    if (budget.intercept.chipSnrDb >= step.goal.atLeastDb) {
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

  const done = (id: string) => level.steps.some((s, i) => s.id === id && states[i].done);
  const nullsOn = level.steps.some((s, i) => s.annotate === 'nulls' && states[i].done);
  const periodsOn = level.steps.some((s, i) => s.annotate === 'codePeriods' && states[i].done);
  const periodUs = truth.n / truth.chipRateMcps;
  const specNotes = nullsOn
    ? [truth.chipRateMcps, -truth.chipRateMcps].map((x) => ({ xMHz: x, label: 'first null: chip rate' }))
    : undefined;
  const acNotes = periodsOn
    ? [1, 2, 3].map((k) => ({ lagUs: k * periodUs, label: k === 1 ? '1 period' : `${k} periods` }))
    : undefined;

  const debrief = current >= level.steps.length;
  const instruments = debrief ? [] : level.steps[viewing ?? current].instruments;
  const hiddenRows = [...JAMMER_ROWS, ...(done('predict') ? [] : LATE_ROWS)];

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
        onSubmitFields={(i, entered) => {
          const st = level.steps[i];
          if (st.goal.kind !== 'fields' || states[i].fields) return;
          const fields = Object.fromEntries(
            st.goal.fields.map((f) => [f.id, { value: entered[f.id], ...checkField(f, entered[f.id], truth, ctx) }]),
          );
          patch(i, { fields, done: true });
        }}
        onAnswer={(i, qid, choice) => {
          const st = level.steps[i];
          if (st.goal.kind !== 'questions' || states[i].answers?.[qid] !== undefined) return;
          const answers = { ...states[i].answers, [qid]: choice };
          patch(i, { answers, done: st.goal.questions.every((q) => answers[q.id] !== undefined) });
        }}
        onContinue={() => {
          setViewing(null);
          setCurrent((c) => c + 1);
        }}
        score={score}
        onReplay={onReplay}
        onExit={onExit}
      />
      <div className="level-work">
        <LinkScene
          scene={scene}
          onChange={setScene}
          editable={['intercept']}
          hidden={['jammer']}
          hiddenRows={hiddenRows}
        />
        {instruments.length > 0 && (
          <div className="level-instruments">
            {instruments.includes('spectrum') && <Spectrum x={shot.rx} sampleRateHz={sampleRateHz} annotations={specNotes} />}
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
