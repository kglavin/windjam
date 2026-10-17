// A level step's BER run: the request for the runner and the theory it is compared with.
import { type LinkParams } from './dsss';
import { type KnownLinkInfo, type RunSpec, type Truth } from './levels/types';
import { mSequence } from './pn';
import type { RunRequest } from './run';
import { berBpskJammed, berPartialBandDsss, berPulsedBpsk, undb } from './theory';

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
  entered?: Record<string, number>; // what the player entered in the step, for a run spec with jammerFrom
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
  const jsDb =
    spec.js === 'scene' ? o.scene.jsDb : spec.jsDbFrom ? spec.jsDbFrom(o.truth) : (spec.jsDb ?? o.practiceJsDb);
  let ebN0Db = KNOWN_EBN0_DB;
  let built: { link: LinkParams; gp: number };
  if (spec.link === 'hidden') {
    ebN0Db = o.scene.ebN0Db;
    built = linkOf(o.truth.degree, o.truth.carrierCyclesPerChip, ebN0Db);
  } else {
    built = linkOf((spec.link === 'example' ? o.example : o.practice).degree, 0, ebN0Db);
  }
  const gpDb = 10 * Math.log10(built.gp);
  const jammerSpec = spec.jammerFrom ? spec.jammerFrom(o.entered ?? {}, built.link.chipsPerBit) : spec.jammer;
  const ebN0 = undb(ebN0Db);
  // The theory for this jammer at other J/S. Pulses are taken to cover whole bits; other jammers count as broadband.
  const curve = (js: number): number => {
    if (jammerSpec.kind === 'partial') return berPartialBandDsss(ebN0, built.gp, undb(js), jammerSpec.rho, jammerSpec.centre ?? 0);
    if (jammerSpec.kind === 'pulsed') return berPulsedBpsk(ebN0, undb(gpDb - js), jammerSpec.duty);
    return berBpskJammed(ebN0, undb(gpDb - js));
  };
  return {
    request: {
      link: built.link,
      jammer: { spec: jammerSpec, js: undb(jsDb) },
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
