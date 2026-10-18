// Chunked BER runs for the Link lab (design sections 6 and 9): stop rules, progress, cancel, time bound.
// Pure and synchronous per chunk, so a worker can yield between chunks (see runBerAsync, worker.ts).
import { createRng } from '../rng';
import { type LinkParams, simulate } from './dsss';
import type { FrontEndConfig } from './frontend';
import { type JammerSpec, jammer } from './jammers';
import { wilson } from './measure';
import { type FhRunRequest, runFhAsync } from './fh';

export interface RunRequest {
  link: LinkParams;
  jammer?: { spec: JammerSpec; js: number };
  s: number;
  frontEnd?: FrontEndConfig;
  seed: number;
  maxBits?: number; // default 1_000_000
  maxErrors?: number; // default 100
  timeBoundMs?: number; // default 10_000
  chunkBits?: number; // default: about 2e6 samples per chunk, at least r bits, a multiple of r
}

export interface RunProgress {
  bits: number;
  errors: number;
  copyErrors: number;
  copies: number;
  ber: number;
  lo: number;
  hi: number;
  elapsedMs: number;
}

export interface RunResult extends RunProgress {
  stoppedBy: 'errors' | 'bits' | 'time' | 'cancel';
  clippedFraction: number;
  compressedFraction: number;
  blankedFraction: number; // the three fractions are sample-weighted over chunks
  corr: Float32Array; // the first up to CORR_KEEP correlator outputs, for the histogram
  jammerPhases?: number[]; // phases resolved for tone/multitone, for the record
}

export interface RunOptions {
  onProgress?: (p: RunProgress) => void;
  shouldStop?: () => boolean;
  now?: () => number;
}

export const CORR_KEEP = 4000;
const TARGET_SAMPLES = 2_000_000;

// Chunk i uses seed (req.seed * 1000003 + i) >>> 0 and startChip = chips sent before it. A run stopped by
// errors, bits or cancel after the same chunks is therefore deterministic. A run stopped by 'time' depends on
// the machine's speed and is not reproducible.
export const chunkSeed = (seed: number, i: number): number => (seed * 1000003 + i) >>> 0;

// Draws the random phases of a tone or multitone once, from createRng(seed), so every chunk shares them.
function resolvePhases(spec: JammerSpec, seed: number): { spec: JammerSpec; phases?: number[] } {
  const rng = createRng(seed);
  if (spec.kind === 'tone' && spec.phase === undefined) {
    const phase = 2 * Math.PI * rng();
    return { spec: { ...spec, phase }, phases: [phase] };
  }
  if (spec.kind === 'multitone' && spec.phases === 'random') {
    const phases = Array.from({ length: spec.q }, () => 2 * Math.PI * rng());
    return { spec: { ...spec, phases }, phases };
  }
  return { spec };
}

// Step API: each step() simulates one chunk and returns progress, or the final result once a stop rule fires.
export function createRun(req: RunRequest, opts: RunOptions = {}): { step: () => RunProgress | RunResult } {
  const now = opts.now ?? (() => performance.now());
  const maxBits = req.maxBits ?? 1_000_000;
  const maxErrors = req.maxErrors ?? 100;
  const timeBoundMs = req.timeBoundMs ?? 10_000;
  const r = req.link.repetition;
  const defaultBits = Math.floor(TARGET_SAMPLES / (req.link.chipsPerBit * req.s * r));
  const bitsPerChunk = Math.max(r, Math.floor((req.chunkBits ?? defaultBits) / r) * r);
  const chipsPerChunk = bitsPerChunk * r * req.link.chipsPerBit;
  const samplesPerChunk = chipsPerChunk * req.s;
  const resolved = req.jammer ? resolvePhases(req.jammer.spec, req.seed) : undefined;
  const interference = req.jammer && resolved ? jammer(resolved.spec, req.jammer.js) : undefined;

  const t0 = now();
  let chunk = 0;
  let bits = 0;
  let errors = 0;
  let copyErrors = 0;
  let copies = 0;
  let clipped = 0;
  let compressed = 0;
  let blanked = 0;
  let samples = 0;
  const corr = new Float32Array(CORR_KEEP);
  let corrLen = 0;

  const progress = (elapsedMs: number): RunProgress => {
    const w = wilson(errors, bits);
    return { bits, errors, copyErrors, copies, ber: w.ber, lo: w.lo, hi: w.hi, elapsedMs };
  };

  return {
    step() {
      const sim = simulate(req.link, {
        nBits: bitsPerChunk,
        seed: chunkSeed(req.seed, chunk),
        s: req.s,
        frontEnd: req.frontEnd,
        interference,
        startChip: chunk * chipsPerChunk,
      });
      chunk++;
      bits += sim.bits;
      errors += sim.errors;
      copyErrors += sim.copyErrors;
      copies += sim.copies;
      clipped += sim.clippedFraction * samplesPerChunk;
      compressed += sim.compressedFraction * samplesPerChunk;
      blanked += sim.blankedFraction * samplesPerChunk;
      samples += samplesPerChunk;
      const take = Math.min(CORR_KEEP - corrLen, sim.corr.length);
      if (take > 0) {
        corr.set(sim.corr.subarray(0, take), corrLen);
        corrLen += take;
      }
      const elapsedMs = now() - t0;
      const p = progress(elapsedMs);
      opts.onProgress?.(p); // before the cancel check, so a progress callback can cancel the same chunk
      const stoppedBy: RunResult['stoppedBy'] | undefined = opts.shouldStop?.()
        ? 'cancel'
        : errors >= maxErrors
          ? 'errors'
          : bits >= maxBits
            ? 'bits'
            : elapsedMs >= timeBoundMs
              ? 'time'
              : undefined;
      if (!stoppedBy) return p;
      return {
        ...p,
        stoppedBy,
        clippedFraction: clipped / samples,
        compressedFraction: compressed / samples,
        blankedFraction: blanked / samples,
        corr: corr.slice(0, corrLen),
        jammerPhases: resolved?.phases,
      };
    },
  };
}

const isResult = (x: RunProgress | RunResult): x is RunResult => 'stoppedBy' in x;

// Synchronous run: loops step() until a stop rule fires.
export function runBer(req: RunRequest, opts: RunOptions = {}): RunResult {
  const run = createRun(req, opts);
  for (;;) {
    const r = run.step();
    if (isResult(r)) return r;
  }
}

// A run of either kind: a direct-sequence link (RunRequest) or a hopping link (level 7, fh.ts).
export type AnyRunRequest = RunRequest | FhRunRequest;
export const isFhRequest = (r: AnyRunRequest): r is FhRunRequest => 'kind' in r && r.kind === 'fh';

// Same loop, yielding to the event loop before every chunk so messages (cancel) get delivered.
export async function runBerAsync(req: AnyRunRequest, opts: RunOptions = {}): Promise<RunResult> {
  if (isFhRequest(req)) return runFhAsync(req, opts);
  const run = createRun(req, opts);
  for (;;) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const r = run.step();
    if (isResult(r)) return r;
  }
}
