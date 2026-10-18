// Level 7 (docs/design-level-7.md): a frequency-hopping link simulated hop by hop. Each hop sends noncoherent BFSK on
// one channel of the hop set; the jammer decides which hops, and which part of each, it covers and how strongly; each
// bit (or, with fast hopping, each copy of a bit on its own hop) is wrong with the BFSK error rate at that point.
// Channel width = bit rate, so Gp = number of channels against broadband noise.
import { createRng } from '../rng';
import { type Pt, C_KM_PER_US, distanceKm } from './geoloc';
import { wilson } from './measure';
import type { RunOptions, RunProgress, RunResult } from './run';
import { berNoncoherentBfskLin, berRepetitionMajority, undb } from './theory';

export interface FhLink {
  channels: number; // N, the hop set
  rateKbps: number; // bit rate; also the channel width in kHz
  dwellMs: number; // time on each hop (slow hopping); ignored for fast hopping, where each copy has its own hop
  hopsPerBit: 1 | 3; // 1: slow hopping, many bits per hop; 3: fast, each bit sent on 3 hops and voted
  ebN0Db: number;
}

// The jammer, with J/S given separately (total jammer power over signal power at the receiver).
export type FhJammer =
  | { kind: 'none' }
  | { kind: 'bbn' } // spread over all N channels
  | { kind: 'partial'; rho: number } // spread over the fraction rho of the channels (rounded to whole channels)
  | { kind: 'follower'; share: number } // all its power on the hop's channel, for the last `share` of each dwell
  | { kind: 'sweep'; widthChannels: number; sweepMs: number }; // a band widthChannels wide sweeping the hop set

export const gpOf = (link: Pick<FhLink, 'channels'>): number => link.channels;

// The band starts here; channel c sits at FH_F0_MHZ + (c + 0.5) × the channel width.
export const FH_F0_MHZ = 30;

// Level 7's example link, and the practice links one per "Try another".
export const FH_EXAMPLE: FhLink = { channels: 16, rateKbps: 25, dwellMs: 5, hopsPerBit: 1, ebN0Db: 30 };
const FH_PRACTICE = [
  { channels: 32, dwellMs: 2 }, { channels: 24, dwellMs: 10 }, { channels: 48, dwellMs: 4 }, { channels: 20, dwellMs: 5 },
];
export const fhPracticeAt = (n: number): FhLink => ({ ...FH_EXAMPLE, ...FH_PRACTICE[((n % FH_PRACTICE.length) + FH_PRACTICE.length) % FH_PRACTICE.length] });
export const bitsPerHop = (link: FhLink): number => Math.max(1, Math.round(link.dwellMs * link.rateKbps));

// Whole channels a partial-band jammer covers, at least one.
export const jammedChannels = (channels: number, rho: number): number => Math.min(channels, Math.max(1, Math.round(rho * channels)));

// Eb/J0 (linear) where the jammer is on, and the share of bits (or copies) it reaches. js is linear J/S.
export function jammerExposure(link: FhLink, j: FhJammer, js: number): { ebJ0: number; share: number } {
  const n = link.channels;
  switch (j.kind) {
    case 'none':
      return { ebJ0: Infinity, share: 0 };
    case 'bbn':
      return { ebJ0: n / js, share: 1 };
    case 'partial': {
      const k = jammedChannels(n, j.rho);
      return { ebJ0: k / js, share: k / n };
    }
    case 'follower': {
      // Slow hopping: the bits of each hop sent after the follower comes on (whole bits, as the run counts them).
      // Fast hopping: the follower is on for `share` of each copy's hop, so the copy meets share × its power.
      if (link.hopsPerBit !== 1) return { ebJ0: 1 / (Math.max(j.share, 1e-12) * js), share: j.share > 0 ? 1 : 0 };
      const b = bitsPerHop(link);
      let hit = 0;
      for (let k = 0; k < b; k++) if (j.share > 0 && (k + 0.5) / b >= 1 - j.share) hit++;
      return { ebJ0: 1 / js, share: hit / b };
    }
    case 'sweep':
      return { ebJ0: j.widthChannels / js, share: Math.min(1, j.widthChannels / n) };
  }
}

const bfsk = (ebN0: number, ebJ0: number) => berNoncoherentBfskLin(1 / (1 / ebN0 + 1 / ebJ0));

// Theory: the error rate of a bit or copy, averaged over where the jammer reaches, then the vote for fast hopping.
export function fhTheoryBer(link: FhLink, j: FhJammer, jsDb: number): number {
  const ebN0 = undb(link.ebN0Db);
  const e = jammerExposure(link, j, undb(jsDb));
  const p = e.share * bfsk(ebN0, e.ebJ0) + (1 - e.share) * bfsk(ebN0, Infinity);
  return link.hopsPerBit === 1 ? p : berRepetitionMajority(p, link.hopsPerBit);
}

// The partial-band fraction that does the most damage (N0 neglected): rho = 2 / (Eb/J0 broadband), BER e⁻¹ / (Eb/J0).
export function worstRhoFh(link: FhLink, jsDb: number): number {
  const ebJ0 = link.channels / undb(jsDb);
  return ebJ0 >= 2 ? 2 / ebJ0 : 1;
}

// --- The hop sequence and the jammer's coverage, hop by hop --------------------------------------------------------

export interface HopRecord {
  index: number;
  channel: number;
  startMs: number;
  durMs: number;
  jammedFrom?: number; // share of the dwell after which the jammer is on (0: the whole hop); absent: not jammed
  errors: number;
  bits: number;
}

// The channel of hop i: uniform over the hop set, seeded.
export function hopChannel(seed: number, i: number, channels: number): number {
  return Math.floor(createRng((Math.imul(seed, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca77)) >>> 0)() * channels);
}

// Where hop i (channel c, starting at startMs, lasting hopMs) meets the jammer: the share of its dwell after which
// the jammer is on (0: all of it), or undefined when it is clear.
export function hopCoverage(link: FhLink, j: FhJammer, c: number, startMs: number, hopMs: number): number | undefined {
  switch (j.kind) {
    case 'none':
      return undefined;
    case 'bbn':
      return 0;
    case 'partial':
      return c < jammedChannels(link.channels, j.rho) ? 0 : undefined;
    case 'follower':
      return j.share > 0 ? 1 - j.share : undefined;
    case 'sweep':
      return sweepCovers(j, link.channels, c, startMs + hopMs / 2) ? 0 : undefined;
  }
}

// How long one hop lasts: the dwell when slow, a third of a bit when fast.
export const hopMsOf = (link: FhLink): number => (link.hopsPerBit === 1 ? link.dwellMs : 1 / link.rateKbps / link.hopsPerBit);

// The first hops of a link with the jammer's coverage, before any run: what the waterfall shows.
export function hopPreview(link: FhLink, seed: number, count: number, j: FhJammer = { kind: 'none' }): HopRecord[] {
  const hopMs = hopMsOf(link);
  return Array.from({ length: count }, (_, i) => {
    const channel = hopChannel(seed, i, link.channels);
    return { index: i, channel, startMs: i * hopMs, durMs: hopMs, jammedFrom: hopCoverage(link, j, channel, i * hopMs, hopMs), errors: 0, bits: 0 };
  });
}

// Is the sweep on channel c at time tMs?
function sweepCovers(j: Extract<FhJammer, { kind: 'sweep' }>, n: number, c: number, tMs: number): boolean {
  const p = ((tMs / j.sweepMs) % 1) * n;
  const d = (((c - p) % n) + n) % n;
  return d < j.widthChannels;
}

export interface FhRunRequest {
  kind: 'fh';
  link: FhLink;
  jammer: FhJammer;
  jsDb: number;
  seed: number;
  maxBits?: number;
  maxErrors?: number;
  timeBoundMs?: number;
  keepHops?: number; // hops recorded for the waterfall, default 60
}

export interface FhRunResult extends RunResult {
  hops: HopRecord[];
}

const CHUNK_HOPS = 4000;

// Step API like createRun: each step simulates a chunk of hops.
export function createFhRun(req: FhRunRequest, opts: RunOptions = {}): { step: () => RunProgress | FhRunResult } {
  const now = opts.now ?? (() => performance.now());
  const maxBits = req.maxBits ?? 300_000;
  const maxErrors = req.maxErrors ?? 100;
  const timeBoundMs = req.timeBoundMs ?? 8000;
  const keep = req.keepHops ?? 60;
  const { link, jammer } = req;
  const n = link.channels;
  const ebN0 = undb(link.ebN0Db);
  const e = jammerExposure(link, jammer, undb(req.jsDb));
  const qClean = bfsk(ebN0, Infinity);
  const qJam = bfsk(ebN0, e.ebJ0);
  const slow = link.hopsPerBit === 1;
  const perHop = slow ? bitsPerHop(link) : 1;
  const hopMs = hopMsOf(link);
  const rng = createRng(req.seed ^ 0x5bd1e995);
  const t0 = now();
  let hop = 0;
  let bits = 0;
  let errors = 0;
  let copies = 0;
  let copyErrors = 0;
  const hops: HopRecord[] = [];


  // One hop's copy or bits; returns the errors among them.
  const sendHop = (): { errs: number; sent: number; rec: HopRecord } => {
    const c = hopChannel(req.seed, hop, n);
    const startMs = hop * hopMs;
    const from = hopCoverage(link, jammer, c, startMs, hopMs);
    let errs = 0;
    for (let b = 0; b < perHop; b++) {
      let q = qClean;
      // Slow hopping: the bits after the jammer comes on. Fast: the whole copy (a follower's power already scaled).
      if (jammer.kind === 'sweep') q = sweepCovers(jammer, n, c, startMs + ((b + 0.5) / perHop) * hopMs) ? qJam : qClean;
      else if (from !== undefined && (!slow || (b + 0.5) / perHop >= from)) q = qJam;
      if (rng() < q) errs++;
    }
    const rec: HopRecord = { index: hop, channel: c, startMs, durMs: hopMs, jammedFrom: from, errors: errs, bits: perHop };
    hop++;
    return { errs, sent: perHop, rec };
  };

  const progress = (elapsedMs: number): RunProgress => {
    const w = wilson(errors, bits);
    return { bits, errors, copyErrors, copies, ber: w.ber, lo: w.lo, hi: w.hi, elapsedMs };
  };

  return {
    step() {
      for (let h = 0; h < CHUNK_HOPS && bits < maxBits; h++) {
        if (slow) {
          const r = sendHop();
          bits += r.sent;
          errors += r.errs;
          if (hops.length < keep) hops.push(r.rec);
        } else {
          let wrong = 0;
          for (let k = 0; k < link.hopsPerBit; k++) {
            const r = sendHop();
            wrong += r.errs;
            copies++;
            copyErrors += r.errs;
            if (hops.length < keep) hops.push(r.rec);
          }
          bits++;
          if (2 * wrong > link.hopsPerBit) errors++;
        }
      }
      const elapsedMs = now() - t0;
      const p = progress(elapsedMs);
      opts.onProgress?.(p);
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
      return { ...p, stoppedBy, clippedFraction: 0, compressedFraction: 0, blankedFraction: 0, corr: new Float32Array(0), hops };
    },
  };
}

export async function runFhAsync(req: FhRunRequest, opts: RunOptions = {}): Promise<FhRunResult> {
  const run = createFhRun(req, opts);
  for (;;) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const r = run.step();
    if ('stoppedBy' in r) return r;
  }
}

export function runFh(req: FhRunRequest, opts: RunOptions = {}): FhRunResult {
  const run = createFhRun(req, opts);
  for (;;) {
    const r = run.step();
    if ('stoppedBy' in r) return r;
  }
}

// --- Follower timing (level 6's geometry) -------------------------------------------------------------------------

// How late the follower's signal reaches the receiver after the hop starts there: its processing time plus the
// extra path, transmitter → jammer → receiver against transmitter → receiver (µs).
export function followerDelayUs(tx: Pt, rx: Pt, jam: Pt, procUs: number): number {
  return procUs + (distanceKm(tx, jam) + distanceKm(jam, rx) - distanceKm(tx, rx)) / C_KM_PER_US;
}

// The share of each dwell the follower covers.
export const followerShare = (dwellUs: number, delayUs: number): number => Math.min(1, Math.max(0, 1 - delayUs / dwellUs));

// The places where the follower covers at least `share` of the dwell: inside an ellipse with the transmitter and
// receiver as foci, extra path (dwell × (1 − share) − processing) × c. Undefined when no place qualifies.
export function followerEllipse(tx: Pt, rx: Pt, dwellUs: number, procUs: number, share: number, n = 121): Pt[] | undefined {
  const extraKm = (dwellUs * (1 - share) - procUs) * C_KM_PER_US;
  if (extraKm < 0) return undefined;
  const c = distanceKm(tx, rx) / 2;
  const a = c + extraKm / 2;
  const b = Math.sqrt(Math.max(a * a - c * c, 0));
  const mx = (tx.xKm + rx.xKm) / 2;
  const my = (tx.yKm + rx.yKm) / 2;
  const ang = Math.atan2(rx.yKm - tx.yKm, rx.xKm - tx.xKm);
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / (n - 1);
    const u = a * Math.cos(t);
    const v = b * Math.sin(t);
    return { xKm: mx + u * Math.cos(ang) - v * Math.sin(ang), yKm: my + u * Math.sin(ang) + v * Math.cos(ang) };
  });
}
