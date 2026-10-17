// A level step's BER run: the request for the runner and the theory it is compared with.
import { type LinkParams } from './dsss';
import { type KnownLinkInfo, type RunSpec, type Truth } from './levels/types';
import { mSequence } from './pn';
import type { RunRequest } from './run';
import { berBpskJammed, undb } from './theory';

// Runs in the levels: one sample per chip, stop at 100 errors, 300,000 bits or 8 s.
export const RUN_LIMITS = { s: 1, maxErrors: 100, maxBits: 300_000, timeBoundMs: 8000 } as const;

// Known links are run with the noise far below the jammer.
export const KNOWN_EBN0_DB = 30;

export interface RunPlan {
  request: RunRequest;
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
}

// One code period per bit, as in the levels' known and hidden links.
function linkOf(degree: number, carrierCyclesPerChip: number, ebN0Db: number): { link: LinkParams; gp: number } {
  const code = mSequence(degree);
  return {
    link: {
      code,
      chipsPerBit: code.length,
      repetition: 1,
      preamblePeriods: 32,
      carrierCyclesPerChip,
      ebN0: undb(ebN0Db),
    },
    gp: code.length,
  };
}

export function planRun(spec: RunSpec, o: PlanInputs): RunPlan {
  const jsDb = spec.js === 'scene' ? o.scene.jsDb : (spec.jsDb ?? o.practiceJsDb);
  let ebN0Db = KNOWN_EBN0_DB;
  let built: { link: LinkParams; gp: number };
  if (spec.link === 'hidden') {
    ebN0Db = o.scene.ebN0Db;
    built = linkOf(o.truth.degree, o.truth.carrierCyclesPerChip, ebN0Db);
  } else {
    built = linkOf((spec.link === 'example' ? o.example : o.practice).degree, 0, ebN0Db);
  }
  const gpDb = 10 * Math.log10(built.gp);
  const curve = (js: number): number => berBpskJammed(undb(ebN0Db), undb(gpDb - js));
  return {
    request: {
      link: built.link,
      jammer: { spec: spec.jammer, js: undb(jsDb) },
      seed: o.seed,
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
