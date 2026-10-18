// A level step's BER run: the request for the runner and the theory it is compared with.
import { type LinkParams } from './dsss';
import { type CodeKind, type KnownLinkInfo, type RunSpec, type Truth } from './levels/types';
import { mSequence } from './pn';
import type { RunRequest } from './run';
import { type FhLink, type FhRunRequest, FH_EXAMPLE, fhPracticeAt, fhTheoryBer, gpOf } from './fh';
import { type SyncRunRequest, packetErrorRate } from './sync';
import { berBlindedAt, overloadMissProb } from './blinding';
import type { FrontEndConfig } from './frontend';
import {
  berBpsk,
  berBpskJammed,
  berMultitoneLongCode,
  berOneCopyJammed,
  berPartialBandDsss,
  berPulsedBpsk,
  berPulsedRepetition,
  berRepetitionMajority,
  berToneLongCode,
  berToneShortCode,
  undb,
} from './theory';

// Runs in the levels: one sample per chip, stop at 100 errors, 300,000 bits or 8 s.
export const RUN_LIMITS = { s: 1, maxErrors: 100, maxBits: 300_000, timeBoundMs: 8000 } as const;

// Known links are run with the noise far below the jammer.
export const KNOWN_EBN0_DB = 30;

export interface RunPlan extends RunPlanBase {
  request: RunRequest;
}

// Level 7: the same for a hopping link.
export interface FhRunPlan extends RunPlanBase {
  request: FhRunRequest;
}

// Level 8: a run of packets; theoryBer and curve give the packet error rate.
export interface SyncRunPlan extends RunPlanBase {
  request: SyncRunRequest;
}

export type AnyRunPlan = RunPlan | FhRunPlan | SyncRunPlan;

interface RunPlanBase {
  jsDb: number;
  gpDb: number;
  ebN0Db: number;
  ebJ0Db: number; // Gp - J/S
  theoryBer: number; // BPSK with the jammer's noise added to the receiver's, at this run's J/S
  curve: (jsDb: number) => number; // the same theory at other J/S
}

export interface PlanInputs {
  truth: Truth;
  example: KnownLinkInfo;
  practice: KnownLinkInfo;
  practiceJsDb: number;
  scene: { jsDb: number; ebN0Db: number }; // the scene's J/S and receiver Eb/N0 now
  seed: number;
  entered?: Record<string, number>; // what the player entered in the step, for a run spec with jammerFrom
  practiceN?: number; // the "Try another" counter: level 7's practice hopping link
}

// One code period per bit, as in the levels' known and hidden links.
// A long code is an m-sequence of degree LONG_DEGREE that runs on across bits, still n chips per bit.
export const LONG_DEGREE = 13;

function linkOf(degree: number, carrierCyclesPerChip: number, ebN0Db: number, kind: CodeKind = 'short', repetition: 1 | 3 = 1): { link: LinkParams; gp: number } {
  const code = mSequence(kind === 'long' ? LONG_DEGREE : degree);
  const n = 2 ** degree - 1;
  return {
    link: {
      code,
      chipsPerBit: n,
      repetition,
      preamblePeriods: 32,
      carrierCyclesPerChip,
      ebN0: undb(ebN0Db),
    },
    gp: n,
  };
}

const whole = (x: number, what: string): number => {
  if (Math.abs(x - Math.round(x)) > 1e-6) throw new Error(`${what} must be a whole number of copies`);
  return Math.round(x);
};

// Level 7: a run of a hopping link. Gp = number of channels; the theory is fhTheoryBer at each J/S.
export function planFhRun(spec: RunSpec, fh: NonNullable<RunSpec['fh']>, o: PlanInputs): FhRunPlan {
  const base: FhLink | undefined = fh.linkFrom
    ? fh.linkFrom(o.truth)
    : spec.link === 'hidden' ? o.truth.fh : spec.link === 'example' ? FH_EXAMPLE : fhPracticeAt(o.practiceN ?? 0);
  if (!base) throw new Error('a hopping run on the hidden link needs truth.fh');
  const link: FhLink = { ...base, hopsPerBit: fh.hopsPerBit ?? base.hopsPerBit, ebN0Db: spec.ebN0Db ?? KNOWN_EBN0_DB };
  const jammer = fh.jammerFrom ? fh.jammerFrom(o.entered ?? {}, link, o.truth) : fh.jammer;
  const jsDb = spec.js === 'scene' ? o.scene.jsDb : spec.jsDbFrom ? spec.jsDbFrom(o.truth) : (spec.jsDb ?? o.practiceJsDb);
  const gpDb = 10 * Math.log10(gpOf(link));
  const curve = (js: number) => fhTheoryBer(link, jammer, js);
  return {
    request: { kind: 'fh', link, jammer, jsDb, seed: o.seed, maxErrors: RUN_LIMITS.maxErrors, maxBits: RUN_LIMITS.maxBits, timeBoundMs: RUN_LIMITS.timeBoundMs },
    jsDb,
    gpDb,
    ebN0Db: link.ebN0Db,
    ebJ0Db: gpDb - jsDb,
    theoryBer: curve(jsDb),
    curve,
  };
}

// Level 8: a run of packets. J/S from the jammer the step builds; theory is the packet error rate.
export function planSyncRun(_spec: RunSpec, sync: NonNullable<RunSpec['sync']>, o: PlanInputs): SyncRunPlan {
  const link = sync.linkFrom(o.truth);
  const jammer = sync.jammerFrom(o.entered ?? {}, o.truth);
  const gpDb = 10 * Math.log10(link.n);
  const curve = (js: number) => packetErrorRate(link, { ...jammer, jsDb: js });
  return {
    request: { kind: 'sync', link, jammer, seed: o.seed, maxPackets: 4000, maxLost: 200, timeBoundMs: RUN_LIMITS.timeBoundMs },
    jsDb: jammer.jsDb,
    gpDb,
    ebN0Db: link.chipSnrDb + gpDb,
    ebJ0Db: gpDb - jammer.jsDb,
    theoryBer: curve(jammer.jsDb),
    curve,
  };
}

// A step's run of any kind.
export const planAnyRun = (spec: RunSpec, o: PlanInputs): AnyRunPlan =>
  spec.sync ? planSyncRun(spec, spec.sync, o) : spec.fh ? planFhRun(spec, spec.fh, o) : planRun(spec, o);

// A direct-sequence run (levels 1 to 5).
export function planRun(spec: RunSpec, o: PlanInputs): RunPlan {
  if (spec.fh) throw new Error('a hopping run: use planAnyRun');
  const kind = spec.code ?? 'short';
  const r = spec.repetition ?? 1;
  let ebN0Db = spec.ebN0Db ?? KNOWN_EBN0_DB;
  let built: { link: LinkParams; gp: number };
  let degree: number;
  let chipRateMcps: number;
  if (spec.link === 'hidden') {
    ebN0Db = spec.ebN0Db ?? o.scene.ebN0Db;
    degree = o.truth.degree;
    chipRateMcps = o.truth.chipRateMcps;
    built = linkOf(degree, o.truth.carrierCyclesPerChip, ebN0Db, kind, r);
  } else {
    const k = spec.link === 'example' ? o.example : o.practice;
    degree = k.degree;
    chipRateMcps = k.chipRateMcps;
    built = linkOf(degree, 0, ebN0Db, kind, r);
  }
  const n = built.link.chipsPerBit;
  const jammerSpec = spec.jammerFrom ? spec.jammerFrom(o.entered ?? {}, n, chipRateMcps) : spec.jammer;
  const jsDb = spec.jsDbFromEntered
    ? spec.jsDbFromEntered(o.entered ?? {}, n, chipRateMcps, o.truth)
    : spec.js === 'scene'
      ? o.scene.jsDb
      : spec.jsDbFrom
        ? spec.jsDbFrom(o.truth)
        : (spec.jsDb ?? o.practiceJsDb);
  const frontEnd: FrontEndConfig | undefined = spec.frontEndFrom ? spec.frontEndFrom(o.truth, n) : spec.frontEnd;
  const gpDb = 10 * Math.log10(built.gp);
  const shortCode = mSequence(degree);
  const ebN0 = undb(ebN0Db);
  // Copy error rate for the jammers that act like noise on every copy; pulses are taken to cover whole bits.
  const copyBer = (js: number): number => {
    if (jammerSpec.kind === 'partial') return berPartialBandDsss(ebN0, built.gp, undb(js), jammerSpec.rho, jammerSpec.centre ?? 0);
    // A tone: a long code turns it into noise, a short code meets it the same way in every bit (averaged over its phase).
    if (jammerSpec.kind === 'tone') {
      return kind === 'long'
        ? berToneLongCode(ebN0, built.gp, undb(js), jammerSpec.fTc)
        : berToneShortCode(ebN0, undb(js), shortCode, jammerSpec.fTc);
    }
    if (jammerSpec.kind === 'multitone' && kind === 'long') {
      const c = jammerSpec.centre ?? 0;
      const offsets = Array.from({ length: jammerSpec.q }, (_, i) => c + (i - (jammerSpec.q - 1) / 2) * jammerSpec.spacing);
      return berMultitoneLongCode(ebN0, built.gp, undb(js), offsets);
    }
    return berBpskJammed(ebN0, undb(gpDb - js));
  };
  // The theory for this jammer at other J/S.
  const curve = (js: number): number => {
    if (r === 3 && jammerSpec.kind === 'pulsed') {
      const period = whole(jammerSpec.periodChips / n, 'the pulse period');
      const on = whole((jammerSpec.duty * jammerSpec.periodChips) / n, 'the pulse');
      if (frontEnd?.recoverySamples !== undefined) {
        // Overload pulses: the receiver is blind for the pulse and its recovery, whatever the J/S above the overload.
        const miss = frontEnd.overloadPower === undefined ? 0 : overloadMissProb(frontEnd.overloadPower, undb(js) / jammerSpec.duty);
        return berBlindedAt(ebN0, period, on, whole(frontEnd.recoverySamples / n, 'the recovery'), miss);
      }
      const ebJ0 = undb(gpDb - js);
      if (period % 3 === 0 && on % 3 === 0) return berPulsedRepetition(ebN0, ebJ0, jammerSpec.duty, 3);
      if (period === 3 && on === 1) {
        const q = berBpskJammed(ebN0, jammerSpec.duty * ebJ0);
        return berOneCopyJammed(q, berBpsk(ebN0));
      }
      throw new Error('pulses against 3 copies must cover whole groups of copies, or one copy of every bit');
    }
    if (jammerSpec.kind === 'pulsed') return berPulsedBpsk(ebN0, undb(gpDb - js), jammerSpec.duty);
    const c = copyBer(js);
    return r === 3 ? berRepetitionMajority(c, 3) : c;
  };
  return {
    request: {
      link: built.link,
      jammer: { spec: jammerSpec, js: undb(jsDb) },
      seed: o.seed,
      ...(frontEnd ? { frontEnd } : {}),
      ...RUN_LIMITS,
    },
    jsDb,
    gpDb,
    ebN0Db,
    ebJ0Db: gpDb - jsDb,
    theoryBer: curve(jsDb),
    curve,
  };
}
