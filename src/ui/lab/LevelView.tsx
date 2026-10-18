import { useEffect, useMemo, useState } from 'react';
import { capture } from '../../engine/lab/capture';
import { planAnyRun } from '../../engine/lab/berRun';
import type { LinkParams } from '../../engine/lab/dsss';
import {
  type Ctx,
  type FieldDef,
  type LevelDef,
  checkField,
  dfStepTry,
  findTarget,
  flatSteps,
  inZone,
  knownLinkInfo,
  practiceJsAt,
  practiceLinkAt,
  scoreLocate,
  LOCATE_FULL_TRIES,
  c2Setup,
  arrayM,
  e2Setup,
  f2Sources,
  F2_M,
  F2_SNAPSHOTS,
  level9Network,
  networkTry,
  e3Layout,
  townTry,
  xcorrEnemy,
  withinTol,
} from '../../engine/lab/levels';
import { mSequence } from '../../engine/lab/pn';
import { type Scene, sceneBudget } from '../../engine/lab/scene';
import { undb } from '../../engine/lab/theory';
import { CurvePlot } from './instruments/CurvePlot';
import { Autocorr } from './instruments/Autocorr';
import { Spectrum } from './instruments/Spectrum';
import { Calculator } from './Calculator';
import { DfTask } from './DfTask';
import { XcorrView } from './instruments/XcorrView';
import { Waterfall } from './instruments/Waterfall';
import { RebuildView } from './instruments/RebuildView';
import { PacketView } from './instruments/PacketView';
import { SharingPanel } from './instruments/SharingPanel';
import { DiscoveryView } from './instruments/DiscoveryView';
import { BeamPlot } from './instruments/BeamView';
import { MusicPlot } from './instruments/MusicView';
import { bestShare, shareOutcome } from '../../engine/lab/tactics';
import { hopPreview } from '../../engine/lab/fh';
import { LinkScene } from './LinkScene';
import { SETUPS } from './levelSetup';
import { moveInterceptToSignal, moveJammerToJs } from './levelScene';
import { leaveStep, nextIndex } from './levelNav';
import { type StepState, applyDone, runDone, scoreLevel } from './levelState';
import { StagePanel } from './StagePanel';
import { VideoCard } from './VideoCard';
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
  const [interceptSnrDb, setInterceptSnrDb] = useState<number | undefined>();
  // "Try another" counter: the practice link persists across the practice steps until it changes.
  const [practiceN, setPracticeN] = useState(0);
  const practiceLink = useMemo(() => practiceLinkAt(practiceN), [practiceN]);
  const practiceInfo = useMemo(() => knownLinkInfo(practiceLink), [practiceLink]);
  const practiceJsDb = useMemo(() => (level.practiceJs ?? practiceJsAt)(practiceN, practiceInfo), [level, practiceN, practiceInfo]);

  const patch = (i: number, p: Partial<StepState>) =>
    setStates((all) => all.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const update = (i: number, f: (s: StepState) => StepState) => setStates((all) => all.map((s, j) => (j === i ? f(s) : s)));
  const ctx: Ctx = {
    rxSnrDb: budget.snrDb,
    rxEbN0Db: budget.ebN0Db,
    practice: practiceInfo,
    practiceJsDb,
    practiceN,
    jsDb: base.jsDb,
    ebJ0Db: base.ebJ0Db,
  };

  // The find step completes by itself when the intercept's chip SNR reaches the target.
  const step = flat[current]?.step;
  useEffect(() => {
    if (!step || !states[current] || states[current].done || step.kind !== 'find') return;
    const value = step.measure === 'js' ? budget.jsDb : budget.intercept.chipSnrDb;
    if (value >= findTarget(step, truth)) {
      if (step.measure !== 'js') setInterceptSnrDb(budget.intercept.chipSnrDb);
      patch(current, { done: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget.intercept.chipSnrDb, budget.jsDb, current]);

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
  const shownIdx = current;
  const shown = shownIdx >= flat.length ? undefined : flat[shownIdx].step;
  const shownState = states[shownIdx] as StepState | undefined;
  // The value the run used for an editable run input, in place of the submitted one.
  const runInputSpec = shown && shown.kind === 'apply' ? shown.run?.runInput : undefined;
  const runFields =
    runInputSpec && shownState?.runInput !== undefined && shownState.fields?.[runInputSpec.field]
      ? { ...shownState.fields, [runInputSpec.field]: { ...shownState.fields[runInputSpec.field], value: shownState.runInput } }
      : shownState?.fields;
  const setupArgs = {
    truth,
    flat,
    states,
    shownIdx,
    step: shown,
    practice: practiceInfo,
    practiceJsDb,
    practiceN,
    budget,
    base,
    interceptSnrDb,
    // A step with a run: the prediction and the run that counts (the one that reached the goal, else the first).
    run: { prediction: shownState?.prediction, summary: shownState?.goal?.run ?? shownState?.runs?.[0], fields: runFields },
  };
  const hiddenRows = setup.hiddenRows(setupArgs);
  const values = setup.values(setupArgs);
  // The "What you know" card: the practice link's values on practice steps, else the enemy link's.
  const card = setup.card(setupArgs);

  // The BER run a step offers, from the scene as it is now. Seeded from the level seed, the step, the practice
  // link and how many runs the step has had.
  // `mode` 'retry' takes what the player entered in the retry instead of the scored submission.
  const enteredFor = (i: number, mode: 'main' | 'retry'): Record<string, number> => {
    const entered: Record<string, number> = Object.fromEntries(
      Object.entries((mode === 'retry' ? states[i].retry : states[i].fields) ?? {}).map(([id, r]) => [id, r.value]),
    );
    const st = flat[i].step;
    const ri = mode === 'main' && st.kind === 'apply' ? st.run?.runInput : undefined;
    if (ri && ri.field in entered && states[i].runInput !== undefined) entered[ri.field] = states[i].runInput!;
    // Level 7 E3: the follower's place on the map.
    const at = st.kind === 'apply' && st.dfMethod === 'follower' ? states[i].df?.sites?.[0] : undefined;
    if (at) Object.assign(entered, { jx: at.xKm, jy: at.yKm });
    return entered;
  };
  // A run whose jammer depends on a field waits for a value of that field inside its range.
  const rangeOk = (i: number, mode: 'main' | 'retry'): boolean => {
    const st = flat[i].step;
    if (st.kind !== 'apply') return true;
    const entered = enteredFor(i, mode);
    return st.fields.every((f) => {
      if (!f.range) return true;
      const max = f.range.maxKey && Number.isFinite(Number(values[f.range.maxKey])) ? Number(values[f.range.maxKey]) : f.range.max;
      return entered[f.id] >= f.range.min && entered[f.id] <= max;
    });
  };
  const runPlan = (i: number, mode: 'main' | 'retry' = 'main') => {
    const st = flat[i].step;
    if ((st.kind !== 'practice' && st.kind !== 'apply') || !st.run) return undefined;
    if ((st.run.jammerFrom || st.run.fh?.jammerFrom) && !rangeOk(i, mode)) return undefined;
    if (st.kind === 'apply' && st.dfMethod === 'follower' && !states[i].df?.sites?.length) return undefined;
    const s = states[i];
    const n = (s.runs?.length ?? 0) * 8 + (s.retries ?? 0);
    return planAnyRun(st.run, {
      truth,
      example: knownLinkInfo(level.links.example),
      practice: practiceInfo,
      practiceJsDb,
      scene: { jsDb: budget.jsDb, ebN0Db: budget.ebN0Db },
      seed: (Math.imul(truth.seed, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca6b) ^ Math.imul(practiceN + 1, 0xc2b2ae35) ^ n) >>> 0,
      entered: enteredFor(i, mode),
      practiceN,
    });
  };
  // What to tell the player about the run's jammer, or why Run is not ready yet.
  const runNote = (i: number, mode: 'main' | 'retry' = 'main'): string | undefined => {
    const st = flat[i].step;
    if (st.kind !== 'apply' || !(st.run?.jammerFrom || st.run?.fh?.jammerFrom)) return undefined;
    const plan = runPlan(i, mode);
    if (!plan) {
      if (st.dfMethod === 'follower') return 'Place the follower on the map to enable Run.';
      const f = st.fields.find((x) => x.range);
      return f ? `Enter the ${f.label.toLowerCase()} above and press ${mode === 'retry' ? 'Check' : 'Submit'} to enable Run.` : undefined;
    }
    return st.run.jammerNote?.(enteredFor(i, mode), 'kind' in plan.request ? 1 : plan.request.link.chipsPerBit);
  };

  const score = scoreLevel(level, states);
  // Every visit to the debrief records the score so far; the stored best only goes up.
  useEffect(() => {
    if (debrief) onFinish(level.id, score.total, score.passed);
  }, [debrief, level.id, score.total, score.passed, onFinish]);

  const entries = (def: FieldDef[], entered: Record<string, number>) =>
    Object.fromEntries(def.filter((f) => f.id in entered).map((f) => [f.id, { value: entered[f.id], ...checkField(f, entered[f.id], truth, ctx) }]));

  // Lessons and practice show their figure alone; the scene appears with the steps on the real link.
  const showScene = !setup.noScene && (!shown || shown.kind === 'find' || shown.kind === 'apply' || shown.kind === 'questions');
  const showCalc = !!shown && (shown.kind === 'lesson' || shown.kind === 'practice' || shown.kind === 'apply');
  const instruments = shown && (shown.kind === 'find' || shown.kind === 'apply') ? shown.instruments : [];
  const visual = shown && (shown.kind === 'lesson' || shown.kind === 'practice' || shown.kind === 'apply') ? shown.visual : undefined;

  // The BER curve for a step with a run: its runs against the theory (the theory only once there is a run, so a
  // prediction is not given away), and the prediction as a hollow marker.
  const runStep = shown && (shown.kind === 'practice' || shown.kind === 'apply') && shown.run ? shown : undefined;
  const curvePlan = runStep ? runPlan(shownIdx) : undefined;
  const runCurve =
    runStep && curvePlan && shownState && !('kind' in curvePlan.request && curvePlan.request.kind === 'sync') ? (
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

  // A hopping run's waterfall: the last run's hops, or the hops to come with the planned jammer's coverage.
  const lastRun = shownState?.runs?.[shownState.runs.length - 1];
  const runWaterfall =
    curvePlan && 'kind' in curvePlan.request && curvePlan.request.kind === 'fh' ? (
      <div className="level-instruments">
        <Waterfall
          link={curvePlan.request.link}
          hops={lastRun?.hops ?? hopPreview(curvePlan.request.link, curvePlan.request.seed, 40, curvePlan.request.jammer)}
          ran={!!lastRun?.hops}
          jammer={curvePlan.request.jammer}
          title={`Hop waterfall: ${runStep?.run?.link === 'hidden' ? 'enemy' : runStep?.run?.link} link`}
        />
      </div>
    ) : null;

  // A packet run's timeline: the packet's preamble and payload, the jammer's on-time, and the first packets' searches.
  const runPackets =
    curvePlan && 'kind' in curvePlan.request && curvePlan.request.kind === 'sync' ? (
      <div className="level-instruments">
        <PacketView link={curvePlan.request.link} jammer={curvePlan.request.jammer} records={lastRun?.records} />
      </div>
    ) : null;

  return (
    <main className="level-view">
      <StagePanel
        level={level}
        states={states}
        current={current}
        onView={setCurrent}
        chipSnrDb={budget.intercept.chipSnrDb}
        findMeter={shown?.kind === 'find' && shown.measure === 'js' ? { label: 'J/S at the enemy receiver', value: budget.jsDb, target: findTarget(shown, truth) } : undefined}
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
        onTakeBearings={(i) => {
          const st = flat[i].step;
          if (st.kind !== 'apply' || !st.locate) return;
          const goal = st.locate;
          update(i, (s) => {
            const placed = s.df?.sites ?? [];
            const tries = (s.df?.tries ?? 0) + 1;
            const last = dfStepTry(truth, st.id, [...(st.dfSites ?? []), ...placed], tries, st.dfMethod);
            const next: StepState = { ...s, df: { sites: placed, tries, last } };
            const r = scoreLocate(goal, last, tries);
            if (!s.located && r.passed) next.located = { points: r.points, tryNo: tries, cepKm: last.cepKm, crossingDeg: last.crossingDeg };
            return { ...next, done: s.done || applyDone(st, next) };
          });
        }}
        onRetryStart={(i) => update(i, (s) => ({ ...s, retrying: true, retry: undefined, retryRun: undefined, retries: (s.retries ?? 0) + 1 }))}
        runPlan={runPlan}
        runNote={runNote}
        onRunInput={(i, value) => patch(i, { runInput: value })}
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
          const st = flat[shownIdx].step;
          setStates((all) => leaveStep(flat, all, shownIdx));
          // Skipping a find step puts the intercept where the signal can be seen.
          if (st.kind === 'find' && !states[shownIdx].done && st.measure === 'js') {
            setScene(moveJammerToJs(scene, findTarget(st, truth)));
          } else if (st.kind === 'find' && !states[shownIdx].done) {
            const next = moveInterceptToSignal(scene, st.atLeastDb);
            setScene(next);
            setInterceptSnrDb(sceneBudget(next).intercept.chipSnrDb);
          }
          setCurrent(nextIndex(flat, shownIdx));
        }}
        onBack={() => {
          if (shownIdx > 0) setCurrent(shownIdx - 1);
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
            editable={(shown?.kind === 'apply' || shown?.kind === 'find') && shown.editable ? shown.editable : setup.editable}
            hidden={setup.hidden}
            hiddenRows={hiddenRows}
          />
        )}
        {visual && (
          <div className="level-instruments" key={`${shown?.id}-${practiceN}`}>
            {shown?.kind === 'lesson' && shown.video && <VideoCard id={shown.video} title={shown.title} />}
            <VisualView
              visual={visual}
              links={{ example: level.links.example, practice: practiceLink }}
              practiceJsDb={practiceJsDb}
              practiceN={practiceN}
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
        {runWaterfall}
        {runPackets}
        {runCurve}
        {instruments.length > 0 && (
          <div className="level-instruments">
            {shown?.kind === 'apply' && shown.share && (
              <SharingPanel
                targets={shown.share.targets(truth)}
                goalBer={shown.share.goalBer}
                plan={states[shownIdx].share ?? { mode: 'power', chosen: [] }}
                locked={!!states[shownIdx].share?.committed}
                onChange={(plan) => patch(shownIdx, { share: { ...plan, committed: undefined } })}
                onCommit={() => {
                  const share = shown.share!;
                  update(shownIdx, (s) => {
                    const plan = s.share ?? { mode: 'power' as const, chosen: [] };
                    const ts = share.targets(truth);
                    const denied = shareOutcome(ts, plan.chosen, plan.mode, share.goalBer).filter((x) => x.denied).length;
                    const best = bestShare(ts, share.goalBer).denied;
                    const points = denied >= best ? share.points : denied > 0 && denied === best - 1 ? share.points / 2 : 0;
                    const next: StepState = { ...s, share: { ...plan, committed: { denied, best, points } } };
                    return { ...next, done: applyDone(shown, next) };
                  });
                }}
              />
            )}
            {instruments.includes('beam') && <BeamPlot m={arrayM(truth)} lookDeg={0} jammers={[e2Setup(truth).jamDeg]} mode="mvdr" />}
            {instruments.includes('music') && <MusicPlot m={F2_M} sources={f2Sources(truth)} snapshots={F2_SNAPSHOTS} showTruth={!!states[shownIdx]?.done} seed={truth.seed} />}
            {instruments.includes('discover') && <DiscoveryView code={c2Setup(truth).code} snrDb={c2Setup(truth).snrDb} title="Find the enemy code" />}
            {instruments.includes('rebuild') && <RebuildView code={code} title="Rebuild the enemy code" />}
            {instruments.includes('waterfall') && truth.fh && <Waterfall link={truth.fh} hops={hopPreview(truth.fh, truth.seed, 40)} title="Hop waterfall: enemy link" />}
            {instruments.includes('xcorr') && (
              <XcorrView data={xcorrEnemy(truth)} names={['T1', 'T2']} markPeak={!!states[shownIdx]?.done} />
            )}
            {instruments.includes('df') && shown?.kind === 'apply' && (
              <DfTask
                step={shown}
                state={states[shownIdx]}
                truth={truth}
                onBeam={(deg) => update(shownIdx, (s) => ({ ...s, df: { sites: [], tries: 0, ...s.df, beamDeg: deg } }))}
                onJam={() => {
                  // Level 11 E3: every Jam is a try; the goal is the enemy jammed and every other radio clear.
                  const goal = shown.locate;
                  update(shownIdx, (s) => {
                    const at = s.df?.sites?.[0];
                    if (!at) return s;
                    const beamDeg = s.df?.beamDeg ?? 0;
                    const tries = (s.df?.tries ?? 0) + 1;
                    const next: StepState = { ...s, df: { ...s.df!, tries, jammed: { ...at, beamDeg } } };
                    if (goal && !s.located && townTry(e3Layout(truth), at, beamDeg).ok) {
                      next.located = { points: tries <= LOCATE_FULL_TRIES ? goal.points : Math.round(goal.points / 2), tryNo: tries };
                    }
                    return { ...next, done: s.done || applyDone(shown, next) };
                  });
                }}
                onPlace={(pt) => {
                  if (shown.dfMethod === 'town') {
                    update(shownIdx, (s) => ({ ...s, df: { tries: 0, ...s.df, sites: [pt] } }));
                    return;
                  }
                  if (shown.dfMethod === 'network') {
                    // Level 9 E2: every placement is a try; the goal is every link into the hub broken.
                    const goal = shown.locate;
                    update(shownIdx, (s) => {
                      const tries = (s.df?.tries ?? 0) + 1;
                      const next: StepState = { ...s, df: { sites: [pt], tries } };
                      if (goal && !s.located && networkTry(level9Network(truth), pt).all) {
                        next.located = { points: tries <= LOCATE_FULL_TRIES ? goal.points : Math.round(goal.points / 2), tryNo: tries };
                      }
                      return { ...next, done: s.done || applyDone(shown, next) };
                    });
                    return;
                  }
                  const max = shown.locate?.maxSites ?? (shown.dfMethod === 'follower' ? 1 : 0);
                  if (!inZone(pt) || max === 0) return;
                  update(shownIdx, (s) => {
                    const sites = s.df?.sites ?? [];
                    if (sites.length < max) return { ...s, df: { tries: 0, ...s.df, sites: [...sites, pt] } };
                    // Full: the nearest placed site moves to the click.
                    const near = sites.reduce((b, q, k) => (Math.hypot(q.xKm - pt.xKm, q.yKm - pt.yKm) < Math.hypot(sites[b].xKm - pt.xKm, sites[b].yKm - pt.yKm) ? k : b), 0);
                    return { ...s, df: { tries: 0, ...s.df, sites: sites.map((q, k) => (k === near ? pt : q)) } };
                  });
                }}
                onRemove={(k) => update(shownIdx, (s) => ({ ...s, df: { tries: 0, ...s.df, sites: (s.df?.sites ?? []).filter((_, j) => j !== k) } }))}
              />
            )}
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
